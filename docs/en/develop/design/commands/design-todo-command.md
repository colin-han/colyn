# Todo Command Design Document

**Created**: 2026-02-22
**Last Updated**: 2026-02-22 (updated: list output format, interactive select improvements)
**Command Name**: `colyn todo`
**Status**: ✅ Implemented

---

## 1. Command Overview

### 1.1 User Goal

In parallel Vibe Coding workflows, users need to track current-phase todo tasks when switching between Worktrees. `colyn todo` provides a lightweight task list shared across all Worktrees.

### 1.2 Core Use Cases

- Record the next features to implement during the planning phase
- Use `todo start` to create the corresponding branch and retrieve the task description (auto-copied to clipboard for pasting into Claude's input box)
- Archive completed tasks with `todo archive` to keep the list clean

### 1.3 Storage Location

| File | Description |
|------|-------------|
| `{projectRoot}/.colyn/todo.json` | Active tasks (pending / completed) |
| `{projectRoot}/.colyn/archived-todo.json` | Archived tasks |

All Worktrees share the same files; no synchronization between Worktrees is needed.

---

## 2. Data Structure

```typescript
type TodoStatus = 'pending' | 'completed';

interface TodoItem {
  type: string;       // Task type, e.g. "feature", "bugfix"
  name: string;       // Task name, e.g. "login", "fix-crash"
  message: string;    // Task description (supports Markdown)
  status: TodoStatus;
  createdAt: string;  // ISO timestamp
  startedAt?: string; // Time when todo start was executed
  branch?: string;    // Created branch name ("{type}/{name}")
}

interface TodoFile {
  todos: TodoItem[];
}

interface ArchivedTodoItem extends TodoItem {
  archivedAt: string; // Archive timestamp
}

interface ArchivedTodoFile {
  todos: ArchivedTodoItem[];
}
```

---

## 3. Todo ID Format

Todo ID uses the `{type}/{name}` format, consistent with branch names:

- `feature/login` → branch `feature/login`
- `bugfix/fix-crash` → branch `bugfix/fix-crash`
- `refactor/auth-module` → branch `refactor/auth-module`
- `document/api-guide` → branch `document/api-guide`

**Design rationale**: Consistent with `colyn checkout` semantics. `todo start` reuses the checkout logic directly to create/switch branches.

---

## 4. Status Flow

```
pending ──────────────────────────────► completed
   ▲    (todo start: create branch,        │
   │     mark as completed)                │
   │                                       │
   └─────────── (todo uncomplete) ─────────┘
                                           │
                                           │ (todo archive: batch archive)
                                           ▼
                                        archived
```

- `pending`: Tasks waiting to be started
- `completed`: Tasks whose branch has been created via `todo start` (branch in development)
- `archived`: Archived tasks, removed from the active list

---

## 5. Subcommand Design

### 5.1 `colyn todo add [todoId] [message]`

Add a new todo task. All arguments are optional; fully interactive when no arguments are provided.

**Argument resolution logic**:

```
No todoId → Interactive: select type + input name
No message → Open editor ($VISUAL / $EDITOR / vim)
```

**Editor template** (Markdown format; lines starting with `# ` are comments):

```markdown
                          ← User types task description here

# Todo: feature/login
# Enter task description above, then save and exit (:wq)
# Supports Markdown format; lines starting with "# " are treated as comments
```

**Supported types**: `feature` / `bugfix` / `refactor` / `document`

**Duplicate detection**: The same `type+name` combination cannot be added twice.

### 5.2 `colyn todo start [todoId]`

Start executing a todo task. `todoId` is optional:

**Without todoId**: Shows an interactive selection list of all `pending` tasks; exits with a message if no pending tasks exist.

Select list format:
- Each row shows `type/name` (left-aligned, padded to the longest ID width) + two spaces + first line of message (gray)
- The message first line is truncated to fit the available terminal width, ensuring each option occupies one line
- After selecting an item, the first 4 lines of that task's message are displayed below the list as a preview (gray)
- All width calculations are CJK-aware (Chinese characters count as width 2) for accurate alignment

**With todoId**: Executes the specified task directly.

**Execution flow**:

1. If no todoId is provided, interactively select a pending task
2. Validate the todo exists and is in `pending` status
3. Call `checkoutCommand(undefined, branch, {})` to create/switch to the branch
4. On success: update status to `completed`, record `startedAt` and `branch`
5. Output the task description (message) and copy it to the clipboard

**Clipboard support**:
- macOS: `pbcopy`
- Linux: `xclip -selection clipboard`
- Windows: `clip`
- `--no-clipboard`: Skip clipboard operation

**Design intent**: Copying to the clipboard allows users to quickly paste the task description into Claude's input box as context for a new session.

### 5.3 `colyn todo list [--completed] [--archived] [--id-only] [--json]`

List tasks. Alias: `colyn todo ls`.

| Invocation | Displays |
|-----------|---------|
| `colyn todo list` (default) | Tasks in `pending` status |
| `colyn todo list --completed` | Tasks in `completed` status |
| `colyn todo list --archived` | Tasks in `archived-todo.json` |
| `colyn todo list --json` | Output in JSON format to stdout |
| `colyn todo list --json --completed` | Output completed tasks in JSON format |
| `colyn todo list --json --archived` | Output archived tasks in JSON format |

**`colyn todo` (without subcommand) is equivalent to `colyn todo list`**.

**`--json` option**:

- Outputs the task list as a JSON array to stdout
- Can be combined with `--completed` or `--archived` to select tasks by status
- Mutually exclusive with `--id-only` (both are machine-readable formats)
- Archived tasks (`--archived`) output includes the `archivedAt` field

**Table output format** (without `--json`):

- Columns: Type / Name / Message / Status / Created
- Message column shows only the **first line** of the message
- Type, Name, Status, and Created columns auto-size to fit content; Message column fills remaining terminal width
- Message content is truncated with an ellipsis (`…`) when it exceeds the column width
- All column width calculations are CJK-aware (Chinese characters count as width 2)

### 5.4 `colyn todo remove <todoId> [-y]`

Remove a task from the active list. `-y` skips the confirmation prompt.

### 5.5 `colyn todo archive [-y]`

Batch archive all `completed` tasks to `archived-todo.json` and remove them from `todo.json`. `-y` skips the confirmation prompt.

### 5.6 `colyn todo uncomplete [todoId]`

Revert a `completed` task back to `pending`, clearing `startedAt` and `branch` fields.

If `todoId` is not specified, the current Worktree's branch name is used automatically (must be executed in a non-main-branch Worktree).

### 5.7 `colyn todo edit [todoId] [message]`

Edit the description of an existing Todo task.

**Arguments**:
- `todoId` (optional): Format `{type}/{name}`; interactive selection when omitted
- `message` (optional): New description text; opens editor when omitted

**Interaction logic**:
- No `todoId`: Interactive selection list showing all pending + completed tasks
- No `message`: Opens `$VISUAL` / `$EDITOR` / `vim` via temp file
- Todo is `completed`: Prompts user to revert to `pending` first; declining exits with code 1

**Difference from `uncomplete`**: `uncomplete` handles status reversion only; `edit` primarily updates the message and only reverts status when necessary.

---

## 6. Checkout Integration

`todo start` calls the exported `checkoutCommand` function directly, which is fully equivalent to `colyn checkout {branch}`:

```typescript
// Exported from checkout.ts
export async function checkoutCommand(
  target: string | undefined,
  branch: string,
  options: CheckoutOptions
): Promise<void>

// Called in todo.ts (target=undefined uses current worktree)
await checkoutCommand(undefined, branch, {});
```

This means `todo start` performs the full checkout flow: check for uncommitted changes, fetch remote, archive old logs, rename tmux window, etc.

---

## 7. Output Convention

All user-visible messages are written to **stderr**, following the project's dual-layer architecture.

---

## 8. File Organization

```
src/commands/
├── todo.ts           # Command registration and all subcommand implementations
└── todo.helpers.ts   # File I/O, vim editing, clipboard, table formatting, interactive select
```

Key exports from `todo.helpers.ts`:

| Function | Description |
|----------|-------------|
| `readTodoFile` / `saveTodoFile` | Active todo file read/write |
| `readArchivedTodoFile` / `saveArchivedTodoFile` | Archived todo file read/write |
| `parseTodoId` | Parse `type/name` format |
| `findTodo` | Find a todo item in the list |
| `editMessageWithEditor` | Open editor to interactively edit message |
| `copyToClipboard` | Copy text to system clipboard |
| `formatTodoTable` | Format table output (CJK-aware width) |
| `selectPendingTodo` | Interactive task selection with preview |
