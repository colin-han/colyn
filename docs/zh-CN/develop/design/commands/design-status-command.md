# Status 命令设计文档

**创建时间**：2026-02-22
**最后更新**：2026-02-22
**命令名称**：`colyn status`
**状态**：✅ 已实现

---

## 1. 命令概述

### 1.1 背景

原 `colyn status` 命令显示当前 worktree 的 git 状态（modified、staged、branch diff），无法表达工作流阶段。在并行 Vibe Coding 工作流中，`colyn puppy` 等协作工具需要知道每个 worktree 当前处于哪个工作阶段，以便发现活跃项目、协调任务分配。

### 1.2 目标

引入工作流状态持久化，为协作工具提供稳定的状态来源：

- 支持 `idle / running / waiting-confirm / finish` 四种状态
- 状态持久化到文件，工具重启后仍可读取
- 提供全局索引，方便跨项目发现活跃 worktree
- 支持脚本友好的 JSON 输出

### 1.3 命令语法

```bash
colyn status [get] [--json]
colyn status set <status>
```

- `get` 为可选子命令；`colyn status` 与 `colyn status get` 完全等价
- `st` 为别名

---

## 2. 状态值

```typescript
type WorktreeStatus = 'idle' | 'running' | 'waiting-confirm' | 'finish';
```

| 状态值 | 含义 |
|--------|------|
| `idle` | 空闲，没有正在进行的任务 |
| `running` | 运行中，Claude 正在处理任务 |
| `waiting-confirm` | 等待用户确认（等待人工介入） |
| `finish` | 已完成，等待合并 |

未设置过的 worktree 默认视为 `idle`，不报错。

---

## 3. 数据结构

### 3.1 项目级状态文件：`.colyn/status.json`

```json
{
  "updatedAt": "2026-02-22T10:00:00.000Z",
  "worktrees": {
    "task-1": { "status": "running", "updatedAt": "2026-02-22T10:00:00.000Z" },
    "task-2": { "status": "idle",    "updatedAt": "2026-02-22T09:00:00.000Z" },
    "main":   { "status": "idle",    "updatedAt": "2026-02-22T08:00:00.000Z" }
  }
}
```

- **key 命名规则**：主分支统一使用 `"main"`（不论实际目录名），worktree 使用目录名（如 `task-1`）
- 逻辑：`info.isMainBranch ? 'main' : info.worktreeDir`
- 项目级 `updatedAt` 等于最后一次 `status set` 的时间
- 位置：`{projectRoot}/.colyn/status.json`

### 3.2 全局索引文件：`~/.colyn-status.json`

```json
{
  "/Users/me/projects/myapp": { "updatedAt": "2026-02-22T10:00:00.000Z" },
  "/Users/me/projects/other": { "updatedAt": "2026-02-21T15:00:00.000Z" }
}
```

- key 为项目根目录（`.colyn` 的父目录）的绝对路径
- `updatedAt` 与项目级同步更新
- 供 `colyn puppy` 等工具发现活跃项目
- 位置：`~/.colyn-status.json`

---

## 4. 命令接口

### 4.1 `colyn status get`（默认行为）

获取当前 worktree 的工作流状态。

**人类可读输出（stderr）：**

```
Status:   running
Updated:  2026-02-22 18:00:00
```

未设置过时：

```
Status:   idle
Updated:  （从未设置）
```

**JSON 输出（`--json`，stderr）：**

```json
{"worktreeDir":"task-1","worktreeId":1,"status":"running","updatedAt":"2026-02-22T10:00:00.000Z"}
```

未设置过时 `updatedAt` 为 `null`：

```json
{"worktreeDir":"task-1","worktreeId":1,"status":"idle","updatedAt":null}
```

**JSON 字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `worktreeDir` | `string` | 有效 key（主分支为 `"main"`，其他为目录名） |
| `worktreeId` | `number` | Worktree ID（主分支为 0） |
| `status` | `string` | 当前状态值 |
| `updatedAt` | `string \| null` | 最后更新时间（ISO 8601），从未设置则为 null |

### 4.2 `colyn status set <status>`

设置当前 worktree 的工作流状态。

**成功输出（stderr）：**

```
✓ 状态已更新: running
```

**无效状态报错：**

