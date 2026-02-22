/**
 * 插件系统入口
 *
 * 创建全局 PluginManager 单例并注册所有内置插件。
 */

import { PluginManager } from './manager.js';
import { npmPlugin } from './builtin/npm.js';
import { mavenPlugin } from './builtin/maven.js';
import { gradlePlugin } from './builtin/gradle.js';
import { pipPlugin } from './builtin/pip.js';
import { xcodePlugin } from './builtin/xcode.js';

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

export { PluginManager } from './manager.js';
export { PluginCommandError, type ToolchainPlugin, type PortConfig } from '../types/plugin.js';
