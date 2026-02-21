# Toolchain Plugin Design Document

**Status**: Design Phase
**Created**: 2026-02-21
**Related Requirement**: `docs/requirements/requirement-plugin-system.md`

---

## 1. Background & Goals

### 1.1 Current Problem

colyn's environment configuration logic (port allocation, `.env.local` read/write, dev server command detection, etc.) is **hardcoded for the npm toolchain**, making it incompatible with Java (Maven/Gradle), Python (pip/poetry), and other development environments.

### 1.2 Design Goals

Introduce a **Toolchain Plugin** mechanism to decouple toolchain-specific logic from core code:

- colyn core only manages the worktree lifecycle
- Toolchain differences (config file formats, dependency installation, lint/build commands, etc.) are handled by plugins
- Built-in plugins for common toolchains, with future extensibility via npm packages

### 1.3 Plugin Granularity

**Organized by toolchain**, not by programming language:

| Plugin Name | Target Projects | Detection Method |
|-------------|----------------|------------------|
| `npm` | Node.js / Next.js / React Native, etc. | `package.json` exists |
| `maven` | Java Spring Boot / Android, etc. (Maven) | `pom.xml` exists |
| `gradle` | Java / Kotlin / Android, etc. (Gradle) | `build.gradle` or `build.gradle.kts` exists |
| `pip` | Python (pip / poetry) | `requirements.txt` or `pyproject.toml` exists |

> **Note**: Same language with different build tools (e.g., Maven vs Gradle) are treated as different plugins, since their commands differ entirely.

---

## 2. Plugin Interface Definition

### 2.1 Type Definitions

