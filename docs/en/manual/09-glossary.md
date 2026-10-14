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
- Its last `/`-separated segment (branch short name) is used in the iTerm2 tab title
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
- The main branch is fixed as ID `0`: displayed as `0` in `colyn list`; displayed as `0-main` in the worktree details table of `colyn list-project`
- Other worktrees start from `1` and increment
- The ID is used for directory naming (`{prefix}-{id}`; the prefix comes from the `worktreePrefix` setting, default `task`, i.e. `task-1`, `task-2`, etc.)
- The ID is used for port assignment (base port + ID)
- The ID is used in `colyn <N>` to jump to the corresponding worktree

**Example**:
```bash
colyn list

┌────────┬─────────────────────┬──────┐
│ ID     │ Branch              │ Port │
├────────┼─────────────────────┼──────┤
│ 0      │ main                │ 3000 │
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
- Used in the iTerm2 tab title
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
4. `colyn <N>` is used to jump quickly between worktrees

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
- The project currently requires zero configuration

---

## Development Tool Terms

### Dev Server

**Definition**: A web server for local development, typically with hot reload support.

**Usage in Colyn**:
- Each worktree runs an independent dev server
- The port is specified via the PORT environment variable
- The start command is detected by the toolchain plugin (e.g. the `dev` script in `package.json`)

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

**Usage scenario**:
```bash
# Start Claude Code in a worktree
cd worktrees/task-1
claude

# Claude helps develop features for the current branch
> Help me implement user authentication...
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
| Branch short name | Branch name | `branch.split('/').pop()` |
| Dev command | package.json | `scripts.dev` |

---

## Related Resources

- **Git Worktree**: [Official Documentation](https://git-scm.com/docs/git-worktree)
- **Colyn GitHub**: [Repository](https://github.com/anthropics/colyn)
