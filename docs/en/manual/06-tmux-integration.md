# tmux Integration

This chapter covers Colyn's tmux integration, allowing you to efficiently manage multiple worktrees within a single terminal window.

---

## What is tmux Integration?

### Introduction to tmux

tmux (terminal multiplexer) is a terminal multiplexer that allows you to create, manage, and switch between multiple terminal sessions within a single terminal window.

**Core concepts**:

```
Session
├── Window 0
│   ├── Pane 0
│   ├── Pane 1
│   └── Pane 2
├── Window 1
│   ├── Pane 0
│   └── Pane 1
└── Window 2
    └── Pane 0
```

### The Value of Colyn + tmux

Colyn's tmux integration elevates the Parallel Vibe Coding experience:

**Before (using Git Worktree only)**:
- ✅ Multiple AIs can work in parallel
- ✅ Git worktree provides code isolation
- ⚠️ Requires managing multiple terminal windows
- ⚠️ Switching worktrees requires manually switching windows

**Now (Colyn + tmux)**:
- ✅ Multiple AIs work in parallel
- ✅ Git worktree provides code isolation
- ✅ **One tmux session for unified management**
- ✅ **Switch worktrees instantly with keyboard shortcuts**
- ✅ **Automatic layout and service startup**
- ✅ **Real-time view of all worktree statuses**

---

## Mapping Relationship

Colyn maps its concepts naturally to tmux:

| Colyn Concept | tmux Concept | Description |
|---------------|--------------|-------------|
| **Project Name** | **Session Name** | Project name = Session name |
| **Worktree ID** | **Window Index** | ID 0 → Window 0, ID 1 → Window 1 |
| **Branch Name** | **Window Name** | Uses the last segment of the branch name |

### Example

Suppose your project is named `my-task-app` and has the following worktrees:

| Worktree ID | Branch | tmux Window | Window Name |
|-------------|--------|-------------|-------------|
| 0 (main) | main | Window 0 | main |
| 1 | feature/auth | Window 1 | auth |
| 2 | feature/tasks | Window 2 | tasks |
| 3 | bugfix/user/login | Window 3 | login |

tmux status bar displays:
```
[my-task-app] 0:main  1:auth*  2:tasks  3:login
```

---

## Window Layout

### Fixed 3-Pane Layout

Each window uses a fixed three-pane layout:

```
┌────────────────────┬──────────┐
│                    │  Dev     │
│                    │  Server  │  ← 30% (Pane 1)
│   Claude Code      ├──────────┤
│                    │          │
│                    │  Bash    │  ← 70% (Pane 2)
│      60%           │   40%    │
│   (Pane 0)         │          │
└────────────────────┴──────────┘
```

### Pane Assignments

| Pane | Position | Size | Purpose |
|------|----------|------|---------|
| **Pane 0** | Left | 60% | Claude Code (AI programming assistant) |
| **Pane 1** | Top right | 12% | Dev Server (development server logs) |
| **Pane 2** | Bottom right | 28% | Bash (command line operations) |

### Layout Characteristics

- ✅ **Consistency**: All windows use the same layout
- ✅ **Focus**: Left 60% dedicated to AI programming
- ✅ **Monitoring**: Top right shows real-time logs
- ✅ **Flexibility**: Bottom right for ad-hoc operations
- ❌ **Not yet configurable**: Fixed layout in MVP phase

---

## Automation Features

### 1. Automatic Session Creation

**`colyn init` behavior**:

#### Not inside tmux

```bash
$ colyn init -p 3000

✓ Project initialization complete
✓ Detected that you are not in tmux
✓ Created tmux session: my-task-app
✓ Set up Window 0: main
  ├─ Claude Code  (left 60%)
  ├─ Dev Server   (top right 12%)
  └─ Bash         (bottom right 28%)

💡 Tip: Run 'tmux attach -t my-task-app' to enter the work environment
```

#### Inside tmux

```bash
$ colyn init -p 3000

✓ Project initialization complete
✓ Detected that you are inside a tmux session
✓ Will use the current session: existing-session
✓ Set up Window 0: main
```

### 2. Automatic Window Creation

**`colyn add` behavior**:

```bash
$ colyn add feature/auth

✓ Creating worktree...
✓ Assigned ID: 1, Port: 3001
✓ Created Window 1: auth
  ├─ Layout set: 3-pane
  ├─ Claude Code starting...
  ├─ Dev Server starting...
  └─ Bash ready

✓ Switched to Window 1
📂 Path: /path/to/worktrees/task-1
```

### 3. Automatic Service Startup

#### Claude Code (Pane 0)