```typescript
// src/types/plugin.ts

/**
 * Port allocation configuration
 * null means the toolchain doesn't need a port (e.g., library projects, CLI tools)
 */
export interface PortConfig {
  /** Key name in config file, e.g., "PORT", "server.port" */
  key: string;
  /** Default port number */
  defaultPort: number;
}

/**
 * Error thrown when a plugin command (lint / build) fails
 *
 * Plugins must throw this type on lint/build failure so that
 * PluginManager can display the command output in verbose mode.
 */
export class PluginCommandError extends Error {
  /** Full output of the failed command (stdout + stderr) */
  readonly output: string;

  constructor(message: string, output: string) {
    super(message);
    this.name = 'PluginCommandError';
    this.output = output;
  }
}

/**
 * Context object passed to repairSettings
 *
 * Passed to each plugin's repairSettings method during colyn init / colyn repair.
 */
export interface RepairSettingsContext {
  /** Project root directory (parent of .colyn) */
  projectRoot: string;
  /** Main branch directory path (contains project source files) */
  worktreePath: string;
  /** Currently saved plugin-specific settings (from settings.json pluginSettings[name]) */
  currentSettings: Record<string, unknown>;
  /** Whether running in non-interactive mode (e.g., CI environment, cannot show interactive prompts) */
  nonInteractive: boolean;
}

/**
 * Toolchain Plugin Interface
 *
 * All methods are optional; plugins only need to implement the extension points they care about.
 * Unimplemented extension points are skipped or use default behavior by colyn core.
 */
export interface ToolchainPlugin {
  // ════════════════════════════════════════════
  // Metadata
  // ════════════════════════════════════════════

  /** Unique plugin identifier, e.g., 'npm' | 'maven' | 'gradle' | 'pip' */
  name: string;

  /** Display name for UI, e.g., 'Node.js (npm)' */
  displayName: string;

  // ════════════════════════════════════════════
  // Detection Extension Point
  // ════════════════════════════════════════════

  /**
   * Detect if the project uses this toolchain
   *
   * Typically by scanning for toolchain-specific files (package.json / pom.xml, etc.).
   *
   * @param worktreePath Directory path to scan for toolchain markers
   * @returns true if matched, false otherwise
   */
  detect(worktreePath: string): boolean | Promise<boolean>;

  // ════════════════════════════════════════════
  // Environment Configuration Extension Points
  // ════════════════════════════════════════════

  /**
   * Return port allocation configuration
   *
   * Returns null if the toolchain doesn't need a port (e.g., library projects).
   */
  portConfig?(): PortConfig | null;

  /**
   * Read config file and return unified key-value pairs
   *
   * Execution strategy: try plugins in registration order, use first non-null result.
   * Plugin decides which file to read under worktreePath (e.g., .env.local / application.properties).
   *
   * @param worktreePath Worktree directory path
   * @returns Key-value pairs, or null if read failed
   */
  readRuntimeConfig?(worktreePath: string): Promise<Record<string, string> | null>;

  /**
   * Write key-value pairs to config file (supports native format)
   *
   * Plugin decides which file to write under worktreePath:
   * - npm plugin writes to .env.local
   * - maven plugin writes to application.properties
   *
   * @param worktreePath Worktree directory path
   * @param config Key-value pairs to write
   */
  writeRuntimeConfig?(worktreePath: string, config: Record<string, string>): Promise<void>;

  // ════════════════════════════════════════════
  // Project Initialization
  // ════════════════════════════════════════════

  /**
   * Return the runtime config filename that should be git-ignored
   *
   * colyn will ensure this filename is added to .gitignore.
   * Return null if the toolchain has no runtime config file to ignore.
   *
   * @returns Filename (e.g., '.env.local', 'application-local.properties'), or null
   */
  getRuntimeConfigFileName?(): string | null;

  /**
   * Check and repair plugin-specific project settings
   *
   * Called during `colyn init` and `colyn repair`.
   * The plugin should scan the project structure and identify required configuration
   * (e.g., Xcode scheme / destination). If it cannot be auto-detected, the plugin
   * may interactively prompt the user to fill in the values.
   * Results are saved by colyn to `.colyn/settings.json` under `pluginSettings[name]`.
   *
   * **Typical use case**: The Xcode plugin uses this method to ask the user for
   * scheme and destination, which are then used by subsequent `build` commands.
   *
   * @param context Contains projectRoot, worktreePath, current saved settings, and non-interactive flag
   * @returns Plugin-specific config key-value pairs (will completely overwrite pluginSettings[name])
   */
  repairSettings?(context: RepairSettingsContext): Promise<Record<string, unknown>>;

  // ════════════════════════════════════════════
  // Toolchain Info (for other plugins to query, e.g., terminal session plugin)
  // ════════════════════════════════════════════

  /**
   * Return dev server startup command
   *
   * Called by terminal session plugin to auto-start dev server in terminal.
   * Toolchain plugin only returns the command, does NOT execute it.
   *
   * @param worktreePath Directory path to detect dev server command from
   * @returns Command array (e.g., ['npm', 'run', 'dev']), or null if no dev server
   */
  devServerCommand?(worktreePath: string): string[] | null | Promise<string[] | null>;

  // ════════════════════════════════════════════
  // Lifecycle Operations (plugin executes directly, throws on failure)
  // ════════════════════════════════════════════

  /**
   * Install project dependencies
   *
   * Triggered in two scenarios:
   * - After `colyn add` creates a worktree (worktreePath = new worktree dir)
   * - Before `colyn release` (worktreePath = mainDir), to ensure deps are up-to-date
   *
   * If not implemented, installation step is skipped.
   *
   * **Failure handling**: On installation failure, the plugin must throw `PluginCommandError`
   * with the full command output (stdout + stderr) in the `output` field.
   *
   * @param worktreePath Directory path to run installation in (worktree or main branch dir)
   * @throws {PluginCommandError} on installation failure, with output containing command output
   */
  install?(worktreePath: string): Promise<void>;

  /**
   * Run code quality checks
   *
   * Trigger points:
   * - Before `colyn merge` (pre-check, failure blocks merge)
   * - Before `colyn release` (failure blocks release)
   *
   * **Missing handling**: If the toolchain has no lint script/tool,
   * the plugin should **silently skip** (no exception thrown), treated as passing.
   *
   * **Failure handling**: On lint command failure, the plugin must throw `PluginCommandError`
   * with the full command output (stdout + stderr) in the `output` field.
   *
   * @param worktreePath Directory path to run checks in
   * @throws {PluginCommandError} on lint failure, with output containing command output
   */
  lint?(worktreePath: string): Promise<void>;

  /**
   * Build the project
   *
   * Called during `colyn release`. Not implemented = step skipped.
   *
   * **Missing handling**: If no build script exists, plugin should **silently skip**.
   *
   * **Failure handling**: On build command failure, the plugin must throw `PluginCommandError`
   * with the full command output (stdout + stderr) in the `output` field.
   *
   * @param worktreePath Directory path to run build in
   * @throws {PluginCommandError} on build failure, with output containing command output
   */
  build?(worktreePath: string): Promise<void>;

  /**
   * Update project version number
   *
   * Called during `colyn release`:
   * - npm plugin: updates `version` in package.json
   * - maven plugin: updates `<version>` in pom.xml
   *
   * **Missing handling**: Unlike lint/build, if the active plugin does **not implement**
   * this method, PluginManager throws an error and aborts release.
   * Version bumping is a required step of release — silent skip is not allowed.
   *
   * @param worktreePath Directory path to run version bump in
   * @param version New version string (e.g., "1.2.0")
   */
  bumpVersion?(worktreePath: string, version: string): Promise<void>;
}
```

