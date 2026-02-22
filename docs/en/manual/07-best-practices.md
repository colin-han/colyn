# Best Practices

This chapter shares recommended workflows and best practices for using Colyn.

---

## Todo-Driven Vibe Coding Workflow

Combine `colyn todo` with Claude Code to form an efficient parallel development loop.

### Recommended Workflow

```
Planning Phase
  │
  ▼
colyn todo add               # Record all pending tasks
colyn todo add               # You can add multiple at once
  │
  ▼
Execution Phase
  │
  ├─► colyn todo start feature/login   # Switch branch + copy description to clipboard
  │         │
  │         ▼
  │   Open Claude Code, paste description as task context
  │         │
  │         ▼
  │   Complete development → colyn merge → colyn todo to view next task
  │
  └─► (Work on another task in parallel in a different Worktree)
  │
  ▼
Cleanup Phase
  │
  ▼
colyn todo archive -y        # Archive all completed tasks
```

### Best Practices for Task Descriptions

The task description (message) is copied to the clipboard when running `todo start`, and pasted to Claude as context. It is recommended to follow this format:

```markdown
Implement user login feature

## Task Description
- Add email/password login form
- Backend API: POST /api/auth/login
- Validate user credentials and return JWT token

## Acceptance Criteria
- Redirect to homepage after successful login
- Show friendly error message on login failure
- Support "Remember me" option (7-day token validity)

## References
- Design mockup: Figma link
- API documentation: docs/api.md
```

**Recommended content to include**:
- A one-sentence summary of the task goal (first line)
- Specific implementation points
- Clear acceptance criteria
- Links to relevant reference materials

### Using Todo Types to Organize Work

```bash
# Feature development
colyn todo add feature/login "Implement user login"
colyn todo add feature/signup "Implement user registration"

# Bug fixes
colyn todo add bugfix/fix-logout "Fix token not cleared after logout"

# Refactoring
colyn todo add refactor/auth-module "Refactor auth module, split responsibilities"

# Documentation
colyn todo add document/api-guide "Write API usage documentation"
```

Type prefixes give branch names semantic meaning, making them easy to read in `git log` and `colyn list`.

---

## Project Initialization

### Choosing the Right Base Port

**Recommendation**: Choose an infrequently used port range

```bash
# Recommended port ranges
colyn init -p 10000  # 10000-10099
colyn init -p 20000  # 20000-20099
colyn init -p 30000  # 30000-30099

# Avoid commonly used ports
# 3000 - Create React App default port
# 8080 - Common dev server port
# 5000 - Flask default port
```

**Reason**: Avoid conflicts with other projects or system services.

### Project Naming Conventions

**Recommendation**: Use descriptive project names

```bash
# Good project names
my-task-app/
user-management-system/
e-commerce-platform/

# Avoid
project1/
test/
app/
```

**Reasons**:
- The project name is used as the tmux Session name
- Easier to identify and switch between projects
- Better for team collaboration

---

## Worktree Management

### Core Philosophy: Reuse Worktrees

**Recommended approach**: Reuse worktrees as much as possible, using `checkout` to switch branches for managing different feature tasks.

**Reasons**:
- Avoid creating too many worktrees that consume disk space
- Maintain a stable development environment configuration
- Port numbers remain consistent and easy to remember
- Keep fixed window positions in tmux

### Recommended Worktree Configuration

**Typical setup** (3-5 fixed worktrees):

```bash
# Recommended configuration
0-main     main branch (keep clean, used for merging and releases)
1          Primary development workspace (switch different features via checkout)
2          Secondary development workspace (parallel development or experiments)
3          Quick fix workspace (temporary bug fixes or code review)
```

**Workflow**:

```bash
# Create fixed worktrees during initialization
colyn add feature/initial-task   # Creates task-1
colyn add feature/secondary      # Creates task-2
colyn add feature/quick-fix      # Creates task-3

# After that, don't create new worktrees, switch branches in existing ones
cd worktrees/task-1
colyn checkout feature/new-feature    # Switch to new feature in task-1
# After completion, merge
colyn merge --push

# Continue with next feature, still in task-1
colyn checkout feature/another-feature
```

### Using Checkout to Manage Tasks

**Recommendation**: Use `checkout` to switch branches within fixed worktrees

