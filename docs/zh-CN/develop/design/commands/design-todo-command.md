# Todo 命令设计文档

**创建时间**：2026-02-22
**最后更新**：2026-02-23（更新：add/checkout 联动、todo complete 子命令、列表输出移除状态列、交互式选择优化）
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

### 1.3 存储位置

| 文件 | 说明 |
|------|------|
| `{projectRoot}/.colyn/todo.json` | 活跃任务（pending / completed） |
| `{projectRoot}/.colyn/archived-todo.json` | 归档任务 |

所有 Worktree 共享同一份文件，无需在不同 Worktree 间同步。

---

## 2. 数据结构

```typescript
type TodoStatus = 'pending' | 'completed';

interface TodoItem {
  type: string;       // 任务类型，如 "feature", "bugfix"
  name: string;       // 任务名称，如 "login", "fix-crash"
  message: string;    // 任务描述（支持 Markdown）
  status: TodoStatus;
  createdAt: string;  // ISO 时间戳
  startedAt?: string; // todo start 执行时间
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
pending ──────────────────────────────► completed
   ▲    (todo start/todo complete：标记完成)  │
   │                                         │
   └─────────── (todo uncomplete) ───────────┘
                                             │
                                             │ (todo archive：批量归档)
                                             ▼
                                          archived
```

- `pending`：等待开始的任务
- `completed`：已通过 `todo start` 或 `todo complete` 标记完成的任务
- `archived`：已归档，移出活跃列表

---

## 5. 子命令设计

### 5.1 `colyn todo add [todoId] [message]`

添加新的待办任务。所有参数均为可选，无参数时完全交互式。

**参数解析逻辑**：

```
无 todoId → 交互式选择 type + 输入 name
无 message → 打开编辑器（$VISUAL / $EDITOR / vim）
```

**编辑器模板**（Markdown 格式，以 `# ` 开头的行为注释）：

```markdown
                          ← 用户在此处输入任务描述

# Todo: feature/login
# 请在上方输入任务描述，完成后保存退出（:wq）
# 支持 Markdown 格式，以 "# " 开头的行为注释会被忽略
```

**支持的 type**：`feature` / `bugfix` / `refactor` / `document`

**重复检测**：同一 `type+name` 不允许重复添加。

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

1. 若未提供 todoId，交互式选择一个 pending 任务
2. 验证 todo 存在且状态为 `pending`
3. 调用 `checkoutCommand(undefined, branch, {})` 创建/切换到对应分支
4. checkout 成功后：更新状态为 `completed`，记录 `startedAt` 和 `branch`
5. 输出任务描述（message），并复制到剪贴板

**剪贴板支持**：
- macOS：`pbcopy`
- Linux：`xclip -selection clipboard`
- Windows：`clip`
- `--no-clipboard`：跳过剪贴板操作

**设计意图**：复制到剪贴板是为了方便用户快速将任务描述粘贴到 Claude 输入框，作为新会话的初始上下文。

### 5.3 `colyn todo list [--completed] [--archived] [--id-only] [--json]`

列出任务。别名：`colyn todo ls`。

| 调用方式 | 显示内容 |
|---------|---------|
| `colyn todo list`（默认） | pending 状态的任务 |
| `colyn todo list --completed` | completed 状态的任务 |
| `colyn todo list --archived` | archived-todo.json 中的任务 |
| `colyn todo list --json` | 以 JSON 格式输出到 stdout |
| `colyn todo list --json --completed` | 以 JSON 格式输出已完成任务 |
| `colyn todo list --json --archived` | 以 JSON 格式输出归档任务 |

**`colyn todo`（不带子命令）等同于 `colyn todo list`**。

**`--json` 选项**：

- 将任务列表以 JSON 数组格式输出到 stdout
- 可与 `--completed` 或 `--archived` 组合使用，选择不同状态的任务
- 与 `--id-only` 互斥（两者均为机器可读格式，不能同时使用）
- 归档任务（`--archived`）输出包含 `archivedAt` 字段的完整数据

**表格输出格式**（不带 `--json`）：

- 列：Type / Name / Message / Created
- Message 列仅显示 message 的**首行**内容
- Type、Name、Created 列按内容自适应宽度；Message 列填满终端剩余空间
- Message 内容超出列宽时自动截断并追加省略号（`…`）
- 所有列宽计算均采用 CJK 感知的显示宽度（中文字符宽度为 2）

### 5.4 `colyn todo remove <todoId> [-y]`

从活跃列表删除任务。`-y` 跳过确认提示。

### 5.5 `colyn todo archive [-y]`

将所有 `completed` 状态的任务批量归档到 `archived-todo.json`，并从 `todo.json` 中删除。`-y` 跳过确认提示。

### 5.6 `colyn todo complete [todoId]`

将 `pending` 任务标记为 `completed`。`todoId` 为可选参数：

- 无 `todoId`：展示 pending 任务交互式选择列表
- 有 `todoId`：直接执行指定任务

执行成功后：
1. 更新状态为 `completed`
2. 记录 `startedAt`
3. 写入 `branch`（`{type}/{name}`）

**与 `todo start` 的区别**：
- `todo complete` 仅更新任务状态，不做分支切换，不复制剪贴板
- `todo start` 还会执行 checkout 流程并输出/复制 message

### 5.7 `colyn todo uncomplete [todoId]`

将 `completed` 任务回退为 `pending`，清除 `startedAt` 和 `branch` 字段。

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
- 在 `add/checkout` 的交互列表中选择 `pending` Todo 分支时，命令成功后会执行与 `todo start` 对齐的后置动作：将 Todo 标记为 `completed`、写入 `startedAt/branch`、输出 message 并复制到剪贴板。

---

## 7. 输出规范

所有用户可见的提示信息输出到 **stderr**，符合项目的双层架构规范。

---

## 8. 文件组织

```
src/commands/
├── todo.ts           # 命令注册，所有子命令实现
└── todo.helpers.ts   # 文件读写、vim 编辑、剪贴板、表格格式化、交互式选择
```

`todo.helpers.ts` 主要导出函数：

| 函数 | 说明 |
|------|------|
| `readTodoFile` / `saveTodoFile` | 活跃 todo 文件读写 |
| `readArchivedTodoFile` / `saveArchivedTodoFile` | 归档 todo 文件读写 |
| `parseTodoId` | 解析 `type/name` 格式 |
| `findTodo` | 在列表中查找条目 |
| `editMessageWithEditor` | 打开编辑器交互式编辑 message |
| `copyToClipboard` | 复制文本到系统剪贴板 |
| `formatTodoTable` | 格式化表格输出（CJK 感知宽度） |
| `selectPendingTodo` | 带预览的交互式任务选择 |
