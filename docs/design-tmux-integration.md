# Colyn Tmux 集成设计文档

## 版本信息
- 文档版本：2.0
- 更新日期：2026-02-14
- 合并自：requirement-tmux-integration.md + design-tmux-enhanced-layout.md

---

## 1. 背景与目标

### 1.1 需求背景

Colyn 使用 Git worktree 实现并行 Vibe Coding，但需要管理多个终端窗口。通过 tmux 集成可以：
- 一个 tmux session 统一管理整个项目
- 一个 worktree 对应一个 tmux window
- Ctrl-b 0-4 秒切 worktree
- Dev server 自动启动

### 1.2 设计目标

1. **零配置**：无需用户配置即可使用
2. **自动检测**：智能适配 tmux 环境
3. **非侵入**：不在 tmux 中也完全可用
4. **灵活布局**：支持按分支自定义布局和命令

---

## 2. 核心设计

### 2.1 映射关系

```
项目           → tmux session (session name = 项目名)
Worktree      → tmux window (window index = worktree ID)
分支           → window name (分支名最后一段)
```

**示例**：
```
项目: my-task-app
  ├─ main (worktree 0)      → Window 0: "main"
  ├─ task-1 (feature/auth)  → Window 1: "auth"
  └─ task-2 (feature/tasks) → Window 2: "tasks"
```

### 2.2 最小配置原则

**所有信息从环境自动推断**，无需配置文件：

| 信息 | 推断来源 |
|------|---------|
| Session name | 项目目录名 |
| Window index | Worktree ID |
| Window name | 分支名最后一段 (`feature/auth` → `auth`) |
| Main branch | `git branch --show-current` |
| Base port | 主分支 `.env.local` 的 PORT |

### 2.3 命令集成

| 命令 | tmux 中 | 非 tmux 中 |
|------|---------|-----------|
| `colyn init` | 设置 Window 0 | 创建 session (detached) |
| `colyn add` | 创建 window + 切换 | 正常创建 worktree |
| `colyn checkout` | 更新 window 名称 | 切换目录 |
| `colyn list` | 显示 window 编号 | 显示 ID 列 |
| `colyn repair` | 修复缺失的 window | 创建 session + 修复 |
| `colyn tmux` | tmux 修复/管理 | tmux 修复/管理 |

---

## 3. 布局系统设计

### 3.1 支持的布局类型

#### 3.1.1 `single-pane`（单窗格）
```
┌─────────────────────┐
│                     │
│    Single Pane      │
│                     │
└─────────────────────┘
```

#### 3.1.2 `two-pane-horizontal`（左右分割）
```
┌──────────┬──────────┐
│          │          │
│   Left   │  Right   │
│          │          │
└──────────┴──────────┘
```

#### 3.1.3 `two-pane-vertical`（上下分割）
```
┌─────────────────────┐
│      Top Pane       │
├─────────────────────┤
│     Bottom Pane     │
└─────────────────────┘
```

#### 3.1.4 `three-pane`（三窗格，默认）
```
┌──────────┬──────────┐
│          │  Right   │
│          │   Top    │
│          ├──────────┤
│   Left   │  Right   │
│          │  Bottom  │
└──────────┴──────────┘
```

#### 3.1.5 `four-pane`（四窗格）
```
┌──────────┬──────────┐
│ Top Left │Top Right │
├──────────┼──────────┤
│Bottom    │Bottom    │
│Left      │Right     │
└──────────┴──────────┘
```

**四窗格分割配置**：
- `horizontalSplit`：上下分割线位置（上方占总高度百分比）
- `verticalSplit`：左右分割线位置（左侧占总宽度百分比）
- 可以单独或同时配置两个 split

### 3.2 布局与窗格映射

| 布局类型 | 支持的窗格 |
|---------|-----------|
| `single-pane` | 无 |
| `two-pane-horizontal` | `leftPane`, `rightPane` |
| `two-pane-vertical` | `topPane`, `bottomPane` |
| `three-pane` | `leftPane`, `topRightPane`, `bottomRightPane` |
| `four-pane` | `topLeftPane`, `topRightPane`, `bottomLeftPane`, `bottomRightPane` |

---

## 4. 配置系统设计

### 4.1 配置优先级（5 层）

从低到高：

```
1. System builtin（系统内置默认）
   例如：main 分支默认单窗格
   ↓
2. User default（用户级全局配置）
   ~/.config/colyn/settings.json 的 tmux
   ↓
3. Project default（项目级全局配置）
   .colyn/settings.json 的 tmux
   ↓
4. User override（用户级分支覆盖）
   ~/.config/colyn/settings.json 的 branchOverrides[branch].tmux
   ↓
5. Project override（项目级分支覆盖）
   .colyn/settings.json 的 branchOverrides[branch].tmux
```

**关键特性**：
- **字段级覆盖**：只覆盖明确设置的字段
- **User override > Project default**：用户可通过分支覆盖来覆盖项目全局配置
- **System builtin**：为特殊分支（如 main）提供合理默认值

### 4.2 System Builtin 默认配置

