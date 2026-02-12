import type { Command } from 'commander';
import Enquirer from 'enquirer';
import ora from 'ora';
import {
  getProjectPaths,
  validateProjectInitialized,
  executeInDirectory
} from '../core/paths.js';
import { getMainBranch, discoverWorktrees } from '../core/discovery.js';
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
import {
  pullMainBranch,
  updateAllWorktrees,
  displayBatchUpdateResult
} from './update.helpers.js';
import { t } from '../i18n/index.js';

/**
 * Merge 命令选项
 */
interface MergeOptions {
  push?: boolean;
  noRebase?: boolean;
  noUpdate?: boolean;  // 合并后不自动更新
  updateAll?: boolean;  // 合并后更新所有 worktrees
}

/**
 * Merge 命令：将 worktree 分支合并回主分支
 *
 * 流程：
 * 1. 前置检查（主分支和 worktree 都干净）
 * 2. 在 worktree 中 rebase 主分支（默认），确保 worktree 包含主分支的所有更改
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
    const checkSpinner = ora({ text: t('commands.merge.preCheck'), stream: process.stderr }).start();

    try {
      // 检查主分支工作目录
      await checkGitWorkingDirectory(paths.mainDir, t('commands.merge.mainDirClean').replace('✓ ', '').replace(' working directory clean', ''));

      // 检查 worktree 工作目录
      await checkGitWorkingDirectory(worktree.path, 'Worktree');

      checkSpinner.succeed(t('commands.merge.preCheckPassed'));
      displayCheckPassed();
    } catch (error) {
      checkSpinner.fail(t('commands.merge.preCheckFailed'));
      throw error;
    }

    // 步骤5: 获取主分支名称
    const mainBranch = await getMainBranch(paths.mainDir);

    // 确定是否使用 rebase（默认 true）
    const useRebase = !options.noRebase;

    // 步骤6: 在 worktree 中更新主分支代码（确保 worktree 包含主分支的所有更改）
    output(t('commands.merge.step1Title'));
    output(t('commands.merge.step1Dir', { path: worktree.path }));
    if (useRebase) {
      output(t('commands.merge.step1CmdRebase', { branch: mainBranch }));
    } else {
      output(t('commands.merge.step1Cmd', { branch: mainBranch }));
    }

    const step1Spinner = ora({ text: useRebase ? t('commands.merge.rebasingMain') : t('commands.merge.mergingMain'), stream: process.stderr }).start();

    const step1Result = await executeInDirectory(worktree.path, async () => {
      return await mergeMainIntoWorktree(worktree.path, mainBranch, useRebase);
    });

    if (!step1Result.success) {
      step1Spinner.fail(useRebase ? t('commands.merge.mainRebaseFailed') : t('commands.merge.mainMergeFailed'));

      if (step1Result.error === 'rebase_conflict' || step1Result.error === 'merge_conflict') {
        // 冲突 - 在 worktree 中解决
        displayMergeConflict(
          step1Result.conflictFiles || [],
          worktree.path,
          worktree.branch,
          mainBranch,
          useRebase
        );
        outputResult({ success: false });
        process.exit(1);
      } else {
        throw new ColynError(
          useRebase ? t('commands.merge.mainRebaseFailed') : t('commands.merge.mainMergeFailed'),
          step1Result.error || t('common.unknownError')
        );
      }
    }

    step1Spinner.succeed(useRebase ? t('commands.merge.mainRebased') : t('commands.merge.mainMerged'));

    // 步骤7: 在主分支中合并 worktree 分支
    output(t('commands.merge.step2Title'));
    output(t('commands.merge.step2Dir', { path: paths.mainDir }));
    output(t('commands.merge.step2Cmd', { branch: worktree.branch }));

    const step2Spinner = ora({ text: t('commands.merge.mergingWorktree'), stream: process.stderr }).start();

    const step2Result = await executeInDirectory(paths.mainDir, async () => {
      return await mergeWorktreeIntoMain(paths.mainDir, worktree.branch);
    });

    if (!step2Result.success) {
      step2Spinner.fail(t('commands.merge.worktreeMergeFailed'));

      // 理论上不应该发生冲突，但还是处理一下
      if (step2Result.error === 'merge_conflict') {
        throw new ColynError(
          t('commands.merge.unexpectedConflict'),
          t('commands.merge.unexpectedConflictHint', { path: paths.mainDir })
        );
      } else {
        throw new ColynError(
          t('commands.merge.mergeFailed'),
          step2Result.error || t('common.unknownError')
        );
      }
    }

    step2Spinner.succeed(t('commands.merge.worktreeMerged'));
    outputSuccess(t('commands.merge.mergeComplete'));

    // 步骤8: 推送处理
    let pushed = false;

    // 检查用户是否显式指定了 --push 或 --no-push 参数
    const explicitPush = process.argv.includes('--push');
    const explicitNoPush = process.argv.includes('--no-push');

    if (explicitPush) {
      // --push: 自动推送
      const pushResult = await pushToRemote(paths.mainDir, mainBranch);
      if (pushResult.success) {
        pushed = true;
      } else {
        displayPushFailed(pushResult.error || t('common.unknownError'), paths.mainDir, mainBranch);
      }
    } else if (!explicitNoPush) {
      // 没有指定 --no-push：询问用户
      const enquirer = new Enquirer({ stdout: process.stderr });
      const response = await enquirer.prompt({
        type: 'confirm',
        name: 'shouldPush',
        message: t('commands.merge.shouldPush'),
        initial: false
      }) as { shouldPush: boolean };

      if (response.shouldPush) {
        const pushResult = await pushToRemote(paths.mainDir, mainBranch);
        if (pushResult.success) {
          pushed = true;
        } else {
          displayPushFailed(pushResult.error || t('common.unknownError'), paths.mainDir, mainBranch);
        }
      }
    }
    // 指定了 --no-push: 不推送，不询问

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

    // 步骤10: 自动更新 worktrees
    if (!options.noUpdate) {
      output('');

      // 拉取主分支最新代码（如果已经 push，则主分支已经是最新的）
      if (!pushed) {
        try {
          await pullMainBranch(paths.mainDir);
        } catch (error) {
          // 拉取失败不影响更新流程，因为本地已经有最新代码
        }
      }

      if (options.updateAll) {
        // --update-all: 更新所有 worktrees（包括当前的）
        output(t('commands.merge.updatingAllWorktrees'));

        const allWorktrees = await discoverWorktrees(paths.mainDir, paths.worktreesDir);

        if (allWorktrees.length > 0) {
          const updateResult = await updateAllWorktrees(
            allWorktrees,
            mainBranch,
            true  // 默认使用 rebase
          );

          displayBatchUpdateResult(updateResult);

          if (updateResult.failed > 0) {
            output('');
            output(t('commands.merge.updatePartialSuccess'));
          }
        }
      } else {
        // 默认：仅更新当前 worktree
        output(t('commands.merge.updatingCurrentWorktree'));

        const updateSpinner = ora({
          text: t('commands.update.updating', { strategy: 'rebase' }),
          stream: process.stderr
        }).start();

        const updateResult = await executeInDirectory(worktree.path, async () => {
          return await updateAllWorktrees([worktree], mainBranch, true);
        });

        if (updateResult.succeeded > 0) {
          updateSpinner.succeed(t('commands.update.updateSuccess'));
        } else if (updateResult.skipped > 0) {
          updateSpinner.warn(t('commands.update.dirtySkipped'));
        } else {
          updateSpinner.fail(t('commands.update.updateFailed'));
          if (updateResult.results[0]?.error) {
            output(t('common.hint') + ': ' + updateResult.results[0].error);
          }
        }
      }
    }

    // 步骤11: 输出 JSON 结果到 stdout（不设置 targetDir，保持在原目录）
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
    .description(t('commands.merge.description'))
    .option('--no-rebase', t('commands.merge.noRebaseOption'))
    .option('--push', t('commands.merge.pushOption'))
    .option('--no-push', t('commands.merge.noPushOption'))
    .option('--no-update', t('commands.merge.noUpdateOption'))
    .option('--update-all', t('commands.merge.updateAllOption'))
    .action(async (target: string | undefined, options: MergeOptions) => {
      await mergeCommand(target, options);
    });
}
