# Command Reference — System & Configuration

[← Back to Command Reference](README.md)

---

## colyn repair

Check and repair project configuration.

### Syntax

```bash
colyn repair
```

### Description

`colyn repair` is used to automatically check and repair project configuration after moving project directories or when configuration issues arise.

**Checks and repairs:**

1. **Main branch .env.local**
   - Check PORT and WORKTREE environment variables
   - WORKTREE must be "main"

2. **Worktree .env.local**
   - Check PORT and WORKTREE environment variables
   - PORT must be `main port + ID`
   - WORKTREE must be ID

3. **Git worktree connections**
   - Run `git worktree repair` to fix connections
   - Repair bidirectional connection between main branch and worktrees

4. **Plugin initialization** (non-fatal)
   - Re-run plugin init for toolchain plugins configured in `.colyn/settings.json`
   - Only shows warning on failure, does not interrupt repair flow

5. **Orphaned worktree directories**
   - Detect worktrees with invalid paths (repairable)
   - Detect true orphan worktrees (report only)

**tmux integration:**
- Creates session if it doesn't exist
- Creates window and sets 3-pane layout if it doesn't exist

### Use Cases

```bash
# After moving project directory
$ mv ~/project ~/Desktop/project
$ cd ~/Desktop/project

# Run repair
$ colyn repair
✔ Detecting and repairing orphaned worktree directories...
✔ Repaired 2 worktrees with invalid paths
✔ Created session "project" and 3 windows

✓ Repair completed!
```

### Result

```
✔ Check main branch .env.local
✔ Check worktree task-1 .env.local
✗ Repair worktree task-2 .env.local
  - PORT: 10005 → 10002
  - WORKTREE: 3 → 2
✔ Repair git worktree connections
✔ Check orphaned worktree directories

✓ Repair completed!
```

### Common Errors

| Error Scenario | System Behavior |
|---------------|-----------------|
| Project not initialized | Error exit, prompts to run `colyn init` first |
| Not a git repository | Error exit, prompts to ensure running in a git project |
| git worktree repair failed | Logs error, continues other checks |
| Cannot write .env.local | Logs error, continues other checks |

### Tips

- Recommended to run immediately after moving project directories
- Uses "best effort" strategy; a single error won't interrupt the flow
- Only repairs clear configuration errors; does not delete files
- Can be run from anywhere in the project

---

## colyn config

Manage Colyn configuration.

### Syntax

```bash
# Show tmux configuration info (default behavior)
colyn config [options]

# Get configuration value
colyn config get <key> [options]

# Set configuration value
colyn config set <key> <value> [options]
```

### Subcommands

#### `colyn config get <key>`

Get the value of a configuration item.

**Parameters:**
- `key` - Config key name (`npm` or `lang`)

**Options:**
- `--user` - Read from user-level config (`~/.config/colyn/settings.json`)

**Examples:**
```bash
# Get language setting for current project
$ colyn config get lang
zh-CN

# Get user-level language setting
$ colyn config get lang --user
en
```

#### `colyn config set <key> <value>`

Set the value of a configuration item.

**Supported configuration keys:**

| Config Key | Description | Valid Values |
|-----------|-------------|-------------|
| `npm` | Package manager command | `npm`, `yarn`, `pnpm`, etc. |
| `lang` | Interface language | `en`, `zh-CN` |

**Options:**
- `--user` - Set user-level configuration (affects all projects)

**Examples:**
```bash
# Set project-level language to Chinese
$ colyn config set lang zh-CN
✓ Configuration set: lang = zh-CN (project)

# Set user-level language to English
$ colyn config set lang en --user
✓ Configuration set: lang = en (user)

# Set package manager to yarn
$ colyn config set npm yarn --user
✓ Configuration set: npm = yarn (user)
```

### Configuration File Priority

Configuration values are determined by the following priority (highest to lowest):

1. **Environment variables**: Only `COLYN_LANG`
2. **Project config**: `.colyn/settings.json`
3. **User config**: `~/.config/colyn/settings.json`
4. **Defaults**: `npm='npm'`, `lang='en'`

### Configuration File Locations

- **User-level config**: `~/.config/colyn/settings.json` (affects all projects)
- **Project-level config**: `.colyn/settings.json` (affects current project only, higher priority)

### Language Settings

```bash
# Set user-level default language (recommended)
colyn config set lang zh-CN --user

# Set specific language for current project
colyn config set lang en

# Temporary use (environment variable)
COLYN_LANG=zh-CN colyn --help
```

---

## colyn completion

Generate shell auto-completion script.

### Syntax

```bash
colyn completion [shell] [options]
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `shell` | No | Shell type (bash or zsh) |

### Options

| Option | Description |
|--------|-------------|
| `--install` | Show installation instructions |

### Description

`colyn completion` generates shell auto-completion scripts, supporting:
- Command completion
- Option completion
- Argument completion (real-time worktree list queries)

### Examples

```bash
# Output bash completion script
$ colyn completion bash

# Output zsh completion script
$ colyn completion zsh

# Show zsh installation instructions
$ colyn completion zsh --install

# Manually install for Bash
$ colyn completion bash > ~/.colyn-completion.bash
$ echo "source ~/.colyn-completion.bash" >> ~/.bashrc

# Manually install for Zsh
$ colyn completion zsh > ~/.colyn-completion.zsh
$ echo "source ~/.colyn-completion.zsh" >> ~/.zshrc
```

### Tips

- `colyn system-integration` command automatically configures completion scripts
- Supports dynamic completion of worktree IDs and branch names
- Tab key auto-completes commands and arguments

---

## colyn system-integration

Configure shell integration (supports automatic directory switching and command completion).

### Syntax

```bash
colyn system-integration
```

### Description

`colyn system-integration` automatically completes shell integration configuration:

**Detection and configuration:**
1. Detect shell type (bash/zsh)
2. Detect shell config file path
3. Locate colyn.sh file path
4. Add shell integration to config file
5. Add completion script to config file

**Update strategy:**
- If config already exists: update path
- If config doesn't exist: append new config
- Preserves other configuration in the file

### Use Cases

```bash
# First-time configuration after installation
$ npm install -g colyn
$ colyn system-integration

Detecting system environment...
✓ Shell type: zsh
✓ Config file: /Users/username/.zshrc
✓ Colyn install path: /Users/username/.volta/...

Configuring shell integration...
✓ Added shell integration to ~/.zshrc
✓ Added completion script to ~/.zshrc

✓ Installation complete!

To activate configuration:
  Option 1 (recommended): Reopen terminal
  Option 2: Run command: source ~/.zshrc
```

### Common Errors

| Error Scenario | Error Message | Solution |
|---------------|---------------|----------|
| colyn.sh not found | `✗ Shell integration script not found` | Check if colyn is fully installed, reinstall |
| Cannot write config file | `✗ Cannot write to config file` | Check file permissions or manually add configuration |
| Windows platform | `⚠ Windows platform does not support automatic configuration` | See Windows configuration instructions in README.md |

### Tips

- Recommended to run immediately after npm global installation
- Supports macOS and Linux, supports bash and zsh
- After configuration, reopen terminal or run `source` command for changes to take effect
- Will not overwrite other content in the user config file
