/**
 * Gradle 内置工具链插件
 *
 * 支持基于 Gradle 构建的 Java/Kotlin 项目（Spring Boot / Android 等）。
 * 通过检测 build.gradle 或 build.gradle.kts 来识别项目类型。
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

/**
 * 获取 Gradle 构建文件路径（优先 Kotlin DSL）
 */
function findBuildFile(worktreePath: string): { filePath: string; isKts: boolean } | null {
  const kts = path.join(worktreePath, 'build.gradle.kts');
  const groovy = path.join(worktreePath, 'build.gradle');
  if (fsSync.existsSync(kts)) return { filePath: kts, isKts: true };
  if (fsSync.existsSync(groovy)) return { filePath: groovy, isKts: false };
  return null;
}

export const gradlePlugin: ToolchainPlugin = {
  name: 'gradle',
  displayName: 'Java/Kotlin (Gradle)',

  // ────────────────────────────────────────
  // 检测
  // ────────────────────────────────────────

  detect(worktreePath: string): boolean {
    return findBuildFile(worktreePath) !== null;
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
    return ['./gradlew', 'bootRun'];
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
      execSync('./gradlew build -x test', {
        cwd: worktreePath,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      throw new PluginCommandError('./gradlew build -x test failed', extractOutput(error));
    }
  },

  async lint(worktreePath: string): Promise<void> {
    const buildFile = findBuildFile(worktreePath);
    if (!buildFile) return;

    let content = '';
    try {
      content = await fs.readFile(buildFile.filePath, 'utf-8');
    } catch {
      return;
    }

    // 检查是否配置了 checkstyle 插件
    if (!content.includes('checkstyle')) {
      return; // 没有 checkstyle 配置，静默跳过
    }

    try {
      execSync('./gradlew checkstyleMain', {
        cwd: worktreePath,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      throw new PluginCommandError('./gradlew checkstyleMain failed', extractOutput(error));
    }
  },

  async build(worktreePath: string): Promise<void> {
    try {
      execSync('./gradlew build', {
        cwd: worktreePath,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      throw new PluginCommandError('./gradlew build failed', extractOutput(error));
    }
  },

  async bumpVersion(worktreePath: string, version: string): Promise<void> {
    const buildFile = findBuildFile(worktreePath);
    if (!buildFile) {
      throw new PluginCommandError(
        'Gradle build file not found',
        'Cannot find build.gradle or build.gradle.kts'
      );
    }

    const content = await fs.readFile(buildFile.filePath, 'utf-8');
    const quote = buildFile.isKts ? '"' : "'";

    // 匹配 version = '1.0.0' 或 version '1.0.0' (Groovy) 或 version = "1.0.0" (Kotlin)
    const patterns = [
      // version = "1.0.0" 或 version = '1.0.0'
      new RegExp(`(version\\s*=\\s*)${quote}[^${quote}]*${quote}`, 'g'),
      // version '1.0.0' (Groovy only)
      new RegExp(`(version\\s+)${quote}[^${quote}]*${quote}`, 'g'),
    ];

    let updated = content;
    let found = false;
    for (const pattern of patterns) {
      if (pattern.test(updated)) {
        updated = updated.replace(pattern, `$1${quote}${version}${quote}`);
        found = true;
        break;
      }
    }

    if (!found) {
      throw new PluginCommandError(
        'Cannot update version in Gradle build file',
        `No version pattern found in ${buildFile.filePath}`
      );
    }

    await fs.writeFile(buildFile.filePath, updated, 'utf-8');
  },
};
