import type { Command } from 'commander';
import Enquirer from 'enquirer';
import ora from 'ora';
import {
  getProjectPaths,
  validateProjectInitialized,
} from '../core/paths.js';
import { getMainBranch } from '../core/discovery.js';
import type { CommandResult } from '../types/index.js';
import { ColynError } from '../types/index.js';
import { formatError, output, outputResult } from '../utils/logger.js';
import {
  findWorktreeTarget,
  checkUncommittedChanges,
  checkBranchMerged,
  isCurrentDirInWorktree,
  executeWorktreeRemove,
  deleteLocalBranch,
  displayWorktreeInfo,
  displayUncommittedChanges,
  displayUnmergedWarning,
  displayRemoveSuccess
} from './remove.helpers.js';
import { t } from '../i18n/index.js';

/**
 * Remove 命令选项
 */
interface RemoveOptions {
  force?: boolean;
  yes?: boolean;
}

/**
 * Remove 命令：删除不再需要的 worktree
 *
 * 流程：
 * 1. 目标识别（ID、分支名、自动识别）
 * 2. 前置检查（未提交更改、未合并警告）
 * 3. 用户确认
 * 4. 执行删除
 * 5. 询问是否删除分支
 * 6. 目录切换处理
 */
async function removeCommand(
  target: string | undefined,
  options: RemoveOptions
): Promise<void> {
  try {
    // 步骤1: 获取项目路径并验证
    const paths = await getProjectPaths();
    await validateProjectInitialized(paths);

    // 步骤2: 查找目标 worktree
    const worktree = await findWorktreeTarget(
      target,
      paths.mainDir,
      paths.worktreesDir
    );

    // 显示 worktree 信息
    displayWorktreeInfo(worktree);

    // 步骤3: 前置检查
    // 检查未提交更改
    if (!options.force) {
      const { hasChanges, changedFiles } = await checkUncommittedChanges(worktree.path);
      if (hasChanges) {
        displayUncommittedChanges(changedFiles);
        throw new ColynError(
          t('commands.remove.cannotDelete'),
          t('commands.remove.cannotDeleteHint', { path: worktree.path, id: worktree.id })
        );
      }
    }

    // 检查是否已合并（仅警告，不阻止）
    const mainBranch = await getMainBranch(paths.mainDir);
    const isMerged = await checkBranchMerged(paths.mainDir, worktree.branch);
    if (!isMerged) {
      displayUnmergedWarning(worktree.branch, mainBranch);
    }

    // 步骤4: 用户确认
    if (!options.yes) {
      const enquirer = new Enquirer({ stdout: process.stderr });
      const confirmResponse = await enquirer.prompt({
        type: 'confirm',
        name: 'confirm',
        message: t('commands.remove.confirmDelete'),
        initial: false
      }) as { confirm: boolean };

      if (!confirmResponse.confirm) {
        output(t('commands.remove.deleteCanceled'));
        outputResult({ success: true });
        return;
      }
    }

    // 步骤5: 检查当前目录是否在要删除的 worktree 内部
    const needSwitchDir = isCurrentDirInWorktree(worktree.path);

    // 步骤6: 执行删除
    const removeSpinner = ora({ text: t('commands.remove.deleting'), stream: process.stderr }).start();

    const removeResult = await executeWorktreeRemove(
      paths.mainDir,
      worktree.path,
      options.force || false
    );

    if (!removeResult.success) {
      removeSpinner.fail(t('commands.remove.deleteFailed'));
      throw new ColynError(
        t('commands.remove.deleteFailed'),
        removeResult.error || t('common.unknownError')
      );
    }

    removeSpinner.succeed(t('commands.remove.deleted'));

    // 步骤7: 询问是否删除分支（--yes 时跳过）
    let branchDeleted = false;
    let shouldDeleteBranch = false;

    if (options.yes) {
      output(t('commands.remove.skipDeleteBranchPrompt'));
    } else {
      // 如果分支已合并，询问是否删除
      const enquirer = new Enquirer({ stdout: process.stderr });
      const branchResponse = await enquirer.prompt({
        type: 'confirm',
        name: 'deleteBranch',
        message: t('commands.remove.deleteBranch', { branch: worktree.branch }),
        initial: isMerged  // 如果已合并，默认删除
      }) as { deleteBranch: boolean };
      shouldDeleteBranch = branchResponse.deleteBranch;
    }

    if (shouldDeleteBranch) {
      const branchSpinner = ora({ text: t('commands.remove.deletingBranch'), stream: process.stderr }).start();

      const branchResult = await deleteLocalBranch(
        paths.mainDir,
        worktree.branch,
        !isMerged  // 如果未合并，需要强制删除
      );

      if (branchResult.success) {
        branchSpinner.succeed(t('commands.remove.branchDeleted', { branch: worktree.branch }));
        branchDeleted = true;
      } else {
        branchSpinner.fail(t('commands.remove.branchDeleteFailed', { error: branchResult.error ?? '' }));
      }
    }

    // 步骤8: 显示成功信息
    displayRemoveSuccess(
      worktree,
      branchDeleted,
      needSwitchDir,
      paths.mainDir
    );

    // 步骤9: 输出 JSON 结果
    const result: CommandResult = {
      success: true,
      // 如果当前目录在被删除的 worktree 内，切换到主分支目录
      ...(needSwitchDir && {
        targetDir: paths.mainDir,
        displayPath: paths.mainDir
      })
    };
    outputResult(result);

  } catch (error) {
    // 如果是 enquirer 取消（用户按 Ctrl+C），静默退出
    if (error instanceof Error && error.message === '') {
      output(t('common.canceled'));
      outputResult({ success: false });
      process.exit(1);
    }

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
    .command('remove [target]')
    .alias('rm')
    .description(t('commands.remove.description'))
    .option('-f, --force', t('commands.remove.forceOption'))
    .option('-y, --yes', t('commands.remove.yesOption'))
    .action(async (target: string | undefined, options: RemoveOptions) => {
      await removeCommand(target, options);
    });
}
