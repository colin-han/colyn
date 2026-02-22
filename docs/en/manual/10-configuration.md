# Configuration System

This chapter provides a detailed overview of Colyn's configuration system, including the locations, structure, loading order, and all available configuration options for configuration files.

---

## Table of Contents

1. [Configuration File Locations](#configuration-file-locations)
2. [Configuration Loading Order](#configuration-loading-order)
3. [Configuration File Structure](#configuration-file-structure)
4. [Global Configuration Options](#global-configuration-options) (including [plugins](#plugins), [lang](#lang), [systemCommands](#systemcommands))
5. [Tmux Configuration Options](#tmux-configuration-options)
6. [Branch-Specific Configuration](#branch-specific-configuration)
7. [Configuration Management Commands](#configuration-management-commands)
8. [Configuration Examples](#configuration-examples)
9. [Configuration Versioning and Migration](#configuration-versioning-and-migration)

---

## Configuration File Locations

Colyn supports multiple configuration file formats and loads them by priority:

**Supported formats**:
- **JSON5** (recommended) - `settings.json` - supports comments and trailing commas
- **YAML** - `settings.yaml` or `settings.yml` - more concise syntax

**Format priority**: When multiple format configuration files exist simultaneously:
```
settings.json > settings.yaml > settings.yml
```

Configuration files support two levels:

### 1. User-level Configuration (Global)

**Paths**:
- `~/.config/colyn/settings.json` (JSON5 format, recommended)
- `~/.config/colyn/settings.yaml` (YAML format)
- `~/.config/colyn/settings.yml` (YAML format)

**Scope**: Applies to all projects

**Use cases**:
- Personal preferences (language, package manager, etc.)
- Cross-project tmux layout preferences
- Global rules for specific branch patterns (e.g., all `main` branches)

**Example paths**:
```
/Users/username/.config/colyn/settings.json  # macOS/Linux (JSON5)
/Users/username/.config/colyn/settings.yaml  # macOS/Linux (YAML)
C:\Users\username\.config\colyn\settings.json  # Windows
```

### 2. Project-level Configuration

**Paths**:
- `{project root}/.colyn/settings.json` (JSON5 format, recommended)
- `{project root}/.colyn/settings.yaml` (YAML format)
- `{project root}/.colyn/settings.yml` (YAML format)

**Scope**: Applies only to the current project

**Use cases**:
- Project-specific tmux layouts
- Project-specific system command configuration
- Team-shared configuration (can be committed to version control)

**Example paths**:
```
/Users/username/projects/my-app/.colyn/settings.json (JSON5)
/Users/username/projects/my-app/.colyn/settings.yaml (YAML)
```

### Creating Configuration Files

Configuration files are not created automatically; you need to create them manually as needed:

```bash
# Create user-level configuration directory
mkdir -p ~/.config/colyn

# Create user-level configuration file (JSON5 format)
cat > ~/.config/colyn/settings.json << 'EOF'
{
  "version": 3,
  "lang": "zh-CN",
  "systemCommands": {
    "npm": "yarn"
  }
}
EOF

# Or use YAML format
cat > ~/.config/colyn/settings.yaml << 'EOF'
version: 3
lang: zh-CN
systemCommands:
  npm: yarn
EOF

# Create project-level configuration file (run in project root)
mkdir -p .colyn
cat > .colyn/settings.json << 'EOF'
{
  "version": 3,
  "tmux": {
    "layout": "three-pane",
    "autoRun": true
  }
}
EOF
```

---

## Configuration Loading Order

Colyn uses a multi-layer configuration system. All configuration options (`lang`, `systemCommands`, `tmux`) follow a unified priority rule.

**Warning**: The list below is sorted by **priority from highest to lowest**; a smaller number means higher priority.

### Unified Configuration Priority

Applies to all configuration options (`lang`, `systemCommands.npm`, `systemCommands.claude`, `tmux.*`):

```
1. Project override (project-level branch override) ← highest priority
   └── branchOverrides[branch] in .colyn/settings.json
        ↓
2. User override (user-level branch override)
   └── branchOverrides[branch] in ~/.config/colyn/settings.json
        ↓
3. Project default (project-level global configuration)
   └── .colyn/settings.json
        ↓
4. User default (user-level global configuration)
   └── ~/.config/colyn/settings.json
        ↓
5. System builtin ← lowest priority
   └── Built-in defaults (e.g., main branch defaults to single-pane layout)
```

**Notes**:
- **All configuration options** support branch overrides (`branchOverrides`)
- You can override `lang`, `systemCommands`, `tmux`, and any other configuration in `branchOverrides`
- System builtin only provides defaults for specific branches (e.g., the `main` branch)

### Environment Variables (Special Case)

The `COLYN_LANG` environment variable supports temporarily overriding the interface language, but **does not support branch overrides**:

```
Environment variable COLYN_LANG (highest priority)
  ↓
Project-level configuration
  ↓
User-level configuration
  ↓
Default value
```

**Usage examples**:

```bash
# Temporarily use the Chinese interface
COLYN_LANG=zh-CN colyn --help

# Temporarily use the English interface
COLYN_LANG=en colyn list
```

**Note**: The environment variable has the highest priority but only takes effect in certain commands and does not support branch-specific configuration. In most cases, using a configuration file is recommended over environment variables.

### Configuration Merge Rules

**Field-level Override**:
- Configuration is merged by **field**, not replaced as a whole
- Only explicitly set fields will override values from lower-priority configurations
- Fields that are not set retain values from lower-priority configurations or use defaults

**Example**:

```json
// User-level configuration
{
  "tmux": {
    "autoRun": true,
    "leftPane": {
      "command": "continue claude session",
      "size": "60%"
    }
  }
}

// Project-level configuration (only changes autoRun)
{
  "tmux": {
    "autoRun": false
  }
}

// Final effective configuration
{
  "tmux": {
    "autoRun": false,  // ← from project-level configuration
    "leftPane": {      // ← from user-level configuration (preserved)
      "command": "continue claude session",
      "size": "60%"
    }
  }
}
```

---

## Configuration File Structure

The complete configuration file structure is as follows:

```typescript
{
  // Configuration file version number (used for automatic migration)
  "version": 3,

  // Interface language
  "lang": "zh-CN" | "en",

  // Toolchain plugins (automatically detected and written by colyn init; can also be edited manually)
  // Valid values: "npm" | "maven" | "gradle" | "pip"
  // See: manual/11-plugin-system.md for details
  "plugins": ["npm"],

  // System command configuration
  "systemCommands": {
    "npm": "npm" | "yarn" | "pnpm",  // Package manager command
    "claude": "claude"                // Claude CLI command
  },

  // Tmux configuration
  "tmux": {
    "autoRun": true | false,           // Whether to automatically run commands
    "layout": "single-pane"            // Layout type
            | "two-pane-horizontal"
            | "two-pane-vertical"
            | "three-pane"
            | "four-pane",

    // Pane configuration (different panes used depending on layout type)
    "leftPane": { /* PaneConfig */ },
    "rightPane": { /* PaneConfig */ },
    "topPane": { /* PaneConfig */ },
    "bottomPane": { /* PaneConfig */ },
    "topRightPane": { /* PaneConfig */ },
    "bottomRightPane": { /* PaneConfig */ },
    "topLeftPane": { /* PaneConfig */ },
    "bottomLeftPane": { /* PaneConfig */ },

    // Split configuration for four-pane layout
    "horizontalSplit": "50%",  // Position of the horizontal split line
    "verticalSplit": "50%"     // Position of the vertical split line
  },

  // Branch-specific configuration overrides
  "branchOverrides": {
    "main": { /* Settings */ },
    "feature/*": { /* Settings */ }
  }
}
```

**Notes**:
- All fields are **optional**
- Fields that are not configured will use their default values
- The configuration file only needs to include the fields you want to customize

---

## Global Configuration Options

### version

**Type**: `number`
**Default**: `3` (current version)
**Description**: Configuration file version number, used for automatic migration

**Warning**: Do not modify this field manually; the system manages it automatically

### lang

**Type**: `"en" | "zh-CN"`
**Default**: `"en"`
**Description**: Interface language

**Supported languages**:
- `en` - English
- `zh-CN` - Simplified Chinese

**Example**:

```json
{
  "lang": "zh-CN"
}
```

**Command-line configuration**:

```bash
# Set the user-level default language
colyn config set lang zh-CN --user

# Set the project-level language
colyn config set lang en

# Temporarily switch language (without modifying configuration)
COLYN_LANG=zh-CN colyn --help
```

### plugins

**Type**: `string[]`
**Default**: Automatically detected by `colyn init`
**Description**: List of enabled toolchain plugins

**Valid values**:
- `"npm"` - Node.js / npm projects
- `"maven"` - Java Maven projects
- `"gradle"` - Java / Kotlin Gradle projects
- `"pip"` - Python / pip projects

**Auto-detection rules**:
- `package.json` exists → enable `npm`
- `pom.xml` exists → enable `maven`
- `build.gradle` or `build.gradle.kts` exists → enable `gradle`
- `requirements.txt` or `pyproject.toml` exists → enable `pip`

**Example**:

```json
{
  "plugins": ["npm"]
}
```

**How to modify**:

```bash
# View current configuration
cat .colyn/settings.json

# Manually edit the configuration file to change the plugin list
# For example, a Java + Node.js mixed project can enable multiple plugins:
# "plugins": ["npm", "maven"]
```

> **Note**: Manual modification is usually unnecessary. `colyn init` will automatically detect and write the correct values. Legacy projects will also be automatically detected and migrated the first time any command is run.

---

### systemCommands

**Type**: `object`
**Description**: System command configuration

#### systemCommands.npm

**Type**: `string`
**Default**: `"npm"`
**Description**: Package manager command

**Supported values**:
- `"npm"` - Use npm
- `"yarn"` - Use Yarn
- `"pnpm"` - Use pnpm
- Any other package manager command

**Example**:

```json
{
  "systemCommands": {
    "npm": "yarn"
  }
}
```

**Command-line configuration**:

```bash
# Set user-level default package manager
colyn config set npm yarn --user

# Set project-level package manager
colyn config set npm pnpm
```

#### systemCommands.claude

**Type**: `string`
**Default**: `"claude"`
**Description**: Claude CLI command; supports adding extra arguments

**Example**:

```json
{
  "systemCommands": {
    "claude": "claude --dangerously-skip-permissions"
  }
}
```

**Use cases**:
- Specify a custom path for the Claude CLI
- Add global arguments (e.g., `--dangerously-skip-permissions`)
- Used together with the built-in command `continue claude session`

---

## Tmux Configuration Options

### tmux.autoRun

**Type**: `boolean`
**Default**: `true`
**Description**: Whether to automatically run commands in panes

**Behavior**:
- `true` - Automatically executes the configured commands in the corresponding panes when a Worktree is created
- `false` - Creates panes but does not run commands automatically (opens a shell only)

**Example**:

```json
{
  "tmux": {
    "autoRun": false
  }
}
```

**Use cases**:
- The Main branch is typically set to `false` (no need to auto-start services)
- Feature branches are typically set to `true` (auto-start the development environment)

### tmux.layout

**Type**: `"single-pane" | "two-pane-horizontal" | "two-pane-vertical" | "three-pane" | "four-pane"`
**Default**: `"three-pane"`
**Description**: Layout type for the tmux window

#### Supported Layouts

**1. single-pane**

```
┌──────────────────────┐
│                      │
│                      │
│                      │
│      Single Pane     │
│                      │
│                      │
│                      │
└──────────────────────┘
```

**Use case**: Simple scenarios that do not need splitting (e.g., the main branch)

---

**2. two-pane-horizontal**

```
┌────────────┬─────────┐
│            │         │
│            │         │
│  Left      │  Right  │
│  Pane      │  Pane   │
│            │         │
│            │         │
└────────────┴─────────┘
```

**Panes**: `leftPane`, `rightPane`

---

**3. two-pane-vertical**

```
┌──────────────────────┐
│                      │
│      Top Pane        │
│                      │
├──────────────────────┤
│                      │
│     Bottom Pane      │
│                      │
└──────────────────────┘
```

**Panes**: `topPane`, `bottomPane`

---

**4. three-pane (default)**

```
┌────────────┬─────────┐
│            │  Top    │
│            │  Right  │
│            │  Pane   │
│   Left     ├─────────┤
│   Pane     │ Bottom  │
│            │  Right  │
│            │  Pane   │
└────────────┴─────────┘
```

**Panes**: `leftPane`, `topRightPane`, `bottomRightPane`

**Typical use**:
- Left: Claude Code (AI assistant)
- Top Right: Dev Server (development server logs)
- Bottom Right: Bash (command-line operations)

---

**5. four-pane**

```
┌──────────┬──────────┐
│   Top    │   Top    │
│   Left   │   Right  │
│   Pane   │   Pane   │
├──────────┼──────────┤
│  Bottom  │  Bottom  │
│   Left   │   Right  │
│   Pane   │   Pane   │
└──────────┴──────────┘
```

**Panes**: `topLeftPane`, `topRightPane`, `bottomLeftPane`, `bottomRightPane`

### Pane Configuration (PaneConfig)

Each pane can be configured with the following properties:

```typescript
{
  "command": string | null,  // Command to execute
  "size": string             // Pane size (percentage)
}
```

#### command - Pane Command

**Type**: `string | null`
**Default**: Depends on pane position
**Description**: The command to execute in the pane

**Supported values**:

1. **Built-in commands** - Automatically detected and executed
2. **Custom commands** - Any shell command
3. **null** - Do not execute any command (open a shell only)

##### Built-in Commands

**`"continue claude session"`**

Automatically detects and continues a Claude session:
- If a Claude session exists for the Worktree → runs `claude -c` (continue session)
- If none exists → runs `claude` (start a new session)

**Example**:

```json
{
  "leftPane": {
    "command": "continue claude session"
  }
}
```

---

**`"start dev server"`**

Automatically detects and starts the dev server:
- Detects the `dev` or `start` script in `package.json`
- Automatically executes using the configured package manager

**Detection logic**:
1. Prefers the `dev` script
2. If there is no `dev`, uses the `start` script
3. If neither exists, no command is executed

**Example**:

```json
{
  "topRightPane": {
    "command": "start dev server"
  }
}
```

---

##### Custom Commands

You can specify any shell command:

```json
{
  "bottomRightPane": {
    "command": "git status && echo 'Ready to code!'"
  }
}
```

##### null - No Command

Setting to `null` means no command is executed; only an empty shell is opened:

```json
{
  "bottomRightPane": {
    "command": null
  }
}
```

#### size - Pane Size

**Type**: `string`
**Format**: `"{number}%"` or `"{number}"`
**Description**: The percentage of space occupied by the pane

**Meaning of `size` for different layouts**:

| Layout | Pane | Meaning of size |
|--------|------|-----------------|
| `two-pane-horizontal` | `leftPane` | Percentage of total width occupied by the left pane |
| `two-pane-vertical` | `topPane` | Percentage of total height occupied by the top pane |
| `three-pane` | `leftPane` | Percentage of total width occupied by the left pane |
| `three-pane` | `topRightPane` | Percentage of the right side height occupied by the top-right pane |
| `four-pane` | Each pane | See four-pane layout description |

**Example**:

```json
{
  "tmux": {
    "layout": "three-pane",
    "leftPane": {
      "size": "60%"  // Left pane occupies 60% of the width
    },
    "topRightPane": {
      "size": "30%"  // Top-right pane occupies 30% of the right side height
    }
  }
}
```

### Four-Pane Layout Configuration

The four-pane layout supports two configuration methods:

#### Method 1: Configure both horizontalSplit and verticalSplit

**Recommended**, provides a symmetric layout:

```json
{
  "tmux": {
    "layout": "four-pane",
    "horizontalSplit": "50%",  // Position of the horizontal split (top occupies 50%)
    "verticalSplit": "50%"     // Position of the vertical split (left occupies 50%)
  }
}
```

**Result**:
```
┌──────────┬──────────┐
│    50%   │   50%    │
│    ↑     │          │
├──────────┼──────────┤  ← horizontalSplit: 50%
│          │          │
│          │          │
└──────────┴──────────┘
     ↑
verticalSplit: 50%
```

#### Method 2: Configure size for each pane

**More flexible**, but may be asymmetric:

```json
{
  "tmux": {
    "layout": "four-pane",
    "topLeftPane": { "size": "60%" },    // Top-left occupies 60% of the left side height
    "topRightPane": { "size": "40%" },   // Top-right occupies 40% of the right side height
    "bottomLeftPane": { "size": "40%" }, // Bottom-left occupies 40% of the left side height
    "bottomRightPane": { "size": "60%" } // Bottom-right occupies 60% of the right side height
  }
}
```

**Note**: If both split and pane size are configured, split takes higher priority and pane size will be ignored.

---

## Branch-Specific Configuration

Using `branchOverrides`, you can customize configuration for specific branches or branch patterns.

**Important**: `branchOverrides` can override **any configuration option**, including:
- `lang` - Use a different language for a specific branch
- `systemCommands` - Use a different package manager or Claude command for a specific branch
- `tmux` - Use a different tmux layout for a specific branch

### Configuration Syntax

```json
{
  "branchOverrides": {
    "branch name or pattern": {
      // Any Settings configuration
      "lang": "...",
      "systemCommands": { ... },
      "tmux": { ... }
    }
  }
}
```

### Matching Rules

**1. Exact match** (highest priority)

```json
{
  "branchOverrides": {
    "main": {
      "tmux": {
        "layout": "single-pane",
        "autoRun": false
      }
    }
  }
}
```

**2. Wildcard match**

Supports the `*` wildcard:

```json
{
  "branchOverrides": {
    "feature/*": {
      "tmux": {
        "layout": "three-pane",
        "autoRun": true
      }
    },
    "bugfix/*": {
      "tmux": {
        "layout": "two-pane-horizontal"
      }
    }
  }
}
```

**Match examples**:
- `"feature/*"` matches: `feature/auth`, `feature/ui/dashboard`
- `"bugfix/*"` matches: `bugfix/login`, `bugfix/user/profile`
- `"*/test"` matches: `feature/test`, `bugfix/test`

### Built-in Branch Default Configuration

Colyn provides **system built-in default configuration** for certain branches, with the **lowest** priority:

```json
{
  "main": {
    "tmux": {
      "layout": "single-pane",
      "autoRun": false
    }
  }
}
```

**Characteristics**:
- Lowest priority; overridden by any user or project configuration
- Provides sensible defaults for common branches
- Can be completely overridden in user or project configuration

### Configuration Override Examples

**Example 1**: Main branch uses single-pane, feature branches use three-pane

```json
{
  "version": 3,
  "tmux": {
    "layout": "three-pane",
    "autoRun": true
  },
  "branchOverrides": {
    "main": {
      "tmux": {
        "layout": "single-pane",
        "autoRun": false
      }
    },
    "feature/*": {
      "tmux": {
        "leftPane": {
          "command": "continue claude session"
        },
        "topRightPane": {
          "command": "start dev server"
        }
      }
    }
  }
}
```

**Example 2**: Use different package managers and languages for different branches

```json
{
  "version": 3,
  "lang": "en",
  "systemCommands": {
    "npm": "npm"
  },
  "branchOverrides": {
    "main": {
      "systemCommands": {
        "npm": "pnpm"
      }
    },
    "feature/china-*": {
      "lang": "zh-CN",
      "systemCommands": {
        "npm": "yarn"
      }
    }
  }
}
```

**Description**:
- Main branch uses pnpm
- `feature/china-*` branches use the Chinese interface and yarn
- All other branches use the English interface and npm

---

## Configuration Management Commands

Colyn provides the `config` command to manage configuration.

### View Configuration

```bash
# View full configuration (including user-level, project-level, and the merged effective configuration)
colyn config

# Output in JSON format (suitable for script parsing)
colyn config --json
```

**Output example**:

```
Colyn Configuration

User-level Config:
  Path: /Users/username/.config/colyn/settings.json
  Status: Exists
  Content:
    {
      "version": 3,
      "lang": "zh-CN"
    }

Project-level Config:
  Path: /Users/username/projects/my-app/.colyn/settings.json
  Status: Exists
  Content:
    {
      "version": 3,
      "tmux": {
        "layout": "three-pane"
      }
    }

Effective Config:

  autoRun: true (default)

  leftPane:
    command: "continue claude session" (default)
    size:    "60%" (default)
  ...
```

### Get Configuration Value

```bash
# Get a project-level configuration value
colyn config get <key>

# Get a user-level configuration value
colyn config get <key> --user
```

**Supported keys**:
- `npm` - Package manager
- `lang` - Interface language

**Examples**:

```bash
# View the package manager for the current project
colyn config get npm

# View the user-level language setting
colyn config get lang --user
```

### Set Configuration Value

```bash
# Set a project-level configuration value
colyn config set <key> <value>

# Set a user-level configuration value
colyn config set <key> <value> --user
```

**Examples**:

```bash
# Set user-level language to Chinese
colyn config set lang zh-CN --user

# Set project-level package manager to yarn
colyn config set npm yarn

# Set user-level package manager to pnpm
colyn config set npm pnpm --user
```

**Note**: The `config set` command only supports the `npm` and `lang` configuration options. Tmux-related configuration requires manual editing of the configuration file.

---

## Configuration Examples

### Example 1: Minimal Configuration

If you are satisfied with the defaults, you do not need to create any configuration file, or you can create an empty one:

```json
{
  "version": 3
}
```

**Result**:
- Uses the default layout (`three-pane`)
- Automatically runs commands (`autoRun: true`)
- Left pane runs Claude, top-right runs Dev Server, bottom-right is an empty shell

### Example 2: Simple Customization

Set language and package manager:

```json
{
  "version": 3,
  "lang": "zh-CN",
  "systemCommands": {
    "npm": "yarn"
  }
}
```

### Example 3: Custom Tmux Layout

```json
{
  "version": 3,
  "tmux": {
    "layout": "three-pane",
    "autoRun": true,
    "leftPane": {
      "command": "continue claude session",
      "size": "70%"
    },
    "topRightPane": {
      "command": "start dev server",
      "size": "40%"
    },
    "bottomRightPane": {
      "command": "git status",
      "size": "60%"
    }
  }
}
```

### Example 4: Branch-Specific Configuration

```json
{
  "version": 3,
  "lang": "zh-CN",
  "systemCommands": {
    "npm": "yarn"
  },
  "tmux": {
    "layout": "three-pane",
    "autoRun": true
  },
  "branchOverrides": {
    "main": {
      "tmux": {
        "layout": "single-pane",
        "autoRun": false
      }
    },
    "feature/*": {
      "tmux": {
        "leftPane": {
          "size": "60%"
        },
        "topRightPane": {
          "size": "30%"
        }
      }
    },
    "bugfix/*": {
      "tmux": {
        "layout": "two-pane-horizontal",
        "leftPane": {
          "command": "continue claude session"
        },
        "rightPane": {
          "command": null
        }
      }
    }
  }
}
```

### Example 5: Disable Auto-Run

If you do not want any commands to run automatically:

```json
{
  "version": 3,
  "tmux": {
    "autoRun": false,
    "layout": "three-pane"
  }
}
```

### Example 6: Team-Shared Configuration

Project-level configuration can be committed to version control so that team members share it:

```json
{
  "version": 3,
  "systemCommands": {
    "npm": "pnpm",
    "claude": "claude --dangerously-skip-permissions"
  },
  "tmux": {
    "layout": "three-pane",
    "autoRun": true,
    "leftPane": {
      "command": "continue claude session",
      "size": "60%"
    },
    "topRightPane": {
      "command": "start dev server",
      "size": "30%"
    },
    "bottomRightPane": {
      "command": "npm run test -- --watch",
      "size": "70%"
    }
  },
  "branchOverrides": {
    "main": {
      "tmux": {
        "layout": "single-pane",
        "autoRun": false
      }
    }
  }
}
```

**Commit to Git**:

```bash
git add .colyn/settings.json
git commit -m "Add team tmux configuration"
```

---

## Configuration Versioning and Migration

### Version Management

Colyn uses version numbers to manage the evolution of configuration files. When the configuration structure changes, the system will **automatically migrate** your configuration.

**Current version**: `3`

### Configuration File Formats

Colyn supports multiple configuration file formats:

**JSON5 format** (recommended, filename: `settings.json`)
- Supports comments (`//` and `/* */`)
- Supports trailing commas
- Fully compatible with standard JSON

**YAML format** (filename: `settings.yaml` or `settings.yml`)
- More concise syntax
- Supports comments (`#`)
- Suitable for multi-line configuration

### Automatic Migration Mechanism

**When it triggers**:
- Version is automatically detected when a configuration file is loaded
- If the version is lower than the current version, migration is performed automatically
- After migration, the updated configuration file is saved automatically

**Migration principles**:
- Preserves all user-defined configuration
- Automatically converts to the new configuration structure
- Provides sensible default values
- Recursively processes `branchOverrides`

**What you need to do**: **Nothing!** The system handles it automatically.

### Version History

#### Version 0 to Version 1

**Date**: 2026-02-14

**Changes**:
- Added the `version` field for version management

#### Version 1 to Version 2

**Date**: 2026-02-20

**Changes**:

1. **Configuration structure refactoring**
   - `npm` → `systemCommands.npm`
   - `claudeCommand` → `systemCommands.claude`

2. **Deprecated built-in command handling**
   - `"auto continues claude session with dangerously skip permissions"` → `"auto continues claude session"`
   - Automatically adds `--dangerously-skip-permissions` to `systemCommands.claude`

**Migration example**:

**Old configuration** (Version 1):
```json
{
  "version": 1,
  "npm": "yarn",
  "claudeCommand": "claude --env prod",
  "tmux": {
    "leftPane": {
      "command": "auto continues claude session with dangerously skip permissions"
    }
  }
}
```

**After automatic migration** (Version 2):
```json
{
  "version": 2,
  "systemCommands": {
    "npm": "yarn",
    "claude": "claude --env prod --dangerously-skip-permissions"
  },
  "tmux": {
    "leftPane": {
      "command": "auto continues claude session"
    }
  }
}
```

#### Version 2 to Version 3 (current version)

**Date**: 2026-02-20

**Changes**:

1. **Renamed built-in commands** (removed the "auto" prefix)
   - `"auto continues claude session"` → `"continue claude session"`
   - `"auto start dev server"` → `"start dev server"`

2. **Configuration file format support**
   - Added YAML format support (`settings.yaml`, `settings.yml`)
   - The original JSON files now use JSON5 parsing (supports comments and trailing commas)
   - Format priority: `settings.json` > `settings.yaml` > `settings.yml`

**Migration example**:

**Old configuration** (Version 2):
```json
{
  "version": 2,
  "systemCommands": {
    "npm": "yarn"
  },
  "tmux": {
    "leftPane": {
      "command": "auto continues claude session"
    },
    "topRightPane": {
      "command": "auto start dev server"
    }
  }
}
```

**After automatic migration** (Version 3):
```json
{
  "version": 3,
  "systemCommands": {
    "npm": "yarn"
  },
  "tmux": {
    "leftPane": {
      "command": "continue claude session"
    },
    "topRightPane": {
      "command": "start dev server"
    }
  }
}
```

### Check Configuration Version

```bash
# View the version number in the configuration file
cat ~/.config/colyn/settings.json | grep version

# Or view the full configuration
colyn config --json | grep version
```

### Manual Configuration Update

Manual updates are generally not needed, but if you want to proactively trigger migration:

```bash
# Simply run any command that loads the configuration
colyn config

# The system will automatically detect the version and migrate
```

### Corrupted Configuration File

If the configuration file is corrupted or cannot be parsed:

```bash
# Back up the old configuration
mv ~/.config/colyn/settings.json ~/.config/colyn/settings.json.bak

# Create a new configuration
cat > ~/.config/colyn/settings.json << 'EOF'
{
  "version": 3,
  "lang": "zh-CN"
}
EOF
```

---

## Frequently Asked Questions

### 1. Configuration not taking effect?

**Troubleshooting steps**:

```bash
# 1. View the effective configuration
colyn config

# 2. Check configuration priority
#    Environment variable > Project config > User config > Default value

# 3. Check JSON syntax
cat ~/.config/colyn/settings.json | jq .
cat .colyn/settings.json | jq .
```

### 2. How to reset to default configuration?

```bash
# Simply delete the configuration file
rm ~/.config/colyn/settings.json  # user-level
rm .colyn/settings.json           # project-level

# Or set to empty configuration
echo '{"version": 3}' > ~/.config/colyn/settings.json
```

### 3. Branch override configuration not taking effect?

**Possible causes**:

1. **Wildcard syntax error**
   ```json
   // Wrong
   "feature*": { ... }

   // Correct
   "feature/*": { ... }
   ```

2. **Exact match takes priority**
   ```json
   {
     "branchOverrides": {
       "feature/auth": { ... },  // exact match
       "feature/*": { ... }       // wildcard match
     }
   }
   // Branch "feature/auth" uses the exact match configuration
   ```

### 4. How to use different configurations for different projects?

**Solution**: Use project-level configuration

```bash
cd project-a
cat > .colyn/settings.json << 'EOF'
{
  "version": 3,
  "systemCommands": { "npm": "yarn" }
}
EOF

cd project-b
cat > .colyn/settings.json << 'EOF'
{
  "version": 3,
  "systemCommands": { "npm": "pnpm" }
}
EOF
```

### 5. How to disable tmux auto-run?

```json
{
  "version": 3,
  "tmux": {
    "autoRun": false
  }
}
```

Or for a specific branch:

```json
{
  "version": 3,
  "branchOverrides": {
    "main": {
      "tmux": {
        "autoRun": false
      }
    }
  }
}
```

---

## Next Steps

- See [Tmux Integration](06-tmux-integration.md) to learn about the tmux workflow
- See [Command Reference](04-command-reference.md) for all available commands
- See [Best Practices](07-best-practices.md) for configuration recommendations

---

**Related documentation**:
- [Design doc: Configuration Migration](../docs/design-config-migration.md)
- [CLAUDE.md: Configuration Design Principles](../CLAUDE.md#configuration-design-principles)
