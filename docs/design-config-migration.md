# 配置文件版本管理和 Migration 设计文档

## 版本信息
- 文档版本：1.0
- 创建日期：2026-02-14

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

---

## 2. 核心设计

### 2.1 版本号机制

**版本号定义**：
- 在 `Settings` 接口中添加 `version?: number` 字段
- 定义 `CURRENT_CONFIG_VERSION` 常量表示当前最新版本
- 初始版本号从 1 开始

**版本检测**：
- 配置文件中没有 `version` 字段 → 视为版本 0（旧版本）
- 配置文件中的 `version` 小于 `CURRENT_CONFIG_VERSION` → 需要迁移

### 2.2 迁移链模式

```
Version 0 → Migration[0] → Version 1
         → Migration[1] → Version 2
         → Migration[2] → Version 3
         ...
```

**迁移函数**：
```typescript
type MigrationFunction = (settings: Settings) => Settings;
```

**迁移数组**：
```typescript
const MIGRATIONS: MigrationFunction[] = [
  // 索引 0: 0 → 1
  (settings: Settings): Settings => { ... },
  // 索引 1: 1 → 2
  (settings: Settings): Settings => { ... },
  // ...未来的迁移
];
```

### 2.3 自动迁移流程

```
加载配置文件
    ↓
检测版本号 (version ?? 0)
    ↓
version < CURRENT_CONFIG_VERSION?
    ↓ 是
执行迁移链 (MIGRATIONS[version] ... MIGRATIONS[CURRENT_CONFIG_VERSION - 1])
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

```typescript
/**
 * 配置文件版本号
 * 每次配置结构变更时递增
 */
export const CURRENT_CONFIG_VERSION = 1;

/**
 * 配置迁移函数
 * 接收旧版本配置，返回新版本配置
 */
type MigrationFunction = (settings: Settings) => Settings;

/**
 * Settings 接口（包含版本号）
 */
export interface Settings {
  /** 配置文件版本号，用于版本管理和迁移 */
  version?: number;

  lang?: string;
  npm?: string;
  tmux?: TmuxConfig;
  branchOverrides?: Record<string, Settings>;
}
```

### 3.2 迁移数组

```typescript
/**
 * 配置迁移函数数组
 * 索引 i 的函数负责从版本 i 迁移到版本 i+1
 */
const MIGRATIONS: MigrationFunction[] = [
  // 迁移 0 → 1: 添加版本号
  (settings: Settings): Settings => {
    return {
      ...settings,
      version: 1,
    };
  },

  // 未来的迁移在这里添加
  // 例如：迁移 1 → 2
  // (settings: Settings): Settings => {
  //   // 执行迁移逻辑
  //   return { ...settings, version: 2 };
  // },
];
```

### 3.3 核心函数

```typescript
/**
 * 执行配置迁移
 * @param settings 原始配置
 * @returns 迁移后的配置
 */
function migrateSettings(settings: Settings): Settings {
  const currentVersion = settings.version ?? 0;

  // 已是最新版本，无需迁移
  if (currentVersion >= CURRENT_CONFIG_VERSION) {
    return settings;
  }

  // 执行迁移链
  let migratedSettings = settings;
  for (let i = currentVersion; i < CURRENT_CONFIG_VERSION; i++) {
    const migration = MIGRATIONS[i];
    if (migration) {
      migratedSettings = migration(migratedSettings);
    }
  }

  return migratedSettings;
}

/**
 * 保存配置到文件
 */
async function saveSettingsToFile(
  configPath: string,
  settings: Settings
): Promise<void> {
  const content = JSON.stringify(settings, null, 2);
  await fs.writeFile(configPath, content, 'utf-8');
}

/**
 * 从文件加载配置（自动迁移）
 */
