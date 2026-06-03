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
| `--no-build` | Skip lint and build steps (for releases already validated in CI or hotfixes) |
| `--no-version-update` | Skip reading/bumping the version, commit, and tag; push the current branch only |
| `--no-tag` | Skip git tag creation while still bumping the version and pushing the branch |
| `--verbose` / `-v` | Show full command output for install/lint/build (on failure) |
| `--no-verbose` | Disable verbose output (opposite of `--verbose`) |

### Description

`colyn release` provides a unified release entry point. Regardless of which directory it's executed from, it always completes the release in the main branch and by default automatically syncs the latest code to all worktrees.

**Execution flow:**
1. Check current directory for uncommitted code
2. Check if current branch is merged (only when executing from a worktree)
3. Check git status (main branch)
4. Install dependencies, run lint and build (driven by toolchain plugins: executed only when the project has the corresponding plugin configured, skipped otherwise; lint and build can additionally be skipped via `--no-build`)
5. Update package.json version
6. Create commit and tag
7. Push to remote
8. **Auto-update all worktrees (unless `--no-update` is used)**

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

# Skip lint and build (already validated in CI)
$ colyn release patch --no-build

# Push the current branch only — no version bump, no tag (e.g. to trigger a deploy pipeline)
$ colyn release --no-version-update

# Bump version and push branch but skip tag (CI owns tagging)
$ colyn release patch --no-tag
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
- Package manager command is configured via `colyn config set systemCommands.npm <command>` (default `npm`)
- Auto-updates all worktrees by default, ensuring all development branches are based on the latest version

---

## colyn update

Update worktrees with the latest main branch code. **Updates all worktrees by default.**

### Syntax

```bash
colyn update [target] [options]
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `target` | No | Supports:<br>- Number: look up by ID (e.g. `1`)<br>- Branch name: look up by branch (e.g. `feature/login`)<br>- Omitted: update **all** worktrees by default |

### Options

All toggle options come in positive / negative forms. Defaults can be overridden via `commands.update.*` in `.colyn/settings.json` (see the configuration manual).

| Option | Default | Description |
|--------|---------|-------------|
| `--rebase` / `--no-rebase` | `--rebase` | Use rebase to update; `--no-rebase` uses merge instead |
| `--fetch` / `--no-fetch` | `--fetch` | Whether to fetch the latest main branch from remote before updating |
| `--all` / `--no-all` (alias `--current-only`) | `--all` | Update scope: all worktrees or only the current one |

### Description

`colyn update` syncs worktrees with the latest main branch code:

- By default, first `fetch` the latest main branch from remote (`--no-fetch` skips this)
- By default, use `rebase` to apply main branch code onto the worktree branch (`--no-rebase` uses merge)
- **When no `target` is given, updates all worktrees by default**; specifying a `target` (ID or branch name) or using `--current-only` updates only that single worktree

> Relationship with `colyn merge`: after a merge completes, the same update flow runs automatically (see "Step 3" of `colyn merge`).

### Examples

```bash
# Update all worktrees (default)
$ colyn update

# Update only the current worktree
$ colyn update --current-only

# Update a specific worktree by ID
$ colyn update 1

# Update by branch name
$ colyn update feature/login

