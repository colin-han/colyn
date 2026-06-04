# Todo 命令设计文档

**创建时间**：2026-02-22
**最后更新**：2026-06-03（更新：4 态生命周期、Todo IMS Backend 架构、GitHub Issues 集成、list 选项调整）
**命令名称**：`colyn todo`
**状态**：✅ 已实现

---

## 1. 命令概述

### 1.1 用户目标

在并行 Vibe Coding 工作流中，用户需要在多个 Worktree 之间切换时跟踪当前阶段的待办任务。`colyn todo` 提供一个轻量级的任务列表，所有 Worktree 共享同一份 todo 数据。

### 1.2 核心使用场景

- 在规划阶段记录下一步要实现的功能
- 通过 `todo start` 创建对应分支并获取任务描述（自动复制到剪贴板，方便粘贴到 Claude 输入框）
- 通过 `todo complete` 在不切换分支的情况下直接标记任务完成
- 完成任务后通过 `todo archive` 归档，保持列表整洁
- 可选接入 GitHub Issues 作为任务数据源，实现与 GitHub 项目管理系统的双向同步

### 1.3 存储位置

**Local 后端（默认）**：

| 文件 | 说明 |
|------|------|
| `{projectRoot}/.colyn/todo.json` | 活跃任务（pending / in-progress / done） |
| `{projectRoot}/.colyn/archived-todo.json` | 归档任务 |

**GitHub 后端**：

任务数据来源于 GitHub Issues，通过 GitHub CLI（`gh`）与远程仓库实时交互，本地不保存副本。

所有 Worktree 共享同一份任务数据，无需在不同 Worktree 间同步。

---

## 2. 数据结构

```typescript
type TodoStatus = 'pending' | 'in-progress' | 'done' | 'archived';

interface TodoItem {
  type: string;       // 任务类型，如 "feature", "bugfix"
  name: string;       // 任务名称，如 "login", "fix-crash"
  message: string;    // 任务描述（支持 Markdown）
  status: TodoStatus;
  createdAt: string;  // ISO 时间戳
  startedAt?: string; // todo start 执行时间（进入 in-progress 时记录）
  branch?: string;    // 创建的分支名（"{type}/{name}"）
}

interface TodoFile {
  todos: TodoItem[];
}

interface ArchivedTodoItem extends TodoItem {
  archivedAt: string; // 归档时间
}

interface ArchivedTodoFile {
  todos: ArchivedTodoItem[];
}
```

> **注意**：`archived` 状态仅用于 Local 后端的文件存储；对 GitHub 后端，归档状态通过 Issue 的 closed 状态加 Label 标记实现，不在本地存储中持久化。

---

## 3. Todo ID 格式

Todo ID 采用 `{type}/{name}` 格式，与分支名保持一致：

- `feature/login` → 分支名 `feature/login`
- `bugfix/fix-crash` → 分支名 `bugfix/fix-crash`
- `refactor/auth-module` → 分支名 `refactor/auth-module`
- `document/api-guide` → 分支名 `document/api-guide`

**设计原因**：与 `colyn checkout` 语义一致，`todo start` 直接复用 checkout 逻辑创建/切换分支。

---

## 4. 状态流转

```
pending ──(todo start)──► in-progress ──(todo complete)──► done
   ▲                           ▲                            │
   │                           │                            │
   │               (todo uncomplete)                        │
   │                           │                            │
   │                           └────────────────────────────┘
   │                                                        │
   └──────(todo remove：Local 删除 / GitHub wontfix)        │
                                                            │ (todo archive：归档)
                                                            ▼
                                                         archived
```

| 状态 | 说明 |
|------|------|
| `pending` | 等待开始的任务（Local: 已记录但未建分支；GitHub: open issue 且无对应分支） |
| `in-progress` | 正在进行中（Local: 已建分支；GitHub: open issue 且有对应分支） |
| `done` | 开发完成（Local: 显式完成；GitHub: closed issue） |
| `archived` | 已归档，移出活跃列表（Local: 移入 archived-todo.json；GitHub: closed + archived label） |

**状态转换触发器**：

| 操作 | 前置状态 | 目标状态 |
|------|---------|---------|
| `todo start` | pending | in-progress |
| `todo complete` | in-progress | done |
| `todo uncomplete` | done | in-progress |
| `todo archive` | done | archived |
| `todo remove` | 任意 | 删除（Local）/ closed+wontfix（GitHub） |

---

## 5. 子命令设计

### todoId 通用约定

