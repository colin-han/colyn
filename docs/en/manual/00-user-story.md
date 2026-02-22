# From Solo Developer to an AI Team: Xiao Ming's Parallel Vibe Coding Journey

> You have 3 features to build, 3 Claude Code instances waiting for your instructions — why do them one at a time?

---

## The Bottleneck

Xiao Ming is an indie developer building a task management SaaS with Next.js. He's already comfortable with Vibe Coding — describing requirements, letting AI write the code, reviewing and refining. Productivity on individual features is great.

But one weekend he wants to sprint and push three features simultaneously: user authentication, task management, and a data dashboard. Here's the problem:

**AI can work in parallel. You can't.** While Claude is running, you're waiting. When it finishes, you review. When you're done reviewing, you hand off the next task. Your attention bandwidth has become the bottleneck.

What about switching to another branch to work on something else? `git stash` → switch branch → `git stash pop`. Not only does the code context disappear — Claude's session context disappears too. Every time you switch back it's like briefing a new intern on the entire project from scratch.

Git worktrees could theoretically solve the parallelism problem, but `git worktree add ../my-project-feature feature/auth` is verbose and error-prone. You have to manage port conflicts manually, reinstall dependencies, and three terminal windows later you still can't remember which one is which.

**What if a single tool could let you command 3 AIs developing in parallel — each with its own code branch, port, and runtime environment — with just one command?**

---

## Meet Colyn: Up and Running in Five Minutes

Xiao Ming discovers Colyn. Installation is quick:

```bash
npm install -g colyn
```

Then configure shell integration — this is what allows Colyn to automatically switch directories after commands run:

```bash
colyn setup
source ~/.zshrc
```

### Initialize the Project

From the project root:

```bash
cd my-task-app
colyn init -p 3000
```

The project structure changes:

```
my-task-app/                   # Project root
├── .colyn/                    # Colyn marker directory
├── my-task-app/               # Main branch directory (PORT=3000)
│   ├── .git/
│   ├── src/
│   ├── package.json
│   └── .env.local             # PORT=3000, WORKTREE=main
└── worktrees/                 # Worktree directory (created later)
```

Xiao Ming notices he hasn't configured anything. Colyn automatically detected `package.json` and recognized this as a Node.js project. The project name was inferred from the directory name. The port was written to `.env.local`. **Zero configuration, ready to go.**

### Create the First Worktree

```bash
colyn add feature/auth
```

Terminal output:

```
✓ Creating worktree for branch: feature/auth
✓ Assigned ID: 1
✓ Port: 3001
✓ Created at: worktrees/task-1
⠿ Installing dependencies...
✓ Dependencies installed
📂 Switched to: /path/to/my-task-app/worktrees/task-1
```

Xiao Ming is already in the new directory — he didn't run `cd`. Colyn switched automatically. Port 3001 was assigned automatically. `npm run dev` will work right away without conflicting with the main branch's port 3000. Dependencies are installed too.

A quick `colyn list` shows the full picture:

```
┌────────┬──────────────┬──────┬──────────────────────┐
│ ID     │ Branch       │ Port │ Path                  │
├────────┼──────────────┼──────┼──────────────────────┤
│ 0-main │ main         │ 3000 │ my-task-app           │
│ 1      │ feature/auth │ 3001 │ worktrees/task-1      │
└────────┴──────────────┴──────┴──────────────────────┘
```

Clear as day. Compared to `git worktree add ../my-task-app-feature-auth feature/auth`, `colyn add feature/auth` is vastly simpler.

---

## Parallel Launch: Ideas Keep Coming, AIs Keep Working

### Planning Tasks

Xiao Ming captures his three core features as todos:

```bash
colyn todo add feature/auth "Implement user authentication

## Task Description
- Add email/password login and registration forms
- Backend API: POST /api/auth/login, POST /api/auth/register
- Use JWT token authentication

## Acceptance Criteria
- Redirect to homepage on successful login
- Show error message on failed login
- Validate email format and password strength on registration"

colyn todo add feature/tasks "Implement task CRUD

## Task Description
- Task list page with pagination
- Create/edit/delete tasks
- Task statuses: Todo, In Progress, Done

## Acceptance Criteria
- Task list supports filtering by status
- Confirmation dialog before deletion
- Form validation: title is required"

colyn todo add feature/dashboard "Implement data dashboard

## Task Description
- Display task stats: total count, status breakdown
- Last 7 days task completion trend chart
- Bind data using Recharts

## Acceptance Criteria
- Chart data updates in real time
- Graceful empty state display"
```

Task descriptions are written in Markdown — they'll be pasted directly into Claude as task context. The clearer the description, the higher the quality of the AI's output.

### Create Worktrees and Launch AIs

Xiao Ming creates 3 worktrees. His rule of thumb: **no more than 3** — it depends on how many things you can focus on at once. More than 3 and you start losing track.

```bash
# worktree 1 (feature/auth) already created, add two more
colyn add feature/tasks      # → worktrees/task-2, PORT=3002
colyn add feature/dashboard  # → worktrees/task-3, PORT=3003
```

