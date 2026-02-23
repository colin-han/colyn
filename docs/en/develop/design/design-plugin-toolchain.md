# Toolchain Plugin Design Document

**Status**: Implemented
**Created**: 2026-02-21
**Last Updated**: 2026-02-22 (V4 config format refactor + Mono Repo support)
**Related Requirement**: `docs/requirements/requirement-plugin-system.md`, `docs/requirement-mono-repo.md`

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
| `xcode` | iOS / macOS / tvOS / watchOS native apps | `*.xcworkspace` / `*.xcodeproj` / `Package.swift` exists |

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
  /** Project root directory (parent of .colyn) — reserved field, currently passed as empty string */
  projectRoot: string;
  /** Sub-project directory path (single-project = worktree root; Mono Repo = worktree/subPath) */
  worktreePath: string;
  /** Currently saved toolchain-specific settings (from settings.toolchain.settings or projects[i].toolchain.settings) */
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
   * Check and repair toolchain-specific project settings
   *
   * Called during `colyn init` and `colyn repair`.
   * The plugin should scan the project structure and identify required configuration
   * (e.g., Xcode scheme / destination). If it cannot be auto-detected, the plugin
   * may interactively prompt the user to fill in the values.
   * Results are saved by colyn to `.colyn/settings.json` under `toolchain.settings`
   * (single-project) or `projects[i].toolchain.settings` (Mono Repo).
   *
   * **Typical use case**: The Xcode plugin uses this method to ask the user for
   * scheme and destination, which are then used by subsequent `build` commands.
   *
   * @param context Contains worktreePath, current saved toolchain settings, and non-interactive flag
   * @returns Toolchain-specific config key-value pairs (will completely overwrite toolchain.settings)
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

  /**
   * Publish to package registry
   *
   * Called after git push in `colyn release`.
   * If not implemented, this step is silently skipped.
   *
   * @param worktreePath Directory path to run publish in
   * @throws {PluginCommandError} on publish failure, with output containing command output
   */
  publish?(worktreePath: string): Promise<void>;

  /**
   * Check whether the current project is publishable
   *
   * Called before the publish stage in `colyn release`.
   * If false, publish is skipped for this toolchain context.
   */
  checkPublishable?(worktreePath: string): Promise<boolean>;
}
```

### 2.2 Design Principles

1. **Direct execution**: Operation methods (`install`, `lint`, `build`, `bumpVersion`, `publish`) are executed directly by the plugin, throwing exceptions on failure
2. **Optional extension points**: All methods are optional; plugins only implement what they need
3. **Plugin owns path resolution**: Both `readRuntimeConfig` and `writeRuntimeConfig` receive `worktreePath`; the plugin decides which config file to read/write (e.g., npm uses `.env.local`, maven uses `application-local.properties`)
4. **Phase failure semantics**: lint failure, build failure, and publish failure all block subsequent steps
5. **Silent skip for missing lint/build**: If no corresponding script exists, plugin skips internally without throwing
6. **Error on missing bumpVersion**: If the active plugin doesn't implement `bumpVersion`, PluginManager throws — version bump is mandatory for release
7. **Plugin reads own config**: Methods needing npm/yarn/pnpm read `.colyn/settings.json` directly — no need to pass it as parameter
8. **Toolchain info separation**: `devServerCommand` only returns the command array — execution is terminal session plugin's responsibility
9. **Structured failure info**: lint / build / publish failures throw `PluginCommandError` carrying the full command output in `output`; all colyn commands support `-v` / `--verbose` to display failure details
10. **gitignore managed by caller**: Plugins declare their runtime config filename via `getRuntimeConfigFileName()`; `PluginManager.ensureRuntimeConfigIgnored()` handles adding it to `.gitignore` — plugins do not touch the filesystem for this
11. **Toolchain-specific config persistence**: Some plugins (e.g., Xcode) require build parameters that cannot be auto-inferred. Plugins use `repairSettings(context)` to identify and interactively collect these settings; the caller (`toolchain-resolver.saveRepairSettingsResult()`) saves them to `settings.json` under `toolchain.settings` (single-project) or `projects[i].toolchain.settings` (Mono Repo). Subsequent commands (e.g., `build`) read from `currentSettings` without prompting again

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
| `publish` | Run `npm publish` (or yarn/pnpm equivalent publish command) |
| `checkPublishable` | Check `private`, `name`, and `version`; skip publish if not satisfied |

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
| `publish` | Run `mvn deploy -DskipTests` |
| `checkPublishable` | Check whether `pom.xml` contains `<distributionManagement>` |

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
| `publish` | Run `./gradlew publish` |
| `checkPublishable` | Check for `maven-publish` or `publishing {}` configuration |

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
| `publish` | Poetry project: `poetry publish --build`; otherwise: `python -m build && twine upload dist/*` |
| `checkPublishable` | Check publish metadata (`[tool.poetry]` / `[project]` / `setup.py`) |

---

## 4. Plugin Manager

**File**: `src/plugins/manager.ts`

```typescript
class PluginManager {
  private readonly plugins: Map<string, ToolchainPlugin>;

  /** Register a plugin */
  register(plugin: ToolchainPlugin): void;

  /** Get all registered plugins (for displaying selection menus) */
  getAllPlugins(): ToolchainPlugin[];

  /**
   * Detect which toolchains match the directory
   * Used by toolchain-resolver.ts in the on-demand discovery flow
   */
  async detectPlugins(worktreePath: string): Promise<string[]>;

  /**
   * Ensure runtime config files of active plugins are git-ignored
   * Calls getRuntimeConfigFileName() and idempotently adds the filename to .gitignore
   * Called per ToolchainContext during colyn init and colyn repair
   */
  async ensureRuntimeConfigIgnored(worktreePath: string, activePluginNames: string[]): Promise<void>;

  /**
   * Run repairSettings for the specified toolchain plugin, return updated settings
   *
   * Unlike v3: the caller (toolchain-resolver.saveRepairSettingsResult) handles persistence.
   * Plugin may auto-detect or interactively prompt for required settings.
   *
   * @param worktreePath Sub-project directory path
   * @param toolchainName Toolchain name (plugin identifier)
   * @param currentSettings Currently saved toolchain-specific settings
   * @param nonInteractive Non-interactive mode (default false)
   * @returns Updated settings, or null if plugin does not implement repairSettings
   */
  async runRepairSettings(
    worktreePath: string,
    toolchainName: string,
    currentSettings: Record<string, unknown>,
    nonInteractive?: boolean
  ): Promise<Record<string, unknown> | null>;

  /**
   * Try readRuntimeConfig on active plugins sequentially, return first non-null result
   * Each plugin resolves its own config file path from worktreePath
   */
  async readRuntimeConfig(
    worktreePath: string,
    activePluginNames: string[]
  ): Promise<Record<string, string> | null>;

  /** Call writeRuntimeConfig on all active plugins */
  async writeRuntimeConfig(
    worktreePath: string,
    config: Record<string, string>,
    activePluginNames: string[]
  ): Promise<void>;

  /**
   * Try devServerCommand on active plugins in order, return first non-null result
   * For terminal session plugin to query the dev server startup command
   */
  async getDevServerCommand(
    worktreePath: string,
    activePluginNames: string[]
  ): Promise<string[] | null>;  // e.g., ['npm', 'run', 'dev'], or null if no dev server

  /**
   * Call install on all active plugins (any failure = overall failure)
   * @param verbose When true, display PluginCommandError.output on failure
   */
  async runInstall(worktreePath: string, activePluginNames: string[], verbose?: boolean): Promise<void>;

  /**
   * Call lint on all active plugins
   * Plugin throws = failure; plugin silently skips (no throw) = treated as passing
   * @param verbose When true, display PluginCommandError.output on failure
   */
  async runLint(worktreePath: string, activePluginNames: string[], verbose?: boolean): Promise<void>;

  /**
   * Call build on all active plugins
   * Plugin throws = failure; plugin silently skips (no throw) = treated as passing
   * @param verbose When true, display PluginCommandError.output on failure
   */
  async runBuild(worktreePath: string, activePluginNames: string[], verbose?: boolean): Promise<void>;

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
    activePluginNames: string[]
  ): Promise<void>;

  /**
   * Call publish on all active plugins
   * @param verbose When true, display PluginCommandError.output on failure
   */
  async runPublish(worktreePath: string, activePluginNames: string[], verbose?: boolean): Promise<void>;

  /**
   * Check whether active plugins are publishable
   * If any plugin returns false, that context is treated as non-publishable.
   */
  async runCheckPublishable(worktreePath: string, activePluginNames: string[]): Promise<boolean>;

  /** Return port config from the first active plugin that provides one, or null */
  getPortConfig(activePluginNames: string[]): PortConfig | null;
}
```

**Global singleton**:

```typescript
// src/plugins/index.ts
export const pluginManager = new PluginManager();
pluginManager.register(new NpmPlugin());
pluginManager.register(new MavenPlugin());
pluginManager.register(new GradlePlugin());
pluginManager.register(new PipPlugin());
pluginManager.register(new XcodePlugin());
```

---

## 5. Config Schema Changes (V4)

V4 replaces `plugins[]` + `pluginSettings{}` with structured `toolchain` and `projects` fields:

```typescript
// src/core/config-schema.ts

