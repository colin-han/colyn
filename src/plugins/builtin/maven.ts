/**
 * Maven 内置工具链插件
 *
 * 支持基于 Maven 构建的 Java 项目（Spring Boot / Android 等）。
 * 通过检测 pom.xml 来识别项目类型。
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { type ToolchainPlugin, type PortConfig, PluginCommandError } from '../../types/plugin.js';
import {
  extractOutput,
  readSpringRuntimeConfig,
  writeSpringRuntimeConfig,
} from '../utils.js';

export const mavenPlugin: ToolchainPlugin = {
  name: 'maven',
  displayName: 'Java (Maven)',

  // ────────────────────────────────────────
  // 检测
  // ────────────────────────────────────────

  detect(worktreePath: string): boolean {
    return fsSync.existsSync(path.join(worktreePath, 'pom.xml'));
  },

  // ────────────────────────────────────────
  // 端口配置
  // ────────────────────────────────────────

  portConfig(): PortConfig {
    return { key: 'server.port', defaultPort: 8080 };
  },

  // ────────────────────────────────────────
  // 运行时配置（application-local.properties）
  // ────────────────────────────────────────

  async readRuntimeConfig(worktreePath: string): Promise<Record<string, string> | null> {
    return readSpringRuntimeConfig(worktreePath);
  },

  async writeRuntimeConfig(worktreePath: string, config: Record<string, string>): Promise<void> {
    await writeSpringRuntimeConfig(worktreePath, config);
  },

  // ────────────────────────────────────────
  // Dev server 命令
  // ────────────────────────────────────────

  devServerCommand(_worktreePath: string): string[] {
    return ['mvn', 'spring-boot:run'];
  },

  // ────────────────────────────────────────
  // 项目初始化
  // ────────────────────────────────────────

  getRuntimeConfigFileName(): string {
    return 'application-local.properties';
  },

  // ────────────────────────────────────────
  // 生命周期操作
  // ────────────────────────────────────────

  async install(worktreePath: string): Promise<void> {
    try {
      execSync('mvn install -DskipTests', {
        cwd: worktreePath,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      throw new PluginCommandError('mvn install failed', extractOutput(error));
    }
  },

  async lint(worktreePath: string): Promise<void> {
    // 检查 pom.xml 是否包含 checkstyle 插件
    const pomPath = path.join(worktreePath, 'pom.xml');
    let pomContent = '';
    try {
      pomContent = await fs.readFile(pomPath, 'utf-8');
    } catch {
      return; // pom.xml 不存在，静默跳过
    }

    if (!pomContent.includes('maven-checkstyle-plugin')) {
      return; // 没有配置 checkstyle，静默跳过
    }

    try {
      execSync('mvn checkstyle:check', {
        cwd: worktreePath,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      throw new PluginCommandError('mvn checkstyle:check failed', extractOutput(error));
    }
  },

  async build(worktreePath: string): Promise<void> {
    try {
      execSync('mvn package -DskipTests', {
        cwd: worktreePath,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      throw new PluginCommandError('mvn package failed', extractOutput(error));
    }
  },

  async bumpVersion(worktreePath: string, version: string): Promise<void> {
    try {
      execSync(
        `mvn versions:set -DnewVersion=${version} -DgenerateBackupPoms=false`,
        { cwd: worktreePath, stdio: ['ignore', 'pipe', 'pipe'] }
      );
    } catch (error) {
      throw new PluginCommandError('mvn versions:set failed', extractOutput(error));
    }
  },

  async publish(worktreePath: string): Promise<void> {
    try {
      execSync('mvn deploy -DskipTests', {
        cwd: worktreePath,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      throw new PluginCommandError('mvn deploy failed', extractOutput(error));
    }
  },

  async checkPublishable(worktreePath: string): Promise<boolean> {
    const pomPath = path.join(worktreePath, 'pom.xml');
    try {
      const pomContent = await fs.readFile(pomPath, 'utf-8');
      return pomContent.includes('<distributionManagement>');
    } catch {
      return false;
    }
  },
};