**Default behavior**:
- Checks if the current directory already has a Claude session
- If it exists, runs `claude -c` to continue the session
- If it does not exist, runs `claude` to start a new session

**Detection logic**:
```bash
# Checks if ~/.claude/projects/{encodedPath}/ has .jsonl files
# encodedPath: encodes the path /Users/name/project as -Users-name-project
```

#### Dev Server (Pane 1)

**Default behavior**:
- Detects the `dev` script in `package.json`
- Automatically runs `npm run dev` (or `yarn dev`, `pnpm dev`)
- PORT environment variable is automatically read from `.env.local`

**Example output**:
```bash
$ npm run dev

> my-app@1.0.0 dev
> next dev

- ready started server on 0.0.0.0:3001, url: http://localhost:3001
- info Loaded env from /path/to/.env.local
```

#### Bash (Pane 2)

**Default behavior**:
- Changes to the worktree directory
- Does not run any additional commands
- Maintains a clean shell environment

---

## iTerm2 Integration

### Automatic Tab Title Synchronization

If you use **iTerm2** as your terminal emulator, Colyn automatically sets the iTerm2 tab title, making it easier to identify the current project and work environment.

#### tmux Environment

When working inside tmux, the iTerm2 tab title shows a unified project identifier:

```
🐶 my-task-app #tmux
```

**Characteristics**:
- ✅ One iTerm2 tab runs one tmux session
- ✅ All tmux windows share the same tab
- ✅ Tab title does not change when switching windows
- ✅ The `#tmux` suffix clearly identifies this as a tmux environment
- ✅ The dog emoji 🐶 makes the tab easier to identify

#### Non-tmux Environment

When working outside of tmux, the tab title shows detailed worktree information:

```
🐶 my-task-app #1 - auth
```

**Format**: `🐶 {project name} #{worktree ID} - {branch name}`

**Examples**:

| Scenario | Tab Title |
|----------|-----------|
| Main branch | `🐶 my-task-app #0 - main` |
| Worktree #1 | `🐶 my-task-app #1 - auth` |
| Worktree #2 | `🐶 my-task-app #2 - user-profile` |

#### When Tab Titles Are Updated

Tab titles are automatically updated in the following situations:

| Command | tmux Environment | Non-tmux Environment |
|---------|-----------------|----------------------|
| `colyn tmux start` | Sets to `🐶 {project} #tmux` | - |
| `colyn add <branch>` | Keeps `🐶 {project} #tmux` | Sets to `🐶 {project} #{ID} - {branch}` |
| `colyn checkout <branch>` | Keeps `🐶 {project} #tmux` | Updates to `🐶 {project} #{ID} - {new branch}` |

#### Compatibility

- ✅ **Only takes effect in iTerm2**: Other terminal emulators are not affected
- ✅ **Auto-detection**: No manual configuration required
- ✅ **Non-intrusive**: Does not affect normal terminal functionality

---

## Keyboard Navigation

### Basic tmux Keyboard Shortcuts

All tmux keyboard shortcuts use **`Ctrl-b`** as the prefix (press and release, then press the next key).

### Window Switching

| Shortcut | Function | Example |
|----------|----------|---------|
| `Ctrl-b 0` | Switch to Window 0 (Main branch) | Quickly return to Main branch |
| `Ctrl-b 1` | Switch to Window 1 | Switch to the first worktree |
| `Ctrl-b 2` | Switch to Window 2 | Switch to the second worktree |
| `Ctrl-b n` | Next window | Browse sequentially |
| `Ctrl-b p` | Previous window | Browse in reverse |
| `Ctrl-b l` | Most recently used window | Quick switch |
| `Ctrl-b w` | List all windows | Visual selection |

### Pane Switching

| Shortcut | Function |
|----------|----------|
| `Ctrl-b o` | Switch to the next pane |
| `Ctrl-b ;` | Switch to the last active pane |
| `Ctrl-b ←/→/↑/↓` | Switch pane using arrow keys |
| `Ctrl-b q` | Show pane numbers (press a number within 2 seconds to switch) |

### Pane Resizing

| Shortcut | Function |
|----------|----------|
| `Ctrl-b z` | Zoom/unzoom the current pane (toggle fullscreen) |
| `Ctrl-b Ctrl-↑/↓/←/→` | Resize pane |
| `Ctrl-b Space` | Cycle through layout presets |

### Session Management

| Shortcut | Function |
|----------|----------|
| `Ctrl-b d` | Detach session (runs in background) |
| `Ctrl-b s` | List all sessions |
| `Ctrl-b $` | Rename the current session |

