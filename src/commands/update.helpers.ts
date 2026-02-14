import chalk from 'chalk';
import simpleGit from 'simple-git';
import type { WorktreeInfo } from '../types/index.js';
import { ColynError } from '../types/index.js';
import { getRelevantStatusFiles } from '../core/git.js';
import {
  output,
  outputLine,
  outputSuccess,
  outputError,
  outputWarning,
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

  // 非纯数字视为分支名
  return 'branch';
}

/**
 * 自动识别当前 worktree
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
        t('commands.update.cannotAutoDetect'),
        t('commands.update.cannotAutoDetectHint')
      );
    }
    worktree = worktrees.find(w => w.id === worktreeId);
    if (!worktree) {
      throw new ColynError(
        t('commands.update.worktreeNotFound', { id: worktreeId }),
        t('commands.update.worktreeNotFoundHint')
      );
    }
  } else if (targetType === 'id') {
    // 按 ID 查找
    const id = parseInt(target!);
    worktree = worktrees.find(w => w.id === id);
    if (!worktree) {
      throw new ColynError(
        t('commands.update.worktreeNotFound', { id }),
        t('commands.update.branchNotFoundHint')
      );
    }
  } else {
    // 按分支名查找
    worktree = worktrees.find(w => w.branch === target);
    if (!worktree) {
      throw new ColynError(
        t('commands.update.branchNotFound', { branch: target ?? '' }),
        t('commands.update.branchNotFoundHint')
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
      t('commands.update.dirHasUncommitted', { name: dirName }),
      t('commands.update.dirHasUncommittedHint', {
        name: dirName,
        path: dirPath,
        count: changedFiles.length,
        files: filesStr
      })
    );
  }
}

/**
 * 更新结果
 */
export interface UpdateResult {
  success: boolean;
  conflictFiles?: string[];
  error?: string;
}

/**
 * 批量更新结果
 */
export interface BatchUpdateResult {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: Array<{
    worktree: WorktreeInfo;
    success: boolean;
    error?: string;
    skipped?: boolean;
  }>;
}

/**
 * 拉取主分支最新代码
 */
