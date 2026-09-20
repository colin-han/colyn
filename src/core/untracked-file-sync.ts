/**
 * 未跟踪文件同步
 *
 * 在主分支目录与 worktree 目录之间，按 settings.syncFiles 清单同步
 * git 未跟踪的本地文件。规则（见 docs/zh-CN/develop/design/design-untracked-file-sync.md §3）：
 * - 目标侧缺失 → 从源侧复制（保留权限位）
 * - 两侧内容相同 → 不动
 * - 两侧内容不同（冲突）→ 不覆盖、不合并，报错提示由人工处理
 * - 源侧缺失 → 不动目标（永不传播删除）
 *
 * 与 runtime-config-sync 的关系：本模块操作普通文件（非 key-value），
 * 不经过工具链插件体系；运行时配置文件（.env.local 等）被排除，
 * 由 runtime-config-sync 以 key-value 语义处理。
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import simpleGit from 'simple-git';
import { pluginManager } from '../plugins/index.js';
import { loadUserConfig, loadProjectConfig } from './config-loader.js';
import { mergeConfigs } from './config-merger.js';
import { output, outputError, outputSuccess, outputWarning } from '../utils/logger.js';
import { t } from '../i18n/index.js';

/** 同步方向：main-to-worktree（update/add/repair）、worktree-to-main（merge） */
export type UntrackedFileSyncDirection = 'main-to-worktree' | 'worktree-to-main';

/** 冲突项：文件与两侧修改时间，供提示输出 */
export interface UntrackedFileConflict {
  path: string;
  sourceMtime: Date;
  targetMtime: Date;
}

/** 跳过项：文件与原因 */
export interface SkippedUntrackedFile {
  path: string;
  reason: 'tracked' | 'runtime-config' | 'source-missing';
}

/** 同步结果：供输出提示 */
export interface UntrackedFileSyncResult {
  /** 本次复制到目标侧的文件（相对源侧目录的路径，按清单顺序） */
  copied: string[];
  /** 两侧内容不同被跳过的文件 */
  conflicts: UntrackedFileConflict[];
  /** 因排除规则或源缺失被跳过的文件 */
  skipped: SkippedUntrackedFile[];
}

/**
 * 通配符模式 → 正则（纯函数）
 *
 * 语义与 branchOverrides 的通配符风格一致：`*` 匹配单段（不含 /），
 * `**` 作为独立段跨目录。仅用于匹配文件相对路径。
 */
export function filePatternToRegex(pattern: string): RegExp {
  const segments = pattern.split('/').map((segment) => {
    if (segment === '**') return '(?:[^/]+/)*[^/]*';
    return segment
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[^/]*');
  });
  return new RegExp(`^${segments.join('/')}$`);
}

/** 单文件的两侧状态（由 fs 层收集，供纯函数决策） */
export interface UntrackedFileStatus {
  path: string;
  sourceExists: boolean;
  targetExists: boolean;
  contentEqual: boolean;
}

/**
 * 纯函数：根据两侧文件状态决策同步动作（不触碰文件系统）
 *
 * 决策表（设计文档 §3.2）：
 * - 源缺失 → sourceMissing（不动目标）
 * - 目标缺失 → toCopy（复制）
 * - 两侧都有且内容相同 → 不产生任何动作
 * - 两侧都有且内容不同 → conflicts（报错，不写入）
 */
export function planUntrackedFileSync(
  files: UntrackedFileStatus[]
): { toCopy: string[]; conflicts: string[]; sourceMissing: string[] } {
  const toCopy: string[] = [];
  const conflicts: string[] = [];
  const sourceMissing: string[] = [];
  for (const file of files) {
    if (!file.sourceExists) {
      sourceMissing.push(file.path);
    } else if (!file.targetExists) {
      toCopy.push(file.path);
    } else if (!file.contentEqual) {
      conflicts.push(file.path);
    }
  }
  return { toCopy, conflicts, sourceMissing };
}