### 2.2 Design Principles

1. **Direct execution**: Operation methods (`install`, `lint`, `build`, `bumpVersion`) are executed directly by the plugin, throwing exceptions on failure
2. **Optional extension points**: All methods are optional; plugins only implement what they need
3. **Plugin owns path resolution**: Both `readRuntimeConfig` and `writeRuntimeConfig` receive `worktreePath`; the plugin decides which config file to read/write (e.g., npm uses `.env.local`, maven uses `application-local.properties`)
4. **Phase failure semantics**: lint failure, build failure all block subsequent steps
5. **Silent skip for missing lint/build**: If no corresponding script exists, plugin skips internally without throwing
6. **Error on missing bumpVersion**: If the active plugin doesn't implement `bumpVersion`, PluginManager throws — version bump is mandatory for release
7. **Plugin reads own config**: Methods needing npm/yarn/pnpm read `.colyn/settings.json` directly — no need to pass it as parameter
8. **Toolchain info separation**: `devServerCommand` only returns the command array — execution is terminal session plugin's responsibility
9. **Structured failure info**: lint / build failures throw `PluginCommandError` carrying the full command output in `output`; all colyn commands support `-v` / `--verbose` to display failure details
10. **gitignore managed by caller**: Plugins declare their runtime config filename via `getRuntimeConfigFileName()`; `PluginManager.ensureRuntimeConfigIgnored()` handles adding it to `.gitignore` — plugins do not touch the filesystem for this
11. **Plugin-specific config persistence**: Some plugins (e.g., Xcode) require build parameters that cannot be auto-inferred. Plugins use `repairSettings(context)` to identify and interactively collect these settings; `PluginManager.runRepairSettings()` saves them to `settings.json` under `pluginSettings[name]`. Subsequent commands (e.g., `build`) read from `currentSettings` without prompting again

---

## 3. Built-in Plugin Implementations

### 3.1 npm Plugin

**File**: `src/plugins/builtin/npm.ts`

| Extension Point | Implementation |
|----------------|----------------|
| `detect` | Check if `package.json` exists |
| `portConfig` | `{ key: 'PORT', defaultPort: 3000 }` |
| `getRuntimeConfigFileName` | Returns `'.env.local'` (colyn ensures it is added to `.gitignore`) |
| `readRuntimeConfig` | Parse `{worktreePath}/.env.local` (dotenv format) |
| `writeRuntimeConfig` | Write to `{worktreePath}/.env.local`, preserving comments |
| `devServerCommand` | Read `package.json` `scripts.dev`, return `[npmCmd, 'run', 'dev']` or null |
| `install` | Read `systemCommands.npm` (default `npm`), run `<npm> install` |
| `lint` | Check `package.json` for `scripts.lint`; if present execute, else silently skip |
| `build` | Check `package.json` for `scripts.build`; if present execute, else silently skip |
| `bumpVersion` | Update `version` field in `package.json` |

> **Note**: `install` reads `.colyn/settings.json` (searching up from worktreePath) to get `systemCommands.npm`, determining whether to use npm / yarn / pnpm.

### 3.2 maven Plugin

**File**: `src/plugins/builtin/maven.ts`

