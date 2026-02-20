/**
 * 新配置系统统一入口（过渡期）
 *
 * 这是新配置系统的入口文件，在完全迁移之前，使用 config-new.ts 作为文件名
 * 完全迁移后将替换 config.ts
 *
 * 提供完整的配置管理功能：
 * - 配置加载（支持 JSON5 和 YAML）
 * - 配置合并（多层级、分支覆盖）
 * - 配置验证（Zod Schema）
 * - 自动迁移（版本管理）
 */

// 导出 Schema 和类型
export {
  // 类型
  type Settings,
  type TmuxConfig,
  type PaneConfig,
  type PaneCommand,
  type LayoutType,
  type SystemCommands,
  // 常量
  BUILTIN_COMMANDS,
  CURRENT_CONFIG_VERSION,
  LayoutTypeSchema,
  // 验证函数
  validateSettings,
  validateSettingsWithFriendlyError,
} from './config-schema.js';

// 导出配置加载函数
export {
  loadUserConfig,
  loadProjectConfig,
  saveConfigFile,
  findConfigFilePath,
  getUserConfigDir,
  getProjectConfigDir,
} from './config-loader.js';

// 导出配置合并函数
export {
  mergeConfigs,
  mergeTmuxConfigs,
  applyBranchOverrides,
} from './config-merger.js';

// 导出迁移函数
export { loadAndMigrateConfig, ConfigSchema } from './config-migration.js';

/**
 * 加载完整的生效配置
 * @param projectRoot 项目根目录
 * @param branchName 分支名称
 * @returns 合并并应用分支覆盖后的配置
 */
import { loadUserConfig, loadProjectConfig } from './config-loader.js';
import { mergeConfigs, applyBranchOverrides } from './config-merger.js';
import type { Settings } from './config-schema.js';

export async function loadEffectiveConfig(
  projectRoot: string,
  branchName?: string
): Promise<Settings> {
  // 加载用户级和项目级配置
  const [userConfig, projectConfig] = await Promise.all([
    loadUserConfig(),
    loadProjectConfig(projectRoot),
  ]);

  // 合并配置（优先级：项目 > 用户）
  const configs: Array<Settings | null> = [];

  if (userConfig) configs.push(userConfig);
  if (projectConfig) configs.push(projectConfig);

  // 如果没有任何配置，返回最小配置
  if (configs.length === 0) {
    return {
      version: 2,
    };
  }

  let mergedConfig = mergeConfigs(...configs);

  // 应用分支覆盖（如果提供了分支名）
  if (branchName) {
    mergedConfig = applyBranchOverrides(mergedConfig, branchName);
  }

  return mergedConfig;
}
