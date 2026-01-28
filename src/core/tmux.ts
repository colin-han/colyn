/**
 * tmux 集成工具模块
 *
 * 提供 tmux 环境检测、session/window/pane 管理功能
 */

import { execSync } from 'child_process';
import type { ResolvedPaneCommands } from './tmux-config.js';

/**
 * tmux 环境信息
 */
export interface TmuxEnvironment {
  /** tmux 是否已安装 */
  available: boolean;
  /** 是否在 tmux 环境中 */
  inTmux: boolean;
  /** 当前 session 名称（如果在 tmux 中） */
  currentSession?: string;
  /** 当前 window 索引（如果在 tmux 中） */
  currentWindowIndex?: number;
}

/**
 * 执行 tmux 命令
 * @param command tmux 子命令和参数
 * @param options 选项
 * @returns 命令输出（如果成功）
 */
function execTmux(
  command: string,
  options: { silent?: boolean; ignoreError?: boolean } = {}
): string {
  try {
    const output = execSync(`tmux ${command}`, {
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : ['pipe', 'pipe', 'pipe'],
    });
    return output.trim();
  } catch (error) {
    if (options.ignoreError) {
      return '';
    }
    throw error;
  }
}

/**
 * 检测 tmux 是否已安装
 */
export function isTmuxAvailable(): boolean {
  try {
    execSync('which tmux', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 检测是否在 tmux 环境中
 */
export function isInTmux(): boolean {
  return !!process.env.TMUX;
}

/**
 * 获取当前 tmux session 名称
 * @returns session 名称，如果不在 tmux 中返回 null
 */
export function getCurrentSession(): string | null {
  if (!isInTmux()) {
    return null;
  }

  try {
    return execTmux('display-message -p "#{session_name}"', { silent: true });
  } catch {
    return null;
  }
}

/**
 * 获取当前 window 索引
 * @returns window 索引，如果不在 tmux 中返回 null
 */
export function getCurrentWindowIndex(): number | null {
  if (!isInTmux()) {
    return null;
  }

  try {
    const index = execTmux('display-message -p "#{window_index}"', {
      silent: true,
    });
    return parseInt(index, 10);
  } catch {
    return null;
  }
}

/**
 * 获取 tmux 环境完整信息
 */
export function getTmuxEnvironment(): TmuxEnvironment {
  const available = isTmuxAvailable();
  const inTmux = isInTmux();

  return {
    available,
    inTmux,
    currentSession: inTmux ? getCurrentSession() ?? undefined : undefined,
    currentWindowIndex:
      inTmux ? getCurrentWindowIndex() ?? undefined : undefined,
  };
}

/**
 * 检查 session 是否存在
 * @param sessionName session 名称
 */
export function sessionExists(sessionName: string): boolean {
  try {
    execTmux(`has-session -t "${sessionName}"`, { silent: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * 创建新的 tmux session（detached 模式）
 * @param sessionName session 名称
 * @param workingDir 工作目录
 * @returns 是否成功
 */
export function createSession(
  sessionName: string,
  workingDir: string
): boolean {
  try {
    // 如果 session 已存在，直接返回成功
    if (sessionExists(sessionName)) {
      return true;
    }

    // 创建 detached session
    execTmux(`new-session -d -s "${sessionName}" -c "${workingDir}"`, {
      silent: true,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 检查 window 是否存在
 * @param sessionName session 名称
 * @param windowIndex window 索引
 */
export function windowExists(
  sessionName: string,
  windowIndex: number
): boolean {
  try {
    execTmux(`select-window -t "${sessionName}:${windowIndex}"`, {
      silent: true,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 从分支名提取 window 名称
 * 使用分支名的最后一段
 * @param branch 分支名
 * @returns window 名称
 */
export function getWindowName(branch: string): string {
  return branch.split('/').pop() || branch;
}

/**
 * 创建新的 tmux window
 * @param sessionName session 名称
 * @param windowIndex window 索引
 * @param windowName window 名称
 * @param workingDir 工作目录
 * @returns 是否成功
 */
export function createWindow(
  sessionName: string,
  windowIndex: number,
  windowName: string,
  workingDir: string
): boolean {
  try {
    // 检查是否是创建 window 0（需要重命名而不是新建）
    if (windowIndex === 0) {
      // session 创建时会自动创建 window 0，只需要重命名
      execTmux(
        `rename-window -t "${sessionName}:0" "${windowName}"`,
        { silent: true }
      );
      return true;
    }

    // 创建新 window，使用 -t 指定目标 session 和索引
    execTmux(
      `new-window -t "${sessionName}:${windowIndex}" -n "${windowName}" -c "${workingDir}"`,
      { silent: true }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * 设置 3-pane 固定布局
 * 布局: 左 60% | 右上 30% | 右下 70%
 *
 * @param sessionName session 名称
 * @param windowIndex window 索引
 * @param workingDir 工作目录
 * @returns 是否成功
 */
export function setupPaneLayout(
  sessionName: string,
  windowIndex: number,
  workingDir: string
): boolean {
  const target = `${sessionName}:${windowIndex}`;

  try {
    // 1. 垂直分割：左 60%，右 40%
    execTmux(`split-window -t "${target}" -h -p 40 -c "${workingDir}"`, {
      silent: true,
    });

    // 2. 分割右侧为上下：上 30%，下 70%
    execTmux(`split-window -t "${target}" -v -p 70 -c "${workingDir}"`, {
      silent: true,
    });

    // 3. 选择左侧 pane (pane 0)
    execTmux(`select-pane -t "${target}.0"`, { silent: true });

    return true;
  } catch {
    return false;
  }
}

/**
 * 向指定 pane 发送命令
 * @param sessionName session 名称
 * @param windowIndex window 索引
 * @param paneIndex pane 索引
 * @param command 要执行的命令
 */
export function sendKeys(
  sessionName: string,
  windowIndex: number,
  paneIndex: number,
  command: string
): boolean {
  const target = `${sessionName}:${windowIndex}.${paneIndex}`;

  try {
    // 发送命令并按 Enter
    execTmux(`send-keys -t "${target}" "${command}" Enter`, { silent: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * 切换到指定 window
 * @param sessionName session 名称
 * @param windowIndex window 索引
 */
export function switchWindow(
  sessionName: string,
  windowIndex: number
): boolean {
  try {
    execTmux(`select-window -t "${sessionName}:${windowIndex}"`, {
      silent: true,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 重命名 window
 * @param sessionName session 名称
 * @param windowIndex window 索引
 * @param newName 新名称
 */
export function renameWindow(
  sessionName: string,
  windowIndex: number,
  newName: string
): boolean {
  try {
    execTmux(`rename-window -t "${sessionName}:${windowIndex}" "${newName}"`, {
      silent: true,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取 session 的所有 window 列表
 * @param sessionName session 名称
 * @returns window 信息数组
 */
export function listWindows(
  sessionName: string
): Array<{ index: number; name: string }> {
  try {
    const output = execTmux(
      `list-windows -t "${sessionName}" -F "#{window_index}:#{window_name}"`,
      { silent: true }
    );

    if (!output) {
      return [];
    }

    return output.split('\n').map((line) => {
      const [indexStr, name] = line.split(':');
      return {
        index: parseInt(indexStr, 10),
        name,
      };
    });
  } catch {
    return [];
  }
}

/**
 * 获取指定 window 的当前名称
 * @param sessionName session 名称
 * @param windowIndex window 索引
 * @returns window 名称，如果不存在返回 null
 */
export function getWindowCurrentName(
  sessionName: string,
  windowIndex: number
): string | null {
  try {
    const output = execTmux(
      `display-message -t "${sessionName}:${windowIndex}" -p "#{window_name}"`,
      { silent: true }
    );
    return output || null;
  } catch {
    return null;
  }
}

/**
 * 设置完整的 window 布局并启动服务
 * 这是一个高级函数，组合了创建 window、设置布局、启动 dev server
 *
 * @param options 配置选项
 */
export interface SetupWindowOptions {
  /** session 名称 */
  sessionName: string;
  /** window 索引 */
  windowIndex: number;
  /** window 名称 */
  windowName: string;
  /** 工作目录 */
  workingDir: string;
  /** dev server 启动命令（如果有）- 向后兼容 */
  devCommand?: string;
  /** 各 pane 的命令配置 */
  paneCommands?: ResolvedPaneCommands;
  /** 是否跳过 window 创建（用于 window 0） */
  skipWindowCreation?: boolean;
}

/**
 * 设置完整的 window 环境
 * @param options 配置选项
 * @returns 是否成功
 */
export function setupWindow(options: SetupWindowOptions): boolean {
  const {
    sessionName,
    windowIndex,
    windowName,
    workingDir,
    devCommand,
    paneCommands,
    skipWindowCreation = false,
  } = options;

  try {
    // 1. 创建 window（如果需要）
    if (!skipWindowCreation) {
      if (!createWindow(sessionName, windowIndex, windowName, workingDir)) {
        return false;
      }
    } else {
      // 只重命名 window 0
      renameWindow(sessionName, windowIndex, windowName);
    }

    // 2. 设置 3-pane 布局
    if (!setupPaneLayout(sessionName, windowIndex, workingDir)) {
      return false;
    }

    // 3. 发送命令到各个 pane
    if (paneCommands) {
      // 使用新的 paneCommands 配置
      if (paneCommands.pane0) {
        sendKeys(sessionName, windowIndex, 0, paneCommands.pane0);
      }
      if (paneCommands.pane1) {
        sendKeys(sessionName, windowIndex, 1, paneCommands.pane1);
      }
      if (paneCommands.pane2) {
        sendKeys(sessionName, windowIndex, 2, paneCommands.pane2);
      }
    } else if (devCommand) {
      // 向后兼容：如果只提供 devCommand，在 pane 1 执行
      sendKeys(sessionName, windowIndex, 1, devCommand);
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * 删除 window
 * @param sessionName session 名称
 * @param windowIndex window 索引
 */
export function killWindow(sessionName: string, windowIndex: number): boolean {
  try {
    execTmux(`kill-window -t "${sessionName}:${windowIndex}"`, {
      silent: true,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 删除 session
 * @param sessionName session 名称
 */
export function killSession(sessionName: string): boolean {
  try {
    execTmux(`kill-session -t "${sessionName}"`, { silent: true });
    return true;
  } catch {
    return false;
  }
}
