/**
 * tmux 命令
 *
 * 修复和管理项目的 tmux session 和 windows
 */

import { Command } from 'commander';
import enquirer from 'enquirer';
import ora from 'ora';
import { t } from '../i18n/index.js';
import { getProjectPaths, validateProjectInitialized } from '../core/paths.js';
import { discoverWorktrees, getMainBranch } from '../core/discovery.js';
import {
  isTmuxAvailable,
  isInTmux,
  getCurrentSession,
  sessionExists,
  createSession,
  windowExists,
  setupWindow,
  getWindowName,
  getWindowCurrentName,
  renameWindow,
  switchClient,
  killSession,
  detachClient
} from '../core/tmux.js';
import {
  loadTmuxConfigForBranch,
  resolvePaneCommands,
  resolvePaneLayout,
  type TmuxConfig
} from '../core/tmux-config.js';
import {
  output,
  outputLine,
  outputSuccess,
  outputWarning,
  outputBold,
  formatError,
  outputResult
} from '../utils/logger.js';
import { ColynError } from '../types/index.js';

/**
 * tmux 修复结果
 */
interface TmuxRepairResult {
  /** 是否可用 */
  available: boolean;
  /** session 名称 */
  sessionName?: string;
  /** 是否在 tmux 中 */
  inTmux: boolean;
  /** 是否创建了 session */
  createdSession: boolean;
  /** 创建的 window 列表 */
  createdWindows: Array<{ id: number; name: string }>;
  /** 已存在的 window 列表（跳过） */
  existingWindows: Array<{ id: number; name: string }>;
  /** 重命名的 window 列表 */
  renamedWindows: Array<{ id: number; oldName: string; newName: string }>;
  /** 修复失败的 */
  failedWindows: Array<{ id: number; error: string }>;
}

/**
 * 修复单个 tmux window
 */