```bash
# Work in worktree 1
cd worktrees/task-1

# Develop feature A
colyn checkout feature/user-auth
# ... develop, test, commit ...
colyn merge --push

# Switch to feature B (same worktree)
colyn checkout feature/dashboard
# ... develop, test, commit ...
colyn merge --push

# Switch to bug fix (same worktree)
colyn checkout bugfix/issue-123
# ... fix, test, commit ...
colyn merge --push
```

**Advantages**:
- Keeps the same port number (e.g. 3001)
- Keeps the same tmux window (e.g. Window 1)
- No need to reconfigure the development environment
- Avoids wasting disk space

### When to Create a New Worktree

**Only create a new worktree in the following situations**:

#### 1. Long-term parallel development is needed

```bash
# Two features need to run and be compared simultaneously
colyn add feature/new-ui        # task-1: New UI design
colyn add feature/old-ui        # task-2: Old UI kept for comparison
```

#### 2. Different development environments are needed

```bash
# Different dependency versions or configurations
colyn add feature/node-18       # task-1: Node 18 environment
colyn add feature/node-20       # task-2: Node 20 environment
```

#### 3. The worktree count limit is reached

If the existing 3-5 worktrees are all in use and you need to add a new parallel development environment.

### Generally Don't Delete Worktrees

**Recommendation**: Keep worktrees after creation and reuse them via `checkout`

```bash
# ❌ Not recommended: Frequent create and delete
colyn add feature/a
colyn merge feature/a
colyn remove feature/a
colyn add feature/b
colyn merge feature/b
colyn remove feature/b

# ✅ Recommended: Reuse worktrees
colyn add feature/a          # Create only once
colyn merge feature/a
colyn checkout feature/b     # Reuse, switch branch
colyn merge feature/b
colyn checkout feature/c     # Continue reusing
```

**Only delete a worktree in the following situations**:
- You are certain this parallel development environment is no longer needed
- You need to adjust the worktree count structure
- The worktree has problems and needs to be rebuilt

---

## Branch Management

### Branch Naming Conventions

**Recommended naming format**:

```bash
# Feature development
feature/<short-description>
feature/user-authentication
feature/payment-integration
feature/dark-mode

# Bug fixes
bugfix/<issue-description>
bugfix/login-error
bugfix/memory-leak
bugfix/api-timeout

# Performance optimization
perf/<optimization-topic>
perf/database-query
perf/image-compression

# Refactoring
refactor/<refactor-topic>
refactor/auth-module
refactor/api-client

# Documentation
docs/<doc-topic>
docs/api-reference
docs/user-guide

# Hotfixes
hotfix/<issue-description>
hotfix/security-patch
hotfix/critical-bug
```

**Reasons**:
- Clear categorization makes management easier
- tmux Window names are more readable
- Better for team collaboration

### Keep the Main Branch Clean

**Best practice**:

```bash
# ✗ Wrong: Developing directly in the main branch
cd my-project/my-project
# Modify files directly...

# ✓ Correct: Develop in a worktree
cd worktrees/task-1
colyn checkout feature/new-feature
# Modify files in the worktree
```

**Main branch purpose**:
- Serves as the baseline for other branches
- Receives merged code
- Runs the stable version
- Stays clean, no direct development in it

---

## Git Operations

### Pre-Commit Checklist

**Recommended workflow**:

```bash
# 1. Check status
git status

# 2. Review differences
git diff

# 3. Add files (avoid git add .)
git add src/component.tsx
git add src/utils.ts

# 4. Commit
git commit -m "feat: add user authentication"

# 5. Push
git push
```

**Avoid**:
```bash
# Not recommended: blindly adding all files
git add .
git add -A
```

**Reason**: You may accidentally commit sensitive files or temporary files.

### Merge Strategy

**Recommendation: Use colyn merge from within the worktree directory**

```bash
# ✓ Recommended: Merge from within the worktree directory or its subdirectory
cd worktrees/task-1
colyn merge

# Or from a subdirectory
cd worktrees/task-1/src
colyn merge

# Colyn will automatically identify the current worktree and merge
```

**Why specifying an ID is not recommended**:

```bash
# ✗ Not recommended: Specifying an ID from the project root
cd /path/to/project
colyn merge 1
```

**Reasons**:
- When working in a worktree, automatic detection is more natural
- Reduces the burden of memorizing worktree IDs
- Avoids specifying the wrong ID
- Aligns with the intuition of "merge where you work"

