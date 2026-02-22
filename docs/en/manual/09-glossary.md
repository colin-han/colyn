# Glossary

This glossary defines the terms and concepts used in Colyn and related tools.

---

## Git-Related Terms

### Worktree

**Definition**: A Git feature that allows multiple branches from the same repository to be checked out simultaneously into different directories.

**Origin**: A feature introduced in Git 2.5+ (`git worktree`)

**Usage in Colyn**:
- The core functionality of Colyn is simplifying Git worktree management
- Each worktree corresponds to an independent working directory
- Each worktree can run an independent dev server

**Example**:
```bash
# Native git command
git worktree add ../feature-branch feature/login

# Colyn simplified command
colyn add feature/login
```

---

### Main Branch

**Definition**: The project's primary development branch, typically `main` or `master`.

**Usage in Colyn**:
- The main branch is stored separately in a subdirectory of the same name under the project root
- For example, if the project root is `my-app/`, the main branch is at `my-app/my-app/`
- The main branch's information (branch name, port) serves as a reference for other worktrees

**How it is inferred**:
```typescript
// Inferred from the current branch of the main branch directory
getMainBranch() => execSync('git branch --show-current', { cwd: mainDir })
```

---

### Branch Name

**Definition**: The name of a Git branch, used to identify different lines of development.

**Usage in Colyn**:
- Used to specify the target branch when creating a worktree
- Used to generate tmux window names
- Supports local branches, remote branches, or new branches

**Naming convention examples**:
```
feature/auth           # New feature
bugfix/user/login      # Bug fix
feature/ui/dark-mode   # UI feature
main                   # Main branch
```

---

## Colyn Core Concepts

### Worktree ID

**Definition**: A unique numeric identifier assigned by Colyn to each worktree.

**Usage in Colyn**:
- The main branch is always displayed with ID `0-main`
- Other worktrees start from `1` and increment
- The ID is used for directory naming (`task-1`, `task-2`, etc.)
- The ID is used for port assignment (base port + ID)
- In tmux integration, ID = Window Index

**Example**:
```bash
colyn list

┌────────┬─────────────────────┬──────┐
│ ID     │ Branch              │ Port │
├────────┼─────────────────────┼──────┤
│ 0-main │ main                │ 3000 │
│ 1      │ feature/auth        │ 3001 │
│ 2      │ feature/tasks       │ 3002 │
└────────┴─────────────────────┴──────┘
```

---

### Project Name

**Definition**: The name of the Colyn project, used to identify the entire project.

**How it is inferred**:
```typescript
// Inferred from the project root directory name
getProjectName() => path.basename(projectRoot)
```

**Usage in Colyn**:
- Used as directory names
- Used as the session name in tmux integration
- Used in various prompts and messages

**Example**:
```bash
# Project structure
my-task-app/              # ← Project name = "my-task-app"
├── my-task-app/          # Main branch directory
└── worktrees/            # Worktree directory
```

---

### Base Port

**Definition**: The dev server port used by the main branch, and the basis for assigning ports to other worktrees.

**How it is inferred**:
```typescript
// Read from the main branch's .env.local
getBasePort() => readEnvLocal(mainDir).PORT
```

**Usage in Colyn**:
- The main branch uses the base port
- Worktree port = base port + worktree ID
- Avoids port conflicts between multiple dev servers

**Example**:
```bash
# Main branch .env.local
PORT=3000

# Ports for each worktree
main:    3000  (base port)
task-1:  3001  (3000 + 1)
task-2:  3002  (3000 + 2)
task-3:  3003  (3000 + 3)
```

---

### Parallel Vibe Coding

**Definition**: A working mode using Colyn + Git worktrees to enable multiple AI instances (such as Claude Code) to develop different features in parallel.

**Key characteristics**:
1. Multiple worktrees exist simultaneously
2. Each worktree runs an independent Claude Code instance
3. Each worktree has an independent dev server
4. tmux is used to manage all worktrees in a single window

