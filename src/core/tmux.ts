/**
 * tmux 集成工具模块
 *
 * 提供 tmux 环境检测、session/window/pane 管理功能
 */

import { execSync } from 'child_process';
import type { ResolvedPaneCommands, ResolvedPaneLayout } from './tmux-config.js';

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
    // 创建一个不包含 COLYN_USER_CWD 的环境变量对象
    // 防止这个内部环境变量泄漏到 tmux session 中
    const cleanEnv = { ...process.env };
    delete cleanEnv.COLYN_USER_CWD;

    const output = execSync(`tmux ${command}`, {
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : ['pipe', 'pipe', 'pipe'],
      env: cleanEnv,
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
 * 设置 3-pane 布局
 * 布局: 左侧 | 右上 | 右下
 *
 * @param sessionName session 名称
 * @param windowIndex window 索引
 * @param workingDir 工作目录
 * @param layout 可选的布局配置
 * @returns 是否成功
 */
export function setupPaneLayout(
  sessionName: string,
  windowIndex: number,
  workingDir: string,
  layout?: ResolvedPaneLayout
): boolean {
  const target = `${sessionName}:${windowIndex}`;

  // 如果没有布局配置，默认使用三窗格
  const layoutType = layout?.layout ?? 'three-pane';

  try {
    switch (layoutType) {
      case 'single-pane':
        // 单窗格：不需要分割
        return true;

      case 'two-pane-horizontal':
        return setupTwoPaneHorizontal(target, workingDir, layout);

      case 'two-pane-vertical':
        return setupTwoPaneVertical(target, workingDir, layout);

      case 'three-pane':
        return setupThreePane(target, workingDir, layout);

      case 'four-pane':
        return setupFourPane(target, workingDir, layout);

      default:
        // 未知布局类型，默认使用三窗格
        return setupThreePane(target, workingDir, layout);
    }
  } catch {
    return false;
  }
}

/**
 * 设置两窗格水平布局
 */
function setupTwoPaneHorizontal(
  target: string,
  workingDir: string,
  layout?: ResolvedPaneLayout
): boolean {
  const leftSize = layout?.leftSize ?? 50;
  const rightSize = 100 - leftSize;

  // 垂直分割：左右
  execTmux(
    `split-window -t "${target}" -h -p ${rightSize} -c "${workingDir}"`,
    { silent: true }
  );

  // 选择左侧 pane
  execTmux(`select-pane -t "${target}.0"`, { silent: true });

  return true;
}

/**
 * 设置两窗格垂直布局
 */
function setupTwoPaneVertical(
  target: string,
  workingDir: string,
  layout?: ResolvedPaneLayout
): boolean {
  const topSize = layout?.topSize ?? 50;
  const bottomSize = 100 - topSize;

  // 水平分割：上下
  execTmux(
    `split-window -t "${target}" -v -p ${bottomSize} -c "${workingDir}"`,
    { silent: true }
  );

  // 选择上方 pane
  execTmux(`select-pane -t "${target}.0"`, { silent: true });

  return true;
}

/**
 * 设置三窗格布局
 */
function setupThreePane(
  target: string,
  workingDir: string,
  layout?: ResolvedPaneLayout
): boolean {
  const leftSize = layout?.leftSize ?? 60;
  const rightTopSize = layout?.rightTopSize ?? 30;

  const rightSize = 100 - leftSize;
  const rightBottomSize = 100 - rightTopSize;

  // 1. 垂直分割：左侧 leftSize%，右侧 rightSize%
  execTmux(
    `split-window -t "${target}" -h -p ${rightSize} -c "${workingDir}"`,
    { silent: true }
  );

  // 2. 分割右侧为上下：上 rightTopSize%，下 rightBottomSize%
  execTmux(
    `split-window -t "${target}" -v -p ${rightBottomSize} -c "${workingDir}"`,
    { silent: true }
  );

  // 3. 选择左侧 pane (pane 0)
  execTmux(`select-pane -t "${target}.0"`, { silent: true });

  return true;
}

/**
 * 设置四窗格布局
 */
function setupFourPane(
  target: string,
  workingDir: string,
  layout?: ResolvedPaneLayout
): boolean {
  const hasHorizontalSplit = layout?.horizontalSplit !== undefined;
  const hasVerticalSplit = layout?.verticalSplit !== undefined;

  if (hasHorizontalSplit && hasVerticalSplit) {
    // 同时配置两个 split：使用固定分割
    return setupFourPaneBothSplits(target, workingDir, layout);
  } else if (hasHorizontalSplit) {
    // 仅水平分割
    return setupFourPaneHorizontalSplit(target, workingDir, layout);
  } else if (hasVerticalSplit) {
    // 仅垂直分割
    return setupFourPaneVerticalSplit(target, workingDir, layout);
  } else {
    // 默认：50/50 分割
    return setupFourPaneDefault(target, workingDir);
  }
}

/**
 * 四窗格：同时配置 horizontalSplit 和 verticalSplit
 */
function setupFourPaneBothSplits(
  target: string,
  workingDir: string,
  layout?: ResolvedPaneLayout
): boolean {
  const verticalSplit = layout?.verticalSplit ?? 50;
  const horizontalSplit = layout?.horizontalSplit ?? 50;

  const rightWidth = 100 - verticalSplit;
  const bottomHeight = 100 - horizontalSplit;

  // 1. 垂直分割：左右
  execTmux(
    `split-window -t "${target}" -h -p ${rightWidth} -c "${workingDir}"`,
    { silent: true }
  );

  // 2. 分割左侧：上下
  execTmux(
    `split-window -t "${target}.0" -v -p ${bottomHeight} -c "${workingDir}"`,
    { silent: true }
  );

  // 3. 分割右侧：上下
  execTmux(
    `split-window -t "${target}.1" -v -p ${bottomHeight} -c "${workingDir}"`,
    { silent: true }
  );

  // 4. 选择左上 pane
  execTmux(`select-pane -t "${target}.0"`, { silent: true });

  return true;
}

/**
 * 四窗格：仅 horizontalSplit（先上下分割）
 */
function setupFourPaneHorizontalSplit(
  target: string,
  workingDir: string,
  layout?: ResolvedPaneLayout
): boolean {
  const horizontalSplit = layout?.horizontalSplit ?? 50;
  const topLeftSize = layout?.topLeftSize ?? 50;
  const bottomLeftSize = layout?.bottomLeftSize ?? 50;

  const bottomHeight = 100 - horizontalSplit;
  const topRightWidth = 100 - topLeftSize;
  const bottomRightWidth = 100 - bottomLeftSize;

  // 1. 水平分割：上下
  execTmux(
    `split-window -t "${target}" -v -p ${bottomHeight} -c "${workingDir}"`,
    { silent: true }
  );

  // 2. 分割上方：左右
  execTmux(
    `split-window -t "${target}.0" -h -p ${topRightWidth} -c "${workingDir}"`,
    { silent: true }
  );

  // 3. 分割下方：左右
  execTmux(
    `split-window -t "${target}.1" -h -p ${bottomRightWidth} -c "${workingDir}"`,
    { silent: true }
  );

  // 4. 选择左上 pane
  execTmux(`select-pane -t "${target}.0"`, { silent: true });

  return true;
}

/**
 * 四窗格：仅 verticalSplit（先左右分割）
 */
function setupFourPaneVerticalSplit(
  target: string,
  workingDir: string,
  layout?: ResolvedPaneLayout
): boolean {
  const verticalSplit = layout?.verticalSplit ?? 50;
  const topLeftSize = layout?.topLeftSize ?? 50;
  const topRightSize = layout?.topRightSize ?? 50;

  const rightWidth = 100 - verticalSplit;
  const bottomLeftHeight = 100 - topLeftSize;
  const bottomRightHeight = 100 - topRightSize;

  // 1. 垂直分割：左右
  execTmux(
    `split-window -t "${target}" -h -p ${rightWidth} -c "${workingDir}"`,
    { silent: true }
  );

  // 2. 分割左侧：上下
  execTmux(
    `split-window -t "${target}.0" -v -p ${bottomLeftHeight} -c "${workingDir}"`,
    { silent: true }
  );

  // 3. 分割右侧：上下
  execTmux(
    `split-window -t "${target}.1" -v -p ${bottomRightHeight} -c "${workingDir}"`,
    { silent: true }
  );

  // 4. 选择左上 pane
  execTmux(`select-pane -t "${target}.0"`, { silent: true });

  return true;
}

/**
 * 四窗格：默认 50/50 分割
 */
function setupFourPaneDefault(target: string, workingDir: string): boolean {
  // 默认：50/50 分割
  // 1. 垂直分割：左右
  execTmux(
    `split-window -t "${target}" -h -p 50 -c "${workingDir}"`,
    { silent: true }
  );

  // 2. 分割左侧：上下
  execTmux(
    `split-window -t "${target}.0" -v -p 50 -c "${workingDir}"`,
    { silent: true }
  );

  // 3. 分割右侧：上下
  execTmux(
    `split-window -t "${target}.1" -v -p 50 -c "${workingDir}"`,
    { silent: true }
  );

  // 4. 选择左上 pane
  execTmux(`select-pane -t "${target}.0"`, { silent: true });

  return true;
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
  /** pane 布局配置 */
  paneLayout?: ResolvedPaneLayout;
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
    paneLayout,
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
    if (!setupPaneLayout(sessionName, windowIndex, workingDir, paneLayout)) {
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
      if (paneCommands.pane3) {
        sendKeys(sessionName, windowIndex, 3, paneCommands.pane3);
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

/**
 * 连接到 session（不在 tmux 中时使用）
 * @param sessionName session 名称
 * @returns 是否成功（此函数会接管当前进程，通常不会返回）
 */
export function attachSession(sessionName: string): boolean {
  try {
    execTmux(`attach-session -t "${sessionName}"`, { silent: false });
    return true;
  } catch {
    return false;
  }
}

/**
 * 切换客户端到指定 session（在 tmux 中时使用）
 * @param sessionName 目标 session 名称
 * @returns 是否成功
 */
export function switchClient(sessionName: string): boolean {
  try {
    execTmux(`switch-client -t "${sessionName}"`, { silent: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * 断开当前客户端连接（在 tmux 中时使用）
 * @returns 是否成功
 */
export function detachClient(): boolean {
  try {
    execTmux('detach-client', { silent: true });
    return true;
  } catch {
    return false;
  }
}
