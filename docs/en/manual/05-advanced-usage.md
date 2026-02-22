# Advanced Usage

This chapter covers advanced features and use cases for Colyn.

---

## Configuration Management

### Configuration File Hierarchy

Colyn supports two levels of configuration files:

1. **User-level configuration**: `~/.config/colyn/settings.json`
   - Affects all projects
   - Suitable for personal preferences

2. **Project-level configuration**: `.colyn/settings.json` (project root directory)
   - Affects only the current project
   - Takes priority over user configuration

### Configuration Priority

Configuration values are determined by the following priority order (highest to lowest):

1. Environment variables (`COLYN_LANG` only)
2. Project configuration file
3. User configuration file
4. Default values

### Language Settings

**Set the user-level default language**:

```bash
# Use Chinese interface for all projects by default
colyn config set lang zh-CN --user
```

**Set the language for a specific project**:

```bash
# Use English interface for the current project
colyn config set lang en
```

**Temporarily switch language**:

```bash
# Use Chinese temporarily without modifying configuration
COLYN_LANG=zh-CN colyn --help
```

### Package Manager Configuration

If your project uses yarn or pnpm:

```bash
# Set the user-level default package manager
colyn config set npm yarn --user

# Set for a specific project
colyn config set npm pnpm
```

### Viewing Configuration Values

```bash
# View the language setting for the current project
colyn config get lang

# View the user-level package manager setting
colyn config get npm --user
```

---

## Parallel Development with Multiple Worktrees

### Parallel Vibe Coding Methodology

**Core concept**: Use multiple worktrees to develop multiple features in parallel. Each worktree runs its own dev server independently, avoiding context loss from branch switching.

**Use cases**:
- Developing multiple independent features simultaneously
- Handling bug fixes while developing features
- Quickly comparing and testing across different branches
- Parallel collaboration with AI tools (such as Claude Code)

### Practical Example

```bash
# Create three parallel worktrees
colyn add feature/authentication
colyn add feature/dashboard
colyn add feature/notifications

# View all worktrees
colyn list

# Output:
# ┌────────┬──────────────────────┬──────┐
# │ ID     │ Branch               │ Port │
# ├────────┼──────────────────────┼──────┤
# │ 0-main │ main                 │ 3000 │
# │ 1      │ feature/auth       * │ 3001 │
# │ 2      │ feature/dashboard    │ 3002 │
# │ 3      │ feature/notifications│ 3003 │
# └────────┴──────────────────────┴──────┘
```

Access simultaneously in the browser:
- http://localhost:3001 - View authentication feature
- http://localhost:3002 - View dashboard
- http://localhost:3003 - View notifications feature

---

## JSON Output and Script Integration

### Using JSON Format Output

Colyn provides JSON format output for easy processing in scripts:

```bash
# Get the worktree list in JSON format
colyn list --json
```

Example output:

```json
[
  {
    "id": "0-main",
    "branch": "main",
    "port": 3000,
    "path": "/path/to/project/my-project",
    "isCurrent": false
  },
  {
    "id": "1",
    "branch": "feature/login",
    "port": 3001,
    "path": "/path/to/project/worktrees/task-1",
    "isCurrent": true
  }
]
```

### Script Usage Examples

**Get the branch name of the current worktree**:

```bash
colyn list --json | jq -r '.[] | select(.isCurrent) | .branch'
# Output: feature/login
```

**Get all port numbers**:

```bash
colyn list --json | jq -r '.[].port'
# Output:
# 3000
# 3001
# 3002
```

**Count the number of worktrees**:

```bash
colyn list --json | jq 'length'
# Output: 3
```

---

## Path Output Mode

### Using the --paths Option

Get a list of paths for all worktrees:

```bash
colyn list --paths
```

Output:

```
/path/to/project/my-project
/path/to/project/worktrees/task-1
/path/to/project/worktrees/task-2
```

### Using in Scripts

**Iterate over all worktrees**:

```bash
#!/bin/bash
# Execute a command on all worktrees

colyn list --paths | while read -r path; do
  echo "Processing: $path"
  (cd "$path" && git status)
done
```

---

## Flexible Target Identification

### Multiple Ways to Specify a Worktree

Colyn supports three ways to identify a worktree:

#### 1. Using ID

```bash
colyn merge 1
colyn remove 2
colyn checkout 1 new-branch
```

#### 2. Using Branch Name

```bash
colyn merge feature/login
colyn remove feature/dashboard
```

#### 3. Auto-detection (when inside a worktree directory)

