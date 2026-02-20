/**
 * Tmux Pane 命令配置模块（使用新配置系统）
 *
 * 提供 tmux pane 命令的配置加载和自动检测功能
 *
 * 配置文件层级（优先级从低到高）：
 * 1. 内置默认值
 * 2. 用户级配置：~/.config/colyn/settings.{json|yaml|yml}
 * 3. 项目级配置：{projectRoot}/.colyn/settings.{json|yaml|yml}
 *
 * 新配置系统特性：
 * - 支持 JSON5（注释、尾部逗号）和 YAML 格式
 * - 自动配置版本迁移
 * - Zod Schema 验证
 * - 使用 deepmerge 进行配置合并
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { getDevServerCommand } from './dev-server.js';

// ============================================================================
// 从新配置系统导入
// ============================================================================

import {
  type Settings,
  type TmuxConfig,
  type PaneConfig,
  type PaneCommand,
  type LayoutType,
  type SystemCommands,
  BUILTIN_COMMANDS,
  CURRENT_CONFIG_VERSION,
  loadUserConfig,
  loadProjectConfig,
  getUserConfigDir as getNewUserConfigDir,
  mergeConfigs,
  mergeTmuxConfigs,
  applyBranchOverrides as applyBranchOverridesNew,
} from './config-new.js';

// ============================================================================
// 重新导出类型和常量（保持 API 兼容）
// ============================================================================

export {
  type Settings,
  type TmuxConfig,
  type PaneConfig,
  type PaneCommand,
  type LayoutType,
  type SystemCommands,
  BUILTIN_COMMANDS,
  CURRENT_CONFIG_VERSION,
};

/**
 * 窗格名称映射表
 * 定义每种布局支持的窗格名称
 */
export const LAYOUT_PANES: Record<LayoutType, string[]> = {
  'single-pane': [],
  'two-pane-horizontal': ['leftPane', 'rightPane'],
  'two-pane-vertical': ['topPane', 'bottomPane'],
  'three-pane': ['leftPane', 'topRightPane', 'bottomRightPane'],
  'four-pane': [
    'topLeftPane',
    'topRightPane',
    'bottomLeftPane',
    'bottomRightPane',
  ],
};

/**
 * 解析后的 Pane 命令
 */
export interface ResolvedPaneCommands {
  /** Pane 0 命令 */
  pane0?: string;
  /** Pane 1 命令 */
  pane1?: string;
  /** Pane 2 命令 */
  pane2?: string;
  /** Pane 3 命令（四窗格布局） */
  pane3?: string;
}

/**
 * 解析后的 Pane 布局
 */
export interface ResolvedPaneLayout {
  /** 布局类型 */
  layout: LayoutType;

  /** two-pane-horizontal: 左侧大小 */
  leftSize?: number;

  /** two-pane-vertical: 上方大小 */
  topSize?: number;

  /** three-pane: 左侧大小和右上大小 */
  rightTopSize?: number;

  /** four-pane: 水平分割位置（上方占总高度的百分比） */
  horizontalSplit?: number;
  /** four-pane: 垂直分割位置（左侧占总宽度的百分比） */
  verticalSplit?: number;

  /** four-pane: 各窗格大小（当未同时配置两个 split 时使用） */
  topLeftSize?: number;
  topRightSize?: number;
  bottomLeftSize?: number;
  bottomRightSize?: number;
}

// ============================================================================
// 配置文件路径（保持 API 兼容）
// ============================================================================

const SETTINGS_FILENAME = 'settings.json';
const CONFIG_DIR = '.colyn';

/**
 * 获取用户级配置目录
 * 遵循 XDG Base Directory 规范
 */
export function getUserConfigDir(): string {
  return getNewUserConfigDir();
}

/**
 * 获取用户级设置文件路径
 */
export function getUserConfigPath(): string {
  return path.join(getUserConfigDir(), SETTINGS_FILENAME);
}

/**
 * 获取项目级设置文件路径
 * @param projectRoot 项目根目录
 */
export function getProjectConfigPath(projectRoot: string): string {
  return path.join(projectRoot, CONFIG_DIR, SETTINGS_FILENAME);
}

