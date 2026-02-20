/**
 * 配置合并模块
 *
 * 使用 deepmerge 实现多层配置的合并
 * - 支持深度合并对象
 * - 数组采用替换策略（而非合并）
 * - 保持字段级覆盖（Field-level Override）
 */

import deepmerge from 'deepmerge';
import type { Settings, TmuxConfig } from './config-schema.js';

/**
 * 合并配置选项
 */
const MERGE_OPTIONS: deepmerge.Options = {
  // 数组替换而非合并
  // 例如：branchOverrides 中的数组应该完全替换，而不是合并
  arrayMerge: (_target, source) => source,

  // 自定义合并函数（可选）
  customMerge: (_key) => {
    // 对于特定字段可以自定义合并逻辑
    // 目前使用默认行为
    return undefined;
  },
};

/**
 * 合并多个配置对象
 * @param configs 配置对象数组（null 会被过滤掉）
 * @returns 合并后的配置对象
 */
export function mergeConfigs(...configs: Array<Settings | null>): Settings {
  const validConfigs = configs.filter((c): c is Settings => c !== null);

  if (validConfigs.length === 0) {
    throw new Error('至少需要一个有效的配置对象');
  }

  if (validConfigs.length === 1) {
    return validConfigs[0];
  }

  return deepmerge.all(validConfigs, MERGE_OPTIONS) as Settings;
}

/**
 * 合并 Tmux 配置
 * @param configs Tmux 配置对象数组（null 会被过滤掉）
 * @returns 合并后的 Tmux 配置对象
 */
export function mergeTmuxConfigs(
  ...configs: Array<TmuxConfig | null | undefined>
): TmuxConfig {
  const validConfigs = configs.filter(
    (c): c is TmuxConfig => c !== null && c !== undefined
  );

  if (validConfigs.length === 0) {
    return {};
  }

  if (validConfigs.length === 1) {
    return validConfigs[0];
  }

  return deepmerge.all(validConfigs, MERGE_OPTIONS) as TmuxConfig;
}

/**
 * 应用分支特定的配置覆盖
 * @param settings 基础配置
 * @param branchName 分支名称
 * @returns 应用分支覆盖后的配置
 */
export function applyBranchOverrides(
  settings: Settings,
  branchName: string
): Settings {
  if (!settings.branchOverrides) {
    return settings;
  }

  // 查找匹配的分支覆盖配置
  let matchedOverride: Partial<Settings> | null = null;

  // 1. 精确匹配（优先级最高）
  if (settings.branchOverrides[branchName]) {
    matchedOverride = settings.branchOverrides[branchName];
  } else {
    // 2. 通配符匹配
    for (const [pattern, override] of Object.entries(settings.branchOverrides)) {
      if (pattern.includes('*')) {
        // 将通配符模式转换为正则表达式
        const regexPattern = pattern
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // 转义特殊字符
          .replace(/\*/g, '.*'); // 将 * 替换为 .*

        const regex = new RegExp(`^${regexPattern}$`);
        if (regex.test(branchName)) {
          matchedOverride = override;
          break; // 使用第一个匹配的通配符模式
        }
      }
    }
  }

  // 如果没有匹配的覆盖配置，返回原配置
  if (!matchedOverride) {
    return settings;
  }

  // 合并基础配置和分支覆盖配置
  // 注意：不包含 branchOverrides 本身，避免无限递归
  const { branchOverrides, ...baseSettings } = settings;
  const mergedSettings = deepmerge(baseSettings, matchedOverride, MERGE_OPTIONS);

  // 保留原始的 branchOverrides
  return {
    ...mergedSettings,
    branchOverrides,
  } as Settings;
}
