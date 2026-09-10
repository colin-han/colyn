import * as fs from 'fs/promises';
import * as path from 'path';
import { pluginManager } from '../plugins/index.js';
import { resolveToolchains, type ToolchainContext } from './toolchain-resolver.js';
import { readEnvFile, updateEnvFilePreserveComments, writeEnvFile } from './env.js';
import { output, outputSuccess, outputWarning } from '../utils/logger.js';
import { t } from '../i18n/index.js';

/**
 * 运行时配置同步方向
 * - main-to-worktree：主分支 → worktree（update 时）
 * - worktree-to-main：worktree → 主分支（merge 合并成功后）
 */
export type SyncDirection = 'main-to-worktree' | 'worktree-to-main';

/** 值冲突项：key 与两侧值，供提示输出 */
export interface ConfigConflict {
  key: string;
  mainValue: string;
  worktreeValue: string;
}

/** 同步 diff 结果 */
export interface RuntimeConfigDiff {
  /** 需要新增到目标侧的 key-value */
  toAdd: Record<string, string>;
  /** 值不同被跳过的 key */
  conflicts: ConfigConflict[];
}

/**
 * 纯函数：计算两个配置 map 的同步 diff（不触碰文件系统）
 *
 * 规则（见 docs/zh-CN/develop/design/design-runtime-config-sync.md §3）：
 * - 同步只"补充缺失的 key"，永不覆盖既有值、永不删除 key
 * - 同名 key 两侧值不同 → 记入 conflicts，不进入 toAdd
 * - 身份键（如 PORT / WORKTREE）在两个方向上都被排除
 */
export function diffRuntimeConfig(
  mainConfig: Record<string, string>,
  worktreeConfig: Record<string, string>,
  direction: SyncDirection,
  identityKeys: string[]
): RuntimeConfigDiff {
  const identity = new Set(identityKeys);
  const source = direction === 'main-to-worktree' ? mainConfig : worktreeConfig;
  const target = direction === 'main-to-worktree' ? worktreeConfig : mainConfig;

  const toAdd: Record<string, string> = {};
  const conflicts: ConfigConflict[] = [];

  for (const [key, value] of Object.entries(source)) {
    if (identity.has(key)) continue;
    if (!(key in target)) {
      toAdd[key] = value;
    } else if (target[key] !== value) {
      conflicts.push({ key, mainValue: mainConfig[key], worktreeValue: worktreeConfig[key] });
    }
  }

  return { toAdd, conflicts };
}

/** 同步结果：供命令层输出提示 */
export interface SyncResult {
  /** 本次新增到目标侧的 key（按插入顺序） */
  addedKeys: string[];
  /** 值不同被跳过的 key */
  conflicts: ConfigConflict[];
  /** worktree 侧文件原本不存在，本次为重建 */
  rebuilt: boolean;
}

/** syncRuntimeConfig 参数 */
export interface SyncRuntimeConfigParams {
  /** 主分支侧目录（Mono Repo 时为 mainDir + subPath） */
  mainDir: string;
  /** worktree 侧目录（Mono Repo 时为 worktreePath + subPath） */
  worktreePath: string;
  direction: SyncDirection;
  /** 重建场景重算身份键用 */
  worktreeId: number;
  /** 身份键，如 ['PORT', 'WORKTREE'] */
  identityKeys: string[];
  /** 端口 key（重建场景重算用），默认 'PORT' */
  portKey?: string;
  /** 工具链上下文；缺省走 .env.local 回退 */
  ctx?: ToolchainContext;
}

/**
 * 单上下文同步编排：读 → diff → 写
 *
 * 返回 null 表示主分支侧配置文件缺失，调用方提示后跳过。
 * 永不抛出以外的静默语义：读写异常向上抛出，由 syncWorktreeRuntimeConfigs 统一捕获。
 */
