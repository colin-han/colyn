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
} as const;

/**
 * 支持的布局类型
 */
export type LayoutType =
  | 'single-pane'
  | 'two-pane-horizontal'
  | 'two-pane-vertical'
  | 'three-pane'
  | 'four-pane';

/**
 * 窗格名称映射表
 * 定义每种布局支持的窗格名称
 */
export const LAYOUT_PANES: Record<LayoutType, string[]> = {
  'single-pane': [],
  'two-pane-horizontal': ['leftPane', 'rightPane'],
  'two-pane-vertical': ['topPane', 'bottomPane'],
  'three-pane': ['leftPane', 'topRightPane', 'bottomRightPane'],
  'four-pane': ['topLeftPane', 'topRightPane', 'bottomLeftPane', 'bottomRightPane'],
};

/**
 * Pane 命令配置值
 * - 内置命令：使用预定义的自动检测逻辑
 * - string: 自定义命令
 * - null: 不执行任何命令
 */
export type PaneCommand =
  | typeof BUILTIN_COMMANDS.AUTO_DEV_SERVER
  | typeof BUILTIN_COMMANDS.AUTO_CLAUDE
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

  /** 布局类型 */
  layout?: LayoutType;

  /** 窗格配置 - 根据 layout 类型使用不同的窗格 */
  leftPane?: PaneConfig;         // three-pane, two-pane-horizontal
  rightPane?: PaneConfig;        // two-pane-horizontal
  topPane?: PaneConfig;          // two-pane-vertical
  bottomPane?: PaneConfig;       // two-pane-vertical
  topRightPane?: PaneConfig;     // three-pane, four-pane
  bottomRightPane?: PaneConfig;  // three-pane, four-pane
  topLeftPane?: PaneConfig;      // four-pane
  bottomLeftPane?: PaneConfig;   // four-pane

  /** 四窗格布局的分割配置 */
  horizontalSplit?: string;  // 上下分割线位置（上方窗格占总高度的百分比）
  verticalSplit?: string;    // 左右分割线位置（左侧窗格占总宽度的百分比）
}

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

/**
 * 系统命令配置
 */
export interface SystemCommands {
  /** 包管理器命令（默认为 'npm'） */
  npm?: string;
  /** Claude 命令（默认为 'claude'） */
  claude?: string;
}

/**
 * 统一设置文件结构
 */
export interface Settings {
  /** 配置文件版本号 */
  version?: number;
  /** 界面语言 */
  lang?: string;
  /** 系统命令配置 */
  systemCommands?: SystemCommands;
  /** tmux 相关配置 */
  tmux?: TmuxConfig;
  /** 分支特定配置覆盖 */
  branchOverrides?: Record<string, Settings>;
}

/**
 * 当前配置文件版本号
 */
export const CURRENT_CONFIG_VERSION = 1;

/**
 * 配置文件路径
 */
const SETTINGS_FILENAME = 'settings.json';
const CONFIG_DIR = '.colyn';

/**
 * 默认配置（三窗格布局）
 */
