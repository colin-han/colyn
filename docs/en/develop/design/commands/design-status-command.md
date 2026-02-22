# Status Command Design Document

**Created**: 2026-02-22
**Last Updated**: 2026-02-22
**Command**: `colyn status`
**Status**: ✅ Implemented

---

## 1. Overview

### 1.1 Background

The original `colyn status` command displayed git status (modified, staged, branch diff) for the current worktree but could not express workflow phase. In the parallel Vibe Coding workflow, tools like `colyn puppy` need to know which workflow phase each worktree is in, to discover active projects and coordinate task assignment.

### 1.2 Goals

Introduce workflow state persistence to replace the fragile tmux session collaboration approach:

- Support four states: `idle / running / waiting-confirm / finish`
- Persist state to files so it survives tool restarts
- Provide a global index for cross-project discovery of active worktrees
- Support script-friendly JSON output

### 1.3 Command Syntax

```bash
colyn status [get] [--json]
colyn status set <status>
```

- `get` is an optional subcommand; `colyn status` and `colyn status get` are equivalent
- `st` is an alias

---

## 2. Status Values

```typescript
type WorktreeStatus = 'idle' | 'running' | 'waiting-confirm' | 'finish';
```

| Status | Meaning |
|--------|---------|
| `idle` | Idle, no active task in progress |
| `running` | Running, Claude is processing a task |
| `waiting-confirm` | Waiting for user confirmation (human intervention needed) |
| `finish` | Completed, waiting to be merged |

Worktrees that have never had status set default to `idle` without error.

---

## 3. Data Structures

### 3.1 Project-level Status File: `.colyn/status.json`

```json
{
  "updatedAt": "2026-02-22T10:00:00.000Z",
  "worktrees": {
    "task-1": { "status": "running", "updatedAt": "2026-02-22T10:00:00.000Z" },
    "task-2": { "status": "idle",    "updatedAt": "2026-02-22T09:00:00.000Z" },
    "main":   { "status": "idle",    "updatedAt": "2026-02-22T08:00:00.000Z" }
  }
}
```

- **Key naming rule**: Main branch always uses `"main"` (regardless of actual directory name); worktrees use their directory name (e.g., `task-1`)
- Logic: `info.isMainBranch ? 'main' : info.worktreeDir`
- Project-level `updatedAt` equals the time of the last `status set`
- Location: `{projectRoot}/.colyn/status.json`

### 3.2 Global Index File: `~/.colyn-status.json`

```json
{
  "/Users/me/projects/myapp": { "updatedAt": "2026-02-22T10:00:00.000Z" },
  "/Users/me/projects/other": { "updatedAt": "2026-02-21T15:00:00.000Z" }
}
```

- Key is the absolute path to the project root (parent of `.colyn`)
- `updatedAt` is updated in sync with the project-level file
- Used by tools like `colyn puppy` to discover active projects
- Location: `~/.colyn-status.json`

---

## 4. Command Interface

### 4.1 `colyn status get` (default behavior)

Get the workflow status of the current worktree.

**Human-readable output (stderr):**

```
Status:   running
Updated:  2026-02-22 18:00:00
```

When never set:

```
Status:   idle
Updated:  (never set)
```

**JSON output (`--json`, stderr):**

```json
{"worktreeDir":"task-1","worktreeId":1,"status":"running","updatedAt":"2026-02-22T10:00:00.000Z"}
```

When never set, `updatedAt` is `null`:

```json
{"worktreeDir":"task-1","worktreeId":1,"status":"idle","updatedAt":null}
```

**JSON field descriptions:**

| Field | Type | Description |
|-------|------|-------------|
| `worktreeDir` | `string` | Effective key (main branch is `"main"`, others are directory name) |
| `worktreeId` | `number` | Worktree ID (0 for main branch) |
| `status` | `string` | Current status value |
| `updatedAt` | `string \| null` | Last update time (ISO 8601), null if never set |

### 4.2 `colyn status set <status>`

Set the workflow status of the current worktree.

**Success output (stderr):**

```
✓ Status updated: running
```

