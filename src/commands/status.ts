import type { Command } from 'commander';
import chalk from 'chalk';
import simpleGit from 'simple-git';
import { getLocationInfo } from '../core/paths.js';
import { getMainBranch } from '../core/discovery.js';
import { ColynError } from '../types/index.js';
import { output, formatError } from '../utils/logger.js';
import { t } from '../i18n/index.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Git 状态信息
 */
interface GitStatusInfo {
  modified: number;
  staged: number;
  untracked: number;
  ahead: number;
  behind: number;
}

/**
 * 获取 git 状态
 */
async function getGitStatus(dir: string, mainBranch: string): Promise<GitStatusInfo> {
  const git = simpleGit(dir);
  const status = await git.status();

  // 获取与主分支的差异
  let ahead = 0;
  let behind = 0;

  try {
    const currentBranch = status.current;
    if (currentBranch && currentBranch !== mainBranch) {
      // 获取与主分支的提交差异
      const revList = await git.raw(['rev-list', '--left-right', '--count', `${mainBranch}...${currentBranch}`]);
      const [behindStr, aheadStr] = revList.trim().split(/\s+/);
      behind = parseInt(behindStr) || 0;
      ahead = parseInt(aheadStr) || 0;
    }
  } catch {
    // 忽略错误，使用默认值 0
  }

  return {
    modified: status.modified.length + status.deleted.length + status.renamed.length,
    staged: status.staged.length,
    untracked: status.not_added.length,
    ahead,
    behind
  };
}

/**
 * 获取端口号
 */
function getPort(dir: string): number | null {
  try {
    const envLocalPath = path.join(dir, '.env.local');
    if (!fs.existsSync(envLocalPath)) {
      return null;
    }

    const content = fs.readFileSync(envLocalPath, 'utf-8');
    const portMatch = content.match(/^PORT=(\d+)/m);
    if (portMatch) {
      return parseInt(portMatch[1]);
    }
  } catch {
    // 忽略错误
  }
  return null;
}

/**
 * status 命令主函数
 */
async function statusCommand(): Promise<void> {
  try {
    // 获取当前位置信息
    const info = await getLocationInfo();

    // 获取主分支名称
    const mainBranch = await getMainBranch(info.mainBranchPath);

    // 获取 git 状态
    const gitStatus = await getGitStatus(info.worktreePath, mainBranch);

    // 获取端口
    const port = getPort(info.worktreePath);

    // 显示信息
    output('');

    // 位置信息
    if (info.isMainBranch) {
      output(chalk.bold(t('commands.status.location')) + ': ' +
        chalk.cyan(info.project) + chalk.gray(' / ') +
        chalk.yellow(t('commands.info.mainIndicator')));
    } else {
      output(chalk.bold(t('commands.status.location')) + ': ' +
        chalk.cyan(info.project) + chalk.gray(' / ') +
        chalk.yellow(`#${info.worktreeId}`));
    }

    // 分支信息
    output(chalk.bold(t('commands.status.branch')) + ': ' + chalk.magenta(info.branch));

    // 端口信息
    if (port) {
      output(chalk.bold(t('commands.status.port')) + ': ' + chalk.cyan(String(port)));
    }

    output('');

    // Git 状态
    const hasChanges = gitStatus.modified > 0 || gitStatus.staged > 0 || gitStatus.untracked > 0;

    if (hasChanges) {
      output(chalk.bold(t('commands.status.changes')) + ':');

      if (gitStatus.staged > 0) {
        output('  ' + chalk.green(`✓ ${t('commands.status.staged', { count: gitStatus.staged })}`));
      }

      if (gitStatus.modified > 0) {
        output('  ' + chalk.yellow(`● ${t('commands.status.modified', { count: gitStatus.modified })}`));
      }

      if (gitStatus.untracked > 0) {
        output('  ' + chalk.gray(`? ${t('commands.status.untracked', { count: gitStatus.untracked })}`));
      }
    } else {
      output(chalk.green(t('commands.status.clean')));
    }

    // 与主分支的差异
    if (!info.isMainBranch) {
      output('');
      const hasDiff = gitStatus.ahead > 0 || gitStatus.behind > 0;

      if (hasDiff) {
        const parts: string[] = [];
        if (gitStatus.ahead > 0) {
          parts.push(chalk.cyan(`↑${gitStatus.ahead} ${t('commands.status.ahead')}`));
        }
        if (gitStatus.behind > 0) {
          parts.push(chalk.yellow(`↓${gitStatus.behind} ${t('commands.status.behind')}`));
        }
        output(chalk.bold(t('commands.status.diff', { branch: mainBranch })) + ': ' + parts.join(' '));
      } else {
        output(chalk.green(t('commands.status.synced', { branch: mainBranch })));
      }
    }

    output('');

  } catch (error) {
    if (error instanceof ColynError) {
      formatError(error);
      process.exit(1);
    }
    throw error;
  }
}

/**
 * 注册 status 命令
 */
export function register(program: Command): void {
  program
    .command('status')
    .alias('st')
    .description(t('commands.status.description'))
    .action(async () => {
      await statusCommand();
    });
}
