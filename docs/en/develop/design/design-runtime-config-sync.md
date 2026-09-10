# Runtime Config Sync Design

**Status**: ✅ Implemented (v3.5)
**Created**: 2026-09-09
**Related commands**: `colyn add`, `colyn update`, `colyn merge` (`colyn release` benefits indirectly via reuse)

---

## 1. Background & Goals

### 1.1 Problem

When Colyn creates a worktree it copies the main branch's runtime config (`.env.local` for npm/pip projects, `application-local.properties` for maven/gradle) and rewrites `PORT` / `WORKTREE`. Afterwards, however, the two sides **drift apart and never sync again**:

- **Main → worktree**: after the user edits `.env.local` on the main branch (new API key, changed value) and runs `colyn update`, code gets rebased/merged but the config file remains the snapshot from creation time — the worktree misses new config and features break.
- **Worktree → main**: while developing in a worktree (especially AI-assisted), new variables are added to `.env.local`; after `colyn merge` merges the code back, the main branch lacks these variables and its dev server fails to start.

### 1.2 Goals

Automatically sync runtime config in both directions at key points of the worktree lifecycle:

- ✅ `add`: copy on creation (existing behavior, i.e. the initial sync — unchanged)
- ✅ `update` (including the post-merge `--update` phase and `executeUpdate` reused by `release`): main → worktree
- ✅ `merge`: after a successful merge, worktree → main, bringing new config back
- ✅ Cover all toolchains: goes through the plugin system, treating `.env.local` and `application-local.properties` alike
- ✅ Conservative and safe: never overwrite existing values, never delete keys; conflicts are reported for human resolution

### 1.3 Terminology

**Runtime Config Sync**: the mechanism that syncs runtime config files (defined by toolchain plugins, e.g. `.env.local`, `application-local.properties`) between the main branch directory and worktree directories. Recorded in `docs/en/develop/glossary.md`.

---

## 2. Core Principle

> **Sync only "adds missing keys" — never overwrite existing values, never delete keys; on value conflicts, skip the key and prompt for manual resolution.**

Rationale:

- Runtime config is not in git; there is no history for a three-way merge, so any "overwrite" can silently lose user data
- The conservative semantics are simple, predictable, and easy to document: "new keys propagate; existing keys' values are owned by their side"
- A value conflict means the two sides diverged intentionally (e.g. the worktree temporarily points to a mock service) — humans decide

---

## 3. Sync Algorithm

### 3.1 Identity Keys

Two keys in each worktree's runtime config are its **identity** — they intentionally differ between sides and **never participate in sync and never count as conflicts**:

| Identity key | Worktree side | Main side |
|--------|--------------|-----------|
| `portKey` | `basePort + worktreeId` | `basePort` |
| `WORKTREE` | `worktreeId` (e.g. `1`) | `main` |

