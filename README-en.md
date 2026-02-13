# Colyn

[中文](README.md) | **English**

Git Worktree management tool - Simplify multi-branch parallel development workflow.

---

## Features

- **Simplified worktree management**: Create and manage git worktrees with one command
- **Automatic port allocation**: Avoid port conflicts between multiple dev servers
- **Automatic directory switching**: Automatically switch to target directory after command execution
- **Smart branch handling**: Automatically identify local branches, remote branches, or create new branches
- **Auto-completion**: Support Bash/Zsh Tab key completion for commands, options, and arguments
- **Cross-platform support**: macOS, Linux, Windows

---

## Installation

### Method 1: npm global install (Recommended)

```bash
# Install with npm
npm install -g colyn

# Or use volta (recommended)
volta install colyn

# Configure shell integration (supports auto directory switching)
colyn system-integration
```

After configuration, reopen the terminal or run `source ~/.zshrc` (or `~/.bashrc`) to use full functionality.

### Method 2: Using installation script

```bash
# Run in project root directory
volta run yarn install-to ~/my-tools/colyn
```

After installation, reopen the terminal to use the `colyn` command (shell integration and auto-completion are automatically configured).

### Method 3: Manual configuration

If automatic configuration doesn't work, manually add to your shell config file:

```bash
# Add to ~/.zshrc or ~/.bashrc
source ~/my-tools/colyn/colyn.d/colyn.sh
source ~/my-tools/colyn/colyn.d/completion.bash  # or completion.zsh
```

For detailed installation instructions, see [docs/installation.md](docs/installation.md).

---

## Quick Start

### Initialize Project

```bash
# Run in existing git project
colyn init -p 10000
```

Directory structure after initialization:

```
my-project/                    # Root directory
├── my-project/                # Main branch directory
│   ├── .git/
│   ├── src/
│   ├── .env.local            # PORT=10000, WORKTREE=main
│   └── ...
└── worktrees/                 # Worktrees directory
```

### Create Worktree

```bash
# Create new worktree (auto switch to target directory)
colyn add feature/login
# 📂 Switched to: worktrees/task-1

# Check current directory
pwd
# /path/to/project/worktrees/task-1
```

Directory structure after creation:

```
my-project/
├── my-project/                # Main branch directory (PORT=10000)
└── worktrees/
    └── task-1/                # New worktree (PORT=10001)
        ├── src/
        ├── .env.local
        └── ...
```

---

## Command Reference

### Global Options

All commands support the following global options:

```bash
-C, --no-color  Disable color output
```

**Use cases**:
- Running in CI/CD environment
- Redirecting output to file
- Terminal doesn't support colors
- Need plain text output for script parsing

**Examples**:
```bash
colyn list --no-color           # List worktrees (no color)
colyn info --short -C           # Show project info (no color, short form)
colyn checkout feature/test -C  # Switch branch (no color)
```

### `colyn init`

Initialize worktree management structure.

```bash
colyn init [options]

Options:
  -p, --port <port>  Main branch dev server port
  -y, --yes          Skip confirmation when initializing an existing project
```

**Features**:
- Auto-detect directory status (empty directory, initialized, existing project)
- Create main branch directory and worktrees directory
- Configure environment variables (PORT and WORKTREE)
- Configure .gitignore to ignore .env.local

### `colyn add <branch>`

Create a new worktree for the specified branch.

```bash
colyn add <branch>

Arguments:
  branch  Branch name (supports local branch, remote branch, or new branch)
```

**Features**:
- Auto-assign worktree ID and port number
- Smart branch handling (local, remote, new)
- Copy main branch environment variables and update
- Auto switch to worktree directory after execution

### `colyn merge [target]`

Merge worktree branch back to main branch.

```bash
colyn merge [target] [options]

Arguments:
  target  Optional, supports the following forms:
          - Number: Find by ID (e.g., colyn merge 1)
          - Branch name: Find by branch (e.g., colyn merge feature/login)
          - None: Auto-detect current worktree

Options:
  --push     Auto push to remote after merge
```