```bash
# Inside the worktrees/task-1/ directory
cd worktrees/task-1
colyn merge              # Automatically identified as worktree 1
colyn remove             # Automatically identified as worktree 1
colyn checkout new-branch  # Switch branch in the current worktree
```

---

## Advanced Usage of the Info Command

### Output Format Options

**Full information**:

```bash
colyn info

# Output:
# 📁 Project:       my-project
# 📂 Project Path:  /path/to/my-project
# 🔢 Worktree ID:   1
# 📁 Worktree Dir:  task-1
# 📂 Worktree Path: /path/to/my-project/worktrees/task-1
# 🌿 Branch:        feature/login
```

**Short identifier**:

```bash
colyn info --short

# Output:
# my-project/task-1 (⎇ feature/login)
```

**Specific fields**:

```bash
# Get branch name
colyn info -f branch
# Output: feature/login

# Get port number
colyn info -f port
# Output: 3001

# Multiple fields
colyn info -f project -f branch -f port
# Output: my-project    feature/login    3001
```

**Custom format**:

```bash
colyn info --format '{project}/{worktreeDir} on {branch}'
# Output: my-project/task-1 on feature/login
```

### Integrating into the Shell Prompt

Display project information in the shell prompt:

```bash
# Add to ~/.zshrc
function colyn_prompt() {
  if colyn info &>/dev/null; then
    colyn info --short
  fi
}

PROMPT='[$(colyn_prompt)] %~ $ '
```

Result:

```bash
# Inside a worktree
[my-project/task-1 (⎇ feature/login)] ~/project/worktrees/task-1 $

# In the Main branch
[my-project/main (⎇ main)] ~/project/my-project $

# In a non-Colyn project
~/other-project $
```

---

## Worktree Reuse Strategy

### When to Use `add` vs `checkout`

**Use `colyn add`** (create a new worktree):
- Long-term parallel development of features
- Branches that need to run their own server independently
- Feature testing at different stages

```bash
colyn add feature/payment     # Payment feature
colyn add feature/analytics   # Analytics feature
colyn add feature/admin       # Admin feature
```

**Use `colyn checkout`** (switch branches in an existing worktree):
- Quickly switching to another branch
- Temporary bug fixes
- Multiple branches related to a feature
- Code review

```bash
# Switch branch in worktree 1
colyn checkout 1 bugfix/issue-100
# After fixing, switch to another bug
colyn checkout 1 bugfix/issue-101
```

### Automatic Log Archiving in Checkout

`colyn checkout` automatically archives log files in the `.claude/logs/` directory:

```bash
# Currently on the feature/auth branch
cd worktrees/task-1

# Switch to a new branch
colyn checkout feature/payment

# Colyn automatically:
# 1. Checks if feature/auth has been merged
# 2. Archives log files to .claude/logs/archived/feature-auth/
# 3. Switches to the feature/payment branch
# 4. (Optional) Deletes the merged old branch
```

---

## Project Migration and Repair

### Moving a Project to a New Location

When you need to move the project directory:

```bash
# 1. Move the entire project
mv ~/old-location/my-project ~/new-location/my-project

# 2. Go to the new location
cd ~/new-location/my-project

# 3. Run the repair command
colyn repair
```

**`colyn repair` automatically**:
1. Fixes Git worktree path references
2. Checks and repairs all `.env.local` files
3. Detects and handles orphaned worktree directories
4. If tmux is configured, repairs or rebuilds sessions and windows

### Use Cases for the Repair Command

**Scenario 1: After moving the project**

```bash
$ mv ~/project ~/Desktop/project
$ cd ~/Desktop/project
$ colyn repair

✓ Detecting and repairing orphaned worktree directories...
✓ Fixed 2 worktrees with invalid paths
✓ .env.local file check complete
✓ Repair complete!
```

**Scenario 2: After accidentally deleting a worktree directory**

```bash
# Accidentally deleted the worktrees/task-1 directory
$ rm -rf worktrees/task-1

# Run repair to clean up Git metadata
$ colyn repair

⚠️  Detected orphaned worktree: task-1
✓ Cleaned up Git worktree metadata
```

**Scenario 3: Corrupted environment variable files**

```bash
# .env.local file is corrupted or missing
$ colyn repair

✓ Checking main branch .env.local... OK
✓ Checking worktree 1 .env.local... Fixed
✓ Checking worktree 2 .env.local... OK
```

---

## Command Option Combinations

### Advanced Usage of the Merge Command

**Basic merge**:

```bash
colyn merge 1
```

**Merge and push**:

```bash
colyn merge 1 --push
```

