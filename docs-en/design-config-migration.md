# Configuration File Version Management and Migration Design Document

## Version Information
- Document Version: 1.0
- Created: 2026-02-14

---

## 1. Background and Objectives

### 1.1 Background

As the project evolves, the configuration file structure may change:
- Field renaming
- Field type changes
- Structure adjustments
- New required fields

A mechanism is needed to smoothly migrate user configuration files without breaking existing configurations.

### 1.2 Design Objectives

1. **Automation**: Automatically detect and migrate when loading configurations
2. **Safety**: Preserve all user-customized configurations
3. **Extensibility**: Easy to add new migrations
4. **Traceability**: Clear configuration file versions

---

## 2. Core Design

### 2.1 Version Number Mechanism

**Version Number Definition**:
- Add `version?: number` field to the `Settings` interface
- Define `CURRENT_CONFIG_VERSION` constant to represent the current latest version
- Initial version number starts from 1

**Version Detection**:
- No `version` field in config file → Treated as version 0 (old version)
- `version` in config file < `CURRENT_CONFIG_VERSION` → Needs migration

### 2.2 Migration Chain Pattern

```
Version 0 → Migration[0] → Version 1
         → Migration[1] → Version 2
         → Migration[2] → Version 3
         ...
```

**Migration Function**:
```typescript
type MigrationFunction = (settings: Settings) => Settings;
```

**Migration Array**:
```typescript
const MIGRATIONS: MigrationFunction[] = [
  // Index 0: 0 → 1
  (settings: Settings): Settings => { ... },
  // Index 1: 1 → 2
  (settings: Settings): Settings => { ... },
  // ...future migrations
];
```

### 2.3 Automatic Migration Flow

```
Load config file
    ↓
Detect version (version ?? 0)
    ↓
version < CURRENT_CONFIG_VERSION?
    ↓ Yes
Execute migration chain (MIGRATIONS[version] ... MIGRATIONS[CURRENT_CONFIG_VERSION - 1])
    ↓
Version changed?
    ↓ Yes
Save migrated configuration
    ↓
Return migrated configuration
```

---

## 3. Technical Implementation

### 3.1 Type Definitions

```typescript
/**
 * Configuration file version number
 * Increment on each config structure change
 */
export const CURRENT_CONFIG_VERSION = 1;

/**
 * Configuration migration function
 * Receives old version config, returns new version config
 */
type MigrationFunction = (settings: Settings) => Settings;

/**
 * Settings interface (with version number)
 */
export interface Settings {
  /** Configuration file version number for version management and migration */
  version?: number;

  lang?: string;
  npm?: string;
  tmux?: TmuxConfig;
  branchOverrides?: Record<string, Settings>;
}
```

### 3.2 Migration Array

```typescript
/**
 * Configuration migration function array
 * Function at index i handles migration from version i to version i+1
 */
const MIGRATIONS: MigrationFunction[] = [
  // Migration 0 → 1: Add version number
  (settings: Settings): Settings => {
    return {
      ...settings,
      version: 1,
    };
  },

  // Future migrations go here
  // Example: Migration 1 → 2
  // (settings: Settings): Settings => {
  //   // Migration logic
  //   return { ...settings, version: 2 };
  // },
];
```

### 3.3 Core Functions

```typescript
/**
 * Execute configuration migration
 * @param settings Original configuration
 * @returns Migrated configuration
 */
function migrateSettings(settings: Settings): Settings {
  const currentVersion = settings.version ?? 0;

  // Already latest version, no migration needed
  if (currentVersion >= CURRENT_CONFIG_VERSION) {
    return settings;
  }

  // Execute migration chain
  let migratedSettings = settings;
  for (let i = currentVersion; i < CURRENT_CONFIG_VERSION; i++) {
    const migration = MIGRATIONS[i];
    if (migration) {
      migratedSettings = migration(migratedSettings);
    }
  }

  return migratedSettings;
}

/**
 * Save configuration to file
 */
async function saveSettingsToFile(
  configPath: string,
  settings: Settings
): Promise<void> {
  const content = JSON.stringify(settings, null, 2);
  await fs.writeFile(configPath, content, 'utf-8');
}

/**
 * Load configuration from file (auto-migrate)
 */
async function loadSettingsFromFile(
  configPath: string
): Promise<Settings | null> {
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const rawSettings = JSON.parse(content) as Settings;

    // Auto-migrate
    const oldVersion = rawSettings.version ?? 0;
    const migratedSettings = migrateSettings(rawSettings);
    const newVersion = migratedSettings.version ?? 0;

    // If version changed, save migrated config
    if (oldVersion !== newVersion) {
      await saveSettingsToFile(configPath, migratedSettings);
    }

    return migratedSettings;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
```

