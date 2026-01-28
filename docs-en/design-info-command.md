# Info Command Design Document

## Overview

The `colyn info` command is used to query the current directory's status within a colyn project, supporting multiple output formats for different use cases.

## Command Syntax

```bash
colyn info [options]
```

## Options

| Option | Short | Description |
|--------|-------|-------------|
| `--short` | `-S` | Output short identifier (with branch info), supports fallback |
| `--field=<name>` | `-f <name>` | Output specified field (can be used multiple times) |
| `--format=<template>` | | Use template string for formatted output |
| `--separator=<char>` | `-s <char>` | Separator for multiple fields (default: tab) |

## Available Fields

| Field Name | Description | Example Value |
|------------|-------------|---------------|
| `project` | Main directory name | `myapp` |
| `project-path` | Main directory full path | `/Users/me/work/myapp/myapp` |
| `worktree-id` | Worktree ID (0 for main branch) | `1` |
| `worktree-dir` | Worktree directory name | `task-1` |
| `branch` | Current branch name | `feature/login` |

## Use Cases

### 1. Output Short Identifier (Recommended for Shell Prompts)

Output format: `{project}/{worktree-dir} (⎇ {branch})`, with smart fallback.

```bash
# In colyn project
$ colyn info --short
myapp/task-1 (⎇ feature/login)

# In git repo (colyn not initialized)
$ colyn info --short
my-repo (⎇ main)

# In non-git directory
$ colyn info --short
my-folder
```

**Fallback Strategy**:
1. **Colyn project**: Display `{project}/{worktree-dir} (⎇ {branch})`
2. **Git repository**: Display `{repo-name} (⎇ {branch})`
3. **Regular directory**: Display `{dir-name}`

**Use Cases**:
- Shell prompt: `PS1='[$(colyn info -S)] $ '`
- Terminal title: `echo -ne "\033]0;$(colyn info -S)\007"`
- Log prefix: `echo "[$(colyn info -S)] Starting build..."`

### 2. Manual Status Check (No Arguments)

Display all information with colors and labels for easy reading.

```bash
$ colyn info
📁 Project:      myapp
📂 Project Path: /Users/me/work/myapp/myapp
🔢 Worktree ID:  1
📁 Worktree Dir: task-1
🌿 Branch:       feature/login
```

### 3. Get Single Field

Output plain text, suitable for use in scripts.

```bash
$ colyn info -f branch
feature/login

$ colyn info --field=project-path
/Users/me/work/myapp/myapp
```

### 4. Get Multiple Fields

Default separator is tab, customizable.

```bash
$ colyn info -f project -f branch
myapp	feature/login

$ colyn info -f project -f branch -s "/"
myapp/feature/login

$ colyn info -f project -f worktree-id -s ":"
myapp:1
```

### 5. Template String Formatting

Use `{field-name}` placeholders.

```bash
$ colyn info --format="{project}/{worktree-dir}"
myapp/task-1

$ colyn info --format="Currently working on {branch} branch"
Currently working on feature/login branch

$ colyn info --format="{project}:{worktree-id}:{branch}"
myapp:1:feature/login
```

## Location Requirements

### Using --short Option

The `--short` option supports running from any location, with automatic fallback:
- In colyn project: Display full information
- In git repository: Display repo name and branch
- In regular directory: Display directory name

### Using Other Options

Command must be executed from one of the following locations:

1. **Main branch directory** (or its subdirectories)
   - `worktree-id` is `0`
   - `worktree-dir` is the main branch directory name (same as `project`)

2. **Worktree directory** (or its subdirectories)
   - `worktree-id` is the actual worktree ID
   - `worktree-dir` is in `task-{id}` format

Running from other locations (project root, `.colyn` directory) will show an error:

```bash
$ cd /path/to/project
$ colyn info
Error: Current directory is not in a worktree or main branch
Hint: Please switch to the main branch directory or a worktree directory
```

## Implementation Details

### Detecting Current Location

1. Call `findProjectRoot()` to find project root directory
2. Check if current directory is under `{root}/{mainDirName}` (main branch)
3. Check if current directory is under `{root}/worktrees/task-*` (worktree)
4. If neither, exit with error

### Getting Branch Information

- Use simple-git's `branch()` method to get current branch name

### Output Format Selection

```
Has --short parameter?  → Output short identifier (with fallback)
Has --format parameter? → Render using template string
Has --field parameter?  → Output specified fields (joined with separator)
None of the above?      → Output full information with colored labels
```

### --short Option Fallback Logic

```typescript
async function getShortId(): Promise<string> {
  try {
    // 1. Try to get colyn info
    const info = await getLocationInfo();
    return `${info.project}/${info.worktreeDir} (⎇ ${info.branch})`;
  } catch {
    try {
      // 2. Try to get git repo name and branch
      const gitRoot = await getGitRoot();
      if (gitRoot) {
        const git = simpleGit();
        const branch = await git.branchLocal();
        const repoName = path.basename(gitRoot);
        return `${repoName} (⎇ ${branch.current})`;
      }
    } catch {
      // Ignore git error, continue fallback
    }

    // 3. Use current directory name
    return path.basename(process.cwd());
  }
}
```

## Exit Codes

| Exit Code | Description |
|-----------|-------------|
| 0 | Success |
| 1 | Project root not found |
| 2 | Not in worktree or main branch directory |
| 3 | Invalid field name |
