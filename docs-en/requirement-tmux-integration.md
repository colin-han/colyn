# Colyn tmux Integration Requirements Document

## Version Info
- Document Version: 1.0
- Created: 2026-01-24
- Based on Story: blog/parallel-vibe-coding-2-with-tmux.md

---

## 1. Overview

### 1.1 Goal

Add tmux integration to Colyn, implementing:
- One tmux session to manage the entire project
- One worktree corresponds to one tmux window
- Fixed 3-pane layout for each window
- Dev server auto-start
- Seamless worktree switching experience

### 1.2 Core Principles

1. **Zero configuration**: Works without user configuration
2. **Auto detection**: Intelligently adapts to tmux environment
3. **Non-intrusive**: Fully functional without tmux
4. **Zero learning curve**: Existing commands auto-upgrade, no new commands needed

### 1.3 User Value

- 🚀 **Efficiency boost**: Ctrl-b 0-4 instant worktree switch
- 🎯 **Focus on work**: One window controls everything
- 🤖 **Automation**: Dev server auto-starts
- 👀 **Visualization**: Real-time logs and status

---

## 2. Functional Requirements

### 2.1 Command Design

**Design approach**: Fully automated, no new commands needed

All existing commands auto-adapt to tmux environment:

| Command | In tmux | Outside tmux |
|---------|---------|--------------|
| `colyn init` | Setup Window 0 | Create session (detached) |
| `colyn add` | Create window + switch | Normal worktree creation |
| `colyn checkout` | Update window name | Switch directory |
| `colyn list` | Show window number + switch hint | Show ID column (0-main) |
| `colyn repair` | Fix missing windows | Create session + fix windows |

**No new commands needed**: Users use native tmux shortcuts to switch windows.

### 2.2 Session Management

#### 2.2.1 Session Creation

**colyn init behavior**:

Outside tmux:
```bash
$ colyn init -p 3000

✓ Project initialized
✓ Detected you're not in tmux
✓ Created tmux session: my-task-app
✓ Setup Window 0: main
  ├─ Claude Code  (left 60%)
  ├─ Dev Server   (top right 20%)
  └─ Bash         (bottom right 20%)

💡 Hint: Run 'tmux attach -t my-task-app' to enter work environment
```

In tmux:
```bash
$ colyn init -p 3000

✓ Project initialized
✓ Detected in tmux session
✓ Will use current session: existing-session
✓ Setup Window 0: main
```

#### 2.2.2 Session Naming

- **Outside tmux**: Session name = Project name
- **In tmux**: Use current session
- **Session with same name exists**: Reuse directly, no prompt

#### 2.2.3 Configuration Storage

**Following minimal configuration principle**:

Session name doesn't need to be stored in config file, as it always equals project name.

```typescript
// Auto-infer in code
function getSessionName(config: Config): string {
  return config.project;  // session name = project name
}
```

No tmux-related config needed in config file:

```json
// .colyn/config.json
{
  "project": "my-task-app",
  "mainBranch": "main",
  "basePort": 3000
  // ❌ No need for tmux.sessionName - auto-inferred from project
}
```

### 2.3 Window Management

#### 2.3.1 Window Mapping

```
Worktree     Window     Window Name
────────────────────────────────────
main         0          main
task-1       1          auth
task-2       2          tasks
task-3       3          categories
```

**Mapping rules**:
- Window Index = Worktree ID
- Window 0 fixed as main
- Window Name = branch name (without feature/ prefix)

#### 2.3.2 Window Creation

**colyn add behavior**:

```typescript
colyn add feature/auth →
  1. Create worktree (task-1)
  2. Create Window 1, named "auth"
  3. Setup 3-pane layout
  4. Start dev server
  5. Auto switch to Window 1
```

#### 2.3.3 Window Switching

**colyn checkout behavior**:

When switching branches in worktree:
```typescript
colyn checkout feature/new-feature →
  1. Switch to new branch
  2. Archive old branch logs
  3. Update window name to "new-feature"
  4. Refresh environment
```

When switching to another worktree:
```typescript
colyn checkout 1 →
  1. Switch to worktree task-1
  2. Switch to Window 1
  3. If Window 1 doesn't exist, auto-rebuild
```

**Window name sync**:
- After branch switch, window name auto-updates to last segment of new branch
- Ensures window name always reflects current branch
- Example: `feature/auth` → `feature/new-ui` changes window from "auth" to "new-ui"

#### 2.3.4 Window Number Allocation

- Worktree ID increments, not reused
- Window Index = Worktree ID
- Window number gaps allowed (after worktree deletion)

### 2.4 Pane Layout

#### 2.4.1 Fixed Layout

