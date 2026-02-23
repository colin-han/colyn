# Command Reference — Branch & Status

[← Back to Command Reference](README.md)

---

## colyn checkout

Switch or create branches in a Worktree.

### Syntax

```bash
colyn checkout [worktree-id] <branch> [options]

# Alias
colyn co [worktree-id] <branch> [options]
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `worktree-id` | No | The Worktree ID; uses current worktree if omitted |
| `branch` | Yes | Target branch name |

### Options

| Option | Description |
|--------|-------------|
| `--no-fetch` | Skip fetching branch information from remote |

### Description

`colyn checkout` allows switching branches within a worktree, reusing existing worktrees for development on different branches.

If you need a new worktree, use `colyn add [branch]` (`branch` can be omitted for interactive selection).

**Pre-checks:**
- Has uncommitted changes → Reject switch
- Current branch not merged to main branch → Warn and require confirmation
- Target branch is main branch → Reject switch
- Target branch already in use by another worktree → Reject switch

**Branch handling:**
1. Local branch exists → Switch directly
2. Remote branch exists → Automatically create local branch tracking remote
3. Branch doesn't exist → Automatically create new branch

**Log archiving:**
- After successful switch, automatically archives current branch work logs to `.claude/logs/archived/<old-branch-name>/`

**Old branch cleanup:**
- If old branch has been merged to main, prompts user whether to delete it

**tmux integration:**
- In tmux, automatically updates window name to new branch name
- If using iTerm2, automatically updates tab title

### Examples

**Switch branch in current worktree:**

```bash
$ cd worktrees/task-1
$ colyn checkout feature/new-login
# Or using alias
$ colyn co feature/new-login
```

**Switch branch by specifying worktree ID:**

```bash
$ colyn checkout 1 feature/new-login
$ colyn co 1 feature/new-login
```

**Skip remote fetch:**

```bash
$ colyn checkout feature/test --no-fetch
```

### Result (old branch already merged)

```
✓ Switched to branch feature/new-login

✓ Branch feature/old has been merged to main branch
? Delete old branch feature/old? (Y/n) y
✓ Deleted branch feature/old

Logs archived to: .claude/logs/archived/feature-old/

📂 Switched to: /path/to/worktrees/task-1
```

### Common Errors

| Error Scenario | Error Message | Solution |
|---------------|---------------|----------|
| Has uncommitted changes | `✗ Worktree has uncommitted changes` | Commit changes or use `git stash` |
| Target branch already in use | `✗ Branch already in use by another worktree` | Switch to the corresponding worktree, or use a different branch name |
| Target is main branch | `✗ Cannot switch to main branch in worktree` | Use the main branch directory directly |

### Tips

- Existing worktrees can be reused for development on different branches
- Automatically archives log files under `.claude/logs/` directory before switching
- After a successful fetch, main branch is auto-updated if it's behind remote
- Merged old branches can optionally be deleted

---

## colyn info

Show project information for the current directory.

### Syntax

```bash
colyn info [options]
```

### Options

| Option | Short | Description |
|--------|-------|-------------|
| `--short` | `-S` | Output short identifier (with branch info), supports graceful degradation |
| `--field=<name>` | `-f <name>` | Output specified field (can be used multiple times) |
| `--format=<template>` | - | Format output using a template string |
| `--separator=<char>` | `-s <char>` | Separator for multiple fields (default: tab) |

### Available Fields

| Field Name | Description | Example Value |
|-----------|-------------|---------------|
| `project` | Main directory name | `myapp` |
| `project-path` | Main directory full path | `/Users/me/work/myapp/myapp` |
| `worktree-id` | Worktree ID (0 for main branch) | `1` |
| `worktree-dir` | Worktree directory name | `task-1` |
| `worktree-path` | Worktree directory full path | `/Users/me/work/myapp/worktrees/task-1` |
| `branch` | Current branch name | `feature/login` |
| `status` | Workflow status (`idle`/`running`/`waiting-confirm`/`finish`) | `running` |
| `last-updated-at` | Status last updated time (ISO 8601, empty string if never set) | `2026-02-22T10:00:00.000Z` |

### Description

`colyn info` supports multiple output formats for different use cases:

#### 1. Short Identifier (`--short`)
- Output format: `{project}/{worktree-dir} (⎇ {branch})`
- Supports smart degradation: Colyn project → Git repo → Regular directory
- Recommended for shell prompts

#### 2. Full Info (default)
- Shows all fields with colors and icons
- Convenient for human review

#### 3. Field Output (`--field`)
- Outputs plain text, suitable for scripts
- Can specify multiple fields

#### 4. Template Format (`--format`)
- Uses `{field-name}` placeholders
- Flexible custom formatting

### Examples

**Show full info (default):**

```bash
$ colyn info
📁 Project:       myapp
📂 Project Path:  /Users/me/work/myapp/myapp
🔢 Worktree ID:   1
📁 Worktree Dir:  task-1
📂 Worktree Path: /Users/me/work/myapp/worktrees/task-1
🌿 Branch:        feature/login
⚡ Status:        running
📅 Last Updated:  2026-02-22 18:00:04
```

**Output short identifier (recommended for shell prompt):**

```bash
# In a colyn project
$ colyn info --short
myapp/task-1 (⎇ feature/login)