**Features**:
- Smart worktree identification (ID, branch name, or auto-detect)
- Pre-checks (main branch and worktree working directory must be clean)
- Two-step merge strategy: First merge main into worktree, then merge worktree into main
- Use `--no-ff` to maintain clear branch history
- Optional push to remote repository
- Keep worktree after merge (user decides when to delete)

### `colyn list`

List all worktrees.

```bash
colyn list [options]

Options:
  --json               Output in JSON format
  -p, --paths          Output paths only (one per line)
  --no-main            Don't show main branch
  -r, --refresh        Watch file changes and auto-refresh
```

**Features**:
- Display all worktrees in table format
- Show ID, branch name, port, path, and status
- Highlight current worktree
- Support JSON output for scripting
- Auto-refresh mode for real-time monitoring

**Auto-refresh examples**:
```bash
# Enable file watching and auto-refresh
colyn list -r

# Automatically updates when:
# - Git status changes (commit, checkout, etc.)
# - .env.local port configuration changes
# - Worktrees are added/removed

# Press Ctrl+C to exit refresh mode
```

### `colyn remove [target]`

Delete a worktree that's no longer needed.

```bash
colyn remove [target] [options]

Arguments:
  target  Optional, supports the following forms:
          - Number: Find by ID (e.g., colyn remove 1)
          - Branch name: Find by branch (e.g., colyn remove feature/login)
          - None: Auto-detect current worktree

Options:
  -f, --force  Force delete (ignore uncommitted changes)
  -y, --yes    Skip all confirmation prompts (keep local branch by default)
```

**Features**:
- Smart worktree identification (ID, branch name, or auto-detect)
- Check for uncommitted changes, refuse to delete if any (unless --force)
- Check if branch is merged (show warning if not)
- Ask whether to also delete local branch after deletion
- Auto switch to main branch directory if currently in the deleted worktree

### `colyn checkout [worktree-id] <branch>`

Switch branch in a worktree.

```bash
colyn checkout [worktree-id] <branch> [options]

Arguments:
  worktree-id  Optional, worktree ID (can be omitted when in worktree directory)
  branch       Target branch name

Options:
  --no-fetch   Skip fetching remote branch info

Alias:
  colyn co [worktree-id] <branch> [options]
```

**Features**:
- Auto-detect current worktree in worktree directory, or specify by ID
- Smart branch handling (local branch, remote tracking, create new branch)
- Auto fetch latest branch info from remote (use --no-fetch to skip)
- Auto update main branch after successful fetch (if main is behind remote)
- Check if current branch is merged, prompt for confirmation if not
- Auto archive log files under `.claude/logs/` to `archived/<branch-name>/`
- Option to delete merged branches

### `colyn info`

Show current directory project info.

```bash
colyn info [options]

Options:
  -S, --short             Output short identifier (with branch info)
  -f, --field <name>      Output specific field (can be used multiple times)
  --format <template>     Format output using template string
  -s, --separator <char>  Separator for multiple fields (default: tab)
```

**Features**:
- Show project name, path, worktree ID, branch, etc.
- Support multiple output formats (full info, field, template, short identifier)
- `--short` option supports smart fallback (colyn project → git repo → regular directory)

**Usage examples**:
```bash
# Show full info
$ colyn info
📁 Project:      my-project
📂 Project Path: /path/to/my-project
🔢 Worktree ID:  1
📁 Worktree Dir: task-1
🌿 Branch:       feature/login

# Output short identifier (recommended for shell prompt)
$ colyn info --short
my-project/task-1 (⎇ feature/login)

# Use in shell prompt
$ PS1='[$(colyn info -S)] $ '
[my-project/task-1 (⎇ feature/login)] $

# Get single field
$ colyn info -f branch
feature/login
```

### `colyn completion [shell]`

Generate shell auto-completion script.