# Skip fetch (offline scenario)
$ colyn update --no-fetch
```

---

## colyn todo

Manage the project's Todo task list, deeply integrated with the Parallel Vibe Coding workflow. Supports both local file (default) and GitHub Issues backends.

### Syntax

```bash
colyn todo [subcommand] [options]
```

Without a subcommand, equivalent to `colyn todo list`, showing all pending tasks.

### Subcommands

| Subcommand | Description |
|-----------|-------------|
| `add [todoId] [message...]` | Add a Todo task |
| `start [todoId]` | Start a task (switch branch + copy description to clipboard; sets status to in-progress) |
| `list` / `ls` | List tasks (shows pending by default) |
| `edit [todoId] [message]` | Edit a Todo task's description |
| `remove [todoId]` | Delete a task (interactive selection if omitted) |
| `archive` | Archive all done tasks |
| `complete [todoId]` | Mark an in-progress task as done |
| `uncomplete [todoId]` | Revert a done task to in-progress |

### Todo Lifecycle

```
pending → in-progress → done → archived
```

| Status | Description |
|--------|-------------|
| `pending` | Waiting to start |
| `in-progress` | Branch created, work underway |
| `done` | Development complete |
| `archived` | Archived, removed from the active list |

### Todo ID Format

**Local backend** (default): Todo IDs use the `{type}/{name}` format, matching Git branch names:

```
feature/login
bugfix/fix-crash
refactor/auth-module
document/api-guide
```

**GitHub backend**: Todo IDs use the `{type}/{issue-number}` format; the number is auto-assigned by GitHub:

```
feature/42
bugfix/17
```

**Supported types**: `feature` / `bugfix` / `refactor` / `document`

---

### colyn todo add

Add a new pending task. All parameters are optional; entering with no arguments enters fully interactive mode.

#### Syntax

```bash
colyn todo add [todoId] [message...]
```

#### Parameters

| Parameter | Description |
|-----------|-------------|
| `todoId` | Todo ID (format: `type/name`); interactive selection if omitted; GitHub backend: `name` is auto-assigned from Issue number |
| `message...` | Task description; may contain spaces without quotes (multiple words are joined automatically); opens editor if omitted (supports Markdown); GitHub backend: first line becomes Issue title |

#### Examples

```bash
# Fully interactive (select type → enter name → editor for description)
$ colyn todo add

# Specify ID, enter description via editor (local backend)
$ colyn todo add feature/login

# Specify everything directly (local backend, description in quotes)
$ colyn todo add feature/login "Implement user login feature"

# The description can also be unquoted; multiple words are joined automatically
$ colyn todo add feature/login Implement user login feature

# GitHub backend: select type, Issue number auto-assigned
$ colyn todo add
? Select task type › feature
(editor opens for description, first line becomes Issue title)
✓ Todo created: feature/42
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

