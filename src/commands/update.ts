import type { Command } from 'commander';
import ora from 'ora';
import {
  getProjectPaths,
  validateProjectInitialized,
  executeInDirectory
} from '../core/paths.js';
import { getMainBranch, discoverWorktrees } from '../core/discovery.js';
import type { CommandResult } from '../types/index.js';
import { ColynError } from '../types/index.js';
import { formatError, output, outputResult } from '../utils/logger.js';
import { checkIsGitRepo } from './add.helpers.js';
import {
  findWorktreeTarget,
  checkGitWorkingDirectory,
  pullMainBranch,
  updateSingleWorktree,
  updateAllWorktrees,
  displayWorktreeInfo,
  displayUpdateSuccess,
  displayRebaseConflict,
  displayMergeConflict,
  displayBatchUpdateResult,
  displayWorktreeList
} from './update.helpers.js';
import { t } from '../i18n/index.js';

/**
 * Update 命令选项
 */
export interface UpdateOptions {
  noRebase?: boolean;
  all?: boolean;
}

/**
 * Update 命令：将主分支代码更新到 worktree
 *
 * 流程：
 * 1. 检查 worktree 工作目录状态
 * 2. 拉取主分支最新代码
 * 3. 执行 rebase 或 merge
 */
async function updateCommand(
  target: string | undefined,
  options: UpdateOptions
): Promise<void> {
  try {
    // 步骤1: 获取项目路径并验证
    const paths = await getProjectPaths();
    await validateProjectInitialized(paths);

    // 步骤2: 在主分支目录中检查 git 仓库
    await executeInDirectory(paths.mainDir, async () => {
      await checkIsGitRepo();
    });

    // 获取主分支名称
    const mainBranch = await getMainBranch(paths.mainDir);

    // 确定是否使用 rebase（默认 true）
    const useRebase = !options.noRebase;

    // 步骤3: 处理批量更新或单个更新
    if (options.all) {
      // 批量更新所有 worktree
      await handleBatchUpdate(paths.mainDir, paths.worktreesDir, mainBranch, useRebase);
    } else {
      // 单个更新
      await handleSingleUpdate(target, paths.mainDir, paths.worktreesDir, mainBranch, useRebase);
    }

    // 输出 JSON 结果
    const result: CommandResult = { success: true };
    outputResult(result);

  } catch (error) {
    formatError(error);
    outputResult({ success: false });
    process.exit(1);
  }
}

/**
 * 处理单个 worktree 更新
 */
async function handleSingleUpdate(
  target: string | undefined,
  mainDir: string,
  worktreesDir: string,
  mainBranch: string,
  useRebase: boolean
): Promise<void> {
  // 查找目标 worktree
  const worktree = await findWorktreeTarget(target, mainDir, worktreesDir);

  // 显示 worktree 信息
  displayWorktreeInfo(worktree);

  // 步骤1: 检查工作目录状态
  const checkSpinner = ora({
    text: t('commands.update.checkingStatus'),
    stream: process.stderr
  }).start();

  try {
    await checkGitWorkingDirectory(worktree.path, `task-${worktree.id}`);
    checkSpinner.succeed(t('commands.update.statusClean'));
  } catch (error) {
    checkSpinner.fail(t('commands.update.statusDirty'));
    throw error;
  }

  // 步骤2: 拉取主分支最新代码
  const pullSpinner = ora({
    text: t('commands.update.pullingMain'),
    stream: process.stderr
  }).start();

  try {
    await pullMainBranch(mainDir);
    pullSpinner.succeed(t('commands.update.pullSuccess'));
  } catch (error) {
    pullSpinner.fail(t('commands.update.pullFailed'));
    throw error;
  }

  // 步骤3: 执行更新
  const strategy = useRebase ? 'rebase' : 'merge';
  const updateSpinner = ora({
    text: t('commands.update.updating', { strategy }),
    stream: process.stderr
  }).start();

  output(t('commands.update.updateDir', { path: worktree.path }));
  output(t('commands.update.updateCmd', { cmd: useRebase ? `git rebase ${mainBranch}` : `git merge ${mainBranch}` }));

  const result = await updateSingleWorktree(worktree, mainBranch, useRebase);

  if (!result.success) {
    updateSpinner.fail(t('commands.update.updateFailed'));

    if (result.error === 'rebase_conflict') {
      displayRebaseConflict(result.conflictFiles || [], worktree.path);
    } else if (result.error === 'merge_conflict') {
      displayMergeConflict(result.conflictFiles || [], worktree.path);
    } else {
      throw new ColynError(
        t('commands.update.updateFailed'),
        result.error || t('common.unknownError')
      );
    }

    outputResult({ success: false });
    process.exit(1);
  }

  updateSpinner.succeed(t('commands.update.updateSuccess'));

  // 显示成功信息
  displayUpdateSuccess(mainBranch, worktree.branch, useRebase);
}

/**
 * 处理批量更新
 */
async function handleBatchUpdate(
  mainDir: string,
  worktreesDir: string,
  mainBranch: string,
  useRebase: boolean
): Promise<void> {
  // 发现所有 worktree
  const worktrees = await discoverWorktrees(mainDir, worktreesDir);

  if (worktrees.length === 0) {
    throw new ColynError(
      t('commands.update.noWorktrees'),
      t('commands.update.noWorktreesHint')
    );
  }

  // 显示 worktree 列表
  displayWorktreeList(worktrees);

  // 步骤1: 拉取主分支最新代码
  const pullSpinner = ora({
    text: t('commands.update.pullingMain'),
    stream: process.stderr
  }).start();

  try {
    await pullMainBranch(mainDir);
    pullSpinner.succeed(t('commands.update.pullSuccess'));
  } catch (error) {
    pullSpinner.fail(t('commands.update.pullFailed'));
    throw error;
  }

  // 步骤2: 执行批量更新（内部会检查每个 worktree 的状态）
  const strategy = useRebase ? 'rebase' : 'merge';
  output(t('commands.update.batchUpdating', { strategy }));

  const result = await updateAllWorktrees(worktrees, mainBranch, useRebase);

  // 显示结果
  displayBatchUpdateResult(result);

  // 如果有失败，退出码为 1
  if (result.failed > 0) {
    outputResult({ success: false });
    process.exit(1);
  }
}

/**
 * 执行 update 命令（供其他命令内部调用，不输出 JSON）
 */
export async function executeUpdate(
  target: string | undefined,
  options: UpdateOptions
): Promise<void> {
  // 步骤1: 获取项目路径并验证
  const paths = await getProjectPaths();
  await validateProjectInitialized(paths);

  // 步骤2: 在主分支目录中检查 git 仓库
  await executeInDirectory(paths.mainDir, async () => {
    await checkIsGitRepo();
  });

  // 获取主分支名称
  const mainBranch = await getMainBranch(paths.mainDir);

  // 确定是否使用 rebase（默认 true）
  const useRebase = !options.noRebase;

  // 步骤3: 处理批量更新或单个更新
  if (options.all) {
    // 批量更新所有 worktree
    await handleBatchUpdate(paths.mainDir, paths.worktreesDir, mainBranch, useRebase);
  } else {
    // 单个更新
    await handleSingleUpdate(target, paths.mainDir, paths.worktreesDir, mainBranch, useRebase);
  }
}

/**
 * 注册 update 命令
 */
export function register(program: Command): void {
  program
    .command('update [target]')
    .description(t('commands.update.description'))
    .option('--no-rebase', t('commands.update.noRebaseOption'))
    .option('--all', t('commands.update.allOption'))
    .action(async (target: string | undefined, options: UpdateOptions) => {
      await updateCommand(target, options);
    });
}
