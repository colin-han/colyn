# 配置文件版本管理和 Migration 设计文档

## 版本信息
- 文档版本：2.0
- 创建日期：2026-02-14
- 最后更新：2026-02-20

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
- **当前版本号：4**

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
  claudeCommand: z.string().optional(),
  // ...
});

// V1 → V2 迁移 Schema
const V1ToV2Schema = V1SettingsSchema.transform((v1): V2Settings => {
  return {
    version: 2,
    systemCommands: {
      npm: v1.npm,
      claude: v1.claudeCommand,
    },
    // ... 迁移逻辑
  };
});

// 统一的配置 Schema（支持所有版本）
export const ConfigSchema = z.union([
  V0ToV3Schema,   // V0 → V3
  V1ToV2Schema,   // V1 → V2
  V2ToV3Schema,   // V2 → V3
  V3ToV4Schema,   // V3 → V4（plugins/pluginSettings → toolchain/projects）
  SettingsSchema, // 当前版本（V4）
]);
```

**优势**：
- **类型安全**：Zod 自动推断类型，编译时检查
- **声明式**：迁移逻辑即 Schema 定义
- **自动执行**：调用 `ConfigSchema.parse()` 时自动选择匹配的 Schema 并执行迁移
- **易于测试**：每个迁移 Schema 可以独立测试

### 2.4 迁移链

```
Version 0 → V0ToV3Schema → Version 3
         ↓
Version 1 → V1ToV2Schema → Version 2 → V2ToV3Schema → Version 3
         ↓
Version 2 → V2ToV3Schema → Version 3
         ↓
Version 3 → SettingsSchema (无需迁移)
```

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
 * 内置命令常量
 */
export const BUILTIN_COMMANDS = {
  /** 启动 dev server */
  AUTO_DEV_SERVER: 'start dev server',
  /** 继续 Claude 会话 */
  AUTO_CLAUDE: 'continue claude session',
} as const;

/**
 * 当前配置文件版本号
 */
export const CURRENT_CONFIG_VERSION = 3;

/**
 * Settings Schema 基础部分（不包含递归的 branchOverrides）
 */
const SettingsSchemaBase = z.object({
  /** 配置文件版本号 */
  version: z.number(),
  /** 界面语言 */
  lang: z.enum(['en', 'zh-CN']).optional(),
  /** 系统命令配置 */
  systemCommands: z
    .object({
      npm: z.string().optional(),
      claude: z.string().optional(),
    })
    .optional(),
  /** tmux 相关配置 */
  tmux: TmuxConfigSchema.optional(),
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

#### V0 → V1 → V2 → V3 迁移链

```typescript
/**
 * V0 Settings Schema（无版本号）
 */
const V0SettingsSchema = z.object({
  version: z.undefined(),
  lang: z.enum(['en', 'zh-CN']).optional(),
  npm: z.string().optional(),
  claudeCommand: z.string().optional(),
  tmux: TmuxConfigSchema.optional(),
  branchOverrides: z.record(z.string(), z.lazy(() => V0SettingsSchema)).optional(),
});

/**
 * V0 → V3 Migration Schema
 * 通过 V1 → V2 → V3 的迁移链实现
 */
const V0ToV3Schema = V0SettingsSchema.transform((v0): Settings => {
  // V0 → V1: 添加版本号
  const v1: V1Settings = { ...v0, version: 1 };

  // V1 → V2: 迁移配置结构
  const v2 = migrateV1ToV2Recursive(v1);

  // V2 → V3: 重命名内置命令
  return migrateV2ToV3Recursive(v2);
});
```

#### V1 → V2 迁移：配置结构重构

```typescript
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
 * V1 → V2 Migration Schema
 */
const V1ToV2Schema = V1SettingsSchema.transform(
  (v1): V2Settings => migrateV1ToV2Recursive(v1)
);
```

#### V2 → V3 迁移：重命名内置命令

```typescript
/**
 * V2 Settings 类型（已有 systemCommands，但内置命令还有 "auto" 前缀）
 */
type V2Settings = Omit<Settings, 'version'> & {
  version: 2;
};

/**
 * 迁移单个 Pane 配置中的命令名称（V2→V3: 去掉 "auto" 前缀）
 */
function migratePaneCommandV2ToV3(
  paneConfig: PaneConfig | undefined
): PaneConfig | undefined {
  if (!paneConfig || !paneConfig.command) {
    return paneConfig;
  }

  if (paneConfig.command === 'auto continues claude session') {
    return {
      ...paneConfig,
      command: 'continue claude session',
    };
  }

  if (paneConfig.command === 'auto start dev server') {
    return {
      ...paneConfig,
      command: 'start dev server',
    };
  }

  return paneConfig;
}

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
 * V2 → V3 Migration Schema
 */
const V2ToV3Schema = V2SettingsSchema.transform(
  (v2): Settings => migrateV2ToV3Recursive(v2)
);
```

#### 统一配置 Schema

```typescript
/**
 * 统一的配置 Schema（支持所有版本）
 * Zod 会自动选择匹配的 Schema 并执行 transform
 */
