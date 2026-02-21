# Release Command Design (User Interaction)

**Created**: 2026-02-09  
**Last updated**: 2026-02-09  
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

---

## 2. Command Definition

### 2.1 Basic Usage

```bash
colyn release <version-type>
```

`<version-type>` supports:
- `patch` / `minor` / `major`
- explicit version like `1.2.3`

Examples:
```bash
colyn release patch
colyn release minor
colyn release major
colyn release 1.2.3
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

1. Parse argument (version-type)
2. Discover project paths (Main Branch dir, Worktrees dir)
3. Validate project initialized
4. Execute release script in Main Branch directory
5. Return release result

---

## 5. Key Behaviors

### 5.1 Main Branch Enforcement

- Locate Main Branch directory via path discovery
- Execute release script in Main Branch directory
- Run on the **current branch** in Main Branch directory (no switch, no error)

### 5.2 Working Tree State

- Reuse release script checks (requires clean working tree)

### 5.3 Consistency with Existing Script

- Install dependencies (using the configured package manager command)
- Run lint / build
- Update `package.json` version
- Create commit and tag
- Push to remote

---

## 6. Error Handling

- Missing argument: show usage
- Project not initialized: prompt to run `colyn init`
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