**Advantages of Colyn merge**:
1. Automatically checks working directory status
2. Two-step merge strategy (first update worktree, then merge to main branch)
3. Uses `--no-ff` to maintain a clear branch history
4. Resolve conflicts in the worktree when merge fails

**Push to remote**:

```bash
# Merge and push from worktree
cd worktrees/task-1
colyn merge --push
```

### Handling Merge Conflicts

**Best practice**:

```bash
# 1. Attempt merge from worktree
cd worktrees/task-1
colyn merge

# 2. If there are conflicts, resolve them in the current worktree
# Manually resolve conflict files
vim src/conflicted-file.ts

# Mark as resolved
git add src/conflicted-file.ts
git commit

# 3. Try merging again
colyn merge
```

**Reason**: Conflicts are resolved in the development environment (worktree) without affecting the main branch.

---

## Environment Configuration

### .env.local File Management

**Recommended configuration**:

```bash
# .env.local (not committed to Git)
PORT=3001
WORKTREE=1

# Project-specific configuration
DATABASE_URL=postgresql://localhost:5432/dev_db
API_KEY=dev-api-key-for-testing
FEATURE_FLAG_NEW_UI=true
```

**Best practices**:
1. **Do not commit .env.local** - already in .gitignore
2. **Provide .env.local.example** - as a template
3. **Use different databases** - each worktree uses an independent database

**Example .env.local.example**:

```bash
# .env.local.example
PORT=3000
WORKTREE=main

# Database (use different database names)
DATABASE_URL=postgresql://localhost:5432/myapp_dev

# API Keys (use test keys)
API_KEY=your-api-key-here

# Feature Flags
FEATURE_FLAG_NEW_UI=false
```

### Dependency Management

**Recommendation**: Install dependencies independently for each worktree

```bash
# After creating a new worktree
cd worktrees/task-1
npm install  # or yarn install

# Reasons:
# 1. Avoid dependency conflicts
# 2. Different branches may have different dependency versions
# 3. Build artifacts are independent
```

**Optimization**: Share node_modules via symbolic links (advanced usage)

```bash
# Only use when you're certain the dependencies are exactly the same
ln -s ../../my-project/node_modules worktrees/task-1/node_modules
```

---

## tmux Usage

### Window Organization

**Recommended layout**:

```
Window 0: main        # Main branch (stable version)
Window 1: feature-a   # Current primary development
Window 2: feature-b   # Parallel development
Window 3: bugfix      # Temporary bug fixes
Window 4: review      # Code review
```

**Navigation tips**:

```bash
# Use number keys to quickly switch
Ctrl-b 0  # Main branch
Ctrl-b 1  # Primary feature
Ctrl-b 2  # Secondary feature

# Using tmux command
tmux select-window -t :1
```

### Pane Usage Recommendations

**Recommended workflow**:

```
┌──────────────┬─────────┐
│              │  Dev    │  ← Monitor logs
│              │  Server │
│   Claude     ├─────────┤
│   Code       │         │
│              │  Bash   │  ← Run tests, Git commands
│              │         │
└──────────────┴─────────┘
```

**Pane responsibilities**:
- **Pane 0 (Claude)**: AI collaborative development
- **Pane 1 (Dev Server)**: Running in background, monitoring logs
- **Pane 2 (Bash)**: Executing commands (tests, Git, builds)

### Session Management

**Best practices**:

```bash
# 1. One session per project
my-task-app     # Session for task app
blog-platform   # Session for blog
api-service     # Session for API

# 2. Use meaningful session names
tmux new -s my-task-app  # Rather than tmux new -s s1

# 3. List all sessions
tmux ls

# 4. Switch session
tmux switch -t my-task-app
```

---

## Team Collaboration

### Shared Project Structure

**Recommended workflow**:

1. **Initialize the project** (one-time):
   ```bash
   # Team member A initializes
   colyn init -p 10000
   git add .
   git commit -m "chore: initialize colyn structure"
   git push
   ```

2. **Other members clone**:
   ```bash
   # Team members B/C/D
   git clone <repository>
   cd <project>

   # Already has .colyn/ directory and main branch structure
   # Directly create your own worktree
   colyn add feature/my-feature
   ```

### .gitignore Configuration

**Must include**:

