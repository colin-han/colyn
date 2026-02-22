import { Command } from 'commander';
import chalk from 'chalk';
import { getLocationInfo, getProjectPaths } from '../core/paths.js';
import { getWorktreeStatus, setWorktreeStatus, VALID_STATUSES } from '../core/worktree-status.js';
import type { WorktreeStatus } from '../core/worktree-status.js';
import { ColynError } from '../types/index.js';
import { output, outputSuccess, formatError } from '../utils/logger.js';
import { t } from '../i18n/index.js';

/**
 * 格式化 ISO 时间为本地可读格式
 */
function formatDate(isoString: string): string {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/**
 * get 子命令实现
 */
async function getStatusCommand(options: { json?: boolean }): Promise<void> {
  const info = await getLocationInfo();
  const paths = await getProjectPaths();
  const effectiveDir = info.isMainBranch ? 'main' : info.worktreeDir;

  const { status, updatedAt } = await getWorktreeStatus(paths.configDir, effectiveDir);

  if (options.json) {
    const result = {
      worktreeDir: effectiveDir,
      worktreeId: info.worktreeId,
      status,
      updatedAt,
    };
    output(JSON.stringify(result));
  } else {
    output(chalk.bold(t('commands.status.labelStatus')) + '   ' + chalk.cyan(status));
    if (updatedAt) {
      output(chalk.bold(t('commands.status.labelUpdatedAt')) + ' ' + formatDate(updatedAt));
    } else {
      output(
        chalk.bold(t('commands.status.labelUpdatedAt')) +
          ' ' +
          chalk.gray(t('commands.status.neverUpdated'))
      );
    }
  }
}

/**
 * set 子命令实现
 */
async function setStatusCommand(statusValue: string): Promise<void> {
  if (!VALID_STATUSES.includes(statusValue as WorktreeStatus)) {
    throw new ColynError(
      t('commands.status.invalidStatus', { status: statusValue }),
      t('commands.status.invalidStatusHint')
    );
  }

  const info = await getLocationInfo();
  const paths = await getProjectPaths();
  const effectiveDir = info.isMainBranch ? 'main' : info.worktreeDir;

  await setWorktreeStatus(
    paths.configDir,
    effectiveDir,
    info.projectPath,
    statusValue as WorktreeStatus
  );

  outputSuccess(t('commands.status.statusUpdated', { status: statusValue }));
}

/**
 * 注册 status 命令
 */
export function register(program: Command): void {
  const statusCmd = program
    .command('status')
    .alias('st')
    .description(t('commands.status.description'))
    // --json 定义在父命令，commander 会在路由子命令前先解析它
    .option('--json', t('commands.status.jsonOption'));

  // get 子命令 - 通过 command.parent.opts() 读取 --json
  statusCmd
    .command('get')
    .description(t('commands.status.getDescription'))
    .action(async (_options: Record<string, never>, command: Command) => {
      try {
        const json = (command.parent?.opts() as { json?: boolean } | undefined)?.json;
        await getStatusCommand({ json });
      } catch (error) {
        if (error instanceof ColynError) {
          formatError(error);
          process.exit(1);
        }
        throw error;
      }
    });

  // set 子命令
  statusCmd
    .command('set')
    .description(t('commands.status.setDescription'))
    .argument('<status>', t('commands.status.statusArgument'))
    .action(async (statusValue: string) => {
      try {
        await setStatusCommand(statusValue);
      } catch (error) {
        if (error instanceof ColynError) {
          formatError(error);
          process.exit(1);
        }
        throw error;
      }
    });

  // 默认 action：无子命令时执行 get（--json 已在父命令定义）
  statusCmd.action(async (options: { json?: boolean }) => {
    try {
      await getStatusCommand(options);
    } catch (error) {
      if (error instanceof ColynError) {
        formatError(error);
        process.exit(1);
      }
      throw error;
    }
  });
}
