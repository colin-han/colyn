# Troubleshooting

This chapter provides solutions for common issues.

---

## Installation Issues

### Q: Running `colyn` shows "command not found"

**Possible causes**:
1. Not added to PATH
2. Shell configuration not reloaded
3. Installation failed

**Solutions**:

```bash
# 1. Check if installed
which colyn

# 2. If not found, check installation method

# npm global install
npm list -g colyn

# If not installed, reinstall
npm install -g colyn-cli

# 3. If installed but not found, check PATH
echo $PATH

# 4. Reload shell configuration
source ~/.zshrc  # or ~/.bashrc

# 5. Or use absolute path
/usr/local/bin/colyn --version
```

### Q: Permission error when installing via npm

**Error message**:
```
EACCES: permission denied
```

**Solutions**:

```bash
# Method 1: Use volta (recommended)
curl https://get.volta.sh | bash
volta install colyn-cli

# Method 2: Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
source ~/.zshrc
npm install -g colyn-cli

# Method 3: Use sudo (not recommended)
sudo npm install -g colyn-cli
```

### Q: Shell integration configuration failed

**Solutions**:

```bash
# 1. Configure manually
colyn setup

# 2. If it fails, check shell type
echo $SHELL

# 3. Manually add to config file
# For Zsh, edit ~/.zshrc
# For Bash, edit ~/.bashrc

# Add the following (replace with actual path)
source /path/to/colyn.d/shell/colyn.sh
# Zsh:
source /path/to/colyn.d/shell/completion.zsh
# Bash:
source /path/to/colyn.d/shell/completion.bash

# 4. Reload configuration
source ~/.zshrc
```

---

## Initialization Issues

### Q: `colyn init` shows "Not a git repository"

**Error message**:
```
✗ Error: The current directory is not a git repository
```

**Solution**:

```bash
# Initialize the git repository
git init

# Then run
colyn init -p 3000
```

### Q: Directory structure is incorrect after initialization

**Checklist**:

```bash
# 1. Check project structure
tree -L 2 .

# You should see:
# .
# ├── .colyn/
# ├── my-project/
# │   ├── .git/
# │   └── ...
# └── worktrees/

# 2. If structure is incorrect, run repair
colyn repair
```

### Q: .env.local file is missing

**Solution**:

```bash
# 1. Check main branch directory
cd my-project/my-project
cat .env.local

# 2. If it doesn't exist, create it manually
echo "PORT=3000" > .env.local
echo "WORKTREE=main" >> .env.local

# 3. Or re-run initialization
cd ../..
colyn repair
```

---

## Worktree Creation Issues

### Q: `colyn add` shows branch already exists

**Error message**:
```
✗ Error: Branch feature/login already has a corresponding worktree
```

**Solution**:

```bash
# 1. View existing worktrees
colyn list

# 2. If you want to use this branch, switch to the corresponding worktree
cd worktrees/task-1

# 3. If you want to delete the old one and create a new one
colyn remove 1
colyn add feature/login
```

### Q: Directory not automatically switched after creation

**Possible causes**:
- Shell integration not configured
- Using the Node.js binary instead of the shell function

**Solution**:

```bash
# 1. Configure shell integration
colyn setup
source ~/.zshrc

# 2. Verify that the shell function is being used
type colyn

# Should output: colyn is a shell function
# Not: colyn is /usr/local/bin/colyn

# 3. If still the binary, reconfigure
source ~/.zshrc
type colyn
```

### Q: Port assignment conflict

**Check ports**:

```bash
# 1. View assigned ports
colyn list

# 2. Check if the port is in use
lsof -i :3001

# 3. If in use, modify the base port
# Edit main branch's .env.local
cd my-project/my-project
vim .env.local
# Change PORT=3000 to PORT=4000

# 4. Recreate worktrees
```

---

## Merge Issues

### Q: `colyn merge` shows working directory is not clean

**Error message**:
```
✗ Error: Working directory has uncommitted changes
```

> Note: Local changes to `.env.local` alone will not trigger this error.

**Solution**:

```bash
# 1. View uncommitted changes
git status

# 2. Commit changes
git add .
git commit -m "complete feature"

# 3. Or stash changes
git stash

# 4. Then merge
colyn merge 1

# 5. Restore stash
git stash pop
```

### Q: Conflict occurred during merge

**Handling process**:

```bash
# 1. Colyn will first merge main into the worktree
cd worktrees/task-1

# 2. Resolve conflicts
# Manually edit conflict files
vim src/conflicted-file.ts

# 3. Mark as resolved
git add src/conflicted-file.ts

# 4. Complete the merge
git commit

# 5. Run merge again
cd ../..
colyn merge 1
```

### Q: Push failed after merge

**Possible causes**:
- Remote branch has been updated
- No push permission

**Solution**:

```bash
# 1. Pull remote updates
cd my-project/my-project
git pull origin main

# 2. If there are conflicts, resolve them and push
git push origin main

# Or use colyn merge's --push option
colyn merge 1 --push
```

---

## Deletion Issues

### Q: `colyn remove` shows uncommitted changes

**Solution**:

```bash
# 1. Commit changes
cd worktrees/task-1
git add .
git commit -m "save changes"

# 2. Or force delete (will lose changes)
colyn remove 1 --force

# 3. Or stash changes
git stash
cd ../..
colyn remove 1
```

> Note: Local changes to `.env.local` alone will not trigger this error.

### Q: Git still shows worktree after deletion

**Solution**:

```bash
# 1. View git worktree list
git worktree list

# 2. If it still exists, remove manually
git worktree remove worktrees/task-1

# 3. Or run repair
colyn repair
```

### Q: Directory not automatically switched after deletion

**Cause**: Shell integration not configured

**Solution**:

```bash
# Configure shell integration
colyn setup
source ~/.zshrc

# Or switch manually
cd ../../my-project
```

---

## Checkout Issues

### Q: `checkout` shows branch does not exist

**Solution**:

```bash
# 1. Check if branch name is correct
git branch -a

# 2. If it's a remote branch, fetch first
git fetch origin

# 3. Then checkout
colyn checkout feature/new-feature

# 4. Or skip fetch (if you're sure it's a new branch)
colyn checkout feature/new-feature --no-fetch
```

### Q: Warning shown about unmerged branch when switching

**Warning message**:
```
⚠️  Current branch has not been merged to main branch
```

**Solution**:

```bash
# 1. Confirm whether you want to abandon the current branch
# If you need to keep it, merge first
colyn merge 1

# 2. Then switch
colyn checkout new-branch

# 3. Or force switch (will prompt to delete old branch)
colyn checkout new-branch
# Select "Yes" to delete the old branch
```

---

## tmux Integration Issues

### Q: tmux session was not automatically created

**Check**:

```bash
# 1. View session list
tmux ls

# 2. If it doesn't exist, create manually
tmux new -s my-project

# 3. Or run repair
colyn repair
```

### Q: tmux window layout is incorrect

**Solution**:

```bash
# 1. Run repair to rebuild the layout
colyn repair

# 2. Or manually adjust the layout
tmux select-layout main-vertical
```

### Q: Dev server was not automatically started

**Possible causes**:
- No `dev` script in package.json
- Dependencies not installed

**Solution**:

```bash
# 1. Check package.json
cat package.json | grep "dev"

# Should have something like:
# "scripts": {
#   "dev": "next dev"
# }

# 2. Install dependencies
npm install

# 3. Start manually
npm run dev
```

---

## Project Move Issues

### Q: Worktrees unusable after moving the project

**Symptoms**:
- `git worktree list` shows incorrect paths
- `colyn list` unable to list worktrees

**Solution**:

```bash
# 1. Run the repair command
colyn repair

# 2. This will automatically:
#    - Fix git worktree paths
#    - Update .env.local files
#    - Rebuild tmux session/windows
```

### Q: repair command execution failed

**Solution**:

```bash
# 1. Manually repair git worktree
cd my-project/my-project
git worktree repair

# 2. Check for orphaned worktrees
git worktree list

# 3. Manually remove invalid ones
git worktree remove --force worktrees/task-1

# 4. Recreate
cd ../..
colyn add feature/branch-name
```

---

## Environment Variable Issues

### Q: PORT environment variable not taking effect

**Check**:

```bash
# 1. View .env.local
cat .env.local

# 2. Confirm the app reads the environment variable
echo $PORT

# 3. If not read, check app configuration
# Most frameworks will automatically read .env.local
# If not, use dotenv
npm install dotenv
```

**Manually load in code**:

```javascript
// At the top of the application entry file
require('dotenv').config({ path: '.env.local' });

// Usage
const port = process.env.PORT || 3000;
```

### Q: WORKTREE environment variable is incorrect