```typescript
const BUILTIN_BRANCH_DEFAULTS: Record<string, TmuxConfig> = {
  main: {
    layout: 'single-pane',
    autoRun: false,
  },
};
```

**设计理由**：
- Main 分支通常用于代码审查和合并，不需要复杂布局
- 可被任何用户或项目配置覆盖

### 4.3 配置结构

```json
{
  "version": 1,
  "lang": "zh-CN",
  "systemCommands": {
    "npm": "yarn",
    "claude": "claude --env your-env"
  },

  "tmux": {
    "layout": "three-pane",
    "autoRun": true,
    "leftPane": {
      "command": "auto continues claude session",
      "size": "60%"
    },
    "topRightPane": {
      "command": "auto start dev server",
      "size": "30%"
    },
    "bottomRightPane": {
      "command": null,
      "size": "70%"
    }
  },

  "branchOverrides": {
    "main": {
      "tmux": {
        "layout": "two-pane-horizontal",
        "leftPane": { "size": "50%" },
        "rightPane": { "command": "colyn list -r" }
      }
    },

    "feature/*": {
      "tmux": {
        "leftPane": { "size": "70%" }
      }
    },

    "hotfix/*": {
      "tmux": {
        "autoRun": false,
        "layout": "single-pane"
      }
    }
  }
}
```

### 4.4 分支匹配规则

**优先级（从高到低）**：
1. **精确匹配**：`main`、`develop`、`feature/auth`
2. **通配符匹配**：`feature/*`、`hotfix/*`（使用第一个匹配的）
3. **默认配置**：顶层 tmux 配置

**通配符规则**：
- `feature/*`：匹配 `feature/` 开头的所有分支
- `hotfix/*`：匹配 `hotfix/` 开头的所有分支
- `*`：匹配所有分支（最低优先级）

### 4.5 配置合并示例

```typescript
// User default
{ "layout": "three-pane", "leftPane": { "size": "60%" } }

// User override (feature/*)
{ "leftPane": { "size": "70%" } }

// Project default
{ "leftPane": { "command": "claude -c" } }

// 最终结果（在 feature/auth 分支）
{
  "layout": "three-pane",            // User default
  "leftPane": {
    "command": "claude -c",          // Project default
    "size": "70%"                    // User override
  }
}
```

### 4.6 版本管理与迁移

**版本号机制**：
- 配置文件包含 `version` 字段
- 当前版本：`CURRENT_CONFIG_VERSION = 1`
- 加载时自动检测并迁移旧版本

**迁移链**：
```typescript
const MIGRATIONS: MigrationFunction[] = [
  // 0 → 1: 添加版本号
  (settings: Settings): Settings => {
    return { ...settings, version: 1 };
  },
  // 未来的迁移在这里添加
];
```

**自动迁移流程**：
1. 读取配置文件，检测版本号
2. 执行迁移链（从当前版本到最新版本）
3. 自动保存迁移后的配置

---

## 5. 内置命令

### 5.1 "auto" 命令

| 命令 | 检测逻辑 |
|------|---------|
| `auto continues claude session` | 检查 `~/.claude/projects/{encodedPath}` 是否存在会话文件 |
| `auto start dev server` | 检测 `package.json` 的 `dev` 脚本 |

**注意**：如需添加 Claude 命令参数（如 `--dangerously-skip-permissions`），可通过配置 `systemCommands.claude` 字段实现：
```json
{
  "systemCommands": {
    "claude": "claude --dangerously-skip-permissions"
  }
}
```

### 5.2 默认 Pane 命令

- **左侧窗格**：`auto continues claude session`
- **右上窗格**：`auto start dev server`
- **右下窗格**：`null`（不执行命令）

---

## 6. 技术实现要点

### 6.1 TypeScript 类型定义

```typescript
export type LayoutType =
  | 'single-pane'
  | 'two-pane-horizontal'
  | 'two-pane-vertical'
  | 'three-pane'
  | 'four-pane';

export interface TmuxConfig {
  autoRun?: boolean;
  layout?: LayoutType;

  // 窗格配置
  leftPane?: PaneConfig;
  rightPane?: PaneConfig;
  topPane?: PaneConfig;
  bottomPane?: PaneConfig;
  topRightPane?: PaneConfig;
  bottomRightPane?: PaneConfig;
  topLeftPane?: PaneConfig;
  bottomLeftPane?: PaneConfig;

  // 四窗格分割配置
  horizontalSplit?: string;
  verticalSplit?: string;
}

export interface SystemCommands {
  npm?: string;
  claude?: string;
}

export interface Settings {
  version?: number;
  lang?: string;
  systemCommands?: SystemCommands;
  tmux?: TmuxConfig;
  branchOverrides?: Record<string, Settings>;
}
```

### 6.2 核心函数

```typescript
// 加载分支特定配置
export async function loadTmuxConfigForBranch(
  projectRoot: string,
  branchName: string
): Promise<TmuxConfig>

// 通配符匹配
function matchWildcard(pattern: string, branchName: string): boolean

// 配置验证
export function validateTmuxConfig(
  config: TmuxConfig,
  branchName?: string
): ValidationResult

// 布局类型检测（向后兼容）
export function detectLayoutType(config: TmuxConfig): LayoutType
```

