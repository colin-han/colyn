import type { Command } from 'commander';
import { ColynError } from '../types/index.js';
import { formatError, outputResult } from '../utils/logger.js';

/**
 * Remove 命令选项
 */
interface RemoveOptions {
  force?: boolean;
}

/**
 * Remove 命令：删除不再需要的 worktree
 *
 * 主要功能：
 * - 检查是否有未提交的更改
 * - 删除 worktree 目录
 * - 清理 git worktree 记录
 */
async function removeCommand(
  _target: string,
  _options: RemoveOptions
): Promise<void> {
  try {
    // TODO: 实现 remove 命令
    throw new ColynError(
      'remove 命令尚未实现',
      '该功能正在开发中，敬请期待'
    );

  } catch (error) {
    formatError(error);
    outputResult({ success: false });
    process.exit(1);
  }
}

/**
 * 注册 remove 命令
 */
export function register(program: Command): void {
  program
    .command('remove <target>')
    .description('删除 worktree')
    .option('-f, --force', '强制删除（忽略未提交的更改）')
    .action(async (target: string, options: RemoveOptions) => {
      await removeCommand(target, options);
    });
}
