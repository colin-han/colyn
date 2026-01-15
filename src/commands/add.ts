import * as path from 'path';
import type { Command } from 'commander';
import {
  getProjectPaths,
  validateProjectInitialized,
  executeInDirectory
} from '../core/paths.js';
import {
  discoverProjectInfo,
  findWorktreeByBranch
} from '../core/discovery.js';
import type { CommandResult } from '../types/index.js';
import { ColynError } from '../types/index.js';
import { formatError, outputResult } from '../utils/logger.js';
import {
  isValidBranchName,
  checkIsGitRepo,
  checkMainEnvFile,
  handleBranch,
  createWorktree,
  configureWorktreeEnv,
  displayAddSuccess
} from './add.helpers.js';

/**
 * Add 命令：创建新的 worktree
 */
async function addCommand(branchName: string): Promise<void> {
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

    // 步骤3: 在主分支目录中检查 git 仓库
    await executeInDirectory(paths.mainDir, async () => {
      await checkIsGitRepo();
    });

    await checkMainEnvFile(paths.rootDir, paths.mainDirName);

    // 步骤4: 从文件系统发现项目信息（替代 loadConfig）
    const projectInfo = await discoverProjectInfo(paths.mainDir, paths.worktreesDir);

    // 步骤5: 检查分支是否已有 worktree
    const existingWorktree = await findWorktreeByBranch(
      paths.mainDir,
      paths.worktreesDir,
      cleanBranchName
    );
    if (existingWorktree) {
      throw new ColynError(
        `分支 "${cleanBranchName}" 已存在 worktree`,
        `ID: ${existingWorktree.id}, 路径: ${existingWorktree.path}`
      );
    }

    // 步骤6: 在主分支目录中处理分支（本地/远程/新建）
    await executeInDirectory(paths.mainDir, async () => {
      await handleBranch(cleanBranchName, projectInfo.mainBranch);
    });

    // 步骤7: 分配 ID 和端口（从发现的信息中获取）
    const id = projectInfo.nextWorktreeId;
    const port = projectInfo.mainPort + id;

    // 步骤8: 在主分支目录创建 worktree（git 仓库所在地）
    const worktreePath = await executeInDirectory(paths.mainDir, async () => {
      return await createWorktree(paths.rootDir, cleanBranchName, id, projectInfo.worktrees);
    });

    // 步骤9: 配置环境变量
    await configureWorktreeEnv(paths.mainDir, worktreePath, id, port);

    // 步骤10: 计算相对路径并显示成功信息
    const displayPath = path.relative(paths.rootDir, worktreePath);
    displayAddSuccess(id, cleanBranchName, worktreePath, port, displayPath);

    // 步骤11: 输出 JSON 结果到 stdout（供 bash 解析）
    const result: CommandResult = {
      success: true,
      targetDir: worktreePath,
      displayPath
    };
    outputResult(result);

  } catch (error) {
    formatError(error);
    // 输出失败结果
    outputResult({ success: false });
    process.exit(1);
  }
}

/**
 * 注册 add 命令
 */
export function register(program: Command): void {
  program
    .command('add <branch>')
    .description('创建新的 worktree')
    .action(async (branch: string) => {
      await addCommand(branch);
    });
}