| Extension Point | Implementation |
|----------------|----------------|
| `detect` | Check if `pom.xml` exists |
| `portConfig` | `{ key: 'server.port', defaultPort: 8080 }` |
| `getRuntimeConfigFileName` | Returns `'application-local.properties'` (colyn ensures it is added to `.gitignore`) |
| `readRuntimeConfig` | Try `{worktreePath}/src/main/resources/application-local.properties` then `application-local.yaml` (local profile); fall back to `application.properties` / `application.yaml` if neither exists |
| `writeRuntimeConfig` | Write to `{worktreePath}/src/main/resources/application-local.properties` (local profile, git-ignored) |
| `devServerCommand` | Return `['mvn', 'spring-boot:run']` |
| `install` | Run `mvn install -DskipTests` |
| `lint` | Check if checkstyle is configured in pom.xml; if yes run `mvn checkstyle:check`, else silently skip |
| `build` | Run `mvn package -DskipTests`; silently skip if target not applicable |
| `bumpVersion` | Run `mvn versions:set -DnewVersion={version} -DgenerateBackupPoms=false` |

> **Local profile**: Spring Boot overlays `application-local.properties` on top of the main `application.properties` when `spring.profiles.active=local` is set. This file holds dev-only config (ports, DB credentials, etc.) and must not be committed to the repository.

### 3.3 gradle Plugin

**File**: `src/plugins/builtin/gradle.ts`

| Extension Point | Implementation |
|----------------|----------------|
| `detect` | Check if `build.gradle` or `build.gradle.kts` exists |
| `portConfig` | `{ key: 'server.port', defaultPort: 8080 }` |
| `getRuntimeConfigFileName` | Returns `'application-local.properties'` (colyn ensures it is added to `.gitignore`) |
| `readRuntimeConfig` | Try `{worktreePath}/src/main/resources/application-local.properties` then `application-local.yaml` (local profile); fall back to `application.properties` / `application.yaml` if neither exists |
| `writeRuntimeConfig` | Write to `{worktreePath}/src/main/resources/application-local.properties` (local profile, git-ignored) |
| `devServerCommand` | Return `['./gradlew', 'bootRun']` |
| `install` | Run `./gradlew build -x test` |
| `lint` | Check if checkstyle plugin is configured; if yes run `./gradlew checkstyleMain`, else silently skip |
| `build` | Run `./gradlew build`; silently skip if target not present |
| `bumpVersion` | Modify `version` property in `build.gradle` / `build.gradle.kts` |

### 3.4 pip Plugin

**File**: `src/plugins/builtin/pip.ts`