```
┌──────────────┬─────────┐
│              │  Dev    │
│              │  Server │  ← 30%
│   Claude     ├─────────┤
│   Code       │         │
│              │  Bash   │  ← 70%
│     60%      │   40%   │
└──────────────┴─────────┘
```

**Pane allocation**:
- Pane 0 (left 60%): Claude Code
- Pane 1 (top right 30% of 40% = 12%): Dev Server
- Pane 2 (bottom right 70% of 40% = 28%): Bash

#### 2.4.2 Implementation

```typescript
// 1. Vertical split: left 60%, right 40%
tmux split-window -h -p 40 -c "$worktreePath"

// 2. Split right side: top 30%, bottom 70%
tmux split-window -v -p 70 -c "$worktreePath"

// 3. Select left pane
tmux select-pane -t 0
```

#### 2.4.3 Layout Strategy

- ✅ Fixed layout, not configurable (MVP)
- ✅ All windows have uniform layout
- ❌ Custom layout not supported (may consider in future)
- ❌ Not responsible for layout persistence (user can use tmux plugins)

### 2.5 Pane Content Automation

#### 2.5.1 Left Pane (Claude Code)

**Behavior**:
- Switch to worktree directory
- **Don't** auto-start Claude
- Wait for user to manually run `claude`

**Reason**:
- User may want to check code first
- Claude occupies pane after starting
- Give user full control

#### 2.5.2 Top Right Pane (Dev Server)

**Behavior**:
- Detect `dev` script in package.json
- Auto-execute `npm run dev`
- PORT auto-read from .env.local

**Detection logic**:
```typescript
// 1. Read package.json
const devScript = packageJson.scripts?.dev;

// 2. If exists, auto-start
if (devScript) {
  tmux send-keys "npm run dev" Enter
}

// 3. If doesn't exist, show hint
else {
  echo "# No dev script detected"
}
```

**Project type support**:
- ✅ npm projects (MVP)
- ❌ Rails, Django, etc. (can extend in future)

#### 2.5.3 Bottom Right Pane (Bash)

**Behavior**:
- Switch to worktree directory
- **Don't** execute additional commands
- Keep clean shell

**Use cases**:
- Execute git commands
- Run tests
- Install dependencies
- Any command line operations

### 2.6 colyn list Integration

#### 2.6.1 Display Format

```
┌────────┬─────────────────────┬──────┬──────┬──────────────────┐
│ ID     │ Branch              │ Port │ Diff │ Path             │
├────────┼─────────────────────┼──────┼──────┼──────────────────┤
│ 0-main │ main                │ 3000 │ -    │ my-task-app      │
│ 1      │ feature/auth        │ 3001 │ +127 │ task-1           │
│ 2      │ feature/tasks       │ 3002 │ +89  │ task-2           │
└────────┴─────────────────────┴──────┴──────┴──────────────────┘
```

**Additional hint in tmux**:
```
💡 Use Ctrl-b 1 to switch to Window 1
```

#### 2.6.2 ID Column Rules

- **Main**: Always shows "0-main" (whether in tmux or not)
- **Worktree**: Shows numeric ID (corresponds to tmux window number)

### 2.8 colyn repair Integration

#### 2.8.1 Repair Behavior

**colyn repair behavior**:

```bash
$ colyn repair

✔ Check main branch .env.local...
✔ Check worktree task-1 .env.local...
✔ Repair git worktree connections...
✔ Detect and repair orphan worktree directories...
✔ Created session "my-task-app" and 3 windows

Repair summary:
  ✓ Created tmux session: my-task-app
  ✓ Created 3 tmux windows
  ✓ 1 tmux window already exists (kept original layout)
```

#### 2.8.2 Repair Rules

| Scenario | Behavior |
|----------|----------|
| Session doesn't exist | Create session (detached mode) |
| Window doesn't exist | Create window and setup 3-pane layout |
| Window already exists | Skip, keep user's existing layout |
| tmux not installed | Skip tmux repair, no error |

#### 2.8.3 Use Cases

- Project moved, tmux session lost
- Manually closed some windows
- Newly cloned project needs tmux environment setup

### 2.7 Non-tmux Environment Compatibility

#### 2.7.1 Degradation Strategy

**All features must work normally in non-tmux environment**

| Command | Non-tmux Behavior |
|---------|-------------------|
| `init` | Create session (detached), prompt attach |
| `add` | Normal worktree creation, first-time tmux hint |
| `checkout` | Switch directory |
| `list` | Normal list |

#### 2.7.2 Prompt Strategy

**First-time hint**:
```
💡 Hint: Colyn supports tmux integration for better multi-worktree experience
   Run 'tmux attach -t my-task-app' to enter tmux environment
```

