import * as path from 'path';
import * as fs from 'fs/promises';
import type { Command } from 'commander';
import Enquirer from 'enquirer';
import {
  getProjectPaths,
  validateProjectInitialized,
  executeInDirectory
} from '../core/paths.js';
import {
  discoverProjectInfo,
  findWorktreeByBranch,
  getMainBranch,
} from '../core/discovery.js';
import type { CommandResult } from '../types/index.js';
import { ColynError } from '../types/index.js';
import { formatError, outputResult, output, outputSuccess } from '../utils/logger.js';
import { t } from '../i18n/index.js';
import {
  isValidBranchName,
  checkIsGitRepo,
  checkMainEnvFile,
  handleBranch,
  createWorktree,
  configureWorktreeEnv,
  displayAddSuccess
} from './add.helpers.js';
import { pluginManager } from '../plugins/index.js';
import { resolveToolchains } from '../core/toolchain-resolver.js';
import * as fsPromises from 'fs/promises';
import {
  isTmuxAvailable,
  isInTmux,
  getCurrentSession,
  sessionExists,
  setupWindow,
  switchWindow,
  getWindowName
} from '../core/tmux.js';
import {
  loadTmuxConfigForBranch,
  resolvePaneCommands,
  resolvePaneLayout,
  validateTmuxConfig
} from '../core/tmux-config.js';
import { getRunCommand } from '../core/config.js';
import { setWorktreeStatus } from '../core/worktree-status.js';
import chalk from 'chalk';
import ora from 'ora';
import simpleGit from 'simple-git';
import { readTodoFile } from './todo.helpers.js';
const { prompt } = Enquirer;

/**
 * tmux 提示文件路径
 */
const TMUX_HINT_FILE = '.tmux-hint-shown';

/**
 * 检查是否已显示过 tmux 提示
 */
async function hasTmuxHintShown(configDir: string): Promise<boolean> {
  try {
    await fs.access(path.join(configDir, TMUX_HINT_FILE));
    return true;
  } catch {
    return false;
  }
}

/**
 * 标记已显示 tmux 提示
 */
async function markTmuxHintShown(configDir: string): Promise<void> {
  try {
    await fs.writeFile(path.join(configDir, TMUX_HINT_FILE), '', 'utf-8');
  } catch {
    // 忽略写入失败
  }
}

/**
 * 设置 tmux window 并启动 pane 命令
 */
async function setupTmuxWindow(
  projectName: string,
  projectRoot: string,
  windowIndex: number,
  branchName: string,
  worktreePath: string
): Promise<{ success: boolean; inTmux: boolean; sessionName?: string }> {
  // 如果 tmux 不可用，直接返回
  if (!isTmuxAvailable()) {
    return { success: false, inTmux: false };
  }

  const windowName = getWindowName(branchName);

  // 加载 tmux 配置并解析 pane 命令和布局（支持分支特定配置）
  const tmuxConfig = await loadTmuxConfigForBranch(projectRoot, branchName);

  // 验证配置（仅显示警告，不阻止执行）
  const validation = validateTmuxConfig(tmuxConfig);
  if (validation.warnings.length > 0) {
    validation.warnings.forEach((warning: string) => {
      output(chalk.yellow(`⚠️  ${warning}`));
    });
  }

  const paneCommands = await resolvePaneCommands(tmuxConfig, worktreePath, projectRoot, branchName);
  const paneLayout = resolvePaneLayout(tmuxConfig);

  const inTmux = isInTmux();

  if (inTmux) {
    // 在 tmux 中：使用当前 session
    const currentSession = getCurrentSession();
    if (currentSession) {
      // 创建新 window 并设置布局
      const success = setupWindow({
        sessionName: currentSession,
        windowIndex,
        windowName,
        workingDir: worktreePath,
        paneCommands,
        paneLayout,
        projectName,
        branchName,
      });

      if (success) {
        // 切换到新创建的 window
        switchWindow(currentSession, windowIndex, projectName, branchName);
      }

      return { success, inTmux: true, sessionName: currentSession };
    }
    return { success: false, inTmux: true };
  } else {
    // 不在 tmux 中：检查 session 是否存在，如果存在则创建 window
    if (sessionExists(projectName)) {
      // session 存在，创建新 window
      const success = setupWindow({
        sessionName: projectName,
        windowIndex,
        windowName,
        workingDir: worktreePath,
        paneCommands,
        paneLayout,
        projectName,
        branchName,
      });
      return { success, inTmux: false, sessionName: projectName };
    }
    return { success: false, inTmux: false };
  }
}