1. If `todoId` is not specified, fetch `pending` tasks from the current active backend for interactive selection; exit if no pending tasks
2. Switch to the corresponding branch in the current Worktree (create if it doesn't exist)
3. Mark the todo status as `in-progress`
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

✓ Todo "feature/login" is now in-progress

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
| `--in-progress` | Show in-progress tasks |
| `--done` | Show done tasks |
| `--archived` | Show archived tasks |
| `--all` | Show all active tasks (pending + in-progress + done) |
| `--id-only` | Output Todo IDs only (one per line), for script integration |
| `--json` | Output task list in JSON format |

> Note: The old `--completed` option has been renamed to `--done`.

#### Examples

```bash
# Show pending tasks (default)
$ colyn todo
  Type     Name       Message                    Created
  -------------------------------------------------------
  feature  login      Implement user login...    2026/02/22 10:00
  bugfix   fix-crash  Fix application crash      2026/02/22 11:30

# Show in-progress tasks
$ colyn todo list --in-progress

# Show done tasks
$ colyn todo list --done

# Show all active tasks
$ colyn todo list --all

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

# Output done tasks in JSON format
$ colyn todo list --json --done

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

Batch archive all tasks with `done` status, removing them from the active list.

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

Revert a task from `done` status to `in-progress`. When `todoId` is omitted, automatically uses the current Worktree's branch name.

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
✓ Todo "feature/login" reverted to in-progress

# Explicitly specify ID
$ colyn todo uncomplete feature/login
✓ Todo "feature/login" reverted to in-progress
```

---

### colyn todo complete

Mark a task in `in-progress` status as `done`. If `todoId` is omitted, select an in-progress task interactively.

#### Syntax

```bash
colyn todo complete [todoId]
```

#### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `todoId` | No | Todo ID to mark as done; interactive selection of in-progress tasks if omitted |

#### Examples

```bash
# Interactively select an in-progress task
$ colyn todo complete
? Select a task to complete
❯ feature/login
  bugfix/fix-crash
✓ Todo "feature/login" marked as done

# Explicitly specify ID
$ colyn todo complete feature/login
✓ Todo "feature/login" marked as done
```

---

### Data Storage

**Local backend (default)**:

| File | Description |
|------|-------------|
| `.colyn/todo.json` | All active Todos (pending + in-progress + done) |
| `.colyn/archived-todo.json` | Archived Todos |

**GitHub backend**: Data is stored in GitHub Issues. The system reads and writes in real time via the `gh` CLI; no local cache is kept.

All Worktrees share the same todo data.

### GitHub Issues Integration

Colyn Todo supports GitHub Issues as a task data source, enabling two-way sync with GitHub project management.

#### Prerequisites

- GitHub CLI (`gh`) installed: macOS users can run `brew install gh`; see [cli.github.com](https://cli.github.com) for other platforms
- Authenticated: `gh auth login`
- Project origin is a GitHub repository (the `origin` URL contains `github.com`)

#### Enabling GitHub Backend

**Option 1**: Select GitHub Issues backend during `colyn init` (recommended; auto-detected and guided)

**Option 2**: Configure manually

```bash
colyn config set todo.backend github
```

#### GitHub Status Mapping

| Colyn status | GitHub Issue state |
|-------------|-------------------|
| `pending` | open, no matching branch |
| `in-progress` | open, matching branch exists |
| `done` | closed |
| `archived` | closed + archived label (if configured) |

#### Todo Backend Configuration

```bash
# Switch backend
colyn config set todo.backend github   # use GitHub Issues
colyn config set todo.backend local    # use local file (default)

# Auto-archive done tasks
colyn config set todo.autoArchive true

# Set archived label (distinguishes done from archived in GitHub backend)
colyn config set todo.github.archivedLabel archived
```

`todo.github.typeLabels` (type↔label mapping) must be edited manually in `.colyn/settings.json`:

```json
{
  "todo": {
    "github": {
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

### Recommended Workflow

```bash
# 1. Plan tasks
colyn todo add feature/login "Implement user login feature"
colyn todo add feature/dashboard "Implement data dashboard"

# 2. View pending tasks
colyn todo list

# 3. Start task (switch branch and get task context; sets status to in-progress)
colyn todo start feature/login
# → Paste task description into Claude Code input box

# 4. Mark done after development
colyn todo complete feature/login

# 5. Merge the branch
colyn merge feature/login

# 6. Archive done tasks (optional)
colyn todo archive -y
```

### Common Errors

| Error Scenario | Error Message | Solution |
|---------------|---------------|----------|
| Invalid Todo ID format | `✗ Invalid Todo ID format, should be {type}/{name}` | Use correct format, e.g., `feature/login` |
| Todo doesn't exist | `✗ Todo "xxx" does not exist` | Add it with `todo add` first, or check with `colyn todo list` |
| Todo not in pending status | `✗ Todo "xxx" is not in pending status` | Check current status; use `uncomplete` to revert to in-progress first if needed |
| Todo not in in-progress status | `✗ Todo "xxx" is not in in-progress status` | Use `todo start` to set the task to in-progress first |
| Duplicate addition (local) | `✗ Todo "xxx" already exists` | Each type/name can only be added once |
| gh not installed (GitHub backend) | `✗ gh CLI is not installed` | Run `brew install gh` or visit cli.github.com |
| gh not authenticated (GitHub backend) | `✗ Not logged in to GitHub` | Run `gh auth login` |

### Tips

- `colyn todo` without any arguments shows the pending list — the most common usage
- `todo start` executes the full `colyn checkout` flow (uncommitted check, remote fetch, log archiving, etc.) and sets status to `in-progress`
- `todo complete` only updates task status (in-progress → done); it does not trigger branch switching or clipboard copy
- For creating a new worktree, use `colyn add [branch]`; without `branch`, choose interactively (new branch / todo branch / local branch)
- For reusing an existing worktree, use `colyn checkout [branch]`; without `branch`, also choose interactively
- When selecting a todo branch via `add/checkout` interactive mode, it behaves like `todo start`: prints message, copies to clipboard, and marks the todo as `in-progress`
- Descriptions (message) support full Markdown syntax, which helps provide clear context in Claude sessions
- Regularly run `colyn todo archive -y` to keep the active list clean
- Set the `$EDITOR` environment variable to use your preferred editor for editing descriptions
