# Colyn Multi-language Support Design Document

## Overview

This document describes the multi-language (i18n) support implementation for the Colyn CLI tool.

## Technical Solution

### Core Dependencies

- **i18next**: Internationalization framework providing translation functionality and interpolation support

### Supported Languages

| Language Code | Language Name | Status |
|---------------|---------------|--------|
| `en` | English | Default language |
| `zh-CN` | Simplified Chinese | Full support |

### Language Detection Priority

1. `COLYN_LANG` environment variable (user explicit setting)
2. System language (`LANG`/`LC_ALL` environment variables)
3. Default English (`en`)

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
    // ...
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
      // ...
    },
    list: {
      description: "List all worktrees",
      // ...
    },
    // Other commands...
  },

  // Error messages
  errors: {
    notGitRepo: "Not a git repository",
    projectNotInitialized: "Project not initialized",
    // ...
  },

  // Output labels
  output: {
    projectRoot: "Project root",
    // ...
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

```bash
# Set language using environment variable
export COLYN_LANG=zh-CN
colyn --help

# Or set temporarily
COLYN_LANG=zh-CN colyn --help
```

### Debug Mode

```bash
# Enable i18n debug output
DEBUG=colyn:i18n colyn --help
```

## Adding New Languages

1. Create a new language file in `src/i18n/locales/` directory (e.g., `ja.ts`)
2. Copy the structure from `en.ts` and translate all text
3. Register the new language in `src/i18n/index.ts`:

```typescript
import { ja } from './locales/ja.js';

// Add to SUPPORTED_LANGUAGES
const SUPPORTED_LANGUAGES = ['en', 'zh-CN', 'ja'] as const;

// Add to i18next.init resources
resources: {
  en: { translation: en },
  'zh-CN': { translation: zhCN },
  ja: { translation: ja },
},
```

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

## Pluralization Support

i18next supports plural forms, but not currently used in this implementation. To add:

```typescript
// Translation file
{
  files: {
    count_one: "{{count}} file",
    count_other: "{{count}} files"
  }
}

// Usage
t('files.count', { count: 5 }) // "5 files"
```

## Notes

1. All user-visible text should use i18n
2. Technical output (such as JSON, paths) does not need translation
3. Command names and parameter names remain in English
4. Ensure translation file structure matches the English version exactly
