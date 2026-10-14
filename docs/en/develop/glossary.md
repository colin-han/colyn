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
- Its last `/`-separated segment (branch short name) is used in the iTerm2 tab title
- Supports local branches, remote branches, or new branches
- Format is `{category}/{name}`, where category uses the Category's `name` field

**Naming convention examples**:
```
feature/auth           # New feature
bugfix/user/login      # Bug fix
feature/ui/dark-mode   # UI feature
main                   # Main branch
```

**Related terms**: [Branch Category](#branch-category)

---

## Colyn Core Concepts

### Worktree ID

**Definition**: Unique numeric identifier assigned by Colyn to each worktree.

**Origin**: Colyn custom concept

**Usage in Colyn**:
- Main branch is fixed as ID `0` (displayed as `0` in `colyn list`; displayed as `0-main` in the worktree details table of `colyn list-project`)
- Other worktrees start from `1` and increment
- ID used for directory naming (`{prefix}-{id}`, default prefix `task`, i.e. `task-1`, `task-2`, etc.; see [Worktree prefix](#worktree-prefix))
- ID used for port allocation (base port + ID)
- ID used in `colyn <N>` to jump to the corresponding worktree

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

**Related terms**: [Base Port](#base-port)

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
- Used in the iTerm2 tab title
- Used in various prompt messages

**Example**:
```bash
# Project structure
my-task-app/              # ← Project name = "my-task-app"
├── my-task-app/          # Main branch directory
└── worktrees/            # Worktree directory
```

**Related terms**: [Worktree ID](#worktree-id)

---

### Worktree prefix

**Definition**: The part of the worktree directory name `{prefix}-{id}` before `{id}`, set by the `worktreePrefix` setting, default `task`.

**Origin**: Colyn custom concept

**Usage in Colyn**:
- Set via `colyn config set worktreePrefix <prefix>` (project level overrides user level)
- Must start with a letter and contain only letters, digits, underscores and hyphens
- Existing directories are not recognized after a change; `colyn repair` renames git-registered directories with the old prefix to the new one
- All code that builds or parses directory names must go through `src/core/worktree-naming.ts`; hard-coding `task-` is forbidden

**Example**:
```bash
colyn config set worktreePrefix edt
colyn repair          # task-1 → edt-1
colyn add feature/x   # creates worktrees/edt-2
```

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
4. Use `colyn <N>` to jump quickly between worktrees

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
- ✅ Currently project is completely zero-configuration

**Reference documentation**:
- `CLAUDE.md#Configuration Design Principles`
- `.claude/logs/minimal-config-principle-20260124.md`

---

### Command Defaults Config

**Definition**: Default values for boolean options of subcommands, stored under the `commands.*` nodes in `settings.json`, at the project or user level.

**Origin**: Introduced in Colyn v3.3

**Usage in Colyn**:
- Supported commands: `merge`, `update`, `release`, `checkout`
- Supported fields: Boolean option flags per command (e.g., `build`, `rebase`, `fetch`, `all`)
- Top-level `verbose` field is shared across all commands
- Can be overridden per branch via `branchOverrides`

**Example**:
```jsonc
{
  "version": 4,
  "verbose": true,
  "commands": {
    "merge": { "build": false },
    "update": { "all": false }
  }
}
```

**Reference**: `docs/en/develop/design/design-command-defaults.md`

**Related terms**: [Three-Source Resolution](#three-source-resolution), [Minimal Configuration Principle](#minimal-configuration-principle)

---

### Three-Source Resolution

**Definition**: A three-level priority chain for resolving boolean CLI options, checked in order:

1. **Explicit CLI flag**: User typed `--xxx` or `--no-xxx` (commander's `getOptionValueSource() === 'cli'`)
2. **settings.json config**: Merged value from `commands.<cmd>.<key>` (including branchOverrides)
3. **Command built-in default**: Fallback value passed in the command implementation

**Origin**: Introduced in Colyn v3.3

**Core principle**: An explicit CLI flag always wins; config file values only apply when the user has not explicitly specified the option.

**Implementation**:
```typescript
// source === 'cli' → keep user input, no override
// source !== 'cli' && config has value → use config value
// otherwise → use built-in default
applyCommandDefaults(cmd, opts, configDefaults, builtinDefaults)
```

**Reference**: `docs/en/develop/design/design-command-defaults.md`

**Related terms**: [Command Defaults Config](#command-defaults-config)

---

### Runtime Config Sync

**Definition**: The mechanism that syncs runtime config files (defined by toolchain plugins, e.g. `.env.local` for npm/pip projects, `application-local.properties` for maven/gradle projects) between the main branch directory and worktree directories.

**Origin**: Colyn core command mechanism

**Core rules**:
- Sync only "adds missing keys" — **never overwrite existing values, never delete keys**
- When a key exists on both sides with different values, skip it and print a diff notice (humans decide)
- `PORT` (or `server.port`) and `WORKTREE` are identity keys — they always keep the owning side's value and never participate in sync

**Trigger points**:
| Command | Direction |
|------|------|
| `colyn add` | copies main config on creation (the initial sync) |
| `colyn update` (incl. merge's post `--update` phase) | main → worktree |
| `colyn merge` (after a successful merge) | worktree → main |

**Example**:
```bash
$ colyn update
✔ Runtime config synced: 2 keys added (API_KEY, BASE_URL)
⚠ 1 key differs between sides, skipped: DATABASE_URL
```

**Configuration**: Enabled by default; disable with `--no-sync-config`, or set defaults via `commands.update.syncConfig` / `commands.merge.syncConfig` in `settings.json`.

**Reference**: `docs/en/develop/design/design-runtime-config-sync.md`

**Related terms**: [.env.local](#envlocal), [Base Port](#base-port), [Worktree ID](#worktree-id), [Command Defaults Config](#command-defaults-config)

---

### Branch Category

**Definition**: A classification label describing the purpose of a branch. It is the foundational concept in Colyn's Todo and branch naming system.

**Origin**: Colyn custom concept

**Data structure**:
```typescript
interface BranchCategory {
  name: string;   // Category name, used in Branch Name and Todo ID
  abbr?: string;  // Display abbreviation (may include emoji), for UI display only
}
```

**Default values**:
| name | abbr |
|------|------|
| `feature` | `✨feat` |
| `bugfix` | `🐛fix` |
| `refactor` | `♻️ref` |
| `document` | `📝doc` |

**Relationship with Branch Name and Todo ID**:
- Branch Name format: `{category.name}/{taskName}` → `feature/user-auth`
- Todo ID format: `{category.name}/{taskName}` → `feature/user-auth`
- The two formats are identical — a Todo and its corresponding branch share the same identifier

**Scope of abbr** (UI display only, written to no data):
- Type selection list: displays `✨feat (feature)`
- `todo list` table: displays `✨feat`

**Configuration**: Defined in the `branchCategories` field of `settings.json`, supports project-level and user-level configuration, merged and deduplicated by `name`.

**View current list**:
```bash
colyn config get branchCategories
```

**Related terms**: [Branch Name](#branch-name), [Todo ID](#todo-id)

---

### Todo Backend

**Definition**: The storage abstraction layer for Colyn's Todo feature. Defines a unified `TodoBackend` interface that allows todo data to be stored in different backend systems (local files or IMS).

**Origin**: Introduced in Colyn v3.4

**Usage in Colyn**:
- Only one backend is active at any time, specified by the `todo.backend` configuration field
- Two built-in implementations: `local` (default) and `github` (GitHub Issues)
- All consumers (`todo`/`co`/`add`) only depend on the interface and are unaware of the specific implementation

**Built-in Backends**:

| Name | Description |
|------|-------------|
| `local` | Default implementation, stores todos in `.colyn/todo.json` and `.colyn/archived-todo.json` |
| `github` | Maps todos to GitHub Issues, reads and writes via gh CLI |

**Configuration**:
```jsonc
{
  "todo": {
    "backend": "local"  // 'local' | 'github'
  }
}
```

**Reference**: `docs/en/develop/design/design-todo-backend.md`

**Related terms**: [IMS / Issues Management System](#ims--issues-management-system), [Todo ID](#todo-id)

---

### IMS / Issues Management System

**Definition**: An external system for tracking and managing software development tasks, bugs, and feature requests — such as GitHub Issues. In Colyn, it represents a category of Todo backend implementation backed by an external issue tracker.

**Origin**: Introduced as a concept in Colyn v3.4

**Usage in Colyn**:
- Represents the class of implementations that use an external issue management system as the todo storage backend
- Currently supported IMS: GitHub Issues (`github` backend)
- IMS backends have `assignsName=true` — the task ID (e.g., issue number) is back-filled by the IMS

**Example**:

```
colyn type "feature" → GitHub Issues label "enhancement"
todo ID "feature/42" ← back-filled from GitHub issue #42
```

**Reference**: `docs/en/develop/design/design-todo-backend.md`

**Related terms**: [Todo Backend](#todo-backend)

---

### Todo ID

**Definition**: Unique identifier for a Colyn Todo task, with the format `{category}/{name}`.

**Origin**: Colyn custom concept

**Format**:
```
{category.name}/{taskName}

Examples:
  feature/user-auth
  bugfix/login-crash
  refactor/api-layer
```

**Equivalence with Branch Name**:
- Todo ID and its corresponding Branch Name are identical
- `colyn todo start feature/user-auth` uses the ID directly as the branch name to create the branch
- When using `colyn add` to select a pending todo, the Todo ID is used directly as the branch name

**Usage examples**:
```bash
# Add todo (type uses category.name)
colyn todo add feature/user-auth "Implement JWT authentication"

# Start task and create branch via Todo ID
colyn todo start feature/user-auth

# Mark as complete via Todo ID
colyn todo complete feature/user-auth
```

**Related terms**: [Branch Category](#branch-category), [Branch Name](#branch-name)

---

## Development Tool Terms

### Dev Server

**Definition**: Web server for local development, usually supports hot reloading.

**Origin**: General web development concept

**Usage in Colyn**:
- Each worktree runs an independent dev server
- Port specified via PORT environment variable
- Start command is detected by the toolchain plugin (e.g. `dev` script in `package.json`)

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
- Branch Category
- Todo ID
- Todo Backend
- IMS / Issues Management System
- Parallel Vibe Coding
- Minimal Configuration Principle
- Command Defaults Config
- Three-Source Resolution
- Runtime Config Sync

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
| Branch short name | Branch name | `branch.split('/').pop()` |
| Dev command | package.json | `scripts.dev` |
| Branch Name | Category + task name | `{category.name}/{name}` |
| Todo ID | Category + task name | `{category.name}/{name}` (same as Branch Name) |

---

## Reference Resources

- **Git Worktree**: [Official Documentation](https://git-scm.com/docs/git-worktree)
- **Colyn Design Principles**: `CLAUDE.md`
- **User Stories**:
  - `blog/parallel-vibe-coding-with-colyn.md`

---

**Document Version**: 1.2
**Last Updated**: 2026-10-14
