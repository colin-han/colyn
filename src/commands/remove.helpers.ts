import chalk from 'chalk';
import simpleGit from 'simple-git';
import type { WorktreeInfo } from '../types/index.js';
import { ColynError } from '../types/index.js';
import {
  output,
  outputLine,
  outputSuccess,
  outputWarning,
  outputBold,
  outputStep
} from '../utils/logger.js';
import { discoverWorktrees, getCurrentWorktreeId, getMainBranch } from '../core/discovery.js';
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
    const worktreeId = await getCurrentWorktreeId();
    if (worktreeId === null) {
      throw new ColynError(
        t('commands.remove.cannotAutoDetect'),
        t('commands.remove.cannotAutoDetectHint')
      );
    }
    worktree = worktrees.find(w => w.id === worktreeId);
    if (!worktree) {
      throw new ColynError(
        t('commands.remove.worktreeNotFound', { id: worktreeId }),
        t('commands.remove.worktreeNotFoundHint')
      );
    }
  } else if (targetType === 'id') {
    // 按 ID 查找
    const id = parseInt(target!);
    worktree = worktrees.find(w => w.id === id);
    if (!worktree) {
      throw new ColynError(
        t('commands.remove.worktreeNotFound', { id }),
        t('commands.remove.branchNotFoundHint')
      );
    }
  } else {
    // 按分支名查找
    worktree = worktrees.find(w => w.branch === target);
    if (!worktree) {
      throw new ColynError(
        t('commands.remove.branchNotFound', { branch: target ?? '' }),
        t('commands.remove.branchNotFoundHint')
      );
    }
  }

  return worktree;
}

/**
 * 检查 worktree 是否有未提交的更改
 */
export async function checkUncommittedChanges(
  worktreePath: string
): Promise<{ hasChanges: boolean; changedFiles: string[] }> {
  const git = simpleGit(worktreePath);
  const status = await git.status();

  if (status.isClean()) {
    return { hasChanges: false, changedFiles: [] };
  }

  const changedFiles = [
    ...status.modified,
    ...status.created,
    ...status.deleted,
    ...status.renamed.map(r => r.to),
    ...status.not_added
  ];

  return { hasChanges: true, changedFiles };
}

/**
 * 检查分支是否已合并到主分支
 */
export async function checkBranchMerged(
  mainDir: string,
  branch: string
): Promise<boolean> {
  const git = simpleGit(mainDir);
  const mainBranch = await getMainBranch(mainDir);

  try {
    // 获取已合并到主分支的分支列表
    const result = await git.raw(['branch', '--merged', mainBranch]);
    const mergedBranches = result
      .split('\n')
      .map(b => b.trim().replace(/^\* /, ''))
      .filter(b => b.length > 0);

    return mergedBranches.includes(branch);
  } catch {
    // 如果检查失败，假设未合并
    return false;
  }
}

/**
 * 检查当前目录是否在指定 worktree 内部
 */
export function isCurrentDirInWorktree(worktreePath: string): boolean {
  const cwd = process.cwd();
  // 规范化路径，确保比较正确
  const normalizedCwd = cwd.replace(/\/$/, '');
  const normalizedWorktreePath = worktreePath.replace(/\/$/, '');

  return normalizedCwd === normalizedWorktreePath ||
         normalizedCwd.startsWith(normalizedWorktreePath + '/');
}

/**
 * 执行 worktree 删除
 */
export async function executeWorktreeRemove(
  mainDir: string,
  worktreePath: string,
  force: boolean
): Promise<{ success: boolean; error?: string }> {
  const git = simpleGit(mainDir);

  try {
    const args = ['worktree', 'remove'];
    if (force) {
      args.push('--force');
    }
    args.push(worktreePath);

    await git.raw(args);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * 删除本地分支
 */
export async function deleteLocalBranch(
  mainDir: string,
  branch: string,
  force: boolean
): Promise<{ success: boolean; error?: string }> {
  const git = simpleGit(mainDir);

  try {
    const args = ['branch'];
    args.push(force ? '-D' : '-d');
    args.push(branch);

    await git.raw(args);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * 显示 worktree 信息
 */
export function displayWorktreeInfo(worktree: WorktreeInfo): void {
  outputLine();
  outputBold(t('commands.remove.toBeDeleted'));
  output(`  ID: ${worktree.id}`);
  output(`  ${t('commands.add.infoBranch', { branch: '' }).replace(': ', '')}: ${worktree.branch}`);
  output(`  ${t('commands.add.infoPath', { path: '' }).replace(': ', '')}: ${worktree.path}`);
  output(`  ${t('commands.add.infoPort', { port: '' }).replace(': ', '')}: ${worktree.port}`);
  outputLine();
}

/**
 * 显示未提交更改警告
 */
export function displayUncommittedChanges(changedFiles: string[]): void {
  outputWarning(t('commands.remove.uncommittedChanges'));
  outputLine();
  outputBold(t('commands.remove.changedFiles'));
  for (const file of changedFiles.slice(0, 5)) {
    output(`  - ${file}`);
  }
  if (changedFiles.length > 5) {
    output(`  ${t('commands.remove.moreFiles', { count: changedFiles.length - 5 })}`);
  }
  outputLine();
}

/**
 * 显示未合并警告
 */
export function displayUnmergedWarning(branch: string, mainBranch: string): void {
  outputWarning(t('commands.remove.unmergedWarning', { branch, main: mainBranch }));
  output(chalk.gray(`  ${t('commands.remove.unmergedWarningHint')}`));
  outputLine();
}

/**
 * 显示删除成功信息
 */
export function displayRemoveSuccess(
  worktree: WorktreeInfo,
  branchDeleted: boolean,
  switchedToMain: boolean,
  mainDir: string
): void {
  outputLine();
  outputSuccess(t('commands.remove.successTitle'));
  outputLine();

  outputBold(t('commands.remove.deleteInfo'));
  output(`  ID: ${worktree.id}`);
  const branchStatus = branchDeleted ? t('commands.remove.branchStatusDeleted') : t('commands.remove.branchStatusKept');
  output(`  ${t('commands.remove.branchStatus', { branch: worktree.branch, status: branchStatus })}`);
  output(`  ${t('commands.add.infoPath', { path: '' }).replace(': ', '')}: ${worktree.path}`);
  outputLine();

  if (switchedToMain) {
    outputStep(t('commands.remove.switchedToMain'));
    output(`  ${mainDir}`);
    outputLine();
  }
}