async function loadSettingsFromFile(
  configPath: string
): Promise<Settings | null> {
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const rawSettings = JSON.parse(content) as Settings;

    // 自动迁移
    const oldVersion = rawSettings.version ?? 0;
    const migratedSettings = migrateSettings(rawSettings);
    const newVersion = migratedSettings.version ?? 0;

    // 如果版本号有变化，保存迁移后的配置
    if (oldVersion !== newVersion) {
      await saveSettingsToFile(configPath, migratedSettings);
    }

    return migratedSettings;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
```

---

## 4. 迁移示例

### 4.1 示例 1：添加版本号（0 → 1）

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

### 4.2 示例 2：配置结构迁移和废弃命令处理（1 → 2）✅ 已实施

**实施日期**：2026-02-20

这是实际实施的 migration，处理配置结构重构和废弃的内置命令。

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

**参考**：完整实施日志见 `.claude/logs/create-migration-v1-to-v2-20260220.md`

### 4.3 示例 3：字段类型变更（未来扩展）

假设未来需要将 `leftPane.size` 从字符串改为数字：

```typescript
// 添加到 MIGRATIONS 数组
const MIGRATIONS: MigrationFunction[] = [
  // 迁移 0 → 1: 添加版本号
  (settings: Settings): Settings => {
    return { ...settings, version: 1 };
  },

  // 迁移 1 → 2: leftPane.size 字符串 → 数字
  (settings: Settings): Settings => {
    const newSettings = { ...settings };

    // 转换用户级配置
    if (newSettings.tmux?.leftPane?.size) {
      const sizeStr = newSettings.tmux.leftPane.size;
      if (typeof sizeStr === 'string' && sizeStr.endsWith('%')) {
        newSettings.tmux.leftPane.size =
          parseInt(sizeStr.replace('%', ''), 10);
      }
    }

    // 转换分支覆盖配置
    if (newSettings.branchOverrides) {
      Object.keys(newSettings.branchOverrides).forEach(branch => {
        const override = newSettings.branchOverrides![branch];
        if (override.tmux?.leftPane?.size) {
          const sizeStr = override.tmux.leftPane.size;
          if (typeof sizeStr === 'string' && sizeStr.endsWith('%')) {
            override.tmux.leftPane.size =
              parseInt(sizeStr.replace('%', ''), 10);
          }
        }
      });
    }

    return { ...newSettings, version: 2 };
  },
];

// 更新版本常量
export const CURRENT_CONFIG_VERSION = 2;
```

### 4.4 示例 4：字段重命名（未来扩展）

假设未来需要将某个字段重命名：

```typescript
// 迁移 2 → 3: 重命名字段示例
(settings: Settings): Settings => {
  // 迁移逻辑
  return {
    ...settings,
    version: 3,
  };
}
```

---

## 5. 设计决策

### 5.1 为什么使用迁移链？

**决策**：使用迁移函数数组，而非单一的迁移函数

**理由**：
- **可扩展**：添加新迁移只需追加到数组
- **清晰**：每个迁移函数职责明确
- **灵活**：支持多版本跨越（例如从版本 0 直接到版本 3）

### 5.2 为什么自动保存？

**决策**：迁移后自动保存配置文件

**理由**：
- **用户友好**：用户无需手动更新配置
- **一致性**：确保磁盘上的配置与内存中的一致
- **避免重复迁移**：下次加载时无需再次迁移

### 5.3 为什么在加载时迁移？

**决策**：在 `loadSettingsFromFile` 中执行迁移，而非单独的命令

**理由**：
- **透明**：对用户完全透明
- **自动化**：无需用户介入
- **及时**：首次使用新版本时立即迁移

### 5.4 为什么从版本 1 开始？

**决策**：版本号从 1 开始，旧配置视为版本 0

**理由**：
- **区分旧配置**：没有 `version` 字段的配置视为版本 0
- **符合直觉**：版本 1 是第一个正式版本
- **便于迁移**：`MIGRATIONS[0]` 处理 0 → 1 的迁移

---

## 6. 最佳实践

### 6.1 编写迁移函数

**原则**：
1. ✅ **保持幂等性**：多次执行结果相同
2. ✅ **保留用户数据**：不删除用户自定义配置
3. ✅ **提供默认值**：为新字段提供合理默认值
4. ✅ **处理边缘情况**：考虑字段不存在、类型错误等情况
5. ✅ **递归处理**：不要忘记 `branchOverrides` 中的嵌套配置

**示例**：
```typescript
// ❌ 错误：可能删除用户配置
(settings: Settings): Settings => {
  return { version: 2, tmux: { layout: 'three-pane' } };
}

// ✅ 正确：保留所有用户配置
(settings: Settings): Settings => {
  return {
    ...settings,
    tmux: {
      ...settings.tmux,
      layout: settings.tmux?.layout ?? 'three-pane',
    },
    version: 2,
  };
}
```

### 6.2 测试迁移

**测试用例**：
1. ✅ 版本 0 → 最新版本
2. ✅ 中间版本 → 最新版本（跨版本迁移）
3. ✅ 已是最新版本（无需迁移）
4. ✅ 配置文件不存在
5. ✅ 配置文件损坏
6. ✅ 迁移后配置可正常使用

### 6.3 版本号管理

**规则**：
1. ✅ 每次修改配置结构时递增 `CURRENT_CONFIG_VERSION`
2. ✅ 在 `MIGRATIONS` 数组中添加对应的迁移函数
3. ✅ 迁移函数的索引必须与版本号对应（`MIGRATIONS[i]` 处理 i → i+1）
4. ✅ 不要删除旧的迁移函数（保持向后兼容）

---

## 7. 配置修改检查清单

**每次修改配置文件结构时，必须检查**：

### 7.1 是否需要迁移？

检查以下情况：
- [ ] 添加了新的必填字段
- [ ] 删除了字段
- [ ] 重命名了字段
- [ ] 改变了字段类型
- [ ] 改变了字段的语义
- [ ] 改变了嵌套结构

**如果是以下情况，不需要迁移**：
- ✅ 添加新的可选字段（有默认值）
- ✅ 修改字段的默认值
- ✅ 添加新的配置选项

### 7.2 创建迁移的步骤

如果需要迁移：

1. **递增版本号**
   ```typescript
   export const CURRENT_CONFIG_VERSION = 2;  // 从 1 改为 2
   ```

2. **添加迁移函数**
   ```typescript
   const MIGRATIONS: MigrationFunction[] = [
     // 现有的迁移
     (settings: Settings): Settings => { ... },

     // 新增的迁移 (1 → 2)
     (settings: Settings): Settings => {
       // 迁移逻辑
       return { ...settings, version: 2 };
     },
   ];
   ```

3. **处理所有配置层级**
   - [ ] 用户级全局配置 (`settings.tmux`)
   - [ ] 项目级全局配置 (`settings.tmux`)
   - [ ] 用户级分支覆盖 (`settings.branchOverrides[*].tmux`)
   - [ ] 项目级分支覆盖 (`settings.branchOverrides[*].tmux`)

4. **测试迁移**
   - [ ] 准备版本 N-1 的配置文件
   - [ ] 加载配置，验证迁移成功
   - [ ] 检查迁移后的配置文件
   - [ ] 验证配置可正常使用

5. **更新文档**
   - [ ] 在本文档中添加迁移示例
   - [ ] 更新 CHANGELOG
   - [ ] 如有必要，更新用户手册

---

## 8. 与其他系统的集成

### 8.1 与配置优先级系统的集成

**迁移时机**：在配置加载时自动迁移

```typescript
export async function loadTmuxConfigForBranch(
  projectRoot: string,
  branchName: string
): Promise<TmuxConfig> {
  // 加载时自动迁移
  const [userSettings, projectSettings] = await Promise.all([
    loadSettingsFromFile(getUserConfigPath()),     // 自动迁移用户配置
    loadSettingsFromFile(getProjectConfigPath(projectRoot)), // 自动迁移项目配置
  ]);

  // 后续的优先级合并逻辑...
}
```

**优点**：
- 用户级和项目级配置都会自动迁移
- 迁移后的配置立即生效
- 不影响优先级合并逻辑

### 8.2 与 TypeScript 类型系统的集成

**类型安全**：
```typescript
// Settings 接口包含版本号
export interface Settings {
  version?: number;
  // ...其他字段
}

// 迁移函数的类型签名确保类型安全
type MigrationFunction = (settings: Settings) => Settings;
```

---

## 9. 相关文档

- [Tmux 集成设计](design-tmux-integration.md)
- [配置优先级实施日志](.claude/logs/config-priority-refactor-20260214.md)
- [版本迁移实施日志](.claude/logs/config-version-migration-20260214.md)
- [CLAUDE.md](../CLAUDE.md) - 配置修改规范
