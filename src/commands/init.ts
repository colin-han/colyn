import { DirectoryStatus } from '../types/index.js';
import { formatError } from '../utils/logger.js';
import {
  detectDirectoryStatus,
  getPortConfig
} from './init.helpers.js';
import {
  handleEmptyDirectory,
  handleInitializedDirectory,
  handleExistingProject
} from './init.handlers.js';

/**
 * Init 命令入口
 */
export async function initCommand(options: { port?: string }): Promise<void> {
  try {
    // 步骤1: 检测目录状态
    const dirInfo = await detectDirectoryStatus();

    // 步骤2: 获取端口配置
    const port = await getPortConfig(options);

    // 步骤3: 根据目录状态执行不同流程
    switch (dirInfo.status) {
      case DirectoryStatus.Empty:
        await handleEmptyDirectory(dirInfo, port);
        break;

      case DirectoryStatus.Initialized:
        await handleInitializedDirectory(dirInfo, port);
        break;

      case DirectoryStatus.ExistingProject:
        await handleExistingProject(dirInfo, port);
        break;
    }

  } catch (error) {
    formatError(error);
    process.exit(1);
  }
}