所有接受 `todoId` 的子命令均支持两种形式：

- **`type/name`**：完整形式，明确指定 type。
- **仅 `name`**（不含 `/`）：省略 type，由命令自动补全。
  - `add` 命令：默认使用 `feature` 作为 type（即 `colyn todo add login "..."` 等价于 `colyn todo add feature/login "..."`）。
  - 查找类命令（`start` / `complete` / `uncomplete` / `remove` / `edit`）：跨所有 type 按 name 查找现有任务。
    - 唯一匹配 → 直接使用。
    - 多个不同 type 同名（如 `feature/login` 与 `bugfix/login`）→ 报错并列出候选，要求用户改用完整 `type/name`。
    - 无匹配 → 按各命令原有的"任务不存在"提示处理。

### 5.1 `colyn todo add [todoId] [message...]`

添加新的待办任务。所有参数均为可选，无参数时完全交互式。`message` 为变长参数（commander 的 `[message...]`），可不加引号传入多个词，内部以空格拼接为完整描述。

**Local 后端行为**：

```
无 todoId       → 交互式选择 type + 输入 name（拼接为 type/name）
todoId 仅 name  → type 默认 feature（feature/<name>）
todoId type/name→ 按指定 type/name 创建
无 message      → 打开编辑器（$VISUAL / $EDITOR / vim）
有 message      → 多个词以空格拼接为任务描述
```

**GitHub 后端行为**：

```
交互式选择 type（对应 Issue label）
无 message → 打开编辑器（首行自动作为 Issue title，其余为 body）
name → 由 GitHub 自动分配 Issue 号，用户无需输入
```

GitHub 后端下，todoId 格式为 `{type}/{issue-number}`，例如 `feature/42`。

**编辑器模板**（Markdown 格式，以 `# ` 开头的行为注释）：

```markdown
                          ← 用户在此处输入任务描述

# Todo: feature/login
# 请在上方输入任务描述，完成后保存退出（:wq）
# 支持 Markdown 格式，以 "# " 开头的行为注释会被忽略
```

**支持的 type**：`feature` / `bugfix` / `refactor` / `document`（可通过 `todo.github.typeLabels` 自定义 GitHub label 映射）

**重复检测**：Local 后端下同一 `type+name` 不允许重复添加；GitHub 后端无此限制（每个 Issue 唯一）。

### 5.2 `colyn todo start [todoId]`

开始执行待办任务。`todoId` 为可选参数：

**无 todoId 时**：展示所有 `pending` 任务交互式选择列表，若无待办任务则直接提示退出。

选择列表格式：
- 每行显示 `type/name`（左对齐，补齐至最长 ID 宽度）+ 两空格 + message 首行（灰色）
- message 首行按终端可用宽度截断，确保每个选项占一行
- 选中某项后，列表下方显示该任务 message 的前 4 行内容作为预览（灰色）
- 宽字符（CJK）按实际显示宽度（2）计算，确保对齐准确

**有 todoId 时**：直接执行指定任务。

**执行流程**：

1. 若未提供 todoId，从当前 active backend 获取 `pending` 任务列表，交互式选择
2. 验证 todo 存在且状态为 `pending`
3. 调用 `checkoutCommand(undefined, branch, {})` 创建/切换到对应分支
4. checkout 成功后：更新状态为 `in-progress`，记录 `startedAt` 和 `branch`
5. 输出任务描述（message），并复制到剪贴板

**剪贴板支持**：
- macOS：`pbcopy`
- Linux：`xclip -selection clipboard`
- Windows：`clip`
- `--no-clipboard`：跳过剪贴板操作

**设计意图**：复制到剪贴板是为了方便用户快速将任务描述粘贴到 Claude 输入框，作为新会话的初始上下文。

### 5.3 `colyn todo list [--in-progress] [--done] [--archived] [--all] [--id-only] [--json]`

列出任务。别名：`colyn todo ls`。

| 调用方式 | 显示内容 |
|---------|---------|
| `colyn todo list`（默认） | `pending` 状态的任务 |
| `colyn todo list --in-progress` | `in-progress` 状态的任务 |
| `colyn todo list --done` | `done` 状态的任务 |
| `colyn todo list --archived` | 归档任务（Local: archived-todo.json；GitHub: closed + archived label） |
| `colyn todo list --all` | 所有活跃任务（pending + in-progress + done） |
| `colyn todo list --json` | 以 JSON 格式输出到 stdout |
| `colyn todo list --json --done` | 以 JSON 格式输出已完成任务 |
| `colyn todo list --json --archived` | 以 JSON 格式输出归档任务 |

