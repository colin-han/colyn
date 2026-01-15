import * as fs from 'fs/promises';
import * as path from 'path';
import simpleGit from 'simple-git';
import type { WorktreeInfo } from '../types/index.js';
import { ColynError } from '../types/index.js';

/**
 * 项目发现信息
 * 从文件系统动态获取，替代 config.json
 */
export interface ProjectInfo {
  /** 主分支名称（从主分支目录的 git 获取） */
  mainBranch: string;
  /** 主分支端口（从 .env.local 获取） */
  mainPort: number;
  /** 下一个 worktree ID */
  nextWorktreeId: number;
  /** 所有 worktree 信息 */
  worktrees: WorktreeInfo[];
}

/**
 * 从 .env.local 文件解析环境变量
 */
async function parseEnvFile(filePath: string): Promise<Record<string, string>> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const env: Record<string, string> = {};

    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();

      // 跳过注释和空行
      if (trimmed.startsWith('#') || trimmed === '') {
        continue;
      }

      // 解析环境变量
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        env[key] = value;
      }
    }

    return env;
  } catch {
    return {};
  }
}

/**
 * 从主分支目录获取当前分支名称
 */
export async function getMainBranch(mainDir: string): Promise<string> {
  try {
    const git = simpleGit(mainDir);
    const branchSummary = await git.branch();
    return branchSummary.current;
  } catch {
    // 如果获取失败，默认使用 'main'
    return 'main';
  }
}

/**
 * 从主分支的 .env.local 获取端口
 */
export async function getMainPort(mainDir: string): Promise<number> {
  const envPath = path.join(mainDir, '.env.local');
  const env = await parseEnvFile(envPath);

  const port = parseInt(env.PORT || '');
  if (isNaN(port)) {
    throw new ColynError(
      '无法获取主分支端口',
      `请确保 ${envPath} 中配置了 PORT 环境变量`
    );
  }

  return port;
}

/**
 * 扫描 worktrees 目录获取下一个可用 ID
 */
export async function getNextWorktreeId(worktreesDir: string): Promise<number> {
  try {
    const entries = await fs.readdir(worktreesDir);
    const ids = entries
      .filter(e => e.startsWith('task-'))
      .map(e => parseInt(e.replace('task-', '')))
      .filter(n => !isNaN(n));

    return ids.length > 0 ? Math.max(...ids) + 1 : 1;
  } catch {
    // 目录不存在或无法读取，返回 1
    return 1;
  }
}

/**
 * 发现所有 worktree 信息
 * 结合 git worktree list 和各目录的 .env.local
 */
export async function discoverWorktrees(
  mainDir: string,
  worktreesDir: string
): Promise<WorktreeInfo[]> {
  const worktrees: WorktreeInfo[] = [];

  try {
    // 使用 git worktree list --porcelain 获取所有 worktree
    const git = simpleGit(mainDir);
    const result = await git.raw(['worktree', 'list', '--porcelain']);

    // 解析 porcelain 输出
    const blocks = result.trim().split('\n\n');

    for (const block of blocks) {
      const lines = block.split('\n');
      let worktreePath = '';
      let branch = '';

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          worktreePath = line.substring(9);
        } else if (line.startsWith('branch ')) {
          // 格式: branch refs/heads/feature/xxx
          branch = line.substring(7).replace('refs/heads/', '');
        }
      }

      // 只处理 worktrees 目录下的 worktree（排除主分支）
      if (worktreePath && worktreePath.startsWith(worktreesDir)) {
        const dirName = path.basename(worktreePath);
        const idMatch = dirName.match(/^task-(\d+)$/);

        if (idMatch) {
          const id = parseInt(idMatch[1]);
          const envPath = path.join(worktreePath, '.env.local');
          const env = await parseEnvFile(envPath);
          const port = parseInt(env.PORT || '0');

          // 获取目录创建时间作为 createdAt
          let createdAt = new Date().toISOString();
          try {
            const stats = await fs.stat(worktreePath);
            createdAt = stats.birthtime.toISOString();
          } catch {
            // 忽略错误，使用当前时间
          }

          worktrees.push({
            id,
            branch: branch || 'unknown',
            path: worktreePath,
            port,
            createdAt
          });
        }
      }
    }

    // 按 ID 排序
    worktrees.sort((a, b) => a.id - b.id);
  } catch {
    // 如果 git worktree list 失败，尝试直接扫描目录
    try {
      const entries = await fs.readdir(worktreesDir);

      for (const entry of entries) {
        if (entry.startsWith('task-')) {
          const idMatch = entry.match(/^task-(\d+)$/);
          if (idMatch) {
            const id = parseInt(idMatch[1]);
            const worktreePath = path.join(worktreesDir, entry);
            const envPath = path.join(worktreePath, '.env.local');
            const env = await parseEnvFile(envPath);
            const port = parseInt(env.PORT || '0');

            // 尝试获取分支名
            let branch = 'unknown';
            try {
              const git = simpleGit(worktreePath);
              const branchSummary = await git.branch();
              branch = branchSummary.current;
            } catch {
              // 忽略错误
            }

            // 获取目录创建时间
            let createdAt = new Date().toISOString();
            try {
              const stats = await fs.stat(worktreePath);
              createdAt = stats.birthtime.toISOString();
            } catch {
              // 忽略错误
            }

            worktrees.push({
              id,
              branch,
              path: worktreePath,
              port,
              createdAt
            });
          }
        }
      }

      worktrees.sort((a, b) => a.id - b.id);
    } catch {
      // 目录不存在或无法读取
    }
  }

  return worktrees;
}

/**
 * 获取完整的项目信息
 * 这是获取项目配置的主入口，替代原来的 loadConfig
 */
export async function discoverProjectInfo(
  mainDir: string,
  worktreesDir: string
): Promise<ProjectInfo> {
  const [mainBranch, mainPort, nextWorktreeId, worktrees] = await Promise.all([
    getMainBranch(mainDir),
    getMainPort(mainDir),
    getNextWorktreeId(worktreesDir),
    discoverWorktrees(mainDir, worktreesDir)
  ]);

  return {
    mainBranch,
    mainPort,
    nextWorktreeId,
    worktrees
  };
}

/**
 * 检查分支是否已有 worktree
 */
export async function findWorktreeByBranch(
  mainDir: string,
  worktreesDir: string,
  branch: string
): Promise<WorktreeInfo | undefined> {
  const worktrees = await discoverWorktrees(mainDir, worktreesDir);
  return worktrees.find(w => w.branch === branch);
}
