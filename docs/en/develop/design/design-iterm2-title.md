# iTerm2 Tab Title Sync Design

## Version Info
- Document Version: 1.1
- Created: 2026-02-21
- Updated: 2026-02-21

---

## 1. Background & Goals

### 1.1 Background

Colyn uses Git worktrees for parallel Vibe Coding. When switching between multiple worktrees, users need to quickly identify the current project and branch from the iTerm2 tab, without having to read the shell prompt.

### 1.2 Goals

- **Tab title only**: Do not modify the window title, to avoid interfering with the user's window management
- **Zero configuration**: Works automatically in both tmux and non-tmux environments, no user setup required
- **Timely updates**: Update the title at the key moments when the user switches worktrees

---

## 2. Trigger Points

### 2.1 Triggering Commands

| Command | Trigger Scenario | Notes |
|---------|-----------------|-------|
| `colyn add` | When creating a new worktree | Triggered after `setupWindow()` creates the window, and again after `switchWindow()` switches to it |
| `colyn checkout` | When switching to an existing worktree | Triggered after the switch completes, regardless of tmux environment |
| `colyn tmux repair` | When repairing a tmux window | Triggered via `setupWindow()` |

### 2.2 Trigger Conditions

Title update only executes when **all** of the following conditions are met:

1. **Running inside iTerm2**: Detected via environment variables
   - `TERM_PROGRAM === 'iTerm.app'`, or
   - `LC_TERMINAL === 'iTerm2'`
2. **Both `projectName` and `branchName` are known**: Both are required

If conditions are not met, the update is silently skipped with no error.

---

## 3. Title Format

### 3.1 Non-tmux Environment

```
🐶 {projectName} #{worktreeId} - {windowName}
```

| Variable | Description | Example |
|----------|-------------|---------|
| `projectName` | Main directory name (project name) | `my-app` |
| `worktreeId` | Worktree ID (number) | `2` |
| `windowName` | Last segment of the branch name (split by `/`) | `login-page` (from `feature/login-page`) |

**Examples**:

| Project | Worktree ID | Branch | Tab Title |
|---------|------------|--------|-----------|
| `my-app` | `2` | `feature/login-page` | `🐶 my-app #2 - login-page` |
| `my-app` | `3` | `fix/button-style` | `🐶 my-app #3 - button-style` |
| `my-app` | `1` | `main` | `🐶 my-app #1 - main` |

### 3.2 tmux Environment

```
🐶 {projectName} #tmux
```

| Variable | Description | Example |
|----------|-------------|---------|
| `projectName` | Main directory name (project name) | `my-app` |

All worktrees share the same tab title format, because in a tmux environment, worktree identification is handled by tmux window names — there is no need to duplicate that information in the iTerm2 tab title.

**Example**: `🐶 my-app #tmux`

### 3.3 Design Decision: Why Different Formats?

- **Non-tmux**: Each worktree corresponds to a different iTerm2 tab. The tab title needs full information (worktree ID + branch name) to distinguish between tabs.
- **tmux**: Multiple worktrees share the same iTerm2 tab (switching is done inside tmux). The tab title only needs to identify the project; detailed info is visible in the tmux status bar.

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

**OSC 1 also updates the session name**: In iTerm2, setting the icon name via OSC 1 simultaneously updates the session's `autoNameFormat` variable — the same name visible in "Edit Session > Session Name". So OSC 1 effectively sets both the tab title and the session name in one operation.

### 4.2 Tab Title Behavior with Multiple Panes

When an iTerm2 tab contains multiple panes, **the tab title displays the session name of the currently active (focused) pane**. Switching focus to a different pane causes the tab title to update accordingly.

**Impact analysis for this feature**:

| Scenario | iTerm2 perspective | Impact |
|----------|--------------------|--------|
| **tmux environment** | The entire tmux process runs in a single iTerm2 pane; iTerm2 is unaware of tmux's internal panes | **No impact.** The OSC sequence passes through tmux to iTerm2, modifying the one session's name. Behavior is stable. |
| **Non-tmux environment** | The Colyn command runs in a single pane; Colyn does not create iTerm2 split panes | **No impact.** |

Conclusion: in Colyn's usage scenarios, the multi-pane tab title behavior does not affect the current implementation.

### 4.3 Delivery Method

The escape sequence is sent differently depending on the environment:

**Non-tmux**: Written directly to `stderr`

```typescript
process.stderr.write(`\x1b]1;${tabTitle}\x07`);
```

**tmux**: Sent to the target pane via `tmux send-keys`, executed by the shell inside the pane

```bash
tmux send-keys -t "{sessionName}:{windowIndex}.0" "printf '\033]1;{title}\007'" Enter
```

Sent to pane 0 (the main pane). The shell inside runs `printf`, which outputs the escape sequence. iTerm2 captures it and updates the tab title.

### 4.4 windowName Calculation

```typescript
function getWindowName(branch: string): string {
  return branch.split('/').pop() || branch;
}
```

Takes the last segment of the branch name after splitting by `/`. Examples:
- `feature/login-page` → `login-page`
- `fix/button-style` → `button-style`
- `main` → `main`

---

## 5. Implementation Locations

| Function | File | Responsibility |
|----------|------|----------------|
| `isInIterm2()` | `src/core/tmux.ts` | Detect iTerm2 environment |
| `setIterm2Title()` | `src/core/tmux.ts` | Core implementation: detect environment and send escape sequence |
| `setupWindow()` | `src/core/tmux.ts` | Calls `setIterm2Title()` after creating a window |
| `switchWindow()` | `src/core/tmux.ts` | Calls `setIterm2Title()` after switching to a window |
| checkout command | `src/commands/checkout.ts` | Calls `setIterm2Title()` directly after switching worktree |
