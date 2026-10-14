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
import { pluginManager } from '../plugins/index.js';
import {
  detectAndConfigureToolchains,
  saveRepairSettingsResult,
  type ToolchainContext
} from '../core/toolchain-resolver.js';
import { detectProviders, getProvider } from '../todo-backends/registry.js';
import { repairProject } from './repair.helpers.js';
import { setSettingsValueAtPath } from '../core/settings-mutator.js';

/**
 * 处理结果接口
 */
export interface InitHandlerResult {
  mainDirPath: string;
  mainDirName: string;
}

/**
 * 检测工具链并执行初始化（gitignore、repairSettings 等）
 * @param nonInteractive 是否非交互模式（默认 false）
 * @returns 检测到的工具链上下文列表
 */
async function detectAndInitToolchains(
  mainDirPath: string,
  projectRoot: string,
  nonInteractive = false
): Promise<ToolchainContext[]> {
  const contexts = await detectAndConfigureToolchains(projectRoot, mainDirPath, nonInteractive);

  for (const ctx of contexts) {
    await pluginManager.ensureRuntimeConfigIgnored(ctx.absolutePath, [ctx.toolchainName]);

    const newSettings = await pluginManager.runRepairSettings(
      ctx.absolutePath,
      ctx.toolchainName,
      ctx.toolchainSettings,
      nonInteractive
    );
    if (newSettings !== null) {
      await saveRepairSettingsResult(projectRoot, ctx.subPath, newSettings);
    }
  }

  return contexts;
}

/**
 * 检测可用 todo backend 并在 init 时引导用户配置
 * - 仅 local 可用时直接返回（不打扰用户）
 * - 非交互模式时直接返回（保留默认 local）
 * - 用户选 local 时无需写入（默认即 local）
 * - 选非 local 时先 setup，成功后写 settings
 */
async function detectAndConfigureTodoBackend(
  projectRoot: string,
  mainDirPath: string,
  nonInteractive: boolean,
): Promise<void> {
  const ctx = { projectRoot, mainDirPath, nonInteractive };
  const detected = await detectProviders(ctx);
  if (detected.length <= 1) return;
  if (nonInteractive) return;

  const { backend } = await (Enquirer as unknown as {
    prompt: (q: unknown) => Promise<{ backend: string }>;
  }).prompt({
    type: 'select',
    name: 'backend',
    message: t('commands.todo.backend.selectPrompt'),
    choices: detected.map((p) => ({ name: p.name, message: p.displayName })),
    stdout: process.stderr,
  });
  if (backend === 'local') return;

  const provider = getProvider(backend);
  if (!provider) return;
  try {
    await provider.setup(ctx);
  } catch (err) {
    outputWarning(t('commands.todo.backend.setupFailed', {
      backend,
      error: err instanceof Error ? err.message : String(err),
    }));
    return;
  }
  const settingsPath = path.join(projectRoot, '.colyn', 'settings.json');
  await setSettingsValueAtPath(settingsPath, 'todo.backend', backend);
  output(t('commands.todo.backend.configured', { backend }));
}

/**
 * 根据工具链上下文列表配置端口和运行时环境
 *
 * 对每个子项目确定端口（如有 portConfig），并写入运行时配置。
 * 端口来源优先级：--port 显式指定 > 运行时配置中的现有值 > 交互式询问。
 * 已配置过的项目不会被重复询问，也不会被覆盖。
 */
async function configurePortAndEnv(
  contexts: ToolchainContext[],
  options: { port?: string },
  worktreeLabel: string
): Promise<number | undefined> {
  let firstPort: number | undefined;

  for (const ctx of contexts) {
    const portConfig = pluginManager.getPortConfig([ctx.toolchainName]);
    if (!portConfig) continue;

    const existing = await pluginManager.readRuntimeConfig(
      ctx.absolutePath,
      [ctx.toolchainName]
    );
    const existingPort = existing ? parseInt(existing[portConfig.key] ?? '') : NaN;

    let port: number;
    if (!options.port && !isNaN(existingPort)) {
      // 已有端口配置：沿用，不询问也不覆盖
      port = existingPort;
      output(t('commands.init.portReused', { port: String(port) }));
    } else {
      port = await getPortConfig(options, portConfig.defaultPort);
    }

    await pluginManager.writeRuntimeConfig(
      ctx.absolutePath,
      { ...(existing ?? {}), [portConfig.key]: port.toString(), WORKTREE: worktreeLabel },
      [ctx.toolchainName]
    );

    if (firstPort === undefined) {
      firstPort = port;
    }
  }

  return firstPort;
}

/**
 * 处理空目录情况
 */
export async function handleEmptyDirectory(
  dirInfo: DirectoryInfo,
  options: { port?: string },
  nonInteractive = false
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

  // 步骤2: 检测工具链并初始化（空目录通常没有工具链）
  const contexts = await detectAndInitToolchains(mainDirPath, rootDir, nonInteractive);

  // 步骤2.5: 检测并配置 todo backend
  await detectAndConfigureTodoBackend(rootDir, mainDirPath, nonInteractive);

  // 步骤3: 如果有 portConfig，询问端口并写入运行时配置
  const port = await configurePortAndEnv(contexts, options, 'main');

  // 步骤4: 显示成功信息
  displayEmptyDirectorySuccess(mainDirName, port ?? 0, mainBranch);

  return { mainDirPath, mainDirName };
}

/**
 * 处理已初始化目录情况
 */
export async function handleInitializedDirectory(
  dirInfo: DirectoryInfo,
  options: { port?: string },
  nonInteractive = false
): Promise<InitHandlerResult> {
  const rootDir = process.cwd();
  const mainDirName = dirInfo.currentDirName;
  const mainDirPath = path.join(rootDir, mainDirName);

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

  // 检测工具链并初始化（gitignore 等）
  const contexts = await detectAndInitToolchains(mainDirPath, rootDir, nonInteractive);

  // 检测并配置 todo backend
  await detectAndConfigureTodoBackend(rootDir, mainDirPath, nonInteractive);

  // 如果有 portConfig，询问端口并写入运行时配置
  await configurePortAndEnv(contexts, options, 'main');

  // 复用 repair 完成余下的修复：git worktree 连接、已有 worktree 的
  // 运行时配置、孤儿目录检测（工具链与 todo backend 上面已处理）
  try {
    await repairProject({
      contexts,
      skipToolchainSetup: true,
      skipTodoSetup: true,
      nonInteractive
    });
  } catch (error) {
    // 修复失败不阻断 init 流程
    outputWarning(t('commands.init.repairFailed', {
      error: error instanceof Error ? error.message : String(error)
    }));
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

  // 步骤9: 检测工具链并初始化（含 .gitignore 配置）
  const mainDirPath = path.join(rootDir, mainDirName);
  const contexts = await detectAndInitToolchains(mainDirPath, rootDir, skipConfirm);

  // 步骤9.5: 检测并配置 todo backend
  await detectAndConfigureTodoBackend(rootDir, mainDirPath, skipConfirm);

  // 步骤10: 如果有 portConfig，询问端口并写入运行时配置
  const port = await configurePortAndEnv(contexts, options, 'main');

  // 步骤11: 显示成功信息
  displaySuccessInfo(mainDirName, port, mainBranch);

  return { mainDirPath, mainDirName };
}