**Invalid status error:**

```
✗ Invalid status value: invalid
  Valid statuses: idle, running, waiting-confirm, finish
```

---

## 5. Commander.js Implementation Notes

### 5.1 Option Parsing Issue

**Problem**: `--json` in `colyn status get --json` had no effect.

**Root cause**: Commander.js v12 parses all known options of the parent command before routing to the subcommand. When both `status` (parent) and `get` (subcommand) define `--json`, the `--json` in `status get --json` is consumed by the parent, leaving the subcommand with empty options.

**Solution**:

- Define `--json` only on the parent `statusCmd`
- Do NOT define `--json` on `getCmd`
- In the `get` action, read via `command.parent?.opts().json`

```typescript
// ✅ Correct: only define --json on parent command
statusCmd.option('--json', t('commands.status.jsonOption'));

// get subcommand reads option from parent
statusCmd.command('get').action(async (_options, command: Command) => {
  const json = (command.parent?.opts() as { json?: boolean } | undefined)?.json;
  await getStatusCommand({ json });
});
```

Both calling styles work correctly:

- `colyn status --json` → parent action reads `options.json` directly
- `colyn status get --json` → parent consumes `--json`, get action reads from `command.parent.opts()`

---

## 6. Automatic Status Reset

### 6.1 Trigger Points

The following commands automatically reset the corresponding worktree status to `idle` after successful execution:

| Command | Reset Timing |
|---------|-------------|
| `colyn add` | After creating worktree and installing dependencies |
| `colyn checkout` | After successful git checkout |
| `colyn merge` | After worktree is merged into main branch |

### 6.2 Design Principles

All automatic resets silently ignore errors with `try/catch`, so a failed status update never breaks the main command flow:

```typescript
// ✅ Correct: status update failure doesn't affect main flow
try {
  await setWorktreeStatus(paths.configDir, `task-${id}`, paths.rootDir, 'idle');
} catch {
  // Status update failure does not affect main flow
}
```

**Special case**: When `checkout` finds the target branch is already the current branch, it returns early without resetting status — this is correct behavior since no actual switch occurred.

---

## 7. Core Module: `src/core/worktree-status.ts`

Exported interface:

```typescript
export type WorktreeStatus = 'idle' | 'running' | 'waiting-confirm' | 'finish';

export const VALID_STATUSES: WorktreeStatus[] = [
  'idle', 'running', 'waiting-confirm', 'finish'
];

/**
 * Get worktree status (returns idle by default if not set)
 */
export async function getWorktreeStatus(
  configDir: string,
  worktreeDir: string
): Promise<{ status: WorktreeStatus; updatedAt: string | null }>

/**
 * Set worktree status and synchronously update the global index
 */
export async function setWorktreeStatus(
  configDir: string,
  worktreeDir: string,
  projectPath: string,
  status: WorktreeStatus
): Promise<void>
```

Internal logic of `setWorktreeStatus`:

1. Read `.colyn/status.json` (initialize empty structure if not found)
2. Update `worktrees[worktreeDir]` (status + updatedAt = now)
3. Update project-level `updatedAt = now`
4. Write `.colyn/status.json`
5. Read `~/.colyn-status.json` (initialize as `{}` if not found)
6. Update `data[projectPath].updatedAt = now`
7. Write `~/.colyn-status.json`

---

## 8. Integration with the info Command

The `colyn info` command integrates status reading, providing `status` and `last-updated-at` fields:

```bash
$ colyn info
📁 Project:       myapp
🔢 Worktree ID:   1
📁 Worktree Dir:  task-1
🌿 Branch:        feature/login
⚡ Status:        running
📅 Last Updated:  2026-02-22 18:00:04
```

These fields can be used in scripts via `--field` and `--format`:

```bash
# Get status
$ colyn info -f status
running

# Use in template
$ colyn info --format="[{status}] {project}/{worktree-dir}"
[running] myapp/task-1
```

---

## 9. Exit Codes

| Exit Code | Description |
|-----------|-------------|
| 0 | Success |
| 1 | Not in a colyn project / invalid status value |
