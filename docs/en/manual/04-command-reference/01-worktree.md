# Command Reference — Worktree Management

[← Back to Command Reference](README.md)

---

## Global Options

All Colyn commands support the following global options:

### `-C, --no-color`

Disable colored output.

**Use cases:**
- Running in CI/CD environments
- Redirecting output to a file
- Terminal does not support color
- Need plain text output for script parsing

**Examples:**
```bash
colyn list --no-color           # List worktrees (no color)
colyn info --short -C           # Show project info (no color)
colyn checkout feature/test -C  # Switch branch (no color)
```

---

## colyn init

Initialize Worktree management structure.

### Syntax

```bash
colyn init [options]
```

### Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--port <port>` | `-p` | Main branch dev server port | 10000 |
| `--yes` | `-y` | Skip confirmation in "existing project" scenario | No |

### Description

`colyn init` adopts different initialization strategies depending on the current directory state:

#### 1. Empty Directory
- Creates main branch directory, worktrees directory, and config directory
- Configures environment variable files
- Prompts user to initialize project in main branch directory

#### 2. Existing Project
- Shows current file list and asks for user confirmation
- Creates directory structure and moves all files to main branch directory
- If it's a git repository, working directory must be clean
- Configures environment variables and .gitignore
- **Automatically detects toolchain plugins** (npm / Maven / Gradle / pip) and writes to `.colyn/settings.json`
- Runs initialization based on detected plugins (writes toolchain config, installs dependencies, etc.)

#### 3. Already Initialized Project (Completion Mode)
- Detects missing parts and fills them in
- Will not overwrite existing configuration
- Smart merge of environment variables

### Examples

```bash
# Interactive port prompt
$ colyn init
? Enter main branch dev server port: (10000)

# Specify port directly
$ colyn init --port 10000
$ colyn init -p 3000

# Non-interactive (CI/scripts) - recommended to specify --port and --yes together
$ colyn init -p 3000 --yes
```

### Result

Directory structure after initialization:

```
my-project/                 # Project root directory
├── my-project/             # Main branch directory
│   ├── .git/              # Git repository (if git project)
│   ├── src/               # Source code
│   ├── .env.local         # PORT=10000, WORKTREE=main
│   ├── .gitignore         # Includes .env.local ignore rule
│   └── ...                # Other project files
├── worktrees/             # Worktree directory (initially empty)
└── .colyn/                # Colyn config directory
    └── settings.json      # Project config (includes plugins field)
```

### Common Errors

| Error Scenario | Error Message | Solution |
|---------------|---------------|----------|
| Working directory not clean | `✗ Working directory is not clean, uncommitted changes exist` | Run `git add .` and `git commit`, or `git stash` |
| Directory name conflict | `✗ Main branch directory name conflicts with existing file` | Rename or delete the file with the same name as the main branch directory |
| Invalid port number | `✗ Invalid port number` | Enter a port number between 1-65535 |

### Tips

- Initialization is a prerequisite for all other Colyn commands
- Port number can be changed anytime in main branch directory's `.env.local`
- Completion mode only adds missing parts, will not overwrite existing configuration
- In non-interactive environments, explicitly pass `--port`; for existing projects, use with `--yes`

---

## colyn add

Create a new Worktree for the specified branch. The `branch` parameter is optional; if omitted, an interactive selector is shown.

### Syntax

```bash
colyn add [branch]
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `branch` | No | Branch name (supports local branch, remote branch, or new branch) |

### Description

`colyn add` has two entry modes:

1. **With `branch` argument**: execute directly with the provided branch
2. **Without `branch` argument**: open interactive selector in this order
   - `[Create new branch]` (default selected)
   - Branches from `pending` todos
   - Existing local branches (main branch excluded)

When creating a branch interactively, it first asks for `type`, then `name`, and combines them as `type/name`.

If you select a branch from a `pending` todo in the interactive list, `add` runs the same post-actions as `todo start` after success:
- Mark that todo as `completed`
- Print the todo message in the terminal
- Copy the message to the system clipboard

`colyn add` handles branches intelligently:

1. **Local branch exists** - Creates Worktree directly from the local branch
2. **Remote branch exists** - Automatically creates a local tracking branch
3. **Branch doesn't exist** - Creates a new branch based on the main branch

The created Worktree will:
- Automatically assign an ID (incrementing)
- Automatically assign a port number (main port + ID)
- Copy main branch environment variables and update PORT and WORKTREE
- Automatically switch to the Worktree directory after execution (requires shell integration)

**tmux integration** (when inside tmux):
- Automatically creates a new tmux window
- Sets up 3-pane layout (Claude Code + Dev Server + Bash)
- Automatically switches to the new window
- If using iTerm2, automatically sets the tab title

### Examples

```bash
# No argument: interactive selector (default is [Create new branch])
$ colyn add

