import type { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import simpleGit from 'simple-git';
import Enquirer from 'enquirer';
const { prompt } = Enquirer;
import chalk from 'chalk';
import ora from 'ora';
import type { CommandResult } from '../types/index.js';
import { ColynError } from '../types/index.js';
import {
  formatError,
  output,
  outputLine,
  outputResult,
  outputSuccess,
  outputBold
} from '../utils/logger.js';
import {
  getProjectPaths,
  validateProjectInitialized,
  getLocationInfo
} from '../core/paths.js';
import {
  getMainBranch,
  discoverWorktrees
} from '../core/discovery.js';
import {
  findWorktreeTarget,
  checkGitWorkingDirectory
} from './merge.helpers.js';

/**
 * 检查分支是否已合并到主分支
 */
async function isBranchMerged(
  worktreePath: string,
  branch: string,
  mainBranch: string
): Promise<boolean> {
  try {
    const git = simpleGit(worktreePath);
    // 获取已合并到主分支的分支列表
    const result = await git.raw(['branch', '--merged', mainBranch]);
    const mergedBranches = result
      .split('\n')
      .map(b => b.trim().replace(/^\*\s*/, ''))
      .filter(b => b.length > 0);

    return mergedBranches.includes(branch);
  } catch {
    // 如果检查失败，假设未合并
    return false;
  }
}

/**
 * 检查分支是否被其他 worktree 使用
 */
async function isBranchUsedByOtherWorktree(
  mainDir: string,
  worktreesDir: string,
  targetBranch: string,
  currentWorktreeId: number
): Promise<{ used: boolean; worktreeId?: number; worktreePath?: string }> {
  const worktrees = await discoverWorktrees(mainDir, worktreesDir);

  for (const wt of worktrees) {
    if (wt.id !== currentWorktreeId && wt.branch === targetBranch) {
      return {
        used: true,
        worktreeId: wt.id,
        worktreePath: wt.path
      };
    }
  }

  return { used: false };
}

/**
 * 处理分支：检查本地、远程或创建新分支
 */
async function processBranch(
  worktreePath: string,
  targetBranch: string
): Promise<{ action: 'switch' | 'track' | 'create'; remoteBranch?: string }> {
  const git = simpleGit(worktreePath);

  // 检查本地分支是否存在
  const localBranches = await git.branchLocal();
  if (localBranches.all.includes(targetBranch)) {
    return { action: 'switch' };
  }

  // 检查远程分支是否存在
  try {
    await git.fetch(['--all']);
    const remoteBranches = await git.branch(['-r']);
    const remoteRef = remoteBranches.all.find(
      b => b.endsWith(`/${targetBranch}`) || b === `origin/${targetBranch}`
    );

    if (remoteRef) {
      return { action: 'track', remoteBranch: remoteRef };
    }
  } catch {
    // fetch 失败时继续，可能没有远程
  }

  // 分支不存在，需要创建
  return { action: 'create' };
}

/**
 * 归档日志文件
 */
async function archiveLogs(
  worktreePath: string,
  oldBranch: string
): Promise<{ archived: boolean; count: number }> {
  const logsDir = path.join(worktreePath, '.claude', 'logs');
  const archivedDir = path.join(logsDir, 'archived');

  try {
    // 检查 logs 目录是否存在
    await fs.access(logsDir);
  } catch {
    // logs 目录不存在，不需要归档
    return { archived: false, count: 0 };
  }

  // 读取 logs 目录内容
  const entries = await fs.readdir(logsDir, { withFileTypes: true });

  // 过滤掉 archived 目录
  const toArchive = entries.filter(e => e.name !== 'archived');

  if (toArchive.length === 0) {
    return { archived: false, count: 0 };
  }

  // 创建归档目标目录
  // 将分支名中的 / 替换为 -，避免创建嵌套目录
  const safeBranchName = oldBranch.replace(/\//g, '-');
  const targetDir = path.join(archivedDir, safeBranchName);

  await fs.mkdir(targetDir, { recursive: true });

  // 移动文件和目录
  let count = 0;
  for (const entry of toArchive) {
    const srcPath = path.join(logsDir, entry.name);
    let destPath = path.join(targetDir, entry.name);

    // 如果目标已存在，添加时间戳后缀
    try {
      await fs.access(destPath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const ext = path.extname(entry.name);
      const base = path.basename(entry.name, ext);
      destPath = path.join(targetDir, `${base}-${timestamp}${ext}`);
    } catch {
      // 目标不存在，使用原名
    }

    await fs.rename(srcPath, destPath);
    count++;
  }

  return { archived: true, count };
}

/**
 * Checkout 命令：在 worktree 中切换分支
 */
async function checkoutCommand(
  target: string | undefined,
  branch: string
): Promise<void> {
  try {
    // 步骤1: 获取项目路径并验证
    const paths = await getProjectPaths();
    await validateProjectInitialized(paths);

    // 步骤2: 确定目标 worktree
    let worktree;

    if (target === undefined) {
      // 没有指定 target，尝试使用当前目录
      try {
        const location = await getLocationInfo();
        if (location.isMainBranch) {
          throw new ColynError(
            '当前在主分支目录中',
            '请指定 worktree ID，或切换到 worktree 目录后执行：\n' +
            '  colyn checkout <worktree-id> <branch>\n' +
            '  colyn list  # 查看所有 worktree'
          );
        }
        // 使用当前 worktree
        worktree = await findWorktreeTarget(
          String(location.worktreeId),
          paths.mainDir,
          paths.worktreesDir
        );
      } catch (error) {
        if (error instanceof ColynError) {
          throw error;
        }
        throw new ColynError(
          '无法确定目标 worktree',
          '请指定 worktree ID：\n' +
          '  colyn checkout <worktree-id> <branch>\n' +
          '  colyn list  # 查看所有 worktree'
        );
      }
    } else {
      // 指定了 target，查找 worktree
      worktree = await findWorktreeTarget(
        target,
        paths.mainDir,
        paths.worktreesDir
      );
    }

    const currentBranch = worktree.branch;

    // 如果已经在目标分支上
    if (currentBranch === branch) {
      output(chalk.yellow(`已经在分支 ${branch} 上`));
      outputResult({
        success: true,
        targetDir: worktree.path,
        displayPath: `worktrees/task-${worktree.id}`
      });
      return;
    }

    // 步骤3: 检查未提交更改
    const checkSpinner = ora({ text: '检查工作目录状态...', stream: process.stderr }).start();

    try {
      await checkGitWorkingDirectory(worktree.path, `task-${worktree.id}`);
      checkSpinner.succeed('工作目录干净');
    } catch (error) {
      checkSpinner.fail('工作目录有未提交的更改');
      throw error;
    }

    // 步骤4: 检查目标是否为主分支
    const mainBranch = await getMainBranch(paths.mainDir);
    if (branch === mainBranch || branch === 'main' || branch === 'master') {
      throw new ColynError(
        '不能在 worktree 中切换到主分支',
        `请直接使用主分支目录：\n  cd "${paths.mainDir}"`
      );
    }

    // 步骤5: 检查分支是否被其他 worktree 使用
    const branchUsage = await isBranchUsedByOtherWorktree(
      paths.mainDir,
      paths.worktreesDir,
      branch,
      worktree.id
    );

    if (branchUsage.used) {
      throw new ColynError(
        `分支 ${branch} 已在 task-${branchUsage.worktreeId} 中使用`,
        `请直接切换到该 worktree 目录工作：\n  cd "${branchUsage.worktreePath}"`
      );
    }

    // 步骤6: 检查当前分支是否已合并到主分支
    const merged = await isBranchMerged(worktree.path, currentBranch, mainBranch);

    if (!merged) {
      outputLine();
      output(chalk.yellow(`⚠ 当前分支 ${currentBranch} 尚未合并到主分支`));
      outputLine();
      output('如果切换分支，这些更改将保留在原分支上。');
      outputLine();

      const response = await prompt<{ confirm: boolean }>({
        type: 'confirm',
        name: 'confirm',
        message: '是否继续切换？',
        initial: false,
        stdout: process.stderr
      });

      if (!response.confirm) {
        output(chalk.gray('已取消切换'));
        outputResult({ success: false });
        process.exit(4);
      }
    }

    // 步骤7: 处理分支
    const branchInfo = await processBranch(worktree.path, branch);
    const git = simpleGit(worktree.path);

    // 步骤8: 归档日志
    const archiveResult = await archiveLogs(worktree.path, currentBranch);

    // 步骤9: 执行切换
    const switchSpinner = ora({ text: `切换到分支 ${branch}...`, stream: process.stderr }).start();

    try {
      if (branchInfo.action === 'switch') {
        await git.checkout(branch);
        switchSpinner.succeed(`已切换到分支 ${branch}`);
      } else if (branchInfo.action === 'track') {
        await git.checkout(['-b', branch, '--track', branchInfo.remoteBranch!]);
        switchSpinner.succeed(`已切换到分支 ${branch}（跟踪 ${branchInfo.remoteBranch}）`);
      } else {
        await git.checkout(['-b', branch]);
        switchSpinner.succeed(`已创建并切换到新分支 ${branch}`);
      }
    } catch (error) {
      switchSpinner.fail('切换分支失败');
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new ColynError('Git checkout 失败', errorMessage);
    }

    // 步骤10: 如果旧分支已合并，提示删除
    let oldBranchDeleted = false;
    if (merged) {
      outputLine();
      output(chalk.green(`✓ 分支 ${currentBranch} 已合并到主分支`));

      const deleteResponse = await prompt<{ deleteOldBranch: boolean }>({
        type: 'confirm',
        name: 'deleteOldBranch',
        message: `是否删除旧分支 ${currentBranch}？`,
        initial: true,
        stdout: process.stderr
      });

      if (deleteResponse.deleteOldBranch) {
        const deleteSpinner = ora({ text: `删除分支 ${currentBranch}...`, stream: process.stderr }).start();
        try {
          await git.branch(['-d', currentBranch]);
          deleteSpinner.succeed(`已删除分支 ${currentBranch}`);
          oldBranchDeleted = true;
        } catch (error) {
          deleteSpinner.fail(`删除分支失败`);
          const errorMessage = error instanceof Error ? error.message : String(error);
          output(chalk.yellow(`提示: ${errorMessage}`));
          output(chalk.gray(`可稍后手动删除: git branch -d ${currentBranch}`));
        }
      }
    }

    // 步骤11: 显示结果
    outputLine();
    outputSuccess(`已切换到分支 ${branch}`);

    if (archiveResult.archived) {
      const safeBranchName = currentBranch.replace(/\//g, '-');
      output(chalk.gray(`日志已归档到: .claude/logs/archived/${safeBranchName}/ (${archiveResult.count} 项)`));
    }

    if (oldBranchDeleted) {
      output(chalk.gray(`旧分支 ${currentBranch} 已删除`));
    }

    outputLine();
    outputBold('当前状态：');
    output(`  Worktree: task-${worktree.id}`);
    output(`  分支: ${branch}`);
    output(`  路径: ${worktree.path}`);
    outputLine();

    // 步骤12: 输出 JSON 结果
    const result: CommandResult = {
      success: true,
      targetDir: worktree.path,
      displayPath: `worktrees/task-${worktree.id}`
    };

    outputResult(result);

  } catch (error) {
    formatError(error);
    outputResult({ success: false });
    process.exit(1);
  }
}

/**
 * 注册 checkout 命令
 */
export function register(program: Command): void {
  // 主命令 - 使用 variadic 参数处理
  program
    .command('checkout <args...>')
    .description('在 worktree 中切换分支')
    .action(async (args: string[]) => {
      let target: string | undefined;
      let branch: string;

      if (args.length === 1) {
        // 只有分支名
        branch = args[0];
      } else if (args.length === 2) {
        // worktree-id 和分支名
        target = args[0];
        branch = args[1];
      } else {
        throw new ColynError(
          '参数错误',
          '用法: colyn checkout [worktree-id] <branch>'
        );
      }

      await checkoutCommand(target, branch);
    });

  // 别名 co
  program
    .command('co <args...>')
    .description('checkout 的别名')
    .action(async (args: string[]) => {
      let target: string | undefined;
      let branch: string;

      if (args.length === 1) {
        branch = args[0];
      } else if (args.length === 2) {
        target = args[0];
        branch = args[1];
      } else {
        throw new ColynError(
          '参数错误',
          '用法: colyn co [worktree-id] <branch>'
        );
      }

      await checkoutCommand(target, branch);
    });
}
