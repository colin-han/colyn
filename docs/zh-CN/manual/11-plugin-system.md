# 工具链插件系统

Colyn 内置**工具链插件机制**，让它能够适配 Node.js、Java（Maven/Gradle）、Python、Apple 平台（Xcode）等不同技术栈的项目，自动处理各工具链的差异化操作（依赖安装、Lint 检查、构建、版本号更新等）。

---

## 目录

- [什么是工具链插件](#什么是工具链插件)
- [内置插件一览](#内置插件一览)
- [单项目模式与 Mono Repo 模式](#单项目模式与-mono-repo-模式)
- [插件在各命令中的行为](#插件在各命令中的行为)
  - [colyn init](#colyn-init)
  - [colyn add](#colyn-add)
  - [colyn merge](#colyn-merge)
  - [colyn release](#colyn-release)
  - [colyn repair](#colyn-repair)
- [查看和配置工具链](#查看和配置工具链)
- [从旧版本升级（V3 → V4）](#从旧版本升级v3--v4)
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
- **自动检测（按需发现）**：命令首次遇到未配置目录时，就地自动识别工具链，无需手动配置
- **Mono Repo 支持**：根目录无工具链时自动扫描一级子目录，每个子项目独立管理

---

## 内置插件一览

| 插件名 | 适用项目 | 检测方式 | 默认端口 |
|--------|---------|---------|---------|
| `npm` | Node.js / React / Next.js / Vue 等 | `package.json` 存在 | 3000 |
| `maven` | Java Spring Boot（Maven） | `pom.xml` 存在 | 8080 |
| `gradle` | Java / Kotlin / Android（Gradle） | `build.gradle` 或 `build.gradle.kts` 存在 | 8080 |
| `pip` | Python（pip / poetry） | `requirements.txt` 或 `pyproject.toml` 存在 | 8000 |
| `xcode` | iOS / macOS / tvOS / watchOS 原生应用 | `*.xcworkspace` / `*.xcodeproj` / `Package.swift` 存在（根目录或一级子目录） | 无 |

> **说明**：使用 Maven 和 Gradle 的 Java 项目视为不同插件，因为构建命令完全不同。Xcode 插件无端口配置，因为原生 App 不需要 web 端口。

---

## 单项目模式与 Mono Repo 模式

Colyn 支持两种项目结构，自动识别，无需手动配置：

### 单项目模式

根目录下可以识别到某种工具链（如存在 `package.json`）时，Colyn 在根目录执行所有操作。

配置示例（`.colyn/settings.json`）：

```json
{
  "version": 4,
  "toolchain": {
    "type": "npm",
    "settings": {}
  }
}
```

### Mono Repo 模式

根目录无法识别工具链时，Colyn 自动扫描一级子目录。每个识别到的子目录作为独立子项目，各自执行 lint/build/install 等操作。

配置示例（`.colyn/settings.json`）：

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

> `toolchain: null` 表示该子目录明确不使用任何工具链，不会重复触发检测提示。

### 按需发现策略

当 Colyn 遇到未配置的目录时（如 `toolchain`/`projects` 都未定义，或 Mono Repo 新增了子目录），会**就地触发自动识别 + 用户选择流程**，然后继续执行当前命令：

```
ℹ 子目录 mobile 未被任何工具链识别
? 请为 mobile 选择工具链：
  ○ Node.js (npm)
  ○ Apple (Xcode)
  ○ (无工具链)
```

选择结果会立即写入 `.colyn/settings.json`，后续命令不再重复询问。

---

## 插件在各命令中的行为

### colyn init

**初始化时**，Colyn 自动完成以下与插件相关的步骤：

#### 1. 自动检测工具链

扫描主分支目录，识别项目使用的工具链：

**单项目**（根目录有工具链）：
```
✔ 检测到单项目（npm）
```

**Mono Repo**（根目录无工具链，扫描子目录）：
```
✔ 检测到 Mono Repo 结构，发现 2 个子项目
```

**子目录未被识别时**，显示选择 prompt（每个未识别的子目录单独提示）：

```
ℹ 子目录 scripts 未被任何工具链识别
? 请为 scripts 选择工具链：
  ○ Node.js (npm)
  ○ Java (Maven)
  ○ Apple (Xcode)
  ○ (无工具链)
```

检测结果（包括"无工具链"的子目录）会写入 `.colyn/settings.json`，后续命令不再重复询问。

#### 2. 确保运行时配置文件被 .gitignore 忽略

Colyn 自动检查并确保各插件的运行时配置文件被加入 `.gitignore`：

- **npm 插件**：确保 `.env.local` 在 `.gitignore` 中
- **maven/gradle 插件**：确保 `application-local.properties` 在 `.gitignore` 中
- **pip 插件**：确保 `.env.local` 在 `.gitignore` 中

此操作是幂等的——如果文件名已在 `.gitignore` 中，不会重复添加。

#### 3. 检查插件专属配置（条件执行）

部分插件需要无法自动推断的配置（例如 Xcode 插件需要 scheme 和构建目标）。Colyn 会自动尝试检测这些配置，如果无法确定，会通过交互式提问让用户填写。

填写的配置保存到 `.colyn/settings.json` 的 `toolchain.settings`（单项目）或 `projects[i].toolchain.settings`（Mono Repo）字段，后续命令（如 `build`）可直接读取，不会重复询问。

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

#### 6. 保存工具链配置

将检测结果写入 `.colyn/settings.json`（单项目示例）：

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

## 查看和配置工具链

### 查看当前工具链配置

工具链配置保存在项目的 `.colyn/settings.json`，直接查看该文件即可了解当前配置。

**单项目模式**：

```json
{
  "version": 4,
  "toolchain": {
    "type": "npm",
    "settings": {}
  }
}
```

**Xcode 项目**（有专属配置）：

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

**Mono Repo 模式**：

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

### 修改工具链专属配置

如需修改工具链专属配置（如 Xcode 的 scheme），有两种方式：

1. **直接编辑** `.colyn/settings.json` 的 `toolchain.settings` 或 `projects[i].toolchain.settings` 字段
2. **重新检测**：运行 `colyn repair` 重新触发交互式配置流程

### 修改工具链类型

直接编辑 `.colyn/settings.json` 的 `toolchain.type`（单项目）或 `projects[i].toolchain.type`（Mono Repo）：

```json
{
  "version": 4,
  "toolchain": {
    "type": "maven",
    "settings": {}
  }
}
```

**可选值**：`"npm"`、`"maven"`、`"gradle"`、`"pip"`、`"xcode"`

**明确不使用任何工具链**：

```json
{
  "version": 4,
  "toolchain": null
}
```

设为 `null` 后，Colyn 不会再询问工具链选择。如需重新配置，运行 `colyn init`。

---

## 从旧版本升级（V3 → V4）

如果你的项目使用的是 v3.x 以前的 Colyn 配置（`.colyn/settings.json` 中有 `"version": 3` 和 `"plugins": [...]` 字段），运行任何 `colyn` 命令时会**自动迁移到 V4 格式**：

**升级过程**：
1. Colyn 读取配置时自动识别 V3 格式
2. 通过 Zod transform 将配置升级到 V4（丢弃 `plugins`/`pluginSettings` 字段）
3. 下次执行工具链相关命令时，自动重新检测项目工具链
4. 检测结果以 V4 格式写入 `settings.json`

**V3 配置**（旧格式）：
```json
{
  "version": 3,
  "plugins": ["npm"],
  "pluginSettings": {}
}
```

**V4 配置**（新格式，迁移 + 重新检测后）：
```json
{
  "version": 4,
  "toolchain": {
    "type": "npm",
    "settings": {}
  }
}
```

> 迁移过程无需用户操作，完全自动完成。如果迁移后工具链检测不正确，可以手动编辑 `.colyn/settings.json` 或运行 `colyn init` 重新配置。

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

**适用范围**：包含 `*.xcworkspace`（排除内部的 `project.xcworkspace`）、`*.xcodeproj` 或 `Package.swift` 的 Apple 平台项目。这些文件可位于 Worktree 根目录，也可位于一级子目录（如 `ios/`、`macos/`）中。

**端口配置**：无（原生 App 不需要 web 端口）

**配置文件**：无（Xcode 没有标准的运行时配置文件）

**专属配置（toolchain.settings）**：

Xcode 插件需要在 `colyn init` / `colyn repair` 时通过交互式提问收集以下信息，并保存到 `.colyn/settings.json` 的 `toolchain.settings`（单项目）或 `projects[i].toolchain.settings`（Mono Repo）字段供 `build` 命令使用：

| 字段 | 说明 | 来源 |
|------|------|------|
| `subdir` | Xcode 工程所在子目录（如 `"ios"`、`"macos"`），根目录时无此字段 | 文件系统扫描 |
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
| repairSettings | 始终 | 交互式收集 scheme / destination，保存到 toolchain.settings |
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

根目录项目（xcodeproj 在 Worktree 根目录下）：

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

子目录项目（xcodeproj 在子目录中，如 `macos/ColynPuppy.xcodeproj`）：

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

**纯 SPM 项目**（无需 scheme 配置）：

```json
{
  "version": 4,
  "toolchain": {
    "type": "xcode",
    "settings": {}
  }
}
```

**注意事项**：
- `agvtool` 需要项目 Build Settings 中设置 `VERSIONING_SYSTEM = apple-generic`
- CocoaPods 管理的项目通常有 `.xcworkspace`，应优先使用 workspace 而非 project
- CI 环境（`nonInteractive=true`）下，如果无法自动推断 scheme，`build` 步骤会静默跳过

---

## 常见问题

### Q1: 初始化时没有看到工具链检测步骤？

**可能原因**：
- 该目录中未找到工具链特征文件（`package.json`、`pom.xml` 等）
- 是空目录场景，工具链检测在创建目录结构后进行

**行为说明**：如果未自动检测到任何工具链，且根目录下有子目录时，Colyn 会尝试扫描一级子目录（Mono Repo 模式）。对于无法识别的子目录，会弹出单选 prompt 让你为每个子目录选择工具链（选择"无工具链"可跳过）。

**解决方式**：在 prompt 中选择对应工具链，或在主分支目录中初始化项目后重新运行 `colyn init`。

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

1. `.colyn/settings.json` 中的 `toolchain.type`（或 `projects[i].toolchain.type`）是否正确
2. 项目中是否有对应的版本文件（`package.json`/`pom.xml`/`build.gradle`/`pyproject.toml`）

---

### Q5: 如何禁用工具链的特定功能？

目前没有细粒度的开关，可以：
- **跳过 lint/build**：`colyn merge --skip-build`
- **完全禁用工具链**：将 `.colyn/settings.json` 的 `toolchain` 设为 `null`
- **切换工具链**：修改 `toolchain.type` 字段

---

### Q6: 同一个项目可以有多个工具链吗？

可以，通过 **Mono Repo 模式**支持。每个子目录配置独立的工具链：

```json
{
  "version": 4,
  "projects": [
    { "path": "frontend", "toolchain": { "type": "npm", "settings": {} } },
    { "path": "backend", "toolchain": { "type": "maven", "settings": {} } }
  ]
}
```

Colyn 会对每个子项目独立执行 lint/build/install 等操作。

如果根目录直接被某工具链识别（单项目模式），则不支持同时激活多个工具链，这覆盖了大多数项目场景。

---

## 下一步

- [配置系统](10-configuration.md) - 了解如何配置包管理器命令
- [命令参考](04-command-reference.md) - 查看各命令的完整选项
- [故障排除](08-troubleshooting.md) - 遇到问题时参考
