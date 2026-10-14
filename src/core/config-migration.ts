/**
 * 配置版本迁移模块
 *
 * 使用 Zod transform 实现配置文件的版本迁移
 * - V0 (无版本号) -> V5
 * - V1 -> V5
 * - V2 -> V5
 * - V3 -> V5
 * - V4 -> V5
 *
 * 迁移内容：
 * - V0 -> V1: 添加版本号
 * - V1 -> V2: 配置结构重构（npm/claudeCommand → systemCommands）
 * - V2 -> V3: 重命名内置命令（历史上仅影响 tmux 配置，现已随 tmux 一并移除）
 * - V3 -> V4: 插件系统重构（plugins/pluginSettings → toolchain/projects）
 * - V4 -> V5: 移除 tmux 集成（丢弃 tmux 字段与 systemCommands.claude）
 *
 * 注意：Zod 的 z.object 默认会丢弃未声明的字段，因此旧版本配置中的
 * tmux 字段在任一旧版 Schema 解析阶段就会被自动剥离。
 */

import { z } from 'zod';
import { SettingsSchema, type Settings } from './config-schema.js';

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
  branchOverrides?: Record<string, Partial<V1Settings>>;
};

const V1SettingsSchemaBase = z.object({
  version: z.literal(1),
  lang: z.enum(['en', 'zh-CN']).optional(),
  npm: z.string().optional(),
  claudeCommand: z.string().optional(),
});

const V1SettingsSchema: z.ZodType<V1Settings> = V1SettingsSchemaBase.extend({
  branchOverrides: z
    .record(z.string(), z.lazy(() => V1SettingsSchema))
    .optional(),
}) as z.ZodType<V1Settings>;

// ============================================================================
// V2 Settings 类型和 Schema
// ============================================================================

/**
 * V2 Settings 类型（已有 systemCommands）
 */
type V2Settings = {
  version: 2;
  lang?: 'en' | 'zh-CN';
  systemCommands?: { npm?: string };
  branchOverrides?: Record<string, Partial<V2Settings>>;
};

const V2SettingsSchemaBase = z.object({
  version: z.literal(2),
  lang: z.enum(['en', 'zh-CN']).optional(),
  systemCommands: z
    .object({
      npm: z.string().optional(),
    })
    .optional(),
});

const V2SettingsSchema: z.ZodType<V2Settings> = V2SettingsSchemaBase.extend({
  branchOverrides: z
    .record(z.string(), z.lazy(() => V2SettingsSchema))
    .optional(),
}) as z.ZodType<V2Settings>;

// ============================================================================
// V0 Settings Schema（无版本号）
// ============================================================================

const V0SettingsSchemaBase = z.object({
  version: z.undefined().optional(),
  lang: z.enum(['en', 'zh-CN']).optional(),
  npm: z.string().optional(),
  claudeCommand: z.string().optional(),
});

const V0SettingsSchema: z.ZodType<V1Settings> = V0SettingsSchemaBase.extend({
  branchOverrides: z
    .record(z.string(), z.lazy(() => V0SettingsSchema))
    .optional(),
}) as z.ZodType<V1Settings>;

// ============================================================================
// V3 Settings 类型和 Schema（包含 plugins/pluginSettings 的旧版本）
// ============================================================================

/**
 * V3 Settings 类型（含旧字段：plugins, pluginSettings）
 */
type V3Settings = {
  version: 3;
  lang?: 'en' | 'zh-CN';
  systemCommands?: { npm?: string };
  plugins?: string[];
  pluginSettings?: Record<string, Record<string, unknown>>;
  branchOverrides?: Record<string, Partial<V3Settings>>;
};

const V3SettingsSchemaBase = z.object({
  version: z.literal(3),
  lang: z.enum(['en', 'zh-CN']).optional(),
  systemCommands: z
    .object({
      npm: z.string().optional(),
    })
    .optional(),
  plugins: z.array(z.string()).optional(),
  pluginSettings: z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .optional(),
});

const V3SettingsSchema: z.ZodType<V3Settings> = V3SettingsSchemaBase.extend({
  branchOverrides: z
    .record(z.string(), z.lazy(() => V3SettingsSchema))
    .optional(),
}) as z.ZodType<V3Settings>;

// ============================================================================
// V4 Settings Schema（含 tmux 与 systemCommands.claude 的旧版本）
// ============================================================================

/**
 * V4 Settings 类型
 * 除 version 外使用 passthrough 保留所有字段，由迁移函数逐项处理
 */
type V4Settings = {
  version: 4;
  [key: string]: unknown;
};

const V4SettingsSchema = z
  .object({
    version: z.literal(4),
  })
  .loose() as unknown as z.ZodType<V4Settings>;

// ============================================================================
// V1 -> V2 迁移
// ============================================================================

/**
 * 递归迁移 V1 Settings 到 V2（处理 branchOverrides）
 */
function migrateV1ToV2Recursive(settings: V1Settings): V2Settings {
  const result: V2Settings = {
    version: 2,
  };

  // 迁移 lang
  if (settings.lang) {
    result.lang = settings.lang as 'en' | 'zh-CN';
  }

  // 迁移 npm 到 systemCommands（claudeCommand 已随 tmux 集成一并废弃）
  if ('npm' in settings && settings.npm !== undefined) {
    result.systemCommands = { npm: settings.npm };
  }

  // 递归处理 branchOverrides
  if (settings.branchOverrides) {
    result.branchOverrides = {};
    for (const [branch, branchSettings] of Object.entries(
      settings.branchOverrides
    )) {
      result.branchOverrides[branch] = migrateV1ToV2Recursive(
        branchSettings as V1Settings
      );
    }
  }

  return result;
}

