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
        '无法自动识别 worktree',
        '请在 worktree 目录中运行此命令，或指定 ID/分支名：\n' +
        '  colyn remove <id>\n' +
        '  colyn remove <branch-name>\n\n' +
        '查看所有 worktree：\n' +
        '  colyn list'
      );
    }
    worktree = worktrees.find(w => w.id === worktreeId);
    if (!worktree) {
      throw new ColynError(
        `找不到 ID 为 ${worktreeId} 的 worktree`,
        '当前目录的 .env.local 中 WORKTREE 值可能已过期\n\n' +
        '查看所有 worktree：\n' +
        '  colyn list'
      );
    }
  } else if (targetType === 'id') {
    // 按 ID 查找
    const id = parseInt(target!);
    worktree = worktrees.find(w => w.id === id);
    if (!worktree) {
      throw new ColynError(
        `找不到 ID 为 ${id} 的 worktree`,
        '查看所有 worktree：\n' +
        '  colyn list'
      );
    }
  } else {
    // 按分支名查找
    worktree = worktrees.find(w => w.branch === target);
    if (!worktree) {
      throw new ColynError(
        `找不到分支 "${target}" 对应的 worktree`,
        '查看所有 worktree：\n' +
        '  colyn list'
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
  outputBold('将要删除的 worktree:');
  output(`  ID: ${worktree.id}`);
  output(`  分支: ${worktree.branch}`);
  output(`  路径: ${worktree.path}`);
  output(`  端口: ${worktree.port}`);
  outputLine();
}

/**
 * 显示未提交更改警告
 */
export function displayUncommittedChanges(changedFiles: string[]): void {
  outputWarning('检测到未提交的更改');
  outputLine();
  outputBold('变更文件:');
  for (const file of changedFiles.slice(0, 5)) {
    output(`  - ${file}`);
  }
  if (changedFiles.length > 5) {
    output(`  ... 以及其他 ${changedFiles.length - 5} 个文件`);
  }
  outputLine();
}

/**
 * 显示未合并警告
 */
export function displayUnmergedWarning(branch: string, mainBranch: string): void {
  outputWarning(`分支 "${branch}" 尚未合并到 ${mainBranch}`);
  output(chalk.gray('  删除后可能丢失未合并的更改'));
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
  outputSuccess('Worktree 已删除');
  outputLine();

  outputBold('删除信息:');
  output(`  ID: ${worktree.id}`);
  output(`  分支: ${worktree.branch}${branchDeleted ? ' (已删除)' : ' (保留)'}`);
  output(`  路径: ${worktree.path}`);
  outputLine();

  if (switchedToMain) {
    outputStep('已自动切换到主分支目录:');
    output(`  ${mainDir}`);
    outputLine();
  }
}
