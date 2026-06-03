# Todo Command Design Document

**Created**: 2026-02-22
**Last Updated**: 2026-06-03 (updated: 4-state lifecycle, Todo IMS Backend architecture, GitHub Issues integration, list option changes)
**Command Name**: `colyn todo`
**Status**: ✅ Implemented

---

## 1. Command Overview

### 1.1 User Goal

In parallel Vibe Coding workflows, users need to track current-phase todo tasks when switching between Worktrees. `colyn todo` provides a lightweight task list shared across all Worktrees.

### 1.2 Core Use Cases

- Record the next features to implement during the planning phase
- Use `todo start` to create the corresponding branch and retrieve the task description (auto-copied to clipboard for pasting into Claude's input box)
- Use `todo complete` to mark tasks done without switching branches
- Archive completed tasks with `todo archive` to keep the list clean
- Optionally connect to GitHub Issues as the task data source for two-way sync with GitHub project management

### 1.3 Storage Location

**Local backend (default)**:

| File | Description |
|------|-------------|
| `{projectRoot}/.colyn/todo.json` | Active tasks (pending / in-progress / done) |
| `{projectRoot}/.colyn/archived-todo.json` | Archived tasks |

**GitHub backend**:

Task data comes from GitHub Issues. The system interacts with the remote repository in real time via the GitHub CLI (`gh`), without a local copy.

All Worktrees share the same task data; no synchronization between Worktrees is needed.

---

## 2. Data Structure

```typescript
type TodoStatus = 'pending' | 'in-progress' | 'done' | 'archived';

interface TodoItem {
  type: string;       // Task type, e.g. "feature", "bugfix"
  name: string;       // Task name, e.g. "login", "fix-crash"
  message: string;    // Task description (supports Markdown)
  status: TodoStatus;
  createdAt: string;  // ISO timestamp
  startedAt?: string; // Time when the task moved to in-progress
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

> **Note**: The `archived` status is only used in local backend file storage. For the GitHub backend, archived status is represented by a closed Issue with an archived label, and is not persisted locally.

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
pending ──(todo start)──► in-progress ──(todo complete)──► done
   ▲                           ▲                            │
   │                           │                            │
   │               (todo uncomplete)                        │
   │                           │                            │
   │                           └────────────────────────────┘
   │                                                        │
   └──────(todo remove: Local deletes / GitHub wontfix)     │
                                                            │ (todo archive)
                                                            ▼
                                                         archived
```

| Status | Description |
|--------|-------------|
| `pending` | Waiting to start (Local: recorded but no branch yet; GitHub: open issue with no matching branch) |
| `in-progress` | Work in progress (Local: branch exists; GitHub: open issue with matching branch) |
| `done` | Development complete (Local: explicitly completed; GitHub: closed issue) |
| `archived` | Archived, removed from the active list (Local: moved to archived-todo.json; GitHub: closed + archived label) |

**State transition triggers**:

| Operation | From | To |
|-----------|------|----|
| `todo start` | pending | in-progress |
| `todo complete` | in-progress | done |
| `todo uncomplete` | done | in-progress |
| `todo archive` | done | archived |
| `todo remove` | any | deleted (Local) / closed+wontfix (GitHub) |

---

## 5. Subcommand Design

### 5.1 `colyn todo add [todoId] [message...]`

Add a new todo task. All arguments are optional; fully interactive when no arguments are provided. `message` is a variadic argument (commander's `[message...]`): it accepts multiple unquoted words, joined internally with spaces into the full description.

**Local backend behavior**:

```
No todoId   → Interactive: select type + input name (joined as type/name)
No message  → Open editor ($VISUAL / $EDITOR / vim)
Has message → Multiple words joined with spaces into the description
```

**GitHub backend behavior**:

```
Interactive: select type (maps to an Issue label)
No message → Open editor (first line becomes Issue title, rest becomes body)
name → automatically assigned from GitHub Issue number; no user input required
```

Under the GitHub backend, todo IDs use the format `{type}/{issue-number}`, e.g., `feature/42`.

**Editor template** (Markdown format; lines starting with `# ` are comments):

```markdown
                          ← User types task description here

# Todo: feature/login
# Enter task description above, then save and exit (:wq)
# Supports Markdown format; lines starting with "# " are treated as comments
```

**Supported types**: `feature` / `bugfix` / `refactor` / `document` (GitHub label mapping can be customized via `todo.github.typeLabels`)

**Duplicate detection**: Local backend prevents duplicate `type+name`; GitHub backend has no such restriction (each Issue is unique).

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

1. If no todoId is provided, fetch `pending` tasks from the current active backend and show interactive selection
2. Validate the todo exists and is in `pending` status
3. Call `checkoutCommand(undefined, branch, {})` to create/switch to the branch
4. On success: update status to `in-progress`, record `startedAt` and `branch`
5. Output the task description (message) and copy it to the clipboard

**Clipboard support**:
- macOS: `pbcopy`
- Linux: `xclip -selection clipboard`
- Windows: `clip`
- `--no-clipboard`: Skip clipboard operation

**Design intent**: Copying to the clipboard allows users to quickly paste the task description into Claude's input box as context for a new session.

### 5.3 `colyn todo list [--in-progress] [--done] [--archived] [--all] [--id-only] [--json]`

List tasks. Alias: `colyn todo ls`.

| Invocation | Displays |
|-----------|---------|
| `colyn todo list` (default) | Tasks in `pending` status |
| `colyn todo list --in-progress` | Tasks in `in-progress` status |
| `colyn todo list --done` | Tasks in `done` status |
| `colyn todo list --archived` | Archived tasks (Local: archived-todo.json; GitHub: closed + archived label) |
| `colyn todo list --all` | All active tasks (pending + in-progress + done) |
| `colyn todo list --json` | Output in JSON format to stdout |
| `colyn todo list --json --done` | Output done tasks in JSON format |
| `colyn todo list --json --archived` | Output archived tasks in JSON format |

> ⚠️ **Breaking change**: The old `--completed` option has been renamed to `--done` to align with the new 4-state lifecycle.

**`colyn todo` (without subcommand) is equivalent to `colyn todo list`**.

**`--json` option**:

- Outputs the task list as a JSON array to stdout
- Can be combined with `--done`, `--in-progress`, `--archived`, or `--all`
- Mutually exclusive with `--id-only` (both are machine-readable formats)
- Archived tasks (`--archived`) output includes the `archivedAt` field

**Table output format** (without `--json`):

- Columns: Type / Name / Message / Created
- Message column shows only the **first line** of the message
- Type, Name, and Created columns auto-size to fit content; Message column fills remaining terminal width
- Message content is truncated with an ellipsis (`…`) when it exceeds the column width
- All column width calculations are CJK-aware (Chinese characters count as width 2)

### 5.4 `colyn todo remove [todoId] [-y]`

Remove a task from the active list. `todoId` is optional; when omitted, an interactive selection list is shown to pick the task to remove. `-y` skips the confirmation prompt.

### 5.5 `colyn todo archive [-y]`

Batch archive all `done` tasks, removing them from the active list. `-y` skips the confirmation prompt.

- **Local backend**: Moves `done` tasks into `archived-todo.json` and removes them from `todo.json`
- **GitHub backend**: Applies the configured archived label to `done` Issues (if `todo.github.archivedLabel` is set); otherwise closed Issues are already considered archived

### 5.6 `colyn todo complete [todoId]`

Mark an `in-progress` task as `done`. `todoId` is optional:

- Without `todoId`: show an interactive list of in-progress tasks
- With `todoId`: execute directly on the specified task

On success:
1. **Local backend**: Set status to `done`
2. **GitHub backend**: Close the corresponding Issue

**Difference from `todo start`**:
- `todo complete` only updates task status from `in-progress` to `done`; it does not switch branch or copy clipboard
- `todo start` performs checkout and transitions the task from `pending` to `in-progress`, then outputs/copies the message

### 5.7 `colyn todo uncomplete [todoId]`

Revert a `done` task back to `in-progress`, clearing any completion records.

- **Local backend**: Updates status field; retains `startedAt` and `branch`
- **GitHub backend**: Reopens the corresponding Issue

If `todoId` is not specified, the current Worktree's branch name is used automatically (must be executed in a non-main-branch Worktree).

### 5.8 `colyn todo edit [todoId] [message]`

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

Additional notes:

- When you need a new worktree, use `colyn add [branch]`; no-argument mode can directly select todo branches and local branches.
- When reusing an existing worktree, use `colyn checkout [branch]`; no-argument mode also supports interactive selection.
- If a `pending` todo branch is selected in `add/checkout`, the command performs post-actions aligned with `todo start`: marks todo as `in-progress`, writes `startedAt/branch`, prints the message, and copies it to clipboard.
- The `pending` todo list shown in `add/checkout` interactive selection comes from the **current active backend** (local or github).

---

## 7. Todo Backend Architecture

### 7.1 Backend Interface

All todo operations are abstracted through a unified `TodoBackend` interface; different backends implement the same interface:

```typescript
interface TodoBackend {
  list(filter?: TodoStatusFilter): Promise<TodoItem[]>;
  add(item: Omit<TodoItem, 'createdAt'>): Promise<TodoItem>;
  updateStatus(id: string, status: TodoStatus): Promise<void>;
  remove(id: string): Promise<void>;
  archive(id: string): Promise<void>;
}
```

### 7.2 Supported Backends

| Backend | Config value | Data source | Prerequisites |
|---------|-------------|-------------|--------------|
| Local (default) | `'local'` | `.colyn/todo.json` | None |
| GitHub Issues | `'github'` | GitHub Issues API | `gh` CLI installed and authenticated; project origin is a github.com repository |

### 7.3 Backend Configuration

Configured in `.colyn/settings.json` (all fields are project-level; not supported in global config):

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

| Config key | Type | Default | Description |
|-----------|------|---------|-------------|
| `todo.backend` | `'local' \| 'github'` | `'local'` | Active backend type |
| `todo.autoArchive` | `boolean` | `false` | Auto-archive done tasks |
| `todo.github.archivedLabel` | `string` | unset | GitHub archived label name; when unset, all closed Issues are treated as archived |
| `todo.github.typeLabels` | `Record<string, string>` | built-in mapping | type → GitHub label mapping; **must be edited manually in settings.json; not supported via `config set`** |

**Configurable via `config set`**: `todo.backend`, `todo.autoArchive`, `todo.github.archivedLabel`

**Manual edit only**: `todo.github.typeLabels` (complex map structure; not suitable for CLI interaction)

### 7.4 GitHub Status Mapping

| Colyn status | GitHub Issue state |
|-------------|-------------------|
| `pending` | open, with no matching branch in the repository |
| `in-progress` | open, with a matching branch (`{type}/{issue-number}`) in the repository |
| `done` | closed (without archived label) |
| `archived` | closed + archived label (if configured); or all closed (if `archivedLabel` is not configured) |

**remove operation**: Closes the Issue and adds a `wontfix` label (GitHub does not physically delete Issues).

---

## 8. Output Convention

All user-visible messages are written to **stderr**, following the project's dual-layer architecture.

---

## 9. File Organization

```
src/
├── commands/
│   ├── todo.ts             # Command registration and all subcommand implementations
│   └── todo.helpers.ts     # Editor, clipboard, table formatting, interactive select
└── todo-backend/
    ├── types.ts            # TodoItem, TodoStatus, TodoBackend interface definitions
    ├── registry.ts         # Backend provider registration and dispatch
    ├── local/
    │   └── index.ts        # LocalFileBackend implementation
    └── github/
        ├── index.ts        # GitHubIssuesBackend implementation
        └── gh.ts           # Thin wrapper around the gh CLI
```

Key exports from `todo.helpers.ts`:

| Function | Description |
|----------|-------------|
| `parseTodoId` | Parse `type/name` format |
| `findTodo` | Find a todo item in the list |
| `editMessageWithEditor` | Open editor to interactively edit message |
| `copyToClipboard` | Copy text to system clipboard |
| `formatTodoTable` | Format table output (CJK-aware width) |
| `selectTodo` | Interactive task selection with preview (actually called by subcommands) |
