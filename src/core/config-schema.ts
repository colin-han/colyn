/**
 * 配置文件 Schema 定义
 *
 * 使用 Zod 定义配置文件的结构和验证规则
 * - 类型定义和运行时验证合二为一
 * - 自动类型推断，无需手写 interface
 * - 支持配置版本迁移
 */

import { z } from 'zod';

/**
 * 内置命令常量
 */
export const BUILTIN_COMMANDS = {
  /** 启动 dev server */
  AUTO_DEV_SERVER: 'start dev server',
  /** 继续 Claude 会话 */
  AUTO_CLAUDE: 'continue claude session',
} as const;

/**
 * 布局类型
 */
export const LayoutTypeSchema = z.enum([
  'single-pane',
  'two-pane-horizontal',
  'two-pane-vertical',
  'three-pane',
  'four-pane',
]);

export type LayoutType = z.infer<typeof LayoutTypeSchema>;

/**
 * Pane 命令 Schema
 * - 内置命令：使用预定义的自动检测逻辑
 * - string: 自定义命令
 * - null: 不执行任何命令
 */
export const PaneCommandSchema = z.union([
  z.literal(BUILTIN_COMMANDS.AUTO_DEV_SERVER),
  z.literal(BUILTIN_COMMANDS.AUTO_CLAUDE),
  z.string(),
  z.null(),
]);

export type PaneCommand = z.infer<typeof PaneCommandSchema>;

/**
 * 单个 Pane 的配置 Schema
 */
export const PaneConfigSchema = z.object({
  /** 要执行的命令 */
  command: PaneCommandSchema.optional(),
  /** Pane 大小（百分比，如 "50%"） */
  size: z.string().optional(),
});

export type PaneConfig = z.infer<typeof PaneConfigSchema>;

/**
 * Tmux 配置 Schema
 */
export const TmuxConfigSchema = z.object({
  /** 是否自动运行命令 */
  autoRun: z.boolean().optional(),

  /** 布局类型 */
  layout: LayoutTypeSchema.optional(),

  /** 窗格配置 */
  leftPane: PaneConfigSchema.optional(),
  rightPane: PaneConfigSchema.optional(),
  topPane: PaneConfigSchema.optional(),
  bottomPane: PaneConfigSchema.optional(),
  topRightPane: PaneConfigSchema.optional(),
  bottomRightPane: PaneConfigSchema.optional(),
  topLeftPane: PaneConfigSchema.optional(),
  bottomLeftPane: PaneConfigSchema.optional(),

  /** 四窗格布局的分割配置 */
  horizontalSplit: z.string().optional(),
  verticalSplit: z.string().optional(),
});

export type TmuxConfig = z.infer<typeof TmuxConfigSchema>;

/**
 * 系统命令配置 Schema
 */
export const SystemCommandsSchema = z.object({
  /** 包管理器命令（默认为 'npm'） */
  npm: z.string().optional(),
  /** Claude 命令（默认为 'claude'） */
  claude: z.string().optional(),
});

export type SystemCommands = z.infer<typeof SystemCommandsSchema>;

/**
 * 工具链配置 Schema
 * 描述单个子项目（或根目录）使用的工具链类型和专属配置
 */
export const ToolchainConfigSchema = z.object({
  /** 工具链类型，如 'npm'、'maven'、'xcode' */
  type: z.string(),
  /** 工具链专属配置（由各插件的 repairSettings 写入，如 xcode 的 scheme/destination） */
  settings: z.record(z.string(), z.unknown()).default({}),
});

export type ToolchainConfig = z.infer<typeof ToolchainConfigSchema>;

/**
 * 子项目配置 Schema（Mono Repo 模式）
 */
export const SubProjectSchema = z.object({
  /** 子项目相对路径（相对于 worktree 根目录） */
  path: z.string(),
  /** 子项目使用的工具链，null 表示无工具链 */
  toolchain: z.union([ToolchainConfigSchema, z.null()]),
});

export type SubProject = z.infer<typeof SubProjectSchema>;

/**
 * Branch Category Schema
 * 定义分支类型（用于 add/checkout/todo add 时的 type 选择）
 */
export const BranchCategorySchema = z.object({
  /** 分支类型名称，用于实际分支名（如 feature/xxx） */
  name: z.string(),
  /** 显示缩写，可含 emoji（如 ✨feat），不填时截取 name 前4字母 */
  abbr: z.string().optional(),
});

export type BranchCategory = z.infer<typeof BranchCategorySchema>;

/**
 * Merge 命令默认值配置
 * 所有字段都是"正向能力开关"，默认值由命令实现兜底
 */
export const MergeCommandConfigSchema = z
  .object({
    build: z.boolean().optional(),
    rebase: z.boolean().optional(),
    update: z.boolean().optional(),
    fetch: z.boolean().optional(),
    all: z.boolean().optional(),
  })
  .strict();

export type MergeCommandConfig = z.infer<typeof MergeCommandConfigSchema>;

/**
 * Update 命令默认值配置
 */