**Workflow**:
```bash
# 1. Create multiple parallel branches
colyn add feature/auth
colyn add feature/tasks
colyn add feature/dashboard

# 2. Start Claude Code in each worktree
# 3. Multiple AIs work simultaneously
# 4. Periodically merge back to the main branch
```

---

### Minimal Configuration Principle

**Definition**: Configuration that can be automatically inferred should not be stored in a configuration file.

**Core philosophy**:
- Only store information that cannot be automatically inferred
- If it can be inferred from the environment, don't store it
- If it can be dynamically obtained, don't cache it

**In practice**:
- Do not store project name (inferred from directory name)
- Do not store main branch (inferred from git)
- Do not store base port (read from .env.local)
- Do not store session name (equals project name)
- The project currently requires zero configuration

---

## Development Tool Terms

### Dev Server

**Definition**: A web server for local development, typically with hot reload support.

**Usage in Colyn**:
- Each worktree runs an independent dev server
- The port is specified via the PORT environment variable
- Automatically started in tmux integration (detects the `dev` script in `package.json`)

**Common frameworks**:
- Next.js: `npm run dev`
- Vite: `npm run dev`
- Create React App: `npm start`

**Port assignment**:
```bash
# .env.local for each worktree
PORT=3001  # task-1
PORT=3002  # task-2
PORT=3003  # task-3
```

---

### Claude Code

**Definition**: Anthropic's official Claude AI command-line tool, used for conversing with Claude and collaborative programming in the terminal.

**Usage in Colyn**:
- Runs independently in each worktree
- Enables Parallel Vibe Coding
- Occupies the left pane (60%) in tmux integration

**Usage scenario**:
```bash
# Start Claude Code in a worktree
cd worktrees/task-1
claude

# Claude helps develop features for the current branch
> Help me implement user authentication...
```

---

## tmux-Related Terms

### Session (tmux Session)

**Definition**: The top-level container in tmux, containing one or more windows.

**Usage in Colyn**:
- One Colyn project corresponds to one tmux session
- Session name = project name
- All worktree windows are in the same session

**Commands**:
```bash
# View all sessions
tmux ls

# Attach to a session
tmux attach -t my-task-app

# Detach from session
Ctrl-b d
```

**Hierarchy**:
```
Session (my-task-app)
  └─ Window 0 (main)
  └─ Window 1 (auth)
  └─ Window 2 (tasks)
```

---

### Session Name (tmux Session Name)

**Definition**: The identifier for a tmux session, used for attaching to and managing the session.

**How it is inferred**:
```typescript
// Always equals the project name
getSessionName() => getProjectName()
```

**Usage in Colyn**:
- Automatically uses the project name as the session name
- Users attach to their work environment via the session name
- Does not need to be stored in a configuration file

**Example**:
```bash
# Project name is "my-task-app"
# Session name is automatically "my-task-app"

tmux attach -t my-task-app
```

---

### Window (tmux Window)

**Definition**: A tab in a tmux session, containing one or more panes.

**Usage in Colyn**:
- One worktree corresponds to one window
- Window 0 is fixed as the main branch
- Other window indices = worktree IDs

**Navigation shortcuts**:
```bash
Ctrl-b 0    # Switch to Window 0
Ctrl-b 1    # Switch to Window 1
Ctrl-b 2    # Switch to Window 2
Ctrl-b n    # Next window
Ctrl-b p    # Previous window
```

**Hierarchy**:
```
Window (auth)
  └─ Pane 0 (Claude Code)
  └─ Pane 1 (Dev Server)
  └─ Pane 2 (Bash)
```

---

### Window Index (tmux Window Index)

**Definition**: The numeric identifier for a tmux window, starting from 0.

**Usage in Colyn**:
- Window Index = Worktree ID
- The main branch is always Window 0
- Used for quick switching (Ctrl-b 0-9)

**Mapping**:
```
Worktree     Window Index
────────────────────────
main         0
task-1       1
task-2       2
task-3       3
```

---

### Window Name

**Definition**: The readable name of a tmux window, displayed in the status bar.

