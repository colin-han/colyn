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
  /** 自动启动 dev server */
  AUTO_DEV_SERVER: 'auto start dev server',
  /** 自动继续 Claude 会话 */
  AUTO_CLAUDE: 'auto continues claude session',
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
 * Settings Schema 基础部分（不包含递归的 branchOverrides）
 */
const SettingsSchemaBase = z.object({
  /** 配置文件版本号 */
  version: z.number(),
  /** 界面语言 */
  lang: z.enum(['en', 'zh-CN']).optional(),
  /** 系统命令配置 */
  systemCommands: SystemCommandsSchema.optional(),
  /** tmux 相关配置 */
  tmux: TmuxConfigSchema.optional(),
});

/**
 * Settings Schema（支持递归的 branchOverrides）
 */
export const SettingsSchema: z.ZodType<Settings> = SettingsSchemaBase.extend({
  /** 分支特定配置覆盖 */
  branchOverrides: z.record(z.lazy(() => SettingsSchema.partial())).optional(),
});

/**
 * Settings 类型（自动从 Schema 推断）
 */
export type Settings = z.infer<typeof SettingsSchemaBase> & {
  branchOverrides?: Record<string, Partial<Settings>>;
};

/**
 * 当前配置文件版本号
 */
export const CURRENT_CONFIG_VERSION = 2;

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
      const messages = error.errors
        .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
        .join('\n');

      throw new Error(
        `配置文件验证失败 (${filepath}):\n${messages}`
      );
    }
    throw error;
  }
}
