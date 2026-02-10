import type { Command } from 'commander';
import { spawnSync } from 'child_process';
import { getProjectPaths, validateProjectInitialized, executeInDirectory } from '../core/paths.js';
import { ColynError } from '../types/index.js';
import { formatError, outputStep } from '../utils/logger.js';
import { t } from '../i18n/index.js';
import { checkIsGitRepo } from './add.helpers.js';

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
 * Release 命令：在 Main Branch 目录执行发布脚本
 */
async function releaseCommand(versionType: string): Promise<void> {
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
    outputStep(t('commands.release.runInMain', { path: paths.mainDir }));
    runReleaseScript(paths.mainDir, versionType);
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
    .argument('<version>', t('commands.release.versionArgument'))
    .action(async (version) => {
      await releaseCommand(version);
    });
}
