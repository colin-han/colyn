import * as path from 'path';
import * as fs from 'fs/promises';
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
import {
  isTmuxAvailable,
  isInTmux,
  getCurrentSession,
  sessionExists,
  setupWindow,
  switchWindow,
  getWindowName
} from '../core/tmux.js';
import { loadTmuxConfig, resolvePaneCommands, resolvePaneLayout } from '../core/tmux-config.js';
import { getRunCommand } from '../core/config.js';
import chalk from 'chalk';

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

  // 加载 tmux 配置并解析 pane 命令和布局
  const tmuxConfig = await loadTmuxConfig(projectRoot);
  const paneCommands = await resolvePaneCommands(tmuxConfig, worktreePath);
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
      });

      if (success) {
        // 切换到新创建的 window
        switchWindow(currentSession, windowIndex);
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
 * Add 命令：创建新的 worktree
 */
async function addCommand(branchName: string): Promise<void> {
  try {
    // 步骤1: 验证和清理分支名称
    if (!branchName || branchName.trim() === '') {
      throw new ColynError(t('commands.add.branchNameEmpty'), t('commands.add.branchNameEmptyHint'));
    }

    const cleanBranchName = branchName.replace(/^origin\//, '');

    if (!isValidBranchName(cleanBranchName)) {
      throw new ColynError(
        t('commands.add.invalidBranchName'),
        t('commands.add.invalidBranchNameHint')
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
        t('commands.add.branchExists', { branch: cleanBranchName }),
        t('commands.add.branchExistsHint', { id: String(existingWorktree.id), path: existingWorktree.path })
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
    const runCommand = await getRunCommand(paths.configDir);
    displayAddSuccess(id, cleanBranchName, worktreePath, port, displayPath, runCommand);

    // 步骤11: 设置 tmux window（如果可用）
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

    // 步骤12: 输出 JSON 结果到 stdout（供 bash 解析）
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
    .description(t('commands.add.description'))
    .action(async (branch: string) => {
      await addCommand(branch);
    });
}