// ============================================================================
// 默认配置
// ============================================================================

/**
 * 默认配置（三窗格布局）
 */
const DEFAULT_CONFIG: TmuxConfig = {
  autoRun: true,
  layout: 'three-pane',
  leftPane: {
    command: BUILTIN_COMMANDS.AUTO_CLAUDE,
    size: '60%',
  },
  topRightPane: {
    command: BUILTIN_COMMANDS.AUTO_DEV_SERVER,
    size: '30%',
  },
  bottomRightPane: {
    command: null,
    size: '70%',
  },
};

/**
 * 系统内置的分支特定默认配置
 * 优先级最低，会被任何用户或项目配置覆盖
 */
const BUILTIN_BRANCH_DEFAULTS: Record<string, TmuxConfig> = {
  // Main 分支默认使用单窗格布局
  main: {
    layout: 'single-pane',
    autoRun: false,
  },
};

// ============================================================================
// 配置加载（使用新系统）
// ============================================================================

/**
 * 从设置文件加载完整设置（用于 config 命令显示）
 * 自动执行必要的 migration 并保存更新后的配置
 * @param configPath 设置文件路径
 * @returns 完整设置对象，如果文件不存在或无法解析则返回 null
 */
export async function loadSettingsFromFile(
  configPath: string
): Promise<Settings | null> {
  // 尝试加载用户配置或项目配置
  const configDir = path.dirname(configPath);

  // 判断是用户级还是项目级
  const userConfigDir = getUserConfigDir();
  const isUserConfig = configDir === userConfigDir;

  if (isUserConfig) {
    return loadUserConfig();
  } else {
    // 项目级：从路径提取项目根目录
    const projectRoot = path.dirname(configDir);
    return loadProjectConfig(projectRoot);
  }
}

/**
 * 加载 tmux 配置（两层配置机制）
 *
 * 配置加载顺序（优先级从低到高）：
 * 1. 内置默认值
 * 2. 用户级配置：~/.config/colyn/settings.{json|yaml|yml} 中的 tmux 字段
 * 3. 项目级配置：{projectRoot}/.colyn/settings.{json|yaml|yml} 中的 tmux 字段
 *
 * @param projectRoot 项目根目录
 * @returns 合并后的配置对象
 */
export async function loadTmuxConfig(projectRoot: string): Promise<TmuxConfig> {
  // 并行加载用户级和项目级配置
  const [userSettings, projectSettings] = await Promise.all([
    loadUserConfig(),
    loadProjectConfig(projectRoot),
  ]);

  // 合并配置
  const configs: Array<TmuxConfig | null | undefined> = [
    userSettings?.tmux,
    projectSettings?.tmux,
  ];

  return mergeTmuxConfigs(...configs);
}

// ============================================================================
// Claude Session 检测
// ============================================================================

/**
 * 检查 worktree 是否存在 Claude session
 * 通过检查 ~/.claude/projects/{encodedPath} 下是否存在会话文件来判断
 * @param worktreePath worktree 路径
 */
export async function hasClaudeSession(
  worktreePath: string
): Promise<boolean> {
  try {
    const projectDir = getClaudeProjectDir(worktreePath);
    const stat = await fs.stat(projectDir);

    if (!stat.isDirectory()) {
      return false;
    }

    const files = await fs.readdir(projectDir);
    return files.some((file) => file.endsWith('.jsonl'));
  } catch {
    return false;
  }
}

/**
 * 获取 Claude 项目会话目录
 * Claude CLI 将每个目录的会话写入 ~/.claude/projects/{encodedPath}
 */
function getClaudeProjectDir(worktreePath: string): string {
  const encodedPath = encodeClaudeProjectPath(worktreePath);
  return path.join(os.homedir(), '.claude', 'projects', encodedPath);
}

/**
 * Claude 项目目录编码规则：将路径分隔符替换为 '-'
 * 例：/Users/name/project -> -Users-name-project
 */
function encodeClaudeProjectPath(worktreePath: string): string {
  return worktreePath.split(path.sep).join('-');
}

