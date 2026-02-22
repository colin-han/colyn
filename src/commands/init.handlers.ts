import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import Enquirer from 'enquirer';
const { prompt } = Enquirer;
import { ColynError, type DirectoryInfo } from '../types/index.js';
import { detectMainBranch, checkWorkingDirectoryClean } from '../core/git.js';
import {
  createDirectoryStructure,
  moveFilesToMainDir,
  displaySuccessInfo,
  displayEmptyDirectorySuccess,
  checkDirectoryConflict,
  getPortConfig
} from './init.helpers.js';
import {
  output,
  outputWarning,
  outputInfo,
  outputSuccess
} from '../utils/logger.js';
import { t } from '../i18n/index.js';
import {
  isTmuxAvailable,
  isInTmux,
  getCurrentSession,
  createSession,
  setupWindow,
  getWindowName
} from '../core/tmux.js';
import { getDevServerCommand } from '../core/dev-server.js';
import { pluginManager } from '../plugins/index.js';
import { loadProjectConfig, saveConfigFile } from '../core/config-loader.js';
import { CURRENT_CONFIG_VERSION } from '../core/config-schema.js';

/**
 * 处理结果接口
 */
export interface InitHandlerResult {
  mainDirPath: string;
  mainDirName: string;
}

/**
 * 将检测到的插件保存到项目 settings.json
 */
async function savePluginsToSettings(projectRoot: string, configDirPath: string, plugins: string[]): Promise<void> {
  const existing = await loadProjectConfig(projectRoot);
  const settings = existing ?? { version: CURRENT_CONFIG_VERSION };
  settings.plugins = plugins;
  const settingsPath = path.join(configDirPath, 'settings.json');
  await saveConfigFile(settingsPath, settings);
}

/**
 * 检测插件并执行插件初始化（gitignore 等）
 * @param nonInteractive 是否非交互模式（默认 false）
 * @returns 检测到的插件名称列表
 */
async function detectAndInitPlugins(
  mainDirPath: string,
  projectRoot: string,
  configDirPath: string,
  nonInteractive = false
): Promise<string[]> {
  let detectedPlugins = await pluginManager.detectPlugins(mainDirPath);

  // 未检测到插件时，交互模式下提示用户手动选择
  if (detectedPlugins.length === 0 && !nonInteractive) {
    const allPlugins = pluginManager.getAllPlugins();
    const choices = allPlugins.map(p => ({ name: p.name, message: p.displayName }));
    outputInfo(t('commands.init.noPluginsDetected'));
    const response = await prompt<{ plugins: string[] }>({
      type: 'multiselect',
      name: 'plugins',
      message: t('commands.init.selectPlugins'),
      choices,
      stdout: process.stderr,
    });
    detectedPlugins = response.plugins;
  }

  // 始终保存（包括空选择），防止 ensurePluginsConfigured 重复触发自动迁移
  await savePluginsToSettings(projectRoot, configDirPath, detectedPlugins);

  if (detectedPlugins.length > 0) {
    await pluginManager.ensureRuntimeConfigIgnored(mainDirPath, detectedPlugins);
    await pluginManager.runRepairSettings(projectRoot, mainDirPath, detectedPlugins);
  }
  return detectedPlugins;
}

/**
 * 根据插件 portConfig 决定是否询问端口，并写入运行时配置
 */
