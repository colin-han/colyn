# Xcode Plugin Design Document

**Status**: Implemented
**Created**: 2026-02-22
**Last Updated**: 2026-02-22 (Adapted for Mono Repo support, removed subdirectory detection)
**Implementation File**: `src/plugins/builtin/xcode.ts`
**Related Document**: `docs/en/develop/design/design-plugin-toolchain.md`

---

## 1. Background

Xcode is the primary development tool for Apple platform native applications (iOS / macOS / tvOS / watchOS). Integrating Xcode projects into colyn management faces a core challenge: the `xcodebuild` command requires `-scheme` and `-destination` parameters that cannot be automatically and uniquely determined from project files (a project may have multiple schemes, and platform types offer multiple options).

This document records the Xcode plugin design analysis, including:
- Project type detection strategy
- Implementation approach for each extension point
- Using the `repairSettings` mechanism to solve the build parameters problem
- Final decisions for each design question

---

## 2. Project Type Detection

### 2.1 Detection Target Files

| Priority | File / Directory | Corresponding Scenario |
|----------|-----------------|----------------------|
| 1 (Highest) | `*.xcworkspace/` (excluding internal `project.xcworkspace`) | CocoaPods-managed projects; multi-target workspaces |
| 2 | `*.xcodeproj/` | Standard single-project Xcode workspace |
| 3 | `Package.swift` | Pure Swift Package Manager projects (no .xcodeproj) |

### 2.2 Key Filtering Rules

**Must exclude `project.xcworkspace`**: Every `.xcodeproj` automatically generates an internal `project.xcworkspace` subdirectory (path: `*.xcodeproj/project.xcworkspace/`). This is an Xcode-managed internal file, not a user-created standalone workspace. Misdetecting it as a valid workspace would cause incorrect `-workspace` parameter paths.

### 2.3 Detection Scope

The plugin only inspects the `worktreePath` directory itself; it does not scan subdirectories.

