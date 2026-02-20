# Colyn Tmux Integration Design Document

## Version Information
- Document Version: 2.0
- Updated: 2026-02-14
- Merged from: requirement-tmux-integration.md + design-tmux-enhanced-layout.md

---

## 1. Background and Objectives

### 1.1 Background

Colyn uses Git worktree for parallel Vibe Coding, but requires managing multiple terminal windows. Through tmux integration, we can:
- One tmux session manages the entire project
- One worktree corresponds to one tmux window
- Switch worktrees with Ctrl-b 0-4
- Auto-start dev servers

### 1.2 Design Objectives

1. **Zero Configuration**: Works out of the box without user configuration
2. **Auto-Detection**: Intelligently adapts to tmux environment
3. **Non-Invasive**: Works perfectly outside tmux
4. **Flexible Layout**: Support branch-specific layout and command customization

---

## 2. Core Design

### 2.1 Mapping Relationships

```
Project       → tmux session (session name = project name)
Worktree      → tmux window (window index = worktree ID)
Branch        → window name (last segment of branch name)
```

**Example**:
```
Project: my-task-app
  ├─ main (worktree 0)      → Window 0: "main"
  ├─ task-1 (feature/auth)  → Window 1: "auth"
  └─ task-2 (feature/tasks) → Window 2: "tasks"
```

### 2.2 Minimal Configuration Principle

**All information auto-inferred from environment**, no config file needed:

| Information | Inference Source |
|------------|------------------|
| Session name | Project directory name |
| Window index | Worktree ID |
| Window name | Last segment of branch name (`feature/auth` → `auth`) |
| Main branch | `git branch --show-current` |
| Base port | PORT in main branch `.env.local` |

### 2.3 Command Integration

| Command | In tmux | Outside tmux |
|---------|---------|--------------|
| `colyn init` | Setup Window 0 | Create session (detached) |
| `colyn add` | Create window + switch | Normal worktree creation |
| `colyn checkout` | Update window name | Switch directory |
| `colyn list` | Show window numbers | Show ID column |
| `colyn repair` | Repair missing windows | Create session + repair |
| `colyn tmux` | tmux repair/management | tmux repair/management |

---

## 3. Layout System Design

### 3.1 Supported Layout Types

#### 3.1.1 `single-pane` (Single Pane)
```
┌─────────────────────┐
│                     │
│    Single Pane      │
│                     │
└─────────────────────┘
```

#### 3.1.2 `two-pane-horizontal` (Left-Right Split)
```
┌──────────┬──────────┐
│          │          │
│   Left   │  Right   │
│          │          │
└──────────┴──────────┘
```

#### 3.1.3 `two-pane-vertical` (Top-Bottom Split)
```
┌─────────────────────┐
│      Top Pane       │
├─────────────────────┤
│     Bottom Pane     │
└─────────────────────┘
```

#### 3.1.4 `three-pane` (Three Panes, Default)
```
┌──────────┬──────────┐
│          │  Right   │
│          │   Top    │
│          ├──────────┤
│   Left   │  Right   │
│          │  Bottom  │
└──────────┴──────────┘
```

#### 3.1.5 `four-pane` (Four Panes)
```
┌──────────┬──────────┐
│ Top Left │Top Right │
├──────────┼──────────┤
│Bottom    │Bottom    │
│Left      │Right     │
└──────────┴──────────┘
```

**Four-pane split configuration**:
- `horizontalSplit`: Top-bottom split position (top pane percentage of total height)
- `verticalSplit`: Left-right split position (left pane percentage of total width)
- Can configure one or both splits

### 3.2 Layout and Pane Mapping

| Layout Type | Supported Panes |
|------------|-----------------|
| `single-pane` | None |
| `two-pane-horizontal` | `leftPane`, `rightPane` |
| `two-pane-vertical` | `topPane`, `bottomPane` |
| `three-pane` | `leftPane`, `topRightPane`, `bottomRightPane` |
| `four-pane` | `topLeftPane`, `topRightPane`, `bottomLeftPane`, `bottomRightPane` |

---

## 4. Configuration System Design

### 4.1 Configuration Priority (5 Levels)

From low to high:

```
1. System builtin (System built-in defaults)
   Example: main branch defaults to single-pane
   ↓
2. User default (User-level global config)
   ~/.config/colyn/settings.json tmux section
   ↓
3. Project default (Project-level global config)
   .colyn/settings.json tmux section
   ↓
4. User override (User-level branch overrides)
   ~/.config/colyn/settings.json branchOverrides[branch].tmux
   ↓
5. Project override (Project-level branch overrides)
   .colyn/settings.json branchOverrides[branch].tmux
```

**Key Features**:
- **Field-level override**: Only override explicitly set fields
- **User override > Project default**: Users can override project global config via branch overrides
- **System builtin**: Provides reasonable defaults for special branches (e.g., main)

### 4.2 System Builtin Default Config