// ============================================================================
// V2 -> V3 迁移
// ============================================================================

/**
 * 递归迁移 V2 Settings 到 V3（处理 branchOverrides）
 */
function migrateV2ToV3Recursive(settings: V2Settings): V3Settings {
  const result: V3Settings = {
    version: 3,
    lang: settings.lang,
    systemCommands: settings.systemCommands,
  };

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

// ============================================================================
// V3 -> V4 迁移
// ============================================================================

/**
 * 递归迁移 V3 Settings 到 V4
 * - 丢弃 plugins 和 pluginSettings（在运行时按需重新检测）
 * - toolchain 和 projects 设为 undefined（触发按需发现）
 */
function migrateV3ToV4Recursive(settings: V3Settings): V4Settings {
  const result: V4Settings = {
    version: 4,
    lang: settings.lang,
    systemCommands: settings.systemCommands,
  };

  // 递归处理 branchOverrides
  if (settings.branchOverrides) {
    const overrides: Record<string, V4Settings> = {};
    for (const [branch, branchSettings] of Object.entries(
      settings.branchOverrides
    )) {
      overrides[branch] = migrateV3ToV4Recursive(branchSettings as V3Settings);
    }
    result.branchOverrides = overrides;
  }

  // 注意：toolchain 和 projects 故意不设置（undefined），
  // 这会在命令运行时触发「按需发现」流程重新检测工具链

  return result;
}

// ============================================================================
// V4 -> V5 迁移
// ============================================================================

/**
 * 递归迁移 V4 Settings 到 V5
 * - 丢弃 tmux 字段（tmux 集成已移除）
 * - 丢弃 systemCommands.claude（仅用于 tmux pane 启动 Claude）
 * - 其余字段原样保留
 */
function migrateV4ToV5Recursive(settings: Record<string, unknown>): Record<string, unknown> {
  const { tmux: _tmux, systemCommands, branchOverrides, ...rest } = settings;
  void _tmux;

  const result: Record<string, unknown> = { ...rest, version: 5 };

  if (systemCommands && typeof systemCommands === 'object') {
    const { claude: _claude, ...restCommands } = systemCommands as Record<string, unknown>;
    void _claude;
    if (Object.keys(restCommands).length > 0) {
      result.systemCommands = restCommands;
    }
  }

  if (branchOverrides && typeof branchOverrides === 'object') {
    const overrides: Record<string, unknown> = {};
    for (const [branch, branchSettings] of Object.entries(
      branchOverrides as Record<string, unknown>
    )) {
      if (branchSettings && typeof branchSettings === 'object') {
        overrides[branch] = migrateV4ToV5Recursive(branchSettings as Record<string, unknown>);
      }
    }
    result.branchOverrides = overrides;
  }

  return result;
}

/**
 * 将 V4 结构迁移到当前版本并验证
 */
function migrateV4ToCurrent(settings: V4Settings): Settings {
  return SettingsSchema.parse(migrateV4ToV5Recursive(settings));
}

// ============================================================================
// 各版本 -> 当前版本 Migration Schema
// ============================================================================

const V0ToCurrentSchema = V0SettingsSchema.transform((v0): Settings => {
  const v1: V1Settings = { ...v0, version: 1 };
  return migrateV4ToCurrent(
    migrateV3ToV4Recursive(migrateV2ToV3Recursive(migrateV1ToV2Recursive(v1)))
  );
});

const V1ToCurrentSchema = V1SettingsSchema.transform((v1): Settings =>
  migrateV4ToCurrent(
    migrateV3ToV4Recursive(migrateV2ToV3Recursive(migrateV1ToV2Recursive(v1)))
  )
);

const V2ToCurrentSchema = V2SettingsSchema.transform((v2): Settings =>
  migrateV4ToCurrent(migrateV3ToV4Recursive(migrateV2ToV3Recursive(v2)))
);

const V3ToCurrentSchema = V3SettingsSchema.transform((v3): Settings =>
  migrateV4ToCurrent(migrateV3ToV4Recursive(v3))
);

const V4ToCurrentSchema = V4SettingsSchema.transform((v4): Settings =>
  migrateV4ToCurrent(v4)
);

// ============================================================================
// 统一配置 Schema
// ============================================================================

/**
 * 统一的配置 Schema（支持所有版本）
 * Zod 会自动选择匹配的 Schema 并执行 transform
 *
 * 注意：顺序很重要，version literal 更具体的 Schema 放在前面
 */
export const ConfigSchema = z.union([
  V0ToCurrentSchema, // V0（版本号为 undefined）
  V1ToCurrentSchema, // V1
  V2ToCurrentSchema, // V2
  V3ToCurrentSchema, // V3（含 plugins/pluginSettings）
  V4ToCurrentSchema, // V4（含 tmux/systemCommands.claude）
  SettingsSchema,    // 当前版本（V5）
]);

/**
 * 加载并自动迁移配置
 * @param rawConfig 原始配置数据
 * @returns 迁移后的配置
 */
export function loadAndMigrateConfig(rawConfig: unknown): Settings {
  return ConfigSchema.parse(rawConfig);
}
