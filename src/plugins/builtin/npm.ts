/**
 * npm 内置工具链插件
 *
 * 支持基于 npm/yarn/pnpm 的 Node.js 项目。
 * 通过检测 package.json 来识别项目类型。
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { execSync, type SpawnSyncReturns } from 'child_process';
import dotenv from 'dotenv';
import { type ToolchainPlugin, type PortConfig, PluginCommandError } from '../../types/plugin.js';
import { getNpmCommand, getRunCommand } from '../../core/config.js';

/**
 * 读取 package.json 并解析
 */
async function readPackageJson(worktreePath: string): Promise<Record<string, unknown> | null> {
  const packageJsonPath = path.join(worktreePath, 'package.json');
  try {
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 将 execSync 错误中的 stdout/stderr 合并为字符串
 */
function extractOutput(error: unknown): string {
  if (error && typeof error === 'object') {
    const err = error as SpawnSyncReturns<Buffer> & { stdout?: Buffer | string; stderr?: Buffer | string };
    const stdout = err.stdout ? err.stdout.toString() : '';
    const stderr = err.stderr ? err.stderr.toString() : '';
    return [stdout, stderr].filter(Boolean).join('\n');
  }
  return String(error);
}

export const npmPlugin: ToolchainPlugin = {
  name: 'npm',
  displayName: 'Node.js (npm/yarn/pnpm)',

  // ────────────────────────────────────────
  // 检测
  // ────────────────────────────────────────

  detect(worktreePath: string): boolean {
    const packageJsonPath = path.join(worktreePath, 'package.json');
    return fsSync.existsSync(packageJsonPath);
  },

  // ────────────────────────────────────────
  // 端口配置
  // ────────────────────────────────────────

  portConfig(): PortConfig {
    return {
      key: 'PORT',
      defaultPort: 3000,
    };
  },

  // ────────────────────────────────────────
  // 运行时配置（.env.local）
  // ────────────────────────────────────────

  async readRuntimeConfig(worktreePath: string): Promise<Record<string, string> | null> {
    const envLocalPath = path.join(worktreePath, '.env.local');
    try {
      const content = await fs.readFile(envLocalPath, 'utf-8');
      return dotenv.parse(content);
    } catch {
      return null;
    }
  },

  async writeRuntimeConfig(worktreePath: string, config: Record<string, string>): Promise<void> {
    const envLocalPath = path.join(worktreePath, '.env.local');

    let existingContent = '';
    try {
      existingContent = await fs.readFile(envLocalPath, 'utf-8');
    } catch {
      // 文件不存在，写入新内容
      const lines = Object.entries(config).map(([k, v]) => `${k}=${v}`);
      await fs.writeFile(envLocalPath, lines.join('\n') + '\n', 'utf-8');
      return;
    }

    // 保留注释，逐行更新
    const lines = existingContent.split('\n');
    const result: string[] = [];
    const updatedKeys = new Set<string>();

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || trimmed === '') {
        result.push(line);
        continue;
      }
      const match = trimmed.match(/^([^=]+)=(.*)/);
      if (match) {
        const key = match[1].trim();
        if (config[key] !== undefined) {
          result.push(`${key}=${config[key]}`);
          updatedKeys.add(key);
        } else {
          result.push(line);
        }
      } else {
        result.push(line);
      }
    }

    // 追加新增的 key
    for (const [key, value] of Object.entries(config)) {
      if (!updatedKeys.has(key)) {
        result.push(`${key}=${value}`);
      }
    }

    await fs.writeFile(envLocalPath, result.join('\n') + '\n', 'utf-8');
  },

  // ────────────────────────────────────────
  // Dev server 命令
  // ────────────────────────────────────────

  async devServerCommand(worktreePath: string): Promise<string[] | null> {
    const pkg = await readPackageJson(worktreePath);
    if (!pkg) return null;

    const scripts = pkg.scripts as Record<string, string> | undefined;
    if (!scripts?.dev) return null;

    const npmCmd = await getNpmCommand();
    // npm -> ['npm', 'run', 'dev']; yarn/pnpm -> ['yarn', 'dev'] / ['pnpm', 'dev']
    if (npmCmd === 'npm') {
      return ['npm', 'run', 'dev'];
    }
    return [npmCmd, 'dev'];
  },

  // ────────────────────────────────────────
  // 项目初始化
  // ────────────────────────────────────────

  async init(worktreePath: string): Promise<void> {
    const gitignorePath = path.join(worktreePath, '.gitignore');

    let content = '';
    try {
      content = await fs.readFile(gitignorePath, 'utf-8');
    } catch {
      // 文件不存在，将创建新的
    }

    // 如果已经有 .env.local 或 *.local 规则，则跳过
    if (content.includes('.env.local') || content.includes('*.local')) {
      return;
    }

    const newContent = content.trim()
      ? `${content}\n\n# Environment files\n.env.local\n`
      : '# Environment files\n.env.local\n';

    await fs.writeFile(gitignorePath, newContent, 'utf-8');
  },

  // ────────────────────────────────────────
  // 生命周期操作
  // ────────────────────────────────────────

  async install(worktreePath: string): Promise<void> {
    const npmCmd = await getNpmCommand();
    try {
      execSync(`${npmCmd} install`, {
        cwd: worktreePath,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const output = extractOutput(error);
      throw new PluginCommandError(`${npmCmd} install failed`, output);
    }
  },

  async lint(worktreePath: string): Promise<void> {
    const pkg = await readPackageJson(worktreePath);
    if (!pkg) return;

    const scripts = pkg.scripts as Record<string, string> | undefined;
    // 没有 lint 脚本则静默跳过
    if (!scripts?.lint) return;

    const runCmd = await getRunCommand();
    try {
      execSync(`${runCmd} lint`, {
        cwd: worktreePath,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const output = extractOutput(error);
      throw new PluginCommandError(`${runCmd} lint failed`, output);
    }
  },

  async build(worktreePath: string): Promise<void> {
    const pkg = await readPackageJson(worktreePath);
    if (!pkg) return;

    const scripts = pkg.scripts as Record<string, string> | undefined;
    // 没有 build 脚本则静默跳过
    if (!scripts?.build) return;

    const runCmd = await getRunCommand();
    try {
      execSync(`${runCmd} build`, {
        cwd: worktreePath,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const output = extractOutput(error);
      throw new PluginCommandError(`${runCmd} build failed`, output);
    }
  },

  async bumpVersion(worktreePath: string, version: string): Promise<void> {
    const packageJsonPath = path.join(worktreePath, 'package.json');
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content) as Record<string, unknown>;
    pkg.version = version;
    await fs.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
  },
};