> ⚠️ **breaking change**：旧版 `--completed` 选项已重命名为 `--done`，与新的 4 态生命周期保持一致。

**`colyn todo`（不带子命令）等同于 `colyn todo list`**。

**`--json` 选项**：

- 将任务列表以 JSON 数组格式输出到 stdout
- 可与 `--done`、`--in-progress`、`--archived`、`--all` 组合使用
- 与 `--id-only` 互斥（两者均为机器可读格式，不能同时使用）
- 归档任务（`--archived`）输出包含 `archivedAt` 字段的完整数据

**表格输出格式**（不带 `--json`）：

- 列：Type / Name / Message / Created
- Message 列仅显示 message 的**首行**内容
- Type、Name、Created 列按内容自适应宽度；Message 列填满终端剩余空间
- Message 内容超出列宽时自动截断并追加省略号（`…`）
- 所有列宽计算均采用 CJK 感知的显示宽度（中文字符宽度为 2）

### 5.4 `colyn todo remove [todoId] [-y]`

从活跃列表删除任务。`todoId` 为可选参数，省略时展示交互式选择列表供用户选择要删除的任务。`-y` 跳过确认提示。

### 5.5 `colyn todo archive [-y]`

将所有 `done` 状态的任务批量归档，并从活跃列表中移除。`-y` 跳过确认提示。

- **Local 后端**：将 `done` 状态的任务移入 `archived-todo.json`，从 `todo.json` 删除
- **GitHub 后端**：为 `done` 状态的 Issue 打上 archived label（若配置了 `todo.github.archivedLabel`），否则该 Issue 保持 closed 状态视为已归档

### 5.6 `colyn todo complete [todoId]`

将 `in-progress` 任务标记为 `done`。`todoId` 为可选参数：

- 无 `todoId`：展示 in-progress 任务交互式选择列表
- 有 `todoId`：直接执行指定任务

执行成功后：
1. 更新状态为 `done`
2. **Local 后端**：写入完成时间戳
3. **GitHub 后端**：close 对应 Issue

**与 `todo start` 的区别**：
- `todo complete` 仅更新任务状态，不做分支切换，不复制剪贴板
- `todo start` 执行 checkout 流程并将状态置为 `in-progress`，同时输出/复制 message

### 5.7 `colyn todo uncomplete [todoId]`

将 `done` 任务回退为 `in-progress`，清除相关完成记录。

- **Local 后端**：更新状态字段，保留 `startedAt` 和 `branch`
- **GitHub 后端**：重新 open 对应 Issue

若未指定 `todoId`，自动使用当前所在 Worktree 的分支名（需在非主分支的 Worktree 中执行）。

### 5.8 `colyn todo edit [todoId] [message]`

编辑已有 Todo 任务的描述。

**参数**：
- `todoId`（可选）：格式为 `{type}/{name}`；省略时交互式选择
- `message`（可选）：新的描述文本；省略时打开编辑器交互式编辑

**交互逻辑**：
- 无 `todoId`：交互式选择列表，显示所有 pending + completed 任务
- 无 `message`：通过 `$VISUAL` / `$EDITOR` / `vim` 打开编辑器（使用临时文件）
- Todo 已 `completed`：询问用户是否先回退为 `pending`，拒绝则以 exit(1) 报错退出

**与 `uncomplete` 的区别**：`uncomplete` 专门处理状态回退；`edit` 主要修改 message，只在必要时顺带回退状态。

---

## 6. Checkout 集成

`todo start` 通过直接调用导出的 `checkoutCommand` 函数实现分支操作，与 `colyn checkout {branch}` 完全等效：

```typescript
// checkout.ts 导出
export async function checkoutCommand(
  target: string | undefined,
  branch: string,
  options: CheckoutOptions
): Promise<void>

// todo.ts 调用（target=undefined 使用当前 worktree）
await checkoutCommand(undefined, branch, {});
```

这意味着 `todo start` 会执行完整的 checkout 流程：检查未提交更改、fetch 远程、归档旧日志、重命名 tmux window 等。

补充说明：

