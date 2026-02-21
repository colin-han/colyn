# Release Command Design (User Interaction)

**Created**: 2026-02-09
**Last updated**: 2026-02-21
**Command**: `colyn release`  
**Status**: ✅ Implemented

---

## 1. Overview

### 1.1 Background

The current release flow relies on `yarn release:patch/minor/major` or `node scripts/release.js <type>`. This flow includes git status checks, version bump, build, commit, tag, and push.

In a Worktree setup, users may not be in the Main Branch directory, which increases the chance of mistakes. We need a single entry that **always runs release in the Main Branch directory**.

### 1.2 User Goals

- Run the existing release flow via `colyn release`
- No manual directory switching to Main Branch
- Behavior consistent with `yarn release:xxx`

### 1.3 Core Value

- ✅ **Single entry**: A facade for `yarn release:xxx`
- ✅ **Main Branch enforced**: Always execute in Main Branch directory
- ✅ **Consistent flow**: Reuse existing release script
- ✅ **Auto sync**: Sync the latest release to all Worktrees after release (skip with `--no-update`)

---

## 2. Command Definition

### 2.1 Basic Usage

```bash
colyn release <version-type>
```

`[version-type]` supports (optional, defaults to `patch`):
- `patch` / `minor` / `major`
- explicit version like `1.2.3`

**Options**:
- `--no-update` — skip auto-updating all Worktrees after release
- `--verbose` / `-v` — show full command output when install/lint/build fails

Examples:
```bash
colyn release                    # release patch version (default) and auto-update all worktrees
colyn release patch              # release patch version
colyn release minor              # release minor version
colyn release major              # release major version
colyn release 1.2.3              # release specific version
colyn release patch --no-update  # release but skip updating worktrees
colyn release --no-update        # release patch but skip updating worktrees
colyn release -v                 # release; show full output on failure
```

### 2.2 Execution Location Rules

- Must run **inside the project directory** (Main Branch or any Worktree).
- Running outside the project directory is not allowed.
- Actual execution **always happens in Main Branch directory**.

---

## 3. Usage Scenarios

### 3.1 Release from a Worktree

```bash
$ cd worktrees/task-1
$ colyn release patch

Step 1: Check git status (Main Branch)
✓ Working tree clean
...
✓ Release complete
```

### 3.2 Release from Project Root

```bash
$ cd /path/to/project
$ colyn release minor
```

### 3.3 Running Outside Project (Not Allowed)

```bash
$ cd ~
$ colyn release major
✗ Current directory is not in a Colyn project. Run inside the project.
```

---

## 4. High-level Flow

1. Parse arguments (version-type and options; version-type defaults to `patch`)
2. Discover project paths (Main Branch dir, Worktrees dir)
3. Validate project initialized
4. **Check current directory for uncommitted changes — error and exit if any**
5. **Check if current branch has been merged to main (only when running from a Worktree) — error and exit if not**
6. Execute release flow in Main Branch directory
7. **After successful release, auto-update all Worktrees (unless `--no-update` is specified)**
8. Return release result

---

## 5. Key Behaviors

### 5.1 Main Branch Enforcement

- Locate Main Branch directory via path discovery
- Execute release script in Main Branch directory
- Run on the **current branch** in Main Branch directory (no switch, no error)

### 5.2 Working Tree State

- Reuse release script checks (requires clean working tree)

### 5.3 Consistency with Existing Script (Plugin-driven)

The release flow is driven by toolchain plugins (`PluginManager`) based on the `plugins` field in `.colyn/settings.json`:

| Step | Plugin Method | npm | maven/gradle |
|------|--------------|-----|--------------|
| Install dependencies | `runInstall()` | `yarn install` (or configured package manager) | `mvn install -DskipTests` |
| Lint check | `runLint()` | `yarn lint` | `mvn checkstyle:check` (if configured) |
| Build check | `runBuild()` | `yarn build` | `mvn package -DskipTests` |
| Version bump | `bumpVersion()` | Updates `package.json` | `mvn versions:set` |
| Create commit and tag | (common logic) | tool-agnostic | tool-agnostic |
| Push to remote | (common logic) | tool-agnostic | tool-agnostic |

> **Note**: If no plugins are configured (`plugins: []`), the command falls back to the original `yarn install/lint/build` logic (backward compatible).

### 5.4 Auto-update Worktrees

- After a successful release, auto-runs `colyn update --all`
- Syncs the latest release to all Worktrees
- Update failure only shows a warning and does not affect release success status
- Can be skipped with `--no-update` option

### 5.5 Pre-release Safety Checks

**Current directory state check**:
- Check whether current working directory has uncommitted changes
- If yes, error and exit
- Ensures users don't accidentally trigger a release with unsaved work

**Branch merge status check** (when running from a Worktree):
- Check whether the current branch has been merged into the main branch
- If not merged, error and exit with a suggestion to merge first
- Not checked when running from the main branch directory

---

## 6. Error Handling

- Missing argument: no longer an error; defaults to `patch`
- Project not initialized: prompt to run `colyn init`
- Current directory has uncommitted changes: error and exit, prompt to commit first
- Current branch not merged (in Worktree): error and exit, prompt to merge branch first
- Any release step failure: show clear error and rollback hints

---

## 7. Output Rules

- User-facing output and progress go to stderr
- **Do not output JSON to stdout** at the end

---

## 8. Relation to Existing Docs

- `docs-en/release-guide.md` remains the release process guide
- `colyn release` is the recommended entry point

---

## 9. Confirmed Decisions

1. No `--no-push` / `--dry-run` options
2. If Main Branch directory is on a non-main branch, **do not error or switch**
