/**
 * 配置版本迁移模块
 *
 * 使用 Zod transform 实现配置文件的版本迁移
 * - V0 (无版本号) -> V3
 * - V1 -> V3
 * - V2 -> V3
 *
 * 迁移内容：
 * - V0 -> V1: 添加版本号
 * - V1 -> V2: 配置结构重构和废弃命令处理
 * - V2 -> V3: 重命名内置命令（去掉 "auto" 前缀）
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
  /** V1 废弃 */
  AUTO_CLAUDE_DANGEROUSLY:
    'auto continues claude session with dangerously skip permissions',
  /** V2 废弃（V3 改为无 "auto" 前缀） */
  AUTO_CLAUDE_OLD: 'auto continues claude session',
  AUTO_DEV_SERVER_OLD: 'auto start dev server',
} as const;

// ============================================================================
// V1 Settings 类型和 Schema
// ============================================================================

/**
 * V1 Settings 类型（带有旧字段：npm, claudeCommand）
 */
type V1Settings = {
  version?: number;
  lang?: string;
  npm?: string;
  claudeCommand?: string;
  tmux?: TmuxConfig;
  branchOverrides?: Record<string, Partial<V1Settings>>;
};

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

// ============================================================================
// V2 Settings 类型和 Schema
// ============================================================================

/**
 * V2 Settings 类型（已有 systemCommands，但内置命令还有 "auto" 前缀）
 */
type V2Settings = Omit<Settings, 'version'> & {
  version: 2;
};

const V2SettingsSchemaBase = z.object({
  version: z.literal(2),
  lang: z.enum(['en', 'zh-CN']).optional(),
  systemCommands: z
    .object({
      npm: z.string().optional(),
      claude: z.string().optional(),
    })
    .optional(),
  tmux: TmuxConfigSchema.optional(),
});

const V2SettingsSchema: z.ZodType<V2Settings> = V2SettingsSchemaBase.extend({
  branchOverrides: z.record(z.lazy(() => V2SettingsSchema.partial())).optional(),
}) as unknown as z.ZodType<V2Settings>;

// ============================================================================
// V0 Settings Schema（无版本号）
// ============================================================================

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

// ============================================================================
// 迁移辅助函数
// ============================================================================

/**
 * 迁移单个 Pane 配置中的废弃命令（V1->V2: dangerously）
 */
function migratePaneCommandV1ToV2(paneConfig: PaneConfig | undefined): {
  pane: PaneConfig | undefined;
  needsDangerouslySkipPermissions: boolean;
} {
  if (!paneConfig || !paneConfig.command) {
    return { pane: paneConfig, needsDangerouslySkipPermissions: false };
  }

  if (
    paneConfig.command === DEPRECATED_BUILTIN_COMMANDS.AUTO_CLAUDE_DANGEROUSLY
  ) {
    return {
      pane: {
        ...paneConfig,
        command: DEPRECATED_BUILTIN_COMMANDS.AUTO_CLAUDE_OLD,
      },
      needsDangerouslySkipPermissions: true,
    };
  }

  return { pane: paneConfig, needsDangerouslySkipPermissions: false };
}

/**
 * 迁移单个 Pane 配置中的命令名称（V2->V3: 去掉 "auto" 前缀）
 */
function migratePaneCommandV2ToV3(
  paneConfig: PaneConfig | undefined
): PaneConfig | undefined {
  if (!paneConfig || !paneConfig.command) {
    return paneConfig;
  }

  if (paneConfig.command === DEPRECATED_BUILTIN_COMMANDS.AUTO_CLAUDE_OLD) {
    return {
      ...paneConfig,
      command: BUILTIN_COMMANDS.AUTO_CLAUDE,
    };
  }

  if (paneConfig.command === DEPRECATED_BUILTIN_COMMANDS.AUTO_DEV_SERVER_OLD) {
    return {
      ...paneConfig,
      command: BUILTIN_COMMANDS.AUTO_DEV_SERVER,
    };
  }

  return paneConfig;
}

/**
 * 迁移 Tmux 配置中的所有废弃命令（V1->V2）
 */
