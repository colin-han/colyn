# Todo Backend Design Document

**Created**: 2026-06-02
**Status**: ✅ Implemented

---

## 1. Overview

Colyn's Todo feature originally stored all tasks in local JSON files (`.colyn/todo.json` and `.colyn/archived-todo.json`). This design abstracts Todo storage as a pluggable **Todo backend**, allowing task data to be stored in different backend systems (e.g., GitHub Issues).

Core design principles:

- **Unified interface**: There is no "local vs IMS" dichotomy. Local storage is refactored as a built-in default backend (`local`), and GitHub Issues is simply another implementation (`github`).
- **Single active backend**: At any given time, only one backend is active, specified by the `todo.backend` field in `.colyn/settings.json`, defaulting to `local`.
- **Transparent to consumers**: Commands such as `todo`, `checkout`, and `add` only depend on the `TodoBackend` interface and are unaware of the specific implementation.

---

## 2. Architecture

```
                  ┌─────────────────────────────────────┐
  Consumers        │  todo.ts   checkout.ts   add.ts      │
  (existing cmds)  └──────────────────┬──────────────────┘
                                      │ interface only
                           ┌──────────▼───────────┐
                           │  TodoBackend (interface)│
                           │  registry / factory    │
                           └──────────┬────────────┘
                        ┌─────────────┴──────────────┐
             ┌──────────▼─────────┐      ┌────────────▼───────────┐
             │ LocalFileBackend   │      │ GitHubIssuesBackend     │
             │ (default, todo.json)│      │ (gh CLI)                │
             └────────────────────┘      └─────────────────────────┘
```

### 2.1 File Structure

| File | Responsibility |
|------|----------------|
| `src/types/todo-backend.ts` | `TodoBackend` and `TodoBackendProvider` interface definitions |
| `src/todo-backends/local.ts` | Local default implementation (reads/writes `todo.json`, with read-time normalization) |
| `src/todo-backends/github.ts` | GitHub Issues implementation (via gh CLI) |
| `src/todo-backends/registry.ts` | Provider registration and factory function `getActiveTodoBackend()` |

This system is **completely independent** from the existing `ToolchainPlugin` system (different responsibilities) and does not reuse `PluginManager`.

---

## 3. Data Model and State Machine

### 3.1 TodoItem

```typescript
interface TodoItem {
  type: string;        // For github = label
  name: string;        // For github = issue number (back-filled by backend)
  message: string;     // First line = title, rest = body (markdown)
  status: TodoStatus;
  createdAt: string;
  startedAt?: string;
  branch?: string;
}

type TodoStatus = 'pending' | 'in-progress' | 'done';
// Archived items are stored in archived-todo.json for local (ArchivedTodoItem adds archivedAt field)
```

### 3.2 Four-State Machine

```
  add        start/co/add      complete                 archive
∅ ──► pending ──────► in-progress ──────► done ──────────────────► archived
                          ▲                  │
                          └──────────────────┘
                              uncomplete
```

| Command | State Transition | Description |
|---------|-----------------|-------------|
| `todo add` | ∅ → pending | Create a new todo |
| `todo start` / `co` selection / `add` selection | pending → in-progress | Create corresponding branch |
| `todo complete` | in-progress → done | Mark as truly completed |
| `todo uncomplete` | done → in-progress | Undo completion |
| `todo archive` | done → archived | Batch archive completed items |
| `todo remove` | any → deleted | |
| `todo edit` | — | Modify message |

### 3.3 autoArchive

`todo.autoArchive` (boolean, default `false`): When enabled, `complete` automatically cascades done to archived (done → archived in one step), removing the need to run `todo archive` manually.

---

## 4. TodoBackend Interface

```typescript
interface TodoBackend {
  name: string;              // 'local' | 'github'
  displayName: string;
  assignsName: boolean;      // IMS=true (back-fills issue number), local=false

  list(filter: 'pending' | 'in-progress' | 'done' | 'archived'): Promise<TodoItem[]>;
  find(type: string, name: string): Promise<TodoItem | null>;

  add(input: { type: string; message: string; name?: string }): Promise<TodoItem>;
  markStarted(type: string, name: string, branch: string): Promise<void>; // → in-progress
  markDone(type: string, name: string): Promise<void>;                    // → done
  reopen(type: string, name: string): Promise<void>;                      // done → in-progress
  edit(type: string, name: string, message: string): Promise<void>;
  remove(type: string, name: string): Promise<void>;
  archive(): Promise<void>;                                               // done → archived (batch)
}
```

Design notes:

1. The interface exposes **colyn semantic actions** (`markStarted`/`markDone`/`reopen`/`archive`) and does not expose IMS internals like open/closed/label — mapping differences are encapsulated within each backend.
2. `assignsName` controls the interaction fork in `colyn todo add` (see Section 6).
3. `list`/`find` in the github backend requires git branch information to distinguish pending/in-progress; the backend obtains this by calling git internally.