export const UpdateCommandConfigSchema = z
  .object({
    rebase: z.boolean().optional(),
    fetch: z.boolean().optional(),
    all: z.boolean().optional(),
  })
  .strict();

export type UpdateCommandConfig = z.infer<typeof UpdateCommandConfigSchema>;

/**
 * Release 命令默认值配置
 */
export const ReleaseCommandConfigSchema = z
  .object({
    update: z.boolean().optional(),
    build: z.boolean().optional(),
    tag: z.boolean().optional(),
    versionUpdate: z.boolean().optional(),
  })
  .strict();

export type ReleaseCommandConfig = z.infer<typeof ReleaseCommandConfigSchema>;

/**
 * Checkout 命令默认值配置
 */
export const CheckoutCommandConfigSchema = z
  .object({
    fetch: z.boolean().optional(),
  })
  .strict();

export type CheckoutCommandConfig = z.infer<typeof CheckoutCommandConfigSchema>;

/**
 * commands 配置容器
 */
export const CommandsConfigSchema = z
  .object({
    merge: MergeCommandConfigSchema.optional(),
    update: UpdateCommandConfigSchema.optional(),
    release: ReleaseCommandConfigSchema.optional(),
    checkout: CheckoutCommandConfigSchema.optional(),
  })
  .strict();

export type CommandsConfig = z.infer<typeof CommandsConfigSchema>;

/**
 * GitHub backend 专属配置
 */
export const GitHubTodoConfigSchema = z.object({
  /** archived label 名；未配置时所有 closed(done) issue 视为 archived */
  archivedLabel: z.string().nullable().default(null),
  /** colyn type ↔ GitHub label 映射；未配置时按同名处理 */
  typeLabels: z.record(z.string(), z.string()).default({}),
});

/**
 * Todo backend 配置
 */
export const TodoConfigSchema = z.object({
  /** 激活的 backend 名，默认 'local' */
  backend: z.string().default('local'),
  /** complete 标记 done 时是否自动归档，默认 false */
  autoArchive: z.boolean().default(false),
  /** GitHub backend 配置 */
  github: GitHubTodoConfigSchema.default({ archivedLabel: null, typeLabels: {} }),
});

export type TodoConfig = z.infer<typeof TodoConfigSchema>;

/**
 * Settings Schema 基础部分（不包含递归的 branchOverrides）
 */
const SettingsSchemaBase = z.object({
  /** 配置文件版本号 */
  version: z.number(),
  /** 界面语言 */
  lang: z.enum(['en', 'zh-CN']).optional(),
  /** 全局详细输出（影响所有支持 --verbose 的命令） */
  verbose: z.boolean().optional(),
  /** 系统命令配置 */
  systemCommands: SystemCommandsSchema.optional(),
  /** tmux 相关配置 */
  tmux: TmuxConfigSchema.optional(),
  /**
   * 单项目模式：根目录工具链配置
   * - undefined: 尚未检测（触发按需发现）
   * - null: 明确无工具链
   * - ToolchainConfig: 已配置的工具链
   */
  toolchain: z.union([ToolchainConfigSchema, z.null()]).optional(),
  /**
   * Mono Repo 模式：子项目列表
   * - undefined: 尚未检测
   * - 数组：已配置的子项目列表
   */
  projects: z.array(SubProjectSchema).optional(),
  /**
   * 自定义分支类型列表（排在默认类型前面）
   * 用于 add/checkout/todo add 的 type 选择
   */
  branchCategories: z.array(BranchCategorySchema).optional(),
  /** 子命令的默认值配置 */
  commands: CommandsConfigSchema.optional(),
  /** Todo backend 配置 */
  todo: TodoConfigSchema.optional(),
});

/**
 * Settings 类型（自动从 Schema 推断）
 */
export type Settings = z.infer<typeof SettingsSchemaBase> & {
  branchOverrides?: Record<string, Partial<Settings>>;
};

/**
 * Settings Schema（支持递归的 branchOverrides）
 */
export const SettingsSchema: z.ZodType<Settings> = SettingsSchemaBase.extend({
  /** 分支特定配置覆盖 */
  branchOverrides: z
    .record(z.string(), z.lazy(() => SettingsSchema))
    .optional(),
}) as z.ZodType<Settings>;

/**
 * 当前配置文件版本号
 */
export const CURRENT_CONFIG_VERSION = 4;

/**
 * 验证配置对象
 * @param data 待验证的数据
 * @returns 验证后的配置对象
 * @throws ZodError 如果验证失败
 */
export function validateSettings(data: unknown): Settings {
  return SettingsSchema.parse(data);
}

/**
 * 验证配置对象（带友好的错误提示）
 * @param filepath 配置文件路径（用于错误提示）
 * @param data 待验证的数据
 * @returns 验证后的配置对象
 * @throws Error 如果验证失败，包含友好的错误信息
 */
export function validateSettingsWithFriendlyError(
  filepath: string,
  data: unknown
): Settings {
  try {
    return SettingsSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues
        .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
        .join('\n');

      throw new Error(
        `配置文件验证失败 (${filepath}):\n${messages}`
      );
    }
    throw error;
  }
}
