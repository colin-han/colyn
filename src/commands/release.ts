import type { Command } from 'commander';
import simpleGit from 'simple-git';
import {
  getProjectPaths,
  validateProjectInitialized,
  executeInDirectory
} from '../core/paths.js';
import { getMainBranch } from '../core/discovery.js';
import { getRelevantStatusFiles } from '../core/git.js';
import { ColynError } from '../types/index.js';
import { formatError, output } from '../utils/logger.js';
import { t } from '../i18n/index.js';
import { checkIsGitRepo } from './add.helpers.js';
import { executeUpdate } from './update.js';
import { checkBranchMerged } from './remove.helpers.js';
import {
  executeRelease,
  displayReleaseSuccess,
  displayRollbackCommands
} from './release.helpers.js';
import { applyCommandDefaults, resolveVerbose } from '../core/command-defaults.js';

/**
 * Release 命令选项
 */
interface ReleaseOptions extends Record<string, unknown> {
  update?: boolean;
  build?: boolean;
  versionUpdate?: boolean;
  tag?: boolean;
  verbose?: boolean;
}

/**
 * 检查当前目录是否有未提交的更改
 */
async function checkCurrentDirClean(currentDir: string): Promise<void> {
  const git = simpleGit(currentDir);
  const status = await git.status();
  const changedFiles = getRelevantStatusFiles(status);

  if (changedFiles.length > 0) {
    const filesStr = changedFiles.slice(0, 5).map(f => `  - ${f}`).join('\n') +
      (changedFiles.length > 5 ? `\n  ... ${t('commands.remove.moreFiles', { count: changedFiles.length - 5 })}` : '');

    throw new ColynError(
      t('commands.release.currentDirNotClean'),
      t('commands.release.currentDirNotCleanHint', {
        path: currentDir,
        count: changedFiles.length,
        files: filesStr
      })
    );
  }
}

/**
 * 检查当前分支是否已合并到主分支（仅在 worktree 中执行时检查）
 */
async function checkCurrentBranchMerged(
  currentDir: string,
  mainDir: string,
  worktreesDir: string
): Promise<void> {
  // 检查当前目录是否在 worktreesDir 中
  if (!currentDir.startsWith(worktreesDir)) {
    // 不在 worktree 中，无需检查
    return;
  }

  // 获取当前分支
  const git = simpleGit(currentDir);
  const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
  const currentBranch = branch.trim();

  // 获取主分支名称
  const mainBranch = await getMainBranch(mainDir);

  // 如果当前分支就是主分支，无需检查
  if (currentBranch === mainBranch) {
    return;
  }

  // 检查分支是否已合并
  const merged = await checkBranchMerged(mainDir, currentBranch);

  if (!merged) {
    throw new ColynError(
      t('commands.release.branchNotMerged', { branch: currentBranch, main: mainBranch }),
      t('commands.release.branchNotMergedHint', { branch: currentBranch, main: mainBranch })
    );
  }
}

/**
 * Release 命令：在 Main Branch 目录执行发布流程
 */
async function releaseCommand(versionType: string | undefined, options: ReleaseOptions): Promise<void> {
  try {
    // 如果未提供版本类型，默认使用 patch
    const version = versionType || 'patch';

    // 步骤1: 获取项目路径并验证
    const paths = await getProjectPaths();
    await validateProjectInitialized(paths);

    // 步骤2: 获取当前工作目录
    const currentDir = process.cwd();
    const effectiveCurrentDir = currentDir === paths.rootDir ? paths.mainDir : currentDir;

    // 步骤3: 检查当前目录是否有未提交的更改
    await checkCurrentDirClean(effectiveCurrentDir);

    // 步骤4: 检查当前分支是否已合并（仅在 worktree 中执行时）
    await checkCurrentBranchMerged(effectiveCurrentDir, paths.mainDir, paths.worktreesDir);

    // 步骤5: 检查主分支目录是否干净
    if (effectiveCurrentDir !== paths.mainDir) {
      await checkCurrentDirClean(paths.mainDir);
    }

    // 步骤6: 在主分支目录中检查 git 仓库
    await executeInDirectory(paths.mainDir, async () => {
      await checkIsGitRepo();
    });

    // 步骤7: 在主分支目录执行发布流程
    let newVersion: string | null;
    try {
      newVersion = await executeRelease(paths.rootDir, paths.mainDir, version, {
        verbose: options.verbose,
        noBuild: !options.build,
        noVersionUpdate: !options.versionUpdate,
        noTag: !options.tag,
      });
    } catch (error) {
      // 如果发布失败，尝试回滚
      if (error instanceof ColynError) {
        // 显示回滚提示
        displayRollbackCommands(options.versionUpdate ? version : null);
      }
      throw error;
    }

    // 步骤8: 发布成功后，自动更新所有 worktree（除非指定 --no-update）
    if (options.update) {
      output(''); // 空行分隔
      output(t('commands.release.updatingWorktrees'));
      try {
        await executeUpdate(undefined, { all: true });
      } catch (error) {
        // update 失败不影响 release 的成功状态
        output(t('commands.release.updateFailed'));
        // 错误已经在 executeUpdate 中输出，这里不再重复输出
      }
    }

    // 显示发布成功信息
    const currentBranch = await getMainBranch(paths.mainDir);
    displayReleaseSuccess(newVersion, currentBranch);

  } catch (error) {
    formatError(error);
    process.exit(1);
  }
}

/**
 * 注册 release 命令
 */
export function register(program: Command): void {
  program
    .command('release [version]')
    .description(t('commands.release.description'))
    .option('--update', t('commands.release.updateOption'))
    .option('--no-update', t('commands.release.noUpdateOption'))
    .option('--build', t('commands.release.buildOption'))
    .option('--no-build', t('commands.release.noBuildOption'))
    .option('--version-update', t('commands.release.versionUpdateOption'))
    .option('--no-version-update', t('commands.release.noVersionUpdateOption'))
    .option('--tag', t('commands.release.tagOption'))
    .option('--no-tag', t('commands.release.noTagOption'))
    .option('-v, --verbose', t('common.verboseOption'))
    .option('--no-verbose', t('common.noVerboseOption'))
    .action(async (version: string | undefined, options: ReleaseOptions, command: Command) => {
      const resolved = await applyCommandDefaults(
        command,
        options,
        ['commands', 'release'] as const,
        { update: true, build: true, versionUpdate: true, tag: true }
      );
      const verbose = await resolveVerbose(command, options.verbose);
      await releaseCommand(version, { ...resolved, verbose });
    });
}
