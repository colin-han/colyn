import * as path from 'path';
import chalk from 'chalk';
import { loadConfig } from '../core/config.js';
import {
  getProjectPaths,
  validateProjectInitialized,
  executeInDirectory
} from '../core/paths.js';
import type { WorktreeInfo } from '../types/index.js';
import { ColynError } from '../types/index.js';
import { formatError } from '../utils/logger.js';
import {
  isValidBranchName,
  assignWorktreeIdAndPort,
  checkIsGitRepo,
  checkMainEnvFile,
  checkBranchWorktreeConflict,
  handleBranch,
  createWorktree,
  configureWorktreeEnv,
  updateConfigWithWorktree,
  displayAddSuccess
} from './add.helpers.js';

/**
 * Add 命令：创建新的 worktree
 */
export async function addCommand(branchName: string): Promise<void> {
  try {
    // 步骤1: 验证和清理分支名称
    if (!branchName || branchName.trim() === '') {
      throw new ColynError('分支名称不能为空', '请提供分支名称参数');
    }

    const cleanBranchName = branchName.replace(/^origin\//, '');

    if (!isValidBranchName(cleanBranchName)) {
      throw new ColynError(
        '无效的分支名称',
        '分支名称只能包含字母、数字、下划线、连字符和斜杠'
      );
    }

    // 步骤2: 获取项目路径并验证
    const paths = await getProjectPaths();
    await validateProjectInitialized(paths);

    // 步骤3: 加载配置和检查
    const config = await loadConfig(paths.rootDir);

    // 在主分支目录中检查 git 仓库
    await executeInDirectory(paths.mainDir, async () => {
      await checkIsGitRepo();
    });

    await checkMainEnvFile(paths.rootDir, paths.mainDirName);
    await checkBranchWorktreeConflict(config, cleanBranchName);

    // 步骤4: 在主分支目录中处理分支（本地/远程/新建）
    await executeInDirectory(paths.mainDir, async () => {
      await handleBranch(cleanBranchName, config.mainBranch);
    });

    // 步骤5: 分配 ID 和端口
    const { id, port } = assignWorktreeIdAndPort(config);

    // 步骤6: 在主分支目录创建 worktree（git 仓库所在地）
    const worktreePath = await executeInDirectory(paths.mainDir, async () => {
      return await createWorktree(paths.rootDir, cleanBranchName, id);
    });

    // 步骤7: 配置环境变量
    await configureWorktreeEnv(paths.mainDir, worktreePath, id, port);

    // 步骤8: 更新配置文件
    const worktreeInfo: WorktreeInfo = {
      id,
      branch: cleanBranchName,
      path: worktreePath,
      port,
      createdAt: new Date().toISOString()
    };

    await updateConfigWithWorktree(paths.rootDir, config, worktreeInfo);

    // 步骤9: 显示成功信息
    displayAddSuccess(id, cleanBranchName, worktreePath, port);

  } catch (error) {
    formatError(error);
    process.exit(1);
  }
}
