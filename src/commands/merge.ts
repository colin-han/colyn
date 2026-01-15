import type { Command } from 'commander';
import ora from 'ora';
import {
  getProjectPaths,
  validateProjectInitialized,
  executeInDirectory
} from '../core/paths.js';
import { getMainBranch } from '../core/discovery.js';
import type { CommandResult } from '../types/index.js';
import { ColynError } from '../types/index.js';
import { formatError, output, outputResult } from '../utils/logger.js';
import { checkIsGitRepo } from './add.helpers.js';
import {
  findWorktreeTarget,
  checkGitWorkingDirectory,
  executeMerge,
  pushToRemote,
  displayWorktreeInfo,
  displayCheckPassed,
  displayMergeSuccess,
  displayMergeConflict,
  displayPushFailed
} from './merge.helpers.js';

/**
 * Merge 命令选项
 */
interface MergeOptions {
  push?: boolean;
}

/**
 * Merge 命令：将 worktree 分支合并回主分支
 */
async function mergeCommand(
  target: string | undefined,
  options: MergeOptions
): Promise<void> {
  try {
    // 步骤1: 获取项目路径并验证
    const paths = await getProjectPaths();
    await validateProjectInitialized(paths);

    // 步骤2: 在主分支目录中检查 git 仓库
    await executeInDirectory(paths.mainDir, async () => {
      await checkIsGitRepo();
    });

    // 步骤3: 查找目标 worktree
    const worktree = await findWorktreeTarget(
      target,
      paths.mainDir,
      paths.worktreesDir
    );

    // 显示 worktree 信息
    displayWorktreeInfo(worktree);

    // 步骤4: 前置检查
    const checkSpinner = ora({ text: '执行前置检查...', stream: process.stderr }).start();

    try {
      // 检查主分支工作目录
      await checkGitWorkingDirectory(paths.mainDir, '主分支');

      // 检查 worktree 工作目录
      await checkGitWorkingDirectory(worktree.path, 'Worktree');

      checkSpinner.succeed('前置检查通过');
      displayCheckPassed();
    } catch (error) {
      checkSpinner.fail('前置检查失败');
      throw error;
    }

    // 步骤5: 获取主分支名称
    const mainBranch = await getMainBranch(paths.mainDir);

    // 步骤6: 执行合并
    output(`切换到主分支目录: ${paths.mainDir}`);
    output(`执行合并: git merge --no-ff ${worktree.branch}`);

    const mergeSpinner = ora({ text: '正在合并...', stream: process.stderr }).start();

    const mergeResult = await executeInDirectory(paths.mainDir, async () => {
      return await executeMerge(paths.mainDir, worktree.branch, mainBranch);
    });

    // 步骤7: 处理合并结果
    if (!mergeResult.success) {
      mergeSpinner.fail('合并失败');

      if (mergeResult.error === 'merge_conflict') {
        // 合并冲突
        displayMergeConflict(
          mergeResult.conflictFiles || [],
          paths.mainDir,
          mainBranch
        );
        outputResult({ success: false });
        process.exit(1);
      } else {
        // 其他错误
        throw new ColynError(
          '合并失败',
          mergeResult.error || '未知错误'
        );
      }
    }

    mergeSpinner.succeed('合并成功');

    // 步骤8: 推送处理
    // --push: 推送，否则默认不推送
    let pushed = false;

    if (options.push === true) {
      // --push: 自动推送
      const pushResult = await pushToRemote(paths.mainDir, mainBranch);
      if (pushResult.success) {
        pushed = true;
      } else {
        displayPushFailed(pushResult.error || '未知错误', paths.mainDir, mainBranch);
      }
    }
    // 默认不推送，不询问

    // 步骤9: 显示成功信息
    displayMergeSuccess(
      mainBranch,
      worktree.branch,
      mergeResult.commitHash || 'unknown',
      paths.mainDir,
      worktree.path,
      worktree.id,
      pushed
    );

    // 步骤10: 输出 JSON 结果到 stdout（不设置 targetDir，保持在原目录）
    const result: CommandResult = {
      success: true
    };
    outputResult(result);

  } catch (error) {
    formatError(error);
    outputResult({ success: false });
    process.exit(1);
  }
}

/**
 * 注册 merge 命令
 */
export function register(program: Command): void {
  program
    .command('merge [target]')
    .description('将 worktree 分支合并回主分支')
    .option('--push', '合并后自动推送到远程')
    .action(async (target: string | undefined, options: MergeOptions) => {
      await mergeCommand(target, options);
    });
}