---

## Command Line Operations

### Attaching to a Session

```bash
# Attach to a session
tmux attach -t my-task-app

# Short form
tmux a -t my-task-app

# Create a session if it doesn't exist
tmux new-session -A -s my-task-app
```

### Listing Sessions

```bash
# List all sessions
tmux ls

# Example output
my-task-app: 4 windows (created Mon Feb 10 10:30:15 2026)
other-project: 2 windows (created Mon Feb 10 09:15:22 2026)
```

### Killing a Session

```bash
# Kill a specific session
tmux kill-session -t my-task-app

# Kill all sessions (except the current one)
tmux kill-session -a
```

---

## Workflow Examples

### Scenario 1: Starting a New Project

```bash
# 1. Initialize the project (create a session)
$ colyn init -p 3000
✓ Created tmux session: my-task-app
💡 Run 'tmux attach -t my-task-app' to enter

# 2. Enter tmux
$ tmux attach -t my-task-app

# Now in Window 0 (main)
# - Pane 0: Claude Code has started
# - Pane 1: Dev Server running on port 3000
# - Pane 2: Bash

# 3. Create the first worktree (automatically switches to Window 1)
$ colyn add feature/auth
✓ Switched to Window 1

# 4. Continue creating more worktrees
$ colyn add feature/tasks    # → Window 2
$ colyn add feature/dashboard # → Window 3

# 5. Use keyboard shortcuts to switch between worktrees
Ctrl-b 0  # → Back to Main branch
Ctrl-b 1  # → feature/auth
Ctrl-b 2  # → feature/tasks
Ctrl-b 3  # → feature/dashboard
```

### Scenario 2: Resuming Work

```bash
# In the morning, resume yesterday's work

# 1. Attach to the session
$ tmux attach -t my-task-app

# 2. View all worktrees
$ colyn list

┌────────┬──────────────────┬──────┐
│ ID     │ Branch           │ Port │
├────────┼──────────────────┼──────┤
│ 0-main │ main             │ 3000 │
│ 1      │ feature/auth     │ 3001 │
│ 2      │ feature/tasks    │ 3002 │
│ 3      │ feature/dashboard│ 3003 │
└────────┴──────────────────┴──────┘

💡 Use Ctrl-b 1 to switch to Window 1

# 3. Switch to the worktree you want to continue
Ctrl-b 2  # Continue developing the tasks feature

# 4. All context is still there
# - Claude Code session history preserved
# - Dev Server may need a restart (Ctrl-c then npm run dev)
# - Bash is in the correct directory
```

### Scenario 3: Parallel Development and Testing

```bash
# Developing three features simultaneously

# Window 1 (feature/auth)
# - Pane 0: Claude helping implement login
# - Pane 1: Dev Server http://localhost:3001
# - Pane 2: Running tests npm test

# Window 2 (feature/tasks)
# - Pane 0: Claude helping implement task management
# - Pane 1: Dev Server http://localhost:3002
# - Pane 2: Viewing logs tail -f logs/app.log

# Window 3 (feature/dashboard)
# - Pane 0: Claude helping implement dashboard
# - Pane 1: Dev Server http://localhost:3003
# - Pane 2: Database operations psql

# Open all three ports simultaneously in the browser
# Quickly compare the effects of different features

# Use Ctrl-b 1/2/3 to switch quickly
```

### Scenario 4: Code Review and Merging

```bash
# 1. In Window 1, review the code to be merged
Ctrl-b 1
$ git diff main

# 2. Switch to the Main branch to perform the merge
Ctrl-b 0
$ colyn merge 1

# 3. After merging, switch back to Window 1 to verify
Ctrl-b 1
$ git log

# 4. After confirming everything is correct, remove the worktree
$ colyn remove 1

# 5. Window 1 automatically closes, returns to Window 0
```

---

## Colyn Command Behavior in tmux

### `colyn init`

| Scenario | Behavior |
|----------|----------|
| Not inside tmux | Creates a new detached session |
| Inside tmux | Uses the current session, sets up Window 0 |

### `colyn add`

| Scenario | Behavior |
|----------|----------|
| Not inside tmux | Creates worktree normally, shows tmux tip |
| Inside tmux | Creates worktree + creates window + automatically switches |

### `colyn list`

```bash
# Inside tmux, an extra tip is shown
$ colyn list

┌────────┬──────────────┬──────┐
│ ID     │ Branch       │ Port │
├────────┼──────────────┼──────┤
│ 0-main │ main         │ 3000 │
│ 1      │ feature/auth │ 3001 │
└────────┴──────────────┴──────┘

💡 Use Ctrl-b 1 to switch to Window 1
```

