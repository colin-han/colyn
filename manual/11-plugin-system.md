# 工具链插件系统

Colyn 内置**工具链插件机制**，让它能够适配 Node.js、Java（Maven/Gradle）、Python 等不同技术栈的项目，自动处理各工具链的差异化操作（依赖安装、Lint 检查、构建、版本号更新等）。

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

- **按工具链划分**：每个插件对应一种构建工具（npm/maven/gradle/pip），而非编程语言
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

> **说明**：使用 Maven 和 Gradle 的 Java 项目视为不同插件，因为构建命令完全不同。

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

#### 3. 询问端口号（条件执行）

只有当插件声明了端口配置时，Colyn 才询问端口号。对于不需要端口的项目（如纯库项目），此步骤自动跳过。

#### 4. 写入运行时配置

根据各插件的配置格式写入端口信息：

| 插件 | 配置文件 | 配置格式 |
|------|---------|---------|
| npm | `.env.local` | `PORT=3000` |
| maven | `src/main/resources/application-local.properties` | `server.port=8080` |
| gradle | `src/main/resources/application-local.properties` | `server.port=8080` |
| pip | `.env.local` | `PORT=8000` |

#### 5. 保存插件配置

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

> **注意**：如果激活的插件没有实现版本更新功能，`colyn release` 会报错终止，因为版本号更新是发布的必要步骤。

#### 查看失败详情：`-v / --verbose`

```bash
colyn release -v
```

同 `colyn merge -v`，在 lint/build 失败时显示完整输出。

---

### colyn repair

**修复时**，Colyn 重新检查并确保运行时配置文件被 `.gitignore` 正确忽略：

```
⠿ 检查运行时配置文件的 .gitignore 忽略规则...
✔ .gitignore 检查完成
```

**作用**：确保 `.gitignore` 中的忽略规则存在且完整，避免运行时配置文件（如 `.env.local`）被意外提交。此操作幂等——已存在的规则不会重复添加。

如果检查失败，`colyn repair` 只显示警告，不中断修复流程（非致命）。

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

### 修改激活的插件

直接编辑 `.colyn/settings.json` 的 `plugins` 字段：

```json
{
  "version": 3,
  "plugins": ["maven"]
}
```

**可选值**：`"npm"`、`"maven"`、`"gradle"`、`"pip"`，以及任意组合的数组。

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
