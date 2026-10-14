# 配置文件版本管理和 Migration 设计文档

## 版本信息
- 文档版本：3.0
- 创建日期：2026-02-14
- 最后更新：2026-10-14

---

## 1. 背景与目标

### 1.1 需求背景

随着项目的发展，配置文件的结构可能会发生变化：
- 字段重命名
- 字段类型变更
- 结构调整
- 新增必填字段

需要一个机制来平滑地迁移用户的配置文件，避免破坏现有配置。

### 1.2 设计目标

1. **自动化**：加载配置时自动检测并迁移
2. **安全性**：保留所有用户自定义的配置
3. **可扩展性**：易于添加新的迁移
4. **可追溯性**：明确配置文件版本
5. **类型安全**：利用 TypeScript 和 Zod 确保类型正确

---

## 2. 核心设计

### 2.1 技术架构

**配置系统使用的库**：
- **Zod (4.3.6)** - Schema 验证和类型推断，**实现版本迁移**
- **JSON5 (2.2.3)** - 解析 JSON 文件（支持注释和尾部逗号）
- **js-yaml (4.1.0)** - 解析 YAML 格式配置文件
- **deepmerge (4.3.1)** - 深度合并配置对象

### 2.2 版本号机制

**版本号定义**：
- 在 `Settings` 接口中添加 `version: number` 字段
- 定义 `CURRENT_CONFIG_VERSION` 常量表示当前最新版本
- **当前版本号：5**

**版本检测**：
- 配置文件中没有 `version` 字段 → 视为版本 0（旧版本）
- 配置文件中的 `version` 小于 `CURRENT_CONFIG_VERSION` → 需要迁移

### 2.3 Zod Transform 迁移模式

**核心思想**：使用 Zod 的 `transform` 功能实现声明式迁移

```typescript
// V1 Schema 定义
const V1SettingsSchema = z.object({
  version: z.literal(1),
  npm: z.string().optional(),
  // ...
});

// V1 → 当前版本的迁移 Schema（串联完整迁移链）
const V1ToCurrentSchema = V1SettingsSchema.transform((v1): Settings =>
  migrateV4ToCurrent(
    migrateV3ToV4Recursive(migrateV2ToV3Recursive(migrateV1ToV2Recursive(v1)))
  )
);

// 统一的配置 Schema（支持所有版本）
export const ConfigSchema = z.union([
  V0ToCurrentSchema, // V0 → V5
  V1ToCurrentSchema, // V1 → V5
  V2ToCurrentSchema, // V2 → V5
  V3ToCurrentSchema, // V3 → V5（plugins/pluginSettings → toolchain/projects）
  V4ToCurrentSchema, // V4 → V5（移除 tmux / systemCommands.claude）
  SettingsSchema,    // 当前版本（V5）
]);
```

**优势**：
- **类型安全**：Zod 自动推断类型，编译时检查
- **声明式**：迁移逻辑即 Schema 定义
- **自动执行**：调用 `ConfigSchema.parse()` 时自动选择匹配的 Schema 并执行迁移
- **易于测试**：每个迁移 Schema 可以独立测试

### 2.4 迁移链

```
Version 0 → V0ToCurrentSchema → V1 → V2 → V3 → V4 → Version 5
Version 1 → V1ToCurrentSchema → V2 → V3 → V4 → Version 5
Version 2 → V2ToCurrentSchema → V3 → V4 → Version 5
Version 3 → V3ToCurrentSchema → V4 → Version 5
Version 4 → V4ToCurrentSchema → Version 5
Version 5 → SettingsSchema (无需迁移)
```

每个旧版本的 Schema 都串联完整的迁移链（`migrateV1ToV2Recursive` → `migrateV2ToV3Recursive` → `migrateV3ToV4Recursive` → `migrateV4ToCurrent`），保证任意旧版本一次 `parse` 即可到达当前版本。

**工作原理**：
1. Zod 的 `z.union()` 会依次尝试每个 Schema
2. 找到匹配的 Schema 后，执行对应的 `transform`
3. 返回迁移后的配置对象

### 2.5 自动迁移流程

```
加载配置文件（JSON5 或 YAML）
    ↓
使用 ConfigSchema.parse(rawConfig)
    ↓
Zod 自动检测版本并选择对应 Schema
    ↓
执行 transform 迁移
    ↓
版本号有变化?
    ↓ 是
保存迁移后的配置
    ↓
返回迁移后的配置
```

