import chalk from 'chalk';
import ora from 'ora';
import simpleGit from 'simple-git';
import type { WorktreeInfo } from '../types/index.js';
import { ColynError } from '../types/index.js';
import { getRelevantStatusFiles } from '../core/git.js';
import {
  output,
  outputLine,
  outputSuccess,
  outputError,
  outputBold,
  outputStep
} from '../utils/logger.js';
import { discoverWorktrees, getCurrentWorktreeId } from '../core/discovery.js';
import { t } from '../i18n/index.js';

/**
 * 识别目标类型
 */
export type TargetType = 'id' | 'branch' | 'auto';

/**
 * 判断目标参数类型
 */
export function identifyTargetType(target: string | undefined): TargetType {
  if (!target) {
    return 'auto';
  }

  // 纯数字视为 ID
  if (/^\d+$/.test(target)) {
    return 'id';
  }

  // 包含任何字符视为分支名
  return 'branch';
}

/**
 * 自动识别当前 worktree
 * 使用 getCurrentWorktreeId 验证目录名与 .env.local 配置一致
 */
export async function autoDetectWorktree(): Promise<number | null> {
  return getCurrentWorktreeId();
}

/**
 * 根据目标参数查找 worktree
 */
export async function findWorktreeTarget(
  target: string | undefined,
  mainDir: string,
  worktreesDir: string
): Promise<WorktreeInfo> {
  const worktrees = await discoverWorktrees(mainDir, worktreesDir);
  const targetType = identifyTargetType(target);

  let worktree: WorktreeInfo | undefined;

  if (targetType === 'auto') {
    // 自动识别当前 worktree
    const worktreeId = await autoDetectWorktree();
    if (worktreeId === null) {
      throw new ColynError(
        t('commands.merge.cannotAutoDetect'),
        t('commands.merge.cannotAutoDetectHint')
      );
    }
    worktree = worktrees.find(w => w.id === worktreeId);
    if (!worktree) {
      throw new ColynError(
        t('commands.merge.worktreeNotFound', { id: worktreeId }),
        t('commands.merge.worktreeNotFoundHint')
      );
    }
  } else if (targetType === 'id') {
    // 按 ID 查找
    const id = parseInt(target!);
    worktree = worktrees.find(w => w.id === id);
    if (!worktree) {
      throw new ColynError(
        t('commands.merge.worktreeNotFound', { id }),
        t('commands.merge.branchNotFoundHint')
      );
    }
  } else {
    // 按分支名查找
    worktree = worktrees.find(w => w.branch === target);
    if (!worktree) {
      throw new ColynError(
        t('commands.merge.branchNotFound', { branch: target ?? '' }),
        t('commands.merge.branchNotFoundHint')
      );
    }
  }

  return worktree;
}

/**
 * 检查 git 工作目录状态是否干净
 */
export async function checkGitWorkingDirectory(
  dirPath: string,
  dirName: string
): Promise<void> {
  const git = simpleGit(dirPath);
  const status = await git.status();
  const changedFiles = getRelevantStatusFiles(status);

  if (changedFiles.length > 0) {
    const filesStr = changedFiles.slice(0, 5).map(f => `  - ${f}`).join('\n') +
      (changedFiles.length > 5 ? `\n  ... ${t('commands.remove.moreFiles', { count: changedFiles.length - 5 })}` : '');

    throw new ColynError(
      t('commands.merge.dirHasUncommitted', { name: dirName }),
      t('commands.merge.dirHasUncommittedHint', {
        name: dirName,
        path: dirPath,
        count: changedFiles.length,
        files: filesStr
      })
    );
  }
}

/**
 * 合并结果
 */
export interface MergeResult {
  success: boolean;
  commitHash?: string;
  conflictFiles?: string[];
  error?: string;
}

/**
 * 在 worktree 中更新主分支代码（默认使用 rebase，可选 merge）
 * 这一步确保 worktree 包含主分支的所有更改
 */