export async function pullMainBranch(mainDir: string, skipPull = false): Promise<void> {
  // 如果指定跳过 pull，直接返回
  if (skipPull) {
    return;
  }

  const git = simpleGit(mainDir);

  try {
    // 检查当前分支是否有上游分支
    try {
      await git.raw(['rev-parse', '--abbrev-ref', '@{upstream}']);
      // 如果命令成功，说明有上游分支，执行 pull
      await git.pull();
    } catch {
      // 没有上游分支，跳过 pull
      return;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new ColynError(
      t('commands.update.pullFailed'),
      t('commands.update.pullFailedHint', { error: errorMessage })
    );
  }
}


/**
 * 使用 rebase 更新 worktree
 */
export async function rebaseWorktree(
  worktreePath: string,
  mainBranch: string
): Promise<UpdateResult> {
  const git = simpleGit(worktreePath);

  try {
    await git.rebase([mainBranch]);

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // 检查是否是冲突
    if (errorMessage.includes('CONFLICT') || errorMessage.includes('could not apply')) {
      // 获取冲突文件列表
      const status = await git.status();
      const conflictFiles = status.conflicted;

      return {
        success: false,
        conflictFiles,
        error: 'rebase_conflict'
      };
    }

    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * 使用 merge 更新 worktree
 */
export async function mergeMainIntoWorktree(
  worktreePath: string,
  mainBranch: string
): Promise<UpdateResult> {
  const git = simpleGit(worktreePath);

  try {
    await git.merge([mainBranch]);

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // 检查是否是冲突
    if (errorMessage.includes('CONFLICT') || errorMessage.includes('Automatic merge failed')) {
      // 获取冲突文件列表
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
 * 更新单个 worktree
 */
export async function updateSingleWorktree(
  worktree: WorktreeInfo,
  mainBranch: string,
  useRebase: boolean
): Promise<UpdateResult> {
  if (useRebase) {
    return rebaseWorktree(worktree.path, mainBranch);
  } else {
    return mergeMainIntoWorktree(worktree.path, mainBranch);
  }
}

/**
 * 批量更新所有 worktree
 */
export async function updateAllWorktrees(
  worktrees: WorktreeInfo[],
  mainBranch: string,
  useRebase: boolean
): Promise<BatchUpdateResult> {
  const results: BatchUpdateResult['results'] = [];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const worktree of worktrees) {
    // 检查工作目录是否干净
    try {
      await checkGitWorkingDirectory(worktree.path, `task-${worktree.id}`);
    } catch {
      // 工作目录不干净，跳过
      results.push({
        worktree,
        success: false,
        skipped: true,
        error: t('commands.update.dirtySkipped')
      });
      skipped++;
      continue;
    }

    // 执行更新
    const result = await updateSingleWorktree(worktree, mainBranch, useRebase);

    if (result.success) {
      results.push({ worktree, success: true });
      succeeded++;
    } else {
      results.push({
        worktree,
        success: false,
        error: result.error === 'rebase_conflict' || result.error === 'merge_conflict'
          ? t('commands.update.hasConflict')
          : result.error
      });
      failed++;
    }
  }

  return {
    total: worktrees.length,
    succeeded,
    failed,
    skipped,
    results
  };
}

/**
 * 显示检测到的 worktree 信息
 */
export function displayWorktreeInfo(worktree: WorktreeInfo): void {
  outputLine();
  outputBold(t('commands.update.detectedWorktree'));
  output(`  ID: ${worktree.id}`);
  output(`  ${t('commands.update.branchLabel')}: ${worktree.branch}`);
  output(`  ${t('commands.update.pathLabel')}: ${worktree.path}`);
  outputLine();
}

/**
 * 显示更新成功信息
 */
export function displayUpdateSuccess(
  mainBranch: string,
  worktreeBranch: string,
  useRebase: boolean
): void {
  outputLine();
  outputSuccess(t('commands.update.updateComplete'));
  output(`  ${t('commands.update.mainBranchLabel', { branch: mainBranch })} → ${worktreeBranch}`);
  output(`  ${t('commands.update.strategyLabel')}: ${useRebase ? 'rebase' : 'merge'}`);
  outputLine();
}

/**
 * 显示 rebase 冲突信息
 */
export function displayRebaseConflict(
  conflictFiles: string[],
  _worktreePath: string
): void {
  outputLine();
  outputError(t('commands.update.rebaseConflictTitle'));
  outputLine();

  outputBold(t('commands.update.conflictFiles'));
  for (const file of conflictFiles) {
    output(`  ${file}`);
  }
  outputLine();

  outputBold(t('commands.update.resolveSteps'));
  outputStep(`  ${t('commands.update.rebaseStep1')}`);
  outputLine();
  outputStep(`  ${t('commands.update.rebaseStep2')}`);
  output('     git add <file>');
  outputLine();
  outputStep(`  ${t('commands.update.rebaseStep3')}`);
  output('     git rebase --continue');
  outputLine();
  outputStep(`  ${t('commands.update.rebaseStep4')}`);
  output('     git rebase --abort');
  outputLine();
}

/**
 * 显示 merge 冲突信息
 */
export function displayMergeConflict(
  conflictFiles: string[],
  _worktreePath: string
): void {
  outputLine();
  outputError(t('commands.update.mergeConflictTitle'));
  outputLine();

  outputBold(t('commands.update.conflictFiles'));
  for (const file of conflictFiles) {
    output(`  ${file}`);
  }
  outputLine();

  outputBold(t('commands.update.resolveSteps'));
  outputStep(`  ${t('commands.update.mergeStep1')}`);
  outputLine();
  outputStep(`  ${t('commands.update.mergeStep2')}`);
  output('     git add <file>');
  outputLine();
  outputStep(`  ${t('commands.update.mergeStep3')}`);
  output('     git commit');
  outputLine();
  outputStep(`  ${t('commands.update.mergeStep4')}`);
  output('     git merge --abort');
  outputLine();
}

/**
 * 显示批量更新结果
 */
export function displayBatchUpdateResult(result: BatchUpdateResult): void {
  outputLine();
  outputBold(t('commands.update.batchResult'));

  if (result.succeeded > 0) {
    outputSuccess(`  ${t('commands.update.batchSucceeded', { count: result.succeeded })}`);
  }
  if (result.failed > 0) {
    outputError(`  ${t('commands.update.batchFailed', { count: result.failed })}`);
  }
  if (result.skipped > 0) {
    outputWarning(`  ${t('commands.update.batchSkipped', { count: result.skipped })}`);
  }
  outputLine();

  // 显示失败和跳过的详情
  const failedResults = result.results.filter(r => !r.success);
  if (failedResults.length > 0) {
    outputBold(t('commands.update.failedDetails'));
    for (const r of failedResults) {
      if (r.skipped) {
        output(`  ${chalk.yellow('○')} task-${r.worktree.id} (${r.worktree.branch}): ${r.error}`);
      } else {
        output(`  ${chalk.red('✗')} task-${r.worktree.id} (${r.worktree.branch}): ${r.error}`);
      }
    }
    outputLine();
  }
}

/**
 * 显示发现的 worktree 列表
 */
export function displayWorktreeList(worktrees: WorktreeInfo[]): void {
  outputBold(t('commands.update.foundWorktrees', { count: worktrees.length }));
  for (const wt of worktrees) {
    output(`  ${wt.id}. task-${wt.id} (${wt.branch})`);
  }
  outputLine();
}