// Toolchain configuration (stores toolchain type + specific settings)
const ToolchainConfigSchema = z.object({
  type: z.string(),                                          // e.g., 'npm', 'xcode'
  settings: z.record(z.string(), z.unknown()).default({}),   // toolchain-specific settings (written by repairSettings)
});
export type ToolchainConfig = z.infer<typeof ToolchainConfigSchema>;

// Mono Repo sub-project
const SubProjectSchema = z.object({
  path: z.string(),                                          // relative to root dir, e.g., 'frontend'
  toolchain: z.union([ToolchainConfigSchema, z.null()]),     // null = explicitly no toolchain
});
export type SubProject = z.infer<typeof SubProjectSchema>;

// V4 Settings (toolchain-related fields)
const SettingsSchemaBase = z.object({
  version: z.number(),
  lang: z.enum(['en', 'zh-CN']).optional(),
  systemCommands: SystemCommandsSchema.optional(),
  tmux: TmuxConfigSchema.optional(),

  // Single-project mode (takes effect when toolchain !== undefined)
  // null = explicitly no toolchain (prevents repeated detection prompts)
  toolchain: z.union([ToolchainConfigSchema, z.null()]).optional(),

  // Mono Repo mode (takes effect when projects !== undefined)
  projects: z.array(SubProjectSchema).optional(),
});