/**
 * 显示 tmux 设置结果信息
 */
function displayTmuxInfo(
  result: { success: boolean; inTmux: boolean; sessionName?: string },
  windowIndex: number,
  branchName: string
): void {
  if (!result.success) {
    return;
  }

  const windowName = getWindowName(branchName);

  output('');
  if (result.inTmux) {
    outputSuccess(t('commands.add.tmuxWindowCreated', { windowIndex, windowName }));
    output(t('commands.add.tmuxPaneClaude'));
    output(t('commands.add.tmuxPaneDevServer'));
    output(t('commands.add.tmuxPaneBash'));
    outputSuccess(t('commands.add.tmuxWindowSwitched', { windowIndex }));
  } else {
    outputSuccess(t('commands.add.tmuxWindowCreatedInSession', {
      sessionName: result.sessionName ?? '',
      windowIndex,
      windowName
    }));
    output(t('commands.add.tmuxPaneClaude'));
    output(t('commands.add.tmuxPaneDevServer'));
    output(t('commands.add.tmuxPaneBash'));
  }
}

/**
 * 显示首次 tmux 提示
 */
function displayFirstTimeTmuxHint(projectName: string): void {
  output('');
  output(chalk.cyan(t('commands.add.tmuxHintTitle')));
  output(chalk.cyan(t('commands.add.tmuxHintAttach', { session: projectName })));
}

/**
 * add 无参数时：交互式创建分支名（type/name）
 */
async function promptCreateBranchNameForAdd(): Promise<string> {
  const typeResponse = await prompt<{ type: string }>({
    type: 'select',
    name: 'type',
    message: t('commands.todo.add.selectType'),
    choices: ['feature', 'bugfix', 'refactor', 'document'],
    stdout: process.stderr,
  });

  const nameResponse = await prompt<{ name: string }>({
    type: 'input',
    name: 'name',
    message: t('commands.todo.add.inputName'),
    stdout: process.stderr,
  });

  const name = nameResponse.name.trim();
  if (!name) {
    throw new ColynError(t('commands.todo.add.emptyName'));
  }

  const branch = `${typeResponse.type}/${name}`;
  if (!isValidBranchName(branch)) {
    throw new ColynError(
      t('commands.add.invalidBranchName'),
      t('commands.add.invalidBranchNameHint')
    );
  }
  return branch;
}

/**
 * add 无参数时：交互式选择目标分支
 * 顺序：新建分支 -> pending todo -> 本地分支（忽略主分支）
 */
