# Untracked File Sync Design

**Status**: ✅ Implemented
**Created**: 2026-09-18
**Related commands**: `colyn add`, `colyn update`, `colyn merge`, `colyn repair`
**Prior design**: [Runtime Config Sync](design-runtime-config-sync.md) (this design takes over the "syncing arbitrary custom file lists" scope extension from its §9)

---

## 1. Background and Goals

### 1.1 Current Problem

Runtime Config Sync (v3.5) solved bidirectional syncing of key-value files such as `.env.local` / `application-local.properties`. But real projects also have **other local files that are not committed to git**, with the same drift problem between main and worktrees:

- Seed data (`data/seed.json`), local certificates (`certs/local.pem`), localized mock data, etc.
- After adding such a file on main, `colyn update` doesn't bring it to worktrees
- After generating a local file in a worktree, `colyn merge` leaves main without it

These files are not key-value format, so they cannot go through the runtime config diff algorithm — they need a separate sync mechanism.

### 1.2 Design Goals

- ✅ Users **explicitly choose** which files to sync via a config list (with wildcard support)
- ✅ Sync timing is **fully aligned** with Runtime Config Sync (add / update / merge / repair) for a unified mental model
- ✅ Each sync's output contains the **list of synced files** (grouped as copied / conflicted / skipped)
- ✅ Conflict handling is **conservative with zero learning cost**: differing content triggers an error message — no overwriting, no merging, humans decide

### 1.3 Terminology

**Untracked File Sync**: the mechanism that syncs git-ignored/untracked local files between the main branch directory and worktree directories, based on the user-configured `syncFiles` list. Recorded in the project glossary.

---

## 2. Core Design Principle

> **Sync only "copies missing files"; never overwrite existing content, never delete files. When both sides differ (conflict), report an error and let a human handle it.**

Structurally identical to Runtime Config Sync's "only add missing keys, never overwrite" philosophy, with the granularity moved from keys to whole files:

- Untracked files are not in git; there is no history for three-way merges, and any "overwrite" can silently lose user data
- Conservative semantics are simple and predictable: "missing files get copied; when both sides exist and differ, colyn stops and tells you"
- A conflict means the two sides intentionally diverged — a human decides (compare with `diff`, then `cp`)

---

## 3. Sync Algorithm

### 3.1 File List Resolution

Before syncing, resolve the `syncFiles` config into a **candidate file set**:

1. **Wildcard expansion**: patterns are matched against files under the **source-side directory** (determined by direction, see §3.2: the `update` / `repair` direction enumerates the main branch directory, the `merge` reverse direction enumerates the worktree directory; the tracked-file check always runs in the main branch directory, since both directories belong to the same git repository), in the same style as `branchOverrides` (`*` matches one path segment, `**` spans directory segments). Patterns match files only, not directories.
2. **Exclusion rules** (matching files are skipped with a warning):

| Exclusion condition | Detection | Reason |
|---------------------|-----------|--------|
| Tracked file | `git ls-files --error-unmatch <path>` succeeds | Files managed by git are synced by git; colyn stays out |
| Runtime config file | filename matches any active plugin's `getRuntimeConfigFileName()` return value | Already handled by Runtime Config Sync with key-value semantics; going through this mechanism would clobber the `PORT` / `WORKTREE` identity keys via whole-file overwrite |

3. The result is a list of relative paths (relative to the main branch directory), plus a warning entry for each excluded file.

### 3.2 Diff Rules

**Direction 1: main → worktree** (`update` / `repair`, including the post-`merge` `--update` phase):

| Situation | Action |
|-----------|--------|
| Exists on main, missing in worktree | ✅ Copy into the worktree (preserving file permission bits), listed under "copied" |
| Exists on both, content identical (byte-level comparison) | Leave alone, silent |
| Exists on both, **content differs** | ⚠️ **Conflict: error message** (no overwrite, no merge), listing both paths and last-modified times |
| Missing on main, exists in worktree | Leave alone (waits for `merge` to bring it back to main) |

**Direction 2: worktree → main** (after `merge` succeeds):

| Situation | Action |
|-----------|--------|
| Exists in worktree, missing on main | ✅ Copy to main, listed under "copied" |
| Exists on both, content identical | Leave alone, silent |
| Exists on both, **content differs** | ⚠️ **Conflict: error message**; main is authoritative, a human decides |
| Exists on main, missing in worktree | Leave alone (**deletion is never propagated**) |