Then use `colyn todo start` to kick off tasks in each worktree:

```bash
# In worktree 1
cd worktrees/task-1
colyn todo start feature/auth

✓ Todo "feature/auth" marked as completed

Task description:
Implement user authentication
...

✓ Copied to clipboard
```

`todo start` does two things: switches to the corresponding branch, then copies the task description to the clipboard. Xiao Ming just opens Claude Code, presses `Cmd+V` to paste, adds a few details, and Claude is off to work.

Do the same for all three worktrees. Three Claude Code instances start working simultaneously.

```
Open three ports in the browser at the same time:
http://localhost:3001  ← Authentication
http://localhost:3002  ← Task management
http://localhost:3003  ← Dashboard
```

### Capturing Ideas Mid-Development

While reviewing the authentication code in worktree 1, Xiao Ming suddenly thinks: "Right, I also need a password reset feature." In the past he'd either interrupt his current work to do it immediately, or try to remember it — and inevitably forget.

Now it's one command:

```bash
colyn todo add feature/reset-password "Implement password reset

- User clicks 'Forgot password' → enters email → reset link sent
- Reset link valid for 24 hours
- New password cannot match old password"
```

One second to capture the idea, current work uninterrupted. This todo sits quietly in the list, waiting for a worktree to free up.

A little later, another idea strikes — "tasks should support tags." One more:

```bash
colyn todo add feature/tags "Implement task tag system

- Create custom tags (name + color)
- Each task supports multiple tags
- Task list can be filtered by tag"
```

`colyn todo` shows the pending list at any time:

```
  Type     Name             Message                         Status
  -----------------------------------------------------------------------
  feature  reset-password   Implement password reset         Pending
  feature  tags             Implement task tag system        Pending
```

Nothing falls through the cracks.

### One Problem

At this point Xiao Ming's screen has three terminal windows and three browser tabs. `Cmd+Tab` back and forth, constantly confused — "which worktree is this again?"

**Is there a more elegant way?**

---

## tmux Takes the Stage: One Window to Rule Them All

Xiao Ming discovers that Colyn has built-in tmux integration. Running `colyn repair` automatically creates a complete tmux environment for the project:

```bash
colyn repair

✔ Checking main branch .env.local...
✔ Repairing git worktree connections...
✔ Created session "my-task-app" with 3 windows

💡 Run 'tmux attach -t my-task-app' to enter your workspace
```

Enter tmux:

```bash
tmux attach -t my-task-app
```

Everything is unified in one tmux session — each worktree has its own window:

```
tmux status bar:
[my-task-app] 0:main  1:auth*  2:tasks  3:dashboard
```

Press `Ctrl-b 1` to switch to the authentication window. Each window has the same fixed three-pane layout:

```
┌──────────────────────┬───────────────┐
│                      │  Dev Server   │
│                      │  PORT=3001    │  ← Top right: server logs
│   Claude Code        ├───────────────┤
│                      │               │
│                      │  Bash         │  ← Bottom right: manual ops
│       60%            │     40%       │
│                      │               │
└──────────────────────┴───────────────┘
```

- **Left 60%**: Claude Code — the AI workhorse
- **Top right**: Dev Server — watch logs in real time
- **Bottom right**: Bash — run tests, Git commands

**Most importantly**: Claude Code and the Dev Server both start automatically. Every window is a complete development environment, ready to use without any manual setup.

Instant switching with keyboard shortcuts:

```
Ctrl-b 0  → Main branch (clean, stable — for merging)
Ctrl-b 1  → Authentication
Ctrl-b 2  → Task management
Ctrl-b 3  → Dashboard
```

No more getting lost. No more `Cmd+Tab`. The status bar clearly shows each window's name, with `*` marking the current one.

A few more handy moves:

- `Ctrl-b z`: Zoom current pane to full screen (great for reading Claude's output), press again to restore
- `Ctrl-b o`: Cycle through panes
- `Ctrl-b d`: Detach session (everything keeps running in background, session state is preserved)

Three AIs writing code simultaneously in their own windows. Xiao Ming uses `Ctrl-b 1/2/3` to switch between them, review progress, and give feedback. **Managing three terminal windows has become commanding three AIs from one window.**

---

## The Payoff: Merge, Check, and Reuse

### Merging the First Feature

The authentication feature is done. Xiao Ming runs the merge directly from worktree 1:

```bash
# Inside worktrees/task-1
colyn merge --push
```

No need to specify a worktree ID — Colyn automatically identifies the current worktree.

During the merge, Colyn automatically runs a round of checks:

```
⠿ Running lint check...
✔ Lint passed
⠿ Running build check...
✔ Build passed
⠿ Merging branch...
✓ feature/auth merged into main
✓ Pushed to remote
```

The lint and build checks are run automatically by Colyn's toolchain plugin — it detected `lint` and `build` scripts in `package.json` and runs them before every merge. **Code quality has an automatic gatekeeper.**

What if a check fails? The merge is blocked until the issue is fixed. There's a `--skip-build` escape hatch for emergencies, but Colyn's default behavior is safety first.

### Handling a Merge Conflict

When merging the task management feature, a conflict arises — both it and the auth feature modified the same navigation component:

```bash
cd worktrees/task-2
colyn merge

⚠ Merge conflict!
Please resolve conflicts in the current worktree and retry
```

The conflict is isolated to the worktree. The main branch is untouched. Xiao Ming resolves the conflict inside the worktree, commits, and runs `colyn merge --push` again. Clean and simple.

### Reusing a Worktree: The Most Efficient Approach

The auth feature is merged and worktree 1 is now free. Xiao Ming won't delete it — **reusing worktrees is the recommended Colyn approach**.

```bash
cd worktrees/task-1
colyn todo start
```

`todo start` lists all pending tasks:

```
? Select a task to start ›
❯ feature/reset-password  Implement password reset
  feature/tags            Implement task tag system
```

Xiao Ming picks "password reset" — it's closely related to the authentication work he just finished.

```
✓ Switched to branch: feature/reset-password
✓ Updated window name: reset-password
✓ Archived logs: .claude/logs/archived/feature-auth/
✓ Todo "feature/reset-password" marked as completed

Task description:
Implement password reset
- User clicks 'Forgot password' → enters email → reset link sent
...

✓ Copied to clipboard
```

Notice what happened:

1. The worktree switched to the new branch `feature/reset-password`
2. The tmux window name automatically updated from `auth` to `reset-password`
3. Previous Claude logs were automatically archived
4. The task description was copied to the clipboard, ready to paste into Claude

**More importantly**: because it's the same worktree directory (`worktrees/task-1`), Claude Code's project context is preserved. Claude already knows this directory's code structure and how the authentication module was implemented. Now it's working on password reset — a feature closely related to auth — it doesn't need to start from scratch. It builds directly on the existing auth code.

This is the core advantage of reusing worktrees:

- **Same port** (3001) — browser bookmarks still work
- **Same window** (`Ctrl-b 1`) — muscle memory unchanged
- **Claude context reuse** — significantly higher efficiency for related features
- **Same environment** — no need to reinstall dependencies

Xiao Ming pastes the task description into Claude Code, adds a few details, and Claude gets to work again. Meanwhile, the AIs in worktrees 2 and 3 are still going on their own tasks.

---

## The Long Game: Releases and Daily Rhythm

### Releasing a Version

Once the three core features plus password reset and tags are all done, Xiao Ming is ready to ship:

```bash
colyn release minor
```

```
✓ Checking git status...
⠿ Installing dependencies...
✔ Dependencies installed
⠿ Running lint check...
✔ Lint passed
⠿ Running build check...
✔ Build passed
✓ Version bumped: 0.0.0 → 0.1.0
✓ Tag created: v0.1.0
✓ Pushed to remote
Updating all worktrees...
✓ All worktrees updated
✓ Released v0.1.0
```

One command completes the full release pipeline: lint, build, version bump, tag, push, sync all worktrees. No matter which directory Xiao Ming runs it from, Colyn always executes the release from the main branch.

### Daily Work Rhythm

After that sprint weekend, Xiao Ming settles into a steady development cadence:

**Morning** — one command to restore all context:

```bash
tmux attach -t my-task-app
```

All windows, panes, and even Claude session history are still there.

**Development loop**:

```
New idea anytime → colyn todo add to capture it
A worktree frees up → colyn todo start to pick the next task
                    → paste into Claude → add details → AI gets to work
Done → colyn merge --push
Periodically → colyn todo archive -y (archive completed tasks)
```

**Evening** — `Ctrl-b d` to detach the tmux session, everything runs in the background. Come back tomorrow and attach right where you left off.

### Moving Projects Is No Problem

Once Xiao Ming moved the project directory from `~/projects` to `~/Desktop`. All the Git worktree path references broke.

```bash
colyn repair
```

```
✔ Checking main branch .env.local...
✔ Repairing git worktree connections...
✔ Detecting and repairing orphan worktree directories...
✔ Created session "my-task-app" with 3 windows
✓ Repair complete!
```

One command automatically fixes all path references, environment variable files, and the tmux session.

### Not Just Node.js

Xiao Ming later took on a Java Spring Boot project. Colyn worked just the same — the toolchain plugin detected `pom.xml`, defaulted to port 8080, and wrote configuration to `application-local.properties`. Python, Gradle, and even Xcode projects all have corresponding plugins.

For monorepo projects with separate frontend and backend, Colyn handles those too — automatically scanning subdirectories and managing each sub-project's toolchain independently.

---

Looking back at that sprint weekend, Xiao Ming sat alone at his screen, commanding three AIs building different features in parallel, switching between tmux windows to review code. He was no longer the person writing every line — he was the one breaking down tasks, assigning them to AI, and reviewing the results.

**From writing code yourself to commanding an AI team. The only thing between them is `colyn init`.**