---

## 3. 技术实现

### 3.1 类型定义

**文件**: `src/core/config-schema.ts`

```typescript
import { z } from 'zod';

/**
 * 系统命令配置 Schema
 */
export const SystemCommandsSchema = z.object({
  /** 包管理器命令（默认为 'npm'） */
  npm: z.string().optional(),
});

/**
 * 当前配置文件版本号
 */
export const CURRENT_CONFIG_VERSION = 5;

/**
 * Settings Schema 基础部分（不包含递归的 branchOverrides）
 */
const SettingsSchemaBase = z.object({
  /** 配置文件版本号 */
  version: z.number(),
  /** 界面语言 */
  lang: z.enum(['en', 'zh-CN']).optional(),
  /** 全局详细输出 */
  verbose: z.boolean().optional(),
  /** 系统命令配置 */
  systemCommands: SystemCommandsSchema.optional(),
  /** 单项目模式：根目录工具链配置 */
  toolchain: z.union([ToolchainConfigSchema, z.null()]).optional(),
  /** Mono Repo 模式：子项目列表 */
  projects: z.array(SubProjectSchema).optional(),
  /** 自定义分支类型列表 */
  branchCategories: z.array(BranchCategorySchema).optional(),
  /** 未跟踪文件同步清单 */
  syncFiles: z.array(z.string()).optional(),
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
```

### 3.2 版本迁移实现

**文件**: `src/core/config-migration.ts`

#### V0 → V1 → V2 → V3 → V4 → V5 迁移链

```typescript
/**
 * V0 Settings Schema（无版本号）
 */
const V0SettingsSchemaBase = z.object({
  version: z.undefined().optional(),
  lang: z.enum(['en', 'zh-CN']).optional(),
  npm: z.string().optional(),
});

const V0SettingsSchema: z.ZodType<V1Settings> = V0SettingsSchemaBase.extend({
  branchOverrides: z
    .record(z.string(), z.lazy(() => V0SettingsSchema))
    .optional(),
}) as z.ZodType<V1Settings>;

/**
 * V0 → 当前版本 Migration Schema
 * 通过 V1 → V2 → V3 → V4 → V5 的迁移链实现
 */
const V0ToCurrentSchema = V0SettingsSchema.transform((v0): Settings => {
  // V0 → V1: 添加版本号
  const v1: V1Settings = { ...v0, version: 1 };

  // V1 → V2 → V3 → V4 → V5
  return migrateV4ToCurrent(
    migrateV3ToV4Recursive(migrateV2ToV3Recursive(migrateV1ToV2Recursive(v1)))
  );
});
```

> 说明：Zod 的 `z.object` 默认会丢弃未声明的字段，因此旧版本配置中已不再支持的字段在各旧版 Schema 解析阶段就会被自动剥离。

#### V1 → V2 迁移：配置结构重构

```typescript
/**
 * V1 Settings 类型（带有旧字段：npm）
 */
type V1Settings = {
  version?: number;
  lang?: string;
  npm?: string;
  branchOverrides?: Record<string, Partial<V1Settings>>;
};

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

  // 迁移 npm 到 systemCommands
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
```

#### V2 → V3 迁移：配置文件格式支持

V2 → V3 引入了 JSON5 / YAML 格式支持，配置字段本身没有变化，迁移函数只递增版本号并递归处理 `branchOverrides`：

```typescript
/**
 * V2 Settings 类型（已有 systemCommands）
 */
type V2Settings = {
  version: 2;
  lang?: 'en' | 'zh-CN';
  systemCommands?: { npm?: string };
  branchOverrides?: Record<string, Partial<V2Settings>>;
};

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
```

#### V3 → V4 迁移：插件系统重构

```typescript
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

  return result;
}
```

#### V4 → V5 迁移：移除 tmux 相关字段

