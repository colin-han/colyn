import { Command } from 'commander';
import { repairProject } from './repair.helpers.js';
import { formatError, outputResult } from '../utils/logger.js';
import { t } from '../i18n/index.js';

/**
 * 注册 repair 命令
 */
export function register(program: Command): void {
  program
    .command('repair')
    .description(t('commands.repair.description'))
    .action(async () => {
      try {
        await repairProject();

        // 输出结果给 bash 脚本
        outputResult({
          success: true
        });
      } catch (error) {
        formatError(error);
        outputResult({
          success: false
        });
        process.exit(1);
      }
    });
}