For projects that place the Xcode workspace in a subdirectory (e.g., React Native's `ios/`), subdirectory scanning is handled by the upper-level `toolchain-resolver.ts`: in Mono Repo mode, it iterates over first-level subdirectories and calls the plugin's `detect()` on each one. The plugin itself therefore does not need to handle this level.

---

## 3. Extension Point Analysis

### 3.1 Extension Points Overview

| Extension Point | Implementation | Notes |
|----------------|---------------|-------|
| `detect` | Detect `.xcworkspace` (not project.xcworkspace) / `.xcodeproj` / `Package.swift` | See §2 |
| `portConfig` | Return `null` | Native apps have no web port requirements |
| `getRuntimeConfigFileName` | Return `null` | Xcode has no standard runtime config file |
| `readRuntimeConfig` | Not implemented | Not applicable |
| `writeRuntimeConfig` | Not implemented | Not applicable |
| `devServerCommand` | Return `null` | Native apps don't need a dev server |
| `repairSettings` | Detect scheme/destination, interactively prompt, save to `pluginSettings.xcode` | See §4 |
| `install` | Detect Podfile/Package.swift, execute appropriate install command | See §5.1 |
| `lint` | Detect `.swiftlint.yml`, execute SwiftLint | See §5.2 |
| `build` | Read parameters from `pluginSettings.xcode`, execute `xcodebuild` | See §5.3 |
| `bumpVersion` | `agvtool new-marketing-version {version}` | See §5.4 |

---

## 4. repairSettings Design

### 4.1 Problem Background

The `xcodebuild` command requires the following parameters to execute correctly:

```bash
xcodebuild -workspace MyApp.xcworkspace \
           -scheme MyApp \
           -destination "generic/platform=iOS Simulator" \
           build
```

- **`-workspace` / `-project`**: Can be obtained by scanning the filesystem, but the project root may contain multiple `.xcodeproj` files
- **`-scheme`**: A project may have multiple schemes (main App, Extensions, Tests, etc.); cannot be automatically selected
- **`-destination`**: Platform type (iOS / macOS / tvOS, etc.) can be inferred from `SDKROOT` in `project.pbxproj`, but is not always unique

The responsibility of `repairSettings`: automatically discover deterministic information during `colyn init` / `colyn repair`, interactively prompt for undetermined information, and save results to `pluginSettings.xcode` for use by the `build` command.

### 4.2 Execution Flow

```
Step 1: Scan project files
  Call scanXcodeDir(worktreePath):
  - Find .xcworkspace (filter project.xcworkspace) or .xcodeproj or Package.swift
  Record workspaceFile / projectFile

Step 2: Discover shared schemes
  Path: {worktreePath}/{project}.xcodeproj/xcshareddata/xcschemes/*.xcscheme
  Shared schemes are committed to git and are the most reliable build targets
  Non-shared schemes are stored in user private directories and not committed

Step 3: Infer target platform
  Read {worktreePath}/{project}.xcodeproj/project.pbxproj
  Find SDKROOT value:
    iphoneos     → iOS
    macosx       → macOS
    appletvos    → tvOS
    watchos      → watchOS

Step 4: Decision and interaction
  - Only one shared scheme → use automatically, inform user
  - Multiple shared schemes → let user choose (single select)
  - No shared schemes → prompt user to manually enter scheme name
  - destination can be clearly inferred → use automatically
  - destination unclear → ask user (provide common options)

Step 5: Return result
  {
    workspace: "MyApp.xcworkspace",  // or project: "MyApp.xcodeproj"
    scheme: "MyApp",
    destination: "generic/platform=iOS Simulator"
  }
```

### 4.3 Idempotency

When the `repair` command runs again, `context.currentSettings` contains values saved from the previous run:
- Existing values and project structure unchanged → reuse directly, no re-prompting
- Existing values but corresponding scheme no longer exists → prompt and re-ask
- User can update configuration by running `colyn repair` (forces re-detection and re-prompting)

`repairSettings` also automatically removes the `subdir` field that may be left over in older configuration files (`delete result.subdir`), ensuring backward compatibility.

### 4.4 Non-Interactive Mode (nonInteractive = true)

In CI environments, interactive prompts are not possible:
- Only use values that can be automatically inferred (unique shared scheme, deterministic destination)
- If necessary information is missing, return an empty object and skip configuration
- Do not output errors (`build` command handles missing configuration on its own)

### 4.5 Destination Reference Values

| Target Platform | destination string |
|-----------------|-------------------|
| iOS Simulator | `generic/platform=iOS Simulator` |
| iOS Device | `generic/platform=iOS` |
| macOS | `platform=macOS` |
| tvOS Simulator | `generic/platform=tvOS Simulator` |
| watchOS Simulator | `generic/platform=watchOS Simulator` |

---

## 5. Other Extension Points

### 5.1 install

```
Detection Logic (by priority):
1. If Podfile exists in worktreePath
   → Execute: pod install (cwd: worktreePath)

2. If Package.swift exists in worktreePath (and no Podfile)
   → Execute: swift package resolve (cwd: worktreePath)

3. Neither exists → silently skip
```

### 5.2 lint

```
Detection Logic:
1. If .swiftlint.yml or .swiftlint.yaml exists in worktreePath
   → Execute: swiftlint lint (cwd: worktreePath)
   → If swiftlint command not found, silently skip (not an error; tool not installed)
   → On failure, throw PluginCommandError

2. Otherwise → silently skip
```

### 5.3 build

**Option A (Pure SPM)**: Execute `swift build` directly, no parameters required. Suitable for pure SPM projects without `.xcodeproj`.

**Option B (xcodebuild)**: Read parameters saved in `pluginSettings.xcode` and execute `xcodebuild`. This is the correct approach for iOS/macOS native app projects.

**Recommended build logic**:

```
1. Try to read scheme from pluginSettings.xcode:
   - If scheme exists:
     Build xcodebuild command, choose -workspace or -project based on saved config
     Execute: xcodebuild -workspace {w} -scheme {s} -destination {d} build (cwd: worktreePath)
     or:      xcodebuild -project   {p} -scheme {s} -destination {d} build (cwd: worktreePath)

   - If scheme doesn't exist (repairSettings not run or user skipped):
     Check if Package.swift exists
       Yes → SPM fallback: swift build (cwd: worktreePath)
       No  → silently skip, output hint: "Run colyn repair to configure Xcode build parameters"
```

**Core Challenge with Option B**: Many Xcode projects lack shared schemes, only having local schemes. This leads to:
1. `repairSettings` cannot auto-discover the scheme → user must manually enter it
2. If user doesn't fill in, `build` cannot execute → falls back to Option A or silently skips

### 5.4 bumpVersion

Using Apple's official `agvtool` tool:

```bash
agvtool new-marketing-version {version}
```

Prerequisites:
- Project Build Settings must have `VERSIONING_SYSTEM = apple-generic` (required by agvtool)
- Project needs `CFBundleShortVersionString` (usually present automatically)

If `agvtool` is unavailable or project lacks `VERSIONING_SYSTEM`:
- Fallback: directly modify `MARKETING_VERSION` field in `{project}.xcodeproj/project.pbxproj`
- This approach is fragile as it depends on text format

---

## 6. settings.json Example

After successful configuration save, `.colyn/settings.json` example:

**Standard Xcode project**:

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

**Pure SPM project** (no scheme configuration):

```json
{
  "version": 4,
  "toolchain": {
    "type": "xcode",
    "settings": {}
  }
}
```

**Mono Repo scenario** (Xcode project as one of the sub-projects):

```json
{
  "version": 4,
  "projects": [
    {
      "path": "macos",
      "toolchain": {
        "type": "xcode",
        "settings": {
          "project": "ColynPuppy.xcodeproj",
          "scheme": "ColynPuppy",
          "destination": "platform=macOS"
        }
      }
    }
  ]
}
```

---

## 7. Design Decisions

The following questions were resolved during implementation using the recommended approaches:

| ID | Question | Decision |
|----|----------|----------|
| Q1 | When there are no shared schemes, should we prompt for manual input or list local schemes? | **Prompt for manual input** (local scheme paths vary by user, unreliable) |
| Q2 | For multi-target projects (App + Extension + Tests), which scheme to build? | **Let user choose** (cannot automatically determine which is the "main" scheme) |
| Q3 | Fallback when `agvtool` is unavailable? | **Directly modify `MARKETING_VERSION` in `project.pbxproj`** |
| Q4 | When `colyn repair` re-runs, force re-asking all parameters? | **No** — only ask for missing or changed parameters (idempotent) |
| Q5 | In CI (nonInteractive=true) with no scheme available, should `build` error or skip? | **Silently skip** to avoid blocking CI pipeline |
| Q6 | Should the plugin scan first-level subdirectories to support React Native and similar projects? | **No** — subdirectory scanning is handled by `toolchain-resolver.ts`; the plugin only inspects the directory it receives |

---

## 8. Directory Structure

```
src/plugins/builtin/
└── xcode.ts    # Implemented
```

---

## 9. Implementation Record

✅ Initial implementation:

1. Implemented `src/plugins/builtin/xcode.ts` (all extension points)
2. Registered in `src/plugins/index.ts`
3. Added i18n translations (`zh-CN.ts` / `en.ts` under `plugins.xcode` namespace)
4. Updated toolchain plugin design document with xcode plugin entry
5. Updated user manual plugin system chapter

✅ 2026-02-22 Adapted for Mono Repo support:

6. Removed subdirectory scanning logic from the plugin (`findXcodeProject` function and `SKIP_DIRS` constant)
7. Removed `XcodeProject.subdir` field
8. All extension points now use `worktreePath` directly, no longer deriving `xcodeDir`
9. `repairSettings` automatically removes legacy `subdir` field from old configurations (backward compatibility)