async function configurePortAndEnv(
  mainDirPath: string,
  detectedPlugins: string[],
  options: { port?: string },
  worktreeLabel: string
): Promise<number | undefined> {
  const portConfig = pluginManager.getPortConfig(detectedPlugins);
  if (!portConfig) return undefined;

  const port = await getPortConfig(options, portConfig.defaultPort);
  await pluginManager.writeRuntimeConfig(
    mainDirPath,
    { [portConfig.key]: port.toString(), WORKTREE: worktreeLabel },
    detectedPlugins
  );
  return port;
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
 * @param configDir .colyn 配置目录路径（可选）
 */
async function setupTmuxEnvironment(
  projectName: string,
  mainDirPath: string,
  mainBranch: string,
  configDir?: string
): Promise<TmuxSetupResult> {
  // 如果 tmux 不可用，直接返回
  if (!isTmuxAvailable()) {
    return { success: false, inTmux: false };
  }

  const sessionName = projectName;
  const windowName = getWindowName(mainBranch);
  const devCommand = await getDevServerCommand(mainDirPath, configDir);

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
    outputSuccess(t('commands.init.tmuxDetectedInSession'));
    outputSuccess(t('commands.init.tmuxUseCurrentSession', { session: result.sessionName ?? '' }));
    outputSuccess(t('commands.init.tmuxWindow0Set'));
    output(t('commands.init.tmuxPaneClaude'));
    output(t('commands.init.tmuxPaneDevServer'));
    output(t('commands.init.tmuxPaneBash'));
  } else {
    outputSuccess(t('commands.init.tmuxDetectedNotInSession'));
    outputSuccess(t('commands.init.tmuxSessionCreated', { session: result.sessionName ?? '' }));
    outputSuccess(t('commands.init.tmuxWindow0Set'));
    output(t('commands.init.tmuxPaneClaude'));
    output(t('commands.init.tmuxPaneDevServer'));
    output(t('commands.init.tmuxPaneBash'));
    output('');
    output(chalk.cyan(t('commands.init.tmuxAttachHint', { session: result.sessionName ?? '' })));
  }
}

/**
 * 处理空目录情况
 */