---

## 5. TodoBackendProvider Interface (Detection + Initialization Lifecycle)

detect/setup must run before any instance is configured (during init/repair), so **discovery and initialization** are separated from **runtime operations** in two layers, aligned with the toolchain's `detect`/`repairSettings` pattern.

```typescript
export interface TodoBackendDetectContext {
  projectRoot: string;
  mainDirPath: string;       // Main branch directory (git repo with origin)
  nonInteractive: boolean;
}

export interface TodoBackendProvider {
  name: string;              // 'local' | 'github'
  displayName: string;
  /** Whether this backend is available for the current project */
  detect(ctx: TodoBackendDetectContext): Promise<boolean>;
  /** Pre-flight checks + install assistance + login prompts; idempotent; interactive; throws on failure */
  setup(ctx: TodoBackendDetectContext): Promise<void>;
  /** Create a runtime backend instance from config + paths */
  create(paths: ProjectPaths, config: TodoConfig): TodoBackend;
}
```

### 5.1 Provider Behavior Comparison

| | local provider | github provider |
|---|---|---|
| detect | Always returns true | `mainDirPath` git `origin` URL contains `github.com` |
| setup | no-op | See below |
| create | `LocalFileBackend` | `GitHubIssuesBackend(config.github)` |

### 5.2 github provider setup Semantics

The only **hard failure** condition is **gh not installed**; **not logged in is never a failure** (only prints a prompt).

**Interactive mode**:

1. `which gh`: If found, proceed; if not found on macOS and `brew` is detected, ask user to `brew install gh` (install if agreed); on other platforms or without brew, print installation guide URL; if gh is still missing after re-check → **throw error (setup failure)**.
2. `gh auth status`: If logged in, proceed; if not logged in, print prompt "Please run `gh auth login`", **not a failure**.

**Non-interactive mode (fast fail)**: `which gh` not found → **throw error**; not logged in → **no error** (only verifies executable exists).

### 5.3 Registry

`registry.ts` holds all providers and exposes:

- `getProvider(name)` — retrieve provider by name
- `detectProviders(ctx)` — return the list of providers whose `detect()` returns true
- `getActiveTodoBackend(paths)` — find provider by `config.backend`, call `provider.create()`, and wrap with autoArchive decorator

---

## 6. Configuration

```jsonc
// .colyn/settings.json
{
  "todo": {
    "backend": "local",         // 'local' | 'github', default 'local'
    "autoArchive": false,       // default false
    "github": {
      "archivedLabel": null,    // optional; when unconfigured, done = archived (see Section 7.3)
      "typeLabels": {}          // optional; colyn type ↔ GitHub label mapping (see Section 7.5)
    }
  }
}
```

All fields are optional with defaults, maintaining backward compatibility. Repo information is not stored in config — it is inferred from `gh repo view --json nameWithOwner` (following the Minimal Config Principle).

---

## 7. GitHub Backend

### 7.1 State Mapping

| colyn semantic state | Default (no archivedLabel) | With archivedLabel configured |
|---------------------|---------------------------|-------------------------------|
| pending | open, no corresponding branch | open, no corresponding branch |
| in-progress | open, with corresponding branch (git inferred) | open, with corresponding branch |
| done | closed (collapsed with archived) | closed, without that label |
| archived | closed (collapsed with done) | closed + that label |

Distinguishing pending vs in-progress: whether an open issue has a corresponding branch (local or remote, git inferred). No branch = pending, branch exists = in-progress.

### 7.2 gh Command Mapping

| Operation | gh Command |
|-----------|-----------|
| list pending/in-progress | `gh issue list --state open --json number,title,body,labels` + read git branches to distinguish |
| list done/archived | `gh issue list --state closed --json number,title,body,labels` (filter by archivedLabel; exclude wontfix label) |
| add | `gh issue create --title <line1> --body <rest> --label <mappedLabel>` → parse returned issue number to back-fill name |
| markStarted | Near no-op on IMS side (in-progress is inferred from branches) |
| markDone | `gh issue close <n>` |
| reopen | `gh issue reopen <n>` |
| archive | Add archivedLabel to closed issue (no-op if not configured) |
| edit | `gh issue edit <n> --title/--body/--add-label` |
| remove | `gh issue close <n>` + add `wontfix` label (non-destructive; filter out wontfix issues in list) |
| repo inference | `gh repo view --json nameWithOwner` |

### 7.3 archivedLabel Collapse Mode

When `todo.github.archivedLabel` is not configured (default): no management labels are introduced, and **all closed issues are treated as archived**, meaning done and archived collapse into the same state:

- `list('done')` returns empty
- `list('archived')` = all closed issues (excluding wontfix)