| Extension Point | Implementation |
|----------------|----------------|
| `detect` | Check if `requirements.txt` or `pyproject.toml` exists |
| `portConfig` | `{ key: 'PORT', defaultPort: 8000 }` |
| `getRuntimeConfigFileName` | Returns `'.env.local'` (colyn ensures it is added to `.gitignore`) |
| `readRuntimeConfig` | Parse `{worktreePath}/.env.local` (dotenv format) |
| `writeRuntimeConfig` | Write to `{worktreePath}/.env.local` |
| `devServerCommand` | Django → `['python', 'manage.py', 'runserver']`; others → null |
| `install` | `pyproject.toml` present → `poetry install`; otherwise → `pip install -r requirements.txt` |
| `lint` | `ruff` configured → `ruff check .`; else try `flake8`; neither found → silently skip |
| `build` | Not implemented (Python typically doesn't need a build step) |
| `bumpVersion` | `pyproject.toml` present → update `version` field; else update `version=` in `setup.py` |

---

## 4. Plugin Manager

**File**: `src/plugins/manager.ts`

```typescript
class PluginManager {
  private readonly plugins: ToolchainPlugin[];

  constructor(plugins: ToolchainPlugin[]) {
    this.plugins = plugins;
  }

  /** Detect which toolchains match the project (for colyn init) */
  async detectAll(worktreePath: string): Promise<ToolchainPlugin[]>;

  /** Load active plugins by name from settings.json plugins field */
  getActive(enabledPluginNames: string[]): ToolchainPlugin[];

  /**
   * Ensure runtime config files of active plugins are git-ignored
   * Calls getRuntimeConfigFileName() on each plugin and idempotently adds the filename to .gitignore
   * Called during colyn init and colyn repair
   */
  async ensureRuntimeConfigIgnored(worktreePath: string, activePlugins: ToolchainPlugin[]): Promise<void>;

  /**
   * Run repairSettings on all active plugins and save results to settings.json
   * Each plugin may auto-detect or interactively prompt for required settings;
   * results are saved to pluginSettings[name]
   * Called during colyn init and colyn repair
   */
  async runRepairSettings(
    projectRoot: string,
    worktreePath: string,
    activePluginNames: string[],
    nonInteractive?: boolean
  ): Promise<void>;

  /**
   * Try readRuntimeConfig on active plugins sequentially, return first non-null result
   * Receives worktreePath — each plugin resolves its own config file path
   */
  async readRuntimeConfig(
    worktreePath: string,
    activePlugins: ToolchainPlugin[]
  ): Promise<Record<string, string> | null>;

  /** Call writeRuntimeConfig on all active plugins */
  async writeRuntimeConfig(
    worktreePath: string,
    config: Record<string, string>,
    activePlugins: ToolchainPlugin[]
  ): Promise<void>;

  /**
   * Try devServerCommand on active plugins in order, return first non-null result
   * For terminal session plugin to query the dev server startup command
   */
  async getDevServerCommand(
    worktreePath: string,
    activePlugins: ToolchainPlugin[]
  ): Promise<string[] | null>;  // e.g., ['npm', 'run', 'dev'], or null if no dev server

  /**
   * Call install on all active plugins (any failure = overall failure)
   *
   * @param verbose When true, display PluginCommandError.output on failure
   */
  async runInstall(worktreePath: string, activePlugins: ToolchainPlugin[], verbose?: boolean): Promise<void>;

  /**
   * Call lint on all active plugins
   * Plugin throws = failure; plugin silently skips (no throw) = treated as passing
   *
   * @param verbose When true, display PluginCommandError.output on failure
   */
  async runLint(worktreePath: string, activePlugins: ToolchainPlugin[], verbose?: boolean): Promise<void>;

  /**
   * Call build on all active plugins
   * Plugin throws = failure; plugin silently skips (no throw) = treated as passing
   *
   * @param verbose When true, display PluginCommandError.output on failure
   */
  async runBuild(worktreePath: string, activePlugins: ToolchainPlugin[], verbose?: boolean): Promise<void>;

  /**
   * Call bumpVersion on all active plugins
   *
   * Special rule: if ALL active plugins lack a bumpVersion implementation,
   * PluginManager throws an error to abort release.
   * Version bump is mandatory — silent skip is not allowed.
   */
  async runBumpVersion(
    worktreePath: string,
    version: string,
    activePlugins: ToolchainPlugin[]
  ): Promise<void>;

  /** Return port config from the first active plugin that provides one, or null */
  getPortConfig(activePlugins: ToolchainPlugin[]): PortConfig | null;
}
```

**Global singleton**:

```typescript
// src/plugins/index.ts
export const pluginManager = new PluginManager([
  NpmPlugin,
  MavenPlugin,
  GradlePlugin,
  PipPlugin,
]);
```

---

## 5. Config Schema Changes

Add optional `plugins` and `pluginSettings` fields to the existing `Settings` schema:

```typescript
// src/core/config-schema.ts addition

const SettingsSchemaBase = z.object({
  version: z.number(),
  lang: z.enum(['en', 'zh-CN']).optional(),
  systemCommands: SystemCommandsSchema.optional(),
  tmux: TmuxConfigSchema.optional(),

  // New: toolchain plugin list
  plugins: z.array(z.string()).optional(),
  //        ↑ Plugin name list, e.g., ['npm'], ['maven', 'pip']

  // New: plugin-specific settings (written by repairSettings)
  pluginSettings: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  //               ↑ { pluginName: { key: value, ... } }
});
```

**Storage example** (`.colyn/settings.json`):

```json
{
  "version": 3,
  "lang": "zh-CN",
  "plugins": ["xcode"],
  "pluginSettings": {
    "xcode": {
      "workspace": "MyApp.xcworkspace",
      "scheme": "MyApp",
      "destination": "generic/platform=iOS Simulator"
    }
  }
}
```

**Migration note**: `plugins` and `pluginSettings` are both **optional fields** — old configs without them are treated as `undefined`. No Migration needed. Legacy migration is handled via runtime detection (see Section 7).

---

## 6. Integration with Existing Commands

### 6.1 `colyn init` Command

**New steps** (inserted into existing init flow):

```
Step N: Toolchain Detection & Selection
  1. Call pluginManager.detectAll(worktreePath)
  2. If matches found → show interactively, let user confirm
  3. If no matches → show all available plugins, let user manually select
  4. Write selection to plugins field in .colyn/settings.json

Step N+1: Port Configuration (conditional)
  Call pluginManager.getPortConfig(activePlugins)
  If non-null → interactively prompt user for main branch port (default = portConfig.defaultPort)
  If null    → skip (toolchain does not require a port)

Step N+2: Ensure runtime config files are git-ignored
  Call pluginManager.ensureRuntimeConfigIgnored(worktreePath, activePlugins)
  Each plugin declares its filename via getRuntimeConfigFileName(); colyn handles adding it to .gitignore

Step N+3: Repair plugin-specific project settings
  Call pluginManager.runRepairSettings(projectRoot, worktreePath, activePlugins)
  Each plugin uses repairSettings() to auto-detect or interactively prompt for required settings
  (e.g., Xcode scheme/destination); results are saved to settings.json under pluginSettings[pluginName]

Step N+4: Write Config Files
  Call pluginManager.writeRuntimeConfig() for each plugin to write their native config format
```

**Interaction (matches found, port required)**:
```
✔ Detected toolchain:

? Confirm toolchain plugins to enable: (space to select, enter to confirm)
  ◉ Node.js (npm)  [package.json detected]

✔ Enabled plugin: npm

? Enter main branch port number: (3000)
```

**Interaction (no match)**:
```
⚠ Unable to auto-detect toolchain

? Select your project toolchain:
  ○ Node.js (npm)
  ○ Java (Maven)
  ○ Java (Gradle)
  ○ Python (pip/poetry)
  ○ No toolchain
```

### 6.2 `colyn add` Command

**New steps** (inserted after worktree creation):

```
Step N: Copy Environment Config
  Original logic (copy .env.local) → replaced by pluginManager.writeRuntimeConfig()
  Each plugin writes its own config format with PORT and WORKTREE values

Step N+1: Install Dependencies
  Call pluginManager.runInstall(worktreePath, activePlugins)
  worktreePath = newly created worktree directory
```

**Output example**:
```
✔ Created worktree: task-1
✔ Environment config → .env.local (PORT=10001)
✔ Installing dependencies
  → npm install ... done
```

### 6.3 `colyn merge` Command

**New option**: `-v` / `--verbose`: display full command output on failure

**New step** (inserted before merge):

```
Step 0 (Pre-check): Code Quality Check
  Call pluginManager.runLint(worktreePath, activePlugins, verbose)
  Any plugin throws → display error, abort merge
```

**Failure (default)**:
```
✖ Code quality check failed (npm lint)
  Use -v to see details: colyn merge -v
```

**Failure (-v)**:
```
✖ Code quality check failed (npm lint)

  src/foo.ts:10:5 error  'x' is not defined
  ...（full lint output）

  Fix the issues and retry: colyn merge
```

### 6.4 `colyn release` Command

**New option**: `-v` / `--verbose`: display full command output when lint / build fails

**Insert install → lint → build → bumpVersion into existing flow**:

```
Original steps:
  1. Check dependencies (checkDependenciesInstalled)
  2. Execute update (executeUpdate)
  3. Execute release (executeRelease)

New steps before step 1 (executed in mainDir):
  0a. Install dependencies (pluginManager.runInstall, worktreePath = mainDir)
      Ensures main branch deps are up-to-date before lint/build
  0b. Code quality check (pluginManager.runLint, worktreePath = mainDir, verbose)
  0c. Build project (pluginManager.runBuild, worktreePath = mainDir, verbose)

New step within step 3:
  3a. Bump version (pluginManager.runBumpVersion, worktreePath = mainDir)
```

> **Two install scenarios**:
> - `colyn add` (worktree dir): install deps for new worktree, ready for development
> - `colyn release` (main branch dir): ensure main branch deps are current before lint/build

---

## 7. Legacy Project Migration

### 7.1 Trigger

**Auto-detected on first run of any colyn command**:

```typescript
async function ensurePluginsConfigured(configDir: string, worktreePath: string) {
  const settings = await loadProjectConfig(worktreePath);
  if (settings?.plugins !== undefined) return;
  await autoMigratePlugins(configDir, worktreePath);
}
```

### 7.2 Migration Logic

```
1. Run pluginManager.detectAll(worktreePath)
2. Write detection results to plugins field in .colyn/settings.json
3. Show non-blocking notice:
   "ℹ Auto-configured toolchain plugin: npm
    To change, edit .colyn/settings.json"
```

### 7.3 Detection Failure

If no toolchain matches, write empty array and degrade gracefully:

```json
{ "plugins": [] }
```

All toolchain-related steps (install, lint, bumpVersion) are skipped.

---

## 8. Directory Structure

```
src/
├── types/
│   ├── index.ts           # Existing types
│   └── plugin.ts          # NEW: ToolchainPlugin interface + PortConfig
│
├── plugins/
│   ├── index.ts           # Export pluginManager singleton
│   ├── manager.ts         # PluginManager class
│   └── builtin/
│       ├── npm.ts         # npm plugin (migrates existing env.ts / dev-server.ts logic)
│       ├── maven.ts       # Maven plugin
│       ├── gradle.ts      # Gradle plugin
│       └── pip.ts         # pip plugin
│
├── core/
│   ├── config-schema.ts   # Add plugins field to Settings Schema
│   └── ...                # Other files unchanged
│
└── commands/
    ├── init.ts            # Integrate toolchain detection
    ├── add.ts             # Integrate install + writeRuntimeConfig
    ├── merge.ts           # Integrate lint pre-check
    └── release.ts         # Integrate install + lint + build + bumpVersion
```

---

## 9. Implementation Plan

### Phase 1: Core Framework

1. Define `ToolchainPlugin` interface (`src/types/plugin.ts`)
2. Implement `PluginManager` (`src/plugins/manager.ts`)
3. Update `config-schema.ts` to add `plugins` field
4. Implement npm plugin (`src/plugins/builtin/npm.ts`, migrating `env.ts` and `dev-server.ts` logic)

### Phase 2: Command Integration

5. Integrate into `colyn init` (detect + user selection + config write)
6. Integrate into `colyn add` (writeRuntimeConfig + install)
7. Integrate into `colyn merge` (lint pre-check)
8. Integrate into `colyn release` (install + lint + build + bumpVersion)
9. Implement legacy project auto-migration

### Phase 3: More Plugins

10. Implement maven plugin
11. Implement gradle plugin
12. Implement pip plugin

---

## 10. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Plugin granularity | By toolchain (npm/maven/gradle/pip) | Toolchain determines command differences, not language |
| Command execution | Plugin executes directly (`Promise<void>`) | High flexibility, supports complex multi-step operations |
| All plugin params | Unified `worktreePath` | Single consistent parameter; caller always passes the target directory |
| maven/gradle local config | `application-local.properties` (local profile) | Not committed to git; Spring Boot profile overlays main config |
| maven/gradle config format | Prefer `.properties`, also support `.yaml` | Properties simpler, yaml more powerful; both formats widely used |
| .gitignore handling | Plugin declares filename via `getRuntimeConfigFileName()`; `PluginManager.ensureRuntimeConfigIgnored()` handles the update | Separation of concerns — plugin declares intent, colyn handles the file operation; idempotent |
| Plugin-specific settings | `repairSettings(context)` + `pluginSettings` field mechanism; interactively collected and persisted during init/repair | Solves the problem of parameters requiring user decisions (e.g., xcodebuild); avoids re-prompting on every build |
| Missing lint/build scripts | Plugin silently skips internally | Not all projects configure lint/build; shouldn't be an error |
| Missing bumpVersion impl | PluginManager throws, aborts release | Version bump is mandatory for release — silent skip not allowed |
| install reads npm command | Plugin reads `.colyn/settings.json` directly | Avoids complicating the interface; plugin self-sufficient |
| devServerCommand | Returns `string[]`, does not execute | Execution is terminal session plugin's responsibility |
| install trigger points | `add` (worktree) + `release` (main branch) | See Section 6 for details |
| No toolchain detected | Show all options for user to select | More user-friendly than errors |
| plugins config storage | Optional `plugins` field in `settings.json` | No Migration needed, backward compatible |
| Legacy project migration | Auto-detect on first run of any command | Zero-friction upgrade experience |
| Multi-toolchain support | Not supported (out of scope) | Reduces complexity, focus on core scenarios |