# Create worktree for a new branch
$ colyn add feature/login

# Create worktree from an existing local branch
$ colyn add bugfix/auth-error

# Create worktree from a remote branch (automatically strips origin/ prefix)
$ colyn add origin/feature/payment

# Automatically switches to worktree directory after execution
$ pwd
/path/to/worktrees/task-1
```

### Result

```
✔ Using local branch: feature/login
✔ Worktree created: task-1
✔ Environment variables configured

✓ Worktree created successfully!

Worktree info:
  ID: 1
  Branch: feature/login
  Path: worktrees/task-1
  Port: 10001

Next steps:
  1. Enter worktree directory:
     cd worktrees/task-1

  2. Start dev server (port auto-configured):
     npm run dev

  3. View all worktrees:
     colyn list

📂 Switched to: worktrees/task-1
```

> Note: With shell integration enabled, the command switches to the worktree directory automatically (the trailing `📂 Switched to`), so step 1's `cd` can be skipped; without shell integration, run that `cd` manually.

Directory structure after creation:

```
my-project/
├── my-project/                # Main branch directory (PORT=10000)
└── worktrees/
    └── task-1/                # New worktree (PORT=10001)
        ├── src/
        ├── .env.local         # PORT=10001, WORKTREE=1
        └── ...
```

### Common Errors

| Error Scenario | Error Message | Solution |
|---------------|---------------|----------|
| Not initialized | `✗ Current directory not initialized` | Run `colyn init` |
| Branch already has worktree | `✗ Branch already associated with an existing worktree` | Switch to the existing worktree, or delete and recreate |
| Invalid branch name | `✗ Invalid branch name` | Use a valid branch name (letters, numbers, underscores, hyphens, and slashes) |

### Tips

- IDs are not reused, even after deleting a worktree
- Can be run from anywhere in the project
- Branch name automatically strips `origin/` prefix
- Local branches in the selector automatically exclude the current branch in the main-branch directory
- Selecting a todo branch in the selector will auto-complete the todo and copy its message
- With shell integration enabled (configured by running `colyn setup`), the command switches to the newly created worktree directory after execution; without it, no switch occurs and you can `cd` manually

---

## colyn \<N\> — Quickly Switch Worktree

Jump to a Worktree by ID. Inside a tmux Session matching the project name, this selects the corresponding Window; otherwise it `cd`s into the directory or attaches the Session.

### Syntax

```bash
colyn <N>
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `N` | Yes | Target Worktree ID; `0` is the main directory, `N >= 1` is `worktrees/task-N` |

### Description

`colyn <N>` automatically selects the most appropriate switch method based on the current tmux context:

| Current Environment | Target Session+Window | Behavior |
|--------------------|-----------------------|----------|
| Inside project tmux Session | Target Window exists | Switch to that Window (includes iTerm2 title update) |
| Inside project tmux Session | Target Window not found | `cd` to target directory (fallback) |
| Outside tmux | Session+Window both exist | `exec tmux attach-session` and select target Window |
| Outside tmux | Session or Window not found | `cd` to target directory |
| Target Worktree not present | — | Error + list available Worktrees, exit 1 |

### Examples

```bash
colyn 0   # jump to main directory (Main branch directory)
colyn 1   # jump to worktrees/task-1
colyn N   # jump to worktrees/task-N
```

### Output Examples

**Successful switch (cd mode):**

```
📂 Switched to: ~/my-project/worktrees/task-1
```

**Target Worktree does not exist:**

```
✗ Worktree task-9 does not exist
Available worktrees:
   0  main         main  (main directory)
   1  task-1       feature/login
   2  task-2       feature/quick-switch
```

### Common Errors

| Error Scenario | Error Message | Solution |
|---------------|---------------|----------|
| Specified Worktree does not exist | `✗ Worktree task-N does not exist` | Run `colyn list` to see available Worktree IDs |
| Not inside a colyn project | `✗ Current directory is not inside a colyn project, cannot switch worktree` | Navigate into a colyn project directory first |

### Tips

- `colyn 0` always jumps to the main directory (Main branch directory)
- Run `colyn list` to see all Worktree IDs and their status
- Switching is fastest when inside the project's tmux Session
- If the tmux Window index does not match the Worktree ID (e.g., after manually reordering windows), the command automatically falls back to `cd`