const DEFAULT_CONFIG = {
  autoRun: true,
  layout: 'three-pane' as LayoutType,
  leftPane: {
    command: BUILTIN_COMMANDS.AUTO_CLAUDE,
    size: '60%',
  },
  topRightPane: {
    command: BUILTIN_COMMANDS.AUTO_DEV_SERVER,
    size: '30%',
  },
  bottomRightPane: {
    command: null as PaneCommand,
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
 * Migration 函数类型
 * 每个 migration 函数负责将配置从 version n 升级到 version n+1
 */
type MigrationFunction = (settings: Settings) => Settings;

/**
 * Migration 函数列表
 * 索引 i 的函数负责从 version i 迁移到 version i+1
 */
const MIGRATIONS: MigrationFunction[] = [
  // Migration 0 -> 1: 添加版本号
  (settings: Settings): Settings => {
    // 版本 0（无版本号）-> 版本 1
    // 这是第一次引入版本号，无需修改其他字段
    return {
      ...settings,
      version: 1,
    };
  },

  // 未来的 migration 在这里添加
  // 例如：Migration 1 -> 2
  // (settings: Settings): Settings => {
  //   // 执行从版本 1 到版本 2 的迁移逻辑
  //   return { ...settings, version: 2 };
  // },
];

/**
 * 执行配置迁移
 * @param settings 原始配置
 * @returns 迁移后的配置
 */
function migrateSettings(settings: Settings): Settings {
  const currentVersion = settings.version ?? 0;

  // 如果已经是最新版本，直接返回
  if (currentVersion >= CURRENT_CONFIG_VERSION) {
    return settings;
  }

  // 按顺序执行所有必要的 migration
  let migratedSettings = { ...settings };
  for (let version = currentVersion; version < CURRENT_CONFIG_VERSION; version++) {
    const migrationFn = MIGRATIONS[version];
    if (migrationFn) {
      migratedSettings = migrationFn(migratedSettings);
    } else {
      // 如果缺少某个版本的 migration 函数，直接更新版本号
      migratedSettings.version = version + 1;
    }
  }

  return migratedSettings;
}

/**
 * 保存配置到文件
 * @param configPath 配置文件路径
 * @param settings 配置对象
 */
async function saveSettingsToFile(
  configPath: string,
  settings: Settings
): Promise<void> {
  // 确保配置有版本号
  const settingsWithVersion = {
    ...settings,
    version: settings.version ?? CURRENT_CONFIG_VERSION,
  };

  // 确保目录存在
  const dir = path.dirname(configPath);
  await fs.mkdir(dir, { recursive: true });

  // 写入文件
  await fs.writeFile(
    configPath,
    JSON.stringify(settingsWithVersion, null, 2),
    'utf-8'
  );
}

/**
 * 从设置文件加载完整设置（用于 config 命令显示）
 * 自动执行必要的 migration 并保存更新后的配置
 * @param configPath 设置文件路径
 * @returns 完整设置对象，如果文件不存在或无法解析则返回 null
 */
export async function loadSettingsFromFile(
  configPath: string
): Promise<Settings | null> {
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const rawSettings = JSON.parse(content) as Settings;

    // 执行 migration
    const migratedSettings = migrateSettings(rawSettings);

    // 如果版本号有变化，保存更新后的配置
    const oldVersion = rawSettings.version ?? 0;
    const newVersion = migratedSettings.version ?? CURRENT_CONFIG_VERSION;
    if (oldVersion !== newVersion) {
      await saveSettingsToFile(configPath, migratedSettings);
    }

    return migratedSettings;
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
  result.topRightPane = mergePaneConfig(
    base.topRightPane,
    override.topRightPane
  );
  result.bottomRightPane = mergePaneConfig(
    base.bottomRightPane,
    override.bottomRightPane
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
  const autoRun = config.autoRun !== undefined ? config.autoRun : DEFAULT_CONFIG.autoRun;
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
      return await resolveTwoPaneHorizontalCommands(config, worktreePath, claudeCommand);

    case 'two-pane-vertical':
      return await resolveTwoPaneVerticalCommands(config, worktreePath, claudeCommand);

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
  // 使用默认值（向后兼容）
  const leftCommand = config.leftPane?.command !== undefined
    ? config.leftPane.command
    : DEFAULT_CONFIG.leftPane.command;
  const topRightCommand = config.topRightPane?.command !== undefined
    ? config.topRightPane.command
    : DEFAULT_CONFIG.topRightPane.command;
  const bottomRightCommand = config.bottomRightPane?.command !== undefined
    ? config.bottomRightPane.command
    : DEFAULT_CONFIG.bottomRightPane.command;

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

/**
 * 解析 Pane 布局配置
 * @param config tmux 配置
 */
export function resolvePaneLayout(config: TmuxConfig): ResolvedPaneLayout {
  const layout = detectLayoutType(config);

  const result: ResolvedPaneLayout = { layout };

  switch (layout) {
    case 'single-pane':
      // 单窗格，无需配置
      break;

    case 'two-pane-horizontal':
      // 水平两分割：leftPane size
      result.leftSize = parsePercentage(config.leftPane?.size, 50);
      break;

    case 'two-pane-vertical':
      // 垂直两分割：topPane size
      result.topSize = parsePercentage(config.topPane?.size, 50);
      break;

    case 'three-pane':
      // 三窗格：leftPane size 和 topRightPane size
      result.leftSize = parsePercentage(
        config.leftPane?.size,
        parsePercentage(DEFAULT_CONFIG.leftPane.size, 60)
      );
      result.rightTopSize = parsePercentage(
        config.topRightPane?.size,
        parsePercentage(DEFAULT_CONFIG.topRightPane.size, 30)
      );
      break;

    case 'four-pane':
      // 四窗格：根据配置的 split 类型决定
      if (config.horizontalSplit) {
        result.horizontalSplit = parsePercentage(config.horizontalSplit, 50);
      }
      if (config.verticalSplit) {
        result.verticalSplit = parsePercentage(config.verticalSplit, 50);
      }

      // 如果两个 split 都配置了，忽略 pane size
      if (result.horizontalSplit !== undefined && result.verticalSplit !== undefined) {
        // 同时配置：忽略 pane size
        break;
      }

      // 如果只配置了一个 split，解析 pane size
      result.topLeftSize = parsePercentage(config.topLeftPane?.size, 50);
      result.topRightSize = parsePercentage(config.topRightPane?.size, 50);
      result.bottomLeftSize = parsePercentage(config.bottomLeftPane?.size, 50);
      result.bottomRightSize = parsePercentage(config.bottomRightPane?.size, 50);
      break;
  }

  return result;
}

/**
 * 配置验证结果
 */
export interface ValidationResult {
  /** 是否有错误 */
  hasError: boolean;
  /** 错误消息列表 */
  errors: string[];
  /** 警告消息列表 */
  warnings: string[];
}

/**
 * 检测布局类型
 * 根据配置的窗格自动检测布局类型（向后兼容）
 * @param config tmux 配置
 * @returns 检测到的布局类型
 */
export function detectLayoutType(config: TmuxConfig): LayoutType {
  // 如果明确指定了 layout，直接返回
  if (config.layout) {
    return config.layout;
  }

  // 检查是否配置了任何窗格
  const hasLeftPane = config.leftPane !== undefined;
  const hasTopRightPane = config.topRightPane !== undefined;
  const hasBottomRightPane = config.bottomRightPane !== undefined;
  const hasRightPane = config.rightPane !== undefined;
  const hasTopPane = config.topPane !== undefined;
  const hasBottomPane = config.bottomPane !== undefined;
  const hasTopLeftPane = config.topLeftPane !== undefined;
  const hasBottomLeftPane = config.bottomLeftPane !== undefined;

  // 四窗格：配置了任何一个四窗格特有的窗格
  if (hasTopLeftPane || hasBottomLeftPane) {
    return 'four-pane';
  }

  // 两窗格水平：配置了 rightPane
  if (hasRightPane) {
    return 'two-pane-horizontal';
  }

  // 两窗格垂直：配置了 topPane 或 bottomPane
  if (hasTopPane || hasBottomPane) {
    return 'two-pane-vertical';
  }

  // 三窗格：配置了 leftPane, topRightPane 或 bottomRightPane
  if (hasLeftPane || hasTopRightPane || hasBottomRightPane) {
    return 'three-pane';
  }

  // 默认：三窗格布局
  return 'three-pane';
}

/**
 * 验证 tmux 配置
 * @param config tmux 配置
 * @returns 验证结果
 */
export function validateTmuxConfig(config: TmuxConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 检测布局类型
  const layout = detectLayoutType(config);
  const supportedPanes = LAYOUT_PANES[layout];

  // 检查所有可能的窗格配置
  const allPaneNames = [
    'leftPane',
    'rightPane',
    'topPane',
    'bottomPane',
    'topRightPane',
    'bottomRightPane',
    'topLeftPane',
    'bottomLeftPane',
  ] as const;

  for (const paneName of allPaneNames) {
    const paneConfig = config[paneName];
    if (paneConfig === undefined) {
      continue;
    }

    // 检查当前布局是否支持此窗格
    if (!supportedPanes.includes(paneName)) {
      warnings.push(
        `Layout "${layout}" does not support pane "${paneName}", it will be ignored. ` +
          `Supported panes: ${supportedPanes.join(', ')}`
      );
    }

    // 验证 size 配置
    if (paneConfig.size) {
      const size = parsePercentage(paneConfig.size, -1);
      if (size < 0 || size > 100) {
        warnings.push(
          `Pane "${paneName}" size "${paneConfig.size}" is out of reasonable range (0%-100%), ` +
            `using default value`
        );
      }
    }
  }

  return {
    hasError: errors.length > 0,
    errors,
    warnings,
  };
}

/**
 * 匹配通配符模式
 * @param pattern 通配符模式（如 "feature/*"）
 * @param branchName 分支名称
 * @returns 是否匹配
 */
function matchWildcard(pattern: string, branchName: string): boolean {
  // 将通配符模式转换为正则表达式
  // 支持 * 匹配任意字符
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // 转义特殊字符
    .replace(/\*/g, '.*'); // * 替换为 .*

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(branchName);
}

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
  const branchOverrides = settings.branchOverrides;
  if (!branchOverrides) {
    return settings;
  }

  // 优先级：精确匹配 > 通配符匹配
  const overrideKeys = Object.keys(branchOverrides);

  // 1. 精确匹配
  if (overrideKeys.includes(branchName)) {
    const branchConfig = branchOverrides[branchName];
    return mergeSettings(settings, branchConfig!);
  }

  // 2. 通配符匹配（找到第一个匹配的）
  for (const pattern of overrideKeys) {
    if (matchWildcard(pattern, branchName)) {
      const branchConfig = branchOverrides[pattern];
      return mergeSettings(settings, branchConfig!);
    }
  }

  // 3. 无匹配，返回基础配置
  return settings;
}

/**
 * 深度合并两个 Settings 对象
 * @param base 基础设置
 * @param override 覆盖设置
 * @returns 合并后的设置
 */
function mergeSettings(base: Settings, override: Settings): Settings {
  const result: Settings = { ...base };

  // 合并顶层字段
  if (override.lang !== undefined) {
    result.lang = override.lang;
  }

  // 深度合并 systemCommands 配置
  if (override.systemCommands !== undefined) {
    result.systemCommands = {
      ...base.systemCommands,
      ...override.systemCommands,
    };
  }

  // 深度合并 tmux 配置
  if (override.tmux !== undefined) {
    result.tmux = base.tmux
      ? mergeConfigs(base.tmux, override.tmux)
      : override.tmux;
  }

  // 注意：branchOverrides 不需要合并（只在顶层使用）
  return result;
}

/**
 * 从 branchOverrides 中查找匹配的分支配置
 * @param branchOverrides 分支覆盖配置
 * @param branchName 分支名称
 * @returns 匹配的分支配置，如果没有匹配则返回 null
 */
function findBranchOverride(
  branchOverrides: Record<string, Settings>,
  branchName: string
): Settings | null {
  const overrideKeys = Object.keys(branchOverrides);

  // 1. 精确匹配
  if (overrideKeys.includes(branchName)) {
    return branchOverrides[branchName]!;
  }

  // 2. 通配符匹配（找到第一个匹配的）
  for (const pattern of overrideKeys) {
    if (matchWildcard(pattern, branchName)) {
      return branchOverrides[pattern]!;
    }
  }

  // 3. 无匹配
  return null;
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
    loadSettingsFromFile(getUserConfigPath()),
    loadSettingsFromFile(getProjectConfigPath(projectRoot)),
  ]);

  // 从空设置开始
  let settings: Settings = {};

  // 1. User default - 用户级全局配置
  if (userSettings) {
    settings = mergeSettings(settings, userSettings);
  }

  // 2. Project default - 项目级全局配置
  if (projectSettings) {
    settings = mergeSettings(settings, projectSettings);
  }

  // 3. User override - 用户级分支覆盖
  if (userSettings?.branchOverrides) {
    const userBranchConfig = findBranchOverride(userSettings.branchOverrides, branchName);
    if (userBranchConfig) {
      settings = mergeSettings(settings, userBranchConfig);
    }
  }

  // 4. Project override - 项目级分支覆盖
  if (projectSettings?.branchOverrides) {
    const projectBranchConfig = findBranchOverride(projectSettings.branchOverrides, branchName);
    if (projectBranchConfig) {
      settings = mergeSettings(settings, projectBranchConfig);
    }
  }

  return settings;
}

/**
 * 加载特定分支的 tmux 配置
 *
 * 配置优先级（从低到高）：
 * 1. System builtin（系统内置默认，如 main 分支默认单窗格）
 * 2. User default（用户级全局配置，~/.config/colyn/settings.json 的 tmux）
 * 3. Project default（项目级全局配置，.colyn/settings.json 的 tmux）
 * 4. User override（用户级分支覆盖，~/.config/colyn/settings.json 的 branchOverrides[branch].tmux）
 * 5. Project override（项目级分支覆盖，.colyn/settings.json 的 branchOverrides[branch].tmux）
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
  // 并行加载用户级和项目级配置
  const [userSettings, projectSettings] = await Promise.all([
    loadSettingsFromFile(getUserConfigPath()),
    loadSettingsFromFile(getProjectConfigPath(projectRoot)),
  ]);

  // 从空配置开始
  let config: TmuxConfig = {};

  // 1. System builtin - 系统内置分支默认配置
  const builtinBranchDefault = BUILTIN_BRANCH_DEFAULTS[branchName];
  if (builtinBranchDefault) {
    config = mergeConfigs(config, builtinBranchDefault);
  }

  // 2. User default - 用户级全局配置
  if (userSettings?.tmux) {
    config = mergeConfigs(config, userSettings.tmux);
  }

  // 3. Project default - 项目级全局配置
  if (projectSettings?.tmux) {
    config = mergeConfigs(config, projectSettings.tmux);
  }

  // 4. User override - 用户级分支覆盖
  if (userSettings?.branchOverrides) {
    const userBranchConfig = findBranchOverride(userSettings.branchOverrides, branchName);
    if (userBranchConfig?.tmux) {
      config = mergeConfigs(config, userBranchConfig.tmux);
    }
  }

  // 5. Project override - 项目级分支覆盖
  if (projectSettings?.branchOverrides) {
    const projectBranchConfig = findBranchOverride(projectSettings.branchOverrides, branchName);
    if (projectBranchConfig?.tmux) {
      config = mergeConfigs(config, projectBranchConfig.tmux);
    }
  }

  return config;
}