export const CURRENT_CONFIG_VERSION = 4;
```

**Storage example — Single-project mode** (`.colyn/settings.json`):

```json
{
  "version": 4,
  "lang": "zh-CN",
  "toolchain": {
    "type": "xcode",
    "settings": {
      "workspace": "MyApp.xcworkspace",
      "scheme": "MyApp",
      "destination": "generic/platform=iOS Simulator"
    }
  }
}
```

**Storage example — Mono Repo mode** (`.colyn/settings.json`):

```json
{
  "version": 4,
  "projects": [
    {
      "path": "frontend",
      "toolchain": { "type": "npm", "settings": {} }
    },
    {
      "path": "backend",
      "toolchain": { "type": "maven", "settings": {} }
    },
    {
      "path": "scripts",
      "toolchain": null
    }
  ]
}
```

**Migration note**: V3 configs (with `plugins`/`pluginSettings`) are automatically migrated to V4 via Zod transform on first command run (see Section 7). V4's `toolchain`/`projects` are both **optional** — when both are undefined, the "on-demand discovery" strategy is triggered (see Section 6).

---

## 6. Integration with Existing Commands

All commands obtain the list of sub-projects to operate on (`ToolchainContext[]`) via `src/core/toolchain-resolver.ts`, enabling unified handling for single-project and Mono Repo modes.

### 6.0 Toolchain Resolver (toolchain-resolver.ts)

**Core type**:

```typescript
export type ToolchainContext = {
  absolutePath: string;                   // Absolute path of sub-project (for PluginManager)
  subPath: string;                        // Relative to worktree root ('.' = root)
  toolchainName: string;                  // Toolchain name, e.g., 'npm', 'xcode'
  toolchainSettings: Record<string, unknown>; // Current toolchain-specific settings
};
```

**Two core functions**:

```typescript
// For colyn init: force re-detection, write to settings.json, return contexts
export async function detectAndConfigureToolchains(
  projectRoot: string,
  mainDirPath: string,
  nonInteractive?: boolean
): Promise<ToolchainContext[]>

