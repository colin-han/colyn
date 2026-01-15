import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import Enquirer from 'enquirer';
const { prompt } = Enquirer;
import type { DirectoryInfo } from '../types/index.js';
import { detectMainBranch, checkWorkingDirectoryClean } from '../core/git.js';
import { saveConfig, createDefaultConfig, configExists, loadConfig } from '../core/config.js';
import {
  createDirectoryStructure,
  moveFilesToMainDir,
  configureEnvFile,
  configureGitignore,
  displaySuccessInfo,
  displayEmptyDirectorySuccess,
  checkDirectoryConflict
} from './init.helpers.js';
import {
  output,
  outputWarning,
  outputInfo,
  outputSuccess
} from '../utils/logger.js';

/**
 * 处理结果接口
 */
export interface InitHandlerResult {
  mainDirPath: string;
  mainDirName: string;
}

/**
 * 处理空目录情况
 */
export async function handleEmptyDirectory(
  dirInfo: DirectoryInfo,
  port: number
): Promise<InitHandlerResult> {
  const rootDir = process.cwd();
  const mainDirName = dirInfo.currentDirName;
  const mainBranch = 'main'; // 空目录默认使用 main

  // 步骤1: 创建目录结构
  const spinner = ora({ text: '创建目录结构...', stream: process.stderr }).start();

  const mainDirPath = path.join(rootDir, mainDirName);
  const worktreesDirPath = path.join(rootDir, 'worktrees');
  const configDirPath = path.join(rootDir, '.colyn');

  await fs.mkdir(mainDirPath, { recursive: true });
  await fs.mkdir(worktreesDirPath, { recursive: true });
  await fs.mkdir(configDirPath, { recursive: true });

  spinner.succeed('目录结构创建完成');

  // 步骤2: 创建 .env.local
  await configureEnvFile(mainDirPath, port, 'main');

  // 步骤3: 创建 .gitignore
  await configureGitignore(mainDirPath);

  // 步骤4: 保存配置
  const config = createDefaultConfig(mainBranch, port);
  await saveConfig(rootDir, config);

  // 步骤5: 显示成功信息
  displayEmptyDirectorySuccess(mainDirName, port, mainBranch);

  return { mainDirPath, mainDirName };
}

/**
 * 处理已初始化目录情况
 */
export async function handleInitializedDirectory(
  dirInfo: DirectoryInfo,
  port: number
): Promise<InitHandlerResult> {
  const rootDir = process.cwd();
  const mainDirName = dirInfo.currentDirName;
  const mainBranch = await detectMainBranch();
  const mainDirPath = path.join(rootDir, mainDirName);

  outputWarning('检测到已初始化，进入补全模式...\n');

  const tasks: Array<{ name: string; action: () => Promise<void> }> = [];

  // 检查并补全主分支目录
  if (!dirInfo.hasMainDir) {
    tasks.push({
      name: `创建主分支目录: ${mainDirName}`,
      action: async () => {
        await fs.mkdir(mainDirPath, { recursive: true });
      }
    });
  }

  // 检查并补全 worktrees 目录
  if (!dirInfo.hasWorktreesDir) {
    tasks.push({
      name: '创建 worktrees 目录',
      action: async () => {
        const worktreesDirPath = path.join(rootDir, 'worktrees');
        await fs.mkdir(worktreesDirPath, { recursive: true });
      }
    });
  }

  // 检查并补全配置目录和文件
  if (!dirInfo.hasConfigDir) {
    tasks.push({
      name: '创建配置文件',
      action: async () => {
        const config = createDefaultConfig(mainBranch, port);
        await saveConfig(rootDir, config);
      }
    });
  } else {
    // 配置文件可能存在，检查是否需要更新
    const exists = await configExists(rootDir);
    if (!exists) {
      tasks.push({
        name: '创建配置文件',
        action: async () => {
          const config = createDefaultConfig(mainBranch, port);
          await saveConfig(rootDir, config);
        }
      });
    }
  }

  // 如果主分支目录存在，检查环境变量配置
  if (dirInfo.hasMainDir) {
    tasks.push({
      name: '检查并配置 .env.local',
      action: async () => {
        await configureEnvFile(mainDirPath, port, 'main');
      }
    });

    tasks.push({
      name: '检查并配置 .gitignore',
      action: async () => {
        await configureGitignore(mainDirPath);
      }
    });
  }

  // 执行补全任务
  for (const task of tasks) {
    const spinner = ora({ text: task.name, stream: process.stderr }).start();
    try {
      await task.action();
      spinner.succeed();
    } catch (error) {
      spinner.fail();
      throw error;
    }
  }

  outputSuccess('\n补全完成！\n');

  if (tasks.length === 0) {
    outputInfo('所有配置已完整，无需补全。\n');
  }

  return { mainDirPath, mainDirName };
}

/**
 * 处理已有项目情况
 */
export async function handleExistingProject(
  dirInfo: DirectoryInfo,
  port: number
): Promise<InitHandlerResult | null> {
  const rootDir = process.cwd();
  const mainDirName = dirInfo.currentDirName;

  // 步骤1: 显示当前目录的文件列表
  outputWarning('\n检测到已有文件，将执行以下操作：');
  outputInfo('  1. 创建主分支目录和 worktrees 目录');
  outputInfo(`  2. 将当前目录所有文件移动到 ${mainDirName}/ 目录下\n`);

  const entries = await fs.readdir(rootDir);
  output(chalk.bold('当前目录文件列表：'));

  // 显示前10个文件，如果超过10个则显示省略
  const displayEntries = entries.slice(0, 10);
  displayEntries.forEach(entry => {
    outputInfo(`  - ${entry}`);
  });

  if (entries.length > 10) {
    outputInfo(`  ... 还有 ${entries.length - 10} 个文件`);
  }
  output('');

  // 步骤2: 询问用户确认（输出到 stderr，避免被 shell 脚本捕获）
  const { confirmed } = await prompt<{ confirmed: boolean }>({
    type: 'confirm',
    name: 'confirmed',
    message: '确认继续初始化？',
    initial: false, // 默认为否，需要用户主动确认
    stdout: process.stderr
  });

  // 步骤3: 如果取消，退出
  if (!confirmed) {
    outputInfo('已取消初始化');
    return null;
  }

  // 步骤4: 如果是 git 仓库，检查工作目录是否干净
  if (dirInfo.hasGitRepo) {
    await checkWorkingDirectoryClean();
  }

  // 步骤5: 检查目录名冲突
  await checkDirectoryConflict(rootDir, mainDirName);

  // 步骤6: 检测主分支名称
  const mainBranch = await detectMainBranch();

  // 步骤7: 创建目录结构
  await createDirectoryStructure(rootDir, mainDirName, dirInfo);

  // 步骤8: 移动文件
  await moveFilesToMainDir(rootDir, mainDirName);

  // 步骤9: 配置环境变量
  const mainDirPath = path.join(rootDir, mainDirName);
  await configureEnvFile(mainDirPath, port, 'main');

  // 步骤10: 配置 .gitignore
  await configureGitignore(mainDirPath);

  // 步骤11: 保存配置
  const config = createDefaultConfig(mainBranch, port);
  await saveConfig(rootDir, config);

  // 步骤12: 显示成功信息
  displaySuccessInfo(mainDirName, port, mainBranch);

  return { mainDirPath, mainDirName };
}