/** 枚举目录下全部文件（跳过 .git / node_modules），返回 POSIX 风格相对路径 */
async function collectFiles(dir: string): Promise<string[]> {
  const SKIP_DIRS = new Set(['.git', 'node_modules']);
  const results: string[] = [];

  async function walk(current: string, rel: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(path.join(current, entry.name), childRel);
      } else if (entry.isFile()) {
        results.push(childRel);
      }
    }
  }

  await walk(dir, '');
  return results;
}

/**
 * 解析同步清单：通配符展开 + 排除规则
 *
 * - 枚举 sourceDir（按 direction 的源侧目录，见设计澄清 1）
 * - 已跟踪文件（git ls-files，在 gitDir 执行，两目录属同一仓库）→ 跳过 + 警告
 * - 运行时配置文件（basename 命中任一插件声明）→ 跳过 + 警告
 * - 返回按路径排序的候选清单与被排除项
 */
export async function resolveSyncFileCandidates(
  sourceDir: string,
  patterns: string[],
  gitDir: string
): Promise<{ candidates: string[]; skipped: SkippedUntrackedFile[] }> {
  if (patterns.length === 0) return { candidates: [], skipped: [] };

  const regexes = patterns.map((p) => filePatternToRegex(p));
  const matched = new Set<string>();
  for (const rel of await collectFiles(sourceDir)) {
    if (regexes.some((re) => re.test(rel))) matched.add(rel);
  }
  if (matched.size === 0) return { candidates: [], skipped: [] };

  // tracked 检查：git ls-files 输出即已跟踪文件
  const lsOutput = await simpleGit(gitDir).raw(['ls-files', '--', ...matched]);
  const tracked = new Set(
    lsOutput.split('\n').map((line) => line.trim()).filter(Boolean)
  );

  const runtimeConfigNames = new Set(pluginManager.getAllRuntimeConfigFileNames());

  const candidates: string[] = [];
  const skipped: SkippedUntrackedFile[] = [];
  for (const rel of [...matched].sort()) {
    if (tracked.has(rel)) {
      skipped.push({ path: rel, reason: 'tracked' });
    } else if (runtimeConfigNames.has(path.posix.basename(rel))) {
      skipped.push({ path: rel, reason: 'runtime-config' });
    } else {
      candidates.push(rel);
    }
  }
  return { candidates, skipped };
}

/** 从合并后的 settings 读取 syncFiles 清单 */
async function loadSyncFilesPatterns(rootDir: string): Promise<string[]> {
  const [userCfg, projectCfg] = await Promise.all([
    loadUserConfig(),
    loadProjectConfig(rootDir),
  ]);
  if (!userCfg && !projectCfg) return [];
  return mergeConfigs(userCfg, projectCfg).syncFiles ?? [];
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function fileContentsEqual(a: string, b: string): Promise<boolean> {
  const [bufA, bufB] = await Promise.all([fs.readFile(a), fs.readFile(b)]);
  return bufA.equals(bufB);
}

function formatTime(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 16);
}

/**
 * 同步编排：加载清单 → 解析候选 → 读两侧状态 → 决策 → 复制 → 输出
 *
 * - 永不抛出：异常输出警告后返回（git 操作已完成，不可阻断）
 * - 清单为空或解析后无候选 → 零行为（不输出）
 * - 无实际操作时静默，verbose=true 才输出 noChange
 */
