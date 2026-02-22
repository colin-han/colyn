# Todo Command Design Document

**Created**: 2026-02-22
**Last Updated**: 2026-02-22
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

### 5.2 `colyn todo start <todoId>`

Start executing a todo task:

1. Validate the todo exists and is in `pending` status
2. Call `checkoutCommand(undefined, branch, {})` to create/switch to the branch
3. On success: update status to `completed`, record `startedAt` and `branch`
4. Output the task description (message) and copy it to the clipboard

**Clipboard support**:
- macOS: `pbcopy`
- Linux: `xclip -selection clipboard`
- Windows: `clip`
- `--no-clipboard`: Skip clipboard operation

**Design intent**: Copying to the clipboard allows users to quickly paste the task description into Claude's input box as context for a new session.

### 5.3 `colyn todo list [--completed] [--archived]`

List tasks. Alias: `colyn todo ls`.

| Invocation | Displays |
|-----------|---------|
| `colyn todo list` (default) | Tasks in `pending` status |
| `colyn todo list --completed` | Tasks in `completed` status |
| `colyn todo list --archived` | Tasks in `archived-todo.json` |

**`colyn todo` (without subcommand) is equivalent to `colyn todo list`**.

### 5.4 `colyn todo remove <todoId> [-y]`

Remove a task from the active list. `-y` skips the confirmation prompt.

### 5.5 `colyn todo archive [-y]`

Batch archive all `completed` tasks to `archived-todo.json` and remove them from `todo.json`. `-y` skips the confirmation prompt.

### 5.6 `colyn todo uncomplete [todoId]`

Revert a `completed` task back to `pending`, clearing `startedAt` and `branch` fields.

If `todoId` is not specified, the current Worktree's branch name is used automatically (must be executed in a non-main-branch Worktree).

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
└── todo.helpers.ts   # File I/O, vim editing, clipboard, table formatting
```
