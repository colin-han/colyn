/**
 * 插件系统入口
 *
 * 创建全局 PluginManager 单例并注册所有内置插件。
 */

import * as path from 'path';
import { PluginManager } from './manager.js';
import { npmPlugin } from './builtin/npm.js';
import { mavenPlugin } from './builtin/maven.js';
import { gradlePlugin } from './builtin/gradle.js';
import { pipPlugin } from './builtin/pip.js';
import { xcodePlugin } from './builtin/xcode.js';
import {
  loadProjectConfig,
  saveConfigFile,
  findConfigFilePath,
} from '../core/config-loader.js';
import { outputInfo } from '../utils/logger.js';
import { t } from '../i18n/index.js';

/**
 * 全局 PluginManager 单例
 */
export const pluginManager = new PluginManager();

// 注册内置插件（注册顺序决定"first non-null wins"的优先级）
pluginManager.register(npmPlugin);
pluginManager.register(mavenPlugin);
pluginManager.register(gradlePlugin);
pluginManager.register(pipPlugin);
pluginManager.register(xcodePlugin);

/**
 * 确保插件配置存在（旧项目自动迁移）
 *
 * 当 settings.json 中没有 plugins 字段时（旧项目），自动检测工具链并写入配置。
 * 非阻塞：任何错误均静默忽略，不影响命令正常执行。
 *
 * @param projectRoot 项目根目录（.colyn 的父目录）
 * @param configDir .colyn 配置目录路径
 * @param mainDir 主分支目录路径（用于检测工具链）
 */
export async function ensurePluginsConfigured(
  projectRoot: string,
  configDir: string,
  mainDir: string
): Promise<void> {
  try {
    const settings = await loadProjectConfig(projectRoot);
    if (!settings) return; // 项目未初始化，跳过
    if (settings.plugins !== undefined) return; // 已配置，跳过

    // 自动检测工具链
    const detectedPlugins = await pluginManager.detectPlugins(mainDir);

    // 写入 settings.json
    settings.plugins = detectedPlugins;
    const settingsFilePath =
      (await findConfigFilePath(configDir)) ?? path.join(configDir, 'settings.json');
    await saveConfigFile(settingsFilePath, settings);

    // 显示非阻塞提示
    if (detectedPlugins.length > 0) {
      outputInfo(t('plugins.autoMigrated', { plugins: detectedPlugins.join(', ') }));
    } else {
      outputInfo(t('plugins.autoMigratedNone'));
    }
    outputInfo(t('plugins.autoMigratedHint'));
  } catch {
    // 自动迁移失败不影响命令执行，静默忽略
  }
}

export { PluginManager } from './manager.js';
export { PluginCommandError, type ToolchainPlugin, type PortConfig } from '../types/plugin.js';