// ============================================================================
// 命令解析
// ============================================================================

/**
 * 解析 Claude 会话命令
 * - 如果存在 .claude 目录，运行 `claude -c` 继续会话
 * - 否则运行 `claude` 启动新会话
 * @param worktreePath worktree 路径
 * @param claudeCommand 自定义 Claude 命令（默认为 'claude'）
 */
async function resolveClaudeCommand(
  worktreePath: string,
  claudeCommand: string = 'claude'
): Promise<string> {
  const hasSession = await hasClaudeSession(worktreePath);
  return hasSession ? `${claudeCommand} -c` : claudeCommand;
}

/**
 * 解析 dev server 命令
 * 使用 dev-server 模块检测 dev 命令
 * @param worktreePath worktree 路径
 */
async function resolveDevServerCommand(
  worktreePath: string
): Promise<string | undefined> {
  return await getDevServerCommand(worktreePath);
}

/**
 * 解析单个 pane 命令
 * @param command 命令配置值
 * @param worktreePath worktree 路径
 * @param claudeCommand 自定义 Claude 命令
 */
async function resolvePaneCommand(
  command: PaneCommand | undefined,
  worktreePath: string,
  claudeCommand: string
): Promise<string | undefined> {
  // 如果是 null 或 undefined，不执行命令
  if (command === null || command === undefined) {
    return undefined;
  }

  // 处理内置命令
  switch (command) {
    case BUILTIN_COMMANDS.AUTO_CLAUDE:
      return await resolveClaudeCommand(worktreePath, claudeCommand);

    case BUILTIN_COMMANDS.AUTO_DEV_SERVER:
      return await resolveDevServerCommand(worktreePath);

    default:
      // 自定义命令，直接返回
      return command;
  }
}

/**
 * 解析百分比字符串为数字
 * @param sizeStr 大小字符串（如 "50%"）
 * @param defaultValue 默认值
 */
