# iTerm2 Tab Title Sync Design

## Version Info
- Document Version: 2.0
- Created: 2026-02-21
- Updated: 2026-10-14

---

## 1. Background & Goals

### 1.1 Background

Colyn uses Git worktrees for Parallel Vibe Coding. When working across multiple worktrees, each usually in its own iTerm2 tab, users need to quickly identify the project, Worktree ID and branch from the tab title, without having to read the shell prompt.

### 1.2 Goals

- **Tab title only**: Do not modify the window title, to avoid interfering with the user's window management
- **Zero configuration**: Works automatically whenever colyn runs inside iTerm2; no user setup required
- **Timely updates**: Update the title at the key moments when a worktree is created or its branch changes

---

## 2. Trigger Points

### 2.1 Triggering Commands

| Command | Trigger Scenario | Notes |
|---------|-----------------|-------|
| `colyn add` | After a new worktree has been created | Called right before the JSON result is emitted, with the new Worktree ID and the branch that was checked out |
| `colyn checkout` | After the current worktree has been switched to another branch | Called after the branch switch and status update complete, with the worktree's ID and the new branch |

### 2.2 Trigger Conditions

The title update only executes when **running inside iTerm2**, detected via environment variables:

- `TERM_PROGRAM === 'iTerm.app'`, or
- `LC_TERMINAL === 'iTerm2'`

If the condition is not met, the update is silently skipped with no error, and `setIterm2Title()` returns `false`.

---

## 3. Title Format

```
🐶 {projectName} #{worktreeId} - {branchShortName}
```

| Variable | Description | Example |
|----------|-------------|---------|
| `projectName` | Main directory name (project name) | `my-app` |
| `worktreeId` | Worktree ID (number) | `2` |
| `branchShortName` | Last segment of the branch name (split by `/`) | `login-page` (from `feature/login-page`) |

**Examples**:

| Project | Worktree ID | Branch | Tab Title |
|---------|------------|--------|-----------|
| `my-app` | `2` | `feature/login-page` | `🐶 my-app #2 - login-page` |
| `my-app` | `3` | `fix/button-style` | `🐶 my-app #3 - button-style` |
| `my-app` | `1` | `main` | `🐶 my-app #1 - main` |

Each worktree is expected to live in its own iTerm2 tab, so the title carries the full information (Worktree ID + branch short name) needed to tell tabs apart.

---

## 4. Technical Implementation

### 4.1 OSC Escape Sequence

The tab title is set using iTerm2's standard OSC (Operating System Command) escape sequence:

```
\033]1;{title}\007
```

- `\033]1;` — OSC sequence; index `1` sets the "icon name" (tab title)
- `\007` — BEL character, sequence terminator

Note: OSC `2` sets the window title; OSC `1` sets the tab title (icon name). This feature only uses `1`.

**OSC 1 also updates the session name**: In iTerm2, setting the icon name via OSC 1 simultaneously updates the session's `autoNameFormat` variable — the same name visible in "Edit Session > Session Name". So OSC 1 effectively sets both the tab title and the iTerm2 session name in one operation.

### 4.2 Tab Title Behavior with Multiple Panes

When an iTerm2 tab contains multiple panes, **the tab title displays the session name of the currently active (focused) pane**. Switching focus to a different pane causes the tab title to update accordingly.

Colyn commands run in a single pane and Colyn does not create iTerm2 split panes, so this behavior has no impact on the current implementation.

### 4.3 Delivery Method

The escape sequence is written directly to `stderr` of the colyn process:

```typescript
process.stderr.write(`\x1b]1;${tabTitle}\x07`);
```

stderr is used because, under the project's dual-layer architecture, stdout is reserved for the JSON control protocol consumed by `shell/colyn.sh`; stderr is passed straight through to the terminal, so iTerm2 receives the sequence and updates the tab title.

### 4.4 branchShortName Calculation

```typescript
export function getBranchShortName(branch: string): string {
  return branch.split('/').pop() || branch;
}
```

Takes the last segment of the branch name after splitting by `/`. Examples:
- `feature/login-page` → `login-page`
- `fix/button-style` → `button-style`
- `main` → `main`

### 4.5 Public API

```typescript
/**
 * Set the iTerm2 tab title.
 * Format: 🐶 {projectName} #{worktreeId} - {branchShortName}
 * @returns true if the title was written, false if not running in iTerm2
 */
export function setIterm2Title(
  worktreeId: number,
  projectName: string,
  branchName: string
): boolean;
```

---

## 5. Implementation Locations

| Function | File | Responsibility |
|----------|------|----------------|
| `isInIterm2()` | `src/core/iterm2.ts` | Detect iTerm2 environment (module-private) |
| `getBranchShortName()` | `src/core/iterm2.ts` | Derive the branch short name from a branch name |
| `setIterm2Title()` | `src/core/iterm2.ts` | Core implementation: detect environment, build the title and send the escape sequence |
| add command | `src/commands/add.ts` | Calls `setIterm2Title(id, paths.mainDirName, cleanBranchName)` after the worktree is created |
| checkout command | `src/commands/checkout.ts` | Calls `setIterm2Title(worktree.id, paths.mainDirName, branch)` after the branch switch completes |
