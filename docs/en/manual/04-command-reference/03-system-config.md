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

### Use Cases

```bash
# After moving project directory
$ mv ~/project ~/Desktop/project
$ cd ~/Desktop/project

# Run repair
$ colyn repair
✔ Detecting and repairing orphaned worktree directories...
✔ Repaired 2 worktrees with invalid paths

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

# Remove configuration value (revert to built-in default)
colyn config unset <key> [options]
```

### Subcommands

#### `colyn config get <key>`

Get the value of a configuration item.

**Parameters:**
- `key` - Config key name. Supports `branchCategories` (returns the merged list), or any key from the "Supported configuration keys" table below

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

# Get the current effective branch type list (project + user + defaults, deduplicated by name, JSON format)
$ colyn config get branchCategories
[
  { "name": "feature", "abbr": "✨feat" },
  { "name": "bugfix", "abbr": "🐛fix" },
  { "name": "refactor", "abbr": "♻️ref" },
  { "name": "document", "abbr": "📝doc" }
]
```

> **Note**: `branchCategories` returns a JSON array. It merges the project config, user config, and built-in defaults, deduplicated by `name` (first occurrence wins).

#### `colyn config set <key> <value>`

Set the value of a configuration item.

**Supported configuration keys:**

| Config Key | Type | Description |
|-----------|------|-------------|
| `lang` | enum | Interface language: `en` / `zh-CN` |
| `verbose` | boolean | Whether to show verbose output by default |
| `systemCommands.npm` | string | Package manager command (default `npm`), e.g. `yarn` / `pnpm` |
| `systemCommands.claude` | string | Claude CLI command |
| `commands.merge.build` / `.rebase` / `.update` / `.fetch` / `.all` | boolean | Default values for `colyn merge` switches |
| `commands.update.rebase` / `.fetch` / `.all` | boolean | Default values for `colyn update` switches |
| `commands.release.update` / `.build` / `.tag` / `.versionUpdate` | boolean | Default values for `colyn release` switches |
| `commands.checkout.fetch` | boolean | Default value for `colyn checkout`'s fetch switch |

> Boolean values accept `true/false/yes/no/1/0/on/off`. See the [configuration manual](../10-configuration.md) for full details on command defaults.

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
$ colyn config set systemCommands.npm yarn --user
✓ Configuration set: systemCommands.npm = yarn (user)

# Make merge skip the build check by default
$ colyn config set commands.merge.build false
✓ Configuration set: commands.merge.build = false (project)
```

#### `colyn config unset <key>`

Remove a configuration item, reverting it to the built-in default.

**Parameters:**
- `key` - See "Supported configuration keys" above (`branchCategories` is not supported)

**Options:**
- `--user` - Remove user-level configuration

**Examples:**
```bash
# Unset the project-level package manager, reverting to the built-in default (npm)
$ colyn config unset systemCommands.npm
✓ Configuration removed: systemCommands.npm (project)
```

### Configuration File Priority

Configuration values are determined by the following priority (highest to lowest):

1. **Environment variables**: Only `COLYN_LANG`
2. **Project config**: `.colyn/settings.json`
3. **User config**: `~/.config/colyn/settings.json`
4. **Defaults**: `systemCommands.npm='npm'`, `lang='en'`

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

- `colyn setup` command automatically configures completion scripts
- Supports dynamic completion of worktree IDs and branch names
- Tab key auto-completes commands and arguments

---

## colyn setup

Configure shell integration (supports automatic directory switching and command completion), plus Claude Code integration (status hooks and skills).

### Syntax

```bash
colyn setup
```

### Description

`colyn setup` automatically completes shell integration and Claude Code integration:

**Detection and configuration:**
1. Detect shell type (bash/zsh)
2. Detect shell config file path
3. Locate colyn.sh and generate the command completion script
4. Add shell integration and completion script to config file
5. Configure Claude Code status hooks (written to `~/.claude/settings.json`)
6. Install the Claude skills bundled with Colyn (copied to `~/.claude/skills/`)

**Claude Code integration (steps 5–6):**
- **Status hooks**: writes a set of hooks forming a complete state machine so Claude Code session state syncs to worktree status in real time — `idle` on session start/end, `running` on prompt submit or after answering, `waiting-confirm` on a confirmation prompt (AskUserQuestion) or when permission is required, and `finish` when the session stops. These show up in the status column of `colyn list`.
- **Claude skills**: copies Colyn's bundled skills into `~/.claude/skills/`, rewriting the `colyn` command inside them to an absolute path.
- Both steps are non-fatal: on failure they only print a warning and do not interrupt setup.

**Update strategy:**
- If config already exists: update path
- If config doesn't exist: append new config
- Preserves other configuration in the file

### Use Cases

```bash
# First-time configuration after installation
$ npm install -g colyn-cli
$ colyn setup

Detecting system environment...
✓ Shell type: zsh
✓ Config file: /Users/username/.zshrc
✓ Colyn install path: /Users/username/.volta/...

Configuring shell integration...
✓ Added shell integration to ~/.zshrc
✓ Added completion script to ~/.zshrc

Configuring Claude Code hooks...
✓ Added Claude Code status hooks

Installing Claude skills...
✓ Installed Claude skills: colyn-todo

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
