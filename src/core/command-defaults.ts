/**
 * 命令默认值三态解析
 *
 * 优先级：CLI 显式 > 合并后的 settings 节点 > 调用方传入的内置默认
 *
 * 使用 commander 的 `getOptionValueSource(key) === 'cli'` 区分用户显式与默认。
 */
import type { Command } from 'commander';
import {
  loadUserConfig,
  loadProjectConfig,
} from './config-loader.js';
import { mergeConfigs, applyBranchOverrides } from './config-merger.js';
import { getProjectPaths } from './paths.js';
import { getCurrentBranch } from './git.js';
import type { Settings } from './config-schema.js';

async function loadMergedSettings(): Promise<Settings | null> {
  const paths = await getProjectPaths().catch(() => null);
  const [userCfg, projectCfg] = await Promise.all([
    loadUserConfig(),
    paths ? loadProjectConfig(paths.mainDir) : Promise.resolve(null),
  ]);
  if (!userCfg && !projectCfg) return null;

  const merged = mergeConfigs(userCfg, projectCfg);

  try {
    const branch = await getCurrentBranch();
    return applyBranchOverrides(merged, branch);
  } catch {
    return merged;
  }
}

/**
 * 三态合并 CLI 选项与配置默认值。
 *
 * @param command commander Command 实例（action 第二/第三参数）
 * @param cliOpts cmd.opts() 的返回值
 * @param configPath settings 中的节点路径，如 ['commands', 'merge']
 * @param defaults 调用方提供的内置默认值（仅作用于这些 key）
 */
export async function applyCommandDefaults<T extends Record<string, unknown>>(
  command: Command,
  cliOpts: T,
  configPath: readonly string[],
  defaults: Partial<T>
): Promise<T> {
  const settings = await loadMergedSettings();
  const configNode = configPath.reduce<unknown>(
    (acc, key) => (acc as Record<string, unknown> | undefined)?.[key],
    settings ?? undefined
  ) as Partial<T> | undefined;

  const result = { ...cliOpts };
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    const source = command.getOptionValueSource(key as string);
    if (source === 'cli') continue;
    if (configNode?.[key] !== undefined) {
      result[key] = configNode[key] as T[keyof T];
    } else if (result[key] === undefined) {
      result[key] = defaults[key] as T[keyof T];
    }
  }
  return result;
}

/**
 * 解析全局共享的 verbose（顶层 settings.verbose）。
 */
export async function resolveVerbose(
  command: Command,
  cliVerbose: boolean | undefined
): Promise<boolean> {
  if (command.getOptionValueSource('verbose') === 'cli') {
    return cliVerbose ?? false;
  }
  const settings = await loadMergedSettings();
  return settings?.verbose ?? false;
}