---

## 4. Migration Examples

### 4.1 Example 1: Add Version Number (0 → 1)

**Old config** (version 0):
```json
{
  "lang": "zh-CN",
  "tmux": {
    "layout": "three-pane",
    "autoRun": true
  }
}
```

**After migration** (version 1):
```json
{
  "version": 1,
  "lang": "zh-CN",
  "tmux": {
    "layout": "three-pane",
    "autoRun": true
  }
}
```

### 4.2 Example 2: Field Type Change (Future Extension)

Suppose in the future we need to change `leftPane.size` from string to number:

```typescript
// Add to MIGRATIONS array
const MIGRATIONS: MigrationFunction[] = [
  // Migration 0 → 1: Add version number
  (settings: Settings): Settings => {
    return { ...settings, version: 1 };
  },

  // Migration 1 → 2: leftPane.size string → number
  (settings: Settings): Settings => {
    const newSettings = { ...settings };

    // Convert user-level config
    if (newSettings.tmux?.leftPane?.size) {
      const sizeStr = newSettings.tmux.leftPane.size;
      if (typeof sizeStr === 'string' && sizeStr.endsWith('%')) {
        newSettings.tmux.leftPane.size =
          parseInt(sizeStr.replace('%', ''), 10);
      }
    }

    // Convert branch override configs
    if (newSettings.branchOverrides) {
      Object.keys(newSettings.branchOverrides).forEach(branch => {
        const override = newSettings.branchOverrides![branch];
        if (override.tmux?.leftPane?.size) {
          const sizeStr = override.tmux.leftPane.size;
          if (typeof sizeStr === 'string' && sizeStr.endsWith('%')) {
            override.tmux.leftPane.size =
              parseInt(sizeStr.replace('%', ''), 10);
          }
        }
      });
    }

    return { ...newSettings, version: 2 };
  },
];

// Update version constant
export const CURRENT_CONFIG_VERSION = 2;
```

### 4.3 Example 3: Field Renaming (Future Extension)

Suppose in the future we need to rename `npm` to `packageManager`:

```typescript
// Migration 2 → 3: Rename npm to packageManager
(settings: Settings): Settings => {
  const { npm, ...rest } = settings;
  return {
    ...rest,
    packageManager: npm ?? 'yarn',
    version: 3,
  };
}
```

---

## 5. Design Decisions

### 5.1 Why Use Migration Chain?

**Decision**: Use an array of migration functions instead of a single migration function

**Rationale**:
- **Extensible**: Adding new migrations only requires appending to the array
- **Clear**: Each migration function has a clear responsibility
- **Flexible**: Supports multi-version jumps (e.g., from version 0 directly to version 3)

### 5.2 Why Auto-Save?

**Decision**: Automatically save config file after migration

**Rationale**:
- **User-friendly**: Users don't need to manually update config
- **Consistency**: Ensures config on disk matches config in memory
- **Avoid re-migration**: No need to migrate again on next load

### 5.3 Why Migrate on Load?

**Decision**: Execute migration in `loadSettingsFromFile` rather than a separate command

**Rationale**:
- **Transparent**: Completely transparent to users
- **Automated**: No user intervention required
- **Timely**: Migrates immediately on first use of new version

### 5.4 Why Start from Version 1?

**Decision**: Version number starts from 1, old configs treated as version 0

**Rationale**:
- **Distinguish old configs**: Configs without `version` field treated as version 0
- **Intuitive**: Version 1 is the first official version
- **Migration-friendly**: `MIGRATIONS[0]` handles 0 → 1 migration

---

## 6. Best Practices

### 6.1 Writing Migration Functions

**Principles**:
1. ✅ **Maintain idempotence**: Multiple executions produce same result
2. ✅ **Preserve user data**: Don't delete user-customized configs
3. ✅ **Provide defaults**: Provide reasonable defaults for new fields
4. ✅ **Handle edge cases**: Consider missing fields, type errors, etc.
5. ✅ **Recursive processing**: Don't forget nested configs in `branchOverrides`