**Auto-detection in the worktree directory**:

```bash
cd worktrees/task-1
colyn merge --push
```

### Advanced Usage of the Remove Command

**Force remove (ignoring uncommitted changes)**:

```bash
colyn remove 1 --force
```

**Skip confirmation prompt**:

```bash
colyn remove 1 --yes
```

**Combined options**:

```bash
colyn remove 1 --force --yes
# Or abbreviated
colyn remove 1 -f -y
```

### Advanced Usage of the List Command

**Hide the Main branch**:

```bash
colyn list --no-main

# Shows only worktrees, not the Main branch
```

**Combine JSON and no-main**:

```bash
colyn list --json --no-main | jq -r '.[].branch'
# Outputs branch names of all worktrees (excluding the Main branch)
```

---

## Advanced Use of Environment Variables

### Using the WORKTREE Environment Variable

Distinguish between different worktrees in application code:

```javascript
// config.js
const worktree = process.env.WORKTREE || 'unknown';

if (worktree === 'main') {
  console.log('Running in main branch');
  // Main branch-specific configuration
} else {
  console.log(`Running in worktree ${worktree}`);
  // Worktree-specific configuration
}
```

### Custom Environment Variables

Add project-specific environment variables in `.env.local`:

```bash
# worktrees/task-1/.env.local
PORT=3001
WORKTREE=1

# Custom variables
DATABASE_URL=postgresql://localhost:5432/dev_db_1
FEATURE_FLAGS=new-ui,beta-features
DEBUG_MODE=true
```

---

## Disabling Color Output

### Global Option --no-color

In environments that do not support color (such as CI/CD), use the `--no-color` option:

```bash
colyn list --no-color
colyn info --no-color
colyn checkout feature/test --no-color
```

### Use Cases

**CI/CD environments**:

```yaml
# .github/workflows/test.yml
steps:
  - name: List worktrees
    run: colyn list --no-color --json
```

**Redirecting output to a file**:

```bash
colyn list --no-color > worktrees.txt
```

**Environment variable**:

```bash
export NO_COLOR=1
colyn list  # Color is automatically disabled
```

---

## Running Commands from Anywhere in the Project

### Automatic Project Root Detection

Colyn automatically searches upward for the `.colyn/` directory to locate the project root:

```bash
# In a deeply nested directory
cd my-project/worktrees/task-1/src/components

# Colyn commands still work
colyn list          # ✓ Works normally
colyn add feature/new  # ✓ Works normally

# Colyn automatically finds the project root my-project/
```

### How It Works

```javascript
// Colyn internal logic
function findProjectRoot(startDir) {
  let currentDir = startDir;

  while (currentDir !== '/') {
    if (fs.existsSync(path.join(currentDir, '.colyn'))) {
      return currentDir;  // Project root found
    }
    currentDir = path.dirname(currentDir);  // Go up one level
  }

  throw new Error('Colyn project not found');
}
```

---

## Command Aliases

### Creating Aliases for Common Commands

Add aliases to your shell configuration file:

```bash
# ~/.zshrc or ~/.bashrc

# Colyn command aliases
alias ca='colyn add'
alias cl='colyn list'
alias cm='colyn merge'
alias cr='colyn remove'
alias co='colyn checkout'  # Note: colyn already has a built-in co alias

# Aliases with options
alias cmp='colyn merge --push'    # Merge and push
alias clj='colyn list --json'     # JSON format list
alias cln='colyn list --no-color' # No-color list
```

Using aliases:

```bash
ca feature/new-feature  # Same as colyn add feature/new-feature
cmp 1                   # Same as colyn merge 1 --push
```

---

## Integration with Git Workflows

### Using Colyn in Git Flow

**Feature branches**:

```bash
# Start a new feature
colyn add feature/user-profile

# Develop...

# Merge when done
colyn merge feature/user-profile --push

# Clean up
colyn remove feature/user-profile
```

**Hotfix workflow**:

```bash
# Emergency fix
colyn add hotfix/security-patch

# Fix...

# Quickly merge and push
colyn merge hotfix/security-patch --push

# Remove immediately
colyn remove hotfix/security-patch -y
```

**Release branches**:

```bash
# Prepare for release
colyn add release/v1.2.0

# Version preparation, testing...

# Merge to Main branch
colyn merge release/v1.2.0 --push
```

---

## Next Steps

- Learn [tmux Integration](06-tmux-integration.md) to boost productivity
- Check [Best Practices](07-best-practices.md) for recommended workflows
- Having issues? See [Troubleshooting](08-troubleshooting.md)
