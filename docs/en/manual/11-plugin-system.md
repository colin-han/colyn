# Toolchain Plugin System

Colyn has a built-in **toolchain plugin mechanism** that enables it to adapt to different technology stacks — Node.js, Java (Maven/Gradle), Python, and Apple platforms (Xcode) — and automatically handle toolchain-specific operations such as dependency installation, linting, building, and version bumping.

---

## Table of Contents

- [What Are Toolchain Plugins](#what-are-toolchain-plugins)
- [Built-in Plugin Overview](#built-in-plugin-overview)
- [Single Project Mode vs. Mono Repo Mode](#single-project-mode-vs-mono-repo-mode)
- [Plugin Behavior in Each Command](#plugin-behavior-in-each-command)
  - [colyn init](#colyn-init)
  - [colyn add](#colyn-add)
  - [colyn merge](#colyn-merge)
  - [colyn release](#colyn-release)
  - [colyn repair](#colyn-repair)
- [Viewing and Configuring Toolchains](#viewing-and-configuring-toolchains)
- [Upgrading from an Older Version (V3 to V4)](#upgrading-from-an-older-version-v3-to-v4)
- [Detailed Plugin Descriptions](#detailed-plugin-descriptions)
- [Frequently Asked Questions](#frequently-asked-questions)

---

## What Are Toolchain Plugins

Toolchain plugins are Colyn's extension mechanism. They separate toolchain-specific logic (such as "how to install dependencies" or "how to check code quality") from Colyn's core.

**Without plugins**: Colyn only handles core Git Worktree operations such as creation and merging, independent of any specific technology stack.

**With plugins**: Colyn automatically invokes the corresponding toolchain commands at key points (initialization, Worktree creation, pre-merge, release) to achieve a fully automated workflow.

### Core Design Principles

- **Organized by build tool**: Each plugin corresponds to one build tool (npm/maven/gradle/pip/xcode), not a programming language
- **Optional extension points**: Each operation (install/lint/build, etc.) is optional; a plugin only implements the features it supports
- **Silent skipping**: If a toolchain does not have a corresponding script or tool (e.g., no lint script), the plugin skips it silently without errors
- **Auto-detection (on-demand discovery)**: When a command encounters an unconfigured directory for the first time, it automatically identifies the toolchain in place, with no manual configuration needed
- **Mono Repo support**: When no toolchain is found at the root, automatically scans first-level subdirectories; each detected subdirectory is managed independently

---

## Built-in Plugin Overview

| Plugin Name | Applicable Projects | Detection Method | Default Port |
|-------------|--------------------|--------------------|--------------|
| `npm` | Node.js / React / Next.js / Vue, etc. | `package.json` exists | 3000 |
| `maven` | Java Spring Boot (Maven) | `pom.xml` exists | 8080 |
| `gradle` | Java / Kotlin / Android (Gradle) | `build.gradle` or `build.gradle.kts` exists | 8080 |
| `pip` | Python (pip / poetry) | `requirements.txt` or `pyproject.toml` exists | 8000 |
| `xcode` | iOS / macOS / tvOS / watchOS native apps | `*.xcworkspace` / `*.xcodeproj` / `Package.swift` exists (root or first-level subdirectory) | None |

> **Note**: Java projects using Maven and Gradle are treated as different plugins because the build commands are completely different. The Xcode plugin has no port configuration because native apps do not need a web port.

---

## Single Project Mode vs. Mono Repo Mode

Colyn supports two project structures, automatically recognized with no manual configuration required:

### Single Project Mode

When a toolchain can be identified at the root directory (e.g., `package.json` exists), Colyn performs all operations in the root directory.

Example configuration (`.colyn/settings.json`):

```json
{
  "version": 4,
  "toolchain": {
    "type": "npm",
    "settings": {}
  }
}
```

### Mono Repo Mode

When no toolchain can be identified at the root directory, Colyn automatically scans first-level subdirectories. Each identified subdirectory is treated as an independent sub-project, with lint/build/install operations executed independently.

Example configuration (`.colyn/settings.json`):

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

> `toolchain: null` indicates that the subdirectory explicitly uses no toolchain and will not repeatedly trigger detection prompts.

### On-Demand Discovery Strategy

When Colyn encounters an unconfigured directory (e.g., neither `toolchain` nor `projects` is defined, or a new subdirectory has been added to a Mono Repo), it **triggers auto-detection and user-selection in place**, then continues executing the current command:

```
ℹ Subdirectory mobile was not recognized by any toolchain
? Please select a toolchain for mobile:
  ○ Node.js (npm)
  ○ Apple (Xcode)
  ○ (No toolchain)
```

The selected result is immediately written to `.colyn/settings.json` and will not be asked again in subsequent commands.

---

## Plugin Behavior in Each Command

### colyn init

**During initialization**, Colyn automatically completes the following plugin-related steps:

#### 1. Auto-detect Toolchain

Scans the main branch directory to identify the toolchain used by the project:

**Single project** (toolchain found at root):
```
✔ Detected single project (npm)
```

**Mono Repo** (no toolchain at root; subdirectories are scanned):
```
✔ Detected Mono Repo structure with 2 sub-projects
```

**When a subdirectory is not recognized**, a selection prompt is displayed (one prompt per unrecognized subdirectory):

```
ℹ Subdirectory scripts was not recognized by any toolchain
? Please select a toolchain for scripts:
  ○ Node.js (npm)
  ○ Java (Maven)
  ○ Apple (Xcode)
  ○ (No toolchain)
```

The detection result (including subdirectories with "no toolchain") is written to `.colyn/settings.json` and will not be asked again in subsequent commands.

#### 2. Ensure Runtime Config Files Are Ignored by .gitignore

Colyn automatically checks and ensures that each plugin's runtime configuration files are added to `.gitignore`:

- **npm plugin**: Ensures `.env.local` is in `.gitignore`
- **maven/gradle plugin**: Ensures `application-local.properties` is in `.gitignore`
- **pip plugin**: Ensures `.env.local` is in `.gitignore`

This operation is idempotent — if the filename is already in `.gitignore`, it will not be added again.

#### 3. Check Plugin-Specific Configuration (Conditional)

Some plugins require configuration that cannot be automatically inferred (e.g., the Xcode plugin needs the scheme and build destination). Colyn will attempt to auto-detect this configuration, and if it cannot be determined, will ask the user to fill it in interactively.

The provided configuration is saved to the `toolchain.settings` field (single project) or `projects[i].toolchain.settings` field (Mono Repo) in `.colyn/settings.json` for subsequent commands (e.g., `build`) to read directly, without asking again.

> **For the current built-in plugins (npm/maven/gradle/pip), this step is skipped automatically** — they do not require additional plugin-specific configuration. This feature is primarily designed for toolchains like Xcode that require user decisions.

#### 4. Ask for Port Number (Conditional)

Colyn only asks for a port number when the plugin declares a port configuration. For projects that do not need a port (e.g., pure library projects), this step is skipped automatically.

#### 5. Write Runtime Configuration

Writes port information in each plugin's configuration format:

| Plugin | Config File | Format |
|--------|------------|--------|
| npm | `.env.local` | `PORT=3000` |
| maven | `src/main/resources/application-local.properties` | `server.port=8080` |
| gradle | `src/main/resources/application-local.properties` | `server.port=8080` |
| pip | `.env.local` | `PORT=8000` |

#### 6. Save Toolchain Configuration

Writes the detection result to `.colyn/settings.json` (single project example):

```json
{
  "version": 4,
  "toolchain": {
    "type": "npm",
    "settings": {}
  }
}
```

---

### colyn add

**When creating a new Worktree**, the plugin automatically:

#### 1. Copy Runtime Configuration

Reads configuration from the main branch, writes it to the configuration file for the new Worktree, and automatically updates the port number:

```
✔ Copying environment config → .env.local (PORT=3001)
```

Each plugin writes to its own format of configuration file (npm writes `.env.local`, maven/gradle writes `application-local.properties`).

#### 2. Install Dependencies

Automatically installs project dependencies in the new Worktree directory:

```
⠿ Installing dependencies...
✔ Dependencies installed
```

| Plugin | Command |
|--------|---------|
| npm | `npm install` (or yarn/pnpm, depending on configuration) |
| maven | `mvn install -DskipTests` |
| gradle | `./gradlew build -x test` |
| pip | `poetry install` or `pip install -r requirements.txt` |
| xcode | Has `Podfile` → `pod install`; has `Package.swift` → `swift package resolve`; otherwise silently skipped |

**If dependency installation fails**, an error message is displayed, but the Worktree has already been created and the user can install manually.

---

### colyn merge

**Before merging**, the plugin automatically runs code quality checks:

#### Lint Check

```
⠿ Running lint check...
✔ Lint check passed
```

| Plugin | Condition | Command |
|--------|-----------|---------|
| npm | `package.json` has `scripts.lint` | `npm run lint` (or yarn/pnpm) |
| maven | `pom.xml` has checkstyle plugin configured | `mvn checkstyle:check` |
| gradle | `build.gradle` has checkstyle configured | `./gradlew checkstyleMain` |
| pip | Has ruff configuration | `ruff check .`; otherwise tries `flake8` |
| xcode | Has `.swiftlint.yml` and swiftlint is installed | `swiftlint lint` |

#### Build Check (Only Executed in `colyn merge`)

```
⠿ Running build check...
✔ Build check passed
```

| Plugin | Condition | Command |
|--------|-----------|---------|
| npm | `package.json` has `scripts.build` | `npm run build` |
| maven | Always | `mvn package -DskipTests` |
| gradle | Always | `./gradlew build` |
| pip | Not executed (Python typically has no build step) | - |
| xcode | Scheme configured | `xcodebuild -workspace/-project {x} -scheme {s} -destination {d} build` |
| xcode | Pure SPM with no scheme | `swift build` |
| xcode | Has xcodeproj but no scheme configured | Silently skipped; prompts to run `colyn repair` |

#### Skip Checks: `--skip-build`

For urgent merges, you can skip lint and build checks:

```bash
colyn merge --skip-build
```

#### View Failure Details: `-v / --verbose`

When a check fails, only a brief message is shown by default. Add `-v` to see the full command output:

```bash
colyn merge -v
```

**Default (on failure)**:
```
✗ Lint check failed
  Use -v to see details: colyn merge -v
```

**With `-v`**:
```
✗ Lint check failed

  src/utils.ts:15:3 error  'x' is assigned but never used
  src/utils.ts:23:1 error  Missing semicolon
  ...

  Please fix and retry: colyn merge
```

---

### colyn release

**During release**, the plugin executes the following steps sequentially in the main branch directory:

#### Execution Order

```
Step 0a: Install dependencies (ensure dependencies are up to date)
Step 0b: Lint check
Step 0c: Build check
Step 3:  Bump version number
```

#### 1. Install Dependencies

Ensures the main branch dependencies are up to date, preventing subsequent steps from failing due to missing dependencies.

#### 2. Lint Check

Same lint check rules as `colyn merge`.

#### 3. Build Check

Same build check rules as `colyn merge`.

#### 4. Bump Version Number

Each plugin updates its own version file:

| Plugin | Version File | Command |
|--------|-------------|---------|
| npm | `version` field in `package.json` | Direct file modification |
| maven | `<version>` tag in `pom.xml` | `mvn versions:set -DnewVersion=X.Y.Z` |
| gradle | `version` in `build.gradle` / `build.gradle.kts` | Regex replacement |
| pip | version in `pyproject.toml` or `setup.py` | Regex replacement |
| xcode | `MARKETING_VERSION` in `project.pbxproj` | `agvtool new-marketing-version X.Y.Z`; on failure, directly modifies `project.pbxproj` |

> **Note**: If the active plugin does not implement version bumping, `colyn release` will report an error and stop, because updating the version number is a required step for a release.

#### View Failure Details: `-v / --verbose`

```bash
colyn release -v
```

Same as `colyn merge -v`; shows full output when lint/build fails.

---

### colyn repair

**During repair**, Colyn re-executes the following plugin-related operations:

#### 1. Ensure Runtime Config Files Are Ignored by .gitignore

```
⠿ Checking .gitignore rules for runtime config files...
✔ .gitignore check complete
```

Same as step 2 of `colyn init` — idempotently ensures that each plugin's runtime configuration filenames are in `.gitignore`.

#### 2. Re-check Plugin-Specific Configuration (Conditional)

If the active plugin implements `repairSettings` (e.g., the Xcode plugin), `colyn repair` will re-run the configuration check. This means:

- Already-saved configuration is reused directly if the project structure has not changed, without asking again
- If the project structure has changed (e.g., a new scheme was added), re-detection and update will occur

**Use case**: When you have made major changes to the project (e.g., switched the Xcode scheme), you can run `colyn repair` to update the saved configuration.

If any of the above operations fail, `colyn repair` only displays a warning and does not interrupt the repair process (non-fatal).

---

## Viewing and Configuring Toolchains

### View Current Toolchain Configuration

The toolchain configuration is saved in the project's `.colyn/settings.json`. Simply view that file to understand the current configuration.

**Single project mode**:

```json
{
  "version": 4,
  "toolchain": {
    "type": "npm",
    "settings": {}
  }
}
```

**Xcode project** (with plugin-specific configuration):

```json
{
  "version": 4,
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

**Mono Repo mode**:

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
    }
  ]
}
```

### Modify Plugin-Specific Configuration

To modify plugin-specific configuration (e.g., the Xcode scheme), there are two approaches:

1. **Edit directly**: Modify the `toolchain.settings` or `projects[i].toolchain.settings` field in `.colyn/settings.json`
2. **Re-detect**: Run `colyn repair` to trigger the interactive configuration process again

### Change Toolchain Type

Edit the `toolchain.type` (single project) or `projects[i].toolchain.type` (Mono Repo) field in `.colyn/settings.json` directly:

```json
{
  "version": 4,
  "toolchain": {
    "type": "maven",
    "settings": {}
  }
}
```

**Valid values**: `"npm"`, `"maven"`, `"gradle"`, `"pip"`, `"xcode"`

**Explicitly use no toolchain**:

```json
{
  "version": 4,
  "toolchain": null
}
```

After setting to `null`, Colyn will no longer ask for a toolchain selection. To reconfigure, run `colyn init`.

---

## Upgrading from an Older Version (V3 to V4)

If your project uses a Colyn configuration from before v3.x (`.colyn/settings.json` contains `"version": 3` and `"plugins": [...]` fields), running any `colyn` command will **automatically migrate to V4 format**:

**Upgrade process**:
1. Colyn automatically recognizes the V3 format when reading the configuration
2. Upgrades the configuration to V4 via Zod transform (discarding `plugins`/`pluginSettings` fields)
3. The next time a toolchain-related command is run, the project toolchain is automatically re-detected
4. The detection result is written to `settings.json` in V4 format

**V3 configuration** (old format):
```json
{
  "version": 3,
  "plugins": ["npm"],
  "pluginSettings": {}
}
```

**V4 configuration** (new format, after migration and re-detection):
```json
{
  "version": 4,
  "toolchain": {
    "type": "npm",
    "settings": {}
  }
}
```

> The migration process requires no user action and is fully automatic. If the toolchain detection is incorrect after migration, you can manually edit `.colyn/settings.json` or run `colyn init` to reconfigure.

---

## Detailed Plugin Descriptions

### npm Plugin

**Applicable to**: All Node.js projects containing `package.json` (React, Next.js, Vue, Express, etc.)

**Port configuration**: `{ key: 'PORT', defaultPort: 3000 }`

**Config file**: `.env.local` (dotenv format)

**Package manager**: npm/yarn/pnpm set via `colyn config` (see [Configuration System](10-configuration.md))

**Detailed behavior**:

| Operation | Condition | Command |
|-----------|-----------|---------|
| getRuntimeConfigFileName | Always | Returns `'.env.local'` (added to `.gitignore` by colyn) |
| install | Always | `<npm/yarn/pnpm> install` |
| lint | `scripts.lint` exists | `<npm/yarn/pnpm> run lint` |
| build | `scripts.build` exists | `<npm/yarn/pnpm> run build` |
| bumpVersion | Always | Updates `version` in `package.json` |
| devServerCommand | `scripts.dev` exists | `<npm/yarn/pnpm> run dev` |

---

### maven Plugin

**Applicable to**: Java projects containing `pom.xml` (Spring Boot, etc.)

**Port configuration**: `{ key: 'server.port', defaultPort: 8080 }`

**Config file**: `src/main/resources/application-local.properties`

> **Spring Boot local config note**: `application-local.properties` is activated via `spring.profiles.active=local`. It contains configuration for local development only and is not committed to git.

**Detailed behavior**:

| Operation | Condition | Command |
|-----------|-----------|---------|
| getRuntimeConfigFileName | Always | Returns `'application-local.properties'` (added to `.gitignore` by colyn) |
| readRuntimeConfig | Always | Reads in priority order: local.properties → local.yaml → application.properties → application.yaml |
| writeRuntimeConfig | Always | Writes to `application-local.properties` |
| install | Always | `mvn install -DskipTests` |
| lint | `pom.xml` has checkstyle configured | `mvn checkstyle:check` |
| build | Always | `mvn package -DskipTests` |
| bumpVersion | Always | `mvn versions:set -DnewVersion=X.Y.Z -DgenerateBackupPoms=false` |
| devServerCommand | Always | `['mvn', 'spring-boot:run']` |

---

### gradle Plugin

**Applicable to**: Java/Kotlin/Android projects containing `build.gradle` or `build.gradle.kts`

**Port configuration**: `{ key: 'server.port', defaultPort: 8080 }`

**Config file**: `src/main/resources/application-local.properties` (same as maven plugin)

**Detailed behavior**:

| Operation | Condition | Command |
|-----------|-----------|---------|
| getRuntimeConfigFileName | Always | Returns `'application-local.properties'` (added to `.gitignore` by colyn) |
| readRuntimeConfig | Always | Same as maven plugin |
| writeRuntimeConfig | Always | Writes to `application-local.properties` |
| install | Always | `./gradlew build -x test` |
| lint | Build file has checkstyle configured | `./gradlew checkstyleMain` |
| build | Always | `./gradlew build` |
| bumpVersion | Always | Regex replacement of `version` line in `build.gradle` / `build.gradle.kts` |
| devServerCommand | Always | `['./gradlew', 'bootRun']` |

---

### pip Plugin

**Applicable to**: Python projects containing `requirements.txt` or `pyproject.toml`

**Port configuration**: `{ key: 'PORT', defaultPort: 8000 }`

**Config file**: `.env.local` (dotenv format)

**Detailed behavior**:

| Operation | Condition | Command |
|-----------|-----------|---------|
| getRuntimeConfigFileName | Always | Returns `'.env.local'` (added to `.gitignore` by colyn) |
| readRuntimeConfig | Always | Reads `.env.local` |
| writeRuntimeConfig | Always | Writes to `.env.local` |
| install | Has `pyproject.toml` | `poetry install` |
| install | No `pyproject.toml` | `pip install -r requirements.txt` |
| lint | Has ruff configuration | `ruff check .` |
| lint | No ruff, has flake8 | `flake8` |
| lint | Neither | Silently skipped |
| build | - | Not implemented (Python typically has no build step) |
| bumpVersion | Has `pyproject.toml` | Regex replacement of `version = "..."` |
| bumpVersion | Has `setup.py` | Regex replacement of `version=...` |
| devServerCommand | Has `manage.py` (Django) | `['python', 'manage.py', 'runserver']` |
| devServerCommand | Other | null (does not auto-start) |

---

### xcode Plugin

**Applicable to**: Apple platform projects containing `*.xcworkspace` (excluding internal `project.xcworkspace`), `*.xcodeproj`, or `Package.swift`. These files may be located in the Worktree root directory or in a first-level subdirectory (e.g., `ios/`, `macos/`).

**Port configuration**: None (native apps do not need a web port)

**Config file**: None (Xcode has no standard runtime configuration file)

**Plugin-specific configuration (toolchain.settings)**:

The Xcode plugin collects the following information interactively during `colyn init` / `colyn repair` and saves it to the `toolchain.settings` field (single project) or `projects[i].toolchain.settings` field (Mono Repo) in `.colyn/settings.json` for use by the `build` command:

| Field | Description | Source |
|-------|-------------|--------|
| `subdir` | Subdirectory containing the Xcode project (e.g., `"ios"`, `"macos"`); absent if at root | Filesystem scan |
| `workspace` | `.xcworkspace` filename (e.g., `MyApp.xcworkspace`) | Filesystem scan |
| `project` | `.xcodeproj` filename (e.g., `MyApp.xcodeproj`) | Filesystem scan |
| `scheme` | Xcode scheme name | Auto-detected (shared scheme) or user input |
| `destination` | Build destination platform string | Inferred from `SDKROOT` or user selection |

**Scheme detection rules**:

- Searches `{project}.xcodeproj/xcshareddata/xcschemes/*.xcscheme` (shared schemes committed to git)
- Only one shared scheme → auto-selected
- Multiple shared schemes → user selects (single choice)
- No shared scheme → prompts user to enter manually (local scheme paths vary per developer)

**Destination inference rules**:

| SDKROOT Value | Inferred As |
|---------------|-------------|
| `iphoneos` | `generic/platform=iOS Simulator` |
| `macosx` | `platform=macOS` |
| `appletvos` | `generic/platform=tvOS Simulator` |
| `watchos` | `generic/platform=watchOS Simulator` |

When inference is not possible, common options are provided for the user to choose from.

**Detailed behavior**:

| Operation | Condition | Command |
|-----------|-----------|---------|
| detect | Always | Detects `.xcworkspace` / `.xcodeproj` / `Package.swift` |
| portConfig | Always | Returns null (no port) |
| getRuntimeConfigFileName | Always | Returns null (no runtime config file) |
| repairSettings | Always | Interactively collects scheme / destination and saves to toolchain.settings |
| install | Has `Podfile` | `pod install` |
| install | Has `Package.swift` (no Podfile) | `swift package resolve` |
| install | Neither | Silently skipped |
| lint | Has `.swiftlint.yml` and swiftlint is installed | `swiftlint lint` |
| lint | swiftlint not installed | Silently skipped (not an error) |
| build | Scheme + workspace configured | `xcodebuild -workspace {w} -scheme {s} -destination {d} build` |
| build | Scheme + project configured | `xcodebuild -project {p} -scheme {s} -destination {d} build` |
| build | No scheme configured, pure SPM | `swift build` |
| build | No scheme configured, has xcodeproj | Silently skipped; prompts to run `colyn repair` |
| bumpVersion | Always preferred | `agvtool new-marketing-version X.Y.Z` |
| bumpVersion | When agvtool fails | Regex replacement of `MARKETING_VERSION` in `project.pbxproj` |

**Example configuration (`settings.json`)**:

Root-level project (xcodeproj at Worktree root):

```json
{
  "version": 4,
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

Subdirectory project (xcodeproj in a subdirectory, e.g., `macos/ColynPuppy.xcodeproj`):

```json
{
  "version": 4,
  "toolchain": {
    "type": "xcode",
    "settings": {
      "subdir": "macos",
      "project": "ColynPuppy.xcodeproj",
      "scheme": "ColynPuppy",
      "destination": "platform=macOS"
    }
  }
}
```

**Pure SPM project** (no scheme configuration needed):

```json
{
  "version": 4,
  "toolchain": {
    "type": "xcode",
    "settings": {}
  }
}
```

**Notes**:
- `agvtool` requires `VERSIONING_SYSTEM = apple-generic` to be set in the project's Build Settings
- Projects managed by CocoaPods typically have `.xcworkspace`; prefer using workspace over project
- In CI environments (`nonInteractive=true`), if the scheme cannot be inferred automatically, the `build` step is silently skipped

---

## Frequently Asked Questions

### Q1: No toolchain detection step during initialization?

**Possible causes**:
- No toolchain marker files (`package.json`, `pom.xml`, etc.) found in the directory
- Empty directory scenario; toolchain detection occurs after the directory structure is created

**Behavior**: If no toolchain is automatically detected and there are subdirectories under the root, Colyn will attempt to scan first-level subdirectories (Mono Repo mode). For unrecognized subdirectories, a single-choice prompt will appear to let you select a toolchain for each one (you can choose "No toolchain" to skip).

**Solution**: Select the corresponding toolchain in the prompt, or initialize the project in the main branch directory first and then re-run `colyn init`.

---

### Q2: What if dependency installation fails during `colyn add`?

The Worktree has already been created; a dependency installation failure does not affect the Worktree's usability. Simply go to the directory and install manually:

```bash
cd worktrees/task-1
npm install  # or yarn / pnpm / mvn install / pip install
```

---

### Q3: `colyn merge` reports lint failure, but running lint locally passes?

Colyn runs lint using the command configured by the plugin, executed in the Worktree directory. Please confirm:

1. Manually run lint in the Worktree directory to verify whether it actually passes
2. If it passes, try adding `-v` to see detailed output: `colyn merge -v`
3. Temporary workaround: `colyn merge --skip-build` (only for emergencies)

---

### Q4: `colyn release` says "plugin did not implement bumpVersion"?

If the active plugin does not support version bumping, release will report an error and stop. Please check:

1. Whether `toolchain.type` (or `projects[i].toolchain.type`) in `.colyn/settings.json` is correct
2. Whether the project has the corresponding version file (`package.json` / `pom.xml` / `build.gradle` / `pyproject.toml`)

---

### Q5: How do I disable a specific toolchain feature?

There are currently no fine-grained toggles. Options include:
- **Skip lint/build**: `colyn merge --skip-build`
- **Completely disable toolchain**: Set `toolchain` to `null` in `.colyn/settings.json`
- **Switch toolchain**: Modify the `toolchain.type` field

---

### Q6: Can a single project use multiple toolchains?

Yes, via **Mono Repo mode**. Each subdirectory has an independent toolchain configured:

```json
{
  "version": 4,
  "projects": [
    { "path": "frontend", "toolchain": { "type": "npm", "settings": {} } },
    { "path": "backend", "toolchain": { "type": "maven", "settings": {} } }
  ]
}
```

Colyn will execute lint/build/install and other operations independently for each sub-project.

If the root directory is directly identified by a toolchain (single project mode), activating multiple toolchains simultaneously is not supported. This covers the majority of project scenarios.

---

## Next Steps

- [Configuration System](10-configuration.md) - Learn how to configure package manager commands
- [Command Reference](04-command-reference.md) - View complete options for each command
- [Troubleshooting](08-troubleshooting.md) - Refer to this when you encounter issues