export async function syncUntrackedFiles(params: {
  rootDir: string;
  mainDir: string;
  worktreePath: string;
  direction: UntrackedFileSyncDirection;
  verbose?: boolean;
}): Promise<void> {
  const { rootDir, mainDir, worktreePath, direction, verbose = false } = params;

  let patterns: string[];
  try {
    patterns = await loadSyncFilesPatterns(rootDir);
  } catch (error) {
    outputWarning(t('untrackedFileSync.error', { error: errorMessage(error) }));
    return;
  }
  if (patterns.length === 0) return;

  try {
    // 源侧按方向确定（设计澄清 1）；tracked 检查在 mainDir（同一 git 仓库）
    const sourceDir = direction === 'main-to-worktree' ? mainDir : worktreePath;
    const targetDir = direction === 'main-to-worktree' ? worktreePath : mainDir;

    const { candidates, skipped } = await resolveSyncFileCandidates(sourceDir, patterns, mainDir);

    const statuses: UntrackedFileStatus[] = [];
    for (const rel of candidates) {
      const sourcePath = path.join(sourceDir, rel);
      const targetPath = path.join(targetDir, rel);
      const sourceExists = await fileExists(sourcePath);
      const targetExists = await fileExists(targetPath);
      const contentEqual =
        sourceExists && targetExists
          ? await fileContentsEqual(sourcePath, targetPath)
          : false;
      statuses.push({ path: rel, sourceExists, targetExists, contentEqual });
    }

    const plan = planUntrackedFileSync(statuses);

    // 复制（fs.copyFile 保留权限位）；目标父目录不存在时递归创建
    for (const rel of plan.toCopy) {
      const targetPath = path.join(targetDir, rel);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(path.join(sourceDir, rel), targetPath);
    }

    // 冲突：收集两侧修改时间（不写入任何内容）
    const conflicts: UntrackedFileConflict[] = [];
    for (const rel of plan.conflicts) {
      const [sourceStat, targetStat] = await Promise.all([
        fs.stat(path.join(sourceDir, rel)),
        fs.stat(path.join(targetDir, rel)),
      ]);
      conflicts.push({ path: rel, sourceMtime: sourceStat.mtime, targetMtime: targetStat.mtime });
    }

    // 源缺失也归入 skipped（verbose 场景提示）
    const allSkipped: SkippedUntrackedFile[] = [
      ...skipped,
      ...plan.sourceMissing.map((p) => ({ path: p, reason: 'source-missing' as const })),
    ];

    reportUntrackedFileSync(
      { copied: plan.toCopy, conflicts, skipped: allSkipped },
      direction,
      worktreePath,
      verbose
    );
  } catch (error) {
    outputWarning(t('untrackedFileSync.error', { error: errorMessage(error) }));
  }
}

function reportUntrackedFileSync(
  result: UntrackedFileSyncResult,
  direction: UntrackedFileSyncDirection,
  worktreePath: string,
  verbose: boolean
): void {
  const mainLabel = t('untrackedFileSync.mainLabel');
  const wtLabel = path.basename(worktreePath);
  const sourceLabel = direction === 'main-to-worktree' ? mainLabel : wtLabel;
  const targetLabel = direction === 'main-to-worktree' ? wtLabel : mainLabel;

  let reported = false;
  if (result.copied.length > 0) {
    outputSuccess(t(
      direction === 'main-to-worktree'
        ? 'untrackedFileSync.copied'
        : 'untrackedFileSync.broughtBack',
      { count: result.copied.length, files: result.copied.join(', ') }
    ));
    reported = true;
  }
  if (result.conflicts.length > 0) {
    outputError(t('untrackedFileSync.conflict', { count: result.conflicts.length }));
    for (const conflict of result.conflicts) {
      output('  ' + t('untrackedFileSync.conflictDetail', {
        file: conflict.path,
        sourceLabel,
        sourceMtime: formatTime(conflict.sourceMtime),
        targetLabel,
        targetMtime: formatTime(conflict.targetMtime),
      }));
    }
    reported = true;
  }
  if (result.skipped.length > 0) {
    for (const item of result.skipped) {
      const reasonKey = item.reason === 'tracked'
        ? 'untrackedFileSync.skippedReasonTracked'
        : item.reason === 'runtime-config'
          ? 'untrackedFileSync.skippedReasonRuntimeConfig'
          : 'untrackedFileSync.skippedReasonSourceMissing';
      outputWarning(t('untrackedFileSync.skipped', { file: item.path, reason: t(reasonKey) }));
    }
    reported = true;
  }
  if (!reported && verbose) {
    output(t('untrackedFileSync.noChange'));
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
