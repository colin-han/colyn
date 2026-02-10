import type { Command } from 'commander';
import { spawnSync } from 'child_process';
import { getProjectPaths, validateProjectInitialized, executeInDirectory } from '../core/paths.js';
import { ColynError } from '../types/index.js';
import { formatError, output } from '../utils/logger.js';
import { t } from '../i18n/index.js';
import { checkIsGitRepo } from './add.helpers.js';
import { executeUpdate } from './update.js';

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
 * Release 命令选项
 */
interface ReleaseOptions {
  noUpdate?: boolean;
}

/**
 * Release 命令：在 Main Branch 目录执行发布脚本
 */
async function releaseCommand(versionType: string, options: ReleaseOptions): Promise<void> {
  try {
    if (!versionType || versionType.trim() === '') {
      throw new ColynError(
        t('commands.release.versionMissing'),
        t('commands.release.versionMissingHint')
      );
    }

    // 步骤1: 获取项目路径并验证
    const paths = await getProjectPaths();
    await validateProjectInitialized(paths);

    // 步骤2: 在主分支目录中检查 git 仓库
    await executeInDirectory(paths.mainDir, async () => {
      await checkIsGitRepo();
    });

    // 步骤3: 在主分支目录执行发布脚本
    runReleaseScript(paths.mainDir, versionType);

    // 步骤4: 发布成功后，自动更新所有 worktree（除非指定 --no-update）
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
    .command('release <version>')
    .description(t('commands.release.description'))
    .option('--no-update', t('commands.release.noUpdateOption'))
    .action(async (version, options: ReleaseOptions) => {
      await releaseCommand(version, options);
    });
}