```
✗ 无效的状态值: invalid
  有效状态: idle, running, waiting-confirm, finish
```

---

## 5. Commander.js 实现说明

### 5.1 选项解析问题

**问题**：`colyn status get --json` 的 `--json` 不生效。

**根因**：Commander.js v12 在路由到子命令之前，会先解析父命令的所有已知选项。当 `status` 和 `get` 都定义了 `--json` 时，`status get --json` 中的 `--json` 被父命令消费，子命令收到空 options。

**解决方案**：

- 只在父命令 `statusCmd` 上定义 `--json`
- `get` 子命令不定义 `--json`
- `get` action 中通过 `command.parent?.opts().json` 读取父命令已解析的选项

```typescript
// ✅ 正确：只在父命令定义 --json
statusCmd.option('--json', t('commands.status.jsonOption'));

// get 子命令读取父命令的选项
statusCmd.command('get').action(async (_options, command: Command) => {
  const json = (command.parent?.opts() as { json?: boolean } | undefined)?.json;
  await getStatusCommand({ json });
});
```

这样两种调用方式都能正确工作：

- `colyn status --json` → 父 action 直接获取 `options.json`
- `colyn status get --json` → 父命令消费 `--json`，get action 从 `command.parent.opts()` 读取

---

## 6. 自动重置状态

### 6.1 触发时机

在以下命令成功执行后，自动将对应 worktree 的状态重置为 `idle`：

| 命令 | 重置时机 |
|------|---------|
| `colyn add` | 创建 worktree 并安装依赖后 |
| `colyn checkout` | git checkout 成功后 |
| `colyn merge` | worktree 合并到主分支后 |

### 6.2 设计原则

所有自动重置都用 `try/catch` 静默忽略错误，状态更新失败不影响主命令流程：

```typescript
// ✅ 正确：状态更新失败不影响主流程
try {
  await setWorktreeStatus(paths.configDir, `task-${id}`, paths.rootDir, 'idle');
} catch {
  // 状态更新失败不影响主流程
}
```

**特殊情况**：`checkout` 在目标分支与当前分支相同时会提前返回，不执行状态重置——这是正确行为，因为没有发生实际的切换操作。

---

## 7. 核心模块：`src/core/worktree-status.ts`

对外暴露的接口：

```typescript
export type WorktreeStatus = 'idle' | 'running' | 'waiting-confirm' | 'finish';

export const VALID_STATUSES: WorktreeStatus[] = [
  'idle', 'running', 'waiting-confirm', 'finish'
];

/**
 * 获取 worktree 状态（不存在时默认返回 idle）
 */
export async function getWorktreeStatus(
  configDir: string,
  worktreeDir: string
): Promise<{ status: WorktreeStatus; updatedAt: string | null }>

/**
 * 设置 worktree 状态，同步更新全局索引
 */
export async function setWorktreeStatus(
  configDir: string,
  worktreeDir: string,
  projectPath: string,
  status: WorktreeStatus
): Promise<void>
```

`setWorktreeStatus` 内部逻辑：

1. 读取 `.colyn/status.json`（不存在则初始化空结构）
2. 更新 `worktrees[worktreeDir]`（status + updatedAt = now）
3. 更新项目级 `updatedAt = now`
4. 写入 `.colyn/status.json`
5. 读取 `~/.colyn-status.json`（不存在则初始化为 `{}`）
6. 更新 `data[projectPath].updatedAt = now`
7. 写入 `~/.colyn-status.json`

---

## 8. 与 info 命令的集成

`colyn info` 命令集成了状态读取，提供 `status` 和 `last-updated-at` 两个字段：

```bash
$ colyn info
📁 Project:       myapp
🔢 Worktree ID:   1
📁 Worktree Dir:  task-1
🌿 Branch:        feature/login
⚡ Status:        running
📅 Last Updated:  2026-02-22 18:00:04
```

字段可通过 `--field` 和 `--format` 在脚本中使用：

```bash
# 获取状态
$ colyn info -f status
running

# 在模板中使用
$ colyn info --format="[{status}] {project}/{worktree-dir}"
[running] myapp/task-1
```

---

## 9. 退出码

| 退出码 | 说明 |
|--------|------|
| 0 | 成功 |
| 1 | 不在 colyn 项目中 / 无效状态值 |