```typescript
const BUILTIN_BRANCH_DEFAULTS: Record<string, TmuxConfig> = {
  main: {
    layout: 'single-pane',
    autoRun: false,
  },
};
```

**Design Rationale**:
- Main branch typically used for code review and merging, doesn't need complex layout
- Can be overridden by any user or project config

### 4.3 Configuration Structure

```json
{
  "version": 1,
  "lang": "en",
  "systemCommands": {
    "npm": "yarn",
    "claude": "claude --env your-env"
  },

  "tmux": {
    "layout": "three-pane",
    "autoRun": true,
    "leftPane": {
      "command": "auto continues claude session",
      "size": "60%"
    },
    "topRightPane": {
      "command": "auto start dev server",
      "size": "30%"
    },
    "bottomRightPane": {
      "command": null,
      "size": "70%"
    }
  },

  "branchOverrides": {
    "main": {
      "tmux": {
        "layout": "two-pane-horizontal",
        "leftPane": { "size": "50%" },
        "rightPane": { "command": "colyn list -r" }
      }
    },

    "feature/*": {
      "tmux": {
        "leftPane": { "size": "70%" }
      }
    },

    "hotfix/*": {
      "tmux": {
        "autoRun": false,
        "layout": "single-pane"
      }
    }
  }
}
```

### 4.4 Branch Matching Rules

**Priority (high to low)**:
1. **Exact match**: `main`, `develop`, `feature/auth`
2. **Wildcard match**: `feature/*`, `hotfix/*` (uses first match)
3. **Default config**: Top-level tmux config

**Wildcard Rules**:
- `feature/*`: Matches all branches starting with `feature/`
- `hotfix/*`: Matches all branches starting with `hotfix/`
- `*`: Matches all branches (lowest priority)

### 4.5 Configuration Merge Example

```typescript
// User default
{ "layout": "three-pane", "leftPane": { "size": "60%" } }

// User override (feature/*)
{ "leftPane": { "size": "70%" } }

// Project default
{ "leftPane": { "command": "claude -c" } }

// Final result (on feature/auth branch)
{
  "layout": "three-pane",            // User default
  "leftPane": {
    "command": "claude -c",          // Project default
    "size": "70%"                    // User override
  }
}
```

### 4.6 Version Management and Migration

**Version Number Mechanism**:
- Config file includes `version` field
- Current version: `CURRENT_CONFIG_VERSION = 1`
- Auto-detect and migrate old versions on load

**Migration Chain**:
```typescript
const MIGRATIONS: MigrationFunction[] = [
  // 0 → 1: Add version number
  (settings: Settings): Settings => {
    return { ...settings, version: 1 };
  },
  // Future migrations go here
];
```

**Auto-Migration Flow**:
1. Read config file, detect version number
2. Execute migration chain (from current version to latest)
3. Auto-save migrated config

---

## 5. Built-in Commands

### 5.1 "auto" Commands

| Command | Detection Logic |
|---------|----------------|
| `auto continues claude session` | Check if `~/.claude/projects/{encodedPath}` has session file |
| `auto start dev server` | Detect `dev` script in `package.json` |

**Note**: To add Claude command arguments (such as `--dangerously-skip-permissions`), configure the `systemCommands.claude` field:
```json
{
  "systemCommands": {
    "claude": "claude --dangerously-skip-permissions"
  }
}
```

### 5.2 Default Pane Commands

- **Left pane**: `auto continues claude session`
- **Top-right pane**: `auto start dev server`
- **Bottom-right pane**: `null` (no command execution)

---

## 6. Technical Implementation

### 6.1 TypeScript Type Definitions

```typescript
export type LayoutType =
  | 'single-pane'
  | 'two-pane-horizontal'
  | 'two-pane-vertical'
  | 'three-pane'
  | 'four-pane';

export interface TmuxConfig {
  autoRun?: boolean;
  layout?: LayoutType;

  // Pane configs
  leftPane?: PaneConfig;
  rightPane?: PaneConfig;
  topPane?: PaneConfig;
  bottomPane?: PaneConfig;
  topRightPane?: PaneConfig;
  bottomRightPane?: PaneConfig;
  topLeftPane?: PaneConfig;
  bottomLeftPane?: PaneConfig;

  // Four-pane split config
  horizontalSplit?: string;
  verticalSplit?: string;
}

export interface SystemCommands {
  npm?: string;
  claude?: string;
}

export interface Settings {
  version?: number;
  lang?: string;
  systemCommands?: SystemCommands;
  tmux?: TmuxConfig;
  branchOverrides?: Record<string, Settings>;
}
```

### 6.2 Core Functions

```typescript
// Load branch-specific config
export async function loadTmuxConfigForBranch(
  projectRoot: string,
  branchName: string
): Promise<TmuxConfig>

// Wildcard matching
function matchWildcard(pattern: string, branchName: string): boolean

// Config validation
export function validateTmuxConfig(
  config: TmuxConfig,
  branchName?: string
): ValidationResult

// Layout type detection (backward compatible)
export function detectLayoutType(config: TmuxConfig): LayoutType
```