### `colyn checkout`

```bash
# Switch branch in a worktree
$ colyn checkout feature/new-ui

✓ Switched to branch: feature/new-ui
✓ Updated window name: new-ui
✓ Archived logs: .claude/logs/archived/auth/

# tmux status bar automatically updates
# Before: [my-task-app] 0:main  1:auth*
# After:  [my-task-app] 0:main  1:new-ui*
```

### `colyn repair`

```bash
# Repair after moving the project
$ colyn repair

✔ Checking main branch .env.local...
✔ Fixing git worktree connections...
✔ Detecting and repairing orphaned worktree directories...
✔ Created session "my-task-app" and 3 windows

Repair summary:
  ✓ Created tmux session: my-task-app
  ✓ Created 3 tmux windows
  ✓ 1 tmux window already existed (layout preserved)
```

---

## Custom Configuration

### Configuration File

Pane commands can be customized through configuration files (completely optional).

**Two-level configuration mechanism**:

| Level | Path | Priority |
|-------|------|----------|
| User-level | `~/.colyn/settings.json` | Low |
| Project-level | `{projectRoot}/.colyn/settings.json` | High |

### Configuration Format

```json
{
  "tmux": {
    "autoRun": true,
    "leftPane": {
      "command": "auto continues claude session",
      "size": "60%"
    },
    "topRightPane": {
      "command": "auto start dev server",
      "size": "30%"
    },
    "bottomRightPane": {
      "command": null,
      "size": "70%"
    }
  }
}
```

### Configuration Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `autoRun` | boolean | `true` | Whether to automatically run commands |
| `leftPane.command` | string \| null | `"auto continues claude session"` | Left pane command |
| `leftPane.size` | string | `"60%"` | Left pane width |
| `topRightPane.command` | string \| null | `"auto start dev server"` | Top right pane command |
| `topRightPane.size` | string | `"30%"` | Top right pane height proportion within the right side |
| `bottomRightPane.command` | string \| null | `null` | Bottom right pane command |
| `bottomRightPane.size` | string | `"70%"` | Bottom right pane height proportion within the right side |

### Built-in Commands

| Command | Description |
|---------|-------------|
| `auto continues claude session` | Automatically continues or starts a Claude session |
| `auto continues claude session with dangerously skip permissions` | Same as above, but skips permission checks |
| `auto start dev server` | Automatically starts the dev server |

### Configuration Examples

#### Disable All Automatic Commands

```json
{
  "tmux": {
    "autoRun": false
  }
}
```

#### Use Neovim Instead of Claude Code

```json
{
  "tmux": {
    "leftPane": {
      "command": "nvim"
    }
  }
}
```

#### Run a Monitoring Tool in the Bottom Right Pane

```json
{
  "tmux": {
    "bottomRightPane": {
      "command": "htop"
    }
  }
}
```

#### Custom Layout Sizes

```json
{
  "tmux": {
    "leftPane": {
      "size": "50%"
    },
    "topRightPane": {
      "size": "40%"
    },
    "bottomRightPane": {
      "size": "60%"
    }
  }
}
```

#### Two-Level Configuration Merging

```json
// ~/.colyn/settings.json (user-level)
{
  "tmux": {
    "leftPane": {
      "command": "auto continues claude session with dangerously skip permissions",
      "size": "50%"
    }
  }
}

// {projectRoot}/.colyn/settings.json (project-level)
{
  "tmux": {
    "leftPane": {
      "command": "nvim"  // Only overrides command, preserves user-level size: 50%
    }
  }
}
```

---

## Non-tmux Environment Compatibility

### Full Graceful Degradation

**All features work normally in non-tmux environments**:

| Command | Non-tmux Behavior |
|---------|-------------------|
| `init` | Creates a session (detached), prompts user to attach |
| `add` | Creates worktree normally, shows tmux tip on first use |
| `checkout` | Switches directories normally |
| `list` | Normal list, no tmux tip shown |
| `repair` | Repairs files and git, skips tmux portion |

### First-Use Tip

```bash
$ colyn add feature/auth

✓ Creating worktree...

💡 Tip: Colyn supports tmux integration for a better multi-worktree experience
   Run 'tmux attach -t my-task-app' to enter the tmux environment

   This tip is shown only once
```

### tmux Not Installed

- tmux features are completely disabled
- All commands work normally
- No tips are shown
- No errors are reported

---

## Frequently Asked Questions

### Q: How do I exit tmux?

