# 子命令参数项目级默认值配置

**状态**：已实施（v3.3）

---

## 1. 背景与目标

colyn 的子命令提供了大量开关型参数（如 `merge --no-build`、`update --no-rebase`），用于控制工作流细节。这些开关之前只能在命令行上即时指定，无法持久化。对于团队固定的工作流偏好（如"本项目总是跳过构建"、"离线场景下不 fetch"），用户不得不每次重复输入。

**目标**：

1. 允许在 `settings.json` 中为各子命令的开关型参数设置项目级或用户级默认值
2. 命令行上显式指定的 `--xxx` / `--no-xxx` 仍优先生效（临时覆盖）
3. 复用现有 `branchOverrides` 机制，免费支持"按分支覆盖默认值"
4. 所有命令的命名与行为保持一致

**非目标**：安全确认类（`--yes`、`--force`）、输出格式类（`--json`、`--format`）、一次性参数（`--port`、`--install`）不纳入配置。

---

## 2. 设计概览

### 2.1 三级优先级

```
命令行显式指定 > settings.json 节点 > 命令内置默认值
```

- **命令行显式**：用户在终端输入 `--xxx` 或 `--no-xxx`，commander 报告 `getOptionValueSource(key) === 'cli'`
- **配置文件**：`settings.json` 的 `commands.<cmd>.<key>` 节点，经用户级 + 项目级 + branchOverrides 三层合并后的值
- **内置默认**：命令调用 `applyCommandDefaults()` 时传入的 fallback 值

### 2.2 顶层 verbose 共享

顶层 `verbose: boolean` 字段作用于所有支持 `-v/--verbose` 的命令（merge、release 等）。无需在每个命令节点重复配置。

### 2.3 按命令名嵌套

各命令的默认值放在 `commands.<commandName>` 节点，目前支持：`merge`、`update`、`release`、`checkout`。

### 2.4 branchOverrides 递归生效

`branchOverrides` 中的 `commands.*` 与顶层 `commands.*` 深度合并，分支匹配时递归覆盖。

---

## 3. 配置项清单

### 顶层字段

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `verbose` | `boolean` | `false` | 为所有命令开启详细输出，等价于每次加 `-v` |

### commands.merge

| 字段 | 默认 | CLI 开启 | CLI 关闭 | 说明 |
|------|------|----------|----------|------|
| `build` | `true` | `--build` | `--no-build` | 合并前执行构建 |
| `rebase` | `true` | `--rebase` | `--no-rebase` | 使用 rebase 更新主分支 |
| `update` | `true` | `--update` | `--no-update` | 合并前更新所有 worktree |
| `fetch` | `true` | `--fetch` | `--no-fetch` | 执行 git fetch |
| `all` | `true` | `--all` | `--no-all` / `--current-only` | 更新所有 worktree（仅在 update=true 时生效） |

### commands.update

| 字段 | 默认 | CLI 开启 | CLI 关闭 | 说明 |
|------|------|----------|----------|------|
| `rebase` | `true` | `--rebase` | `--no-rebase` | 使用 rebase 更新 |
| `fetch` | `true` | `--fetch` | `--no-fetch` | 执行 git fetch |
| `all` | `true` | `--all` | `--no-all` / `--current-only` | 更新所有 worktree |

### commands.release

| 字段 | 默认 | CLI 开启 | CLI 关闭 | 说明 |
|------|------|----------|----------|------|
| `update` | `true` | `--update` | `--no-update` | 发布前更新依赖 |
| `build` | `true` | `--build` | `--no-build` | 发布前执行构建 |
| `tag` | `true` | `--tag` | `--no-tag` | 创建 git tag |
| `versionUpdate` | `true` | `--version-update` | `--no-version-update` | 更新版本号 |

### commands.checkout

| 字段 | 默认 | CLI 开启 | CLI 关闭 | 说明 |
|------|------|----------|----------|------|
| `fetch` | `true` | `--fetch` | `--no-fetch` | checkout 前执行 git fetch |

---

## 4. 业务规则

- **`merge.all` 仅在 `merge.update === true` 时生效**。当 `--no-update` 时，即使 `--all` 也不会更新任何 worktree。该规则在 merge 命令业务逻辑中显式短路，不在 schema 层表达。

---

## 5. 三态解析机制

### 5.1 核心工具函数

```typescript
// src/core/command-defaults.ts

/**
 * 将 settings 中的命令默认值应用到 commander 解析结果
 * 只在用户未显式指定（source !== 'cli'）时才替换
 */
function applyCommandDefaults<T extends Record<string, boolean>>(
  cmd: Command,
  opts: T,
  configDefaults: Partial<T>,
  builtinDefaults: T,
): T;

/**
 * 解析 verbose：命令行 > 顶层 verbose 配置 > false
 */
function resolveVerbose(
  cmd: Command,
  settings: MergedSettings,
): boolean;
```

### 5.2 解析流程

```
1. commander 解析 CLI 参数，记录每个 key 的来源（'cli' | 'default'）
2. applyCommandDefaults() 遍历每个 key：
   - 若 source === 'cli'：保留 CLI 值，跳过
   - 若 configDefaults[key] 有值：使用配置文件值
   - 否则：使用 builtinDefaults[key]
3. 返回最终合并结果
```

### 5.3 扩展方法

新增命令时，只需：
1. 在 `config-schema.ts` 中添加对应 Schema（`XxxCommandConfigSchema`）
2. 在命令实现中调用 `applyCommandDefaults(cmd, opts, settings.commands.xxx, builtins)`

---

## 6. 配置示例

```jsonc
{
  "version": 4,

  // 顶层 verbose：所有命令共享
  "verbose": true,

  "commands": {
    "merge": {
      "build": false,    // 合并时跳过构建（加快速度）
      "rebase": false    // 不做 rebase
    },
    "update": {
      "all": false       // 只更新当前 worktree（覆盖新默认 all=true）
    },
    "release": {
      "tag": false       // 发布时不自动打 tag（由 CI 处理）
    }
  },

  // 在 release/* 分支上，强制执行构建
  "branchOverrides": {
    "release/*": {
      "commands": {
        "merge": { "build": true }
      }
    }
  }
}
```

**含义说明**：
- 全局开启详细输出
- merge 默认跳过 build、不 rebase（平时快速迭代）
- update 默认只更新当前 worktree
- release 分支上合并时，强制执行 build（确保发布质量）

---

## 7. 破坏性变更

| 变更 | 旧用法 | 新用法 |
|------|--------|--------|
| merge --skip-build 移除 | `merge --skip-build` | `merge --no-build` |
| merge --update-all 移除 | `merge --update-all` | `merge --all` |
| update --all 默认反转 | 需显式加 `--all` | 默认即更新所有 worktree |
| update 回到旧行为 | 不需要额外参数 | `update --current-only` 或 `update --no-all` |
| verbose 配置来源变更 | 各命令独立 i18n key | 统一读取顶层 `verbose` |

---

## 8. 实现参考

| 文件 | 说明 |
|------|------|
| `src/core/config-schema.ts` | Schema 定义：`MergeCommandConfigSchema` 等 |
| `src/core/command-defaults.ts` | 三态解析工具函数：`applyCommandDefaults`、`resolveVerbose` |
| `src/core/command-defaults.test.ts` | 单元测试 |
| `src/commands/merge.ts` | merge 命令应用示例 |
| `src/commands/update.ts` | update 命令应用示例 |
| `src/commands/release.ts` | release 命令应用示例 |
| `src/commands/checkout.ts` | checkout 命令应用示例 |