### 6.3 Config Loading Logic

```typescript
export async function loadTmuxConfigForBranch(
  projectRoot: string,
  branchName: string
): Promise<TmuxConfig> {
  const [userSettings, projectSettings] = await Promise.all([
    loadSettingsFromFile(getUserConfigPath()),
    loadSettingsFromFile(getProjectConfigPath(projectRoot)),
  ]);

  let config: TmuxConfig = {};

  // 1. System builtin
  const builtinBranchDefault = BUILTIN_BRANCH_DEFAULTS[branchName];
  if (builtinBranchDefault) {
    config = mergeConfigs(config, builtinBranchDefault);
  }

  // 2. User default
  if (userSettings?.tmux) {
    config = mergeConfigs(config, userSettings.tmux);
  }

  // 3. Project default
  if (projectSettings?.tmux) {
    config = mergeConfigs(config, projectSettings.tmux);
  }

  // 4. User override
  if (userSettings?.branchOverrides) {
    const userBranchConfig = findBranchOverride(
      userSettings.branchOverrides,
      branchName
    );
    if (userBranchConfig?.tmux) {
      config = mergeConfigs(config, userBranchConfig.tmux);
    }
  }

  // 5. Project override
  if (projectSettings?.branchOverrides) {
    const projectBranchConfig = findBranchOverride(
      projectSettings.branchOverrides,
      branchName
    );
    if (projectBranchConfig?.tmux) {
      config = mergeConfigs(config, projectBranchConfig.tmux);
    }
  }

  return config;
}
```

---

## 7. Backward Compatibility

### 7.1 Layout Auto-Detection

**When no `layout` field**:
```typescript
export function detectLayoutType(config: TmuxConfig): LayoutType {
  // Detect layout type from configured panes
  if (config.leftPane || config.topRightPane || config.bottomRightPane) {
    return 'three-pane';  // Default
  }
  // ...other detection logic
}
```

**Old config auto-recognition**:
```json
// Old config (no layout field)
{
  "tmux": {
    "leftPane": { "command": "claude -c" },
    "topRightPane": { "command": "npm run dev" }
  }
}

// Auto-recognized as three-pane layout
```

### 7.2 Non-tmux Environment Compatibility

**All features work normally outside tmux**:
- `init` → Create session (detached)
- `add` → Normal worktree creation
- `checkout` → Switch directory
- `list` → Normal list

**tmux not installed**:
- Completely disable tmux features
- No prompts shown
- All commands work normally

---

## 8. Design Decision Records

### 8.1 Session Naming

**Decision**: Session name = project name, not stored in config file

**Rationale**:
- Follows minimal configuration principle
- Always inferable from environment
- Avoids config-state inconsistency

### 8.2 Configuration Priority Order

**Decision**: Project override > User override > Project default > User default > System builtin

**Rationale**:
- **Override > Default**: Branch-specific config should override global config
- **User override > Project default**: Users should be able to set personal preferences for specific branches
- **System builtin lowest**: Can be overridden by any user config

### 8.3 Main Branch Default Single-pane

**Decision**: Provide system builtin default config for main branch (single-pane, no auto-run)

**Rationale**:
- Main branch typically used for code review and merging
- Doesn't need complex layout and auto-start commands
- Users can still override at any config level

### 8.4 Field-level Override vs Object Replacement

**Decision**: All config merging uses field-level override

**Rationale**:
- More flexible: Can modify just one field
- More intuitive: Matches user expectations
- Safer: Won't accidentally lose config

**Example**:
```typescript
// Base config
{ leftPane: { command: "A", size: "60%" } }

// Override config
{ leftPane: { size: "70%" } }

// Result (field-level override)
{ leftPane: { command: "A", size: "70%" } }

// Not object replacement:
// { leftPane: { size: "70%" } }  // command lost ❌
```

---

## 9. Future Extensions

### 9.1 Possible Enhancements

- **More layout types**: `three-pane-vertical`, custom layout strings
- **More project types**: Dev server detection for Rails, Django, Go, etc.
- **Layout switching optimization**: Dynamically switch layouts without rebuilding windows
- **Config hot reload**: Monitor config file changes

### 9.2 Not Implementing (Intentional)

- ❌ Layout persistence (leave to tmux plugins)
- ❌ Pane content management (tmux native feature)
- ❌ Session sharing (tmux native feature)

---

## 10. Related Documents

- [Glossary](glossary.md)
- [User Manual - Tmux Integration](../manual/06-tmux-integration.md)
- [Implementation Log](../.claude/logs/tmux-enhanced-layout-implementation-phase2-20260214.md)
- [Config Priority Implementation](../.claude/logs/config-priority-refactor-20260214.md)
- [Version Migration Implementation](../.claude/logs/config-version-migration-20260214.md)