function parsePercentage(
  sizeStr: string | undefined,
  defaultValue: number
): number {
  if (!sizeStr) {
    return defaultValue;
  }
  const match = sizeStr.match(/^(\d+)%?$/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return defaultValue;
}

/**
 * 检测布局类型
 * @param config tmux 配置
 * @returns 布局类型
 */
function detectLayoutType(config: TmuxConfig): LayoutType {
  return config.layout ?? DEFAULT_CONFIG.layout!;
}

/**
 * 解析所有 pane 命令
 * @param config tmux 配置
 * @param worktreePath worktree 路径
 * @param projectRoot 项目根目录（可选，用于读取 claudeCommand 配置）
 * @param branchName 分支名称（可选，用于读取分支特定的 claudeCommand 配置）
 */
export async function resolvePaneCommands(
  config: TmuxConfig,
  worktreePath: string,
  projectRoot?: string,
  branchName?: string
): Promise<ResolvedPaneCommands> {
  // 如果禁用自动运行，返回空对象
  const autoRun =
    config.autoRun !== undefined ? config.autoRun : DEFAULT_CONFIG.autoRun!;
  if (!autoRun) {
    return {};
  }

  // 读取 claude 命令配置
  let claudeCommand = 'claude';
  if (projectRoot && branchName) {
    const settings = await loadSettingsForBranch(projectRoot, branchName);
    claudeCommand = settings.systemCommands?.claude ?? 'claude';
  }

  // 检测布局类型
  const layout = detectLayoutType(config);

  // 根据布局类型解析命令
  switch (layout) {
    case 'single-pane':
      // 单窗格：无命令
      return {};

    case 'two-pane-horizontal':
      return await resolveTwoPaneHorizontalCommands(
        config,
        worktreePath,
        claudeCommand
      );

    case 'two-pane-vertical':
      return await resolveTwoPaneVerticalCommands(
        config,
        worktreePath,
        claudeCommand
      );

    case 'three-pane':
      return await resolveThreePaneCommands(config, worktreePath, claudeCommand);

    case 'four-pane':
      return await resolveFourPaneCommands(config, worktreePath, claudeCommand);

    default:
      // 默认使用三窗格
      return await resolveThreePaneCommands(config, worktreePath, claudeCommand);
  }
}

/**
 * 解析两窗格水平布局的命令
 */
async function resolveTwoPaneHorizontalCommands(
  config: TmuxConfig,
  worktreePath: string,
  claudeCommand: string
): Promise<ResolvedPaneCommands> {
  const leftCommand = config.leftPane?.command;
  const rightCommand = config.rightPane?.command;

  const [pane0, pane1] = await Promise.all([
    resolvePaneCommand(leftCommand, worktreePath, claudeCommand),
    resolvePaneCommand(rightCommand, worktreePath, claudeCommand),
  ]);

  return { pane0, pane1 };
}

/**
 * 解析两窗格垂直布局的命令
 */
async function resolveTwoPaneVerticalCommands(
  config: TmuxConfig,
  worktreePath: string,
  claudeCommand: string
): Promise<ResolvedPaneCommands> {
  const topCommand = config.topPane?.command;
  const bottomCommand = config.bottomPane?.command;

  const [pane0, pane1] = await Promise.all([
    resolvePaneCommand(topCommand, worktreePath, claudeCommand),
    resolvePaneCommand(bottomCommand, worktreePath, claudeCommand),
  ]);

  return { pane0, pane1 };
}

/**
 * 解析三窗格布局的命令
 */
async function resolveThreePaneCommands(
  config: TmuxConfig,
  worktreePath: string,
  claudeCommand: string
): Promise<ResolvedPaneCommands> {
  const leftCommand =
    config.leftPane?.command ?? DEFAULT_CONFIG.leftPane?.command;
  const topRightCommand =
    config.topRightPane?.command ?? DEFAULT_CONFIG.topRightPane?.command;
  const bottomRightCommand =
    config.bottomRightPane?.command ?? DEFAULT_CONFIG.bottomRightPane?.command;

  const [pane0, pane1, pane2] = await Promise.all([
    resolvePaneCommand(leftCommand, worktreePath, claudeCommand),
    resolvePaneCommand(topRightCommand, worktreePath, claudeCommand),
    resolvePaneCommand(bottomRightCommand, worktreePath, claudeCommand),
  ]);

  return { pane0, pane1, pane2 };
}

/**
 * 解析四窗格布局的命令
 */
async function resolveFourPaneCommands(
  config: TmuxConfig,
  worktreePath: string,
  claudeCommand: string
): Promise<ResolvedPaneCommands> {
  const topLeftCommand = config.topLeftPane?.command;
  const topRightCommand = config.topRightPane?.command;
  const bottomLeftCommand = config.bottomLeftPane?.command;
  const bottomRightCommand = config.bottomRightPane?.command;

  const [pane0, pane1, pane2, pane3] = await Promise.all([
    resolvePaneCommand(topLeftCommand, worktreePath, claudeCommand),
    resolvePaneCommand(topRightCommand, worktreePath, claudeCommand),
    resolvePaneCommand(bottomLeftCommand, worktreePath, claudeCommand),
    resolvePaneCommand(bottomRightCommand, worktreePath, claudeCommand),
  ]);

  return { pane0, pane1, pane2, pane3 };
}

// ============================================================================
// 布局解析
// ============================================================================

/**
 * 解析 Pane 布局
 * @param config tmux 配置
 * @returns 解析后的布局信息
 */
export function resolvePaneLayout(config: TmuxConfig): ResolvedPaneLayout {
  const layout = detectLayoutType(config);

  const result: ResolvedPaneLayout = {
    layout,
  };

  switch (layout) {
    case 'two-pane-horizontal':
      result.leftSize = parsePercentage(config.leftPane?.size, 50);
      break;

    case 'two-pane-vertical':
      result.topSize = parsePercentage(config.topPane?.size, 50);
      break;

    case 'three-pane':
      result.leftSize = parsePercentage(
        config.leftPane?.size ?? DEFAULT_CONFIG.leftPane?.size,
        60
      );
      result.rightTopSize = parsePercentage(
        config.topRightPane?.size ?? DEFAULT_CONFIG.topRightPane?.size,
        30
      );
      break;

    case 'four-pane':
      // 优先使用 horizontalSplit 和 verticalSplit
      if (config.horizontalSplit && config.verticalSplit) {
        result.horizontalSplit = parsePercentage(config.horizontalSplit, 50);
        result.verticalSplit = parsePercentage(config.verticalSplit, 50);
      } else {
        // 否则使用各窗格的 size
        result.topLeftSize = parsePercentage(config.topLeftPane?.size, 50);
        result.topRightSize = parsePercentage(config.topRightPane?.size, 50);
        result.bottomLeftSize = parsePercentage(config.bottomLeftPane?.size, 50);
        result.bottomRightSize = parsePercentage(
          config.bottomRightPane?.size,
          50
        );
      }
      break;
  }

  return result;
}

// ============================================================================
// 分支覆盖（使用新系统）
// ============================================================================

/**
 * 从设置中加载特定分支的配置
 * @param settings 完整设置对象
 * @param branchName 分支名称
 * @returns 合并后的设置
 */
export function loadBranchSettings(
  settings: Settings,
  branchName: string
): Settings {
  return applyBranchOverridesNew(settings, branchName);
}

/**
 * 加载特定分支的完整设置
 *
 * 配置优先级（从低到高）：
 * 1. User default（用户级全局配置）
 * 2. Project default（项目级全局配置）
 * 3. User override（用户级分支覆盖）
 * 4. Project override（项目级分支覆盖）
 *
 * @param projectRoot 项目根目录
 * @param branchName 分支名称
 * @returns 合并后的完整设置
 */
export async function loadSettingsForBranch(
  projectRoot: string,
  branchName: string
): Promise<Settings> {
  // 并行加载用户级和项目级配置
  const [userSettings, projectSettings] = await Promise.all([
    loadUserConfig(),
    loadProjectConfig(projectRoot),
  ]);

  // 合并配置（优先级：项目 > 用户）
  const configs: Array<Settings | null> = [];

  if (userSettings) configs.push(userSettings);
  if (projectSettings) configs.push(projectSettings);

  // 如果没有任何配置，返回最小配置
  if (configs.length === 0) {
    return { version: CURRENT_CONFIG_VERSION };
  }

  let mergedSettings = mergeConfigs(...configs);

  // 应用分支覆盖
  mergedSettings = applyBranchOverridesNew(mergedSettings, branchName);

  return mergedSettings;
}

/**
 * 加载特定分支的 tmux 配置
 *
 * 配置优先级（从低到高）：
 * 1. System builtin（系统内置默认，如 main 分支默认单窗格）
 * 2. User default（用户级全局配置，~/.config/colyn/settings.{json|yaml|yml} 的 tmux）
 * 3. Project default（项目级全局配置，.colyn/settings.{json|yaml|yml} 的 tmux）
 * 4. User override（用户级分支覆盖，~/.config/colyn/settings.{json|yaml|yml} 的 branchOverrides[branch].tmux）
 * 5. Project override（项目级分支覆盖，.colyn/settings.{json|yaml|yml} 的 branchOverrides[branch].tmux）
 *
 * 全部按照字段级覆盖（field-level override）
 *
 * @param projectRoot 项目根目录
 * @param branchName 分支名称
 * @returns 合并后的 tmux 配置
 */
export async function loadTmuxConfigForBranch(
  projectRoot: string,
  branchName: string
): Promise<TmuxConfig> {
  // 加载完整设置
  const settings = await loadSettingsForBranch(projectRoot, branchName);

  // 合并配置
  const configs: Array<TmuxConfig | null | undefined> = [];

  // 1. System builtin
  const builtinBranchDefault = BUILTIN_BRANCH_DEFAULTS[branchName];
  if (builtinBranchDefault) {
    configs.push(builtinBranchDefault);
  }

  // 2-5. 从合并后的 settings 中获取 tmux 配置（已包含所有层级和分支覆盖）
  if (settings.tmux) {
    configs.push(settings.tmux);
  }

  return mergeTmuxConfigs(...configs);
}
