# Command Reference — Workflow Tools

[← Back to Command Reference](README.md)

---

## colyn release

Publish a new version.

### Syntax

```bash
colyn release [version-type] [options]
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `version-type` | No | Version type or explicit version number (default: `patch`):<br>- `patch` / `minor` / `major`<br>- Explicit version: `1.2.3` |

### Options

| Option | Description |
|--------|-------------|
| `--no-update` | Skip auto-updating all worktrees after release |
| `--verbose` / `-v` | Show full command output for install/lint/build (on failure) |

### Description

`colyn release` provides a unified release entry point. Regardless of which directory it's executed from, it always completes the release in the main branch and by default automatically syncs the latest code to all worktrees.

**Execution flow:**
1. Check current directory for uncommitted code
2. Check if current branch is merged (only when executing from a worktree)
3. Check git status (main branch)
4. Install dependencies (using the configured package manager command)
5. Run lint and build
6. Update package.json version
7. Create commit and tag
8. Push to remote
9. **Auto-update all worktrees (unless `--no-update` is used)**

### Location Rules

- Must be executed inside a project directory (main branch or any Worktree directory)
- Not allowed to execute outside project directories
- Actual execution path is always the main branch directory

### Examples

```bash
# Quick release patch version (most common)
$ colyn release
✓ Released v1.2.4 successfully
Updating all worktrees...
✓ All worktrees updated

# Release from within a worktree
$ cd worktrees/task-1
$ colyn release patch

# Release minor version from main branch
$ cd my-project
$ colyn release minor

# Release a specific version number
$ colyn release 1.2.3

# Release without auto-updating worktrees
$ colyn release --no-update
```

### Common Errors

| Error Scenario | Error Message | Solution |
|---------------|---------------|----------|
| Executed outside project | `✗ Current directory does not belong to a Colyn project` | Execute inside a project directory |
| Current directory has uncommitted code | `✗ Current directory has uncommitted changes` | Commit or stash changes |
| Current branch not merged | `✗ Branch not merged into main branch` | Merge branch first: `colyn merge <branch>` |

### Tips

- **Most common usage**: Just run `colyn release` to release a patch version
- No need to manually switch to the main branch directory
- Package manager command is configured via `colyn config set npm <command>` (default `npm`)
- Auto-updates all worktrees by default, ensuring all development branches are based on the latest version

---

## colyn todo

Manage the project's Todo task list, deeply integrated with the Parallel Vibe Coding workflow.

### Syntax

```bash
colyn todo [subcommand] [options]
```

Without a subcommand, equivalent to `colyn todo list`, showing all pending tasks.

### Subcommands

| Subcommand | Description |
|-----------|-------------|
| `add [todoId] [message]` | Add a Todo task |
| `start [todoId]` | Start a task (switch branch + copy description to clipboard) |
| `list` / `ls` | List tasks (shows pending by default) |
| `edit [todoId] [message]` | Edit a Todo task's description |
| `remove [todoId]` | Delete a task (interactive selection if omitted) |
| `archive` | Archive all completed tasks |
| `complete [todoId]` | Mark a pending task as completed |
| `uncomplete [todoId]` | Revert a completed task to pending |

### Todo ID Format

Todo IDs use the `{type}/{name}` format, matching Git branch names:

```
feature/login
bugfix/fix-crash
refactor/auth-module
document/api-guide
```

**Supported types**: `feature` / `bugfix` / `refactor` / `document`

---

### colyn todo add

Add a new pending task. All parameters are optional; entering with no arguments enters fully interactive mode.

#### Syntax

```bash
colyn todo add [todoId] [message]
```

#### Parameters

| Parameter | Description |
|-----------|-------------|
| `todoId` | Todo ID (format: `type/name`); interactive selection if omitted |
| `message` | Task description; opens editor if omitted (supports Markdown) |

#### Examples

```bash
# Fully interactive (select type → enter name → editor for description)
$ colyn todo add

# Specify ID, enter description via editor
$ colyn todo add feature/login

# Specify everything directly
$ colyn todo add feature/login "Implement user login feature"
```

#### Editor Notes

When no `message` argument is provided, automatically opens an editor (prefers `$VISUAL`, then `$EDITOR`, defaults to `vim`). Lines starting with `# ` are comments and are automatically filtered after saving. File format is `.md`, supporting Markdown syntax.

