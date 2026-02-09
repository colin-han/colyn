/**
 * Tmux Pane 命令配置模块
 *
 * 提供 tmux pane 命令的配置加载和自动检测功能
 *
 * 配置文件层级（优先级从低到高）：
 * 1. 内置默认值
 * 2. 用户级配置：~/.config/colyn/settings.json
 * 3. 项目级配置：{projectRoot}/.colyn/settings.json
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { getDevServerCommand } from './dev-server.js';

/**
 * 内置命令常量
 */
export const BUILTIN_COMMANDS = {
  /** 自动启动 dev server */
  AUTO_DEV_SERVER: 'auto start dev server',
  /** 自动继续 Claude 会话 */
  AUTO_CLAUDE: 'auto continues claude session',
  /** 自动继续 Claude 会话并开启绕过权限 */
  AUTO_CLAUDE_DANGEROUSLY: 'auto continues claude session with dangerously skip permissions',
} as const;

/**
 * Pane 命令配置值
 * - 内置命令：使用预定义的自动检测逻辑
 * - string: 自定义命令
 * - null: 不执行任何命令
 */
export type PaneCommand =
  | typeof BUILTIN_COMMANDS.AUTO_DEV_SERVER
  | typeof BUILTIN_COMMANDS.AUTO_CLAUDE
  | typeof BUILTIN_COMMANDS.AUTO_CLAUDE_DANGEROUSLY
  | string
  | null;

/**
 * 单个 Pane 的配置
 */
export interface PaneConfig {
  /** 要执行的命令 */
  command?: PaneCommand;
  /** Pane 大小（百分比，如 "50%"） */
  size?: string;
}

/**
 * Tmux 配置接口
 */
export interface TmuxConfig {
  /** 是否自动运行命令，false 禁用所有自动运行 */
  autoRun?: boolean;
  /** 左侧 Pane（Claude Code）配置 */
  leftPane?: PaneConfig;
  /** 右上 Pane（Dev Server）配置 */
  rightTopPane?: PaneConfig;
  /** 右下 Pane（Bash）配置 */
  rightBottomPane?: PaneConfig;
}

/**
 * 解析后的 Pane 命令
 */
export interface ResolvedPaneCommands {
  /** Pane 0（左侧 Claude）命令 */
  pane0?: string;
  /** Pane 1（右上 Dev Server）命令 */
  pane1?: string;
  /** Pane 2（右下 Bash）命令 */
  pane2?: string;
}

/**
 * 解析后的 Pane 布局
 */
export interface ResolvedPaneLayout {
  /** 左侧 Pane 大小（百分比，如 60） */
  leftSize: number;
  /** 右上 Pane 占右侧的比例（百分比，如 30） */
  rightTopSize: number;
}

/**
 * 统一设置文件结构
 */
export interface Settings {
  /** tmux 相关配置 */
  tmux?: TmuxConfig;
}

/**
 * 配置文件路径
 */
const SETTINGS_FILENAME = 'settings.json';
const CONFIG_DIR = '.colyn';

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<TmuxConfig> = {
  autoRun: true,
  leftPane: {
    command: BUILTIN_COMMANDS.AUTO_CLAUDE,
    size: '60%',
  },
  rightTopPane: {
    command: BUILTIN_COMMANDS.AUTO_DEV_SERVER,
    size: '30%',
  },
  rightBottomPane: {
    command: null,
    size: '70%',
  },
};

/**
 * 获取用户级配置目录
 * 遵循 XDG Base Directory 规范
 */
export function getUserConfigDir(): string {
  return path.join(os.homedir(), '.config', 'colyn');
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

/**
 * 从设置文件加载 tmux 配置
 * @param configPath 设置文件路径
 * @returns tmux 配置对象，如果文件不存在或无法解析则返回 null
 */
async function loadConfigFromFile(
  configPath: string
): Promise<TmuxConfig | null> {
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const settings = JSON.parse(content) as Settings;
    return settings.tmux ?? null;
  } catch {
    return null;
  }
}

/**
 * 从设置文件加载完整设置（用于 config 命令显示）
 * @param configPath 设置文件路径
 * @returns 完整设置对象，如果文件不存在或无法解析则返回 null
 */
export async function loadSettingsFromFile(
  configPath: string
): Promise<Settings | null> {
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content) as Settings;
  } catch {
    return null;
  }
}

/**
 * 合并单个 Pane 配置
 */
function mergePaneConfig(
  base: PaneConfig | undefined,
  override: PaneConfig | undefined
): PaneConfig | undefined {
  if (override === undefined) {
    return base;
  }
  if (base === undefined) {
    return override;
  }
  return {
    ...base,
    ...override,
  };
}

/**
 * 深度合并两个配置对象
 * 后者的值会覆盖前者，但只覆盖明确设置的字段
 * @param base 基础配置
 * @param override 覆盖配置
 */