- 当需要新增 worktree 时，使用 `colyn add [branch]`；不传 `branch` 可交互选择 Todo 分支和本地分支，减少手动输入。
- 当需要复用现有 worktree 时，使用 `colyn checkout [branch]`；不传 `branch` 同样可交互选择。
- 在 `add/checkout` 的交互列表中选择 `pending` Todo 分支时，命令成功后会执行与 `todo start` 对齐的后置动作：将 Todo 标记为 `in-progress`、写入 `startedAt/branch`、输出 message 并复制到剪贴板。
- `add/checkout` 显示的待选 pending todo 列表来自**当前 active backend**（local 或 github）。

---

## 7. Todo Backend 架构

### 7.1 Backend 接口

所有 todo 操作通过统一的 `TodoBackend` 接口抽象，不同 backend 实现相同接口：

```typescript
interface TodoBackend {
  list(filter?: TodoStatusFilter): Promise<TodoItem[]>;
  add(item: Omit<TodoItem, 'createdAt'>): Promise<TodoItem>;
  updateStatus(id: string, status: TodoStatus): Promise<void>;
  remove(id: string): Promise<void>;
  archive(id: string): Promise<void>;
}
```

### 7.2 支持的 Backend

| Backend | 配置值 | 数据来源 | 前置条件 |
|---------|--------|---------|---------|
| Local（默认） | `'local'` | `.colyn/todo.json` | 无 |
| GitHub Issues | `'github'` | GitHub Issues API | 已安装并登录 `gh` CLI；项目 origin 为 github.com 仓库 |

### 7.3 Backend 配置

通过 `.colyn/settings.json` 配置（所有字段均为项目级配置，不支持全局配置）：

```json
{
  "todo": {
    "backend": "local",
    "autoArchive": false,
    "github": {
      "archivedLabel": "archived",
      "typeLabels": {
        "feature": "enhancement",
        "bugfix": "bug",
        "refactor": "refactor",
        "document": "documentation"
      }
    }
  }
}
```

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `todo.backend` | `'local' \| 'github'` | `'local'` | 使用的 backend 类型 |
| `todo.autoArchive` | `boolean` | `false` | done → archived 自动归档 |
| `todo.github.archivedLabel` | `string` | 未设置 | GitHub archived label 名；未设置时所有 closed Issue 视为 archived |
| `todo.github.typeLabels` | `Record<string, string>` | 内置映射 | type → GitHub label 映射；**只能手动编辑 settings.json，不支持 `config set`** |

**`config set` 可用**：`todo.backend`、`todo.autoArchive`、`todo.github.archivedLabel`

**仅手动编辑**：`todo.github.typeLabels`（映射表结构复杂，不适合命令行交互设置）

### 7.4 GitHub 状态映射

| Colyn 状态 | GitHub Issue 状态 |
|-----------|-----------------|
| `pending` | open，且仓库中无对应分支 |
| `in-progress` | open，且仓库中有对应分支（`{type}/{issue-number}`） |
| `done` | closed（且无 archived label） |
| `archived` | closed + archived label（若配置）；或所有 closed（若未配置 archivedLabel） |

**remove 操作**：close Issue 并打上 `wontfix` label（GitHub 不物理删除 Issue）。

---

## 8. 输出规范

所有用户可见的提示信息输出到 **stderr**，符合项目的双层架构规范。

---

## 9. 文件组织

```
src/
├── commands/
│   ├── todo.ts             # 命令注册，所有子命令实现
│   └── todo.helpers.ts     # 编辑器、剪贴板、表格格式化、交互式选择
└── todo-backend/
    ├── types.ts            # TodoItem、TodoStatus、TodoBackend 接口定义
    ├── registry.ts         # Backend provider 注册与分发
    ├── local/
    │   └── index.ts        # LocalFileBackend 实现
    └── github/
        ├── index.ts        # GitHubIssuesBackend 实现
        └── gh.ts           # gh CLI 薄封装
```

`todo.helpers.ts` 主要导出函数：

| 函数 | 说明 |
|------|------|
| `parseTodoId` | 解析 todoId：`type/name` 拆分；仅 `name` 时 type 返回 undefined |
| `resolveTodoId` | 将 todoId 解析为具体 `{ type, name }`：仅 name 时跨 type 查找补全，多个同名抛歧义错误 |
| `listAllTodos` | 汇总所有状态（pending/in-progress/done/archived）的任务 |
| `findTodo` | 在列表中查找条目 |
| `editMessageWithEditor` | 打开编辑器交互式编辑 message |
| `copyToClipboard` | 复制文本到系统剪贴板 |
| `formatTodoTable` | 格式化表格输出（CJK 感知宽度） |
| `selectTodo` | 带预览的交互式任务选择（各子命令实际调用） |