// For add/merge/release/repair: read config + handle newly discovered sub-dirs
export async function resolveToolchains(
  projectRoot: string,
  worktreePath: string,
  nonInteractive?: boolean
): Promise<ToolchainContext[]>
```

**resolveToolchains decision tree**:

```
1. settings.toolchain !== undefined → single-project mode, return single context
   (toolchain === null = explicitly no toolchain, return empty array)

2. settings.projects !== undefined → Mono Repo mode
   a. Iterate configured projects, build contexts
   b. Scan worktreePath for new sub-dirs not recorded in settings
   c. For new dirs: auto-detect first, then prompt if needed
   d. Write new discoveries to settings.projects and save

3. Both undefined → trigger on-demand discovery
   a. Detect root dir → found: single-project mode
   b. Not found: scan sub-dirs, auto-detect + optional prompt
   c. Sub-dirs found → Mono Repo mode; none found → save toolchain=null
```

### 6.1 `colyn init` Command

**Flow**: Call `detectAndConfigureToolchains(projectRoot, mainDirPath)`, then for each returned context:

```
1. detectAndConfigureToolchains:
   - Detect root dir toolchain (single-project)
   - If none, scan first-level sub-dirs (Mono Repo)
   - Prompt user for unrecognized sub-dirs
   - Write results to settings.json (toolchain or projects)

2. For each context:
   - pluginManager.ensureRuntimeConfigIgnored(ctx.absolutePath, [ctx.toolchainName])
   - pluginManager.runRepairSettings(ctx.absolutePath, ctx.toolchainName, ctx.toolchainSettings)
   - If result returned → saveRepairSettingsResult(projectRoot, ctx.subPath, newSettings)

3. For each context:
   - pluginManager.getPortConfig([ctx.toolchainName])
   - If port required → prompt, pluginManager.writeRuntimeConfig(ctx.absolutePath, config, [ctx.toolchainName])
```

**Interaction (single-project detected)**:
```
✔ Single project detected (npm)
? Enter main branch port number: (3000)
```

**Interaction (Mono Repo, some unrecognized)**:
```
✔ Mono Repo structure detected, found 2 sub-projects
ℹ Sub-directory scripts not recognized by any toolchain
? Select toolchain for scripts:
  ○ Node.js (npm)
  ○ Apple (Xcode)
  ○ (No toolchain)
```

### 6.2 `colyn add` Command

```typescript
const contexts = await resolveToolchains(projectRoot, paths.mainDir);

for (const ctx of contexts) {
  const worktreeSubPath = ctx.subPath === '.' ? worktreePath : path.join(worktreePath, ctx.subPath);
  // Read base port from mainDir's sub-dir
  const mainConfig = await pluginManager.readRuntimeConfig(ctx.absolutePath, [ctx.toolchainName]);
  // Each Mono Repo sub-project has independent port: basePort + worktreeId
  const newPort = basePort + id;
  await pluginManager.writeRuntimeConfig(worktreeSubPath, { ...mainConfig, [portKey]: newPort, WORKTREE: id }, [ctx.toolchainName]);
  await pluginManager.runInstall(worktreeSubPath, [ctx.toolchainName], verbose);
}
```

### 6.3 `colyn merge` Command

```typescript
const contexts = await resolveToolchains(projectRoot, worktree.path);

for (const ctx of contexts) {
  await pluginManager.runLint(ctx.absolutePath, [ctx.toolchainName], verbose);
  await pluginManager.runBuild(ctx.absolutePath, [ctx.toolchainName], verbose);
}
```

### 6.4 `colyn release` Command

```typescript
const contexts = await resolveToolchains(projectRoot, dir);