---

## colyn list

List all Worktrees.

### Syntax

```bash
colyn list [options]
```

### Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--json` | - | Output in JSON format | No |
| `--paths` | `-p` | Output paths only (one per line) | No |
| `--no-main` | - | Do not show main branch | No (shows main branch) |
| `--refresh` | `-r` | Watch file changes and auto-refresh | No |

### Description

`colyn list` provides four output modes:

#### 1. Table Format (default)
- Colored output, visually readable
- Current worktree marked with `→` arrow
- Main branch ID shown as `0`
- Shows `Git` (working tree changes), `Diff` (diff against main branch), `Remote` (diff against remote branch), `Status` (workflow status)
- Responsive layout: automatically adjusts columns based on terminal width

#### 2. JSON Format (`--json`)
- Machine-readable, easy for script processing
- Contains complete information
- Array format

#### 3. Path Format (`--paths`)
- One path per line (relative paths)
- Convenient for pipe operations

#### 4. Auto-refresh (`--refresh`)
- Automatically watches file changes and refreshes the table
- Only supports table output; cannot be used with `--json` or `--paths`
- Triggered by file change events (with debounce)

### Examples

**Table format (default):**

```bash
$ colyn list

ID   Branch            Port   Git       Diff    Remote  Path              Status
  0  main              10000            -       ✓       my-app
  1  feature/login     10001  M:3 S:1   ↑2 ↓1   ↑1      worktrees/task-1  running
→ 2  feature/ui        10002            ✓       -       worktrees/task-2
```

**Notes:**
- Column order: `ID` / `Branch` / `Port` / `Git` / `Diff` / `Remote` / `Path` / `Status`
- `→` arrow marks the current worktree, entire row highlighted in cyan
- Main branch ID is shown as `0`
- `Git`: Uncommitted change counts (M:modified S:staged ?:untracked)
- `Diff`: Commit diff against main branch (↑ahead ↓behind ✓synced)
- `Remote`: Commit diff against the remote tracking branch (↑ahead ↓behind ✓synced, `-` when no remote branch)
- `Status`: Workflow status (empty when `idle`, otherwise `running` / `waiting-confirm` / `finish`)
- On narrow terminals, `Status` is compressed into the `st.` column with symbols `▶ / ? / ✓`

**JSON format:**

```bash
$ colyn list --json
```

```json
[
  {
    "id": null,
    "branch": "main",
    "port": 10000,
    "path": "my-app",
    "isMain": true,
    "isCurrent": false,
    "status": { "modified": 0, "staged": 0, "untracked": 0 },
    "diff": { "ahead": 0, "behind": 0 },
    "remoteDiff": { "ahead": 0, "behind": 0 },
    "worktreeStatus": "idle"
  },
  {
    "id": 1,
    "branch": "feature/login",
    "port": 10001,
    "path": "worktrees/task-1",
    "isMain": false,
    "isCurrent": false,
    "status": { "modified": 3, "staged": 1, "untracked": 2 },
    "diff": { "ahead": 2, "behind": 1 },
    "remoteDiff": { "ahead": 1, "behind": 0 },
    "worktreeStatus": "running"
  }
]
```

**Path format:**

```bash
$ colyn list --paths
my-app
worktrees/task-1
worktrees/task-2

# Output only task worktree paths
$ colyn list --paths --no-main
worktrees/task-1
worktrees/task-2
```

**Auto-refresh mode:**

```bash
# Watch file changes and auto-refresh
$ colyn list -r
```

### Script Usage Examples

```bash
# Run command in all worktrees
$ colyn list --paths | xargs -I {} sh -c 'cd {} && git status'

# Count number of worktrees
$ colyn list --paths --no-main | wc -l

# Process JSON output with jq
$ colyn list --json | jq '.[] | select(.isMain == false) | .path'
```

### Common Errors

| Error Scenario | Error Message | Solution |
|---------------|---------------|----------|
| Project not initialized | `✗ Current directory not initialized` | Run `colyn init` |
| Option conflict | `✗ --json and --paths cannot be used together` | Choose one output format |
| Refresh mode conflict | `✗ --refresh cannot be used with --json or --paths` | Switch to table mode |

### Tips

- Can be run from anywhere in the project
- Path output is relative to the project root directory
- Main branch ID is displayed as `0`
- On narrow terminals, the table automatically switches display mode per implementation (`full` → `no-port` → `no-path` → `compress-wt` → `simple-git` → `no-git` → `no-diff` → `minimal`)

