# Configuration System

This chapter provides a detailed overview of Colyn's configuration system, including the locations, structure, loading order, and all available configuration options for configuration files.

---

## Table of Contents

1. [Configuration File Locations](#configuration-file-locations)
2. [Configuration Loading Order](#configuration-loading-order)
3. [Configuration File Structure](#configuration-file-structure)
4. [Global Configuration Options](#global-configuration-options) (including [plugins](#plugins), [lang](#lang), [systemCommands](#systemcommands), [branchCategories](#branchcategories))
5. [Branch-Specific Configuration](#branch-specific-configuration)
6. [Configuration Management Commands](#configuration-management-commands)
7. [Configuration Examples](#configuration-examples)
8. [Configuration Versioning and Migration](#configuration-versioning-and-migration)
9. [Todo Configuration Options](#todo-configuration-options)
10. [Command Defaults Configuration](#command-defaults-configuration)

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
- Cross-project command defaults (e.g. `verbose`, `commands.*`)
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
- Project-specific command defaults and branch types
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
  "version": 5,
  "lang": "zh-CN",
  "systemCommands": {
    "npm": "yarn"
  }
}
EOF

# Or use YAML format
cat > ~/.config/colyn/settings.yaml << 'EOF'
version: 5
lang: zh-CN
systemCommands:
  npm: yarn
EOF

# Create project-level configuration file (run in project root)
mkdir -p .colyn
cat > .colyn/settings.json << 'EOF'
{
  "version": 5,
  "systemCommands": {
    "npm": "pnpm"
  },
  "verbose": true
}
EOF
```

---

## Configuration Loading Order

Colyn uses a multi-layer configuration system. All configuration options (`lang`, `systemCommands`, `commands`, etc.) follow a unified priority rule.

**Warning**: The list below is sorted by **priority from highest to lowest**; a smaller number means higher priority.

### Unified Configuration Priority

Applies to all configuration options (`lang`, `verbose`, `systemCommands.npm`, `commands.*`, etc.):

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
   └── Built-in defaults (e.g., `lang: "en"`, `systemCommands.npm: "npm"`)
```

**Notes**:
- **All configuration options** support branch overrides (`branchOverrides`)
- You can override `lang`, `systemCommands`, `commands`, and any other configuration in `branchOverrides`
- System builtin defaults apply when no configuration file sets a value

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
  "verbose": true,
  "commands": {
    "merge": {
      "build": false,
      "rebase": false
    }
  }
}

// Project-level configuration (only changes merge.build)
{
  "commands": {
    "merge": {
      "build": true
    }
  }
}

// Final effective configuration
{
  "verbose": true,     // ← from user-level configuration (preserved)
  "commands": {
    "merge": {
      "build": true,   // ← from project-level configuration
      "rebase": false  // ← from user-level configuration (preserved)
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
  "version": 5,

  // Interface language
  "lang": "zh-CN" | "en",

  // Toolchain plugins (automatically detected and written by colyn init; can also be edited manually)
  // Valid values: "npm" | "maven" | "gradle" | "pip"
  // See: manual/11-plugin-system.md for details
  "plugins": ["npm"],

  // Verbose output for all commands (equivalent to -v)
  "verbose": true | false,

  // System command configuration
  "systemCommands": {
    "npm": "npm" | "yarn" | "pnpm"   // Package manager command
  },

  // Untracked File Sync list (see "Command Defaults Configuration")
  "syncFiles": ["data/*.json"],

  // Command defaults (see "Command Defaults Configuration")
  "commands": {
    "merge": { /* MergeCommandConfig */ },
    "update": { /* UpdateCommandConfig */ },
    "release": { /* ReleaseCommandConfig */ },
    "checkout": { /* CheckoutCommandConfig */ }
  },

  // Todo backend configuration (see "Todo Configuration Options")
  "todo": { /* TodoConfig */ },

  // Custom branch types (used for type selection in add/checkout/todo add)
  "branchCategories": [
    { "name": "feature", "abbr": "✨feat" },
    { "name": "bugfix",  "abbr": "🐛fix"  }
  ],

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
**Default**: `5` (current version)
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
colyn config set systemCommands.npm yarn --user

# Set project-level package manager
colyn config set systemCommands.npm pnpm
```

---

### branchCategories

**Type**: `Array<{ name: string; abbr?: string }>`
**Default**: `[ { name: "feature", abbr: "✨feat" }, { name: "bugfix", abbr: "🐛fix" }, { name: "refactor", abbr: "♻️ref" }, { name: "document", abbr: "📝doc" } ]`
**Description**: Custom branch type list, used for the type selection in `add`, `checkout`, `todo add`, and similar operations.

**Field descriptions**:
- `name` - Branch type name, used in the actual branch name (e.g., `feature/user-auth`)
- `abbr` - Display abbreviation, can include emoji (e.g., `✨feat`); if not set, the first 4 characters of `name` are used

**Merge strategy**:
- Project config list + user config list + built-in defaults, deduplicated by `name` (first occurrence wins)
- Custom types appear before the default types

**Example**:

```json
{
  "branchCategories": [
    { "name": "hotfix", "abbr": "🔥fix" },
    { "name": "chore",  "abbr": "🔧chr" }
  ]
}
```

**Effect**: When using `add`, `checkout`, or `todo add`, the type selection list becomes:

```
🔥fix  (hotfix)
🔧chr  (chore)
✨feat (feature)
🐛fix  (bugfix)
♻️ref  (refactor)
📝doc  (document)
```

**View the current effective type list**:

```bash
colyn config get branchCategories
```

Output format (JSON array):
```json
[
  { "name": "hotfix", "abbr": "🔥fix" },
  { "name": "chore",  "abbr": "🔧chr" },
  { "name": "feature", "abbr": "✨feat" },
  { "name": "bugfix",  "abbr": "🐛fix" },
  { "name": "refactor", "abbr": "♻️ref" },
  { "name": "document", "abbr": "📝doc" }
]
```

---

## Branch-Specific Configuration

Using `branchOverrides`, you can customize configuration for specific branches or branch patterns.

**Important**: `branchOverrides` can override **any configuration option**, including:
- `lang` - Use a different language for a specific branch
- `systemCommands` - Use a different package manager for a specific branch
- `commands` - Use different command defaults for a specific branch (e.g. always build on `release/*`)

### Configuration Syntax

```json
{
  "branchOverrides": {
    "branch name or pattern": {
      // Any Settings configuration
      "lang": "...",
      "systemCommands": { ... },
      "commands": { ... }
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
      "systemCommands": {
        "npm": "pnpm"
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
      "commands": {
        "merge": { "build": true }
      }
    },
    "bugfix/*": {
      "lang": "zh-CN"
    }
  }
}
```

**Match examples**:
- `"feature/*"` matches: `feature/auth`, `feature/ui/dashboard`
- `"bugfix/*"` matches: `bugfix/login`, `bugfix/user/profile`
- `"*/test"` matches: `feature/test`, `bugfix/test`

### Configuration Override Examples

**Example 1**: Skip build during daily merges, but always build on release branches

```json
{
  "version": 5,
  "commands": {
    "merge": {
      "build": false
    }
  },
  "branchOverrides": {
    "release/*": {
      "commands": {
        "merge": {
          "build": true
        }
      }
    }
  }
}
```

**Example 2**: Use different package managers and languages for different branches

```json
{
  "version": 5,
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
Configuration Info

User Config:
  Path: /Users/username/.config/colyn/settings.json
  Status: exists
  Content:
    {
      "version": 5,
      "lang": "zh-CN"
    }

Project Config:
  Path: /Users/username/projects/my-app/.colyn/settings.json
  Status: exists
  Content:
    {
      "version": 5,
      "systemCommands": {
        "npm": "yarn"
      }
    }

Effective Configuration:
  {
    "version": 5,
    "lang": "zh-CN",
    "systemCommands": {
      "npm": "yarn"
    }
  }
```

**Effective Configuration** is the user-level and project-level configuration merged by priority, with the current branch's `branchOverrides` applied.

**`--json` output structure**:

```json
{
  "userConfig":    { "path": "...", "exists": true, "content": { ... } },
  "projectConfig": { "path": "...", "exists": true, "content": { ... } },
  "effectiveConfig": { ... }
}
```

### Get Configuration Value

```bash
# Get a project-level configuration value
colyn config get <key>

# Get a user-level configuration value
colyn config get <key> --user
```

**Supported keys**:
- `lang` - Interface language
- `verbose` - Whether to show verbose output by default
- `systemCommands.npm` - Package manager command
- `commands.merge.*` / `commands.update.*` / `commands.release.*` / `commands.checkout.fetch` - Default values for each command's switches
- `branchCategories` - Branch type list (`get` only, returns the merged complete list, in JSON format)

> See [Command Reference · config](04-command-reference/03-system-config.md) for the full list of configuration keys.

**Examples**:

```bash
# View the package manager for the current project
colyn config get systemCommands.npm

# View the user-level language setting
colyn config get lang --user

# View the current effective branch type list
colyn config get branchCategories
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
colyn config set systemCommands.npm yarn

# Set user-level package manager to pnpm
colyn config set systemCommands.npm pnpm --user

# Remove a configuration item, reverting to the built-in default
colyn config unset systemCommands.npm
```

**Note**: `config set` / `config unset` support dotted keys such as `lang`, `verbose`, `systemCommands.*`, and `commands.*` (see [Command Reference · config](04-command-reference/03-system-config.md) for the full list). Object-valued fields such as `branchOverrides`, `branchCategories`, and `todo.github.typeLabels` require manual editing of the configuration file.

---

## Configuration Examples

### Example 1: Minimal Configuration

If you are satisfied with the defaults, you do not need to create any configuration file, or you can create an empty one:

```json
{
  "version": 5
}
```

**Result**:
- English interface (`lang: "en"`)
- `npm` is used as the package manager
- All command switches use their built-in defaults

### Example 2: Simple Customization

Set language and package manager:

```json
{
  "version": 5,
  "lang": "zh-CN",
  "systemCommands": {
    "npm": "yarn"
  }
}
```

### Example 3: Custom Command Defaults

```json
{
  "version": 5,
  "verbose": true,
  "commands": {
    "merge": {
      "build": false,
      "rebase": false
    },
    "update": {
      "all": false
    }
  }
}
```

### Example 4: Branch-Specific Configuration

```json
{
  "version": 5,
  "lang": "zh-CN",
  "systemCommands": {
    "npm": "yarn"
  },
  "commands": {
    "merge": {
      "build": false
    }
  },
  "branchOverrides": {
    "main": {
      "systemCommands": {
        "npm": "pnpm"
      }
    },
    "release/*": {
      "commands": {
        "merge": {
          "build": true
        }
      }
    },
    "feature/china-*": {
      "lang": "zh-CN"
    }
  }
}
```

### Example 5: Team-Shared Configuration

Project-level configuration can be committed to version control so that team members share it:

```json
{
  "version": 5,
  "systemCommands": {
    "npm": "pnpm"
  },
  "branchCategories": [
    { "name": "hotfix", "abbr": "🔥fix" }
  ],
  "syncFiles": ["data/*.json"],
  "commands": {
    "merge": {
      "build": true
    }
  }
}
```

**Commit to Git**:

```bash
git add .colyn/settings.json
git commit -m "Add team colyn configuration"
```

---

## Configuration Versioning and Migration

### Version Management

Colyn uses version numbers to manage the evolution of configuration files. When the configuration structure changes, the system will **automatically migrate** your configuration.

**Current version**: `5`

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

**Migration example**:

**Old configuration** (Version 1):
```json
{
  "version": 1,
  "npm": "yarn"
}
```

**After automatic migration** (Version 2):
```json
{
  "version": 2,
  "systemCommands": {
    "npm": "yarn"
  }
}
```

#### Version 2 to Version 3

**Date**: 2026-02-20

**Changes**:

1. **Configuration file format support**
   - Added YAML format support (`settings.yaml`, `settings.yml`)
   - The original JSON files now use JSON5 parsing (supports comments and trailing commas)
   - Format priority: `settings.json` > `settings.yaml` > `settings.yml`

No field changes; only the `version` number is bumped.

#### Version 3 to Version 4

**Changes**:

1. **Plugin system refactoring**
   - The `plugins` and `pluginSettings` fields are dropped
   - Toolchains are re-detected on demand the next time a command runs

#### Version 4 to Version 5

**Changes**:

1. **Removed obsolete fields**
   - Fields that are no longer used by any command are dropped (including inside `branchOverrides`)
   - `systemCommands.npm` and all other fields are preserved unchanged

**Migration example**:

**Old configuration** (Version 4):
```json
{
  "version": 4,
  "lang": "zh-CN",
  "systemCommands": {
    "npm": "yarn"
  }
}
```

**After automatic migration** (Version 5):
```json
{
  "version": 5,
  "lang": "zh-CN",
  "systemCommands": {
    "npm": "yarn"
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
  "version": 5,
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
echo '{"version": 5}' > ~/.config/colyn/settings.json
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
  "version": 5,
  "systemCommands": { "npm": "yarn" }
}
EOF

cd project-b
cat > .colyn/settings.json << 'EOF'
{
  "version": 5,
  "systemCommands": { "npm": "pnpm" }
}
EOF
```

### 5. How to change the default behavior of a command?

Use the `commands` section (see [Command Defaults Configuration](#command-defaults-configuration)):

```json
{
  "version": 5,
  "commands": {
    "merge": {
      "build": false
    }
  }
}
```

Or for a specific branch:

```json
{
  "version": 5,
  "branchOverrides": {
    "release/*": {
      "commands": {
        "merge": {
          "build": true
        }
      }
    }
  }
}
```

---

## Todo Configuration Options

The `todo` configuration group controls the storage backend and related behavior for the `todo` command.

### todo.backend

**Type**: `"local" | "github"`
**Default**: `"local"`
**Description**: Select the storage backend for todos

| Value | Description |
|-------|-------------|
| `"local"` | Stores todos in a local `todo.json` file under the project directory |
| `"github"` | Stores todos as GitHub Issues in the current repository |

**Prerequisites (when using `"github"`)**:
- `gh` (GitHub CLI) is installed and authenticated
- The `origin` remote of the current repository points to GitHub

**Command-line configuration**:

```bash
# Switch to the GitHub Issues backend
colyn config set todo.backend github

# Switch back to the local backend
colyn config set todo.backend local
```

---

### todo.autoArchive

**Type**: `boolean`
**Default**: `false`
**Description**: When enabled, running `todo complete` to mark a todo as done will also archive it automatically

**Command-line configuration**:

```bash
# Enable auto-archive
colyn config set todo.autoArchive true

# Disable auto-archive
colyn config set todo.autoArchive false
```

---

### todo.github.archivedLabel

**Type**: `string` (optional)
**Default**: Not set
**Description**: GitHub backend only — the name of a GitHub label used to distinguish the "done" state from the "archived" state

**Behavior**:

| Configuration | done | archived |
|---------------|------|----------|
| Not set (default) | closed issue | closed issue (all closed issues are treated as archived) |
| Label name set | closed issue (**without** the label) | closed issue (**with** the label) |

**Command-line configuration**:

```bash
# Set the archived label (e.g., a label named "archived")
colyn config set todo.github.archivedLabel archived
```

---

### todo.github.typeLabels

**Type**: `object` (optional; both keys and values are `string`)
**Default**: `{}`
**Description**: GitHub backend only — defines a mapping between colyn branch types and GitHub labels

**Note**: This field is an object map and **cannot be set via `config set`**. You must edit `.colyn/settings.json` directly.

**Configuration example**:

```jsonc
{
  "todo": {
    "backend": "github",
    "github": {
      "typeLabels": {
        "feature": "enhancement",
        "bugfix": "bug"
      }
    }
  }
}
```

**Explanation**: The example above maps the colyn type `feature` to the GitHub label `enhancement` and `bugfix` to `bug`. Types not listed in the mapping will not have any extra label applied.

---

### Todo Configuration Example

**Using the GitHub Issues backend (full configuration)**:

```jsonc
{
  "version": 3,
  "todo": {
    "backend": "github",
    "autoArchive": true,
    "github": {
      "archivedLabel": "archived",
      "typeLabels": {
        "feature": "enhancement",
        "bugfix": "bug"
      }
    }
  }
}
```

---

## Command Defaults Configuration

Since v3.3, you can set project-level or user-level defaults for boolean options of subcommands in `settings.json`.

**Configuration locations**:
- User level: `~/.config/colyn/settings.json`
- Project level: `<project>/.colyn/settings.json`
- Per-branch overrides are also supported via `branchOverrides`

### Configuration Options Reference

#### Top-Level Fields

| Field | Default | Description |
|-------|---------|-------------|
| `verbose` | `false` | Enable verbose output for all commands, equivalent to adding `-v` every time |
| `syncFiles` | `[]` | Untracked File Sync list (supports wildcards), see below |

#### commands.merge

| Field | Default | CLI On | CLI Off | Description |
|-------|---------|--------|---------|-------------|
| `build` | `true` | `--build` | `--no-build` | Run build before merge |
| `rebase` | `true` | `--rebase` | `--no-rebase` | Use rebase to update main branch |
| `update` | `true` | `--update` | `--no-update` | Update all worktrees before merge |
| `fetch` | `true` | `--fetch` | `--no-fetch` | Run git fetch |
| `all` | `true` | `--all` | `--no-all` / `--current-only` | Update all worktrees |
| `syncConfig` | `true` | `--sync-config` | `--no-sync-config` | Sync runtime config in both directions during merge |
| `syncFiles` | `true` | `--sync-files` | `--no-sync-files` | Sync untracked files on merge (bring back to main and propagate to other worktrees) |

> ⚠️ `merge.all` only takes effect when `merge.update === true`. If `update=false` (or CLI `--no-update`), no worktrees will be updated even when `all=true`.

#### commands.update

| Field | Default | CLI On | CLI Off | Description |
|-------|---------|--------|---------|-------------|
| `rebase` | `true` | `--rebase` | `--no-rebase` | Use rebase to update |
| `fetch` | `true` | `--fetch` | `--no-fetch` | Run git fetch |
| `all` | `true` | `--all` | `--no-all` / `--current-only` | Update all worktrees |
| `syncConfig` | `true` | `--sync-config` | `--no-sync-config` | Sync the main branch's runtime config on update |
| `syncFiles` | `true` | `--sync-files` | `--no-sync-files` | Sync the main branch's untracked files on update |

### Untracked File Sync list (syncFiles)

The top-level `syncFiles` is a **file list** (`string[]`) that controls which files the **Untracked File Sync** mechanism handles: it syncs local files not tracked by git (such as seed data, local certificates) between the main branch directory and worktree directories according to the list. Defaults to `[]`, i.e. the feature is off.

```jsonc
{
  "version": 5,
  "syncFiles": ["data/*.json", "certs/**"]
}
```

Key points:

- **Wildcards**: `*` matches one path segment (does not cross `/`), `**` spans directory segments, same style as `branchOverrides`
- **Sync directions**: `add` / `update` / `repair` copy main → worktree; `merge` first brings worktree-new files back to main, then the `--update` phase propagates them to other worktrees
- **Conservative semantics**: copy only when missing on the target side; if both sides exist with identical content, leave untouched; **differing content raises a conflict message — no overwrite, no merge**; deletions are never propagated
- **Automatic exclusions**: files already tracked by git are synced by git; runtime config files (`.env.local` etc.) are handled by Runtime Config Sync — both are skipped with a notice when matched
- **Add them to `.gitignore` as well**: list files not ignored by git appear in the untracked section of `git status`, which may cause `update` / `merge` to skip the worktree as having a dirty working directory

#### commands.release

| Field | Default | CLI On | CLI Off | Description |
|-------|---------|--------|---------|-------------|
| `update` | `true` | `--update` | `--no-update` | Automatically update all worktrees after a successful release |
| `build` | `true` | `--build` | `--no-build` | Run build before release |
| `tag` | `true` | `--tag` | `--no-tag` | Create git tag |
| `versionUpdate` | `true` | `--version-update` | `--no-version-update` | Update version number |

#### commands.checkout

| Field | Default | CLI On | CLI Off | Description |
|-------|---------|--------|---------|-------------|
| `fetch` | `true` | `--fetch` | `--no-fetch` | Run git fetch before checkout |

### Top-Level Shared verbose

The top-level `verbose: boolean` field applies to all commands that support `-v/--verbose` (merge, release, etc.). A CLI `-v` or `--no-verbose` always takes priority.

### Three-Source Resolution

All boolean options follow this priority order:

1. **Explicit CLI**: `--xxx` or `--no-xxx` specified directly — highest priority
2. **Config file**: Value from `settings.json`'s `commands.<cmd>.<key>` (including branchOverrides)
3. **Built-in default**: The command's built-in default value (usually `true`)

### Configuration Example

```jsonc
{
  "version": 5,

  // Top-level verbose: shared by all commands
  "verbose": true,

  "commands": {
    "merge": {
      "build": false,    // Skip build on merge by default
      "rebase": false    // No rebase
    },
    "update": {
      "all": false       // Only update current worktree (overrides new default all=true)
    }
  },

  // On release/* branches, force build during merge
  "branchOverrides": {
    "release/*": {
      "commands": {
        "merge": { "build": true }
      }
    }
  }
}
```

**What this means**:
- Verbose output always on
- merge skips build and rebase by default (fast daily iteration)
- update only updates the current worktree by default
- On `release/*` branches, merge always runs build

### Negation Flags and --current-only Alias

Every configuration key has a corresponding pair of CLI flags: `--xxx` (enable) / `--no-xxx` (disable). For example, if `commands.merge.build=true` is configured, `merge --no-build` can temporarily override it.

`--no-all` for `update` and `merge` has an alias `--current-only` for clearer intent:

```bash
# These two commands are equivalent
colyn update --no-all
colyn update --current-only
```

### Breaking Changes (v3.3)

> **Please review these incompatible changes when upgrading**:

| Change | Old usage | New usage |
|--------|-----------|-----------|
| `merge --skip-build` removed | `colyn merge --skip-build` | `colyn merge --no-build` |
| `merge --update-all` removed | `colyn merge --update-all` | `colyn merge --all` |
| `update --all` default reversed | Must explicitly add `--all` | All worktrees updated by default |
| Restore old behavior | No extra flags needed | `colyn update --current-only` |
| verbose config source changed | Each command had its own setting | Reads top-level `verbose` field |

---

## Next Steps

- See [Command Reference](04-command-reference.md) for all available commands
- See [Best Practices](07-best-practices.md) for configuration recommendations

---

**Related documentation**:
- [Design doc: Configuration Migration](../docs/design-config-migration.md)
- [Design doc: Command Defaults Configuration](../develop/design/design-command-defaults.md)
- [CLAUDE.md: Configuration Design Principles](../CLAUDE.md#configuration-design-principles)