export async function syncRuntimeConfig(
  params: SyncRuntimeConfigParams
): Promise<SyncResult | null> {
  const { mainDir, worktreePath, direction, worktreeId, identityKeys, ctx } = params;

  if (ctx) {
    // ── 插件路径：readRuntimeConfig / writeRuntimeConfig 由工具链插件决定文件 ──
    const mainConfig = await pluginManager.readRuntimeConfig(mainDir, [ctx.toolchainName]);
    if (mainConfig === null) return null;

    const worktreeConfig = await pluginManager.readRuntimeConfig(worktreePath, [ctx.toolchainName]);

    if (worktreeConfig === null) {
      // worktree 侧文件缺失
      if (direction === 'worktree-to-main') {
        return { addedKeys: [], conflicts: [], rebuilt: false };
      }
      // 重建：复制主分支全部 key + 重算身份键（与 add / repair 行为一致）
      const portKey = params.portKey ?? 'PORT';
      const basePort = parseInt(mainConfig[portKey] || '0') || 0;
      const rebuiltConfig: Record<string, string> = {
        ...mainConfig,
        [portKey]: (basePort + worktreeId).toString(),
        WORKTREE: worktreeId.toString(),
      };
      await pluginManager.writeRuntimeConfig(worktreePath, rebuiltConfig, [ctx.toolchainName]);
      return { addedKeys: [], conflicts: [], rebuilt: true };
    }

    const { toAdd, conflicts } = diffRuntimeConfig(mainConfig, worktreeConfig, direction, identityKeys);
    if (Object.keys(toAdd).length > 0) {
      if (direction === 'main-to-worktree') {
        await pluginManager.writeRuntimeConfig(worktreePath, { ...worktreeConfig, ...toAdd }, [ctx.toolchainName]);
      } else {
        await pluginManager.writeRuntimeConfig(mainDir, { ...mainConfig, ...toAdd }, [ctx.toolchainName]);
      }
    }
    return { addedKeys: Object.keys(toAdd), conflicts, rebuilt: false };
  }

  // ── 回退路径：无工具链，直接操作 .env.local ──
  const mainEnvPath = path.join(mainDir, '.env.local');
  const worktreeEnvPath = path.join(worktreePath, '.env.local');

  try {
    await fs.access(mainEnvPath);
  } catch {
    return null; // 主分支配置缺失
  }

  const mainConfig = await readEnvFile(mainEnvPath);

  let worktreeExists = true;
  try {
    await fs.access(worktreeEnvPath);
  } catch {
    worktreeExists = false;
  }

  if (!worktreeExists) {
    if (direction === 'worktree-to-main') {
      return { addedKeys: [], conflicts: [], rebuilt: false };
    }
    const basePort = parseInt(mainConfig.PORT || '0') || 0;
    await writeEnvFile(worktreeEnvPath, {
      ...mainConfig,
      PORT: (basePort + worktreeId).toString(),
      WORKTREE: worktreeId.toString(),
    });
    return { addedKeys: [], conflicts: [], rebuilt: true };
  }

  const worktreeConfig = await readEnvFile(worktreeEnvPath);
  const { toAdd, conflicts } = diffRuntimeConfig(mainConfig, worktreeConfig, direction, identityKeys);
  if (Object.keys(toAdd).length > 0) {
    const targetPath = direction === 'main-to-worktree' ? worktreeEnvPath : mainEnvPath;
    await updateEnvFilePreserveComments(targetPath, toAdd);
  }
  return { addedKeys: Object.keys(toAdd), conflicts, rebuilt: false };
}

/**
 * 多上下文同步入口：resolveToolchains → 逐 context 同步 → 输出提示
 *
 * - contexts 非空：每个 ToolchainContext 独立同步（Mono Repo 子项目）
 * - contexts 为空：回退直接操作 .env.local
 * - 永不抛出；单 context 异常输出警告后继续
 * - 无变化时静默，verbose=true 时输出 noChange
 */
export async function syncWorktreeRuntimeConfigs(
  rootDir: string,
  mainDir: string,
  worktreePath: string,
  worktreeId: number,
  direction: SyncDirection,
  verbose = false
): Promise<void> {
  let contexts: ToolchainContext[];
  try {
    contexts = await resolveToolchains(rootDir, mainDir);
  } catch (error) {
    outputWarning(t('runtimeConfigSync.error', { error: errorMessage(error) }));
    return;
  }

  if (contexts.length === 0) {
    await runAndReport(
      () => syncRuntimeConfig({
        mainDir, worktreePath, direction, worktreeId,
        identityKeys: ['PORT', 'WORKTREE'],
      }),
      direction, verbose
    );
    return;
  }

  for (const ctx of contexts) {
    const worktreeSubPath = ctx.subPath === '.'
      ? worktreePath
      : path.join(worktreePath, ctx.subPath);

    // 子目录在 worktree 中不存在时跳过（与 add 命令约定一致）；
    // subPath 为 '.' 时即 worktree 根目录，必然存在，无需检查
    if (ctx.subPath !== '.') {
      try {
        await fs.access(worktreeSubPath);
      } catch {
        continue;
      }
    }

    const portKey = pluginManager.getPortConfig([ctx.toolchainName])?.key ?? 'PORT';
    await runAndReport(
      () => syncRuntimeConfig({
        mainDir: ctx.absolutePath,
        worktreePath: worktreeSubPath,
        direction, worktreeId,
        identityKeys: [portKey, 'WORKTREE'],
        portKey,
        ctx,
      }),
      direction, verbose
    );
  }
}

async function runAndReport(
  run: () => Promise<SyncResult | null>,
  direction: SyncDirection,
  verbose: boolean
): Promise<void> {
  let result: SyncResult | null;
  try {
    result = await run();
  } catch (error) {
    outputWarning(t('runtimeConfigSync.error', { error: errorMessage(error) }));
    return;
  }

  if (result === null) {
    outputWarning(t('runtimeConfigSync.mainMissing'));
    return;
  }

  let reported = false;
  if (result.rebuilt) {
    outputSuccess(t('runtimeConfigSync.rebuilt'));
    reported = true;
  }
  if (result.addedKeys.length > 0) {
    const keys = result.addedKeys.join(', ');
    outputSuccess(t(
      direction === 'main-to-worktree' ? 'runtimeConfigSync.added' : 'runtimeConfigSync.broughtBack',
      { count: result.addedKeys.length, keys }
    ));
    reported = true;
  }
  if (result.conflicts.length > 0) {
    const keys = result.conflicts.map(c => c.key).join(', ');
    outputWarning(t('runtimeConfigSync.conflict', { count: result.conflicts.length, keys }));
    reported = true;
  }
  if (!reported && verbose) {
    output(t('runtimeConfigSync.noChange'));
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
