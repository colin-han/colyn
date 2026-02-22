# Todo 命令设计文档

**创建时间**：2026-02-22
**最后更新**：2026-02-22（更新：列表输出格式、交互式选择优化）
**命令名称**：`colyn todo`
**状态**：✅ 已实现

---

## 1. 命令概述

### 1.1 用户目标

在并行 Vibe Coding 工作流中，用户需要在多个 Worktree 之间切换时跟踪当前阶段的待办任务。`colyn todo` 提供一个轻量级的任务列表，所有 Worktree 共享同一份 todo 数据。

### 1.2 核心使用场景

- 在规划阶段记录下一步要实现的功能
- 通过 `todo start` 创建对应分支并获取任务描述（自动复制到剪贴板，方便粘贴到 Claude 输入框）
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
   ▲    (todo start：创建分支，标记完成)     │
   │                                         │
   └─────────── (todo uncomplete) ───────────┘
                                             │
                                             │ (todo archive：批量归档)
                                             ▼
                                          archived
```

- `pending`：等待开始的任务
- `completed`：已通过 `todo start` 创建分支的任务（分支开发中）
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

### 5.3 `colyn todo list [--completed] [--archived]`

列出任务。别名：`colyn todo ls`。

| 调用方式 | 显示内容 |
|---------|---------|
| `colyn todo list`（默认） | pending 状态的任务 |
| `colyn todo list --completed` | completed 状态的任务 |
| `colyn todo list --archived` | archived-todo.json 中的任务 |

**`colyn todo`（不带子命令）等同于 `colyn todo list`**。

**表格输出格式**：

- 列：Type / Name / Message / Status / Created
- Message 列仅显示 message 的**首行**内容
- Type、Name、Status、Created 列按内容自适应宽度；Message 列填满终端剩余空间
- Message 内容超出列宽时自动截断并追加省略号（`…`）
- 所有列宽计算均采用 CJK 感知的显示宽度（中文字符宽度为 2）

### 5.4 `colyn todo remove <todoId> [-y]`

从活跃列表删除任务。`-y` 跳过确认提示。

### 5.5 `colyn todo archive [-y]`

将所有 `completed` 状态的任务批量归档到 `archived-todo.json`，并从 `todo.json` 中删除。`-y` 跳过确认提示。

### 5.6 `colyn todo uncomplete [todoId]`

将 `completed` 任务回退为 `pending`，清除 `startedAt` 和 `branch` 字段。

若未指定 `todoId`，自动使用当前所在 Worktree 的分支名（需在非主分支的 Worktree 中执行）。

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