export const ConfigSchema = z.union([
  V0ToV3Schema,  // V0 → V3
  V1ToV2Schema,  // V1 → V2（然后再用 V2ToV3Schema）
  V2ToV3Schema,  // V2 → V3
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
  "tmux": {
    "layout": "three-pane",
    "autoRun": true
  }
}
```

**迁移后**（版本 1）：
```json
{
  "version": 1,
  "lang": "zh-CN",
  "tmux": {
    "layout": "three-pane",
    "autoRun": true
  }
}
```

### 4.2 V1 → V2：配置结构迁移和废弃命令处理

**实施日期**：2026-02-20

**旧配置**（版本 1）：
```json
{
  "version": 1,
  "npm": "yarn",
  "claudeCommand": "claude --env prod",
  "tmux": {
    "leftPane": {
      "command": "auto continues claude session with dangerously skip permissions"
    }
  },
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
    "npm": "yarn",
    "claude": "claude --env prod --dangerously-skip-permissions"
  },
  "tmux": {
    "leftPane": {
      "command": "auto continues claude session"
    }
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
2. `claudeCommand` → `systemCommands.claude`
3. 废弃的内置命令 `auto continues claude session with dangerously skip permissions` → `auto continues claude session`
4. 自动添加 `--dangerously-skip-permissions` 到 `systemCommands.claude`
5. 递归处理 `branchOverrides`

### 4.3 V2 → V3：重命名内置命令（去掉 "auto" 前缀）

**实施日期**：2026-02-20

**旧配置**（版本 2）：
```json
{
  "version": 2,
  "systemCommands": {
    "npm": "yarn",
    "claude": "claude"
  },
  "tmux": {
    "leftPane": {
      "command": "auto continues claude session"
    },
    "topRightPane": {
      "command": "auto start dev server"
    }
  }
}
```

**迁移后**（版本 3）：
```json
{
  "version": 3,
  "systemCommands": {
    "npm": "yarn",
    "claude": "claude"
  },
  "tmux": {
    "leftPane": {
      "command": "continue claude session"
    },
    "topRightPane": {
      "command": "start dev server"
    }
  }
}
```

**迁移内容**：
1. `"auto continues claude session"` → `"continue claude session"`
2. `"auto start dev server"` → `"start dev server"`
3. 递归处理所有窗格和 `branchOverrides`

**迁移原因**：
- 简化命令名称，去掉冗余的 "auto" 前缀
- 提高可读性和一致性
- 与实际功能描述更贴切（命令本身就是自动检测的）

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
  "version": 3,

  // 界面语言
  "lang": "zh-CN",

  // 系统命令
  "systemCommands": {
    "npm": "yarn",
    "claude": "claude", // Claude CLI 命令
  },

  // Tmux 配置
  "tmux": {
    "layout": "three-pane",
    "autoRun": true,
    "leftPane": {
      "command": "continue claude session", // 继续 Claude 会话
    }
  }
}
```

**YAML 格式**：
```yaml
# 配置文件版本
version: 3

# 界面语言
lang: zh-CN

# 系统命令
systemCommands:
  npm: yarn
  claude: claude  # Claude CLI 命令

# Tmux 配置
tmux:
  layout: three-pane
  autoRun: true
  leftPane:
    command: continue claude session  # 继续 Claude 会话
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
  return { version: 2, tmux: { layout: 'three-pane' } };
});

// ✅ 正确：保留所有用户配置
const GoodMigrationSchema = V1SettingsSchema.transform((v1) => {
  return {
    ...v1,
    version: 2,
    tmux: {
      ...v1.tmux,
      layout: v1.tmux?.layout ?? 'three-pane',
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
   export const CURRENT_CONFIG_VERSION = 4;  // 从 3 改为 4
   ```

2. **定义旧版本 Schema**
   ```typescript
   // src/core/config-migration.ts
   const V3SettingsSchema = z.object({
     version: z.literal(3),
     // V3 的字段定义...
   });
   ```

3. **创建迁移 Schema**
   ```typescript
   const V3ToV4Schema = V3SettingsSchema.transform((v3): Settings => {
     // 迁移逻辑
     return {
       ...v3,
       version: 4,
       // 字段转换...
     };
   });
   ```

4. **添加到 ConfigSchema union**
   ```typescript
   export const ConfigSchema = z.union([
     V0ToV3Schema,
     V1ToV2Schema,
     V2ToV3Schema,
     V3ToV4Schema,  // 新增
     SettingsSchema,
   ]);
   ```

5. **处理所有配置层级**
   - [ ] 用户级全局配置 (`settings.tmux`)
   - [ ] 项目级全局配置 (`settings.tmux`)
   - [ ] 用户级分支覆盖 (`settings.branchOverrides[*].tmux`)
   - [ ] 项目级分支覆盖 (`settings.branchOverrides[*].tmux`)

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
- [Tmux 集成设计](design-tmux-integration.md)
- [配置用户手册](../manual/10-configuration.md)
- [CLAUDE.md 配置修改规范](../CLAUDE.md#配置文件修改规范)
- [实施日志](.claude/logs/config-refactor-implementation-20260220.md)