**When to display**:
- First time running `colyn add` (outside tmux)
- Only show once (record to `.colyn/.tmux-hint-shown`)

#### 2.7.3 Error Handling

**tmux not installed**:
- Completely disable tmux features
- All commands work normally
- Don't show any hints

**tmux command fails**:
- Degrade to non-tmux mode
- Show warning but don't interrupt flow
- Worktree created normally

---

## 3. Configuration File Design

### 3.1 Minimal Configuration Principle

**Follow project's minimal configuration principle**: Only store information that cannot be auto-inferred.

### 3.2 Zero Configuration

**Currently project doesn't need any configuration files**, all information auto-inferred from environment:

```bash
# Project structure
my-task-app/                    # ← Project name inferred from directory name
├── my-task-app/                # Main branch directory
│   ├── .git/                   # ← Main branch inferred from git branch --show-current
│   └── .env.local              # ← Base port read from here
└── worktrees/
    └── task-1/
        └── .env.local          # ← Port read from here
```

**Inference rules**:

```typescript
// All information inferred from environment
getProjectName() => path.basename(projectRoot)
getMainBranch() => execSync('git branch --show-current', { cwd: mainDir })
getBasePort() => readEnvLocal(mainDir).PORT
getSessionName() => getProjectName()
getWindowName(branch) => branch.split('/').pop()
```

### 3.3 Auto-inference Rules

| Needed Info | Inference Source | Description |
|-------------|-----------------|-------------|
| Project name | Main directory name | `my-task-app/` → `my-task-app` |
| Main branch | Main branch directory's current branch | `git branch --show-current` |
| Base port | Main branch .env.local | PORT environment variable |
| Session name | Project name | Always equal |
| Window index | Worktree ID | One-to-one mapping |
| Window name | Branch name | Last segment after `/` |
| Dev command | package.json | Detect scripts.dev |
| Pane layout | Fixed layout | 60/20/20 fixed ratio |

**Window name examples**:
```typescript
// Extract last segment of branch name
function getWindowName(branch: string): string {
  return branch.split('/').pop() || branch;
}

// Examples
feature/auth → auth
bugfix/user/login → login
feature/ui/dark-mode → dark-mode
main → main
```

### 3.4 Future of Configuration Files

Only introduce configuration files if truly needed for information that cannot be inferred in the future.

Current design ensures:
- **Zero configuration**: User doesn't need to create or edit any configuration files
- **Zero maintenance**: No configuration files need maintenance
- **Zero inconsistency**: No configuration-to-actual-state inconsistency issues
- **Simplest**: Aligns with colyn's design philosophy

---

## 4. Implementation Plan

### 4.1 MVP Scope

**Must implement** (1 week):
1. ✅ tmux environment detection
2. ✅ Session creation and management
3. ✅ Window auto-creation
4. ✅ Fixed 3-pane layout
5. ✅ Dev server auto-start
6. ✅ colyn list shows window info

**Post-MVP**:
7. ⏸️ colyn checkout switches window
8. ⏸️ User experience optimization

### 4.2 Implementation Phases

#### Phase 1: Basic Detection and Session (1-2 days)
- tmux environment detection
- Session creation/use
- Configuration file extension

#### Phase 2: Window and Layout (2-3 days)
- Window creation and naming
- 3-pane layout setup
- Main window initialization

#### Phase 3: Dev Server Startup (2-3 days)
- package.json detection
- Auto-start logic
- Error handling

#### Phase 4: List Integration (1 day)
- ID column format adjustment
- Window status detection
- Hint display

#### Phase 5: Checkout Integration (2 days)
- Window switching
- Window recovery
- Non-tmux compatibility

#### Phase 6: User Experience Optimization (1-2 days)
- First-time hints
- Error handling refinement
- Documentation update

**Total: 9-13 days (about 2 weeks)**

### 4.3 Technical Architecture

#### Core Modules

```
src/utils/tmux.ts           # tmux utility functions
  - isInTmux()
  - getCurrentSession()
  - createSession()
  - createWindow()
  - setupPaneLayout()
  - switchWindow()

src/utils/dev-server.ts     # dev server management
  - detectDevCommand()
  - startDevServer()

src/commands/init.ts        # Extend init command
src/commands/add.ts         # Extend add command
src/commands/checkout.ts    # Extend checkout command
src/commands/list.ts        # Extend list command
```

#### Dependencies

```
commands/init.ts
  → utils/tmux.ts (createSession, setupPaneLayout)
  → utils/dev-server.ts (startDevServer)

commands/add.ts
  → utils/tmux.ts (createWindow, setupPaneLayout)
  → utils/dev-server.ts (startDevServer)

commands/checkout.ts
  → utils/tmux.ts (switchWindow, createWindow)

commands/list.ts
  → utils/tmux.ts (isInTmux, checkWindowExists)
```