export async function handleEmptyDirectory(
  dirInfo: DirectoryInfo,
  options: { port?: string }
): Promise<InitHandlerResult> {
  const rootDir = process.cwd();
  const mainDirName = dirInfo.currentDirName;
  const mainBranch = 'main'; // 空目录默认使用 main

  // 步骤1: 创建目录结构
  const spinner = ora({ text: t('commands.init.creatingStructure'), stream: process.stderr }).start();

  const mainDirPath = path.join(rootDir, mainDirName);
  const worktreesDirPath = path.join(rootDir, 'worktrees');
  const configDirPath = path.join(rootDir, '.colyn');

  await fs.mkdir(mainDirPath, { recursive: true });
  await fs.mkdir(worktreesDirPath, { recursive: true });
  await fs.mkdir(configDirPath, { recursive: true });

  spinner.succeed(t('commands.init.structureCreated'));

  // 步骤2: 检测插件并初始化（空目录通常没有插件）
  const detectedPlugins = await detectAndInitPlugins(mainDirPath, rootDir, configDirPath);

  // 步骤3: 如果插件有 portConfig，询问端口并写入运行时配置
  const port = await configurePortAndEnv(mainDirPath, detectedPlugins, options, 'main');

  // 步骤4: 设置 tmux 环境
  const tmuxResult = await setupTmuxEnvironment(mainDirName, mainDirPath, mainBranch, configDirPath);

  // 步骤5: 显示成功信息
  displayEmptyDirectorySuccess(mainDirName, port ?? 0, mainBranch);

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
  options: { port?: string }
): Promise<InitHandlerResult> {
  const rootDir = process.cwd();
  const mainDirName = dirInfo.currentDirName;
  const mainDirPath = path.join(rootDir, mainDirName);
  const configDirPath = path.join(rootDir, '.colyn');

  outputWarning(t('commands.init.detectedInitialized') + '\n');

  const tasks: Array<{ name: string; action: () => Promise<void> }> = [];

  // 检查并补全主分支目录
  if (!dirInfo.hasMainDir) {
    tasks.push({
      name: t('commands.init.createMainDir', { name: mainDirName }),
      action: async () => {
        await fs.mkdir(mainDirPath, { recursive: true });
      }
    });
  }

  // 检查并补全 worktrees 目录
  if (!dirInfo.hasWorktreesDir) {
    tasks.push({
      name: t('commands.init.createWorktreesDir'),
      action: async () => {
        const worktreesDirPath = path.join(rootDir, 'worktrees');
        await fs.mkdir(worktreesDirPath, { recursive: true });
      }
    });
  }

  // 检查并补全 .colyn 配置目录
  if (!dirInfo.hasConfigDir) {
    tasks.push({
      name: t('commands.init.createConfigDir'),
      action: async () => {
        const newConfigDirPath = path.join(rootDir, '.colyn');
        await fs.mkdir(newConfigDirPath, { recursive: true });
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

  outputSuccess('\n' + t('commands.init.completionDone') + '\n');

  if (tasks.length === 0) {
    outputInfo(t('commands.init.noCompletionNeeded') + '\n');
  }

  // 检测插件并初始化（gitignore 等）
  const detectedPlugins = await detectAndInitPlugins(mainDirPath, rootDir, configDirPath);

  // 如果插件有 portConfig，询问端口并写入运行时配置
  await configurePortAndEnv(mainDirPath, detectedPlugins, options, 'main');

  // 设置 tmux 环境（获取主分支名称）
  let mainBranch = 'main';
  if (dirInfo.hasGitRepo) {
    try {
      mainBranch = await detectMainBranch();
    } catch {
      // 如果无法获取主分支，使用默认值
    }
  }

  const tmuxResult = await setupTmuxEnvironment(mainDirName, mainDirPath, mainBranch, configDirPath);
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
  options: { port?: string },
  skipConfirm: boolean = false
): Promise<InitHandlerResult | null> {
  const rootDir = process.cwd();
  const mainDirName = dirInfo.currentDirName;
  const configDirPath = path.join(rootDir, '.colyn');

  // 步骤1: 显示当前目录的文件列表
  outputWarning('\n' + t('commands.init.detectedExistingFiles'));
  outputInfo('  ' + t('commands.init.existingStep1'));
  outputInfo('  ' + t('commands.init.existingStep2', { name: mainDirName }) + '\n');

  const entries = await fs.readdir(rootDir);
  output(chalk.bold(t('commands.init.currentFileList')));

  // 显示前10个文件，如果超过10个则显示省略
  const displayEntries = entries.slice(0, 10);
  displayEntries.forEach(entry => {
    outputInfo(`  - ${entry}`);
  });

  if (entries.length > 10) {
    outputInfo('  ' + t('commands.init.moreFiles', { count: String(entries.length - 10) }));
  }
  output('');

  // 步骤2: 询问用户确认（输出到 stderr，避免被 shell 脚本捕获）
  let confirmed = skipConfirm;
  if (!skipConfirm) {
    if (!process.stdin.isTTY) {
      throw new ColynError(
        t('commands.init.nonInteractiveConfirm'),
        t('commands.init.nonInteractiveConfirmHint')
      );
    }

    const response = await prompt<{ confirmed: boolean }>({
      type: 'confirm',
      name: 'confirmed',
      message: t('commands.init.confirmContinue'),
      initial: false, // 默认为否，需要用户主动确认
      stdout: process.stderr
    });
    confirmed = response.confirmed;
  }

  // 步骤3: 如果取消，退出
  if (!confirmed) {
    outputInfo(t('commands.init.initCanceled'));
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

  // 步骤9: 检测插件并初始化（含 .gitignore 配置）
  const mainDirPath = path.join(rootDir, mainDirName);
  const detectedPlugins = await detectAndInitPlugins(mainDirPath, rootDir, configDirPath);

  // 步骤10: 如果插件有 portConfig，询问端口并写入运行时配置
  const port = await configurePortAndEnv(mainDirPath, detectedPlugins, options, 'main');

  // 步骤11: 设置 tmux 环境
  const tmuxResult = await setupTmuxEnvironment(mainDirName, mainDirPath, mainBranch, configDirPath);

  // 步骤12: 显示成功信息
  displaySuccessInfo(mainDirName, port, mainBranch);

  // 步骤13: 显示 tmux 设置信息
  if (tmuxResult.success) {
    output('');
    displayTmuxSetupInfo(tmuxResult);
  }

  return { mainDirPath, mainDirName };
}