```bash
colyn completion [shell] [options]

Arguments:
  shell  Shell type (bash or zsh)

Options:
  --install  Show installation instructions
```

**Features**:
- Generate Bash or Zsh completion scripts
- Support auto-completion for commands, options, and arguments
- Real-time query worktree list for dynamic completion
- Provide installation instructions

**Examples**:
```bash
# Output bash completion script
colyn completion bash

# Show zsh installation instructions
colyn completion zsh --install

# Manual installation
colyn completion bash > ~/.colyn-completion.bash
echo "source ~/.colyn-completion.bash" >> ~/.bashrc
```

### `colyn repair`

Check and repair project configuration (use after moving directory).

```bash
colyn repair
```

**Features**:
- Check and repair `.env.local` files for main branch and all worktrees
- Run `git worktree repair` to fix git connections
- Smart detect and repair path-invalid worktrees (after project move)
- Detect orphan worktree directories

**Use cases**:
```bash
# After moving project directory
$ mv ~/project ~/Desktop/project
$ cd ~/Desktop/project

# Run repair
$ colyn repair
✔ Detecting and repairing orphan worktree directories...
✔ Repaired 2 path-invalid worktrees

✓ Repair complete!
```

### `colyn system-integration`

Configure shell integration (supports auto directory switching and command completion).

```bash
colyn system-integration
```

**Features**:
- Auto-detect shell type (bash/zsh) and config file
- Add shell integration to config file (`~/.zshrc` or `~/.bashrc`)
- Support updating existing configuration
- Need to reopen terminal or run `source` command after configuration

**Use cases**:
- First-time configuration after npm global install
- Update configuration after upgrading colyn
- Restore after config file was accidentally deleted

---

## Environment Variables

Colyn sets the following environment variables in each worktree's `.env.local`:

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Dev server port | `10001` |
| `WORKTREE` | Worktree identifier | `1` or `main` |

---

## Architecture

Colyn uses a Bash + Node.js dual-layer architecture:

```
shell/colyn.sh (Shell function)
    │
    └──► bin/colyn (Bash entry)
                │
            └──► dist/index.js (Node.js core)
                        │
                 stderr → Colored output
                 stdout → JSON result (JSON mode only)
                        │
    ◄───────────────────┘
    │
    └──► Parse JSON ──► cd to target directory
```

**Why dual-layer architecture?**

Child processes cannot modify the parent process's working directory. Through shell function wrapper, we can:
1. Call Node.js in JSON mode and capture JSON result
2. Parse target directory
3. Execute `cd` command in current shell

---

## Development

### Requirements

- Node.js >= 18 (recommend using [Volta](https://volta.sh) for management)
- Git >= 2.15
- Yarn

### Development Commands

```bash
# Install dependencies
volta run yarn install

# Build
volta run yarn build

# Watch mode build
volta run yarn dev

# Run tests
volta run yarn test

# Local testing
volta run yarn colyn init
```

### Project Structure

```
colyn/
├── bin/
│   └── colyn              # Bash entry script
├── shell/
│   ├── colyn.sh           # Shell integration script
│   ├── completion.bash    # Bash completion script
│   └── completion.zsh     # Zsh completion script
├── src/
│   ├── cli.ts             # CLI entry
│   ├── commands/          # Command implementations
│   ├── types/             # Type definitions
│   └── utils/             # Utility functions
├── scripts/
│   └── install.js         # Installation script
├── docs/                   # Documentation
└── dist/                   # Build output
```

---

## Roadmap

- [x] `init` - Initialize project structure
- [x] `add` - Create worktree
- [x] `list` - List all worktrees
- [x] `merge` - Merge worktree to main branch
- [x] `remove` - Delete worktree
- [x] `checkout` - Switch branch in worktree
- [x] `info` - Show current directory info
- [x] `completion` - Auto-completion feature
- [x] `repair` - Check and repair project configuration
- [x] `system-integration` - Configure shell integration

---

## License

MIT