async function selectBranchForAdd(configDir: string, mainDir: string, mainBranch: string): Promise<string> {
  type Choice = { type: 'branch'; branch: string } | { type: 'create' };
  const options = new Map<string, Choice>();
  const items: Array<{
    value: string;
    label: string;
    labelDisplay?: string;
    summary: string;
  }> = [];
  let seq = 0;

  const formatBranchLabel = (type: string, name: string, typeWidth: number): { plain: string; display: string } => {
    const paddedType = type + ' '.repeat(Math.max(0, typeWidth - type.length));
    const plain = `${paddedType}  ${name}`;
    const display = `${chalk.gray(paddedType)}  ${chalk.bold(name)}`;
    return { plain, display };
  };

  const pushChoice = (
    choice: Choice,
    label: string,
    summary: string,
  ): void => {
    const value = `opt-${seq++}`;
    options.set(value, choice);
    items.push({ value, label, summary });
  };

  pushChoice(
    { type: 'create' },
    t('commands.add.selectCreateBranchLabel'),
    t('commands.add.selectCreateBranchSummary'),
  );

  const todoFile = await readTodoFile(configDir);
  const pendingTodos = todoFile.todos.filter(item => item.status === 'pending');
  const maxTodoTypeW = pendingTodos.length > 0
    ? Math.max(...pendingTodos.map(item => item.type.length))
    : 0;
  const pendingBranchSet = new Set<string>();

  for (const todo of pendingTodos) {
    const branch = `${todo.type}/${todo.name}`;
    const todoLabel = formatBranchLabel(todo.type, todo.name, maxTodoTypeW);
    pendingBranchSet.add(branch);
    pushChoice(
      { type: 'branch', branch },
      todoLabel.plain,
      `${t('commands.add.selectTodoSummaryPrefix')}: ${todo.message.split('\n')[0]}`,
    );
    items[items.length - 1]!.labelDisplay = todoLabel.display;
  }

  const git = simpleGit(mainDir);
  const localBranches = (await git.branchLocal()).all
    .filter(b => b.trim().length > 0 && b !== 'HEAD' && b !== mainBranch)
    .sort((a, b) => a.localeCompare(b));

  const parsedLocalBranches = localBranches.map(branch => {
    const lastSlash = branch.lastIndexOf('/');
    if (lastSlash === -1) {
      return { branch, type: '', name: branch };
    }
    return {
      branch,
      type: branch.slice(0, lastSlash),
      name: branch.slice(lastSlash + 1) || branch,
    };
  });

  const maxLocalTypeW = parsedLocalBranches.length > 0
    ? Math.max(...parsedLocalBranches.map(item => item.type.length))
    : 0;

  for (const local of parsedLocalBranches) {
    const { branch } = local;
    if (pendingBranchSet.has(branch)) continue;
    const branchLabel = formatBranchLabel(local.type, local.name, maxLocalTypeW);
    pushChoice(
      { type: 'branch', branch },
      branchLabel.plain,
      t('commands.add.selectLocalBranchSummary'),
    );
    items[items.length - 1]!.labelDisplay = branchLabel.display;
  }

  const maxLabelWidth = Math.max(...items.map(item => item.label.length));
  const choices = items.map(item => ({
    name: item.value,
    message: `${item.labelDisplay ?? item.label}${' '.repeat(Math.max(0, maxLabelWidth - item.label.length))}  ${chalk.gray(item.summary)}`,
  }));
  const response = await prompt<{ selected: string }>({
    type: 'select',
    name: 'selected',
    message: t('commands.add.selectBranchPrompt'),
    choices,
    stdout: process.stderr,
  });
  const selectedValue = response.selected;

  const selectedChoice = options.get(selectedValue);
  if (!selectedChoice) {
    throw new ColynError(t('commands.add.branchNameEmpty'));
  }

  if (selectedChoice.type === 'create') {
    return promptCreateBranchNameForAdd();
  }

  return selectedChoice.branch;
}

/**
 * Add 命令：创建新的 worktree
 */