export async function mergeMainIntoWorktree(
  worktreePath: string,
  mainBranch: string,
  useRebase: boolean = true
): Promise<MergeResult> {
  const git = simpleGit(worktreePath);

  try {
    if (useRebase) {
      // 使用 rebase
      await git.rebase([mainBranch]);
    } else {
      // 使用 merge（允许 fast-forward）
      await git.merge([mainBranch]);
    }

    // 获取最新的 commit hash
    const log = await git.log({ n: 1 });
    const commitHash = log.latest?.hash?.substring(0, 7) || 'unknown';

    return {
      success: true,
      commitHash
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // 检查是否是冲突
    if (useRebase) {
      // rebase 冲突
      if (errorMessage.includes('CONFLICT') || errorMessage.includes('could not apply')) {
        const status = await git.status();
        const conflictFiles = status.conflicted;

        return {
          success: false,
          conflictFiles,
          error: 'rebase_conflict'
        };
      }
    } else {
      // merge 冲突
      if (errorMessage.includes('CONFLICT') || errorMessage.includes('Automatic merge failed')) {
        const status = await git.status();
        const conflictFiles = status.conflicted;

        return {
          success: false,
          conflictFiles,
          error: 'merge_conflict'
        };
      }
    }

    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * 在主分支中合并 worktree 分支（使用 --no-ff）
 * 此时 worktree 已经包含主分支的所有更改，理论上不会有冲突
 */
export async function mergeWorktreeIntoMain(
  mainDir: string,
  worktreeBranch: string
): Promise<MergeResult> {
  const git = simpleGit(mainDir);

  try {
    // 执行合并（使用 --no-ff 保持清晰的分支历史）
    await git.merge([
      '--no-ff',
      worktreeBranch,
      '-m',
      `Merge branch '${worktreeBranch}'`
    ]);

    // 获取合并后的 commit hash
    const log = await git.log({ n: 1 });
    const commitHash = log.latest?.hash?.substring(0, 7) || 'unknown';

    return {
      success: true,
      commitHash
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // 检查是否是合并冲突（理论上不应该发生）
    if (errorMessage.includes('CONFLICT') || errorMessage.includes('Automatic merge failed')) {
      const status = await git.status();
      const conflictFiles = status.conflicted;

      return {
        success: false,
        conflictFiles,
        error: 'merge_conflict'
      };
    }

    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * 执行合并操作（保留用于向后兼容，但不推荐使用）
 * @deprecated 请使用 mergeMainIntoWorktree 和 mergeWorktreeIntoMain
 */
export async function executeMerge(
  mainDir: string,
  branch: string,
  _mainBranch: string
): Promise<MergeResult> {
  return mergeWorktreeIntoMain(mainDir, branch);
}

/**
 * 推送到远程仓库
 */
export async function pushToRemote(
  mainDir: string,
  mainBranch: string
): Promise<{ success: boolean; error?: string }> {
  const spinner = ora({ text: t('commands.merge.pushToRemote'), stream: process.stderr }).start();

  try {
    const git = simpleGit(mainDir);
    await git.push('origin', mainBranch);

    spinner.succeed(t('commands.merge.pushed'));
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    spinner.fail(t('commands.merge.pushFailed'));
    return { success: false, error: errorMessage };
  }
}

/**
 * 显示检测到的 worktree 信息
 */
export function displayWorktreeInfo(worktree: WorktreeInfo): void {
  outputLine();
  outputBold(t('commands.merge.detectedWorktree'));
  output(`  ID: ${worktree.id}`);
  output(`  ${t('commands.merge.detectedBranchLabel')}: ${worktree.branch}`);
  output(`  ${t('commands.merge.detectedPathLabel')}: ${worktree.path}`);
  outputLine();
}

/**
 * 显示前置检查结果
 */
export function displayCheckPassed(): void {
  outputSuccess(t('commands.merge.preCheckPassed'));
  output(chalk.gray(t('commands.merge.mainDirClean')));
  output(chalk.gray(t('commands.merge.worktreeDirClean')));
  outputLine();
}

/**
 * 显示合并成功信息
 */
export function displayMergeSuccess(
  mainBranch: string,
  branch: string,
  commitHash: string,
  mainDir: string,
  worktreePath: string,
  worktreeId: number,
  pushed: boolean,
  verbose: boolean = false
): void {
  outputLine();
  outputSuccess(t('commands.merge.mergeSuccess'));

  if (pushed) {
    output(chalk.gray(t('commands.merge.mergeAndPushed')));
  }

  if (verbose) {
    outputLine();

    outputBold(t('commands.merge.mergeInfo'));
    output(`  ${t('commands.merge.mainBranchLabel', { branch: mainBranch })}`);
    output(`  ${t('commands.merge.mergeBranchLabel', { branch })}`);
    output(`  ${t('commands.merge.commitLabel', { hash: commitHash, branch })}`);
    outputLine();

    if (!pushed) {
      output(chalk.gray(t('commands.merge.pushLaterHint')));
      output(chalk.gray(`  cd "${mainDir}" && git push`));
      outputLine();
    }

    outputBold(t('commands.merge.nextSteps'));
    outputStep(`  ${t('commands.merge.step1ViewCode')}`);
    output(`     cd "${mainDir}"`);
    outputLine();
    outputStep(`  ${t('commands.merge.step2ContinueWorktree')}`);
    output(`     cd "${worktreePath}"`);
    outputLine();
    outputStep(`  ${t('commands.merge.step3RemoveWorktree')}`);
    output(`     colyn remove ${worktreeId}`);
  }

  outputLine();
}

/**
 * 显示合并冲突信息（在 worktree 中解决）
 */
export function displayMergeConflict(
  conflictFiles: string[],
  worktreePath: string,
  worktreeBranch: string,
  mainBranch: string,
  isRebase: boolean = false
): void {
  outputLine();
  outputError(t('commands.merge.conflictTitle', { main: mainBranch, branch: worktreeBranch }));
  outputLine();

  outputBold(t('commands.merge.conflictFiles'));
  for (const file of conflictFiles) {
    output(`  ${file}`);
  }
  outputLine();

  outputBold(t('commands.merge.resolveSteps'));
  outputStep(`  ${t('commands.merge.resolveStep1')}`);
  output(`     cd "${worktreePath}"`);
  outputLine();
  outputStep(`  ${t('commands.merge.resolveStep2')}`);
  outputLine();
  outputStep(`  ${t('commands.merge.resolveStep3')}`);
  output('     git add <file>');
  outputLine();

  if (isRebase) {
    // rebase 冲突的解决步骤
    outputStep(`  ${t('commands.merge.resolveStep4Rebase')}`);
    output('     git rebase --continue');
    outputLine();
    outputStep(`  ${t('commands.merge.resolveStep4RebaseAbort')}`);
    output('     git rebase --abort');
  } else {
    // merge 冲突的解决步骤
    outputStep(`  ${t('commands.merge.resolveStep4')}`);
    output('     git commit');
  }
  outputLine();
  outputStep(`  ${t('commands.merge.resolveStep5')}`);
  output(`     colyn merge ${worktreeBranch}`);
  outputLine();
}

/**
 * 显示推送失败信息
 */
export function displayPushFailed(
  error: string,
  mainDir: string,
  mainBranch: string
): void {
  outputLine();
  outputError(t('commands.merge.pushFailedTitle'));
  output(chalk.gray(t('commands.merge.pushFailedError', { error })));
  outputLine();
  output(t('commands.merge.pushFailedHint'));
  output(`  cd "${mainDir}" && git push origin ${mainBranch}`);
  outputLine();
}
