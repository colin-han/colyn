import chalk from 'chalk';
import ora from 'ora';
import simpleGit from 'simple-git';
import type { WorktreeInfo } from '../types/index.js';
import { ColynError } from '../types/index.js';
import {
  output,
  outputLine,
  outputSuccess,
  outputError,
  outputBold,
  outputStep
} from '../utils/logger.js';
import { discoverWorktrees, getCurrentWorktreeId } from '../core/discovery.js';

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
        '无法自动识别 worktree',
        '请在 worktree 目录中运行此命令，或指定 ID/分支名：\n' +
        '  colyn merge <id>\n' +
        '  colyn merge <branch-name>\n\n' +
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
 * 检查 git 工作目录状态是否干净
 */
export async function checkGitWorkingDirectory(
  dirPath: string,
  dirName: string
): Promise<void> {
  const git = simpleGit(dirPath);
  const status = await git.status();

  if (!status.isClean()) {
    const changedFiles = [
      ...status.modified,
      ...status.created,
      ...status.deleted,
      ...status.renamed.map(r => r.to),
      ...status.not_added
    ];

    throw new ColynError(
      `${dirName}目录有未提交的更改`,
      `${dirName}目录: ${dirPath}\n\n` +
      `变更文件 (${changedFiles.length} 个):\n` +
      changedFiles.slice(0, 5).map(f => `  - ${f}`).join('\n') +
      (changedFiles.length > 5 ? `\n  ... 以及其他 ${changedFiles.length - 5} 个文件` : '') +
      '\n\n提示：\n' +
      `  - 查看状态: cd "${dirPath}" && git status\n` +
      '  - 提交更改: git add . && git commit -m "..."\n' +
      '  - 或者暂存: git stash'
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
 * 执行合并操作
 */
export async function executeMerge(
  mainDir: string,
  branch: string,
  _mainBranch: string
): Promise<MergeResult> {
  const git = simpleGit(mainDir);

  try {
    // 执行合并
    await git.merge([
      '--no-ff',
      branch,
      '-m',
      `Merge branch '${branch}'`
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

    // 检查是否是合并冲突
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
 * 推送到远程仓库
 */
export async function pushToRemote(
  mainDir: string,
  mainBranch: string
): Promise<{ success: boolean; error?: string }> {
  const spinner = ora({ text: '推送到远程仓库...', stream: process.stderr }).start();

  try {
    const git = simpleGit(mainDir);
    await git.push('origin', mainBranch);

    spinner.succeed('已推送到远程仓库');
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    spinner.fail('推送失败');
    return { success: false, error: errorMessage };
  }
}

/**
 * 显示检测到的 worktree 信息
 */
export function displayWorktreeInfo(worktree: WorktreeInfo): void {
  outputLine();
  outputBold('检测到 worktree:');
  output(`  ID: ${worktree.id}`);
  output(`  分支: ${worktree.branch}`);
  output(`  路径: ${worktree.path}`);
  outputLine();
}

/**
 * 显示前置检查结果
 */
export function displayCheckPassed(): void {
  outputSuccess('前置检查通过');
  output(chalk.gray('✓ 主分支工作目录干净'));
  output(chalk.gray('✓ Worktree 工作目录干净'));
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
  pushed: boolean
): void {
  outputLine();
  outputSuccess('合并成功！');
  outputLine();

  outputBold('合并信息：');
  output(`  主分支: ${mainBranch}`);
  output(`  合并分支: ${branch}`);
  output(`  提交: ${commitHash} Merge branch '${branch}'`);
  outputLine();

  if (pushed) {
    outputSuccess('合并完成并已推送到远程！');
  } else {
    outputSuccess('合并完成！');
    output(chalk.gray('提示：可稍后手动推送：'));
    output(chalk.gray(`  cd "${mainDir}" && git push`));
  }

  outputLine();
  outputBold('后续操作：');
  outputStep('  1. 查看合并后的代码：');
  output(`     cd "${mainDir}"`);
  outputLine();
  outputStep('  2. 如需继续使用 worktree：');
  output(`     cd "${worktreePath}"`);
  outputLine();
  outputStep('  3. 如需删除 worktree：');
  output(`     colyn remove ${worktreeId}  (待实现)`);
  outputLine();
}

/**
 * 显示合并冲突信息
 */
export function displayMergeConflict(
  conflictFiles: string[],
  mainDir: string,
  mainBranch: string
): void {
  outputLine();
  outputError('合并时发生冲突');
  outputLine();

  outputBold('冲突文件：');
  for (const file of conflictFiles) {
    output(`  ${file}`);
  }
  outputLine();

  outputBold('解决步骤：');
  outputStep('  1. 在主分支目录手动解决冲突：');
  output(`     cd "${mainDir}"`);
  outputLine();
  outputStep('  2. 编辑冲突文件，解决冲突标记');
  outputLine();
  outputStep('  3. 添加已解决的文件：');
  output('     git add <file>');
  outputLine();
  outputStep('  4. 完成合并：');
  output('     git commit');
  outputLine();
  outputStep('  5. 可选：推送到远程');
  output(`     git push origin ${mainBranch}`);
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
  outputError('推送到远程仓库失败');
  output(chalk.gray(`错误信息: ${error}`));
  outputLine();
  output('本地合并已完成，可稍后手动推送：');
  output(`  cd "${mainDir}" && git push origin ${mainBranch}`);
  outputLine();
}