# In a git repository (colyn not initialized)
$ colyn info --short
my-repo (⎇ main)

# In a non-git directory
$ colyn info --short
my-folder
```

**Using in shell prompt:**

```bash
# Add to .zshrc or .bashrc
PS1='[$(colyn info -S)] $ '

# Result
[myapp/task-1 (⎇ feature/login)] $
```

**Get a single field:**

```bash
$ colyn info -f branch
feature/login

$ colyn info -f status
running
```

**Get multiple fields:**

```bash
# Default tab separator
$ colyn info -f project -f branch
myapp	feature/login

# Custom separator
$ colyn info -f project -f branch -s "/"
myapp/feature/login
```

**Template string formatting:**

```bash
$ colyn info --format="{project}/{worktree-dir}"
myapp/task-1

$ colyn info --format="[{status}] {project}/{worktree-dir}"
[running] myapp/task-1
```

### Location Requirements

**Using `--short` option:**
- Supports running anywhere, with automatic degradation

**Using other options:**
- Must be executed in the main branch directory or a worktree directory
- Will report an error when executed elsewhere

### Common Errors

| Error Scenario | Error Message | Solution |
|---------------|---------------|----------|
| Not in working directory | `✗ Current directory is not in a worktree or main branch` | Switch to main branch directory or worktree directory |
| Invalid field name | `✗ Invalid field name` | Use a correct field name |

### Tips

- `--short` option supports smart degradation, usable from any directory
- Suitable for integration into shell prompts, terminal titles, or log prefixes
- `status` and `last-updated-at` fields work with `colyn status set` to track workflow progress

---

## colyn status

Query or set the workflow status of the current Worktree.

### Syntax

```bash
colyn status [get] [--json]
colyn status set <status>
```

- `get` is an optional subcommand; `colyn status` and `colyn status get` are equivalent
- Alias: `st`

### Subcommands

#### `colyn status get` (default)

Get the workflow status of the current Worktree.

| Option | Description |
|--------|-------------|
| `--json` | Output in JSON format |

#### `colyn status set <status>`

Set the workflow status of the current Worktree.

| Parameter | Description |
|-----------|-------------|
| `<status>` | Status value: `idle` \| `running` \| `waiting-confirm` \| `finish` |

### Status Values

| Status Value | Meaning |
|-------------|---------|
| `idle` | Idle, no task in progress |
| `running` | Running, Claude is processing a task |
| `waiting-confirm` | Waiting for user confirmation |
| `finish` | Completed, waiting to be merged |

### Examples

**Query status (human-readable):**

```bash
$ colyn status
Status:   running
Updated:  2026-02-22 18:00:04
```

**When never set:**

```bash
$ colyn status
Status:   idle
Updated:  (never set)
```

**JSON format output:**

```bash
$ colyn status --json
{"worktreeDir":"task-1","worktreeId":1,"status":"running","updatedAt":"2026-02-22T10:00:04.000Z"}

$ colyn status get --json
{"worktreeDir":"task-1","worktreeId":1,"status":"running","updatedAt":"2026-02-22T10:00:04.000Z"}
```

**Set status:**

```bash
$ colyn status set running
✓ Status updated: running

$ colyn status set finish
✓ Status updated: finish

$ colyn status set invalid
✗ Invalid status value: invalid
  Valid statuses: idle, running, waiting-confirm, finish
```

### Auto-reset

The following commands will automatically reset the corresponding Worktree status to `idle` after successful execution:

- `colyn add`: After creating a new Worktree
- `colyn checkout`: After switching branch
- `colyn merge`: After merging to main branch

### Status Files

Status is persisted to the following two files:

| File | Description |
|------|-------------|
| `{projectRoot}/.colyn/status.json` | Project-level status (status of each Worktree) |
| `~/.colyn-status.json` | Global index (records project paths with active status) |

### Relationship with colyn info

`colyn info` reads the status files and provides `status` and `last-updated-at` fields:

```bash
$ colyn info -f status
running

$ colyn info --format="[{status}] {project}/{worktree-dir}"
[running] myapp/task-1
```

### Common Errors

| Error Scenario | Error Message | Solution |
|---------------|---------------|----------|
| Not in a colyn project | `✗ Current directory is not a colyn project` | Switch to a colyn project directory |
| Invalid status value | `✗ Invalid status value: xxx` | Use a valid status value |