**How it is derived**:
```typescript
// Uses the last segment of the branch name
function getWindowName(branch: string): string {
  return branch.split('/').pop() || branch;
}

// Examples
feature/auth → auth
bugfix/user/login → login
feature/ui/dark-mode → dark-mode
main → main
```

**Usage in Colyn**:
- Automatically extracted from the branch name
- Automatically updated when switching branches
- Helps users identify the function of the current window

**Status bar display**:
```
[my-task-app] 0:main  1:auth*  2:tasks  3:categories
```

---

### Pane (tmux Pane)

**Definition**: A split region within a tmux window; each pane is an independent terminal.

**Usage in Colyn**:

Each window is divided into 3 fixed panes:

```
┌──────────────┬─────────┐
│              │  Dev    │
│              │  Server │  ← 30% (Pane 1)
│   Claude     ├─────────┤
│   Code       │         │
│              │  Bash   │  ← 70% (Pane 2)
│     60%      │   40%   │
│  (Pane 0)    │         │
└──────────────┴─────────┘
```

**Pane assignment**:
- Pane 0 (left 60%): Claude Code
- Pane 1 (upper right 12%): Dev Server (auto-started)
- Pane 2 (lower right 28%): Bash command line

**Navigation shortcuts**:
```bash
Ctrl-b o         # Switch to the next pane
Ctrl-b ;         # Switch to the last active pane
Ctrl-b ←/→/↑/↓   # Switch pane with arrow keys
```

---

## Environment Variables

### .env.local

**Definition**: A file for storing local environment variables that is not committed to the Git repository.

**Usage in Colyn**:
- Each worktree has its own independent `.env.local` file
- Stores the PORT environment variable
- Stores the WORKTREE identifier
- Automatically ignored by `.gitignore`

**Example**:
```bash
# Main branch .env.local
PORT=3000
WORKTREE=main

# task-1's .env.local
PORT=3001
WORKTREE=1
```

---

### PORT

**Definition**: The environment variable that specifies the port the dev server listens on.

**Usage in Colyn**:
- Stored in each worktree's `.env.local`
- Value = base port + worktree ID
- Avoids port conflicts between multiple dev servers

**How it is read**:
```javascript
// Automatically read by the dev server
const port = process.env.PORT || 3000;
```

---

### WORKTREE

**Definition**: The environment variable that identifies which worktree the current working directory belongs to.

**Usage in Colyn**:
- Main branch: `WORKTREE=main`
- Other worktrees: `WORKTREE=1`, `WORKTREE=2`, etc.
- Can be used in application logic to distinguish between different worktrees

**Example**:
```javascript
// Used in application code
if (process.env.WORKTREE === 'main') {
  // Main branch-specific logic
}
```

---

## Quick Reference

### Term Categories

**Git Concepts**:
- Worktree
- Main Branch
- Branch Name

**Colyn Core**:
- Worktree ID
- Project Name
- Base Port
- Parallel Vibe Coding
- Minimal Configuration Principle

**tmux Concepts**:
- Session
- Session Name
- Window
- Window Index
- Window Name
- Pane

**Environment Variables**:
- .env.local
- PORT
- WORKTREE

**Tools**:
- Dev Server
- Claude Code

---

### Inference Rules Summary

| Information | Inferred From | Method |
|-------------|--------------|--------|
| Project name | Main directory name | `path.basename(projectRoot)` |
| Main branch | Git repository | `git branch --show-current` |
| Base port | .env.local | `readEnvLocal().PORT` |
| Session name | Project name | `getProjectName()` |
| Window index | Worktree ID | One-to-one mapping |
| Window name | Branch name | `branch.split('/').pop()` |
| Dev command | package.json | `scripts.dev` |

---

## Related Resources

- **Git Worktree**: [Official Documentation](https://git-scm.com/docs/git-worktree)
- **tmux**: [Official Documentation](https://github.com/tmux/tmux/wiki)
- **Colyn GitHub**: [Repository](https://github.com/anthropics/colyn)
