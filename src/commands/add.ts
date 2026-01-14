import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { loadConfig } from '../core/config.js';
import type { WorktreeInfo } from '../types/index.js';
import { ColynError } from '../types/index.js';
import { formatError } from '../utils/logger.js';
import {
  isValidBranchName,
  assignWorktreeIdAndPort,
  checkInitialized,
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

    const rootDir = process.cwd();

    // 步骤2: 前置检查
    await checkInitialized(rootDir);
    const config = await loadConfig(rootDir);
    await checkIsGitRepo();

    const mainDirName = path.basename(rootDir);
    const mainDirPath = path.join(rootDir, mainDirName);

    const mainDirExists = await fs.access(mainDirPath)
      .then(() => true)
      .catch(() => false);

    if (!mainDirExists) {
      throw new ColynError('主分支目录不存在', '配置文件可能已损坏');
    }

    await checkMainEnvFile(rootDir, mainDirName);
    await checkBranchWorktreeConflict(config, cleanBranchName);

    // 步骤3: 处理分支（本地/远程/新建）
    await handleBranch(cleanBranchName, config.mainBranch);

    // 步骤4: 分配 ID 和端口
    const { id, port } = assignWorktreeIdAndPort(config);

    // 步骤5: 创建 worktree
    const worktreePath = await createWorktree(rootDir, cleanBranchName, id);

    // 步骤6: 配置环境变量
    await configureWorktreeEnv(mainDirPath, worktreePath, id, port);

    // 步骤7: 更新配置文件
    const worktreeInfo: WorktreeInfo = {
      id,
      branch: cleanBranchName,
      path: worktreePath,
      port,
      createdAt: new Date().toISOString()
    };

    await updateConfigWithWorktree(rootDir, config, worktreeInfo);

    // 步骤8: 显示成功信息
    displayAddSuccess(id, cleanBranchName, worktreePath, port);

  } catch (error) {
    formatError(error);
    process.exit(1);
  }
}
