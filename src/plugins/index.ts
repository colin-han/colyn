/**
 * 插件系统入口
 *
 * 创建全局 PluginManager 单例并注册所有内置插件。
 */

import { PluginManager } from './manager.js';
import { npmPlugin } from './builtin/npm.js';

/**
 * 全局 PluginManager 单例
 */
export const pluginManager = new PluginManager();

// 注册内置插件
pluginManager.register(npmPlugin);

export { PluginManager } from './manager.js';
export { PluginCommandError, type ToolchainPlugin, type PortConfig } from '../types/plugin.js';
