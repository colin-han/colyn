/**
 * tmux 命令
 *
 * 修复和管理项目的 tmux session 和 windows
 */

import { Command } from 'commander';
import ora from 'ora';
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
  killSession
} from '../core/tmux.js';
import {
  loadTmuxConfig,
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
  _projectRoot: string
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
          error: `重命名失败: ${currentName} → ${expectedName}`
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
    const paneCommands = await resolvePaneCommands(tmuxConfig, workingDir);
    const paneLayout = resolvePaneLayout(tmuxConfig);

    const success = setupWindow({
      sessionName,
      windowIndex,
      windowName: expectedName,
      workingDir,
      paneCommands,
      paneLayout,
      skipWindowCreation: windowIndex === 0 // Window 0 需要特殊处理
    });

    if (success) {
      result.createdWindows.push({ id: windowIndex, name: expectedName });
    } else {
      result.failedWindows.push({
        id: windowIndex,
        error: '创建 window 失败'
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

  // 加载 tmux 配置
  const tmuxConfig = await loadTmuxConfig(projectRoot);

  // 修复 Window 0 (main)
  await repairSingleWindow(
    result,
    sessionName,
    0,
    mainBranch,
    mainDir,
    tmuxConfig,
    projectRoot
  );

  // 修复所有 worktree windows
  for (const wt of worktrees) {
    await repairSingleWindow(
      result,
      sessionName,
      wt.id,
      wt.branch,
      wt.path,
      tmuxConfig,
      projectRoot
    );
  }

  return result;
}

/**
 * 显示修复摘要
 */
function displayRepairSummary(tmuxResult: TmuxRepairResult): void {
  outputLine();
  outputSuccess('Tmux 修复完成\n');

  outputBold('修复摘要');

  if (!tmuxResult.available) {
    output('  - tmux 未安装');
    return;
  }

  if (!tmuxResult.sessionName) {
    output('  - tmux session 创建失败');
    return;
  }

  // 统计
  const totalCreated = tmuxResult.createdWindows.length;
  const totalRenamed = tmuxResult.renamedWindows.length;
  const totalExisting = tmuxResult.existingWindows.length;
  const totalFailed = tmuxResult.failedWindows.length;

  if (tmuxResult.createdSession) {
    output(`  ✓ 创建了 tmux session: ${tmuxResult.sessionName}`);
  }

  if (totalCreated > 0) {
    output(`  ✓ 创建了 ${totalCreated} 个 tmux window`);
  }

  if (totalRenamed > 0) {
    output(`  ✓ 重命名了 ${totalRenamed} 个 tmux window`);
  }

  if (totalExisting > 0) {
    output(`  ✓ ${totalExisting} 个 tmux window 已存在（保持原布局）`);
  }

  if (totalFailed > 0) {
    outputWarning(`  ⚠ ${totalFailed} 个 tmux window 修复失败`);
  }

  // 详细信息
  if (totalCreated > 0 || totalRenamed > 0 || totalFailed > 0) {
    outputLine();
    outputBold('详细信息');

    if (totalCreated > 0) {
      output('已创建的 tmux window：');
      for (const win of tmuxResult.createdWindows) {
        output(`  ✓ Window ${win.id}: ${win.name}`);
      }
      outputLine();
    }

    if (totalRenamed > 0) {
      output('已重命名的 tmux window：');
      for (const win of tmuxResult.renamedWindows) {
        output(`  ✓ Window ${win.id}: ${win.oldName} → ${win.newName}`);
      }
      outputLine();
    }

    if (totalFailed > 0) {
      outputWarning('创建失败的 tmux window：');
      for (const win of tmuxResult.failedWindows) {
        output(`  ✗ Window ${win.id}: ${win.error}`);
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
        'tmux 未安装',
        '请先安装 tmux: brew install tmux'
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
      text: '检查并修复 tmux session 和 windows...',
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
      spinner.fail('tmux session 创建失败');
      outputResult({ success: false });
      process.exit(1);
    }

    if (tmuxResult.createdSession) {
      if (tmuxResult.createdWindows.length > 0) {
        spinner.succeed(`创建了 session "${tmuxResult.sessionName}" 和 ${tmuxResult.createdWindows.length} 个 window`);
      } else {
        spinner.succeed(`创建了 session "${tmuxResult.sessionName}"`);
      }
    } else if (tmuxResult.createdWindows.length > 0) {
      spinner.succeed(`创建了 ${tmuxResult.createdWindows.length} 个 tmux window`);
    } else if (tmuxResult.failedWindows.length > 0) {
      spinner.warn(`${tmuxResult.failedWindows.length} 个 tmux window 创建失败`);
    } else {
      spinner.succeed('所有 tmux window 已存在');
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
          output(`正在切换到 session "${tmuxResult.sessionName}"...`);
          const switched = switchClient(tmuxResult.sessionName);
          if (switched) {
            outputSuccess(`已切换到 session "${tmuxResult.sessionName}"`);
          } else {
            outputWarning('切换 session 失败');
          }
        }
      } else {
        // 不在 tmux 中，attach 到 session
        outputLine();
        output(`正在连接到 session "${tmuxResult.sessionName}"...`);
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
async function tmuxStopCommand(): Promise<void> {
  try {
    // 检查 tmux 是否可用
    if (!isTmuxAvailable()) {
      throw new ColynError(
        'tmux 未安装',
        '请先安装 tmux: brew install tmux'
      );
    }

    // 1. 获取项目路径
    const paths = await getProjectPaths();
    await validateProjectInitialized(paths);

    const sessionName = paths.mainDirName;

    // 2. 检查 session 是否存在
    if (!sessionExists(sessionName)) {
      outputWarning(`Session "${sessionName}" 不存在`);
      outputResult({ success: true });
      return;
    }

    // 3. 检查是否在目标 session 中
    const inTmux = isInTmux();
    if (inTmux) {
      const currentSession = getCurrentSession();
      if (currentSession === sessionName) {
        throw new ColynError(
          '无法结束当前 session',
          `您正在 session "${sessionName}" 中，无法结束当前 session。请先切换到其他 session 或退出 tmux。`
        );
      }
    }

    // 4. 结束 session
    const spinner = ora({
      text: `正在结束 tmux session "${sessionName}"...`,
      stream: process.stderr
    }).start();

    const success = killSession(sessionName);

    if (success) {
      spinner.succeed(`已结束 tmux session "${sessionName}"`);
      outputResult({ success: true });
    } else {
      spinner.fail(`结束 tmux session "${sessionName}" 失败`);
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
    .description('管理项目的 tmux session 和 windows');

  // start 子命令
  tmux
    .command('start')
    .description('启动并修复项目的 tmux session 和 windows')
    .action(async () => {
      await tmuxStartCommand();
    });

  // stop 子命令
  tmux
    .command('stop')
    .description('结束当前项目的 tmux session')
    .action(async () => {
      await tmuxStopCommand();
    });

  // 默认执行 start 命令
  tmux.action(async () => {
    await tmuxStartCommand();
  });
}