```gitignore
# .gitignore

# Environment files generated by Colyn
.env.local

# Worktrees directory (optional)
worktrees/

# Node modules
node_modules/

# Build artifacts
dist/
build/
.next/

# IDE
.idea/
.vscode/
*.swp
```

**Notes**:
- `.env.local` must be ignored (to avoid committing sensitive information)
- `worktrees/` can be ignored (each person creates their own)
- `.colyn/` needs to be committed (identifies project structure)

### Documenting Port Assignments

**Record in README.md**:

```markdown
## Development Environment

This project uses Colyn to manage Git Worktrees.

### Port Assignments

- Base Port: 10000
- Main branch: 10000
- Worktree 1: 10001
- Worktree 2: 10002
- ...

### Quick Start

\`\`\`bash
# Initialize (first time only)
colyn init -p 10000

# Create worktree
colyn add feature/your-feature

# Start dev server
npm run dev
\`\`\`
```

---

## Performance Optimization

### Managing Worktree Count

**Recommendation**: Create a fixed number of worktrees (3-5) and reuse them long-term

```bash
# Create during initialization
colyn add feature/work-1   # task-1: Primary workspace
colyn add feature/work-2   # task-2: Secondary workspace
colyn add feature/work-3   # task-3: Quick fix workspace

# After that, switch via checkout, no more creating new ones
cd worktrees/task-1
colyn checkout feature/new-task
```

**Generally don't delete worktrees**, unless:
- You are certain this parallel work environment is no longer needed
- You need to re-plan the worktree structure

### Cleaning Up Merged Branches

**Recommendation**: Periodically clean up merged Git branches (not worktrees)

```bash
# Delete local branches merged into main
git branch --merged main | grep -v "main" | xargs git branch -d

# Clean up branches deleted from remote
git fetch --prune
```

**Note**: You are cleaning Git branches; worktrees are kept for continued use.

### Using Shallow Clone (Large Repositories)

```bash
# If the repository is large, use shallow clone
git clone --depth 1 <repository>

# Initialize Colyn
colyn init -p 10000
```

---

## Security Practices

### Environment Variable Security

**Rules**:

1. **Sensitive information only in .env.local**
   ```bash
   # .env.local (not committed)
   DATABASE_PASSWORD=secret
   API_SECRET_KEY=super-secret
   JWT_SECRET=jwt-secret-key
   ```

2. **Provide .env.local.example template**
   ```bash
   # .env.local.example (committed to Git)
   DATABASE_PASSWORD=your-password-here
   API_SECRET_KEY=your-api-key-here
   JWT_SECRET=your-jwt-secret-here
   ```

3. **Check .gitignore**
   ```bash
   # Make sure .env.local is ignored
   git check-ignore .env.local
   # Should output: .env.local
   ```

### Avoiding Accidental Commits

**Use a pre-commit hook**:

```bash
# .git/hooks/pre-commit
#!/bin/bash

# Check if .env.local was accidentally added
if git diff --cached --name-only | grep -q ".env.local"; then
  echo "Error: Do not commit the .env.local file!"
  exit 1
fi
```

---

## Recommended Workflows

### Daily Development Flow (Recommended)

```bash
# Starting work in the morning
tmux attach -t my-project  # Attach to tmux session

# Check current status
colyn list

# Continue yesterday's work or switch to a new feature
cd worktrees/task-1
colyn checkout feature/new-feature

# During development
git add src/component.tsx
git commit -m "feat: implement feature"

# Feature complete
colyn merge --push

# Continue with the next feature (reuse the same worktree)
colyn checkout feature/next-task

# End of day
Ctrl-b d  # Detach session (keeps running)
```

### Multi-Feature Parallel Development (Initialization Phase)

```bash
# Create fixed worktrees during project initialization
colyn add feature/authentication  # task-1: Primary workspace
colyn add feature/dashboard       # task-2: Secondary workspace
colyn add feature/quick-fixes     # task-3: Quick fix workspace

# Quickly switch in tmux
Ctrl-b 1  # Window 1 - Primary workspace
Ctrl-b 2  # Window 2 - Secondary workspace
Ctrl-b 3  # Window 3 - Quick fix workspace

# Each workspace switches different tasks via checkout
# task-1 current: feature/authentication
# task-2 current: feature/dashboard
# task-3 current: feature/quick-fixes

# Quick switching and testing
# http://localhost:10001 - Primary workspace
# http://localhost:10002 - Secondary workspace
# http://localhost:10003 - Quick fix workspace
```

