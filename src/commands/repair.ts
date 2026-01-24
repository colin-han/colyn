import { Command } from 'commander';
import { repairProject } from './repair.helpers.js';
import { formatError, outputResult } from '../utils/logger.js';

/**
 * 注册 repair 命令
 */
export function register(program: Command): void {
  program
    .command('repair')
    .description('检查并修复项目配置（移动目录后使用）')
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
