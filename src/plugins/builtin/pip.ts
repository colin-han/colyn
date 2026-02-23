/**
 * pip 内置工具链插件
 *
 * 支持基于 pip / poetry 的 Python 项目。
 * 通过检测 requirements.txt 或 pyproject.toml 来识别项目类型。
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { type ToolchainPlugin, type PortConfig, PluginCommandError } from '../../types/plugin.js';
import { extractOutput } from '../utils.js';

/**
 * 读取 pyproject.toml 内容（若存在）
 */
async function readPyprojectToml(worktreePath: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(worktreePath, 'pyproject.toml'), 'utf-8');
  } catch {
    return null;
  }
}

export const pipPlugin: ToolchainPlugin = {
  name: 'pip',
  displayName: 'Python (pip/poetry)',

  // ────────────────────────────────────────
  // 检测
  // ────────────────────────────────────────

  detect(worktreePath: string): boolean {
    return (
      fsSync.existsSync(path.join(worktreePath, 'requirements.txt')) ||
      fsSync.existsSync(path.join(worktreePath, 'pyproject.toml'))
    );
  },

  // ────────────────────────────────────────
  // 端口配置
  // ────────────────────────────────────────

  portConfig(): PortConfig {
    return { key: 'PORT', defaultPort: 8000 };
  },

  // ────────────────────────────────────────
  // 运行时配置（.env.local，dotenv 格式）
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
      const lines = Object.entries(config).map(([k, v]) => `${k}=${v}`);
      await fs.writeFile(envLocalPath, lines.join('\n') + '\n', 'utf-8');
      return;
    }

    // 保留注释，更新已有 key，追加新 key
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
    // Django 项目：存在 manage.py
    const managePy = path.join(worktreePath, 'manage.py');
    if (fsSync.existsSync(managePy)) {
      return ['python', 'manage.py', 'runserver'];
    }
    return null;
  },

  // ────────────────────────────────────────
  // 项目初始化
  // ────────────────────────────────────────

  getRuntimeConfigFileName(): string {
    return '.env.local';
  },

  // ────────────────────────────────────────
  // 生命周期操作
  // ────────────────────────────────────────

  async install(worktreePath: string): Promise<void> {
    const hasPyproject = fsSync.existsSync(path.join(worktreePath, 'pyproject.toml'));
    const cmd = hasPyproject ? 'poetry install' : 'pip install -r requirements.txt';
    try {
      execSync(cmd, { cwd: worktreePath, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      throw new PluginCommandError(`${cmd} failed`, extractOutput(error));
    }
  },

  async lint(worktreePath: string): Promise<void> {
    // 优先检查 ruff
    const hasRuffToml = fsSync.existsSync(path.join(worktreePath, 'ruff.toml'));
    const pyproject = await readPyprojectToml(worktreePath);
    const hasRuffConfig = hasRuffToml || (pyproject !== null && pyproject.includes('[tool.ruff]'));

    if (hasRuffConfig) {
      try {
        execSync('ruff check .', { cwd: worktreePath, stdio: ['ignore', 'pipe', 'pipe'] });
        return;
      } catch (error) {
        throw new PluginCommandError('ruff check failed', extractOutput(error));
      }
    }

    // 其次尝试 flake8（通过 which 检测是否安装）
    try {
      execSync('which flake8', { stdio: 'ignore' });
      // flake8 存在，运行它
      try {
        execSync('flake8 .', { cwd: worktreePath, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (error) {
        throw new PluginCommandError('flake8 failed', extractOutput(error));
      }
    } catch {
      // flake8 不存在，静默跳过
    }
  },

  // build 不实现，Python 通常无需构建步骤

  async bumpVersion(worktreePath: string, version: string): Promise<void> {
    const pyprojectContent = await readPyprojectToml(worktreePath);

    if (pyprojectContent !== null) {
      // 更新 pyproject.toml 中的 version
      // 支持 [tool.poetry] version = "..." 和 [project] version = "..."
      const updated = pyprojectContent.replace(
        /(version\s*=\s*)"[^"]*"/g,
        `$1"${version}"`
      );
      if (updated === pyprojectContent) {
        throw new PluginCommandError(
          'Cannot update version in pyproject.toml',
          'No version = "..." pattern found'
        );
      }
      await fs.writeFile(path.join(worktreePath, 'pyproject.toml'), updated, 'utf-8');
      return;
    }

    // 回退到 setup.py
    const setupPyPath = path.join(worktreePath, 'setup.py');
    try {
      const setupContent = await fs.readFile(setupPyPath, 'utf-8');
      const updated = setupContent.replace(
        /(version\s*=\s*['"])[^'"]*(['"])/g,
        `$1${version}$2`
      );
      if (updated === setupContent) {
        throw new PluginCommandError(
          'Cannot update version in setup.py',
          'No version = "..." pattern found'
        );
      }
      await fs.writeFile(setupPyPath, updated, 'utf-8');
    } catch (error) {
      if (error instanceof PluginCommandError) throw error;
      throw new PluginCommandError(
        'Cannot update Python project version',
        'Neither pyproject.toml nor setup.py found'
      );
    }
  },

  async publish(worktreePath: string): Promise<void> {
    const pyprojectContent = await readPyprojectToml(worktreePath);
    const hasPoetry = pyprojectContent !== null && pyprojectContent.includes('[tool.poetry]');
    const publishCmd = hasPoetry
      ? 'poetry publish --build'
      : 'python -m build && twine upload dist/*';

    try {
      execSync(publishCmd, {
        cwd: worktreePath,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      throw new PluginCommandError(`${publishCmd} failed`, extractOutput(error));
    }
  },

  async checkPublishable(worktreePath: string): Promise<boolean> {
    const pyprojectContent = await readPyprojectToml(worktreePath);
    if (pyprojectContent !== null) {
      return (
        pyprojectContent.includes('[tool.poetry]') ||
        pyprojectContent.includes('[project]')
      );
    }

    return fsSync.existsSync(path.join(worktreePath, 'setup.py'));
  },
};