**Solution**:

```bash
# 1. Check .env.local
cat .env.local

# 2. If incorrect, fix manually
echo "WORKTREE=1" >> .env.local

# 3. Or run repair
colyn repair
```

---

## Performance Issues

### Q: System is slow

**Possible causes**:
- Too many worktrees created
- Multiple dev servers running simultaneously
- node_modules occupying too much space

**Solution**:

```bash
# 1. View worktree count
colyn list

# 2. Delete unused worktrees
colyn remove 1
colyn remove 2

# 3. Stop unused dev servers
# Press Ctrl-C in the corresponding pane

# 4. Clean up node_modules
find worktrees -name "node_modules" -type d -prune -exec rm -rf {} \;
```

### Q: Insufficient disk space

**Check usage**:

```bash
# View size of each worktree
du -sh worktrees/*

# Example output
1.2G    worktrees/task-1
980M    worktrees/task-2
1.5G    worktrees/task-3
```

**Cleanup options**:

```bash
# 1. Delete unused worktrees
colyn remove 1

# 2. Clean up node_modules
cd worktrees/task-2
rm -rf node_modules

# 3. Clean up build artifacts
rm -rf .next build dist
```

---

## Command Completion Issues

### Q: Tab completion is not working

**Solution**:

```bash
# 1. Generate completion script
colyn completion zsh > ~/.colyn-completion.zsh

# 2. Add to configuration file
echo "source ~/.colyn-completion.zsh" >> ~/.zshrc

# 3. Reload
source ~/.zshrc

# 4. Test
colyn ad<Tab>  # Should complete to colyn add
```

### Q: Completion script loads slowly

**Optimization**:

```bash
# Use lazy loading
# In ~/.zshrc
autoload -Uz compinit
compinit -C  # -C skips checks, speeds things up
```

---

## Git-Related Issues

### Q: Code not updated after switching branches

**Possible cause**: Cache or compiler issue

**Solution**:

```bash
# 1. Clear cache
rm -rf node_modules/.cache
rm -rf .next

# 2. Reinstall dependencies
npm install

# 3. Restart dev server
npm run dev
```

### Q: Git shows "worktree locked"

**Solution**:

```bash
# 1. Check lock status
cat .git/worktrees/task-1/locked

# 2. Delete lock file
rm .git/worktrees/task-1/locked

# 3. Or use git command
git worktree unlock worktrees/task-1
```

---

## Other Issues

### Q: `colyn info` errors in non-Colyn projects

**Expected behavior**: Will gracefully degrade in non-Colyn projects

**Verification**:

```bash
# In a git repository (non-Colyn project)
cd /some/git/repo
colyn info --short
# Output: repo-name (⎇ main)

# In a regular directory
cd /tmp
colyn info --short
# Output: tmp
```

### Q: Color output is abnormal

**Solution**:

```bash
# 1. Check terminal support
echo $TERM

# 2. If the terminal doesn't support color, disable it
colyn list --no-color

# 3. Or set environment variable
export NO_COLOR=1
colyn list

# 4. Or use an alias
alias colyn='colyn --no-color'
```

### Q: Log file archiving failed

**Occurs during**: `colyn checkout`

**Solution**:

```bash
# 1. Manually create archive directory
mkdir -p .claude/logs/archived

# 2. Archive manually
mv .claude/logs/*.md .claude/logs/archived/

# 3. Run checkout again
colyn checkout new-branch
```

---

## Getting Help

### Command-Line Help

```bash
# View all commands
colyn --help

# View help for a specific command
colyn add --help
colyn merge --help
```

### Diagnostic Information

Collect diagnostic information for reporting issues:

```bash
# System information
uname -a
node --version
git --version
colyn --version

# Colyn status
colyn list --json
colyn info

# Git status
git worktree list
git status

# Directory structure
tree -L 2 .
```

### Submitting an Issue

If the issue is still unresolved, submit an Issue on GitHub:

1. Visit: https://github.com/anthropics/colyn/issues
2. Provide the following information:
   - Operating system and version
   - Node.js and Git versions
   - Colyn version
   - Complete error message
   - Steps to reproduce
   - Diagnostic information

---

## Next Steps

- Looking up terminology? Refer to the [Glossary](09-glossary.md)
- Want to learn best practices? See [Best Practices](07-best-practices.md)
- Want to dive deeper? Read [Core Concepts](03-core-concepts.md)
