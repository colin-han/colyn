import type { Command } from 'commander';
import { spawnSync } from 'child_process';
import simpleGit from 'simple-git';
import { getProjectPaths, validateProjectInitialized, executeInDirectory } from '../core/paths.js';
import { getMainBranch } from '../core/discovery.js';
import { ColynError } from '../types/index.js';
import { formatError, output } from '../utils/logger.js';
import { t } from '../i18n/index.js';
import { checkIsGitRepo } from './add.helpers.js';
import { executeUpdate } from './update.js';
import { checkBranchMerged } from './remove.helpers.js';

/**
 * 运行发布脚本
 */
function runReleaseScript(mainDir: string, versionType: string): void {
  const result = spawnSync(
    'node',
    ['scripts/release.js', versionType],
    {
      cwd: mainDir,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: process.env
    }
  );

  if (result.stdout && result.stdout.length > 0) {
    process.stderr.write(result.stdout);
  }

  if (result.stderr && result.stderr.length > 0) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    throw new ColynError(
      t('commands.release.execFailed'),
      result.error.message
    );
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }

  if (result.status === null) {
    process.exit(1);
  }
}

/**
 * 检查当前目录是否有未提交的更改
 */
async function checkCurrentDirClean(currentDir: string): Promise<void> {
  const git = simpleGit(currentDir);
  const status = await git.status();

  if (!status.isClean()) {
    const changedFiles = [
      ...status.modified,
      ...status.created,
      ...status.deleted,
      ...status.renamed.map(r => r.to),
      ...status.not_added
    ];

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
 * Release 命令选项
 */
interface ReleaseOptions {
  noUpdate?: boolean;
}

/**
 * Release 命令：在 Main Branch 目录执行发布脚本
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

    // 步骤3: 检查当前目录是否有未提交的更改
    await checkCurrentDirClean(currentDir);

    // 步骤4: 检查当前分支是否已合并（仅在 worktree 中执行时）
    await checkCurrentBranchMerged(currentDir, paths.mainDir, paths.worktreesDir);

    // 步骤5: 在主分支目录中检查 git 仓库
    await executeInDirectory(paths.mainDir, async () => {
      await checkIsGitRepo();
    });

    // 步骤6: 在主分支目录执行发布脚本
    runReleaseScript(paths.mainDir, version);

    // 步骤7: 发布成功后，自动更新所有 worktree（除非指定 --no-update）
    if (!options.noUpdate) {
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
    .option('--no-update', t('commands.release.noUpdateOption'))
    .action(async (version: string | undefined, options: ReleaseOptions) => {
      await releaseCommand(version, options);
    });
}
