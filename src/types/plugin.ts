/**
 * 工具链插件类型定义
 */

/**
 * repairSettings 的上下文对象
 *
 * 在 colyn init / colyn repair 时传入各插件的 repairSettings 方法。
 */
export interface RepairSettingsContext {
  /** 项目根目录（.colyn 的父目录） */
  projectRoot: string;
  /** 主分支目录路径（包含项目代码文件） */
  worktreePath: string;
  /** 当前已保存的本插件专属配置（来自 settings.json 的 pluginSettings[name]） */
  currentSettings: Record<string, unknown>;
  /** 是否处于非交互式模式（如 CI 环境，不能弹出交互提问） */
  nonInteractive: boolean;
}

/**
 * 插件命令执行失败时抛出的异常
 *
 * lint / build / install / init 失败时插件必须抛出此类型，
 * 以便 PluginManager 在 verbose 模式下将命令输出展示给用户。
 */
export class PluginCommandError extends Error {
  /** 失败命令的完整输出（stdout + stderr） */
  readonly output: string;

  constructor(message: string, output: string) {
    super(message);
    this.name = 'PluginCommandError';
    this.output = output;
  }
}

/**
 * 端口分配配置
 * null 表示该工具链不需要端口（如库项目、CLI 工具）
 */
export interface PortConfig {
  /** 配置文件中的键名，如 "PORT"、"server.port" */
  key: string;
  /** 默认端口号 */
  defaultPort: number;
}

/**
 * 工具链插件接口
 *
 * 所有方法均为可选，插件只需实现其关心的扩展点。
 * 未实现的扩展点由 colyn 核心跳过或使用默认行为。
 */
export interface ToolchainPlugin {
  // ════════════════════════════════════════════
  // 元数据
  // ════════════════════════════════════════════

  /** 插件唯一标识符，如 'npm' | 'maven' | 'gradle' | 'pip' */
  name: string;

  /** 用于界面展示的名称，如 'Node.js (npm)' */
  displayName: string;

  // ════════════════════════════════════════════
  // 检测扩展点
  // ════════════════════════════════════════════

  /**
   * 检测项目是否使用此工具链
   *
   * 通常通过扫描项目特定文件（package.json / pom.xml 等）判断。
   *
   * @param worktreePath 执行检测的目录路径
   * @returns true 表示匹配，false 表示不匹配
   */
  detect(worktreePath: string): boolean | Promise<boolean>;

  // ════════════════════════════════════════════
  // 环境配置扩展点
  // ════════════════════════════════════════════

  /**
   * 返回端口分配配置
   *
   * 返回 null 表示该工具链不需要端口（如库项目）。
   * colyn 根据返回值决定是否为该插件分配 worktree 端口。
   */
  portConfig?(): PortConfig | null;

  /**
   * 读取配置文件，返回统一键值对
   *
   * 执行策略：按插件注册顺序依次尝试，第一个返回非 null 的结果生效。
   * 插件自行决定从 worktreePath 下的哪个文件读取（如 .env.local）。
   *
   * @param worktreePath worktree 目录路径
   * @returns 键值对，或 null 表示读取失败（文件不存在或格式不支持）
   */
  readRuntimeConfig?(worktreePath: string): Promise<Record<string, string> | null>;

  /**
   * 将键值对写入配置文件（支持原生格式）
   *
   * @param worktreePath worktree 目录路径（由插件自行决定写入哪个配置文件）
   * @param config 要写入的键值对
   */
  writeRuntimeConfig?(worktreePath: string, config: Record<string, string>): Promise<void>;

  // ════════════════════════════════════════════
  // 工具链信息（供其他插件查询，如 terminal session 插件）
  // ════════════════════════════════════════════

  /**
   * 返回 dev server 启动命令
   *
   * 供 terminal session 插件调用，以便在终端中自动启动 dev server。
   * 工具链插件只负责返回命令，不负责执行。
   *
   * @param worktreePath 执行命令检测的目录路径
   * @returns 命令数组（如 ['npm', 'run', 'dev']），或 null 表示无 dev server
   */
  devServerCommand?(worktreePath: string): string[] | null | Promise<string[] | null>;

  // ════════════════════════════════════════════
  // 项目初始化
  // ════════════════════════════════════════════

  /**
   * 返回运行时配置文件名
   *
   * colyn 会确保该文件名被添加到 .gitignore。
   * 返回 null 表示该工具链无运行时配置文件需要忽略。
   *
   * @returns 文件名（如 '.env.local'、'application-local.properties'），或 null
   */
  getRuntimeConfigFileName?(): string | null;

  /**
   * 检查并修复插件专属项目配置
   *
   * 在 `colyn init` 和 `colyn repair` 时调用。
   * 插件应扫描项目结构，识别必要的配置项（如 Xcode 的 scheme / destination）。
   * 如果无法自动确定，可通过交互式提问让用户填写。
   * 结果由 colyn 保存到 `.colyn/settings.json` 的 `pluginSettings[name]` 字段。
   *
   * **典型用途**：Xcode 插件通过此方法询问用户 scheme 和 destination，
   * 供后续 `build` 命令使用。
   *
   * @param context 包含 projectRoot、worktreePath、当前已保存配置、非交互模式标志
   * @returns 插件专属配置键值对（将完整覆盖 pluginSettings[name]）
   */
  repairSettings?(context: RepairSettingsContext): Promise<Record<string, unknown>>;

  // ════════════════════════════════════════════
  // 生命周期操作（插件直接执行，失败则抛出 PluginCommandError）
  // ════════════════════════════════════════════

  /**
   * 安装项目依赖
   *
   * 触发场景：
   * - `colyn add` 后：在新建 worktree 目录下安装依赖
   * - `colyn release` 前：在主分支目录下安装依赖，确保依赖最新
   *
   * @param worktreePath 执行安装的目录路径（worktree 或主分支目录）
   * @throws {PluginCommandError} 安装失败时，output 包含命令输出
   */
  install?(worktreePath: string): Promise<void>;

  /**
   * 执行代码质量检查
   *
   * 触发时机：`colyn merge` 前（预检）和 `colyn release` 前
   *
   * **缺失处理**：如果工具链没有 lint 脚本，插件应**静默跳过**（不抛出异常）。
   *
   * @param worktreePath 执行检查的目录路径
   * @throws {PluginCommandError} lint 失败时，output 包含命令输出
   */
  lint?(worktreePath: string): Promise<void>;

  /**
   * 构建项目
   *
   * 在 `colyn release` 时调用。不实现则跳过。
   *
   * **缺失处理**：如果工具链没有 build 脚本，插件应**静默跳过**（不抛出异常）。
   *
   * @param worktreePath 执行构建的目录路径
   * @throws {PluginCommandError} build 失败时，output 包含命令输出
   */
  build?(worktreePath: string): Promise<void>;

  /**
   * 读取项目当前版本号
   *
   * 在 `colyn release` 时调用，用于确定基础版本以计算 major/minor/patch 增量。
   * 未实现则视为版本不可读（用户需提供完整版本号）。
   *
   * @param worktreePath 执行读取的目录路径
   * @returns 版本号字符串（如 "1.2.0"），或 null 表示无法读取
   */
  readVersion?(worktreePath: string): Promise<string | null>;

  /**
   * 更新项目版本号
   *
   * 在 `colyn release` 时调用。
   *
   * **缺失处理**：已激活插件若未实现此方法，PluginManager 报错终止 release。
   *
   * @param worktreePath 执行版本更新的目录路径
   * @param version 新版本号（如 "1.2.0"）
   */
  bumpVersion?(worktreePath: string, version: string): Promise<void>;
}
