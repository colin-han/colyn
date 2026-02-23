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
- Automatically switch to the Worktree directory after execution

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
✔ Config files updated

✓ Worktree created successfully!

Worktree info:
  ID: 1
  Branch: feature/login
  Path: /path/to/worktrees/task-1
  Port: 10001

Next steps:
  1. Start dev server (port already configured):
     npm run dev

  2. View all worktrees:
     colyn list

📂 Switched to: /path/to/worktrees/task-1
```

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
- After execution, automatically switches to the newly created worktree directory

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
| `--refresh [interval]` | `-r` | Watch file changes and auto-refresh (optional: refresh interval in seconds) | No |

### Description

`colyn list` provides four output modes:

#### 1. Table Format (default)
- Colored output, visually readable
- Current worktree marked with `→` arrow
- Main branch ID shown as `0-main`
- Shows git status and diff against main branch
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
- By default refreshes on file events; optionally pass a number (seconds) as refresh interval

### Examples

**Table format (default):**

```bash
$ colyn list

ID    Branch            Port   Status      Diff   Path
  0-main   main         10000              -      my-app
  1   feature/login     10001  M:3         ↑2 ↓1  worktrees/task-1
→ 2   feature/dashboard 10002              ↑5     worktrees/task-2
```

**Notes:**
- `→` arrow marks the current worktree, entire row highlighted in cyan
- `Status`: Uncommitted change counts (M:modified S:staged ?:untracked)
- `Diff`: Commit diff against main branch (↑ahead ↓behind ✓synced)

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
    "diff": { "ahead": 0, "behind": 0 }
  },
  {
    "id": 1,
    "branch": "feature/login",
    "port": 10001,
    "path": "worktrees/task-1",
    "isMain": false,
    "isCurrent": false,
    "status": { "modified": 3, "staged": 1, "untracked": 2 },
    "diff": { "ahead": 2, "behind": 1 }
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

# Refresh every 2 seconds
$ colyn list --refresh 2
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
- Main branch ID is displayed as `0-main`
- On narrow terminals, the table automatically hides less important columns

---

## colyn list-project

List projects and Worktrees across all tmux sessions.

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

### Description

`colyn list-project` retrieves all running projects via the tmux API and shows worktree information for each project.

**Key features:**
- Cross-project view: see all colyn projects in all tmux sessions at once
- Fully reuses data structure and output format from `list` command
- Supports three output modes: table, JSON, paths

**Difference from `list` command:**
- `list` - View all worktrees of the **current project**
- `list-project` - View all worktrees of **all projects in tmux sessions**

**Requirements:**
- tmux must be installed
- At least one tmux session must be running
- Session's window 0 pane 0 must be in a project directory

### Examples

**Table format (default):**

```bash
$ colyn list-project

┌─────────┬─────────┬──────────────────┬───────────┐
│ Session │ Project │ Path             │ Worktrees │
├─────────┼─────────┼──────────────────┼───────────┤
│ backend │ backend │ /path/to/backend │ 2         │
│ colyn   │ colyn   │ /path/to/colyn   │ 4         │
└─────────┴─────────┴──────────────────┴───────────┘

backend Worktrees:
┌──────────┬──────────────┬──────┬────────┬──────┬──────────────────┐
│ ID       │ Branch       │ Port │ Status │ Diff │ Path             │
├──────────┼──────────────┼──────┼────────┼──────┼──────────────────┤
│   0-main │ develop      │ 3010 │        │ -    │ backend          │
│   1      │ feature/auth │ 3011 │        │ ✓    │ worktrees/task-1 │
└──────────┴──────────────┴──────┴────────┴──────┴──────────────────┘
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
| tmux not installed | `✗ tmux not installed` | Install tmux: `brew install tmux` (macOS) or `apt install tmux` (Linux) |
| No tmux session | `No projects found` | Create tmux session: `colyn tmux` |
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

| Option | Description |
|--------|-------------|
| `--push` | Automatically push to remote after merge |
| `--no-push` | Do not push after merge (skip prompt) |
| `--no-rebase` | Use merge instead of rebase to update worktree |
| `--no-update` | Do not automatically update current worktree after merge |
| `--update-all` | Update all worktrees after merge |
| `--no-fetch` | Skip fetching latest main branch from remote |
| `--skip-build` | Skip lint and build checks |
| `--verbose` / `-v` | Show full lint/build command output (on failure) |

### Description

`colyn merge` uses a two-step merge strategy with `--no-ff` to maintain a clear branch history:

**Step 1: Update main branch code in Worktree**
- Run `git rebase main` in the worktree
- If there are conflicts, resolve them in the worktree (does not affect main branch)

**Step 2: Merge Worktree branch in main branch**
- Run `git merge --no-ff <branch>` in the main branch
- Forces a merge commit for clear branch history

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

# Merge and auto-push
$ colyn merge 1 --push
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