### Bug Fix Flow (Reusing Worktrees)

```bash
# Use the quick fix workspace
cd worktrees/task-3
colyn checkout bugfix/issue-123

# Fix the bug
# ... write code ...

# Test the fix
npm run test

# Merge the fix
colyn merge --push

# Continue to next bug (reuse the same worktree)
colyn checkout bugfix/issue-124
```

---

## Monitoring and Maintenance

### Run Repair Periodically

**Recommendation**: Run weekly or after moving the project

```bash
colyn repair
```

**What it checks**:
- Whether Git worktree paths are correct
- Whether .env.local files are complete
- Whether tmux session/windows are working properly

### Check Disk Usage

```bash
# View size of worktrees directory
du -sh worktrees/*

# Example output
1.2G    worktrees/task-1
980M    worktrees/task-2
1.5G    worktrees/task-3
```

### Backup Important Branches

```bash
# Push to remote periodically
git push origin feature/important-feature

# Or create a local backup
git branch backup/feature-important-feature feature/important-feature
```

---

## Anti-Patterns to Avoid

### Developing in the Main Branch

```bash
# Don't do this
cd my-project/my-project
# Modify files directly...
git commit -m "add feature"
```

**Reason**: The main branch should stay clean as the merge target.

### Creating a New Worktree for Every Feature

```bash
# Not recommended: Frequent create and delete
colyn add feature/a
# After completion
colyn remove feature/a

colyn add feature/b
# After completion
colyn remove feature/b

colyn add feature/c
# After completion
colyn remove feature/c
```

**Problems**:
- Wastes time creating and deleting
- Port numbers are not fixed and hard to remember
- tmux window positions are unstable
- Development environment must be reconfigured repeatedly

**Correct approach**:

```bash
# ✓ Recommended: Create a fixed worktree, switch features via checkout
colyn add feature/workspace-1   # Create only once

# Switch features in the same worktree
colyn checkout feature/a
# After completion
colyn merge --push

colyn checkout feature/b
# After completion
colyn merge --push

colyn checkout feature/c
# After completion
colyn merge --push
```

### Ignoring Uncommitted Changes

```bash
# Don't switch or delete with uncommitted changes
colyn checkout new-branch  # Will warn
colyn remove 1             # Will refuse
```

**Reason**: You may lose your work.

### Manually Modifying .env.local

```bash
# Don't manually change the port
# .env.local
PORT=9999  # Don't do this
WORKTREE=1
```

**Reason**: This breaks Colyn's port assignment system.

### Committing .env.local

```bash
# Don't commit environment files
git add .env.local  # Absolutely never
git commit
```

**Reason**: May leak sensitive information.

---

## Tips

### Use Keyboard Shortcuts

Learn and use tmux keyboard shortcuts to boost efficiency:

```bash
Ctrl-b 0-9   # Quickly switch windows
Ctrl-b o     # Switch pane
Ctrl-b z     # Maximize current pane
Ctrl-b [     # Enter copy mode (scroll to view)
```

### Use Command Aliases

Create aliases for frequently used commands:

```bash
# ~/.zshrc
alias ca='colyn add'
alias cm='colyn merge'
alias cl='colyn list'
```

### Keep Branch Names Concise

```bash
# Good branch names
feature/login
bugfix/api-error

# Avoid overly long names
feature/implement-user-authentication-with-oauth-and-jwt
```

**Reason**: tmux window names will be more readable.

### Sync with Remote Regularly

```bash
# Fetch and pull periodically
git fetch origin
git pull origin main
```

### Use .gitignore Templates

Start from a standard template:

```bash
# Use the Node.js template
curl -o .gitignore https://raw.githubusercontent.com/github/gitignore/main/Node.gitignore

# Add Colyn-specific configuration
echo ".env.local" >> .gitignore
```

---

## Summary

Following these best practices helps you:

- Increase development efficiency
- Avoid common mistakes
- Keep the project clean
- Facilitate team collaboration
- Ensure data security

---

## Next Steps

- Having issues? See [Troubleshooting](08-troubleshooting.md)
- Looking up terminology? Refer to the [Glossary](09-glossary.md)
- Want to learn more tips? Review [Advanced Usage](05-advanced-usage.md)