```typescript
/**
 * V4 Settings 类型
 * 除 version 外使用 loose 保留所有字段，由迁移函数逐项处理
 */
type V4Settings = {
  version: 4;
  [key: string]: unknown;
};

const V4SettingsSchema = z
  .object({ version: z.literal(4) })
  .loose() as unknown as z.ZodType<V4Settings>;

/**
 * 递归迁移 V4 Settings 到 V5
 * - 丢弃 tmux 字段
 * - 丢弃 systemCommands.claude
 * - 其余字段原样保留
 */
function migrateV4ToV5Recursive(
  settings: Record<string, unknown>
): Record<string, unknown> {
  const { tmux: _tmux, systemCommands, branchOverrides, ...rest } = settings;
  void _tmux;

  const result: Record<string, unknown> = { ...rest, version: 5 };

  if (systemCommands && typeof systemCommands === 'object') {
    const { claude: _claude, ...restCommands } =
      systemCommands as Record<string, unknown>;
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
        overrides[branch] = migrateV4ToV5Recursive(
          branchSettings as Record<string, unknown>
        );
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
```

#### 统一配置 Schema

```typescript
/**
 * 各版本 → 当前版本的 Migration Schema
 * 每个旧版本都串联完整的迁移链直到当前版本
 */
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
```

### 3.3 配置加载

**文件**: `src/core/config-loader.ts`

```typescript
import JSON5 from 'json5';
import yaml from 'js-yaml';
import { loadAndMigrateConfig } from './config-migration.js';

/**
 * 配置文件名（按优先级排序）
 */
const CONFIG_FILENAMES = ['settings.json', 'settings.yaml', 'settings.yml'];

/**
 * 加载配置文件
 * - 支持 JSON5 和 YAML 格式
 * - 自动检测版本并迁移
 * - 迁移后自动保存
 */
async function loadConfigFile(filepath: string): Promise<{
  config: Settings;
  wasMigrated: boolean;
} | null> {
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    const ext = path.extname(filepath);

    // 解析配置文件
    let rawConfig: unknown;
    if (ext === '.json') {
      rawConfig = JSON5.parse(content);  // 支持注释和尾部逗号
    } else if (ext === '.yaml' || ext === '.yml') {
      rawConfig = yaml.load(content);
    } else {
      throw new Error(`Unsupported config file format: ${ext}`);
    }

    // 记录旧版本号
    const oldVersion = (rawConfig as { version?: number }).version ?? 0;

    // 使用 Zod 验证和迁移配置
    const migratedConfig = loadAndMigrateConfig(rawConfig);

    // 检查是否发生了迁移
    const wasMigrated = oldVersion !== migratedConfig.version;

    return { config: migratedConfig, wasMigrated };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
```

---

## 4. 迁移历史

### 4.1 V0 → V1：添加版本号

**实施日期**：2026-02-14

**旧配置**（版本 0）：
```json
{
  "lang": "zh-CN",
  "npm": "yarn"
}
```

**迁移后**（版本 1）：
```json
{
  "version": 1,
  "lang": "zh-CN",
  "npm": "yarn"
}
```

### 4.2 V1 → V2：配置结构迁移

**实施日期**：2026-02-20

**旧配置**（版本 1）：
```json
{
  "version": 1,
  "npm": "yarn",
  "branchOverrides": {
    "feature/*": {
      "npm": "pnpm"
    }
  }
}
```

**迁移后**（版本 2）：
```json
{
  "version": 2,
  "systemCommands": {
    "npm": "yarn"
  },
  "branchOverrides": {
    "feature/*": {
      "systemCommands": {
        "npm": "pnpm"
      }
    }
  }
}
```

**迁移内容**：
1. `npm` → `systemCommands.npm`
2. 递归处理 `branchOverrides`

### 4.3 V2 → V3：配置文件格式支持

**实施日期**：2026-02-20

**变更内容**：
- 新增 YAML 格式支持（`settings.yaml`、`settings.yml`）
- 原 JSON 文件改用 JSON5 解析（支持注释和尾部逗号）
- 格式优先级：`settings.json` > `settings.yaml` > `settings.yml`

**迁移内容**：配置字段无需转换，仅递增版本号并递归处理 `branchOverrides`。

### 4.4 V3 → V4：插件系统重构

**实施日期**：2026-02-22

**旧配置**（版本 3）：
```json
{
  "version": 3,
  "systemCommands": {
    "npm": "yarn"
  },
  "plugins": ["npm"],
  "pluginSettings": {
    "npm": { "devScript": "dev" }
  }
}
```

**迁移后**（版本 4）：
```json
{
  "version": 4,
  "systemCommands": {
    "npm": "yarn"
  }
}
```