When archivedLabel is configured, the distinction applies:

- `done` = closed without that label
- `archived` = closed + that label

### 7.4 Error Handling

When gh is not installed, not logged in, or the current directory is not a GitHub repo, `GitHubIssuesBackend` throws a `ColynError` with i18n-friendly messages guiding users to install/login gh or check their remote.

### 7.5 type ↔ label Mapping

`todo.github.typeLabels` configures the correspondence between colyn `type` and GitHub label names:

```jsonc
"typeLabels": {
  "feature": "enhancement",
  "bug": "bug",
  "chore": "maintenance"
}
```

- **When unconfigured**: treat as same-name (type name = label name), zero-config ready.
- **Write direction (add/edit)**: colyn `type` → mapped `mappedLabel` → used as `--label` value; falls back to type name if not in mapping table.
- **Read direction (list/find)**: build reverse table `label → type` from mapping; an issue may have multiple labels — take the first one that matches the mapping table; use label name as type if nothing matches.
- State management labels (archivedLabel, wontfix) are excluded from type resolution.

---

## 8. Consumer Refactoring

### 8.1 General

All direct calls to `readTodoFile`/`saveTodoFile`/`readArchivedTodoFile`/`saveArchivedTodoFile`/`findTodo` in `checkout.ts`, `add.ts`, and `todo.ts` are replaced with interface calls obtained via `getActiveTodoBackend()`. Business logic and interactions remain unchanged.

### 8.2 `colyn todo add` assignsName Fork

- `assignsName=false` (local): maintains current behavior — user selects type, enters name, writes message.
- `assignsName=true` (github): user only selects type (label) and writes message (first line = title, rest = body); `add()` internally runs `gh issue create` and back-fills `name` = issue number, with Todo ID in the form `feature/42`.

### 8.3 `colyn todo list` Filter Flags

- Default: display pending.
- `--in-progress`, `--done`, `--archived`, `--all`.
- `--completed` renamed to `--done` (no alias retained).

### 8.4 remove Semantics Difference

- local: truly deletes the todo from storage.
- github: `gh issue close` + adds `wontfix` label, filtered out from all colyn lists (non-destructive, recoverable from GitHub side).

---

## 9. init / repair Integration

### 9.1 init

New function `detectAndConfigureTodoBackend(projectRoot, mainDirPath, nonInteractive)`:

1. Run `detect()` for all providers → get available list (local is always included).
2. If available list has **> 1** provider → show Enquirer select for user to choose; otherwise default to local without prompting.
3. Run `provider.setup(ctx)` **first**, then write `settings.todo.backend` **only on success**.
4. If setup throws (interactive: gh cannot be installed) → display error, **do not write** backend (keep default local), rest of init completes normally.

### 9.2 repair

Read `config.backend` → `getProvider(name).setup(ctx)`. If setup throws → catch and warn (non-fatal). **Do not automatically fall back to local** (the goal is to help fix the environment).

### 9.3 Runtime Commands

`todo`/`co`/`add` and other runtime commands **do not run setup proactively**. When gh is not installed/not logged in/not a GitHub repo, they throw `ColynError` with friendly messages.

---

## 10. Migration Strategy

### 10.1 settings.json

All new `todo.*` fields are optional with defaults — backward compatible, **no settings.json migration needed**.

### 10.2 todo.json Data (Read-Time Normalization)

`todo.json` has no independent versioning mechanism. Instead of going through settings migration, `LocalFileBackend` performs a one-time value mapping **at read time**, persisting corrections on the next save.

Mapping rules for old `status: 'completed'`:

| Condition | Mapped Result |
|-----------|--------------|
| Old `status === 'completed'` and local branch still exists | `'in-progress'` |
| Old `status === 'completed'` and local branch does not exist (merged/deleted) | `'done'` |
| Missing `branch` field | `'done'` |

Characteristics: idempotent (re-reading already-normalized in-progress/done values produces no further changes); `archived-todo.json` is unaffected; logic is centralized in `LocalFileBackend` deserialization.

---

## 11. Boundaries and Non-Goals

- **Non-goals**: Two-way sync between local and IMS, offline writes to IMS, multiple active backends simultaneously, IMS backends beyond GitHub (e.g., Jira/GitLab — reserved for future backends).
- **Boundary**: github backend performs gh calls (network) on each read; no caching in this version.
- **Boundary**: in-progress state depends on git branch existence; detection may be inaccurate across devices or after remote branches are cleaned up (a known trade-off, consistent with the Minimal Config Principle).

---

## 12. Related Documentation

- [Glossary](../glossary.md)
- [Config Migration Design](design-config-migration.md)
- [Plugin Toolchain Design](design-plugin-toolchain.md)
- [User Manual: Todo Command](../../manual/04-command-reference/todo.md)
