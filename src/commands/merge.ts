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
import { formatError, output, outputResult, outputSuccess } from '../utils/logger.js';
import { checkIsGitRepo } from './add.helpers.js';
import {
  findWorktreeTarget,
  checkGitWorkingDirectory,
  mergeMainIntoWorktree,
  mergeWorktreeIntoMain,
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
 *
 * 流程：
 * 1. 前置检查（主分支和 worktree 都干净）
 * 2. 在 worktree 中合并主分支（允许 ff），确保 worktree 包含主分支的所有更改
 * 3. 如果有冲突，提示用户在 worktree 中解决
 * 4. 在主分支中合并 worktree 分支（--no-ff），此时不会有冲突
 * 5. 推送处理
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

    // 步骤6: 在 worktree 中合并主分支（确保 worktree 包含主分支的所有更改）
    output(`步骤 1/2: 在 worktree 中合并主分支`);
    output(`  目录: ${worktree.path}`);
    output(`  执行: git merge ${mainBranch}`);

    const step1Spinner = ora({ text: '合并主分支到 worktree...', stream: process.stderr }).start();

    const step1Result = await executeInDirectory(worktree.path, async () => {
      return await mergeMainIntoWorktree(worktree.path, mainBranch);
    });

    if (!step1Result.success) {
      step1Spinner.fail('合并主分支失败');

      if (step1Result.error === 'merge_conflict') {
        // 合并冲突 - 在 worktree 中解决
        displayMergeConflict(
          step1Result.conflictFiles || [],
          worktree.path,
          worktree.branch,
          mainBranch
        );
        outputResult({ success: false });
        process.exit(1);
      } else {
        throw new ColynError(
          '合并主分支失败',
          step1Result.error || '未知错误'
        );
      }
    }

    step1Spinner.succeed('主分支已合并到 worktree');

    // 步骤7: 在主分支中合并 worktree 分支
    output(`步骤 2/2: 在主分支中合并 worktree 分支`);
    output(`  目录: ${paths.mainDir}`);
    output(`  执行: git merge --no-ff ${worktree.branch}`);

    const step2Spinner = ora({ text: '合并 worktree 到主分支...', stream: process.stderr }).start();

    const step2Result = await executeInDirectory(paths.mainDir, async () => {
      return await mergeWorktreeIntoMain(paths.mainDir, worktree.branch);
    });

    if (!step2Result.success) {
      step2Spinner.fail('合并到主分支失败');

      // 理论上不应该发生冲突，但还是处理一下
      if (step2Result.error === 'merge_conflict') {
        throw new ColynError(
          '合并到主分支时发生意外冲突',
          '这种情况不应该发生。请检查 git 状态并手动解决。\n' +
          `主分支目录: ${paths.mainDir}`
        );
      } else {
        throw new ColynError(
          '合并到主分支失败',
          step2Result.error || '未知错误'
        );
      }
    }

    step2Spinner.succeed('worktree 已合并到主分支');
    outputSuccess('合并完成！');

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
      step2Result.commitHash || 'unknown',
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