---

### colyn todo start

Start a pending task: switch/create the corresponding branch in the current Worktree and copy the task description to the clipboard.

#### Syntax

```bash
colyn todo start [options] [todoId]
```

`todoId` is an optional parameter. When not specified, all pending tasks are shown interactively for selection.

#### Options

| Option | Description |
|--------|-------------|
| `--no-clipboard` | Skip copying description to clipboard |

#### Execution Flow

1. If `todoId` is not specified, list all `pending` tasks for interactive selection; exit if no pending tasks
2. Switch to the `{type}/{name}` branch in the current Worktree (create if it doesn't exist)
3. Mark the todo status as `completed`
4. Output task description (message) to terminal
5. Copy task description to clipboard (supports macOS / Linux / Windows)

#### Examples

```bash
# Without arguments: interactively select a pending task
$ colyn todo start
? Select a task to start ›
❯ feature/login    Implement user login feature, supports email and phone...
  bugfix/fix-crash  Fix application crash issue

# Directly specify task ID
$ colyn todo start feature/login

✓ Todo "feature/login" marked as completed

Task description:
Implement user login feature, supports both email and phone number
- Add login form
- Validate user credentials

✓ Copied to clipboard

# Skip clipboard operation
$ colyn todo start feature/login --no-clipboard
```

**Interactive selection notes:**
- Each row shows only the first line of the message, auto-truncated to terminal width
- When a row is selected, the first 4 lines of that task's message are shown as a preview below the list

**Typical workflow**: After `todo start`, open Claude Code directly and paste the clipboard content into the input box as task context for the session.

---

### colyn todo list

List Todo tasks.

#### Syntax

```bash
colyn todo list [options]
colyn todo ls [options]
colyn todo           # Equivalent to this command when no subcommand given
```

#### Options

| Option | Description |
|--------|-------------|
| `--completed` | Show completed (`completed`) tasks |
| `--archived` | Show archived tasks |
| `--id-only` | Output Todo IDs only (one per line), for script integration |
| `--json` | Output task list in JSON format |

#### Examples

```bash
# Show pending tasks (default)
$ colyn todo
  Type     Name       Message                    Status   Created
  ---------------------------------------------------------------
  feature  login      Implement user login...    pending  2026/02/22 10:00
  bugfix   fix-crash  Fix application crash      pending  2026/02/22 11:30

# Show completed tasks
$ colyn todo list --completed

# Output IDs only (for scripts)
$ colyn todo list --id-only
feature/login
bugfix/fix-crash

# Output in JSON format (for script integration)
$ colyn todo list --json
[
  {
    "type": "feature",
    "name": "login",
    "message": "Implement user login",
    "status": "pending",
    "createdAt": "2026-02-22T10:00:00.000Z"
  }
]

# Output completed tasks in JSON format
$ colyn todo list --json --completed

# Output archived tasks in JSON format (includes archivedAt field)
$ colyn todo list --json --archived
```

---

### colyn todo edit

Edit the description of an existing Todo task.

#### Syntax

```bash
colyn todo edit [todoId] [message]
```

#### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `todoId` | No | Format is `{type}/{name}`; interactive selection if omitted |
| `message` | No | New description text; opens `$EDITOR` (default vim) if omitted |

#### Behavior

- No `todoId`: Shows interactive selection list for all Todos
- No `message`: Opens editor via `$VISUAL` / `$EDITOR` / `vim`
- Todo is completed (`completed`): Ask if it should be changed back to `pending`; exits if declined

#### Examples

```bash
# Specify todoId and new description directly
$ colyn todo edit feature/login "Optimize user login UI and authentication flow"
✓ Description of Todo "feature/login" updated

# Specify only todoId, edit with editor
$ colyn todo edit feature/login

# Specify neither, interactively select then edit
$ colyn todo edit
? Please select a Todo task to edit
❯ feature/login  (pending: Implement user login feature)
```

---

### colyn todo remove

Delete a Todo task.

#### Syntax

```bash
colyn todo remove [todoId] [options]
```

#### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `todoId` | No | Todo ID to delete; interactive selection if omitted |

#### Options

| Option | Short | Description |
|--------|-------|-------------|
| `--yes` | `-y` | Skip confirmation and delete directly |

#### Examples

```bash
# Interactively select task to delete
$ colyn todo remove
? Select a task to delete
❯ feature/login  (pending)
  bugfix/crash   (pending)

# Delete specified task directly
$ colyn todo remove feature/login
? Confirm delete Todo "feature/login"? (y/N) y
✓ Deleted Todo: feature/login

# Skip confirmation and delete directly
$ colyn todo remove feature/login -y
✓ Deleted Todo: feature/login
```

---

### colyn todo archive

Batch archive all tasks with `completed` status, moving them to `.colyn/archived-todo.json`.

#### Syntax

```bash
colyn todo archive [options]
```

#### Options

| Option | Short | Description |
|--------|-------|-------------|
| `--yes` | `-y` | Skip confirmation and archive directly |

#### Examples

```bash
# Interactive confirmation for archiving
$ colyn todo archive
? Confirm archiving 3 completed tasks? (Y/n)

# Archive directly (no confirmation)
$ colyn todo archive -y
✓ Archived 3 tasks
```

---

### colyn todo uncomplete

Revert a task from `completed` status to `pending` (clears `startedAt` and `branch` records). When `todoId` is omitted, automatically uses the current Worktree's branch name.

#### Syntax

```bash
colyn todo uncomplete [todoId]
```

#### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `todoId` | No | Todo ID to revert; uses current branch name if omitted |

#### Examples

```bash
# Execute directly in feature/login Worktree (auto-inferred)
$ colyn todo uncomplete
ℹ Using current branch name: feature/login
✓ Todo "feature/login" reverted to pending status

# Explicitly specify ID
$ colyn todo uncomplete feature/login
✓ Todo "feature/login" reverted to pending status
```

---

### colyn todo complete

Mark a task in `pending` status as `completed`. If `todoId` is omitted, select a pending task interactively.

#### Syntax

```bash
colyn todo complete [todoId]
```

#### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `todoId` | No | Todo ID to mark as completed; interactive selection if omitted |

#### Examples

```bash
# Interactively select a pending task
$ colyn todo complete
? Select a task to complete
❯ feature/login
  bugfix/fix-crash
✓ Todo "feature/login" marked as completed

# Explicitly specify ID
$ colyn todo complete feature/login
✓ Todo "feature/login" marked as completed
```

---

### Data Storage

| File | Description |
|------|-------------|
| `.colyn/todo.json` | All active Todos (pending + completed) |
| `.colyn/archived-todo.json` | Archived Todos |

All Worktrees share the same todo data.

### Recommended Workflow

```bash
# 1. Plan tasks
colyn todo add feature/login "Implement user login feature"
colyn todo add feature/dashboard "Implement data dashboard"

# 2. View pending tasks
colyn todo list

# 3. Start task (switch branch and get task context)
colyn todo start feature/login
# → Paste task description into Claude Code input box

# 4. Merge after development is complete
colyn merge feature/login

# 5. Archive completed tasks
colyn todo archive -y
```

### Common Errors

| Error Scenario | Error Message | Solution |
|---------------|---------------|----------|
| Invalid Todo ID format | `✗ Invalid Todo ID format, should be {type}/{name}` | Use correct format, e.g., `feature/login` |
| Todo doesn't exist | `✗ Todo "xxx" does not exist` | Add it with `todo add` first, or check with `colyn todo list` |
| Todo not in pending status | `✗ Todo "xxx" is not in pending status` | Use `colyn todo uncomplete` to revert before starting |
| Duplicate addition | `✗ Todo "xxx" already exists` | Each type/name can only be added once |

### Tips

- `colyn todo` without any arguments shows the pending list — the most common usage
- `todo start` executes the full `colyn checkout` flow, including uncommitted check, remote fetch, log archiving, etc.
- For creating a new worktree, use `colyn add [branch]`; without `branch`, you can choose interactively (new branch / todo branch / local branch)
- For reusing an existing worktree, use `colyn checkout [branch]`; without `branch`, you can also choose interactively (new branch / todo branch / local branch)
- When selecting a todo branch via `add/checkout` interactive mode, it behaves like `todo start`: prints message, copies to clipboard, and marks the todo completed
- `todo complete` only updates task status and does not trigger branch switching or clipboard copy
- Descriptions (message) support full Markdown syntax, which helps provide clear context in Claude sessions
- Regularly run `colyn todo archive -y` to keep the pending list clean
- Set the `$EDITOR` environment variable to use your preferred editor for editing descriptions
