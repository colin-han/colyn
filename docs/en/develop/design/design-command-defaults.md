# Project-Level Default Configuration for Subcommand Options

**Status**: Implemented (v3.3)

---

## 1. Background and Goals

colyn subcommands provide many boolean options (e.g., `merge --no-build`, `update --no-rebase`) to control workflow details. Previously these options could only be specified on the command line, with no way to persist them. For teams with fixed workflow preferences (e.g., "always skip build in this project", "never fetch in offline environments"), users had to repeat the same flags every time.

**Goals**:

1. Allow setting project-level or user-level defaults for boolean options of subcommands in `settings.json`
2. Explicitly specified `--xxx` / `--no-xxx` on the command line still takes priority (temporary override)
3. Reuse the existing `branchOverrides` mechanism to support "per-branch default overrides" for free
4. Keep naming and behavior consistent across all commands

**Non-goals**: Safety confirmations (`--yes`, `--force`), output format options (`--json`, `--format`), and one-time parameters (`--port`, `--install`) are not included in configuration.

---

## 2. Design Overview

### 2.1 Three-Level Priority

```
Explicit CLI flag > settings.json node > Command built-in default
```

- **Explicit CLI**: User types `--xxx` or `--no-xxx` in the terminal; commander reports `getOptionValueSource(key) === 'cli'`
- **Config file**: The value from `settings.json`'s `commands.<cmd>.<key>` node, after merging user-level + project-level + branchOverrides
- **Built-in default**: The fallback value passed when the command calls `applyCommandDefaults()`

### 2.2 Top-Level Shared verbose

The top-level `verbose: boolean` field applies to all commands that support `-v/--verbose` (merge, release, etc.). No need to configure it separately in each command node.

### 2.3 Nested by Command Name

Each command's defaults are placed under `commands.<commandName>`. Currently supported: `merge`, `update`, `release`, `checkout`.

### 2.4 branchOverrides Recursive Application

`commands.*` inside `branchOverrides` is deep-merged with the top-level `commands.*`, with branch-matched values recursively overriding.

---

## 3. Configuration Options Reference

### Top-Level Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `verbose` | `boolean` | `false` | Enable verbose output for all commands, equivalent to adding `-v` every time |

### commands.merge

| Field | Default | CLI On | CLI Off | Description |
|-------|---------|--------|---------|-------------|
| `build` | `true` | `--build` | `--no-build` | Run build before merge |
| `rebase` | `true` | `--rebase` | `--no-rebase` | Use rebase to update main branch |
| `update` | `true` | `--update` | `--no-update` | Update all worktrees before merge |
| `fetch` | `true` | `--fetch` | `--no-fetch` | Run git fetch |
| `all` | `true` | `--all` | `--no-all` / `--current-only` | Update all worktrees (only effective when update=true) |

### commands.update

| Field | Default | CLI On | CLI Off | Description |
|-------|---------|--------|---------|-------------|
| `rebase` | `true` | `--rebase` | `--no-rebase` | Use rebase to update |
| `fetch` | `true` | `--fetch` | `--no-fetch` | Run git fetch |
| `all` | `true` | `--all` | `--no-all` / `--current-only` | Update all worktrees |

### commands.release

| Field | Default | CLI On | CLI Off | Description |
|-------|---------|--------|---------|-------------|
| `update` | `true` | `--update` | `--no-update` | Update dependencies before release |
| `build` | `true` | `--build` | `--no-build` | Run build before release |
| `tag` | `true` | `--tag` | `--no-tag` | Create git tag |
| `versionUpdate` | `true` | `--version-update` | `--no-version-update` | Update version number |

### commands.checkout

| Field | Default | CLI On | CLI Off | Description |
|-------|---------|--------|---------|-------------|
| `fetch` | `true` | `--fetch` | `--no-fetch` | Run git fetch before checkout |

---

## 4. Business Rules

- **`merge.all` only takes effect when `merge.update === true`**. When `--no-update` is set, no worktrees are updated even if `--all` is passed. This rule is enforced with explicit short-circuit logic in the merge command, not at the schema level.

---

## 5. Three-Source Resolution Mechanism

### 5.1 Core Utility Functions

```typescript
// src/core/command-defaults.ts

/**
 * Applies settings-based command defaults to the commander parse result.
 * Only replaces values when the user did not explicitly specify them (source !== 'cli').
 */
function applyCommandDefaults<T extends Record<string, boolean>>(
  cmd: Command,
  opts: T,
  configDefaults: Partial<T>,
  builtinDefaults: T,
): T;

/**
 * Resolves verbose: CLI flag > top-level verbose config > false
 */
function resolveVerbose(
  cmd: Command,
  settings: MergedSettings,
): boolean;
```

### 5.2 Resolution Flow

```
1. commander parses CLI args, recording the source of each key ('cli' | 'default')
2. applyCommandDefaults() iterates each key:
   - If source === 'cli': keep CLI value, skip
   - If configDefaults[key] has a value: use config file value
   - Otherwise: use builtinDefaults[key]
3. Return the final merged result
```

### 5.3 Extension Pattern

To add support for a new command, simply:
1. Add the corresponding Schema in `config-schema.ts` (`XxxCommandConfigSchema`)
2. Call `applyCommandDefaults(cmd, opts, settings.commands.xxx, builtins)` in the command implementation

---

## 6. Configuration Example

```jsonc
{
  "version": 4,

  // Top-level verbose: shared by all commands
  "verbose": true,

  "commands": {
    "merge": {
      "build": false,    // Skip build on merge (faster iteration)
      "rebase": false    // No rebase
    },
    "update": {
      "all": false       // Only update current worktree (overrides new default all=true)
    },
    "release": {
      "tag": false       // Don't auto-create tag (handled by CI)
    }
  },

  // On release/* branches, force build during merge
  "branchOverrides": {
    "release/*": {
      "commands": {
        "merge": { "build": true }
      }
    }
  }
}
```

**What this means**:
- Verbose output is always on
- merge skips build and rebase by default (fast daily iteration)
- update only updates the current worktree by default
- On release branches, merge always runs build (ensures release quality)

---

## 7. Breaking Changes

| Change | Old usage | New usage |
|--------|-----------|-----------|
| merge --skip-build removed | `merge --skip-build` | `merge --no-build` |
| merge --update-all removed | `merge --update-all` | `merge --all` |
| update --all default reversed | Must explicitly add `--all` | All worktrees updated by default |
| Restore old update behavior | No extra flags needed | `update --current-only` or `update --no-all` |
| verbose config source changed | Each command had its own i18n key | Reads top-level `verbose` uniformly |

---

## 8. Implementation Reference

| File | Description |
|------|-------------|
| `src/core/config-schema.ts` | Schema definitions: `MergeCommandConfigSchema`, etc. |
| `src/core/command-defaults.ts` | Three-source resolution utilities: `applyCommandDefaults`, `resolveVerbose` |
| `src/core/command-defaults.test.ts` | Unit tests |
| `src/commands/merge.ts` | Example usage in merge command |
| `src/commands/update.ts` | Example usage in update command |
| `src/commands/release.ts` | Example usage in release command |
| `src/commands/checkout.ts` | Example usage in checkout command |
