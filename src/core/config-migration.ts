/**
 * 配置版本迁移模块
 *
 * 使用 Zod transform 实现配置文件的版本迁移
 * - V0 (无版本号) -> V2
 * - V1 -> V2
 *
 * 迁移内容：
 * - V0 -> V1: 添加版本号
 * - V1 -> V2: 配置结构重构和废弃命令处理
 */

import { z } from 'zod';
import {
  BUILTIN_COMMANDS,
  TmuxConfigSchema,
  type Settings,
  type TmuxConfig,
  type PaneConfig,
} from './config-schema.js';

/**
 * 废弃的内置命令常量
 */
const DEPRECATED_BUILTIN_COMMANDS = {
  AUTO_CLAUDE_DANGEROUSLY:
    'auto continues claude session with dangerously skip permissions',
} as const;

/**
 * 迁移单个 Pane 配置中的废弃命令
 */
function migratePaneCommand(paneConfig: PaneConfig | undefined): {
  pane: PaneConfig | undefined;
  needsDangerouslySkipPermissions: boolean;
} {
  if (!paneConfig || !paneConfig.command) {
    return { pane: paneConfig, needsDangerouslySkipPermissions: false };
  }

  if (paneConfig.command === DEPRECATED_BUILTIN_COMMANDS.AUTO_CLAUDE_DANGEROUSLY) {
    return {
      pane: {
        ...paneConfig,
        command: BUILTIN_COMMANDS.AUTO_CLAUDE,
      },
      needsDangerouslySkipPermissions: true,
    };
  }

  return { pane: paneConfig, needsDangerouslySkipPermissions: false };
}

/**
 * 迁移 Tmux 配置中的所有废弃命令
 */
function migrateTmuxCommands(tmuxConfig: TmuxConfig | undefined): {
  tmux: TmuxConfig | undefined;
  needsDangerouslySkipPermissions: boolean;
} {
  if (!tmuxConfig) {
    return { tmux: undefined, needsDangerouslySkipPermissions: false };
  }

  const migratedTmux: TmuxConfig = { ...tmuxConfig };
  let needsFlag = false;

  // 迁移所有 pane 配置
  const panes = [
    'leftPane',
    'rightPane',
    'topPane',
    'bottomPane',
    'topRightPane',
    'bottomRightPane',
    'topLeftPane',
    'bottomLeftPane',
  ] as const;

  for (const paneName of panes) {
    const { pane, needsDangerouslySkipPermissions } = migratePaneCommand(
      tmuxConfig[paneName]
    );
    migratedTmux[paneName] = pane;
    needsFlag = needsFlag || needsDangerouslySkipPermissions;
  }

  return { tmux: migratedTmux, needsDangerouslySkipPermissions: needsFlag };
}

/**
 * 递归迁移 Settings（处理 branchOverrides）
 */
function migrateSettingsRecursive(
  settings: V1Settings,
  isTopLevel = true
): Settings {
  const result: Settings = {
    version: 2,
  };

  // 迁移 lang
  if (settings.lang) {
    result.lang = settings.lang as 'en' | 'zh-CN';
  }

  // 迁移 npm 和 claudeCommand 到 systemCommands
  const hasOldNpm = 'npm' in settings && settings.npm !== undefined;
  const hasOldClaudeCommand =
    'claudeCommand' in settings && settings.claudeCommand !== undefined;

  if (hasOldNpm || hasOldClaudeCommand) {
    result.systemCommands = {};

    if (hasOldNpm) {
      result.systemCommands.npm = settings.npm;
    }

    if (hasOldClaudeCommand) {
      result.systemCommands.claude = settings.claudeCommand;
    }
  }

  // 迁移 tmux 配置和废弃命令
  if (settings.tmux) {
    const { tmux, needsDangerouslySkipPermissions } = migrateTmuxCommands(
      settings.tmux
    );
    result.tmux = tmux;

    // 如果检测到废弃的命令，添加 --dangerously-skip-permissions 到 systemCommands.claude
    if (needsDangerouslySkipPermissions && isTopLevel) {
      result.systemCommands = result.systemCommands || {};
      const currentClaudeCommand = result.systemCommands.claude || 'claude';

      // 如果还没有 --dangerously-skip-permissions 参数，添加它
      if (!currentClaudeCommand.includes('--dangerously-skip-permissions')) {
        result.systemCommands.claude = `${currentClaudeCommand} --dangerously-skip-permissions`;
      }
    }
  }

  // 递归处理 branchOverrides
  if (settings.branchOverrides) {
    result.branchOverrides = {};
    for (const [branch, branchSettings] of Object.entries(
      settings.branchOverrides
    )) {
      // 递归迁移每个分支的配置（不是顶层，所以不添加 dangerously-skip-permissions）
      result.branchOverrides[branch] = migrateSettingsRecursive(
        branchSettings as V1Settings,
        false
      );
    }
  }

  return result;
}

/**
 * V1 Settings 类型（带有旧字段）
 */
type V1Settings = {
  version?: number;
  lang?: string;
  npm?: string;
  claudeCommand?: string;
  tmux?: TmuxConfig;
  branchOverrides?: Record<string, Partial<V1Settings>>;
};

/**
 * V1 Settings Schema
 */
const V1SettingsSchemaBase = z.object({
  version: z.literal(1),
  lang: z.enum(['en', 'zh-CN']).optional(),
  npm: z.string().optional(),
  claudeCommand: z.string().optional(),
  tmux: TmuxConfigSchema.optional(),
});

const V1SettingsSchema: z.ZodType<V1Settings> = V1SettingsSchemaBase.extend({
  branchOverrides: z.record(z.lazy(() => V1SettingsSchema.partial())).optional(),
});

/**
 * V1 -> V2 Migration Schema
 */
export const V1ToV2Schema = V1SettingsSchema.transform(
  (v1): Settings => migrateSettingsRecursive(v1)
);

/**
 * V0 Settings Schema（无版本号）
 */
const V0SettingsSchemaBase = z.object({
  version: z.undefined(),
  lang: z.enum(['en', 'zh-CN']).optional(),
  npm: z.string().optional(),
  claudeCommand: z.string().optional(),
  tmux: TmuxConfigSchema.optional(),
});

const V0SettingsSchema: z.ZodType<V1Settings> = V0SettingsSchemaBase.extend({
  branchOverrides: z.record(z.lazy(() => V0SettingsSchema.partial())).optional(),
});

/**
 * V0 -> V2 Migration Schema
 */
export const V0ToV2Schema = V0SettingsSchema.transform((v0): Settings => {
  // V0 -> V1: 添加版本号
  const v1: V1Settings = {
    ...v0,
    version: 1,
  };

  // V1 -> V2: 迁移配置结构
  return migrateSettingsRecursive(v1);
});

/**
 * 统一的配置 Schema（支持所有版本）
 * Zod 会自动选择匹配的 Schema 并执行 transform
 */
import { SettingsSchema } from './config-schema.js';

export const ConfigSchema = z.union([
  V0ToV2Schema,
  V1ToV2Schema,
  SettingsSchema, // 当前版本（V2）
]);

/**
 * 加载并自动迁移配置
 * @param rawConfig 原始配置数据
 * @returns 迁移后的配置
 */
export function loadAndMigrateConfig(rawConfig: unknown): Settings {
  return ConfigSchema.parse(rawConfig);
}
