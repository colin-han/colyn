import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import Enquirer from 'enquirer';
const { prompt } = Enquirer;
import type { DirectoryInfo } from '../types/index.js';
import { detectMainBranch, checkWorkingDirectoryClean } from '../core/git.js';
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
import {
  isTmuxAvailable,
  isInTmux,
  getCurrentSession,
  createSession,
  setupWindow,
  getWindowName
} from '../core/tmux.js';
import { getDevServerCommand } from '../core/dev-server.js';

/**
 * 处理结果接口
 */
export interface InitHandlerResult {
  mainDirPath: string;
  mainDirName: string;
}

/**
 * tmux 设置结果
 */
interface TmuxSetupResult {
  /** 是否设置成功 */
  success: boolean;
  /** session 名称 */
  sessionName?: string;
  /** 是否在 tmux 中 */
  inTmux: boolean;
  /** 是否创建了新 session */
  createdSession?: boolean;
}

/**
 * 设置 tmux 环境（Window 0 for main branch）
 * @param projectName 项目名称（用作 session 名称）
 * @param mainDirPath 主分支目录路径
 * @param mainBranch 主分支名称
 */
async function setupTmuxEnvironment(
  projectName: string,
  mainDirPath: string,
  mainBranch: string
): Promise<TmuxSetupResult> {
  // 如果 tmux 不可用，直接返回
  if (!isTmuxAvailable()) {
    return { success: false, inTmux: false };
  }

  const sessionName = projectName;
  const windowName = getWindowName(mainBranch);
  const devCommand = await getDevServerCommand(mainDirPath);

  // 检测当前环境
  const inTmux = isInTmux();

  if (inTmux) {
    // 在 tmux 中：使用当前 session，设置 Window 0 布局
    const currentSession = getCurrentSession();

    if (currentSession) {
      // 设置 Window 0 的布局
      const success = setupWindow({
        sessionName: currentSession,
        windowIndex: 0,
        windowName,
        workingDir: mainDirPath,
        devCommand,
        skipWindowCreation: true, // Window 0 已存在，只设置布局
      });

      return {
        success,
        sessionName: currentSession,
        inTmux: true,
      };
    }

    return { success: false, inTmux: true };
  } else {
    // 不在 tmux 中：创建新 session，设置 Window 0
    const created = createSession(sessionName, mainDirPath);

    if (created) {
      // 设置 Window 0 的布局
      const success = setupWindow({
        sessionName,
        windowIndex: 0,
        windowName,
        workingDir: mainDirPath,
        devCommand,
        skipWindowCreation: true, // session 创建时会自动创建 window 0
      });

      return {
        success,
        sessionName,
        inTmux: false,
        createdSession: true,
      };
    }

    return { success: false, inTmux: false };
  }
}

/**
 * 显示 tmux 设置结果信息
 */
function displayTmuxSetupInfo(result: TmuxSetupResult): void {
  if (!result.success) {
    return;
  }

  if (result.inTmux) {
    outputSuccess('检测到在 tmux session 中');
    outputSuccess(`将使用当前 session: ${result.sessionName}`);
    outputSuccess('已设置 Window 0: main');
    output('  ├─ Claude Code  (左侧 60%)');
    output('  ├─ Dev Server   (右上 12%)');
    output('  └─ Bash         (右下 28%)');
  } else {
    outputSuccess('检测到你不在 tmux 中');
    outputSuccess(`已创建 tmux session: ${result.sessionName}`);
    outputSuccess('已设置 Window 0: main');
    output('  ├─ Claude Code  (左侧 60%)');
    output('  ├─ Dev Server   (右上 12%)');
    output('  └─ Bash         (右下 28%)');
    output('');
    output(chalk.cyan(`💡 提示: 运行 'tmux attach -t ${result.sessionName}' 进入工作环境`));
  }
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

  // 步骤4: 设置 tmux 环境
  const tmuxResult = await setupTmuxEnvironment(mainDirName, mainDirPath, mainBranch);

  // 步骤5: 显示成功信息
  displayEmptyDirectorySuccess(mainDirName, port, mainBranch);

  // 步骤6: 显示 tmux 设置信息
  if (tmuxResult.success) {
    output('');
    displayTmuxSetupInfo(tmuxResult);
  }

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

  // 检查并补全 .colyn 配置目录（仅目录，不再需要 config.json）
  if (!dirInfo.hasConfigDir) {
    tasks.push({
      name: '创建 .colyn 配置目录',
      action: async () => {
        const configDirPath = path.join(rootDir, '.colyn');
        await fs.mkdir(configDirPath, { recursive: true });
      }
    });
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

  // 设置 tmux 环境（获取主分支名称）
  let mainBranch = 'main';
  if (dirInfo.hasGitRepo) {
    try {
      mainBranch = await detectMainBranch();
    } catch {
      // 如果无法获取主分支，使用默认值
    }
  }

  const tmuxResult = await setupTmuxEnvironment(mainDirName, mainDirPath, mainBranch);
  if (tmuxResult.success) {
    output('');
    displayTmuxSetupInfo(tmuxResult);
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

  // 步骤11: 设置 tmux 环境
  const tmuxResult = await setupTmuxEnvironment(mainDirName, mainDirPath, mainBranch);

  // 步骤12: 显示成功信息
  displaySuccessInfo(mainDirName, port, mainBranch);

  // 步骤13: 显示 tmux 设置信息
  if (tmuxResult.success) {
    output('');
    displayTmuxSetupInfo(tmuxResult);
  }

  return { mainDirPath, mainDirName };
}