---

## colyn list-project

List projects and Worktrees from the global status index (`~/.colyn-status.json`).

**Alias:** `lsp`

### Syntax

```bash
colyn list-project [options]
colyn lsp [options]        # Using alias
```

### Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--json` | - | Output in JSON format | No |
| `--paths` | `-p` | Output paths only (one per line) | No |
| `--details` | `-d` | Show worktree details for each project | No (overview only) |

### Description

`colyn list-project` retrieves project paths from the global status index file `~/.colyn-status.json` and shows project information.

**Key features:**
- Cross-project view: see all colyn projects in the global status index at once
- Fully reuses data structure and output format from `list` command
- Supports three output modes: table, JSON, paths
- By default outputs only the project overview table; add `--details` to also output a worktree details table for each project

**Difference from `list` command:**
- `list` - View all worktrees of the **current project**
- `list-project` - View all worktrees of **all projects in the global status index**

**Requirements:**
- `~/.colyn-status.json` must contain project entries
- Project directory structure must be valid (`.colyn/`, `{project}/{project}` main dir, `worktrees/`)

### Examples

**Table format (default):** by default only the project overview table is printed, without worktree details.

```bash
$ colyn list-project

┌─────────┬──────────────────┬───────────┬─────────────────────┐
│ Project │ Path             │ Worktrees │ Updated             │
├─────────┼──────────────────┼───────────┼─────────────────────┤
│ backend │ /path/to/backend │ 2         │ 2026/02/23 20:30:00 │
│ colyn   │ /path/to/colyn   │ 4         │ 2026/02/23 20:28:11 │
└─────────┴──────────────────┴───────────┴─────────────────────┘
```

**Details format (`--details`):** in addition to the project overview table, a worktree details table is printed for each project.

```bash
$ colyn list-project --details

┌─────────┬──────────────────┬───────────┬─────────────────────┐
│ Project │ Path             │ Worktrees │ Updated             │
├─────────┼──────────────────┼───────────┼─────────────────────┤
│ backend │ /path/to/backend │ 2         │ 2026/02/23 20:30:00 │
│ colyn   │ /path/to/colyn   │ 4         │ 2026/02/23 20:28:11 │
└─────────┴──────────────────┴───────────┴─────────────────────┘

backend Worktrees:
┌──────────┬──────────────┬──────┬─────┬──────┬──────────────────┐
│ ID       │ Branch       │ Port │ Git │ Diff │ Path             │
├──────────┼──────────────┼──────┼─────┼──────┼──────────────────┤
│   0-main │ develop      │ 3010 │     │ -    │ backend          │
│   1      │ feature/auth │ 3011 │     │ ✓    │ worktrees/task-1 │
└──────────┴──────────────┴──────┴─────┴──────┴──────────────────┘
```

**Path format:**

```bash
$ colyn list-project --paths
/path/to/backend/backend
/path/to/backend/worktrees/task-1
/path/to/colyn/colyn
/path/to/colyn/worktrees/task-1
```

### Script Usage Examples

```bash
# Run git status in all worktrees of all projects
$ colyn list-project --paths | xargs -I {} sh -c 'echo "=== {} ===" && cd {} && git status'

# Count total number of worktrees
$ colyn list-project --paths | wc -l

# View worktrees of a specific project
$ colyn list-project --json | jq '.[] | select(.projectName == "colyn")'
```

### Common Errors

| Error Scenario | Error Message | Solution |
|---------------|---------------|----------|
| Global status index is empty | `No projects found` | Run `colyn status set running` (or another status) inside a project to write index |
| Option conflict | `✗ --json and --paths cannot be used together` | Choose one output format |

---

## colyn merge

Merge a Worktree branch back into the main branch.

### Syntax