### 3.3 Conflict Presentation

Conflicting files are **never written to**; the conflict is reported at `outputError` level:

```
✗ 2 files differ between both sides, skipped — manual resolution needed:
  data/seed.json: main(2026-09-18 10:02) / task-1(2026-09-17 18:30)
  certs/local.pem: main(2026-09-10 09:00) / task-1(2026-09-16 14:12)
```

Conflict errors do not affect the main git flow (sync only runs after git operations succeed) and do not change the command's exit status (same semantics as existing sync failures: warn without blocking; batch mode continues with the next worktree). Conflicted files are, however, prominently displayed and the sync result explicitly marks unresolved conflicts.

---

## 4. Trigger Points and Command Integration

### 4.1 Trigger Point Overview

| Command | Hook | Direction |
|---------|------|-----------|
| `colyn add` | copies list-matching files when creating the worktree (worktree doesn't exist yet, no conflict possible); outputs the file list after copying | main→worktree |
| `colyn update` (single/batch) | after rebase/merge succeeds, alongside `syncWorktreeRuntimeConfigs` | main→worktree |
| `colyn merge` | after merging succeeds, **first** worktree→main; the `--update` phase (on by default) runs **afterwards**, so other worktrees pick up files just brought back to main | worktree→main, then main→others |
| `colyn repair` | per worktree, rebuilds missing files (main→worktree), alongside Runtime Config Sync | main→worktree |

Timing notes (merge):

```
merge succeeds
  → ① reverse sync: worktree → main (bring back new files)
  → ② --update phase (on by default): main → other worktrees (new files propagate immediately)
```

### 4.2 Failure Semantics

- git rebase/merge failure or conflict → **sync does not run** (sync only hooks into success paths)
- Sync's own read/write errors → warn, **do not change the command's exit status**; batch mode continues with the next worktree
- Empty `syncFiles` list → the feature is entirely disabled, zero overhead

---

## 5. Architecture

### 5.1 Module Structure

```
src/core/untracked-file-sync.ts    # new: list resolution + diff decision + sync orchestration
src/commands/add.helpers.ts        # hook: copy at creation
src/commands/update.helpers.ts     # hook: call after update succeeds
src/commands/merge.ts              # hook: call after merge succeeds (reverse)
src/commands/repair.helpers.ts     # hook: rebuild missing files
```

### 5.2 Interface Definition

```typescript
// src/core/untracked-file-sync.ts

export type UntrackedFileSyncDirection = 'main-to-worktree' | 'worktree-to-main';

/** Conflict entry: file plus both sides' modification times, for output */
export interface UntrackedFileConflict {
  path: string;          // relative path
  sourceMtime: Date;
  targetMtime: Date;
}

/** Skipped entry: file plus reason */
export interface SkippedUntrackedFile {
  path: string;
  reason: 'tracked' | 'runtime-config' | 'source-missing';
}

/** Sync result: for command-layer output */
export interface UntrackedFileSyncResult {
  /** files copied to the target side this run (relative paths, in list order) */
  copied: string[];
  /** files skipped due to differing content */
  conflicts: UntrackedFileConflict[];
  /** files skipped due to exclusion rules or missing source */
  skipped: SkippedUntrackedFile[];
}

/** Pure function: decide sync actions from both sides' file states (no filesystem access) */
export function planUntrackedFileSync(
  files: Array<{ path: string; sourceExists: boolean; targetExists: boolean; contentEqual: boolean }>
): { toCopy: string[]; conflicts: string[]; sourceMissing: string[] };

/**
 * Orchestration: resolve list → read both sides' states → decide → copy; returns the result for output.
 * Returns null when the feature is disabled (empty syncFiles or no candidate files after resolution).
 */
export async function syncUntrackedFiles(params: {
  mainDir: string;
  worktreePath: string;
  direction: UntrackedFileSyncDirection;
  verbose: boolean;
}): Promise<UntrackedFileSyncResult | null>;
```

Design principles:

1. **Decision is a pure function**: states (existence, content equality) are collected by the fs layer; the decision table is fully unit-testable without mocking the filesystem
2. **No plugin system involvement**: this mechanism operates on plain files (not key-value), is format-agnostic, has no toolchain differences, and lives directly in the core layer
3. **Thin command layer**: each of the four hooks passes parameters, gets results, prints output
4. **Wildcard conversion reuses the existing style**: same pattern-to-regex approach as `branchOverrides`; no new dependencies

---

## 6. CLI Options and Configuration

### 6.1 settings.json

```jsonc
{
  // top level: sync file list (wildcards supported, default [] meaning the feature is off)
  "syncFiles": [".env.*", "data/*.json", "certs/**"],

  // commands section: boolean toggle defaults (three-source resolution)
  "commands": {
    "update": { "syncFiles": true },
    "merge": { "syncFiles": true }
  }
}
```

Naming note: the top-level `syncFiles` is the **file list** (`string[]`); `commands.<cmd>.syncFiles` is the **toggle** (`boolean`) — different levels, different types, symmetric with the `syncConfig` toggle naming style.

### 6.2 Command Options

| Command | New option | Default |
|---------|-----------|---------|
| `colyn update` | `--sync-files` / `--no-sync-files` | enabled |
| `colyn merge` | `--sync-files` / `--no-sync-files` | enabled |
| `colyn add` / `colyn repair` | none (creation/rebuild is the point) | — |

- Uses the existing three-source resolution (`applyCommandDefaults`): explicit CLI > settings (including `branchOverrides`) > built-in default (true)
- The toggle only has an effect when the `syncFiles` list is non-empty
- **Migration assessment**: both the top level and commands only add optional fields (with defaults); per project conventions this is a "no Migration needed" case, `CURRENT_CONFIG_VERSION` stays unchanged

---

## 7. Output and i18n

### 7.1 Output Strategy

**Output only when something actually happened (copy/conflict/skip); silent when nothing changed** — consistent with Runtime Config Sync; `-v` / `--verbose` shows details.

**update (main→worktree) example**:

```
✓ Untracked files synced: copied 2 files (data/seed.json, .env.staging)
✗ 1 file differs between both sides, skipped — manual resolution needed:
  certs/local.pem: main(2026-09-10 09:00) / task-1(2026-09-16 14:12)
⚠ Skipped file: .env.local (runtime config file, handled by Runtime Config Sync)
```

**merge (worktree→main) example**:

```
✓ Brought back 2 untracked files to main: data/seed.json, .env.staging
```

`colyn add`'s initial copy reuses the same `copied` message as `update` (the worktree was just created, so list-matching files are always copies, with no possibility of conflict).

**Batch mode**: each worktree prints its own result group.

### 7.2 i18n keys

Added to both `src/i18n/locales/zh-CN.ts` and `en.ts`, following the Runtime Config Sync organization (top-level section + option descriptions in each command section):

```typescript
// top-level untrackedFileSync section: sync messages (shared by add / update / merge / repair)
untrackedFileSync: {
  copied: 'Untracked files synced: copied {{count}} files ({{files}})',
  broughtBack: 'Brought back {{count}} untracked files to main: {{files}}',
  conflict: '{{count}} files differ between both sides, skipped — manual resolution needed:',
  conflictDetail: '{{file}}: {{sourceLabel}}({{sourceMtime}}) / {{targetLabel}}({{targetMtime}})',
  skipped: 'Skipped file: {{file}} ({{reason}})',
  skippedReasonTracked: 'tracked by git, synced by git',
  skippedReasonRuntimeConfig: 'runtime config file, handled by Runtime Config Sync',
  skippedReasonSourceMissing: 'missing on the source side',
  error: 'Untracked file sync failed: {{error}}',
  noChange: 'No changes in untracked files',
  mainLabel: 'main',
},

// option descriptions live in each command section
commands.update.syncFilesOption: 'Sync untracked files from main (on by default)',
commands.update.noSyncFilesOption: 'Skip untracked file sync',
commands.merge.syncFilesOption: 'Sync untracked files on merge (on by default)',
commands.merge.noSyncFilesOption: 'Skip untracked file sync',
```

---

## 8. Test Strategy

| Layer | Content |
|-------|---------|
| List resolution unit tests | wildcard expansion (`*` / `**` / exact path), tracked-file exclusion, runtime-config exclusion, empty list returns null |
| `planUntrackedFileSync` unit tests | full decision table: copy when target missing, no-op when identical, conflict when differing, no-op when source missing |
| `syncUntrackedFiles` orchestration tests | temp directories: copy preserves permission bits, conflicts are not written, result structure correct |
| Command layer | sync triggers after git success, no sync on git failure, `--no-sync-files` honored, empty list is a no-op |
| Manual verification | `LANG=zh_CN.UTF-8` / `LANG=en_US.UTF-8` bilingual output |

---

## 9. Out of Scope

The following are explicitly out of scope for this iteration:

- ❌ Automatic conflict merging (three-way merge / `git merge-file` / snapshot baseline)
- ❌ Interactive conflict resolution (a prompt to pick a side)
- ❌ mtime-based automatic resolution (newest wins)
- ❌ Sync history recording and auditing (snapshot git repository)
- ❌ File deletion propagation (deleting on one side does not propagate)
- ❌ Sync in `remove` / `checkout` / `switch` commands
- ❌ Per-sub-project lists for Mono Repo (the list matches uniformly by project-root-relative path)

> During design, a "three-way merge + git history repository under `.colyn`" approach (automatic merging, auditable history) was evaluated and abandoned due to lifecycle-management complexity and conflict with the conservative philosophy — see the decision record in section 11.

---

## 10. Acceptance Criteria

### 10.1 Functionality

- [x] With an empty `syncFiles` list the feature is fully off: no output, no overhead
- [x] After `colyn update`: list-matching files newly added on main appear in the worktree
- [x] After `colyn merge`: list-matching files newly added in the worktree appear on main; the `--update` phase delivers them to other worktrees
- [x] Files differing on both sides are not overwritten; a conflict message is printed (with both paths and modification times)
- [x] Tracked files and runtime config files are excluded with a warning
- [x] Copying preserves file permission bits
- [x] `colyn repair` rebuilds list-matching files missing in a worktree

### 10.2 Toggles and Safety

- [x] `--no-sync-files` fully disables sync; settings defaults take effect via three-source resolution
- [x] Sync never overwrites existing content, never deletes files
- [x] Sync failures do not change the command's exit status; batch mode continues

### 10.3 Quality

- [x] Complete bilingual copy (zh-CN / en), no hardcoded text
- [x] `volta run yarn lint` with 0 errors
- [x] No `any` types

> Acceptance evidence: unit tests (12 cases in `untracked-file-sync.test.ts`, 2 hook cases in `update.helpers.test.ts`, 1 schema case in `config.test.ts`; full suite of 16 files / 217 cases passing) + manual end-to-end verification 8/8 PASS (add initial copy, update forward copy, update conflict without overwrite, merge bring-back with `--update` propagation, runtime config file exclusion, `--no-sync-files` toggle, bilingual output, repair rebuild).

---

## 11. Key Design Decision Record

| Decision | Choice | Reason |
|----------|--------|--------|
| File source | Explicit config list (`syncFiles`) over auto-detection | User asked for control and choice; auto-detecting ignored files easily syncs logs, build artifacts, local databases by mistake |
| List matching | Wildcards supported (same style as `branchOverrides`) | User request; reuses the existing pattern conversion, zero new dependencies |
| Sync timing | Fully aligned with Runtime Config Sync (add / update / merge / repair) | User asked to follow the .env.local timing; unified mental model, parallel call in implementation |
| Conflict semantics | Differing content triggers an error message; no overwrite, no merge | User's choice (structurally identical to .env.local key-conflict "skip + notify"); untracked files have no git history, overwriting can lose data |
| Evaluated then dropped: three-way merge + git history repository | Abandoned | Lifecycle management (corruption recovery, concurrency locks) is complex; conflict markers, though git-familiar, write into files and violate the "never write" conservative principle; the learning/config cost doesn't fit the "non-essential feature" positioning |
| Exclude runtime config files | match filenames against plugin `getRuntimeConfigFileName` | Prevents double handling of `.env.local` by two mechanisms and keeps identity keys (`PORT`/`WORKTREE`) from being clobbered by whole-file copies |
| Exclude tracked files | `git ls-files` check | Files managed by git are synced by git; colyn overwriting them would fight git state |
| Architecture placement | new `src/core/untracked-file-sync.ts`, no plugin system | Operates on plain files, format-agnostic, no toolchain differences; core-layer pure functions + thin command layer match the existing layering |
| Config migration | Not needed (only optional fields added) | Per project conventions, optional fields are backward compatible |
| Deletion propagation | Never | Consistent with the Runtime Config Sync philosophy; a deletion may be an accidental loss — stay conservative |