async function repairSingleWindow(
  result: TmuxRepairResult,
  sessionName: string,
  windowIndex: number,
  branch: string,
  workingDir: string,
  tmuxConfig: TmuxConfig,
  projectRoot: string,
  projectName: string
): Promise<void> {
  const expectedName = getWindowName(branch);

  // 检查 window 是否存在
  if (windowExists(sessionName, windowIndex)) {
    // Window 已存在，检查名称是否一致
    const currentName = getWindowCurrentName(sessionName, windowIndex);

    if (currentName && currentName !== expectedName) {
      // 名称不一致，需要重命名
      const renamed = renameWindow(sessionName, windowIndex, expectedName);
      if (renamed) {
        result.renamedWindows.push({
          id: windowIndex,
          oldName: currentName,
          newName: expectedName
        });
      } else {
        result.failedWindows.push({
          id: windowIndex,
          error: t('commands.tmux.renameWindowFailed', { currentName, expectedName })
        });
      }
    } else {
      // 名称一致，跳过
      result.existingWindows.push({ id: windowIndex, name: expectedName });
    }
    return;
  }

  // Window 不存在，创建并设置布局
  try {
    // 解析 pane 命令和布局
    const paneCommands = await resolvePaneCommands(tmuxConfig, workingDir, projectRoot, branch);
    const paneLayout = resolvePaneLayout(tmuxConfig);

    const success = setupWindow({
      sessionName,
      windowIndex,
      windowName: expectedName,
      workingDir,
      paneCommands,
      paneLayout,
      skipWindowCreation: windowIndex === 0, // Window 0 需要特殊处理
      projectName,
      branchName: branch
    });

    if (success) {
      result.createdWindows.push({ id: windowIndex, name: expectedName });
    } else {
      result.failedWindows.push({
        id: windowIndex,
        error: t('commands.tmux.createWindowFailed')
      });
    }
  } catch (error) {
    result.failedWindows.push({
      id: windowIndex,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * 修复 tmux windows
 * - 如果 session 不存在，创建 session
 * - 如果 window 不存在，创建并设置三分布局
 * - 如果 window 已存在，不修改已有布局
 */
async function repairTmuxWindows(
  projectName: string,
  projectRoot: string,
  mainDir: string,
  mainBranch: string,
  worktrees: Array<{ id: number; branch: string; path: string }>
): Promise<TmuxRepairResult> {
  const result: TmuxRepairResult = {
    available: false,
    inTmux: false,
    createdSession: false,
    createdWindows: [],
    existingWindows: [],
    renamedWindows: [],
    failedWindows: []
  };

  // 检查 tmux 是否可用
  if (!isTmuxAvailable()) {
    return result;
  }
  result.available = true;

  // 确定 session 名称
  const inTmux = isInTmux();
  result.inTmux = inTmux;

  let sessionName: string;
  if (inTmux) {
    const currentSession = getCurrentSession();
    if (!currentSession) {
      return result;
    }
    sessionName = currentSession;
  } else {
    // 不在 tmux 中，检查项目 session 是否存在
    if (!sessionExists(projectName)) {
      // Session 不存在，创建它
      const created = createSession(projectName, mainDir);
      if (!created) {
        return result;
      }
      result.createdSession = true;
    }
    sessionName = projectName;
  }
  result.sessionName = sessionName;

  // 修复 Window 0 (main) - 使用 main 分支的配置
  const mainTmuxConfig = await loadTmuxConfigForBranch(projectRoot, mainBranch);
  await repairSingleWindow(
    result,
    sessionName,
    0,
    mainBranch,
    mainDir,
    mainTmuxConfig,
    projectRoot,
    projectName
  );

  // 修复所有 worktree windows - 每个使用对应分支的配置
  for (const wt of worktrees) {
    const wtTmuxConfig = await loadTmuxConfigForBranch(projectRoot, wt.branch);
    await repairSingleWindow(
      result,
      sessionName,
      wt.id,
      wt.branch,
      wt.path,
      wtTmuxConfig,
      projectRoot,
      projectName
    );
  }

  return result;
}

/**
 * 显示修复摘要
 */
function displayRepairSummary(tmuxResult: TmuxRepairResult): void {
  outputLine();
  outputSuccess(`${t('commands.tmux.repairComplete')}\n`);

  outputBold(t('commands.tmux.repairSummary'));

  if (!tmuxResult.available) {
    output(`  - ${t('commands.tmux.notInstalled')}`);
    return;
  }

  if (!tmuxResult.sessionName) {
    output(`  - ${t('commands.tmux.sessionCreateFailed')}`);
    return;
  }

  // 统计
  const totalCreated = tmuxResult.createdWindows.length;
  const totalRenamed = tmuxResult.renamedWindows.length;
  const totalExisting = tmuxResult.existingWindows.length;
  const totalFailed = tmuxResult.failedWindows.length;

  if (tmuxResult.createdSession) {
    output(t('commands.tmux.repairCreatedSession', { sessionName: tmuxResult.sessionName }));
  }

  if (totalCreated > 0) {
    output(t('commands.tmux.repairCreatedWindows', { count: totalCreated }));
  }

  if (totalRenamed > 0) {
    output(t('commands.tmux.repairRenamedWindows', { count: totalRenamed }));
  }

  if (totalExisting > 0) {
    output(t('commands.tmux.repairExistingWindows', { count: totalExisting }));
  }

  if (totalFailed > 0) {
    outputWarning(t('commands.tmux.repairFailedWindows', { count: totalFailed }));
  }

  // 详细信息
  if (totalCreated > 0 || totalRenamed > 0 || totalFailed > 0) {
    outputLine();
    outputBold(t('commands.tmux.repairDetails'));

    if (totalCreated > 0) {
      output(t('commands.tmux.createdWindowsTitle'));
      for (const win of tmuxResult.createdWindows) {
        output(t('commands.tmux.createdWindowItem', { id: win.id, name: win.name }));
      }
      outputLine();
    }

    if (totalRenamed > 0) {
      output(t('commands.tmux.renamedWindowsTitle'));
      for (const win of tmuxResult.renamedWindows) {
        output(t('commands.tmux.renamedWindowItem', { id: win.id, oldName: win.oldName, newName: win.newName }));
      }
      outputLine();
    }

    if (totalFailed > 0) {
      outputWarning(t('commands.tmux.failedWindowsTitle'));
      for (const win of tmuxResult.failedWindows) {
        output(t('commands.tmux.failedWindowItem', { id: win.id, error: win.error }));
      }
      outputLine();
    }
  }
}

/**
 * tmux start 命令主函数
 */
async function tmuxStartCommand(): Promise<void> {
  try {
    // 检查 tmux 是否可用
    if (!isTmuxAvailable()) {
      throw new ColynError(
        t('commands.tmux.notInstalled'),
        t('commands.tmux.installHint')
      );
    }

    // 1. 获取项目路径
    const paths = await getProjectPaths();
    await validateProjectInitialized(paths);

    // 2. 获取主分支
    let mainBranch = 'main';
    try {
      mainBranch = await getMainBranch(paths.mainDir);
    } catch {
      // 使用默认值
    }

    // 3. 获取所有 worktree
    const worktrees = await discoverWorktrees(paths.mainDir, paths.worktreesDir);

    // 4. 修复 tmux windows
    const spinner = ora({
      text: t('commands.tmux.repairing'),
      stream: process.stderr
    }).start();

    const tmuxResult = await repairTmuxWindows(
      paths.mainDirName,
      paths.rootDir,
      paths.mainDir,
      mainBranch,
      worktrees.map(wt => ({ id: wt.id, branch: wt.branch, path: wt.path }))
    );

    if (!tmuxResult.sessionName) {
      spinner.fail(t('commands.tmux.sessionCreateFailed'));
      outputWarning(t('commands.tmux.sessionCreateFailedHint', { sessionName: paths.mainDirName }));
      if (tmuxResult.failedWindows.length > 0) {
        outputWarning(t('commands.tmux.failedWindowsTitle'));
        for (const win of tmuxResult.failedWindows) {
          output(t('commands.tmux.failedWindowItemCompact', { id: win.id, error: win.error }));
        }
      }
      outputResult({ success: false });
      process.exit(1);
    }

    if (tmuxResult.createdSession) {
      if (tmuxResult.createdWindows.length > 0) {
        spinner.succeed(t('commands.tmux.createdSessionAndWindows', {
          sessionName: tmuxResult.sessionName,
          count: tmuxResult.createdWindows.length
        }));
      } else {
        spinner.succeed(t('commands.tmux.createdSession', { sessionName: tmuxResult.sessionName }));
      }
    } else if (tmuxResult.createdWindows.length > 0) {
      spinner.succeed(t('commands.tmux.createdWindows', { count: tmuxResult.createdWindows.length }));
    } else if (tmuxResult.failedWindows.length > 0) {
      spinner.warn(t('commands.tmux.windowsCreateFailed', { count: tmuxResult.failedWindows.length }));
    } else {
      spinner.succeed(t('commands.tmux.allWindowsExist'));
    }

    // 5. 显示修复摘要
    displayRepairSummary(tmuxResult);

    // 6. 自动加载 tmux session
    if (tmuxResult.sessionName) {
      const inTmux = isInTmux();

      if (inTmux) {
        // 已在 tmux 中，检查是否在同一个 session
        const currentSession = getCurrentSession();
        if (currentSession && currentSession !== tmuxResult.sessionName) {
          // 在不同的 session 中，切换到目标 session
          outputLine();
          output(t('commands.tmux.switchingSession', { sessionName: tmuxResult.sessionName }));
          const switched = switchClient(tmuxResult.sessionName);
          if (switched) {
            outputSuccess(t('commands.tmux.switchedSession', { sessionName: tmuxResult.sessionName }));
          } else {
            outputWarning(t('commands.tmux.switchSessionFailed'));
          }
        }
      } else {
        // 不在 tmux 中，attach 到 session
        outputLine();
        output(t('commands.tmux.attachingSession', { sessionName: tmuxResult.sessionName }));
        // attach 会阻塞当前进程，所以这里只输出提示信息
        // 实际的 attach 由 bash 脚本处理
        outputResult({
          success: true,
          attachSession: tmuxResult.sessionName
        });
        return;
      }
    }

    // 输出结果给 bash 脚本
    outputResult({
      success: true
    });
  } catch (error) {
    formatError(error);
    outputResult({
      success: false
    });
    process.exit(1);
  }
}

/**
 * tmux stop 命令主函数
 */
async function tmuxStopCommand(options: { force?: boolean }): Promise<void> {
  try {
    // 检查 tmux 是否可用
    if (!isTmuxAvailable()) {
      throw new ColynError(
        t('commands.tmux.notInstalled'),
        t('commands.tmux.installHint')
      );
    }

    // 1. 获取项目路径
    const paths = await getProjectPaths();
    await validateProjectInitialized(paths);

    const sessionName = paths.mainDirName;

    // 2. 检查 session 是否存在
    if (!sessionExists(sessionName)) {
      outputWarning(t('commands.tmux.sessionNotExists', { sessionName }));
      outputResult({ success: true });
      return;
    }

    // 3. 检查是否在目标 session 中
    const inTmux = isInTmux();
    let needDetach = false;

    if (inTmux) {
      const currentSession = getCurrentSession();
      if (currentSession === sessionName) {
        needDetach = true;
      }
    }

    // 4. 如果需要 detach 且没有 --force，则请求确认
    if (needDetach && !options.force) {
      const { confirmed } = await enquirer.prompt<{ confirmed: boolean }>({
        type: 'confirm',
        name: 'confirmed',
        message: t('commands.tmux.confirmStop', { sessionName }),
        initial: false,
        stdout: process.stderr // 重要：输出到 stderr
      });

      if (!confirmed) {
        output(t('commands.tmux.stopCanceled'));
        outputResult({ success: false });
        return;
      }
    }

    // 5. 结束 session
    const spinner = ora({
      text: t('commands.tmux.stoppingSession', { sessionName }),
      stream: process.stderr
    }).start();

    // 如果需要 detach，先断开连接
    if (needDetach) {
      spinner.text = t('commands.tmux.detachingAndStopping', { sessionName });
      detachClient();
      // 给 tmux 一点时间处理 detach
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const success = killSession(sessionName);

    if (success) {
      spinner.succeed(t('commands.tmux.sessionStopped', { sessionName }));
      outputResult({ success: true });
    } else {
      spinner.fail(t('commands.tmux.stopFailed', { sessionName }));
      outputResult({ success: false });
      process.exit(1);
    }
  } catch (error) {
    formatError(error);
    outputResult({
      success: false
    });
    process.exit(1);
  }
}

/**
 * 注册 tmux 命令
 */
export function register(program: Command): void {
  const tmux = program
    .command('tmux')
    .description(t('commands.tmux.description'));

  // start 子命令
  tmux
    .command('start')
    .description(t('commands.tmux.startDescription'))
    .action(async () => {
      await tmuxStartCommand();
    });

  // stop 子命令
  tmux
    .command('stop')
    .description(t('commands.tmux.stopDescription'))
    .option('-f, --force', t('commands.tmux.forceOption'))
    .action(async (options: { force?: boolean }) => {
      await tmuxStopCommand(options);
    });

  // 默认执行 start 命令
  tmux.action(async () => {
    await tmuxStartCommand();
  });
}