```bash
colyn merge [target] [options]
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `target` | No | Supports the following forms:<br>- Number: find by ID (e.g., `1`)<br>- Branch name: find by branch name (e.g., `feature/login`)<br>- Omitted: automatically detect current worktree |

### Options

All toggle options come in positive / negative forms. Defaults can be overridden via `commands.merge.*` in `.colyn/settings.json` (see the configuration manual).

| Option | Default | Description |
|--------|---------|-------------|
| `--build` / `--no-build` | `--build` | Whether to run the toolchain plugins' lint and build checks; `--no-build` skips them |
| `--rebase` / `--no-rebase` | `--rebase` | Use rebase to update the worktree; `--no-rebase` uses merge instead |
| `--update` / `--no-update` | `--update` | Whether to automatically update worktrees with the latest main branch code after merge |
| `--fetch` / `--no-fetch` | `--fetch` | Whether to fetch the latest main branch from remote before updating |
| `--all` / `--no-all` (alias `--current-only`) | `--all` | Update scope: all worktrees or only the current one (only meaningful when `--update` is active) |
| `-v, --verbose` / `--no-verbose` | `--no-verbose` | Whether to show full lint/build command output (on failure) |

### Description

`colyn merge` uses a two-step merge strategy with `--no-ff` to maintain a clear branch history:

**Step 1: Update main branch code in Worktree**
- Run `git rebase main` in the worktree
- If there are conflicts, resolve them in the worktree (does not affect main branch)

**Step 2: Merge Worktree branch in main branch**
- Run `git merge --no-ff <branch>` in the main branch
- Forces a merge commit for clear branch history

**Step 3: Automatically update worktrees after merge (default behavior)**
- By default, first `fetch` the latest main branch from remote (`--no-fetch` skips this)
- By default, update **all** worktrees so they sync with the latest main branch (`--current-only` updates only the current worktree; `--no-update` skips updating entirely, in which case `--all` has no effect)

**Pre-checks:**
- Main branch working directory must be clean
- Worktree working directory must be clean
- Run lint and build checks based on configured toolchain plugins

### Examples

```bash
# Merge from within worktree directory
$ cd worktrees/task-1
$ colyn merge

# Merge by ID
$ colyn merge 1

# Merge by branch name
$ colyn merge feature/login
```

### Handling Merge Conflicts

If a conflict occurs when rebasing main branch in the worktree:

```
✗ Conflict occurred during rebase of main branch

Resolution steps:
  1. Enter the worktree directory to resolve conflicts:
     cd worktrees/task-1
  2. Edit conflict files to resolve conflict markers
  3. Add resolved files:
     git add <file>
  4. Continue rebase:
     git rebase --continue
  5. Re-run the merge command:
     colyn merge feature/login
```

### Common Errors

| Error Scenario | Error Message | Solution |
|---------------|---------------|----------|
| Main branch not clean | `✗ Main branch directory has uncommitted changes` | Commit or stash main branch changes |
| Worktree not clean | `✗ Worktree directory has uncommitted changes` | Commit worktree changes |
| Lint check failed | `✗ Lint check failed` | Fix lint errors and retry |
| Build failed | `✗ Build failed` | Fix build errors and retry |

---

## colyn remove

Remove a Worktree that is no longer needed.

### Syntax

```bash
colyn remove [target] [options]
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `target` | No | Supports the following forms:<br>- Number: find by ID (e.g., `1`)<br>- Branch name: find by branch name (e.g., `feature/login`)<br>- Omitted: automatically detect current worktree |

### Options

| Option | Short | Description |
|--------|-------|-------------|
| `--force` | `-f` | Force delete (ignore uncommitted changes) |
| `--yes` | `-y` | Skip all confirmation prompts (keeps local branch by default) |

### Description

`colyn remove` safely removes a worktree:

**Pre-checks:**
- Check for uncommitted changes (reject removal if changes exist, unless `--force`)
- Check branch merge status (display warning if not merged)

**Removal process:**
1. Show information about the worktree to be removed
2. Prompt user for confirmation (skip with `--yes`)
3. Run `git worktree remove`
4. Ask whether to also delete local branch (`--yes` skips this and keeps branch by default)
5. If currently inside the deleted worktree, automatically switch to main branch directory

### Examples

```bash
# Remove from within worktree directory
$ cd worktrees/task-1
$ colyn remove

# Remove by ID
$ colyn remove 1

# Remove by branch name
$ colyn remove feature/login

# Force remove (ignore uncommitted changes)
$ colyn remove 1 --force

# Quick remove (skip confirmation)
$ colyn remove 1 -y
```

### Common Errors

| Error Scenario | Error Message | Solution |
|---------------|---------------|----------|
| Worktree not found | `✗ Cannot find worktree` | Check ID or branch name, run `colyn list` to view |
| Has uncommitted changes | `✗ Cannot remove: uncommitted changes exist` | Commit changes or use `--force` |

### Tips

- Checks for uncommitted changes before removal to prevent accidental data loss
- Unmerged branches only show a warning; deletion is still allowed
- If currently inside the deleted worktree, automatically switches to main branch directory
- Can be run from anywhere in the project
