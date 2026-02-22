# Colyn Multi-language Support Design Document

## Overview

This document describes the multi-language (i18n) support implementation for the Colyn CLI tool.

## Technical Solution

### Core Dependencies

- **i18next**: Internationalization framework providing translation and interpolation support

### Supported Languages

| Language Code | Language Name | Status |
|--------------|---------------|--------|
| `en` | English | Default language |
| `zh-CN` | Simplified Chinese | Fully supported |

### Language Detection Priority

1. `COLYN_LANG` environment variable (user explicit setting)
2. Project config file (`lang` field in `.colyn/settings.json`)
3. User config file (`lang` field in `~/.config/colyn/settings.json`)
4. System language (`LANG`/`LC_ALL` environment variables)
5. Default to English (`en`)

### Configuration File Support

Besides environment variables, users can also set language preferences through configuration files:

**User-level config** (`~/.config/colyn/settings.json`):
```json
{
  "lang": "zh-CN"
}
```

**Project-level config** (`.colyn/settings.json`):
```json
{
  "lang": "en"
}
```

Use the `colyn config` command to manage language settings:

```bash
# Set user-level language (affects all projects)
colyn config set lang zh-CN --user

# Set project-level language (affects current project only)
colyn config set lang en

# Get current language setting
colyn config get lang
```

### File Structure

```
src/
├── i18n/
│   ├── index.ts           # i18n initialization and exports
│   └── locales/
│       ├── en.ts          # English translations (default)
│       └── zh-CN.ts       # Chinese translations
```

## Translation Key Structure

Translation resources use a hierarchical naming structure:

```typescript
{
  // Common text
  common: {
    error: "Error",
    success: "Success",
    hint: "Hint",
  },

  // CLI related
  cli: {
    description: "Git worktree management tool",
    noColorOption: "Disable color output",
  },

  // Command related
  commands: {
    add: {
      description: "Create a new worktree",
      branchNameEmpty: "Branch name cannot be empty",
    },
    list: {
      description: "List all worktrees",
    },
  },

  // Error messages
  errors: {
    notGitRepo: "Not a git repository",
    projectNotInitialized: "Project not initialized",
  },

  // Output labels
  output: {
    projectRoot: "Project root",
  }
}
```

## Usage

### Basic Usage

```typescript
import { t } from '../i18n/index.js';

// Simple translation
const message = t('common.error');

// Translation with parameters
const message = t('commands.add.branchExists', { branch: 'feature/x' });
```

### Setting Language

**Method 1: Using Config Files (Recommended)**

```bash
# Set user-level language
colyn config set lang zh-CN --user

# Set project-level language
colyn config set lang en

# Get current language
colyn config get lang
```

**Method 2: Using Environment Variables**

```bash
# Set language using environment variable (temporary)
COLYN_LANG=zh-CN colyn --help

# Or set permanently in shell config
export COLYN_LANG=zh-CN
colyn --help
```

**Priority Note**: Environment variable > Project config > User config > System language

### Debug Mode

```bash
# Enable i18n debug output
DEBUG=colyn:i18n colyn --help
```

## Adding New Languages

1. Create a new language file in `src/i18n/locales/` directory (e.g., `ja.ts`)
2. Copy the structure from `en.ts` and translate all text
3. Register the new language in `src/i18n/index.ts`

## Translation Key Naming Conventions

1. Use camelCase naming
2. Group by functional modules
3. Command-related keys go under `commands.{commandName}`
4. Common text goes under `common`
5. Error messages go under `errors`

## Interpolation Syntax

Use `{{variableName}}` syntax for variable interpolation:

```typescript
// Translation file
{
  branchExists: 'Branch "{{branch}}" already has a worktree'
}

// Usage
t('commands.add.branchExists', { branch: 'feature/x' })
// Output: Branch "feature/x" already has a worktree
```

## Notes

1. All user-visible text should use i18n
2. Technical output (JSON, paths) does not need translation
3. Command names and parameter names remain in English
4. Ensure translation file structure matches the English version exactly