**迁移内容**：
1. 丢弃 `plugins` 和 `pluginSettings` 字段
2. `toolchain` / `projects` 故意留空（`undefined`），由命令运行时触发「按需发现」重新检测工具链
3. 递归处理 `branchOverrides`

### 4.5 V4 → V5：移除 tmux 集成相关配置

**实施日期**：2026-10-14

**旧配置**（版本 4）：
```json
{
  "version": 4,
  "lang": "zh-CN",
  "systemCommands": {
    "npm": "yarn",
    "claude": "claude --dangerously-skip-permissions"
  },
  "tmux": {
    "layout": "three-pane",
    "autoRun": true
  },
  "branchOverrides": {
    "main": {
      "tmux": { "autoRun": false },
      "systemCommands": { "npm": "pnpm" }
    }
  }
}
```

**迁移后**（版本 5）：
```json
{
  "version": 5,
  "lang": "zh-CN",
  "systemCommands": {
    "npm": "yarn"
  },
  "branchOverrides": {
    "main": {
      "systemCommands": { "npm": "pnpm" }
    }
  }
}
```

**迁移内容**：
1. 删除 `tmux` 字段（tmux 集成已移除）
2. 删除 `systemCommands.claude`（仅用于 tmux pane 启动 Claude）；若删除后 `systemCommands` 为空对象，则整个字段一并移除
3. 其余字段原样保留
4. 递归处理 `branchOverrides`

**实现要点**：
- V4 Schema 使用 `z.object({ version: z.literal(4) }).loose()` 保留所有未知字段，由迁移函数逐项处理
- 迁移函数输出先经 `SettingsSchema.parse()` 验证，确保结果符合当前版本结构

---
---

## 5. 配置文件格式

### 5.1 支持的格式

**JSON5** (推荐)
- 文件名：`settings.json`
- 支持注释（`//` 和 `/* */`）
- 支持尾部逗号
- 更灵活的 JSON 格式

**YAML**
- 文件名：`settings.yaml` 或 `settings.yml`
- 更简洁的语法
- 支持注释（`#`）
- 适合多行配置

### 5.2 格式优先级

当多个格式的配置文件同时存在时：
```
settings.json > settings.yaml > settings.yml
```

### 5.3 格式示例

**JSON5 格式**：
```json5
{
  // 配置文件版本
  "version": 5,

  // 界面语言
  "lang": "zh-CN",

  // 系统命令
  "systemCommands": {
    "npm": "yarn", // 包管理器命令
  },

  // 命令默认值
  "commands": {
    "merge": {
      "build": false, // 合并前跳过构建
    }
  }
}
```

**YAML 格式**：
```yaml
# 配置文件版本
version: 5

# 界面语言
lang: zh-CN

# 系统命令
systemCommands:
  npm: yarn  # 包管理器命令

# 命令默认值
commands:
  merge:
    build: false  # 合并前跳过构建
```

---

## 6. 设计决策

### 6.1 为什么使用 Zod Transform？

**决策**：使用 Zod 的 `transform` 功能，而非手动迁移函数数组

**理由**：
- **类型安全**：Zod 自动推断输入输出类型，编译时检查
- **声明式**：迁移逻辑即 Schema 定义，更清晰
- **自动执行**：`ConfigSchema.parse()` 自动选择并执行迁移
- **易于测试**：每个迁移 Schema 可以独立测试
- **统一验证**：迁移和验证在同一步完成

### 6.2 为什么自动保存？

**决策**：迁移后自动保存配置文件

**理由**：
- **用户友好**：用户无需手动更新配置
- **一致性**：确保磁盘上的配置与内存中的一致
- **避免重复迁移**：下次加载时无需再次迁移

### 6.3 为什么支持多种格式？

**决策**：支持 JSON5 和 YAML 格式

**理由**：
- **JSON5**：支持注释，方便文档化配置
- **YAML**：更简洁，适合复杂配置
- **灵活性**：用户可以选择偏好的格式
- **兼容性**：JSON5 完全兼容标准 JSON

### 6.4 为什么在加载时迁移？

**决策**：在 `loadConfigFile` 中执行迁移，而非单独的命令

**理由**：
- **透明**：对用户完全透明
- **自动化**：无需用户介入
- **及时**：首次使用新版本时立即迁移

---

## 7. 最佳实践

### 7.1 编写迁移函数