```bash
# Method 1: Detach session (recommended, session keeps running in background)
Ctrl-b d

# Method 2: Kill the current session
tmux kill-session

# Method 3: Exit all panes in the last window
exit  # Type in each pane
```

### Q: What if a Window is closed?

```bash
# Use the repair command to rebuild
$ colyn repair

✔ Created missing windows
```

### Q: How do I view all tmux keyboard shortcuts?

```bash
# While inside tmux, press
Ctrl-b ?

# Displays the full list of keyboard shortcuts
# Press q to exit
```

### Q: Can I customize the tmux prefix key?

```bash
# Edit ~/.tmux.conf
# Change the prefix from Ctrl-b to Ctrl-a
unbind C-b
set -g prefix C-a
bind C-a send-prefix

# Reload the configuration
tmux source-file ~/.tmux.conf
```

### Q: How do I adjust pane sizes if they are wrong?

```bash
# Method 1: Use keyboard shortcuts
Ctrl-b Ctrl-↑/↓/←/→

# Method 2: Modify the configuration file
# {projectRoot}/.colyn/settings.json
{
  "tmux": {
    "leftPane": { "size": "70%" }
  }
}
```

### Q: The Dev Server did not start automatically?

**Checklist**:
1. Is there a `dev` script in `package.json`?
2. Is `autoRun` disabled in the configuration?
3. Is `topRightPane.command` set to `null` in the configuration?

```bash
# Start manually
Ctrl-b 1  # Switch to the top right pane
npm run dev
```

### Q: The Claude Code session did not continue?

**Reason**: This may be the first time using this worktree.

```bash
# Check if session files exist
ls ~/.claude/projects/-Users-*-worktrees-task-1/*.jsonl

# If not, start Claude manually to establish a session
claude
```

### Q: How do I copy and paste between panes?

```bash
# 1. Enter copy mode
Ctrl-b [

# 2. Navigate using vim-style keys
h/j/k/l  # Move cursor
Space    # Start selection
Enter    # Copy selected content

# 3. Paste
Ctrl-b ]
```

### Q: Can different windows use different layouts?

**Not currently supported**. All windows use the same 3-pane layout in the MVP phase.

Custom layouts may be supported in the future.

---

## Best Practices

### 1. Use Descriptive Branch Names

Use descriptive branch names so Window names are easier to identify:

```bash
# ✅ Recommended
feature/user-authentication  → Window name: authentication
feature/dashboard-redesign   → Window name: redesign
bugfix/login-error          → Window name: error

# ❌ Not recommended
feature/abc                 → Window name: abc
fix                        → Window name: fix
```

### 2. Keep the Number of Windows Reasonable

- **Recommended**: 3-5 worktrees (Windows 0-4)
- **Reasons**:
  - Coverage of Ctrl-b 0-9 keyboard shortcuts
  - Cognitive load
  - Resource usage

### 3. Merge and Clean Up Regularly

```bash
# Clean up merged worktrees weekly
$ colyn list
# Check which features are complete
$ colyn merge 1 --push
$ colyn remove 1
```

### 4. Use Session Detachment

Detach the session when you take a break:

```bash
# At the end of the work day
Ctrl-b d

# The next day
tmux attach -t my-task-app
# All context is still there
```

### 5. Back Up Your tmux Configuration

If you have customized your tmux configuration, remember to back it up:

```bash
# Back up to the project (do not commit to git)
cp ~/.tmux.conf project/.tmux.conf.backup

# Or use version control
git clone https://github.com/username/dotfiles
ln -s ~/dotfiles/tmux.conf ~/.tmux.conf
```

---

## tmux Learning Resources

### Official Documentation

- [tmux GitHub Wiki](https://github.com/tmux/tmux/wiki)
- [tmux Man Page](https://man.openbsd.org/tmux.1)

### Recommended Tutorials

- [tmux Cheat Sheet](https://tmuxcheatsheet.com/)
- [A Quick and Easy Guide to tmux](https://www.hamvocke.com/blog/a-quick-and-easy-guide-to-tmux/)

### Useful Plugins

- [tmux-resurrect](https://github.com/tmux-plugins/tmux-resurrect) - Save and restore sessions
- [tmux-continuum](https://github.com/tmux-plugins/tmux-continuum) - Automatically save sessions
- [tmux-yank](https://github.com/tmux-plugins/tmux-yank) - Enhanced copy functionality

---

## Next Steps

- Check [Best Practices](07-best-practices.md) for recommended workflows
- Having issues? See [Troubleshooting](08-troubleshooting.md)
- Want more advanced usage? See [Advanced Usage](05-advanced-usage.md)
