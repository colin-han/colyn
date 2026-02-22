# Configuration System Refactor Design - Simplifying with Libraries

## Version Info
- Document Version: 1.0
- Created: 2026-02-20
- Status: Design Phase (Under Discussion)

---

## Table of Contents

1. [Background & Motivation](#1-background--motivation)
2. [Research Findings](#2-research-findings)
3. [Recommended Solution](#3-recommended-solution)
4. [Detailed Design](#4-detailed-design)
5. [Implementation Plan](#5-implementation-plan)
6. [Risk Assessment](#6-risk-assessment)
7. [Discussion Points](#7-discussion-points)

---

## 1. Background & Motivation

### 1.1 Current Implementation Issues

The existing configuration system uses a pure manual implementation with the following problems:

1. **Cumbersome Configuration Loading Logic**
   - Manual file path lookup
   - Manual JSON parsing and error handling
   - Need to maintain two separate loading logics for user and project levels

2. **Complex Configuration Merging Logic**
   - Manual deep merge implementation
   - Need to handle various edge cases (undefined, null, arrays, etc.)
   - Poor code maintainability

3. **Insufficient Type Safety**
   - Configuration validation relies mainly on TypeScript types
   - Cannot catch configuration errors at runtime
   - Migration logic prone to errors

4. **Tedious Migration Implementation**
   - Each migration function requires extensive hand-written code
   - Easy to miss nested fields (like branchOverrides)
   - Lack of automated validation

### 1.2 Refactoring Goals

By introducing mature open-source libraries, achieve:

- ✅ **Simplify Code**: Reduce manual logic, improve maintainability
- ✅ **Enhance Type Safety**: Runtime validation of configuration structure
- ✅ **Improve User Experience**: Provide friendlier error messages
- ✅ **Maintain Compatibility**: Fully compatible with existing configuration files

---

## 2. Research Findings

### 2.1 Configuration Loading - json5 + yaml

Based on project requirements, configuration file locations are clearly fixed:
- **Project-level**: `{projectRoot}/.colyn/settings.{json|yaml|yml}`
- **User-level**: `~/.config/colyn/settings.{json|yaml|yml}`

Therefore **no need for cosmiconfig** (its main advantage is searching multiple locations), use format parsers directly.

**[json5](https://www.npmjs.com/package/json5)** - JSON5 format parser

**Basic Info**:
- Weekly downloads: 70M+
- TypeScript support: Full type definitions
- Maintenance status: Stable maintenance

**Core Features**:
- Support comments (single-line `//` and multi-line `/* */`)
- Support trailing commas
- Support single-quoted strings
- 100% backward compatible with standard JSON

**Example Code**:
```typescript
import JSON5 from 'json5';

// Can parse JSON with comments
const config = JSON5.parse(`{
  "version": 2,
  // This is a comment
  "lang": "zh-CN",
}`);
```

---

**[js-yaml](https://www.npmjs.com/package/js-yaml)** - YAML format parser

**Basic Info**:
- Weekly downloads: 80M+
- TypeScript support: Full type definitions
- Maintenance status: Stable maintenance

**Core Features**:
- Full YAML 1.2 support
- Safe loading mode
- Support custom types

**Example Code**:
```typescript
import yaml from 'js-yaml';

const config = yaml.load(`
version: 2
lang: zh-CN
tmux:
  layout: three-pane
`);
```

**Pros**:
- ✅ More concise syntax (no quotes, commas needed)
- ✅ More human-readable and writable
- ✅ Support multi-line strings
- ✅ Widely used (Docker, Kubernetes, etc.)

**Config File Loading Strategy**:
```typescript
// Try loading in order:
// 1. settings.json (json5)
// 2. settings.yaml
// 3. settings.yml
```

### 2.2 Configuration Merging - deepmerge

**[deepmerge](https://www.npmjs.com/package/deepmerge)** - Lightweight deep merge library

**Basic Info**:
- Package size: < 1KB
- TypeScript support: Full type definitions
- Maintenance status: Stable maintenance

**Core Features**:
- Deep merge objects
- Customizable array merge strategies
- Support merging multiple objects

**Example Code**:
```typescript
import deepmerge from 'deepmerge';

const defaultConfig = {
  tmux: {
    layout: 'three-pane',
    leftPane: { size: '60%' },
  },
};

const userConfig = {
  tmux: {
    autoRun: false,
  },
};

const merged = deepmerge(defaultConfig, userConfig);
// Result: {
//   tmux: {
//     layout: 'three-pane',
//     leftPane: { size: '60%' },
//     autoRun: false
//   }
// }
```

**Pros**:
- ✅ Eliminates manual merge logic
- ✅ Well-tested, handles edge cases properly
- ✅ Lightweight, no performance impact

**Cons**:
- ⚠️ Need to configure correct array merge strategy

### 2.3 Schema Validation - Zod

**[Zod](https://www.npmjs.com/package/zod)** - TypeScript-first schema validation library

**Basic Info**:
- Most popular TS validation library in 2025-2026
- TypeScript support: Native, automatic type inference
- Maintenance status: Actively maintained

**Core Features**:
- Declarative schema definition
- Runtime validation
- Automatic type inference (DRY: Don't Repeat Yourself)
- Support transform and complex validation rules
- Friendly error messages

**Example Code**:
```typescript
import { z } from 'zod';

// Define Schema (code as documentation)
const SettingsSchema = z.object({
  version: z.number(),
  lang: z.enum(['en', 'zh-CN']).optional(),
  systemCommands: z.object({
    npm: z.string().optional(),
    claude: z.string().optional(),
  }).optional(),
});

// Auto-infer type (no need to write interface manually)
type Settings = z.infer<typeof SettingsSchema>;

// Validate config
const config = SettingsSchema.parse(rawConfig);
// If validation fails, throws detailed error message

// Use transform to implement Migration
const V1Schema = z.object({
  version: z.literal(1),
  npm: z.string().optional(),
}).transform((v1): Settings => ({
  version: 2,
  systemCommands: { npm: v1.npm },
}));
```

**Pros**:
- ✅ Type definition and runtime validation in one (DRY)
- ✅ Clearer migration logic
- ✅ Friendly error messages
- ✅ Reduces type definition code volume

**Cons**:
- ⚠️ Larger package size (~50KB)
- ⚠️ Learning curve (need to learn Zod API)

**Alternative Comparison**:

| Library | TypeScript Support | Performance | Package Size | Ecosystem |
|---|---|---|---|---|
| **Zod** | ⭐⭐⭐⭐⭐ Native | ⭐⭐⭐⭐ Fast | ~50KB | Most popular in 2026 |
| AJV | ⭐⭐⭐ Extra work needed | ⭐⭐⭐⭐⭐ Fastest | ~120KB | JSON Schema standard |
| Joi | ⭐⭐ Weak type inference | ⭐⭐⭐ Medium | ~200KB | Veteran library |

**Why Recommend Zod**:
1. Best native TypeScript support
2. More concise code (type inference)
3. Most active ecosystem in 2026

---

## 3. Recommended Solution

### 3.1 Tech Stack

```
┌──────────────────────────────────────┐
│      Configuration System Arch       │
├──────────────────────────────────────┤
│                                      │
│  json5 + js-yaml (Format parsing)    │
│      ↓                               │
│  Zod (Schema validation + Migration) │
│      ↓                               │
│  deepmerge (Multi-layer merging)     │
│      ↓                               │
│  Final effective config              │
│                                      │
└──────────────────────────────────────┘
```

**Dependencies**:
- ✅ `json5` - JSON5 format parsing (with comments)
- ✅ `js-yaml` - YAML format parsing
- ✅ `zod` - Schema validation and migration
- ✅ `deepmerge` - Deep merge configs

### 3.2 Configuration File Formats

**Supported Formats**:

1. **JSON (parsed with JSON5)**
   ```json5
   // .colyn/settings.json
   {
     "version": 2,
     // Comments supported
     "lang": "zh-CN",
     "systemCommands": {
       "npm": "yarn",  // Trailing commas supported
     },
   }
   ```

2. **YAML**
   ```yaml
   # .colyn/settings.yaml
   version: 2
   lang: zh-CN  # Comments supported
   systemCommands:
     npm: yarn
   ```

**Configuration File Locations**:

- **User-level**: `~/.config/colyn/settings.{json|yaml|yml}`
- **Project-level**: `{projectRoot}/.colyn/settings.{json|yaml|yml}`

**Loading Priority** (within same directory):
1. `settings.json` (priority)
2. `settings.yaml`
3. `settings.yml`

**Backward Compatibility**:
- ✅ Fully compatible with existing JSON config files
- ✅ JSON5 is a superset of JSON, all JSON files can be parsed by JSON5
- ✅ Users can choose to use JSON or YAML format

**Automatic Enhancements**:
- ✅ JSON files can include comments
- ✅ Friendlier error messages (provided by Zod)
   ```
   Configuration validation failed (.colyn/settings.json):
     - lang: Expected 'en' | 'zh-CN', received 'fr'
     - tmux.layout: Invalid layout type 'invalid-layout'
     - tmux.leftPane.size: Expected string, received number
   ```

---

## 4. Detailed Design

### 4.1 Schema Definition

Define configuration schema using Zod:

```typescript
// src/core/config-schema.ts
import { z } from 'zod';

// Pane config schema
const PaneConfigSchema = z.object({
  command: z.string().nullable().optional(),
  size: z.string().optional(),
});

// Tmux config schema
const TmuxConfigSchema = z.object({
  autoRun: z.boolean().optional(),
  layout: z.enum([
    'single-pane',
    'two-pane-horizontal',
    'two-pane-vertical',
    'three-pane',
    'four-pane',
  ]).optional(),
  leftPane: PaneConfigSchema.optional(),
  rightPane: PaneConfigSchema.optional(),
  topPane: PaneConfigSchema.optional(),
  bottomPane: PaneConfigSchema.optional(),
  topRightPane: PaneConfigSchema.optional(),
  bottomRightPane: PaneConfigSchema.optional(),
  topLeftPane: PaneConfigSchema.optional(),
  bottomLeftPane: PaneConfigSchema.optional(),
  horizontalSplit: z.string().optional(),
  verticalSplit: z.string().optional(),
});

// System commands schema
const SystemCommandsSchema = z.object({
  npm: z.string().optional(),
  claude: z.string().optional(),
});

// Settings schema (recursive definition)
const SettingsSchemaBase = z.object({
  version: z.number(),
  lang: z.enum(['en', 'zh-CN']).optional(),
  systemCommands: SystemCommandsSchema.optional(),
  tmux: TmuxConfigSchema.optional(),
});

// Support branchOverrides recursive schema
const SettingsSchema: z.ZodType<Settings> = SettingsSchemaBase.extend({
  branchOverrides: z.record(z.lazy(() => SettingsSchema.partial())).optional(),
});

// Auto-infer type (no need to manually write interface)
export type Settings = z.infer<typeof SettingsSchemaBase> & {
  branchOverrides?: Record<string, Partial<Settings>>;
};

// Export validation function
export function validateSettings(data: unknown): Settings {
  return SettingsSchema.parse(data);
}
```

**Advantages**:
- ✅ Type definition and validation in one
- ✅ Reduces 70% of type definition code
- ✅ Automatically updates types when modifying schema

### 4.2 Configuration Loading

Load configuration using json5 and js-yaml:

```typescript
// src/core/config-loader.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import JSON5 from 'json5';
import yaml from 'js-yaml';
import { validateSettings } from './config-schema.js';

/**
 * Config filenames (sorted by priority)
 */
const CONFIG_FILENAMES = ['settings.json', 'settings.yaml', 'settings.yml'];

/**
 * Load and parse config file
 */
async function loadConfigFile(filepath: string): Promise<Settings | null> {
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    const ext = path.extname(filepath);

    let rawConfig: unknown;
    if (ext === '.json') {
      // Parse with JSON5 (supports comments and trailing commas)
      rawConfig = JSON5.parse(content);
    } else if (ext === '.yaml' || ext === '.yml') {
      // Parse with js-yaml
      rawConfig = yaml.load(content);
    } else {
      throw new Error(`Unsupported config file format: ${ext}`);
    }

    // Validate and migrate with Zod
    return validateSettings(rawConfig);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null; // File not found
    }
    throw new Error(`Config file error (${filepath}): ${error.message}`);
  }
}

/**
 * Load config from directory (try multiple filenames)
 */
async function loadConfigFromDir(dir: string): Promise<Settings | null> {
  for (const filename of CONFIG_FILENAMES) {
    const filepath = path.join(dir, filename);
    try {
      const config = await loadConfigFile(filepath);
      if (config !== null) {
        return config;
      }
    } catch (error) {
      // Continue to next filename
      continue;
    }
  }
  return null;
}

/**
 * Load user-level config
 */
export async function loadUserConfig(): Promise<Settings | null> {
  const configDir = path.join(os.homedir(), '.config', 'colyn');
  return loadConfigFromDir(configDir);
}

/**
 * Load project-level config
 */
export async function loadProjectConfig(projectRoot: string): Promise<Settings | null> {
  const configDir = path.join(projectRoot, '.colyn');
  return loadConfigFromDir(configDir);
}
```

**Advantages**:
- ✅ Supports JSON5 (comments, trailing commas) and YAML
- ✅ Automatic schema validation and migration
- ✅ Unified error handling
- ✅ Concise and direct code, no need for extra search library

### 4.3 Configuration Merging

Merge configurations using deepmerge:

```typescript
// src/core/config-merger.ts
import deepmerge from 'deepmerge';

/**
 * Merge multi-layer configs
 */
export function mergeConfigs(...configs: Array<Settings | null>): Settings {
  const validConfigs = configs.filter((c): c is Settings => c !== null);

  if (validConfigs.length === 0) {
    return DEFAULT_SETTINGS;
  }

  return deepmerge.all(validConfigs, {
    // Array replacement instead of merge
    arrayMerge: (target, source) => source,
  });
}

/**
 * Merge user-level, project-level, branch override configs
 */
export async function loadEffectiveConfig(
  projectRoot: string,
  branchName: string
): Promise<Settings> {
  // Load all layers
  const [userConfig, projectConfig] = await Promise.all([
    loadUserConfig(),
    loadProjectConfig(projectRoot),
  ]);

  // Priority: project > user > default
  let config = mergeConfigs(DEFAULT_SETTINGS, userConfig, projectConfig);

  // Apply branch overrides
  config = applyBranchOverrides(config, branchName);

  return config;
}
```

**Advantages**:
- ✅ Eliminates manual merge logic
- ✅ Handles all edge cases
- ✅ More concise code

### 4.4 Migration Implementation

Implement migration using Zod's `transform`:

```typescript
// src/core/config-migration.ts
import { z } from 'zod';

/**
 * Version 1 Schema + Migration
 */
const V1SettingsSchema = z.object({
  version: z.literal(1),
  npm: z.string().optional(),
  claudeCommand: z.string().optional(),
  tmux: TmuxConfigSchema.optional(),
  branchOverrides: z.record(z.lazy(() => V1SettingsSchema.partial())).optional(),
}).transform((v1): Settings => {
  // Migration logic
  const v2: Settings = {
    version: 2,
    systemCommands: {
      npm: v1.npm,
      claude: v1.claudeCommand,
    },
    tmux: migrateTmuxCommands(v1.tmux),
    branchOverrides: migrateOverrides(v1.branchOverrides),
  };

  return v2;
});

/**
 * Version 0 (no version) Migration
 */
const V0SettingsSchema = z.object({
  version: z.undefined(),
  // ... v0 fields
}).transform((v0): Settings => ({
  version: 2,
  // ... migration logic
}));

/**
 * Unified config schema (supports all versions)
 */
export const ConfigSchema = z.union([
  V0SettingsSchema,
  V1SettingsSchema,
  SettingsSchema, // Current version
]);

/**
 * Load and auto-migrate config
 */
export function loadAndMigrateConfig(rawConfig: unknown): Settings {
  // Zod automatically selects matching schema and executes transform
  return ConfigSchema.parse(rawConfig);
}
```

**Advantages**:
- ✅ Clearer migration logic
- ✅ Automatically selects correct migration path
- ✅ Type-safe (compile-time checks)
- ✅ Reduces 60% of migration code

### 4.5 Error Message Improvement

Example error messages from Zod:

```typescript
// Current implementation (manual validation)
if (config.lang && !['en', 'zh-CN'].includes(config.lang)) {
  throw new Error('Invalid lang');
}
// Error: Invalid lang

// After using Zod
const SettingsSchema = z.object({
  lang: z.enum(['en', 'zh-CN']).optional(),
});

try {
  SettingsSchema.parse({ lang: 'fr' });
} catch (error) {
  console.error(error.message);
}

// Error message:
// Invalid enum value. Expected 'en' | 'zh-CN', received 'fr' at "lang"
```

**User-friendly error handling wrapper**:

```typescript
export function validateConfigWithFriendlyError(
  filepath: string,
  data: unknown
): Settings {
  try {
    return SettingsSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e =>
        `  - ${e.path.join('.')}: ${e.message}`
      ).join('\n');

      throw new Error(
        `Config validation failed (${filepath}):\n${messages}`
      );
    }
    throw error;
  }
}
```

---

## 5. Implementation Plan

### 5.1 Phase Breakdown

#### Phase 1: Preparation (1-2 hours)

- [ ] Install dependencies
  ```bash
  volta run yarn add json5 js-yaml deepmerge zod
  volta run yarn add -D @types/js-yaml @types/deepmerge
  ```

- [ ] Create new module files
  ```
  src/core/
    ├── config-schema.ts      # Zod schema definitions
    ├── config-loader.ts      # json5/yaml loading
    ├── config-merger.ts      # deepmerge merging
    └── config-migration.ts   # Zod transform migrations
  ```

#### Phase 2: Schema Definition (2-3 hours)

- [ ] Define all schemas using Zod
  - [ ] PaneConfig
  - [ ] TmuxConfig
  - [ ] SystemCommands
  - [ ] Settings (recursive)

- [ ] Verify automatic type inference
- [ ] Write unit tests

#### Phase 3: Configuration Loading Refactor (2-3 hours)

- [ ] Implement config file loading
  - [ ] json5 parser
  - [ ] js-yaml parser
  - [ ] File lookup logic (by priority)
- [ ] Integrate Zod validation
- [ ] Write unit tests
  - [ ] JSON format tests
  - [ ] JSON5 format tests (comments, trailing commas)
  - [ ] YAML format tests
- [ ] Test error messages

#### Phase 4: Configuration Merging Refactor (2-3 hours)

- [ ] Implement config merging with deepmerge
- [ ] Test all merge scenarios
  - [ ] User + Project
  - [ ] Branch overrides
  - [ ] Priority

#### Phase 5: Migration Refactor (3-4 hours)

- [ ] Implement migrations using Zod transform
  - [ ] V0 → V2
  - [ ] V1 → V2
- [ ] Test all migration scenarios
- [ ] Verify compatibility

#### Phase 6: Integration and Testing (2-3 hours)

- [ ] Replace old config loading logic
- [ ] Run full test suite
- [ ] Test real config files
- [ ] Update documentation

#### Phase 7: Code Cleanup (1-2 hours)

- [ ] Delete old config loading code
- [ ] Run lint
- [ ] Code review

**Estimated Total Time**: 13-20 hours

### 5.2 Rollback Strategy

Create Git commits after each phase for quick rollback if issues arise:

```bash
# Phase 1 complete
git commit -m "feat(config): add dependencies for config refactor"

# Phase 2 complete
git commit -m "feat(config): add Zod schemas"

# ... and so on
```

**Complete Rollback Plan**:
- Keep old code in `src/core/tmux-config.legacy.ts`
- Delete old code only after new code is stable

### 5.3 Testing Strategy

**Unit Tests**:
```typescript
describe('Config Schema', () => {
  it('should validate valid config', () => {
    const config = { version: 2, lang: 'zh-CN' };
    expect(() => SettingsSchema.parse(config)).not.toThrow();
  });

  it('should reject invalid lang', () => {
    const config = { version: 2, lang: 'fr' };
    expect(() => SettingsSchema.parse(config)).toThrow();
  });
});

describe('Config Migration', () => {
  it('should migrate v1 to v2', () => {
    const v1 = { version: 1, npm: 'yarn' };
    const v2 = ConfigSchema.parse(v1);
    expect(v2.version).toBe(2);
    expect(v2.systemCommands?.npm).toBe('yarn');
  });
});
```

**Integration Tests**:
```typescript
describe('Config Loading', () => {
  it('should load and merge user and project configs', async () => {
    // Create temp config files
    // Load config
    // Verify merge result
  });
});
```

---

## 6. Risk Assessment

### 6.1 Technical Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Zod package size affects performance | Medium | Low | CLI tools not sensitive to size, Zod gets bundled and optimized |
| YAML parsing errors | Medium | Low | Thorough testing, use mature js-yaml library |
| JSON5 compatibility issues | Low | Low | JSON5 is JSON superset, fully compatible with existing files |
| Migration logic errors | High | Medium | Detailed test cases, gradual migration |
| Breaking existing configs | High | Low | 100% backward compatible, test real config files |

### 6.2 Compatibility Risks

**✅ Low Risk** - All changes transparent to users

- Config file format unchanged
- Config file locations unchanged
- All existing configs auto-migrated
- Friendlier error messages

### 6.3 Maintenance Risks

**⚠️ Needs Attention**

- New dependencies (Zod, json5, js-yaml, deepmerge)
- Team needs to learn Zod API
- Depends on external library updates

**Mitigation**:
- All dependencies are mature stable libraries (50M+ weekly downloads)
- Document schema definition conventions
- Provide developer guide
- Pin dependency versions

---

## 7. Discussion Points

Before starting implementation, discuss the following:

### 7.1 Core Decisions

**Question 1: Accept introducing Zod?**

**Pros**:
- ✅ Reduces 70% type definition code
- ✅ Runtime validation + compile-time type safety
- ✅ Clearer migration logic
- ✅ Friendly error messages

**Cons**:
- ⚠️ Package size ~50KB
- ⚠️ Learning curve
- ⚠️ New dependency

**Alternatives**:
- Use only cosmiconfig + deepmerge
- Keep manual type definitions and validation

**Recommendation**: ✅ Accept Zod
- CLI tools not sensitive to size
- Long-term benefits outweigh learning cost
- Mainstream solution in 2026

---

**Question 2: Configuration File Format Support**

✅ **Confirmed**:
- JSON (parsed with JSON5, supports comments and trailing commas)
- YAML (optional format, more concise)

**Loading Priority** (within same directory):
1. `settings.json` (priority)
2. `settings.yaml`
3. `settings.yml`

**Advantages**:
- ✅ JSON5 is JSON superset, 100% backward compatible
- ✅ Users can add comments
- ✅ YAML users can also use it
- ✅ Doesn't break existing configs

---

**Question 3: Keep old code as backup?**

**Option A**: Delete old code immediately
- ✅ Cleaner codebase
- ⚠️ Difficult to rollback

**Option B**: Keep old code in `.legacy.ts`
- ✅ Can quickly rollback
- ⚠️ Increases maintenance burden

**Recommendation**: Option B
- Delete after 1-2 versions post-refactor
- Safety first

---

### 7.2 Implementation Details

**Question 4: Migration implementation approach?**

**Option A**: Use Zod transform (recommended)
```typescript
const V1Schema = z.object({...}).transform(v1 => v2);
```

**Option B**: Keep existing migration array
```typescript
const MIGRATIONS = [(s) => {...}, (s) => {...}];
```

**Recommendation**: Option A
- More type-safe
- More concise code
- Leverages Zod advantages

---

**Question 5: Error message language?**

Zod's default error messages are in English, need i18n?

**Option A**: Keep English
- ✅ No extra work
- ⚠️ Slightly worse UX for Chinese users

**Option B**: Custom error messages (i18n)
```typescript
const SettingsSchema = z.object({
  lang: z.enum(['en', 'zh-CN'], {
    errorMap: () => ({ message: t('config.errors.invalidLang') })
  }),
});
```

**Recommendation**: Option A (Phase 1)
- Config errors are rare
- Can optimize later

---

**Question 6: Auto-save config files?**

Current migrations auto-save config files, keep this?

**Option A**: Keep auto-save
- ✅ Transparent to users
- ⚠️ May accidentally modify user files

**Option B**: Migrate in-memory only
- ✅ Don't modify user files
- ⚠️ Need to re-migrate each time

**Recommendation**: Option A
- Current behavior already verified
- Users expect auto-update

---

### 7.3 Timeline

**Question 7: Implementation priority?**

**Option A**: Start immediately (this week)
- ✅ Benefit sooner
- ⚠️ May affect other tasks

**Option B**: Defer to next iteration
- ✅ Won't affect current work
- ⚠️ Tech debt accumulates

**Recommendation**: Depends on project status
- If no urgent tasks → Option A
- If important features pending → Option B

---

## 8. Future Enhancements

After refactor completion, consider:

### 8.1 Config File Generator

```bash
colyn config init --interactive
```

Interactively generate config file with template selection.

### 8.2 Config Validation Command

```bash
colyn config validate
```

Validate config file correctness without executing anything.

### 8.3 Config Documentation Generation

Auto-generate config docs from Zod schema:

```typescript
import { zodToJsonSchema } from 'zod-to-json-schema';

const jsonSchema = zodToJsonSchema(SettingsSchema);
// Generate JSON Schema documentation
```

---

## 9. References

**Format Parsing**:
- [json5 Official Docs](https://json5.org/)
- [json5 npm Page](https://www.npmjs.com/package/json5)
- [js-yaml Official Docs](https://github.com/nodeca/js-yaml)
- [js-yaml npm Page](https://www.npmjs.com/package/js-yaml)

**Configuration Merging**:
- [deepmerge npm Page](https://www.npmjs.com/package/deepmerge)

**Schema Validation**:
- [Zod Official Docs](https://github.com/colinhacks/zod)
- [Comparing Schema Validation Libraries](https://www.bitovi.com/blog/comparing-schema-validation-libraries-ajv-joi-yup-and-zod)
- [Joi vs Zod Comparison](https://betterstack.com/community/guides/scaling-nodejs/joi-vs-zod/)
- [2025 Validation Libraries Trends](https://devmystify.com/blog/top-6-validation-libraries-for-javascript-in-2025)

**Related Design Docs**:
- [Config Migration Design](./design-config-migration.md)
- [Tmux Integration Design](./design-tmux-integration.md)

---

## 10. Summary

### Recommended Solution

**Core Tech Stack**:
- ✅ json5 - JSON5 format parsing (with comments)
- ✅ js-yaml - YAML format parsing
- ✅ deepmerge - Config merging
- ✅ Zod - Schema validation and migration

**Expected Benefits**:
- Reduce 60-70% config-related code
- Improve type safety
- Improve user experience (friendly error messages)
- Simplify future maintenance

**Implementation Recommendations**:
- Phased implementation (7 phases)
- Keep old code as backup
- Thorough testing before replacement
- Estimated 13-20 hours to complete

**Next Steps**:
- Discuss and confirm above decision points
- Determine implementation timeline
- Start Phase 1: Install dependencies

---

**Document Status**: Pending Discussion and Confirmation

**Last Updated**: 2026-02-20
