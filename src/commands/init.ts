import type { Command } from 'commander';
import { DirectoryStatus, CommandResult } from '../types/index.js';
import { formatError, outputResult } from '../utils/logger.js';
import { t } from '../i18n/index.js';
import {
  detectDirectoryStatus
} from './init.helpers.js';
import {
  handleEmptyDirectory,
  handleInitializedDirectory,
  handleExistingProject,
  InitHandlerResult
} from './init.handlers.js';

/**
 * Init 命令入口
 */
async function initCommand(options: { port?: string; yes?: boolean }): Promise<void> {
  try {
    // 步骤1: 检测目录状态
    const dirInfo = await detectDirectoryStatus();

    // 步骤2: 根据目录状态执行不同流程（端口配置已移入各 handler，由插件决定）
    let handlerResult: InitHandlerResult | null = null;

    switch (dirInfo.status) {
      case DirectoryStatus.Empty:
        handlerResult = await handleEmptyDirectory(dirInfo, options);
        break;

      case DirectoryStatus.Initialized:
        handlerResult = await handleInitializedDirectory(dirInfo, options);
        break;

      case DirectoryStatus.ExistingProject:
        handlerResult = await handleExistingProject(dirInfo, options, options.yes || false);
        break;
    }

    // 步骤4: 输出 JSON 结果到 stdout（供 bash 解析）
    if (handlerResult) {
      const result: CommandResult = {
        success: true,
        targetDir: handlerResult.mainDirPath,
        displayPath: handlerResult.mainDirName
      };
      outputResult(result);
    } else {
      // 用户取消操作
      outputResult({ success: false });
      process.exit(1);
    }

  } catch (error) {
    formatError(error);
    // 输出失败结果
    outputResult({ success: false });
    process.exit(1);
  }
}

/**
 * 注册 init 命令
 */
export function register(program: Command): void {
  program
    .command('init')
    .description(t('commands.init.description'))
    .option('-p, --port <port>', t('commands.init.portOption'))
    .option('-y, --yes', t('commands.init.yesOption'))
    .action(async (options) => {
      await initCommand(options);
    });
}