for (const ctx of contexts) {
  await pluginManager.runInstall(ctx.absolutePath, [ctx.toolchainName], verbose);
}
for (const ctx of contexts) {
  await pluginManager.runLint(ctx.absolutePath, [ctx.toolchainName], verbose);
}
for (const ctx of contexts) {
  await pluginManager.runBuild(ctx.absolutePath, [ctx.toolchainName], verbose);
}
for (const ctx of contexts) {
  await pluginManager.runBumpVersion(ctx.absolutePath, newVersion, [ctx.toolchainName]);
}
const publishableContexts: ToolchainContext[] = [];
for (const ctx of contexts) {
  const publishable = await pluginManager.runCheckPublishable(ctx.absolutePath, [ctx.toolchainName]);
  if (publishable) {
    publishableContexts.push(ctx);
  }
}
for (const ctx of publishableContexts) {
  await pluginManager.runPublish(ctx.absolutePath, [ctx.toolchainName], verbose);
}
```

### 6.5 `colyn repair` Command

```typescript
const contexts = await resolveToolchains(projectRoot, paths.mainDir);

for (const ctx of contexts) {
  await pluginManager.ensureRuntimeConfigIgnored(ctx.absolutePath, [ctx.toolchainName]);
  const newSettings = await pluginManager.runRepairSettings(ctx.absolutePath, ctx.toolchainName, ctx.toolchainSettings);
  if (newSettings !== null) {
    await saveRepairSettingsResult(projectRoot, ctx.subPath, newSettings);
  }
}
```

> **Two install scenarios**:
> - `colyn add` (worktree dir): install deps for new worktree, ready for development
> - `colyn release` (main branch dir): ensure main branch deps are current before lint/build, then run publish

---

## 7. Version Migration

### 7.1 V3 → V4 Migration (Automatic Zod Transform)

V3 configs (with `plugins`/`pluginSettings` fields) are **automatically upgraded to V4** on first command run via the Zod transform chain in `config-migration.ts`:

```typescript
// src/core/config-migration.ts

function migrateV3ToV4Recursive(settings: V3Settings): Settings {
  const result: Settings = {
    version: 4,
    lang: settings.lang,
    systemCommands: settings.systemCommands,
  };
  if (settings.tmux) result.tmux = settings.tmux;

  // Drop plugins/pluginSettings
  // toolchain/projects intentionally left undefined to trigger on-demand discovery
  if (settings.branchOverrides) {
    result.branchOverrides = Object.fromEntries(
      Object.entries(settings.branchOverrides).map(([k, v]) => [k, migrateV3ToV4Recursive(v as V3Settings)])
    );
  }
  return result;
}

export const ConfigSchema = z.union([
  V0ToV3Schema,   // V0 → V3
  V1ToV2Schema,   // V1 → V2
  V2ToV3Schema,   // V2 → V3
  V3ToV4Schema,   // V3 → V4 (new)
  SettingsSchema, // Current version V4
]);
```

### 7.2 Migration Strategy

- **Drop legacy fields**: `plugins` / `pluginSettings` are discarded on migration
- **On-demand re-discovery**: `toolchain`/`projects` are intentionally left as `undefined`, triggering on-demand detection on the next command run
- **Transparent to users**: After migration, the first toolchain-aware command (init/add/merge/release/repair) auto-detects and saves the config via `resolveToolchains`

### 7.3 Detection Failure

When `resolveToolchains` fails to detect any toolchain:
- Saves `toolchain: null` to settings.json
- Returns empty array (`[]`)
- Command continues, skipping all toolchain-related steps (no install, lint, bumpVersion, or publish)

---

## 8. Directory Structure

```
src/
├── types/
│   ├── index.ts                  # Existing types
│   └── plugin.ts                 # ToolchainPlugin interface + PortConfig + RepairSettingsContext
│
├── plugins/
│   ├── index.ts                  # Export pluginManager singleton (register all plugins)
│   ├── manager.ts                # PluginManager class
│   └── builtin/
│       ├── npm.ts                # npm plugin
│       ├── maven.ts              # Maven plugin
│       ├── gradle.ts             # Gradle plugin
│       ├── pip.ts                # pip plugin
│       └── xcode.ts             # Xcode plugin
│
├── core/
│   ├── config-schema.ts          # V4 Schema (ToolchainConfig + SubProject)
│   ├── config-migration.ts       # Zod migration chain (V0→V3, V1→V2, V2→V3, V3→V4)
│   ├── toolchain-resolver.ts     # NEW: on-demand discovery + resolveToolchains
│   └── ...                       # Other files unchanged
│
└── commands/
    ├── init.handlers.ts          # Calls detectAndConfigureToolchains
    ├── add.ts                    # Calls resolveToolchains, loops over contexts
    ├── merge.ts                  # Calls resolveToolchains, loops for lint/build
    ├── release.ts                # Passes projectRoot, calls executeRelease
    ├── release.helpers.ts        # Calls resolveToolchains, loops for install/lint/build/bump
    └── repair.helpers.ts         # Calls resolveToolchains, loops for gitignore/repairSettings
