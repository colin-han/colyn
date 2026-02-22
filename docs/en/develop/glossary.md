# Colyn Glossary

This document defines common terms and concepts used in the Colyn project.

---

## Git Related Terms

### Worktree

**Definition**: A Git feature that allows checking out multiple branches from the same repository to different directories simultaneously.

**Origin**: Feature introduced in Git 2.5+ (`git worktree`)

**Usage in Colyn**:
- Colyn's core functionality is simplifying Git worktree management
- Each worktree corresponds to an independent working directory
- Each worktree can run an independent development server

**Example**:
```bash
# Git native command
git worktree add ../feature-branch feature/login

# Colyn simplified command
colyn add feature/login
```

**Related Documentation**:
- [Git worktree Official Documentation](https://git-scm.com/docs/git-worktree)

---

### Main Branch

**Definition**: The project's primary development branch, usually `main` or `master`.

**Origin**: Git branch management concept

**Usage in Colyn**:
- Main branch is stored separately in a subdirectory with the same name under project root
- For example, if project root is `my-app/`, main branch is at `my-app/my-app/`
- Main branch info (branch name, port) serves as reference for other worktrees

**Inference method**:
```typescript
// Infer from main branch directory's current branch
getMainBranch() => execSync('git branch --show-current', { cwd: mainDir })
```

**Related terms**: [Base Port](#base-port)

---

### Branch Name

**Definition**: Git branch name, used to identify different development lines.

**Origin**: Git branch management concept

**Usage in Colyn**:
- Used to specify target branch when creating worktree
- Used to generate tmux window name
- Supports local branches, remote branches, or new branches

**Naming convention examples**:
```
feature/auth           # New feature
bugfix/user/login      # Bug fix
feature/ui/dark-mode   # UI feature
main                   # Main branch
```

**Related terms**: [Window Name](#window-name)

---

## Colyn Core Concepts

### Worktree ID

**Definition**: Unique numeric identifier assigned by Colyn to each worktree.

**Origin**: Colyn custom concept

**Usage in Colyn**:
- Main branch is fixed as ID `0` (displayed as `0-main`)
- Other worktrees start from `1` and increment
- ID used for directory naming (`task-1`, `task-2`, etc.)
- ID used for port allocation (base port + ID)
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

**Related terms**: [Window Index](#window-index)

---

### Project Name

**Definition**: Name of the Colyn project, used to identify the entire project.

**Origin**: Colyn custom concept

**Inference method**:
```typescript
// Infer from project root directory name
getProjectName() => path.basename(projectRoot)
```

**Usage in Colyn**:
- Used as directory name
- Used as session name in tmux integration
- Used in various prompt messages

**Example**:
```bash
# Project structure
my-task-app/              # ← Project name = "my-task-app"
├── my-task-app/          # Main branch directory
└── worktrees/            # Worktree directory
```

**Related terms**: [Session Name](#session-name)

---

### Base Port

**Definition**: Development server port used by main branch, also the basis for allocating other ports.

**Origin**: Colyn custom concept

**Inference method**:
```typescript
// Read from main branch's .env.local
getBasePort() => readEnvLocal(mainDir).PORT
```

**Usage in Colyn**:
- Main branch uses base port
- Worktree port = base port + worktree ID
- Avoids port conflicts between multiple development servers

**Example**:
```bash
# Main branch .env.local
PORT=3000

# Each worktree's port
main:    3000  (base port)
task-1:  3001  (3000 + 1)
task-2:  3002  (3000 + 2)
task-3:  3003  (3000 + 3)
```

**Related terms**: [Dev Server](#dev-server)

---

### Parallel Vibe Coding

**Definition**: A working mode using Colyn + Git worktree to enable multiple AIs (like Claude Code) to develop different features in parallel.

**Origin**: Term coined by Colyn project

**Core characteristics**:
1. Multiple worktrees exist simultaneously
2. Each worktree runs an independent Claude Code instance
3. Each worktree has an independent development server
4. Use tmux to manage all worktrees in one window

**Workflow**:
```bash
# 1. Create multiple parallel branches
colyn add feature/auth
colyn add feature/tasks
colyn add feature/dashboard

# 2. Start Claude Code in each worktree
# 3. Multiple AIs work simultaneously
# 4. Periodically merge back to main branch
```

**Reference documentation**:
- `blog/parallel-vibe-coding-with-colyn.md`
- `blog/parallel-vibe-coding-2-with-tmux.md`

**Related terms**: [Claude Code](#claude-code)

---

### Minimal Configuration Principle

**Definition**: Don't store configuration that can be automatically inferred.

**Origin**: Colyn project design principle

**Core philosophy**:
- Only store information that cannot be automatically inferred
- If it can be inferred from environment, don't store it
- If it can be dynamically obtained, don't cache it

**Practice**:
- ❌ Don't store project name (infer from directory name)
- ❌ Don't store main branch (infer from git)
- ❌ Don't store base port (read from .env.local)
- ❌ Don't store session name (equals project name)
- ✅ Currently project is completely zero-configuration

**Reference documentation**:
- `CLAUDE.md#Configuration Design Principles`
- `.claude/logs/minimal-config-principle-20260124.md`

---

## Development Tool Terms

### Dev Server

**Definition**: Web server for local development, usually supports hot reloading.

**Origin**: General web development concept

**Usage in Colyn**:
- Each worktree runs an independent dev server
- Port specified via PORT environment variable
- Auto-starts in tmux integration (detects `dev` script in `package.json`)

**Common frameworks**:
- Next.js: `npm run dev`
- Vite: `npm run dev`
- Create React App: `npm start`

**Port allocation**:
```bash
# Each worktree's .env.local
PORT=3001  # task-1
PORT=3002  # task-2
PORT=3003  # task-3
```

**Related terms**: [Base Port](#base-port)

---

### Claude Code

**Definition**: Anthropic's official Claude AI command-line tool for conversing with Claude and collaborative programming in the terminal.

**Origin**: Anthropic official tool

**Usage in Colyn**:
- Runs independently in each worktree
- Enables Parallel Vibe Coding
- Occupies left pane (60%) in tmux integration

**Usage scenario**:
```bash
# Start Claude Code in worktree
cd worktrees/task-1
claude

# Claude helps develop current branch's feature
> Help me implement user authentication...
```

**Related terms**: [Parallel Vibe Coding](#parallel-vibe-coding)

---

## tmux Related Terms

### Session (tmux Session)

**Definition**: tmux's top-level container, contains one or more windows.

**Origin**: tmux terminal multiplexer

**Usage in Colyn**:
- One Colyn project corresponds to one tmux session
- Session name = Project name
- All worktree windows are in the same session

**Commands**:
```bash
# View all sessions
tmux ls

# Attach to session
tmux attach -t my-task-app

# Detach session
Ctrl-b d
```

**Hierarchy**:
```
Session (my-task-app)
  └─ Window 0 (main)
  └─ Window 1 (auth)
  └─ Window 2 (tasks)
```

**Related terms**: [Session Name](#session-name), [Window](#window)

---

### Session Name

**Definition**: tmux session identifier, used for attaching and managing sessions.

**Origin**: tmux terminal multiplexer

**Inference method**:
```typescript
// Always equals project name
getSessionName() => getProjectName()
```

**Usage in Colyn**:
- Automatically uses project name as session name
- User attaches to work environment via session name
- Doesn't need to be stored in configuration file

**Example**:
```bash
# Project name is "my-task-app"
# Session name is automatically "my-task-app"

tmux attach -t my-task-app
```

**Related terms**: [Project Name](#project-name), [Session](#session)

---

### Window (tmux Window)

**Definition**: A tab in tmux session, contains one or more panes.

**Origin**: tmux terminal multiplexer

**Usage in Colyn**:
- One worktree corresponds to one window
- Window 0 is fixed as main branch
- Other window index = worktree ID

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

**Related terms**: [Window Index](#window-index), [Window Name](#window-name), [Pane](#pane)

---

### Window Index

**Definition**: tmux window's numeric identifier, starting from 0.

**Origin**: tmux terminal multiplexer

**Usage in Colyn**:
- Window Index = Worktree ID
- Main branch is fixed as Window 0
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

**Related terms**: [Worktree ID](#worktree-id), [Window](#window)

---

### Window Name

**Definition**: tmux window's readable name, displayed in status bar.

**Origin**: tmux terminal multiplexer

**Extraction method**:
```typescript
// Use last segment of branch name
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
- Automatically extracted from branch name
- Auto-updates when switching branches
- Helps user identify current window's feature

**Status bar display**:
```
[my-task-app] 0:main  1:auth*  2:tasks  3:categories
```

**Related terms**: [Branch Name](#branch-name), [Window](#window)

---

### Pane (tmux Pane)

**Definition**: Split region of tmux window, each pane is an independent terminal.

**Origin**: tmux terminal multiplexer

**Usage in Colyn**:
Each window is fixed into 3 panes:

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

**Pane allocation**:
- Pane 0 (left 60%): Claude Code
- Pane 1 (top right 12%): Dev Server (auto-starts)
- Pane 2 (bottom right 28%): Bash command line

**Navigation shortcuts**:
```bash
Ctrl-b o         # Switch to next pane
Ctrl-b ;         # Switch to last active pane
Ctrl-b ←/→/↑/↓   # Arrow keys to switch pane
```

**Related terms**: [Window](#window), [Dev Server](#dev-server)

---

## Environment Variables

### .env.local

**Definition**: File for storing local environment variables, not committed to Git repository.

**Origin**: Common environment variable management convention

**Usage in Colyn**:
- Each worktree has independent `.env.local` file
- Stores PORT environment variable
- Stores WORKTREE identifier
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

**Related terms**: [Base Port](#base-port), [Dev Server](#dev-server)

---

### PORT

**Definition**: Environment variable specifying development server listening port.

**Origin**: Common environment variable convention

**Usage in Colyn**:
- Stored in each worktree's `.env.local`
- Value = base port + worktree ID
- Avoids port conflicts between multiple development servers

**Reading method**:
```typescript
// Development server automatically reads
const port = process.env.PORT || 3000;
```

**Related terms**: [Base Port](#base-port), [.env.local](#envlocal)

---

### WORKTREE

**Definition**: Environment variable identifying which worktree the current working directory is.

**Origin**: Colyn custom environment variable

**Usage in Colyn**:
- Main branch: `WORKTREE=main`
- Other worktrees: `WORKTREE=1`, `WORKTREE=2`, etc.
- Can be used in application logic to distinguish different worktrees

**Example**:
```typescript
// Use in application code
if (process.env.WORKTREE === 'main') {
  // Main branch specific logic
}
```

**Related terms**: [Worktree ID](#worktree-id), [.env.local](#envlocal)

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

### Inference Rules Summary

| Information | Inference Source | Method |
|-------------|-----------------|--------|
| Project name | Main directory name | `path.basename(projectRoot)` |
| Main branch | Git repository | `git branch --show-current` |
| Base port | .env.local | `readEnvLocal().PORT` |
| Session name | Project name | `getProjectName()` |
| Window index | Worktree ID | One-to-one mapping |
| Window name | Branch name | `branch.split('/').pop()` |
| Dev command | package.json | `scripts.dev` |

---

## Reference Resources

- **Git Worktree**: [Official Documentation](https://git-scm.com/docs/git-worktree)
- **tmux**: [Official Documentation](https://github.com/tmux/tmux/wiki)
- **Colyn Requirements Document**: `docs/requirement-tmux-integration.md`
- **Colyn Design Principles**: `CLAUDE.md`
- **User Stories**:
  - `blog/parallel-vibe-coding-with-colyn.md`
  - `blog/parallel-vibe-coding-2-with-tmux.md`

---

**Document Version**: 1.0
**Last Updated**: 2026-01-24