**Example**:
```typescript
// ❌ Wrong: May delete user config
(settings: Settings): Settings => {
  return { version: 2, tmux: { layout: 'three-pane' } };
}

// ✅ Correct: Preserve all user config
(settings: Settings): Settings => {
  return {
    ...settings,
    tmux: {
      ...settings.tmux,
      layout: settings.tmux?.layout ?? 'three-pane',
    },
    version: 2,
  };
}
```

### 6.2 Testing Migrations

**Test Cases**:
1. ✅ Version 0 → Latest version
2. ✅ Intermediate version → Latest version (cross-version migration)
3. ✅ Already latest version (no migration needed)
4. ✅ Config file doesn't exist
5. ✅ Config file corrupted
6. ✅ Migrated config works properly

### 6.3 Version Number Management

**Rules**:
1. ✅ Increment `CURRENT_CONFIG_VERSION` on each config structure change
2. ✅ Add corresponding migration function to `MIGRATIONS` array
3. ✅ Migration function index must match version number (`MIGRATIONS[i]` handles i → i+1)
4. ✅ Don't delete old migration functions (maintain backward compatibility)

---

## 7. Config Modification Checklist

**When modifying config file structure, must check**:

### 7.1 Does It Need Migration?

Check the following cases:
- [ ] Added new required field
- [ ] Deleted field
- [ ] Renamed field
- [ ] Changed field type
- [ ] Changed field semantics
- [ ] Changed nested structure

**If the following cases, no migration needed**:
- ✅ Added new optional field (with default value)
- ✅ Modified field default value
- ✅ Added new config option

### 7.2 Steps to Create Migration

If migration needed:

1. **Increment version number**
   ```typescript
   export const CURRENT_CONFIG_VERSION = 2;  // Changed from 1 to 2
   ```

2. **Add migration function**
   ```typescript
   const MIGRATIONS: MigrationFunction[] = [
     // Existing migrations
     (settings: Settings): Settings => { ... },

     // New migration (1 → 2)
     (settings: Settings): Settings => {
       // Migration logic
       return { ...settings, version: 2 };
     },
   ];
   ```

3. **Handle all config levels**
   - [ ] User-level global config (`settings.tmux`)
   - [ ] Project-level global config (`settings.tmux`)
   - [ ] User-level branch overrides (`settings.branchOverrides[*].tmux`)
   - [ ] Project-level branch overrides (`settings.branchOverrides[*].tmux`)

4. **Test migration**
   - [ ] Prepare version N-1 config file
   - [ ] Load config, verify migration success
   - [ ] Check migrated config file
   - [ ] Verify migrated config works properly

5. **Update documentation**
   - [ ] Add migration example to this document
   - [ ] Update CHANGELOG
   - [ ] If necessary, update user manual

---

## 8. Integration with Other Systems

### 8.1 Integration with Config Priority System

**Migration Timing**: Auto-migrate when loading config

```typescript
export async function loadTmuxConfigForBranch(
  projectRoot: string,
  branchName: string
): Promise<TmuxConfig> {
  // Auto-migrate on load
  const [userSettings, projectSettings] = await Promise.all([
    loadSettingsFromFile(getUserConfigPath()),     // Auto-migrate user config
    loadSettingsFromFile(getProjectConfigPath(projectRoot)), // Auto-migrate project config
  ]);

  // Subsequent priority merge logic...
}
```

**Benefits**:
- Both user-level and project-level configs are auto-migrated
- Migrated config takes effect immediately
- Doesn't affect priority merge logic

### 8.2 Integration with TypeScript Type System

**Type Safety**:
```typescript
// Settings interface includes version number
export interface Settings {
  version?: number;
  // ...other fields
}

// Migration function type signature ensures type safety
type MigrationFunction = (settings: Settings) => Settings;
```

---

## 9. Related Documents

- [Tmux Integration Design](design-tmux-integration.md)
- [Config Priority Implementation Log](../.claude/logs/config-priority-refactor-20260214.md)
- [Version Migration Implementation Log](../.claude/logs/config-version-migration-20260214.md)
- [CLAUDE.md](../CLAUDE.md) - Config Modification Guidelines
