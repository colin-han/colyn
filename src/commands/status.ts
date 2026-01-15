import type { Command } from 'commander';
import { ColynError } from '../types/index.js';
import { formatError, outputResult } from '../utils/logger.js';

/**
 * Status 命令选项
 */
interface StatusOptions {
  json?: boolean;
}

/**
 * Status 命令：显示 worktree 相对于主分支的修改
 *
 * 主要功能：
 * - 显示变更文件数
 * - 显示新增/删除行数
 * - 显示提交数
 */
async function statusCommand(
  _target: string | undefined,
  _options: StatusOptions
): Promise<void> {
  try {
    // TODO: 实现 status 命令
    throw new ColynError(
      'status 命令尚未实现',
      '该功能正在开发中，敬请期待'
    );

  } catch (error) {
    formatError(error);
    outputResult({ success: false });
    process.exit(1);
  }
}

/**
 * 注册 status 命令
 */
export function register(program: Command): void {
  program
    .command('status [target]')
    .description('显示 worktree 相对于主分支的修改')
    .option('--json', '以 JSON 格式输出')
    .action(async (target: string | undefined, options: StatusOptions) => {
      await statusCommand(target, options);
    });
}
