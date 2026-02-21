/**
 * PluginManager — 工具链插件管理器
 *
 * 负责：
 * - 维护已注册插件列表
 * - 根据激活插件名称列表分发各扩展点调用
 * - 统一处理 PluginCommandError（verbose 模式下展示命令输出）
 */

import { type ToolchainPlugin, type PortConfig, PluginCommandError } from '../types/plugin.js';
import { outputError } from '../utils/logger.js';

export class PluginManager {
  private readonly plugins: Map<string, ToolchainPlugin> = new Map();

  /**
   * 注册插件
   */
  register(plugin: ToolchainPlugin): void {
    this.plugins.set(plugin.name, plugin);
  }

  /**
   * 获取激活的插件列表
   * @param activePluginNames 激活插件名称数组（来自 settings.plugins）
   */
  private getActivePlugins(activePluginNames: string[]): ToolchainPlugin[] {
    return activePluginNames
      .map((name) => this.plugins.get(name))
      .filter((p): p is ToolchainPlugin => p !== undefined);
  }

  /**
   * 自动检测并返回匹配的插件名称列表
   * @param worktreePath 检测目录
   */
  async detectPlugins(worktreePath: string): Promise<string[]> {
    const matched: string[] = [];
    for (const plugin of this.plugins.values()) {
      if (await plugin.detect(worktreePath)) {
        matched.push(plugin.name);
      }
    }
    return matched;
  }

  // ════════════════════════════════════════════
  // 环境配置扩展点
  // ════════════════════════════════════════════

  /**
   * 返回第一个非 null 的端口配置
   */
  getPortConfig(activePluginNames: string[]): PortConfig | null {
    for (const plugin of this.getActivePlugins(activePluginNames)) {
      const config = plugin.portConfig?.();
      if (config !== undefined && config !== null) {
        return config;
      }
    }
    return null;
  }

  /**
   * 读取运行时配置 — 返回第一个非 null 的结果
   */
  async readRuntimeConfig(
    worktreePath: string,
    activePluginNames: string[]
  ): Promise<Record<string, string> | null> {
    for (const plugin of this.getActivePlugins(activePluginNames)) {
      if (!plugin.readRuntimeConfig) continue;
      const config = await plugin.readRuntimeConfig(worktreePath);
      if (config !== null) return config;
    }
    return null;
  }

  /**
   * 写入运行时配置 — 调用所有激活插件的 writeRuntimeConfig
   */
  async writeRuntimeConfig(
    worktreePath: string,
    config: Record<string, string>,
    activePluginNames: string[]
  ): Promise<void> {
    for (const plugin of this.getActivePlugins(activePluginNames)) {
      if (plugin.writeRuntimeConfig) {
        await plugin.writeRuntimeConfig(worktreePath, config);
      }
    }
  }

  /**
   * 获取 dev server 命令 — 返回第一个非 null 的结果
   */
  async getDevServerCommand(
    worktreePath: string,
    activePluginNames: string[]
  ): Promise<string[] | null> {
    for (const plugin of this.getActivePlugins(activePluginNames)) {
      if (!plugin.devServerCommand) continue;
      const cmd = await plugin.devServerCommand(worktreePath);
      if (cmd !== null) return cmd;
    }
    return null;
  }

  // ════════════════════════════════════════════
  // 生命周期操作
  // ════════════════════════════════════════════

  /**
   * 运行所有激活插件的 init
   */
  async runInit(
    worktreePath: string,
    activePluginNames: string[],
    verbose?: boolean
  ): Promise<void> {
    for (const plugin of this.getActivePlugins(activePluginNames)) {
      if (!plugin.init) continue;
      try {
        await plugin.init(worktreePath);
      } catch (error) {
        if (error instanceof PluginCommandError) {
          if (verbose) {
            outputError(error.output);
          }
          throw error;
        }
        throw error;
      }
    }
  }

  /**
   * 运行所有激活插件的 install
   */
  async runInstall(
    worktreePath: string,
    activePluginNames: string[],
    verbose?: boolean
  ): Promise<void> {
    for (const plugin of this.getActivePlugins(activePluginNames)) {
      if (!plugin.install) continue;
      try {
        await plugin.install(worktreePath);
      } catch (error) {
        if (error instanceof PluginCommandError) {
          if (verbose) {
            outputError(error.output);
          }
          throw error;
        }
        throw error;
      }
    }
  }

  /**
   * 运行所有激活插件的 lint
   */
  async runLint(
    worktreePath: string,
    activePluginNames: string[],
    verbose?: boolean
  ): Promise<void> {
    for (const plugin of this.getActivePlugins(activePluginNames)) {
      if (!plugin.lint) continue;
      try {
        await plugin.lint(worktreePath);
      } catch (error) {
        if (error instanceof PluginCommandError) {
          if (verbose) {
            outputError(error.output);
          }
          throw error;
        }
        throw error;
      }
    }
  }

  /**
   * 运行所有激活插件的 build
   */
  async runBuild(
    worktreePath: string,
    activePluginNames: string[],
    verbose?: boolean
  ): Promise<void> {
    for (const plugin of this.getActivePlugins(activePluginNames)) {
      if (!plugin.build) continue;
      try {
        await plugin.build(worktreePath);
      } catch (error) {
        if (error instanceof PluginCommandError) {
          if (verbose) {
            outputError(error.output);
          }
          throw error;
        }
        throw error;
      }
    }
  }

  /**
   * 运行所有激活插件的 bumpVersion
   * 若已激活插件未实现此方法，则报错终止
   */
  async runBumpVersion(
    worktreePath: string,
    version: string,
    activePluginNames: string[]
  ): Promise<void> {
    const activePlugins = this.getActivePlugins(activePluginNames);
    for (const plugin of activePlugins) {
      if (!plugin.bumpVersion) {
        throw new Error(
          `Plugin "${plugin.name}" does not implement bumpVersion. Cannot proceed with release.`
        );
      }
      await plugin.bumpVersion(worktreePath, version);
    }
  }
}