**原则**：
1. ✅ **保持幂等性**：多次执行结果相同
2. ✅ **保留用户数据**：不删除用户自定义配置
3. ✅ **提供默认值**：为新字段提供合理默认值
4. ✅ **处理边缘情况**：考虑字段不存在、类型错误等情况
5. ✅ **递归处理**：不要忘记 `branchOverrides` 中的嵌套配置

**示例**：
```typescript
// ❌ 错误：可能删除用户配置
const BadMigrationSchema = V1SettingsSchema.transform((v1) => {
  return { version: 2, systemCommands: { npm: 'npm' } };
});

// ✅ 正确：保留所有用户配置
const GoodMigrationSchema = V1SettingsSchema.transform((v1) => {
  return {
    ...v1,
    version: 2,
    systemCommands: {
      ...v1.systemCommands,
      npm: v1.systemCommands?.npm ?? v1.npm ?? 'npm',
    },
  };
});
```

### 7.2 测试迁移

**测试用例**：
1. ✅ 版本 0 → 最新版本
2. ✅ 中间版本 → 最新版本（跨版本迁移）
3. ✅ 已是最新版本（无需迁移）
4. ✅ 配置文件不存在
5. ✅ 配置文件损坏
6. ✅ 迁移后配置可正常使用
7. ✅ 递归迁移 `branchOverrides`

### 7.3 版本号管理

**规则**：
1. ✅ 每次修改配置结构时递增 `CURRENT_CONFIG_VERSION`
2. ✅ 在 `config-migration.ts` 中添加对应的迁移 Schema
3. ✅ 将新的迁移 Schema 添加到 `ConfigSchema` union
4. ✅ 不要删除旧的迁移 Schema（保持向后兼容）

---

## 8. 配置修改检查清单

**每次修改配置文件结构时，必须检查**：

### 8.1 是否需要迁移？

检查以下情况：
- [ ] 添加了新的**必填**字段
- [ ] 删除了字段
- [ ] 重命名了字段
- [ ] 改变了字段类型
- [ ] 改变了字段的语义
- [ ] 改变了嵌套结构

**如果是以下情况，不需要迁移**：
- ✅ 添加新的**可选**字段（有默认值）
- ✅ 修改字段的默认值
- ✅ 添加新的配置选项

### 8.2 创建迁移的步骤

如果需要迁移：

1. **递增版本号**
   ```typescript
   // src/core/config-schema.ts
   export const CURRENT_CONFIG_VERSION = 6;  // 从 5 改为 6
   ```

2. **定义旧版本 Schema**
   ```typescript
   // src/core/config-migration.ts
   const V5SettingsSchema = z.object({
     version: z.literal(5),
     // V5 的字段定义...
   });
   ```

3. **创建迁移 Schema**
   ```typescript
   const V5ToCurrentSchema = V5SettingsSchema.transform((v5): Settings => {
     // 迁移逻辑
     return {
       ...v5,
       version: 6,
       // 字段转换...
     };
   });
   ```

4. **添加到 ConfigSchema union**
   ```typescript
   export const ConfigSchema = z.union([
     V0ToCurrentSchema,
     V1ToCurrentSchema,
     V2ToCurrentSchema,
     V3ToCurrentSchema,
     V4ToCurrentSchema,
     V5ToCurrentSchema,  // 新增
     SettingsSchema,
   ]);
   ```

5. **处理所有配置层级**
   - [ ] 用户级全局配置
   - [ ] 项目级全局配置
   - [ ] 用户级分支覆盖 (`settings.branchOverrides[*]`)
   - [ ] 项目级分支覆盖 (`settings.branchOverrides[*]`)

6. **测试迁移**
   - [ ] 准备版本 N-1 的配置文件
   - [ ] 加载配置，验证迁移成功
   - [ ] 检查迁移后的配置文件
   - [ ] 验证配置可正常使用

7. **更新文档**
   - [ ] 在本文档中添加迁移示例
   - [ ] 更新 `manual/10-configuration.md`
   - [ ] 更新英文文档 `docs-en/design-config-migration.md`

---

## 9. 相关文档

- [配置重构设计文档](design-config-refactor-with-libraries.md)
- [配置用户手册](../manual/10-configuration.md)
- [CLAUDE.md 配置修改规范](../CLAUDE.md#配置文件修改规范)
- [实施日志](.claude/logs/config-refactor-implementation-20260220.md)