function migrateTmuxCommandsV1ToV2(tmuxConfig: TmuxConfig | undefined): {
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
    const { pane, needsDangerouslySkipPermissions } =
      migratePaneCommandV1ToV2(tmuxConfig[paneName]);
    migratedTmux[paneName] = pane;
    needsFlag = needsFlag || needsDangerouslySkipPermissions;
  }

  return { tmux: migratedTmux, needsDangerouslySkipPermissions: needsFlag };
}

/**
 * 迁移 Tmux 配置中的命令名称（V2->V3）
 */
function migrateTmuxCommandsV2ToV3(
  tmuxConfig: TmuxConfig | undefined
): TmuxConfig | undefined {
  if (!tmuxConfig) {
    return undefined;
  }

  const migratedTmux: TmuxConfig = { ...tmuxConfig };

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
    migratedTmux[paneName] = migratePaneCommandV2ToV3(tmuxConfig[paneName]);
  }

  return migratedTmux;
}

// ============================================================================
// V1 -> V2 迁移
// ============================================================================

/**
 * 递归迁移 V1 Settings 到 V2（处理 branchOverrides）
 */
function migrateV1ToV2Recursive(
  settings: V1Settings,
  isTopLevel = true
): V2Settings {
  const result: V2Settings = {
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
    const { tmux, needsDangerouslySkipPermissions } =
      migrateTmuxCommandsV1ToV2(settings.tmux);
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
      result.branchOverrides[branch] = migrateV1ToV2Recursive(
        branchSettings as V1Settings,
        false
      );
    }
  }

  return result;
}

/**
 * V1 -> V2 Migration Schema
 */
const V1ToV2Schema = V1SettingsSchema.transform(
  (v1): V2Settings => migrateV1ToV2Recursive(v1)
);

// ============================================================================
// V2 -> V3 迁移
// ============================================================================

/**
 * 递归迁移 V2 Settings 到 V3（处理 branchOverrides）
 */
function migrateV2ToV3Recursive(settings: V2Settings): Settings {
  const result: Settings = {
    version: 3,
    lang: settings.lang,
    systemCommands: settings.systemCommands,
  };

  // 迁移 tmux 配置中的命令名称
  if (settings.tmux) {
    result.tmux = migrateTmuxCommandsV2ToV3(settings.tmux);
  }

  // 递归处理 branchOverrides
  if (settings.branchOverrides) {
    result.branchOverrides = {};
    for (const [branch, branchSettings] of Object.entries(
      settings.branchOverrides
    )) {
      result.branchOverrides[branch] = migrateV2ToV3Recursive(
        branchSettings as V2Settings
      );
    }
  }

  return result;
}

/**
 * V2 -> V3 Migration Schema
 */
const V2ToV3Schema = V2SettingsSchema.transform(
  (v2): Settings => migrateV2ToV3Recursive(v2)
);

// ============================================================================
// V0 -> V3 迁移（通过 V1 -> V2 -> V3）
// ============================================================================

/**
 * V0 -> V3 Migration Schema
 */
const V0ToV3Schema = V0SettingsSchema.transform((v0): Settings => {
  // V0 -> V1: 添加版本号
  const v1: V1Settings = {
    ...v0,
    version: 1,
  };

  // V1 -> V2: 迁移配置结构
  const v2 = migrateV1ToV2Recursive(v1);

  // V2 -> V3: 重命名内置命令
  return migrateV2ToV3Recursive(v2);
});

// ============================================================================
// 统一配置 Schema
// ============================================================================

import { SettingsSchema } from './config-schema.js';

/**
 * 统一的配置 Schema（支持所有版本）
 * Zod 会自动选择匹配的 Schema 并执行 transform
 */
export const ConfigSchema = z.union([
  V0ToV3Schema,  // V0 -> V3
  V1ToV2Schema,  // V1 -> V2
  V2ToV3Schema,  // V2 -> V3
  SettingsSchema, // 当前版本（V3）
]);

/**
 * 加载并自动迁移配置
 * @param rawConfig 原始配置数据
 * @returns 迁移后的配置
 */
export function loadAndMigrateConfig(rawConfig: unknown): Settings {
  return ConfigSchema.parse(rawConfig);
}