---

## 5. Acceptance Criteria

### 5.1 Functional Acceptance

#### Scenario 1: Initialize Outside tmux
```bash
$ colyn init -p 3000
✓ Create session: my-task-app
✓ Prompt user to attach

$ tmux attach -t my-task-app
→ Enter Window 0 (main)
→ 3 panes ready
→ Dev server started
```

#### Scenario 2: Create Worktree In tmux
```bash
$ colyn add feature/auth
✓ Create worktree
✓ Create Window 1
✓ Auto switch to Window 1
→ 3 panes ready
→ Dev server started
```

#### Scenario 3: View List
```bash
$ colyn list
→ ID column shows "0-main", "1", "2"...
→ Shows switch hint
```

#### Scenario 4: Switch Worktree
```bash
$ colyn checkout 1
✓ Switch to Window 1

# Or use tmux shortcut
Ctrl-b 1
```

### 5.2 Non-functional Acceptance

- ✅ All features work outside tmux
- ✅ No error if tmux not installed
- ✅ tmux operation failure doesn't interrupt main flow
- ✅ Configuration files auto-generated
- ✅ No manual configuration required

### 5.3 Test Checklist

#### Environment Tests
- [ ] tmux not installed
- [ ] tmux installed, outside tmux
- [ ] tmux installed, inside tmux
- [ ] tmux 2.x version
- [ ] tmux 3.x version

#### Command Tests
- [ ] colyn init (various environments)
- [ ] colyn add (create 1st, 2nd, 3rd worktree)
- [ ] colyn checkout (existing/non-existing window)
- [ ] colyn list (tmux/non-tmux)

#### Edge Cases
- [ ] Session already exists
- [ ] Window manually closed
- [ ] Pane manually closed
- [ ] Dev server fails to start
- [ ] package.json doesn't exist

---

## 6. Risks and Mitigation

### 6.1 Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| tmux version compatibility | High | Test common versions, use compatible commands |
| Shell environment differences | Medium | Explicitly specify shell, pass environment variables |
| Performance issues | Low | Optimize tmux command execution, batch operations |

### 6.2 User Experience Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| User unfamiliar with tmux | Medium | Provide clear hints and documentation |
| Breaking user's existing session | High | Use current session, don't force create |
| Complex configuration | Medium | Zero configuration, auto-generate |

---

## 7. Documentation Requirements

### 7.1 User Documentation

- [ ] Add tmux integration description to README
- [ ] Create docs/tmux-integration.md
- [ ] Add tmux usage examples
- [ ] FAQ: Common questions

### 7.2 Developer Documentation

- [ ] API docs: src/utils/tmux.ts
- [ ] Architecture description: tmux integration design
- [ ] Contribution guide: How to extend tmux features

---

## 8. Future Extensions

### 8.1 Possible Enhancements

1. **More project type support**
   - Rails, Django, Go, etc.
   - Custom dev commands

2. **Layout customization**
   - User-defined pane sizes
   - Multiple preset layouts

3. **Session management commands**
   - `colyn tmux status` - View session status
   - `colyn tmux attach` - Quick attach

4. **Window repair**
   - `colyn repair` - Fix broken layouts

5. **Remote collaboration**
   - Share tmux session
   - Multi-person collaboration on same project

### 8.2 Community Feedback

**Collect after MVP release**:
- Most used features
- Biggest pain points
- Desired new features

**Iterate based on feedback**, don't pre-implement uncertain features.

---

## 9. Summary

### 9.1 Core Value

Colyn tmux integration upgrades Parallel Vibe Coding experience:

**Before**:
- ✅ Multiple AIs working in parallel
- ✅ Git worktree isolation
- ⚠️ Need to manage multiple terminal windows

**Now**:
- ✅ Multiple AIs working in parallel
- ✅ Git worktree isolation
- ✅ **One tmux session manages all**
- ✅ **Three panes auto-layout**
- ✅ **Window auto-creation**
- ✅ **Dev server auto-start**
- ✅ **Instant worktree switch**

### 9.2 Success Criteria

1. **Users don't need to learn new commands**
2. **Works normally outside tmux**
3. **tmux operation failure doesn't affect core functionality**
4. **Zero configuration to use**
5. **10x efficiency boost for multi-worktree workflow**

### 9.3 Next Steps

1. ✅ Review this requirements document
2. ⏸️ Create technical design document
3. ⏸️ Implement MVP (Phase 1-4)
4. ⏸️ Internal testing and optimization
5. ⏸️ Release and collect feedback

---

**Document End**

*This requirements document is based on the user story in blog/parallel-vibe-coding-2-with-tmux.md to ensure implementation meets user expectations.*