```

---

## 9. Implementation History

### Phase 1: Core Framework (Complete)

1. Define `ToolchainPlugin` interface (`src/types/plugin.ts`)
2. Implement `PluginManager` (`src/plugins/manager.ts`)
3. Update `config-schema.ts` (V3 → V4 types)
4. Implement npm plugin (`src/plugins/builtin/npm.ts`)

### Phase 2: Command Integration (Complete)

5. Integrate into `colyn init` (via toolchain-resolver detection + config write)
6. Integrate into `colyn add` (config copy + install, Mono Repo support)
7. Integrate into `colyn merge` (lint/build pre-check)
8. Integrate into `colyn release` (install + lint + build + bumpVersion + publish)
9. Implement V3→V4 Zod transform migration

### Phase 3: More Plugins (Complete)

10. Implement maven plugin
11. Implement gradle plugin
12. Implement pip plugin

### Phase 4: Mono Repo Support (Complete)

13. Create `toolchain-resolver.ts` (on-demand discovery strategy)
14. Implement Xcode plugin (sub-dir detection, scheme auto-detection)
15. All commands loop over `ToolchainContext[]`

---

## 10. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Plugin granularity | By toolchain (npm/maven/gradle/pip/xcode) | Toolchain determines command differences, not language |
| Command execution | Plugin executes directly (`Promise<void>`) | High flexibility, supports complex multi-step operations |
| All plugin params | Unified `worktreePath` | Single consistent parameter; caller always passes the target directory |
| maven/gradle local config | `application-local.properties` (local profile) | Not committed to git; Spring Boot profile overlays main config |
| maven/gradle config format | Prefer `.properties`, also support `.yaml` | Properties simpler, yaml more powerful; both formats widely used |
| .gitignore handling | Plugin declares filename via `getRuntimeConfigFileName()`; `PluginManager.ensureRuntimeConfigIgnored()` handles the update | Separation of concerns — plugin declares intent, colyn handles the file operation; idempotent |
| Toolchain-specific settings (V4) | `repairSettings(context)` + `saveRepairSettingsResult()` saves to `toolchain.settings` or `projects[i].toolchain.settings` | Co-located with toolchain config (vs. V3's global pluginSettings dict); Mono Repo sub-projects have independent settings |
| Missing lint/build scripts | Plugin silently skips internally | Not all projects configure lint/build; shouldn't be an error |
| Missing bumpVersion impl | PluginManager throws, aborts release | Version bump is mandatory for release — silent skip not allowed |
| install reads npm command | Plugin reads `.colyn/settings.json` directly | Avoids complicating the interface; plugin self-sufficient |
| devServerCommand | Returns `string[]`, does not execute | Execution is terminal session plugin's responsibility |
| install trigger points | `add` (worktree) + `release` (main branch) | See Section 6 for details |
| No toolchain detected | Prompt user to select (or skip in nonInteractive mode) | More user-friendly than errors |
| V4 config structure | `toolchain: {type, settings}` (single) / `projects: [{path, toolchain}]` (Mono Repo) | Collocates toolchain type and settings; sub-projects have independent config |
| V3→V4 migration strategy | Zod transform drops plugins/pluginSettings; toolchain/projects left undefined | undefined triggers on-demand discovery; user-transparent, auto re-detects |
| Mono Repo sub-project discovery | "On-demand discovery": new sub-dirs detected and saved on command run | No manual config maintenance; auto-updates when commands run |
| Mono Repo ports | Each sub-project independent: mainDir base port + worktree ID | No port conflicts; consistent with colyn's multi-worktree model |
| runRepairSettings return value (V4) | `Promise<Record<string,unknown> \| null>` (was `void`) | Caller (toolchain-resolver) handles persistence; decouples the concerns |
