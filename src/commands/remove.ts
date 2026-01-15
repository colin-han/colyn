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
          '无法删除：存在未提交的更改',
          '请先提交或暂存更改，或使用 --force 强制删除：\n' +
          `  cd "${worktree.path}"\n` +
          '  git add . && git commit -m "..."\n\n' +
          '或者强制删除：\n' +
          `  colyn remove ${worktree.id} --force`
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
        message: '确定要删除这个 worktree 吗？',
        initial: false
      }) as { confirm: boolean };

      if (!confirmResponse.confirm) {
        output('已取消删除');
        outputResult({ success: true });
        return;
      }
    }

    // 步骤5: 检查当前目录是否在要删除的 worktree 内部
    const needSwitchDir = isCurrentDirInWorktree(worktree.path);

    // 步骤6: 执行删除
    const removeSpinner = ora({ text: '正在删除 worktree...', stream: process.stderr }).start();

    const removeResult = await executeWorktreeRemove(
      paths.mainDir,
      worktree.path,
      options.force || false
    );

    if (!removeResult.success) {
      removeSpinner.fail('删除 worktree 失败');
      throw new ColynError(
        '删除 worktree 失败',
        removeResult.error || '未知错误'
      );
    }

    removeSpinner.succeed('Worktree 已删除');

    // 步骤7: 询问是否删除分支
    let branchDeleted = false;

    // 如果分支已合并，询问是否删除
    const enquirer = new Enquirer({ stdout: process.stderr });
    const branchResponse = await enquirer.prompt({
      type: 'confirm',
      name: 'deleteBranch',
      message: `是否同时删除本地分支 "${worktree.branch}"？`,
      initial: isMerged  // 如果已合并，默认删除
    }) as { deleteBranch: boolean };

    if (branchResponse.deleteBranch) {
      const branchSpinner = ora({ text: '正在删除分支...', stream: process.stderr }).start();

      const branchResult = await deleteLocalBranch(
        paths.mainDir,
        worktree.branch,
        !isMerged  // 如果未合并，需要强制删除
      );

      if (branchResult.success) {
        branchSpinner.succeed(`分支 "${worktree.branch}" 已删除`);
        branchDeleted = true;
      } else {
        branchSpinner.fail(`删除分支失败: ${branchResult.error}`);
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
      output('已取消');
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
    .description('删除 worktree')
    .option('-f, --force', '强制删除（忽略未提交的更改）')
    .option('-y, --yes', '跳过确认提示')
    .action(async (target: string | undefined, options: RemoveOptions) => {
      await removeCommand(target, options);
    });
}