`portKey` comes from `pluginManager.getPortConfig()`: `PORT` for npm/pip, `server.port` for maven/gradle (same convention as the `add` command's config writing in `src/commands/add.ts`).

### 3.2 Diff Rules

**Direction 1: main → worktree** (on `update`, including the post-merge `--update` phase):

| Case | Action |
|------|------|
| Identity keys | always keep the worktree side's values |
| Key exists on main only | ✅ add to worktree |
| Both sides, same value | untouched |
| Both sides, **different value** | ⚠️ skip, list in the diff warning |
| Key exists on worktree only | keep (will be brought back to main by `merge`) |

**Direction 2: worktree → main** (after a successful `merge`):

| Case | Action |
|------|------|
| Identity keys | excluded (main's `PORT` is the base port and `WORKTREE=main`; syncing them is meaningless) |
| Key exists on worktree only | ✅ add to main |
| Both sides, same value | untouched |
| Both sides, **different value** | ⚠️ skip, list in the diff warning (main is authoritative — humans decide) |
| Key exists on main only | untouched |

### 3.3 Writing

- Read the target side's full key-value map → merge in the added keys → write back via `writeRuntimeConfig`
- The npm plugin's `writeRuntimeConfig` updates line by line preserving comments — comments survive
- Since keys are never deleted, all existing keys on the target side are preserved

### 3.4 Missing Files

| Case | Behavior |
|------|------|
| Worktree-side config file missing (main→worktree) | Degrades to a **rebuild**: copy all keys from main + recompute identity keys (`PORT = basePort + id`, `WORKTREE = id`; `basePort` is read from the main-side config's `portKey` value) — consistent with existing `add` and `repair` behavior |
| Main-side config file missing (worktree→main) | Skip the reverse sync with a notice (never create the file on main's behalf) |

---

## 4. Trigger Points & Command Integration

### 4.1 Trigger Overview

| Command | Hook point | Direction |
|------|------|------|
| `colyn add` | **current behavior is the initial sync** (copy on creation), unchanged, no code change | main→worktree |
| `colyn update` (single/batch) | after a successful rebase/merge (inside `updateSingleWorktree` / `updateAllWorktrees`) | main→worktree |
| `colyn merge` | after `mergeWorktreeIntoMain` succeeds, **first** do worktree→main; the `--update` phase (on by default) runs **afterwards**, so other worktrees pick up keys just brought back to main | worktree→main, then main→others |
| `colyn release` | reuses `executeUpdate`, gains sync automatically, no separate handling | main→worktree |

Merge ordering:

```
merge succeeds
  → ① reverse sync: worktree → main (bring back new keys)
  → ② --update phase (default on): main → other worktrees (new keys propagate immediately)
```

### 4.2 Multi-Toolchain & Mono Repo

- Sync runs independently for each `ToolchainContext` returned by `resolveToolchains`; both sides' paths are joined the same way as in `add` (append `ctx.subPath` when it is not `.`)
- **No-toolchain fallback**: when `resolveToolchains` returns nothing but the main branch has a `.env.local`, run the same diff using the read/write helpers in `src/core/env.ts` (identity keys `PORT` / `WORKTREE`), aligned with `add`'s fallback (`configureWorktreeEnv`)

### 4.3 Failure Semantics

- git rebase/merge fails or conflicts → **no sync** (sync only hooks into the success path)
- Sync's own read/write errors → warn, **do not change the command's exit status** (git operations already completed and cannot be rolled back); batch mode continues with the next worktree

---

## 5. Architecture

### 5.1 Module Structure (option A: core module + thin command layer)

```
src/core/runtime-config-sync.ts    # new: pure diff function + sync orchestration
src/commands/update.helpers.ts     # hook: after a successful update
src/commands/merge.ts              # hook: after a successful merge (reverse)
```

### 5.2 Interface Definition

```typescript
// src/core/runtime-config-sync.ts

export type SyncDirection = 'main-to-worktree' | 'worktree-to-main';

/** A conflict item: the key plus both sides' values, for output */
export interface ConfigConflict {
  key: string;
  mainValue: string;
  worktreeValue: string;
}

/** Sync result: consumed by the command layer for output */
export interface SyncResult {
  /** keys added to the target side this time (in insertion order) */
  addedKeys: string[];
  /** keys skipped due to different values */
  conflicts: ConfigConflict[];
  /** the worktree-side file did not exist; this run was a rebuild */
  rebuilt: boolean;
}

/**
 * Pure function: compute the sync diff of two config maps (no filesystem access)
 *
 * Identity keys are excluded in both directions — they never appear in toAdd / conflicts.
 */
export function diffRuntimeConfig(
  mainConfig: Record<string, string>,
  worktreeConfig: Record<string, string>,
  direction: SyncDirection,
  identityKeys: string[]
): { toAdd: Record<string, string>; conflicts: ConfigConflict[] };

/**
 * Orchestration: read → diff → write; returns the result for the command layer.
 * Returns null when skipped (e.g. main-side config file missing).
 *
 * With ctx (a toolchain context), goes through pluginManager's read/writeRuntimeConfig;
 * without ctx, falls back to .env.local (src/core/env.ts).
 * Rebuild (worktree-side file missing) recomputes identity keys from basePort + worktreeId.
 */
export async function syncRuntimeConfig(params: {
  mainDir: string;          // main-side directory (already includes subPath in Mono Repo)
  worktreePath: string;     // worktree-side directory (already includes subPath in Mono Repo)
  direction: SyncDirection;
  worktreeId: number;       // to recompute identity keys on rebuild
  identityKeys: string[];   // e.g. ['PORT', 'WORKTREE']
  ctx?: ToolchainContext;   // toolchain context; omit for the .env.local fallback
}): Promise<SyncResult | null>;
```

Design principles:

1. **diff is a pure function**: conflict semantics get thorough unit tests without mocking the filesystem
2. **PluginManager untouched**: it stays a "plugin forwarding layer" (`runInstall`/`runLint` are pure forwarding); diff strategy is colyn core business logic
3. **Thin command layer**: each of the three hook points passes params, gets a result, prints notices

---

## 6. CLI Options & Config

### 6.1 Command Options

| Command | New option | Default |
|------|---------|------|
| `colyn update` | `--sync-config` / `--no-sync-config` | enabled |
| `colyn merge` | `--sync-config` / `--no-sync-config` | enabled |
| `colyn add` | none (copy-on-create is existing behavior) | — |

Option meaning: whether to sync runtime config during the command (covering merge's reverse sync and the sync inside its subsequent `--update` phase).

### 6.2 settings.json Defaults

```jsonc
{
  "commands": {
    "update": { "syncConfig": true },
    "merge": { "syncConfig": true }
  }
}
```

- Uses the existing three-source resolution (`applyCommandDefaults`): explicit CLI > settings (incl. `branchOverrides`) > built-in default (true)
- **Migration decision**: `CommandsConfigSchema` only gains optional boolean fields (with defaults) — per project conventions this is the "no Migration needed" case; `CURRENT_CONFIG_VERSION` stays 4

---

## 7. Output & i18n

### 7.1 Output Policy

**Print only when something actually happened (additions/conflicts/rebuild); stay silent on no-change** — avoids flooding `colyn update` (all by default); `-v` / `--verbose` shows details.

**update (main→worktree) example**:

```
✓ Runtime config synced: 2 keys added (API_KEY, BASE_URL)
⚠ 1 key differs between the two sides, skipped: DATABASE_URL
```

**merge (worktree→main) example**:

```
✓ Brought 1 new config key back to the main branch: OPENAI_API_KEY
⚠ 1 key differs between the two sides, skipped: DATABASE_URL
```

**Batch mode**: one line per worktree; conflicting keys go into that worktree's warning line; no per-key expansion.

### 7.2 i18n Keys

Added to both `src/i18n/locales/zh-CN.ts` and `en.ts`. **The implemented key structure deviates from the original design**: the sync notices live in a top-level `runtimeConfigSync` node (not the originally designed `commands.<cmd>.syncConfig*` per-command nodes), because the same messages are shared by the `update` and `merge` command layers and the core layer (the multi-context entry `syncWorktreeRuntimeConfigs`); placing them at the top level avoids duplicated maintenance. Option descriptions remain in their per-command nodes:

```typescript
// Top-level runtimeConfigSync node: sync notices (shared by update / merge / core layers)
runtimeConfigSync: {
  added: 'Runtime config synced: {{count}} keys added ({{keys}})',
  broughtBack: 'Brought {{count}} new config keys back to the main branch: {{keys}}',
  conflict: '{{count}} keys differ between the two sides, skipped: {{keys}}',
  rebuilt: 'Worktree runtime config missing, rebuilt from the main branch',
  mainMissing: 'Main branch runtime config file missing, sync skipped',
  error: 'Runtime config sync failed: {{error}}',
  noChange: 'Runtime config: no changes',
},

// Option descriptions live in their per-command nodes
commands.update.syncConfigOption: 'Sync runtime config from main branch (default)',
commands.update.noSyncConfigOption: 'Skip runtime config sync',
commands.merge.syncConfigOption: 'Sync runtime config during merge (default)',
commands.merge.noSyncConfigOption: 'Skip runtime config sync',
```

---

## 8. Test Strategy

| Layer | Coverage |
|------|------|
| `diffRuntimeConfig` unit tests | bidirectional key propagation, identity-key exclusion (neither in toAdd nor conflicts), value-conflict skipping, empty maps, one side empty, key order |
| `syncRuntimeConfig` orchestration tests | mock `pluginManager`: normal sync, rebuild path (worktree file missing + identity-key recompute), returning null (main file missing), fallback path (no ctx → `.env.local`) |
| `update` command layer | sync triggers after git success, no sync on git failure, `--no-sync-config` honored, partial batch failure doesn't block other worktrees' sync |
| `merge` command layer | reverse sync triggers after `mergeWorktreeIntoMain` succeeds; reverse-before-`--update` ordering |
| Manual verification | `LANG=zh_CN.UTF-8` / `LANG=en_US.UTF-8` bilingual output |

---

## 9. Out of Scope

- ❌ Interactive conflict resolution (a prompt to pick a side)
- ❌ Snapshot-based three-way merge (recording last-sync state to tell "who changed it")
- ❌ Syncing arbitrary custom file lists (e.g. a `settings.syncFiles` config)
- ❌ Sync in `remove` / `checkout` / `switch` commands (no sync semantics, or behavior already exists)
- ❌ Key-deletion propagation (a key removed on main does not propagate to worktrees)

---

## 10. Acceptance Criteria

### 10.1 Functionality

- [x] After `colyn update`: keys newly added on main appear in the worktree; identity keys (`PORT`/`WORKTREE` or `server.port`/`WORKTREE`) keep the worktree side's values
- [x] Keys with different values are skipped with a diff warning
- [x] After `colyn merge`: keys newly added in the worktree appear in the main branch's runtime config
- [x] In the `merge --update` phase: other worktrees receive keys just brought back to main
- [x] A missing worktree-side config file is rebuilt from main with recomputed identity keys
- [x] maven/gradle projects (`application-local.properties`) behave identically to npm/pip projects (`.env.local`)
- [x] Mono Repo sub-projects sync independently

### 10.2 Switches & Safety

- [x] `--no-sync-config` fully disables sync; the settings default resolves via three-source resolution
- [x] Sync never overwrites existing values, never deletes keys
- [x] A sync failure does not change the command's exit status; batch mode continues
- [x] `.env.local` remains excluded from git dirty checks (the existing `IGNORED_STATUS_BASENAMES` mechanism is not broken)

### 10.3 Quality

- [x] Bilingual messages (zh-CN / en) complete, no hardcoded text
- [x] `volta run yarn lint` passes with 0 errors
- [x] No `any` types

> Acceptance basis: unit tests (`runtime-config-sync.test.ts` with 19 cases, `update.helpers.test.ts` with 3 cases; all 183 cases across 14 files pass) plus manual end-to-end verification 6/6 PASS (add initial copy, update forward sync, merge reverse bring-back and conflict skipping, the `--no-sync-config` switch, bilingual output).

---

## 11. Key Design Decisions

| Decision | Choice | Rationale |
|------|------|------|
| Conflict semantics | add-missing, never overwrite, never delete | runtime config has no git history; overwriting risks silent data loss; conservative semantics are predictable |
| Value-conflict handling | skip + print the diff | user's choice; loses no data, never mis-overwrites |
| Sync direction | bidirectional (update main→worktree; merge worktree→main) | covers both real drift scenarios |
| Scope | runtime config sync (plugin system), not just `.env.local` | plugins already abstract formats into key-value; diff is format-agnostic; Java projects benefit for free |
| Architecture | new `src/core/runtime-config-sync.ts` (pure function + orchestration) | matches the core-service + thin-command layering; PluginManager stays a pure forwarder; pure diff is testable |
| Merge ordering | reverse sync before the `--update` phase | keys just brought back to main propagate to other worktrees immediately |
| No-change output | silent | `update` is all-by-default; avoid flooding |
| Config migration | not needed (optional fields only) | per project conventions, optional fields are backward compatible |
| `add` command | unchanged | copy-on-create is the initial sync; the worktree doesn't exist yet, so no conflicts are possible |
