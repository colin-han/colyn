# 工具链插件系统

Colyn 内置**工具链插件机制**，让它能够适配 Node.js、Java（Maven/Gradle）、Python、Apple 平台（Xcode）等不同技术栈的项目，自动处理各工具链的差异化操作（依赖安装、Lint 检查、构建、版本号更新等）。

---

## 目录

- [什么是工具链插件](#什么是工具链插件)
- [内置插件一览](#内置插件一览)
- [插件在各命令中的行为](#插件在各命令中的行为)
  - [colyn init](#colyn-init)
  - [colyn add](#colyn-add)
  - [colyn merge](#colyn-merge)
  - [colyn release](#colyn-release)
  - [colyn repair](#colyn-repair)
- [查看和配置激活的插件](#查看和配置激活的插件)
- [旧项目自动迁移](#旧项目自动迁移)
- [各插件详细说明](#各插件详细说明)
- [常见问题](#常见问题)

---

## 什么是工具链插件

工具链插件是 Colyn 的扩展机制，它将工具链相关的差异化逻辑（如"如何安装依赖"、"如何检查代码质量"）从 Colyn 核心中分离出来。

**没有插件时**：Colyn 只负责 Git Worktree 的创建、合并等核心操作，与具体技术栈无关。

**有了插件后**：Colyn 在关键节点（初始化、创建 Worktree、合并前、发布时）自动调用对应工具链的命令，实现完整的自动化流程。

### 核心设计原则

- **按工具链划分**：每个插件对应一种构建工具（npm/maven/gradle/pip/xcode），而非编程语言
- **可选扩展点**：每个操作（install/lint/build 等）都是可选的，插件只实现自己支持的功能
- **静默跳过**：如果工具链没有对应的脚本或工具（如无 lint 脚本），插件自动跳过，不报错
- **自动检测**：初始化时自动识别项目使用的工具链，无需手动配置

---

## 内置插件一览

| 插件名 | 适用项目 | 检测方式 | 默认端口 |
|--------|---------|---------|---------|
| `npm` | Node.js / React / Next.js / Vue 等 | `package.json` 存在 | 3000 |
| `maven` | Java Spring Boot（Maven） | `pom.xml` 存在 | 8080 |
| `gradle` | Java / Kotlin / Android（Gradle） | `build.gradle` 或 `build.gradle.kts` 存在 | 8080 |
| `pip` | Python（pip / poetry） | `requirements.txt` 或 `pyproject.toml` 存在 | 8000 |
| `xcode` | iOS / macOS / tvOS / watchOS 原生应用 | `*.xcworkspace` / `*.xcodeproj` / `Package.swift` 存在 | 无 |

> **说明**：使用 Maven 和 Gradle 的 Java 项目视为不同插件，因为构建命令完全不同。Xcode 插件无端口配置，因为原生 App 不需要 web 端口。

---

## 插件在各命令中的行为

### colyn init

**初始化时**，Colyn 自动完成以下与插件相关的步骤：

#### 1. 自动检测工具链

扫描主分支目录，识别项目使用的工具链：

```
✔ 检测到工具链：Node.js (npm)
```

如果未能自动识别，会询问用户手动选择。

#### 2. 确保运行时配置文件被 .gitignore 忽略

Colyn 自动检查并确保各插件的运行时配置文件被加入 `.gitignore`：

- **npm 插件**：确保 `.env.local` 在 `.gitignore` 中
- **maven/gradle 插件**：确保 `application-local.properties` 在 `.gitignore` 中
- **pip 插件**：确保 `.env.local` 在 `.gitignore` 中

此操作是幂等的——如果文件名已在 `.gitignore` 中，不会重复添加。

#### 3. 检查插件专属配置（条件执行）

部分插件需要无法自动推断的配置（例如 Xcode 插件需要 scheme 和构建目标）。Colyn 会自动尝试检测这些配置，如果无法确定，会通过交互式提问让用户填写。

填写的配置保存到 `.colyn/settings.json` 的 `pluginSettings` 字段，后续命令（如 `build`）可直接读取，不会重复询问。

> **对于当前内置插件（npm/maven/gradle/pip），此步骤会自动跳过**——它们不需要额外的专属配置。此功能主要为 Xcode 等需要用户决策的工具链准备。

#### 4. 询问端口号（条件执行）

只有当插件声明了端口配置时，Colyn 才询问端口号。对于不需要端口的项目（如纯库项目），此步骤自动跳过。

#### 5. 写入运行时配置

根据各插件的配置格式写入端口信息：

| 插件 | 配置文件 | 配置格式 |
|------|---------|---------|
| npm | `.env.local` | `PORT=3000` |
| maven | `src/main/resources/application-local.properties` | `server.port=8080` |
| gradle | `src/main/resources/application-local.properties` | `server.port=8080` |
| pip | `.env.local` | `PORT=8000` |

#### 6. 保存插件配置

将激活的插件名称列表写入 `.colyn/settings.json`：

```json
{
  "version": 3,
  "plugins": ["npm"]
}
```

---

### colyn add

**创建新 Worktree 时**，插件自动完成：

#### 1. 复制运行时配置

从主分支读取配置，写入新 Worktree 对应的配置文件，自动更新端口号：

```
✔ 复制环境配置 → .env.local (PORT=3001)
```

各插件写入各自格式的配置文件（npm 写 `.env.local`，maven/gradle 写 `application-local.properties`）。

#### 2. 安装依赖

自动在新 Worktree 目录下安装项目依赖：

```
⠿ 安装依赖...
✔ 依赖安装完成
```

| 插件 | 执行命令 |
|------|---------|
| npm | `npm install`（或 yarn/pnpm，取决于配置） |
| maven | `mvn install -DskipTests` |
| gradle | `./gradlew build -x test` |
| pip | `poetry install` 或 `pip install -r requirements.txt` |
| xcode | 有 `Podfile` → `pod install`；有 `Package.swift` → `swift package resolve`；否则静默跳过 |

**如果依赖安装失败**，会显示错误信息，但 Worktree 已创建完成，用户可以手动安装。

---

### colyn merge

**合并前**，插件自动运行代码质量检查：

#### Lint 检查

```
⠿ 运行 Lint 检查...
✔ Lint 检查通过
```

| 插件 | 执行条件 | 命令 |
|------|---------|------|
| npm | `package.json` 有 `scripts.lint` | `npm run lint`（或 yarn/pnpm） |
| maven | `pom.xml` 配置了 checkstyle 插件 | `mvn checkstyle:check` |
| gradle | `build.gradle` 配置了 checkstyle | `./gradlew checkstyleMain` |
| pip | 有 ruff 配置 | `ruff check .`；否则尝试 `flake8` |
| xcode | 有 `.swiftlint.yml` 且 swiftlint 已安装 | `swiftlint lint` |

#### Build 检查（仅在 `colyn merge` 中执行）

```
⠿ 运行 Build 检查...
✔ Build 检查通过
```

| 插件 | 执行条件 | 命令 |
|------|---------|------|
| npm | `package.json` 有 `scripts.build` | `npm run build` |
| maven | 始终执行 | `mvn package -DskipTests` |
| gradle | 始终执行 | `./gradlew build` |
| pip | 不执行（Python 通常无构建步骤） | - |
| xcode | 已配置 scheme | `xcodebuild -workspace/-project {x} -scheme {s} -destination {d} build` |
| xcode | 纯 SPM 且无 scheme | `swift build` |
| xcode | 有 xcodeproj 但未配置 scheme | 静默跳过，提示运行 `colyn repair` |

#### 跳过检查：`--skip-build`

如需紧急合并，可跳过 lint 和 build 检查：

```bash
colyn merge --skip-build
```

#### 查看失败详情：`-v / --verbose`

检查失败时，默认只显示简要信息。加 `-v` 可查看完整的命令输出：

```bash
colyn merge -v
```

**默认（失败时）**：
```
✗ Lint 检查失败
  使用 -v 查看详情：colyn merge -v
```

**加 `-v` 后**：
```
✗ Lint 检查失败

  src/utils.ts:15:3 error  'x' is assigned but never used
  src/utils.ts:23:1 error  Missing semicolon
  ...

  请修复后重试：colyn merge
```

---

### colyn release

**发布时**，插件在主分支目录中依次执行：

#### 执行顺序

```
步骤 0a: 安装依赖（确保依赖最新）
步骤 0b: Lint 检查
步骤 0c: Build 检查
步骤 3:  更新版本号
```

#### 1. 安装依赖

确保主分支依赖为最新，避免因依赖缺失导致后续步骤失败。

#### 2. Lint 检查

同 `colyn merge` 的 Lint 检查规则。

#### 3. Build 检查

同 `colyn merge` 的 Build 检查规则。

#### 4. 更新版本号

各插件更新各自的版本文件：

| 插件 | 版本文件 | 命令 |
|------|---------|------|
| npm | `package.json` 的 `version` 字段 | 直接修改文件 |
| maven | `pom.xml` 的 `<version>` 标签 | `mvn versions:set -DnewVersion=X.Y.Z` |
| gradle | `build.gradle` / `build.gradle.kts` 的 `version` | 正则替换 |
| pip | `pyproject.toml` 或 `setup.py` 的 version | 正则替换 |
| xcode | `project.pbxproj` 的 `MARKETING_VERSION` | `agvtool new-marketing-version X.Y.Z`；失败时直接修改 `project.pbxproj` |

> **注意**：如果激活的插件没有实现版本更新功能，`colyn release` 会报错终止，因为版本号更新是发布的必要步骤。

#### 查看失败详情：`-v / --verbose`

```bash
colyn release -v
```

同 `colyn merge -v`，在 lint/build 失败时显示完整输出。

---

### colyn repair

**修复时**，Colyn 重新执行以下插件相关操作：

#### 1. 确保运行时配置文件被 .gitignore 忽略

```
⠿ 检查运行时配置文件的 .gitignore 忽略规则...
✔ .gitignore 检查完成
```

同 `colyn init` 的步骤 2——幂等地确保各插件的运行时配置文件名在 `.gitignore` 中。

#### 2. 重新检查插件专属配置（条件执行）

如果激活的插件实现了 `repairSettings`（如 Xcode 插件），`colyn repair` 会重新执行配置检查。这意味着：

- 已保存的配置在项目结构未变时会直接复用，不再询问
- 如果项目结构有变化（如新增了 scheme），会重新检测并更新

**用途**：当你对项目做了重大变更（如切换 Xcode scheme），可以通过 `colyn repair` 更新保存的配置。

如果以上操作失败，`colyn repair` 只显示警告，不中断修复流程（非致命）。

---

## 查看和配置激活的插件

### 查看当前激活的插件

插件配置保存在项目的 `.colyn/settings.json`：

```json
{
  "version": 3,
  "plugins": ["npm"]
}
```

直接查看该文件即可了解当前激活的插件。

如果插件有专属配置（如 Xcode 的 scheme），会保存在同一文件的 `pluginSettings` 字段：

```json
{
  "version": 3,
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

如需修改插件专属配置，可以直接编辑此字段，或运行 `colyn repair` 重新触发交互式配置流程。

### 修改激活的插件

直接编辑 `.colyn/settings.json` 的 `plugins` 字段：

```json
{
  "version": 3,
  "plugins": ["maven"]
}
```

**可选值**：`"npm"`、`"maven"`、`"gradle"`、`"pip"`、`"xcode"`，以及任意组合的数组。

**留空表示不使用任何工具链插件**：

```json
{
  "version": 3,
  "plugins": []
}
```

### 插件顺序的影响

`plugins` 数组的顺序决定了**"优先级"**：当多个插件都能提供某种配置时（如端口配置），优先使用数组中第一个插件的返回值。

---

## 旧项目自动迁移

如果你的项目在引入插件系统之前就已经用 `colyn init` 初始化，运行任何 `colyn` 命令时会**自动检测工具链并配置插件**：

```
ℹ 已自动配置工具链插件：npm
  如需修改，编辑 .colyn/settings.json 的 plugins 字段
```

**自动迁移逻辑**：
1. 检测 `.colyn/settings.json` 中是否有 `plugins` 字段
2. 如果没有（旧项目），扫描主分支目录自动识别工具链
3. 将识别结果写入 `settings.json`
4. 显示提示信息（不阻断命令执行）

**如果未检测到任何工具链**，`plugins` 字段会被设为 `[]`，后续命令跳过所有工具链相关步骤。

> 自动迁移失败时静默忽略，不影响命令正常执行。

---

## 各插件详细说明

### npm 插件

**适用范围**：所有包含 `package.json` 的 Node.js 项目（React、Next.js、Vue、Express 等）

**端口配置**：`{ key: 'PORT', defaultPort: 3000 }`

**配置文件**：`.env.local`（dotenv 格式）

**包管理器**：通过 `colyn config` 设置的 npm/yarn/pnpm（参见[配置系统](10-configuration.md)）

**详细行为**：

| 操作 | 条件 | 命令 |
|------|------|------|
| getRuntimeConfigFileName | 始终 | 返回 `'.env.local'`（由 colyn 加入 `.gitignore`） |
| install | 始终 | `<npm/yarn/pnpm> install` |
| lint | `scripts.lint` 存在 | `<npm/yarn/pnpm> run lint` |
| build | `scripts.build` 存在 | `<npm/yarn/pnpm> run build` |
| bumpVersion | 始终 | 更新 `package.json` 的 `version` |
| devServerCommand | `scripts.dev` 存在 | `<npm/yarn/pnpm> run dev` |

---

### maven 插件

**适用范围**：包含 `pom.xml` 的 Java 项目（Spring Boot 等）

**端口配置**：`{ key: 'server.port', defaultPort: 8080 }`

**配置文件**：`src/main/resources/application-local.properties`

> **Spring Boot 本地配置说明**：`application-local.properties` 通过 `spring.profiles.active=local` 激活，包含仅供本地开发使用的配置，不提交 git。

**详细行为**：

| 操作 | 条件 | 命令 |
|------|------|------|
| getRuntimeConfigFileName | 始终 | 返回 `'application-local.properties'`（由 colyn 加入 `.gitignore`） |
| readRuntimeConfig | 始终 | 按优先级读取：local.properties → local.yaml → application.properties → application.yaml |
| writeRuntimeConfig | 始终 | 写入 `application-local.properties` |
| install | 始终 | `mvn install -DskipTests` |
| lint | `pom.xml` 配置了 checkstyle | `mvn checkstyle:check` |
| build | 始终 | `mvn package -DskipTests` |
| bumpVersion | 始终 | `mvn versions:set -DnewVersion=X.Y.Z -DgenerateBackupPoms=false` |
| devServerCommand | 始终 | `['mvn', 'spring-boot:run']` |

---

### gradle 插件

**适用范围**：包含 `build.gradle` 或 `build.gradle.kts` 的 Java/Kotlin/Android 项目

**端口配置**：`{ key: 'server.port', defaultPort: 8080 }`

**配置文件**：`src/main/resources/application-local.properties`（同 maven 插件）

**详细行为**：

| 操作 | 条件 | 命令 |
|------|------|------|
| getRuntimeConfigFileName | 始终 | 返回 `'application-local.properties'`（由 colyn 加入 `.gitignore`） |
| readRuntimeConfig | 始终 | 同 maven 插件 |
| writeRuntimeConfig | 始终 | 写入 `application-local.properties` |
| install | 始终 | `./gradlew build -x test` |
| lint | build file 配置了 checkstyle | `./gradlew checkstyleMain` |
| build | 始终 | `./gradlew build` |
| bumpVersion | 始终 | 正则替换 `build.gradle` / `build.gradle.kts` 中的 `version` 行 |
| devServerCommand | 始终 | `['./gradlew', 'bootRun']` |

---

### pip 插件

**适用范围**：包含 `requirements.txt` 或 `pyproject.toml` 的 Python 项目

**端口配置**：`{ key: 'PORT', defaultPort: 8000 }`

**配置文件**：`.env.local`（dotenv 格式）

**详细行为**：

| 操作 | 条件 | 命令 |
|------|------|------|
| getRuntimeConfigFileName | 始终 | 返回 `'.env.local'`（由 colyn 加入 `.gitignore`） |
| readRuntimeConfig | 始终 | 读取 `.env.local` |
| writeRuntimeConfig | 始终 | 写入 `.env.local` |
| install | 有 `pyproject.toml` | `poetry install` |
| install | 无 `pyproject.toml` | `pip install -r requirements.txt` |
| lint | 有 ruff 配置 | `ruff check .` |
| lint | 无 ruff，有 flake8 | `flake8` |
| lint | 都没有 | 静默跳过 |
| build | - | 不实现（Python 通常无需构建） |
| bumpVersion | 有 `pyproject.toml` | 正则替换 `version = "..."` |
| bumpVersion | 有 `setup.py` | 正则替换 `version=...` |
| devServerCommand | 有 `manage.py`（Django） | `['python', 'manage.py', 'runserver']` |
| devServerCommand | 其他 | null（不自动启动） |

---

### xcode 插件

**适用范围**：包含 `*.xcworkspace`（排除内部的 `project.xcworkspace`）、`*.xcodeproj` 或 `Package.swift` 的 Apple 平台项目

**端口配置**：无（原生 App 不需要 web 端口）

**配置文件**：无（Xcode 没有标准的运行时配置文件）

**专属配置（pluginSettings.xcode）**：

Xcode 插件需要在 `colyn init` / `colyn repair` 时通过交互式提问收集以下信息，并保存到 `.colyn/settings.json` 的 `pluginSettings.xcode` 字段供 `build` 命令使用：

| 字段 | 说明 | 来源 |
|------|------|------|
| `workspace` | `.xcworkspace` 文件名（如 `MyApp.xcworkspace`） | 文件系统扫描 |
| `project` | `.xcodeproj` 文件名（如 `MyApp.xcodeproj`） | 文件系统扫描 |
| `scheme` | Xcode scheme 名称 | 自动检测（shared scheme）或用户输入 |
| `destination` | 构建目标平台字符串 | 从 `SDKROOT` 推断或用户选择 |

**scheme 检测规则**：

- 搜索 `{project}.xcodeproj/xcshareddata/xcschemes/*.xcscheme`（已提交到 git 的 shared scheme）
- 只有一个 shared scheme → 自动选择
- 多个 shared scheme → 让用户选择（单选）
- 没有 shared scheme → 提示用户手动输入（本地 scheme 路径因人而异）

**destination 推断规则**：

| SDKROOT 值 | 推断为 |
|-----------|--------|
| `iphoneos` | `generic/platform=iOS Simulator` |
| `macosx` | `platform=macOS` |
| `appletvos` | `generic/platform=tvOS Simulator` |
| `watchos` | `generic/platform=watchOS Simulator` |

无法推断时，会提供常见选项让用户选择。

**详细行为**：

| 操作 | 条件 | 命令 |
|------|------|------|
| detect | 始终 | 检测 `.xcworkspace` / `.xcodeproj` / `Package.swift` |
| portConfig | 始终 | 返回 null（无端口） |
| getRuntimeConfigFileName | 始终 | 返回 null（无运行时配置文件） |
| repairSettings | 始终 | 交互式收集 scheme / destination，保存到 pluginSettings.xcode |
| install | 有 `Podfile` | `pod install` |
| install | 有 `Package.swift`（无 Podfile） | `swift package resolve` |
| install | 两者都没有 | 静默跳过 |
| lint | 有 `.swiftlint.yml` 且 swiftlint 已安装 | `swiftlint lint` |
| lint | swiftlint 未安装 | 静默跳过（不是错误） |
| build | 已配置 scheme + workspace | `xcodebuild -workspace {w} -scheme {s} -destination {d} build` |
| build | 已配置 scheme + project | `xcodebuild -project {p} -scheme {s} -destination {d} build` |
| build | 未配置 scheme，纯 SPM | `swift build` |
| build | 未配置 scheme，有 xcodeproj | 静默跳过，提示运行 `colyn repair` |
| bumpVersion | 始终优先 | `agvtool new-marketing-version X.Y.Z` |
| bumpVersion | agvtool 失败时 | 正则替换 `project.pbxproj` 的 `MARKETING_VERSION` |

**示例配置（`settings.json`）**：

```json
{
  "version": 3,
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

**纯 SPM 项目**（无需 scheme 配置）：

```json
{
  "version": 3,
  "plugins": ["xcode"],
  "pluginSettings": {
    "xcode": {}
  }
}
```

**注意事项**：
- `agvtool` 需要项目 Build Settings 中设置 `VERSIONING_SYSTEM = apple-generic`
- CocoaPods 管理的项目通常有 `.xcworkspace`，应优先使用 workspace 而非 project
- CI 环境（`nonInteractive=true`）下，如果无法自动推断 scheme，`build` 步骤会静默跳过

---

## 常见问题

### Q1: 初始化时没有看到插件检测步骤？

**可能原因**：
- 该目录中未找到工具链特征文件（`package.json`、`pom.xml` 等）
- 是空目录场景，工具链检测在创建目录结构后进行

**解决方式**：在主分支目录中初始化项目（`npm init`、`mvn archetype:generate` 等），然后重新运行 `colyn init`。

---

### Q2: `colyn add` 时依赖安装失败怎么办？

Worktree 已经创建完成，依赖安装失败不影响 Worktree 的可用性。手动进入目录安装即可：

```bash
cd worktrees/task-1
npm install  # 或 yarn / pnpm / mvn install / pip install
```

---

### Q3: `colyn merge` 报 Lint 失败，但本地运行 lint 是通过的？

Colyn 运行 lint 时使用插件配置的命令，在 Worktree 目录中执行。请确认：

1. 在 Worktree 目录中手动运行 lint，确认是否真的通过
2. 如果通过，尝试加 `-v` 查看详细输出：`colyn merge -v`
3. 临时跳过：`colyn merge --skip-build`（仅用于紧急情况）

---

### Q4: `colyn release` 提示"插件未实现 bumpVersion"？

如果激活的插件不支持版本号更新，release 会报错终止。请检查：

1. `.colyn/settings.json` 中的 `plugins` 字段是否正确
2. 项目中是否有对应的版本文件（`package.json`/`pom.xml`/`build.gradle`/`pyproject.toml`）

---

### Q5: 如何禁用插件的特定功能？

目前没有细粒度的开关，可以：
- **跳过 lint/build**：`colyn merge --skip-build`
- **完全禁用所有插件**：将 `plugins` 设为 `[]`
- **切换插件**：修改 `plugins` 字段使用其他插件

---

### Q6: 同一个项目可以同时激活多个插件吗？

是的，但通常不需要。`plugins` 字段是数组，可以包含多个插件名：

```json
{ "plugins": ["npm", "pip"] }
```

**适用场景**：全栈项目（前端用 npm，后端用 pip）。

**注意**：对于"第一个非 null 结果生效"的操作（如端口配置、读取运行时配置），数组中靠前的插件优先级更高。

---

## 下一步

- [配置系统](10-configuration.md) - 了解如何配置包管理器命令
- [命令参考](04-command-reference.md) - 查看各命令的完整选项
- [故障排除](08-troubleshooting.md) - 遇到问题时参考