async function addCommand(branchName?: string): Promise<void> {
  try {
    // 步骤1: 获取项目路径并验证
    const paths = await getProjectPaths();
    await validateProjectInitialized(paths);

    // 步骤2: 在主分支目录中检查 git 仓库
    await executeInDirectory(paths.mainDir, async () => {
      await checkIsGitRepo();
    });

    await checkMainEnvFile(paths.rootDir, paths.mainDirName);

    // 步骤3: 解析主分支名；无参时进入交互式分支选择
    const mainBranch = await getMainBranch(paths.mainDir);
    let resolvedBranchName = branchName;
    if (!resolvedBranchName) {
      resolvedBranchName = await selectBranchForAdd(paths.configDir, paths.mainDir, mainBranch);
    }

    // 步骤4: 验证和清理分支名称
    if (!resolvedBranchName || resolvedBranchName.trim() === '') {
      throw new ColynError(t('commands.add.branchNameEmpty'), t('commands.add.branchNameEmptyHint'));
    }
    const cleanBranchName = resolvedBranchName.replace(/^origin\//, '');
    if (!isValidBranchName(cleanBranchName)) {
      throw new ColynError(
        t('commands.add.invalidBranchName'),
        t('commands.add.invalidBranchNameHint')
      );
    }

    // 步骤5: 从文件系统发现项目信息（替代 loadConfig）
    const projectInfo = await discoverProjectInfo(paths.mainDir, paths.worktreesDir);

    // 步骤6: 检查分支是否已有 worktree
    const existingWorktree = await findWorktreeByBranch(
      paths.mainDir,
      paths.worktreesDir,
      cleanBranchName
    );
    if (existingWorktree) {
      throw new ColynError(
        t('commands.add.branchExists', { branch: cleanBranchName }),
        t('commands.add.branchExistsHint', { id: String(existingWorktree.id), path: existingWorktree.path })
      );
    }

    // 步骤7: 在主分支目录中处理分支（本地/远程/新建）
    await executeInDirectory(paths.mainDir, async () => {
      await handleBranch(cleanBranchName, projectInfo.mainBranch);
    });

    // 步骤8: 分配 ID 和端口（从发现的信息中获取）
    const id = projectInfo.nextWorktreeId;
    const port = projectInfo.mainPort + id;

    // 步骤9: 在主分支目录创建 worktree（git 仓库所在地）
    const worktreePath = await executeInDirectory(paths.mainDir, async () => {
      return await createWorktree(paths.rootDir, cleanBranchName, id, projectInfo.worktrees);
    });

    // 步骤10: 配置环境变量（通过工具链解析器）
    const contexts = await resolveToolchains(paths.rootDir, paths.mainDir);

    if (contexts.length > 0) {
      for (const ctx of contexts) {
        const worktreeSubPath = ctx.subPath === '.'
          ? worktreePath
          : path.join(worktreePath, ctx.subPath);

        // 检查子目录是否在新 worktree 中存在
        try {
          await fsPromises.access(worktreeSubPath);
        } catch {
          output(t('toolchain.subProjectSkipped', { path: ctx.subPath }));
          continue;
        }

        // 从主分支对应子目录读取 base config
        const mainConfig = await pluginManager.readRuntimeConfig(ctx.absolutePath, [ctx.toolchainName]);
        if (mainConfig !== null) {
          const portConfig = pluginManager.getPortConfig([ctx.toolchainName]);
          const portKey = portConfig?.key ?? 'PORT';
          const basePort = parseInt(mainConfig[portKey] || '0') || 0;
          const worktreeConfig: Record<string, string> = {
            ...mainConfig,
            [portKey]: (basePort + id).toString(),
            WORKTREE: id.toString(),
          };
          await pluginManager.writeRuntimeConfig(worktreeSubPath, worktreeConfig, [ctx.toolchainName]);
        }
      }
    } else {
      await configureWorktreeEnv(paths.mainDir, worktreePath, id, port);
    }

    // 步骤10.5: 安装依赖
    if (contexts.length > 0) {
      const installSpinner = ora({ text: t('commands.add.installingDeps'), stream: process.stderr }).start();
      try {
        for (const ctx of contexts) {
          const worktreeSubPath = ctx.subPath === '.'
            ? worktreePath
            : path.join(worktreePath, ctx.subPath);
          try {
            await fsPromises.access(worktreeSubPath);
            await pluginManager.runInstall(worktreeSubPath, [ctx.toolchainName]);
          } catch {
            // 子目录不存在或安装失败，跳过
          }
        }
        installSpinner.succeed(t('commands.add.depsInstalled'));
      } catch {
        installSpinner.warn(t('commands.add.depsInstallFailed'));
        // install 失败不阻断 add 流程
      }
    }

    // 步骤10.6: 更新 worktree 状态为 idle
    try {
      await setWorktreeStatus(paths.configDir, `task-${id}`, paths.rootDir, 'idle');
    } catch { /* 状态更新失败不影响主流程 */ }

    // 步骤11: 计算相对路径并显示成功信息
    const displayPath = path.relative(paths.rootDir, worktreePath);
    const runCommand = await getRunCommand(paths.configDir);
    displayAddSuccess(id, cleanBranchName, worktreePath, port, displayPath, runCommand);

    // 步骤12: 设置 tmux window（如果可用）
    const projectName = paths.mainDirName;
    const tmuxResult = await setupTmuxWindow(projectName, paths.rootDir, id, cleanBranchName, worktreePath);

    // 显示 tmux 信息
    displayTmuxInfo(tmuxResult, id, cleanBranchName);

    // 如果不在 tmux 中且这是第一次创建 worktree，显示 tmux 提示
    if (!tmuxResult.inTmux && isTmuxAvailable()) {
      const hintShown = await hasTmuxHintShown(paths.configDir);
      if (!hintShown) {
        displayFirstTimeTmuxHint(projectName);
        await markTmuxHintShown(paths.configDir);
      }
    }

    // 步骤13: 输出 JSON 结果到 stdout（供 bash 解析）
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
    .command('add [branch]')
    .description(t('commands.add.description'))
    .action(async (branch: string | undefined) => {
      await addCommand(branch);
    });
}