function mergeConfigs(base: TmuxConfig, override: TmuxConfig): TmuxConfig {
  const result: TmuxConfig = { ...base };

  // 合并 autoRun（如果 override 中明确设置了）
  if (override.autoRun !== undefined) {
    result.autoRun = override.autoRun;
  }

  // 合并各个 pane 配置
  result.leftPane = mergePaneConfig(base.leftPane, override.leftPane);
  result.rightTopPane = mergePaneConfig(
    base.rightTopPane,
    override.rightTopPane
  );
  result.rightBottomPane = mergePaneConfig(
    base.rightBottomPane,
    override.rightBottomPane
  );

  return result;
}

/**
 * 加载 tmux 配置（两层配置机制）
 *
 * 配置加载顺序（优先级从低到高）：
 * 1. 内置默认值
 * 2. 用户级配置：~/.config/colyn/settings.json 中的 tmux 字段
 * 3. 项目级配置：{projectRoot}/.colyn/settings.json 中的 tmux 字段
 *
 * @param projectRoot 项目根目录
 * @returns 合并后的配置对象
 */
export async function loadTmuxConfig(projectRoot: string): Promise<TmuxConfig> {
  // 并行加载用户级和项目级配置
  const [userConfig, projectConfig] = await Promise.all([
    loadConfigFromFile(getUserConfigPath()),
    loadConfigFromFile(getProjectConfigPath(projectRoot)),
  ]);

  // 从空对象开始，依次合并
  let config: TmuxConfig = {};

  // 合并用户级配置
  if (userConfig) {
    config = mergeConfigs(config, userConfig);
  }

  // 合并项目级配置（优先级更高）
  if (projectConfig) {
    config = mergeConfigs(config, projectConfig);
  }

  return config;
}

/**
 * 检查 worktree 是否存在 Claude session
 * 通过检查 ~/.claude/projects/{encodedPath} 下是否存在会话文件来判断
 * @param worktreePath worktree 路径
 */
export async function hasClaudeSession(worktreePath: string): Promise<boolean> {
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

/**
 * 解析 Claude 会话命令
 * - 如果存在 .claude 目录，运行 `claude -c` 继续会话
 * - 否则运行 `claude` 启动新会话
 * @param worktreePath worktree 路径
 * @param dangerouslySkipPermissions 是否跳过权限检查
 */
async function resolveClaudeCommand(
  worktreePath: string,
  dangerouslySkipPermissions: boolean = false
): Promise<string> {
  const hasSession = await hasClaudeSession(worktreePath);
  const baseCommand = hasSession ? 'claude -c' : 'claude';
  return dangerouslySkipPermissions
    ? `${baseCommand} --dangerously-skip-permissions`
    : baseCommand;
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
 */
async function resolvePaneCommand(
  command: PaneCommand | undefined,
  worktreePath: string
): Promise<string | undefined> {
  // 如果是 null 或 undefined，不执行命令
  if (command === null || command === undefined) {
    return undefined;
  }

  // 处理内置命令
  switch (command) {
    case BUILTIN_COMMANDS.AUTO_CLAUDE:
      return await resolveClaudeCommand(worktreePath, false);

    case BUILTIN_COMMANDS.AUTO_CLAUDE_DANGEROUSLY:
      return await resolveClaudeCommand(worktreePath, true);

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
 * 解析所有 pane 命令
 * @param config tmux 配置
 * @param worktreePath worktree 路径
 */
export async function resolvePaneCommands(
  config: TmuxConfig,
  worktreePath: string
): Promise<ResolvedPaneCommands> {
  // 合并默认配置
  // 注意：必须区分 null（明确设置为不执行）和 undefined（未设置，使用默认值）
  const autoRun = config.autoRun !== undefined ? config.autoRun : DEFAULT_CONFIG.autoRun;
  const leftCommand = config.leftPane?.command !== undefined
    ? config.leftPane.command
    : DEFAULT_CONFIG.leftPane.command;
  const rightTopCommand = config.rightTopPane?.command !== undefined
    ? config.rightTopPane.command
    : DEFAULT_CONFIG.rightTopPane.command;
  const rightBottomCommand = config.rightBottomPane?.command !== undefined
    ? config.rightBottomPane.command
    : DEFAULT_CONFIG.rightBottomPane.command;

  // 如果禁用自动运行，返回空对象
  if (!autoRun) {
    return {};
  }

  // 解析各个 pane 的命令
  const [pane0, pane1, pane2] = await Promise.all([
    resolvePaneCommand(leftCommand, worktreePath),
    resolvePaneCommand(rightTopCommand, worktreePath),
    resolvePaneCommand(rightBottomCommand, worktreePath),
  ]);

  return {
    pane0,
    pane1,
    pane2,
  };
}

/**
 * 解析 Pane 布局配置
 * @param config tmux 配置
 */
export function resolvePaneLayout(config: TmuxConfig): ResolvedPaneLayout {
  const leftSize = parsePercentage(
    config.leftPane?.size,
    parsePercentage(DEFAULT_CONFIG.leftPane.size, 60)
  );
  const rightTopSize = parsePercentage(
    config.rightTopPane?.size,
    parsePercentage(DEFAULT_CONFIG.rightTopPane.size, 30)
  );

  return {
    leftSize,
    rightTopSize,
  };
}