### 6.3 配置加载逻辑

```typescript
export async function loadTmuxConfigForBranch(
  projectRoot: string,
  branchName: string
): Promise<TmuxConfig> {
  const [userSettings, projectSettings] = await Promise.all([
    loadSettingsFromFile(getUserConfigPath()),
    loadSettingsFromFile(getProjectConfigPath(projectRoot)),
  ]);

  let config: TmuxConfig = {};

  // 1. System builtin
  const builtinBranchDefault = BUILTIN_BRANCH_DEFAULTS[branchName];
  if (builtinBranchDefault) {
    config = mergeConfigs(config, builtinBranchDefault);
  }

  // 2. User default
  if (userSettings?.tmux) {
    config = mergeConfigs(config, userSettings.tmux);
  }

  // 3. Project default
  if (projectSettings?.tmux) {
    config = mergeConfigs(config, projectSettings.tmux);
  }

  // 4. User override
  if (userSettings?.branchOverrides) {
    const userBranchConfig = findBranchOverride(
      userSettings.branchOverrides,
      branchName
    );
    if (userBranchConfig?.tmux) {
      config = mergeConfigs(config, userBranchConfig.tmux);
    }
  }

  // 5. Project override
  if (projectSettings?.branchOverrides) {
    const projectBranchConfig = findBranchOverride(
      projectSettings.branchOverrides,
      branchName
    );
    if (projectBranchConfig?.tmux) {
      config = mergeConfigs(config, projectBranchConfig.tmux);
    }
  }

  return config;
}
```

---

## 7. 向后兼容

### 7.1 布局自动检测

**没有 `layout` 字段时**：
```typescript
export function detectLayoutType(config: TmuxConfig): LayoutType {
  // 检测配置的窗格来推断布局类型
  if (config.leftPane || config.topRightPane || config.bottomRightPane) {
    return 'three-pane';  // 默认
  }
  // ... 其他检测逻辑
}
```

**旧配置自动识别**：
```json
// 旧配置（没有 layout 字段）
{
  "tmux": {
    "leftPane": { "command": "claude -c" },
    "topRightPane": { "command": "npm run dev" }
  }
}

// 自动识别为 three-pane 布局
```

### 7.2 非 tmux 环境兼容

**所有功能在非 tmux 环境下正常工作**：
- `init` → 创建 session (detached)
- `add` → 正常创建 worktree
- `checkout` → 切换目录
- `list` → 正常列表

**tmux 未安装**：
- 完全禁用 tmux 功能
- 不显示任何提示
- 所有命令正常工作

---

## 8. 设计决策记录

### 8.1 Session 命名

**决策**：Session name = 项目名，不存储在配置文件中

**理由**：
- 符合最小配置原则
- 永远可从环境推断
- 避免配置与实际状态不一致

### 8.2 配置优先级顺序

**决策**：Project override > User override > Project default > User default > System builtin

**理由**：
- **Override > Default**：分支特定配置应该覆盖全局配置
- **User override > Project default**：用户应该能够为特定分支设置个人偏好
- **System builtin 最低**：可被任何用户配置覆盖

### 8.3 Main 分支默认单窗格

**决策**：为 main 分支提供 system builtin 默认配置（单窗格，不自动运行）

**理由**：
- Main 分支通常用于代码审查和合并
- 不需要复杂布局和自动启动的命令
- 用户仍可通过任何配置级别覆盖

### 8.4 字段级覆盖而非对象替换

**决策**：所有配置合并使用字段级覆盖

**理由**：
- 更灵活：可以只修改一个字段
- 更直观：符合用户期望
- 更安全：不会意外丢失配置

**示例**：
```typescript
// 基础配置
{ leftPane: { command: "A", size: "60%" } }

// 覆盖配置
{ leftPane: { size: "70%" } }

// 结果（字段级覆盖）
{ leftPane: { command: "A", size: "70%" } }

// 而不是对象替换：
// { leftPane: { size: "70%" } }  // command 丢失 ❌
```

---

## 9. 未来扩展

### 9.1 可能的增强

- **更多布局类型**：`three-pane-vertical`、自定义布局字符串
- **更多项目类型**：Rails、Django、Go 等 dev server 检测
- **布局切换优化**：动态切换布局而不重建 window
- **配置热重载**：监听配置文件变化

### 9.2 不实现的功能（有意为之）

- ❌ 布局持久化（交给 tmux 插件）
- ❌ Pane 内容管理（tmux 原生功能）
- ❌ Session 共享（tmux 原生功能）

---

## 10. 相关文档

- [术语表](glossary.md)
- [用户手册 - Tmux 集成](../manual/06-tmux-integration.md)
- [实施日志](.claude/logs/tmux-enhanced-layout-implementation-phase2-20260214.md)
- [配置优先级实施](.claude/logs/config-priority-refactor-20260214.md)
- [版本迁移实施](.claude/logs/config-version-migration-20260214.md)
