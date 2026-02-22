# Quick Start

This guide will help you start using Colyn in 5 minutes.

---

## Prerequisites

Before you begin, make sure you have installed:

- **Node.js** 18 or higher
- **Git** 2.15 or higher
- **npm** or **yarn** package manager

---

## Step 1: Install Colyn

### Using npm (recommended)

```bash
# Global installation
npm install -g colyn

# Or using volta (recommended)
volta install colyn
```

### Configure Shell Integration

After installation, configure shell integration to enable the automatic directory switching feature:

```bash
colyn setup
```

Then reopen your terminal or run:

```bash
# Zsh
source ~/.zshrc

# Bash
source ~/.bashrc
```

> **What is Shell Integration?**
> Shell integration allows Colyn to automatically switch to the target directory after a command executes, greatly improving the user experience.

---

## Step 2: Initialize a Project

Run the following in your Git project root directory:

```bash
cd /path/to/your/project
colyn init -p 3000
```

This will:
- Reorganize the project structure, creating a main branch directory and a worktrees directory
- Configure environment variables (PORT and WORKTREE)
- Automatically set up .gitignore

### Directory Structure After Initialization

```
my-project/                    # Project root directory
├── .colyn/                    # Colyn marker directory
├── my-project/                # Main branch directory
│   ├── .git/                  # Git repository
│   ├── src/
│   ├── .env.local             # PORT=3000, WORKTREE=main
│   └── ...
└── worktrees/                 # Worktrees directory (created later)
```

---

## Step 3: Create Your First Worktree

Now create a new worktree to develop a new feature:

```bash
colyn add feature/login
```

This will:
1. Create a new worktree in the `worktrees/task-1/` directory
2. Automatically assign port 3001
3. Copy and update the .env.local file
4. **Automatically switch to the worktree directory** (if shell integration is configured)

### Verify the Switch

```bash
# Check the current directory
pwd
# Output: /path/to/my-project/worktrees/task-1

# Check environment variables
cat .env.local
# PORT=3001
# WORKTREE=1
```

---

## Step 4: Develop in the Worktree

Now you can develop features in the new worktree:

```bash
# Install dependencies (if needed)
npm install

# Start the dev server
npm run dev
# Server running at http://localhost:3001
```

---

## Step 5: Create More Worktrees

You can create multiple worktrees for parallel development:

```bash
# Create a second worktree
colyn add feature/dashboard
# Automatically switches to worktrees/task-2/, port 3002

# Create a third worktree
colyn add bugfix/user-profile
# Automatically switches to worktrees/task-3/, port 3003
```

---

## Step 6: View All Worktrees

Check the status of all worktrees at any time:

```bash
colyn list
```

Example output:

```
┌────────┬──────────────────────┬──────┬────────────────────────────┐
│ ID     │ Branch               │ Port │ Path                       │
├────────┼──────────────────────┼──────┼────────────────────────────┤
│ 0-main │ main                 │ 3000 │ /path/to/my-project        │
│ 1      │ feature/login      * │ 3001 │ worktrees/task-1           │
│ 2      │ feature/dashboard    │ 3002 │ worktrees/task-2           │
│ 3      │ bugfix/user-profile  │ 3003 │ worktrees/task-3           │
└────────┴──────────────────────┴──────┴────────────────────────────┘

* indicates the worktree you are currently in
```

---

## Step 7: Merge a Completed Feature

When a feature is complete, merge it back into the main branch:

```bash
# Make sure all changes are committed
git status

# Merge into the main branch
colyn merge 1

# Or use the branch name
colyn merge feature/login

# Merge and push to remote
colyn merge 1 --push
```

The merge process:
1. Checks if the working directory is clean
2. Merges the main branch into the worktree first
3. Merges the worktree branch into the main branch
4. Uses `--no-ff` to maintain a clear branch history
5. (Optional) Pushes to the remote repository

---

## Step 8: Remove an Unneeded Worktree

After a feature is merged, you can remove the worktree:

```bash
colyn remove 1

# Or use the branch name
colyn remove feature/login
```

Before removal, the following are checked:
- Whether there are uncommitted changes
- Whether the branch has been merged
- Whether the local branch should also be deleted

If you are currently inside the worktree being removed, it will automatically switch to the main branch directory.

---

## Step 9: Switch Branches in a Worktree

You can switch to a different branch within an existing worktree instead of creating a new one:

```bash
# Switch branch in the current worktree
colyn checkout feature/new-feature

# Or specify a Worktree ID
colyn checkout 1 feature/new-feature
```

This will:
1. Check whether the current branch has been merged
2. Automatically archive log files under `.claude/logs/`
3. Switch to the new branch
4. (Optional) Delete the old merged branch

---

## Common Command Reference

| Command | Description |
|---------|-------------|
| `colyn init -p 3000` | Initialize the project structure |
| `colyn add <branch>` | Create a new worktree |
| `colyn list` | List all worktrees |
| `colyn merge <target>` | Merge a worktree into the main branch |
| `colyn remove <target>` | Remove a worktree |
| `colyn checkout <branch>` | Switch branches in a worktree |
| `colyn info` | Display information about the current directory |
| `colyn repair` | Repair the project configuration |

---

## Next Steps

Now that you have mastered the basics of Colyn, you can:

- Read [Core Concepts](03-core-concepts.md) to deeply understand how Colyn works
- Check [Command Reference](04-command-reference.md) for detailed usage of all commands
- Learn [Advanced Usage](05-advanced-usage.md) to master more techniques
- If you use tmux, check [tmux Integration](06-tmux-integration.md)

---

## Troubleshooting

Having issues? See the [Troubleshooting](08-troubleshooting.md) chapter.

Common issues:

- **Directory did not switch automatically after command execution** → Confirm you have run `colyn setup` and restarted your terminal
- **Port conflict** → Check the PORT configuration in the .env.local file
- **Branch already exists** → Use `colyn list` to view existing worktrees
