# 工具链插件设计文档

**状态**：已实现
**创建时间**：2026-02-21
**最后更新**：2026-02-22（V4 配置格式重构 + Mono Repo 支持）
**相关需求**：`docs/requirements/requirement-plugin-system.md`、`docs/requirement-mono-repo.md`

---

## 1. 背景与目标

### 1.1 现状问题

当前 colyn 的环境配置逻辑（端口分配、`.env.local` 读写、dev server 启动命令检测等）**硬编码为 Node.js 工具链**，无法适配 Java（Maven/Gradle）、Python（pip/poetry）等其他开发环境。

### 1.2 设计目标

引入**工具链插件（Toolchain Plugin）**机制，将工具链相关逻辑从核心代码中解耦：

- colyn 核心只负责 worktree 生命周期管理
- 工具链差异（配置文件格式、依赖安装、lint/build 命令等）由插件承担
- 内置常见工具链插件，支持未来通过 npm 包扩展

### 1.3 插件粒度

**按工具链划分**，而非按编程语言：

| 插件名 | 适用项目 | 检测方式 |
|--------|---------|---------|
| `npm` | Node.js / Next.js / React Native 等 | `package.json` 存在 |
| `maven` | Java Spring Boot / Android 等（Maven） | `pom.xml` 存在 |
| `gradle` | Java / Kotlin / Android 等（Gradle） | `build.gradle` 或 `build.gradle.kts` 存在 |
| `pip` | Python（pip / poetry） | `requirements.txt` 或 `pyproject.toml` 存在 |
| `xcode` | iOS / macOS / tvOS / watchOS 原生应用 | `*.xcworkspace` / `*.xcodeproj` / `Package.swift` 存在 |

> **说明**：同一编程语言使用不同构建工具时（如 Maven vs Gradle）视为不同插件，因为工具链命令完全不同。

---

## 2. 插件接口定义

### 2.1 类型定义

```typescript
// src/types/plugin.ts

/**
 * 端口分配配置
 * null 表示该工具链不需要端口（如库项目、CLI 工具）
 */
export interface PortConfig {
  /** 配置文件中的键名，如 "PORT"、"server.port" */
  key: string;
  /** 默认端口号 */
  defaultPort: number;
}

/**
 * 插件命令执行失败时抛出的异常
 *
 * lint / build 失败时插件必须抛出此类型，
 * 以便 PluginManager 在 verbose 模式下将命令输出展示给用户。
 */
export class PluginCommandError extends Error {
  /** 失败命令的完整输出（stdout + stderr） */
  readonly output: string;

  constructor(message: string, output: string) {
    super(message);
    this.name = 'PluginCommandError';
    this.output = output;
  }
}

/**
 * repairSettings 的上下文对象
 *
 * 在 colyn init / colyn repair 时传入各插件的 repairSettings 方法。
 */
export interface RepairSettingsContext {
  /** 项目根目录（.colyn 的父目录），暂留字段，实际传入空字符串 */
  projectRoot: string;
  /** 子项目目录路径（单项目模式 = worktree 根目录；Mono Repo 模式 = worktree/subPath） */
  worktreePath: string;
  /** 当前已保存的工具链专属配置（来自 settings.toolchain.settings 或 projects[i].toolchain.settings） */
  currentSettings: Record<string, unknown>;
  /** 是否处于非交互式模式（如 CI 环境，不能弹出交互提问） */
  nonInteractive: boolean;
}

/**
 * 工具链插件接口
 *
 * 所有方法均为可选，插件只需实现其关心的扩展点。
 * 未实现的扩展点由 colyn 核心跳过或使用默认行为。
 */
export interface ToolchainPlugin {
  // ════════════════════════════════════════════
  // 元数据
  // ════════════════════════════════════════════

  /** 插件唯一标识符，如 'npm' | 'maven' | 'gradle' | 'pip' */
  name: string;

  /** 用于界面展示的名称，如 'Node.js (npm)' */
  displayName: string;

  // ════════════════════════════════════════════
  // 检测扩展点
  // ════════════════════════════════════════════

  /**
   * 检测项目是否使用此工具链
   *
   * 通常通过扫描项目特定文件（package.json / pom.xml 等）判断。
   *
   * @param worktreePath 执行检测的目录路径
   * @returns true 表示匹配，false 表示不匹配
   */
  detect(worktreePath: string): boolean | Promise<boolean>;

  // ════════════════════════════════════════════
  // 环境配置扩展点
  // ════════════════════════════════════════════

  /**
   * 返回端口分配配置
   *
   * 返回 null 表示该工具链不需要端口（如库项目）。
   * colyn 根据返回值决定是否为该插件分配 worktree 端口。
   */
  portConfig?(): PortConfig | null;

  /**
   * 读取配置文件，返回统一键值对
   *
   * 执行策略：按插件注册顺序依次尝试，第一个返回非 null 的结果生效。
   * 插件自行决定从 worktreePath 下的哪个文件读取（如 .env.local / application.properties）。
   *
   * @param worktreePath worktree 目录路径
   * @returns 键值对，或 null 表示读取失败（文件不存在或格式不支持）
   */
  readRuntimeConfig?(worktreePath: string): Promise<Record<string, string> | null>;

  /**
   * 将键值对写入配置文件（支持原生格式）
   *
   * 不同插件写入各自的配置文件：
   * - npm 插件写入 .env.local
   * - maven 插件写入 application.properties
   *
   * @param worktreePath worktree 目录路径（由插件自行决定写入哪个配置文件）
   * @param config 要写入的键值对
   */
  writeRuntimeConfig?(worktreePath: string, config: Record<string, string>): Promise<void>;

  // ════════════════════════════════════════════
  // 项目初始化
  // ════════════════════════════════════════════

  /**
   * 返回运行时配置文件名
   *
   * colyn 会确保该文件名被添加到 .gitignore。
   * 返回 null 表示该工具链无运行时配置文件需要忽略。
   *
   * @returns 文件名（如 '.env.local'、'application-local.properties'），或 null
   */
  getRuntimeConfigFileName?(): string | null;

  /**
   * 检查并修复插件专属项目配置
   *
   * 在 `colyn init` 和 `colyn repair` 时调用。
   * 插件应扫描项目结构，识别必要的配置项（如 Xcode 的 scheme / destination）。
   * 如果无法自动确定，可通过交互式提问让用户填写。
   * 结果由 colyn 保存到 `.colyn/settings.json` 的 `toolchain.settings` 或 `projects[i].toolchain.settings` 字段。
   *
   * **典型用途**：Xcode 插件通过此方法询问用户 scheme 和 destination，
   * 供后续 `build` 命令使用。
   *
   * @param context 包含 worktreePath、当前已保存工具链配置、非交互模式标志
   * @returns 工具链专属配置键值对（将完整覆盖对应 toolchain.settings）
   */
  repairSettings?(context: RepairSettingsContext): Promise<Record<string, unknown>>;

  // ════════════════════════════════════════════
  // 工具链信息（供其他插件查询，如 terminal session 插件）
  // ════════════════════════════════════════════

  /**
   * 返回 dev server 启动命令
   *
   * 供 terminal session 插件调用，以便在终端中自动启动 dev server。
   * 工具链插件只负责返回命令，不负责执行。
   *
   * @param worktreePath 执行命令检测的目录路径
   * @returns 命令数组（如 ['npm', 'run', 'dev']），或 null 表示无 dev server
   */
  devServerCommand?(worktreePath: string): string[] | null | Promise<string[] | null>;

  // ════════════════════════════════════════════
  // 生命周期操作（插件直接执行，失败则抛出异常）
  // ════════════════════════════════════════════

  /**
   * 安装项目依赖
   *
   * 触发场景：
   * - `colyn add` 后：在新建 worktree 目录下安装依赖
   * - `colyn release` 前：在主分支目录下安装依赖，确保依赖最新
   *
   * 不实现此方法则跳过安装步骤。
   *
   * **失败处理**：安装命令执行失败时，插件必须抛出 `PluginCommandError`，
   * 并在 `output` 字段中包含命令的完整输出（stdout + stderr）。
   *
   * @param worktreePath 执行安装的目录路径（worktree 或主分支目录）
   * @throws {PluginCommandError} 安装失败时，output 包含命令输出
   */
  install?(worktreePath: string): Promise<void>;

  /**
   * 执行代码质量检查
   *
   * 触发时机：
   * - `colyn merge` 前（预检，失败则阻止 merge）
   * - `colyn release` 前（失败则阻止发布）
   *
   * **缺失处理**：如果工具链没有 lint 脚本/工具（如 package.json 中无 lint script），
   * 插件应**静默跳过**（不抛出异常），等同于 lint 通过。
   *
   * **失败处理**：lint 命令执行失败时，插件必须抛出 `PluginCommandError`，
   * 并在 `output` 字段中包含命令的完整输出（stdout + stderr）。
   *
   * @param worktreePath 执行检查的目录路径
   * @throws {PluginCommandError} lint 失败时，output 包含命令输出
   */
  lint?(worktreePath: string): Promise<void>;

  /**
   * 构建项目
   *
   * 在 `colyn release` 时调用。
   * 不实现此方法则跳过构建步骤。
   *
   * **缺失处理**：如果工具链没有 build 脚本，插件应**静默跳过**（不抛出异常）。
   *
   * **失败处理**：build 命令执行失败时，插件必须抛出 `PluginCommandError`，
   * 并在 `output` 字段中包含命令的完整输出（stdout + stderr）。
   *
   * @param worktreePath 执行构建的目录路径
   * @throws {PluginCommandError} build 失败时，output 包含命令输出
   */
  build?(worktreePath: string): Promise<void>;

  /**
   * 更新项目版本号
   *
   * 在 `colyn release` 时调用，负责更新各自的版本文件：
   * - npm 插件：更新 package.json 的 version 字段
   * - maven 插件：更新 pom.xml 的 <version> 标签
   *
   * **缺失处理**：`bumpVersion` 与 lint/build 不同，如果已激活的插件**未实现**此方法，
   * PluginManager 应**抛出错误**终止 release，因为版本号更新是 release 的必要步骤。
   * 若插件实现了此方法但版本文件缺失，插件自行抛出异常。
   *
   * @param worktreePath 执行版本更新的目录路径
   * @param version 新版本号（如 "1.2.0"）
   */
  bumpVersion?(worktreePath: string, version: string): Promise<void>;

  /**
   * 发布到包管理服务
   *
   * 在 `colyn release` 完成 push 后调用。
   * 未实现则静默跳过。
   *
   * @param worktreePath 执行发布的目录路径
   * @throws {PluginCommandError} 发布失败时，output 包含命令输出
   */
  publish?(worktreePath: string): Promise<void>;

  /**
   * 检查当前项目是否满足发布条件
   *
   * 在 `colyn release` 的发布阶段前调用。
   * 返回 false 时跳过该工具链的 publish。
   */
  checkPublishable?(worktreePath: string): Promise<boolean>;
}
```

### 2.2 设计原则

1. **直接执行**：操作类方法（`install`、`lint`、`build`、`bumpVersion`、`publish`）由插件自行执行，失败时抛出异常，colyn 捕获后显示错误并终止当前命令
2. **可选扩展点**：所有方法均为可选，插件只需实现关心的部分
3. **路径由插件决定**：`readRuntimeConfig` 和 `writeRuntimeConfig` 均接收 `worktreePath`，由插件自行推断应读写哪个配置文件（npm 插件用 `.env.local`，maven 插件用 `application-local.properties`）
4. **阶段失败语义**：lint 失败、build 失败、publish 失败均会阻止后续步骤
5. **缺失静默跳过（lint/build）**：若工具链没有对应脚本，插件内部静默跳过，不视为失败
6. **缺失报错（bumpVersion）**：已激活插件若未实现 `bumpVersion`，PluginManager 报错终止 release
7. **插件自主读配置**：`install` 等需要 npm/yarn/pnpm 命令的方法，由插件自行读取 `.colyn/settings.json` 获取 `systemCommands.npm` 配置
8. **工具链信息分离**：`devServerCommand` 只返回命令数组，不执行——执行职责留给 terminal session 插件
9. **结构化失败信息**：lint / build / publish 失败时抛出 `PluginCommandError`，`output` 字段携带命令的完整输出；所有 colyn 命令支持 `-v` / `--verbose` 选项，开启后在失败时展示详情
10. **gitignore 由调用方统一管理**：插件通过 `getRuntimeConfigFileName()` 声明运行时配置文件名，由 `PluginManager.ensureRuntimeConfigIgnored()` 统一负责将其加入 `.gitignore`，插件无需自行操作文件系统
11. **插件专属配置持久化**：部分插件（如 Xcode）需要构建参数等无法自动推断的配置。插件通过 `repairSettings(context)` 方法识别并交互式获取这些配置，由调用方（toolchain-resolver）保存到 `settings.json` 的 `toolchain.settings`（单项目）或 `projects[i].toolchain.settings`（Mono Repo）字段；后续命令（如 `build`）从 `currentSettings` 读取，无需重复询问

---

## 3. 内置插件实现

### 3.1 npm 插件

**文件**：`src/plugins/builtin/npm.ts`

| 扩展点 | 实现 |
|--------|------|
| `detect` | 检查 `package.json` 存在 |
| `portConfig` | `{ key: 'PORT', defaultPort: 3000 }` |
| `getRuntimeConfigFileName` | 返回 `'.env.local'`（由 colyn 确保加入 `.gitignore`） |
| `readRuntimeConfig` | 从 `{worktreePath}/.env.local` 解析 dotenv 格式 |
| `writeRuntimeConfig` | 写入 `{worktreePath}/.env.local`，保留注释 |
| `devServerCommand` | 读取 `package.json` 的 `scripts.dev`，返回 `[npmCmd, 'run', 'dev']` 或 null |
| `install` | 自行读取 `systemCommands.npm`（默认 `npm`），执行 `<npm> install` |
| `lint` | 检查 `package.json` 有无 `scripts.lint`，有则执行，无则静默跳过 |
| `build` | 检查 `package.json` 有无 `scripts.build`，有则执行，无则静默跳过 |
| `bumpVersion` | 更新 `package.json` 的 `version` 字段 |
| `publish` | 执行 `npm publish`（或 yarn/pnpm 对应 publish 命令） |
| `checkPublishable` | 检查 `private`、`name`、`version`，不满足则跳过 publish |

> **说明**：`install` 通过读取 `.colyn/settings.json`（从 worktreePath 向上查找）获取 `systemCommands.npm`，决定使用 npm / yarn / pnpm。

### 3.2 maven 插件

**文件**：`src/plugins/builtin/maven.ts`

| 扩展点 | 实现 |
|--------|------|
| `detect` | 检查 `pom.xml` 存在 |
| `portConfig` | `{ key: 'server.port', defaultPort: 8080 }` |
| `getRuntimeConfigFileName` | 返回 `'application-local.properties'`（由 colyn 确保加入 `.gitignore`） |
| `readRuntimeConfig` | 按顺序读取 `{worktreePath}/src/main/resources/application-local.properties` 和 `application-local.yaml`（本地 profile），均不存在则回退读取 `application.properties` / `application.yaml` |
| `writeRuntimeConfig` | 写入 `{worktreePath}/src/main/resources/application-local.properties`（本地 profile，不提交 git） |
| `devServerCommand` | 返回 `['mvn', 'spring-boot:run']` |
| `install` | 执行 `mvn install -DskipTests` |
| `lint` | 检查 `pom.xml` 是否配置 checkstyle，有则执行 `mvn checkstyle:check`，无则静默跳过 |
| `build` | 执行 `mvn package -DskipTests`，失败则静默跳过（如无 package 目标） |
| `bumpVersion` | 执行 `mvn versions:set -DnewVersion={version} -DgenerateBackupPoms=false` |
| `publish` | 执行 `mvn deploy -DskipTests` |
| `checkPublishable` | 检查 `pom.xml` 是否包含 `<distributionManagement>` |

> **本地 profile 说明**：Spring Boot 会在主配置（`application.properties`）之上叠加激活 profile 的配置文件。`application-local.properties` 通过 `spring.profiles.active=local` 激活，包含仅供本地开发使用的端口、数据库等配置，不应提交到 git 仓库。

### 3.3 gradle 插件

**文件**：`src/plugins/builtin/gradle.ts`

| 扩展点 | 实现 |
|--------|------|
| `detect` | 检查 `build.gradle` 或 `build.gradle.kts` 存在 |
| `portConfig` | `{ key: 'server.port', defaultPort: 8080 }` |
| `getRuntimeConfigFileName` | 返回 `'application-local.properties'`（由 colyn 确保加入 `.gitignore`） |
| `readRuntimeConfig` | 按顺序读取 `{worktreePath}/src/main/resources/application-local.properties` 和 `application-local.yaml`（本地 profile），均不存在则回退读取 `application.properties` / `application.yaml` |
| `writeRuntimeConfig` | 写入 `{worktreePath}/src/main/resources/application-local.properties`（本地 profile，不提交 git） |
| `devServerCommand` | 返回 `['./gradlew', 'bootRun']` |
| `install` | 执行 `./gradlew build -x test` |
| `lint` | 检查是否配置 checkstyle plugin，有则执行 `./gradlew checkstyleMain`，无则静默跳过 |
| `build` | 执行 `./gradlew build`，静默跳过如构建目标不存在 |
| `bumpVersion` | 修改 `build.gradle` / `build.gradle.kts` 中的 `version` 属性 |
| `publish` | 执行 `./gradlew publish` |
| `checkPublishable` | 检查是否配置 `maven-publish` 或 `publishing {}` |

### 3.4 pip 插件

**文件**：`src/plugins/builtin/pip.ts`

| 扩展点 | 实现 |
|--------|------|
| `detect` | 检查 `requirements.txt` 或 `pyproject.toml` 存在 |
| `portConfig` | `{ key: 'PORT', defaultPort: 8000 }` |
| `getRuntimeConfigFileName` | 返回 `'.env.local'`（由 colyn 确保加入 `.gitignore`） |
| `readRuntimeConfig` | 解析 `{worktreePath}/.env.local` 文件（dotenv 格式） |
| `writeRuntimeConfig` | 写入 `{worktreePath}/.env.local` 文件 |
| `devServerCommand` | 检查项目类型：Django → `['python', 'manage.py', 'runserver']`，其他 → null |
| `install` | 检测到 `pyproject.toml` 则执行 `poetry install`，否则执行 `pip install -r requirements.txt` |
| `lint` | 检测到 `ruff.toml` 或 `ruff` 配置则执行 `ruff check .`，否则尝试 `flake8`，均无则静默跳过 |
| `build` | 不实现（Python 通常无需构建步骤） |
| `bumpVersion` | 检测到 `pyproject.toml` 则更新其 `version` 字段，否则更新 `setup.py` 的 `version=` |
| `publish` | Poetry 项目执行 `poetry publish --build`，其他项目执行 `python -m build && twine upload dist/*` |
| `checkPublishable` | 检查是否存在可发布元数据（`[tool.poetry]` / `[project]` / `setup.py`） |

---

## 4. 插件管理器

**文件**：`src/plugins/manager.ts`

```typescript
class PluginManager {
  private readonly plugins: Map<string, ToolchainPlugin>;

  /**
   * 注册插件
   */
  register(plugin: ToolchainPlugin): void;

  /**
   * 获取所有已注册的插件列表（用于展示选择菜单）
   */
  getAllPlugins(): ToolchainPlugin[];

  /**
   * 自动检测并返回匹配的插件名称列表
   * 用于 toolchain-resolver.ts 内的按需发现流程
   */
  async detectPlugins(worktreePath: string): Promise<string[]>;

  /**
   * 确保激活插件的运行时配置文件被 .gitignore 忽略
   * 调用各插件的 getRuntimeConfigFileName()，幂等地将文件名加入 .gitignore
   * 在 colyn init 和 colyn repair 时调用（对每个 ToolchainContext 分别调用）
   */
  async ensureRuntimeConfigIgnored(worktreePath: string, activePluginNames: string[]): Promise<void>;

  /**
   * 运行指定工具链插件的 repairSettings，返回更新后的配置
   *
   * 与旧版不同：调用方（toolchain-resolver.saveRepairSettingsResult）负责保存结果。
   * 插件可自动检测或交互式询问必要配置，colyn 保存到 toolchain.settings 或 projects[i].toolchain.settings。
   *
   * @param worktreePath 子项目目录路径
   * @param toolchainName 工具链名称（插件标识符）
   * @param currentSettings 当前已保存的工具链专属配置
   * @param nonInteractive 是否非交互模式（默认 false）
   * @returns 更新后的配置，若插件未实现 repairSettings 则返回 null
   */
  async runRepairSettings(
    worktreePath: string,
    toolchainName: string,
    currentSettings: Record<string, unknown>,
    nonInteractive?: boolean
  ): Promise<Record<string, unknown> | null>;

  /**
   * 调用所有激活插件的 readRuntimeConfig（顺序尝试，取第一个非 null 的结果）
   * 传入 worktreePath，由各插件自行决定读取哪个文件
   */
  async readRuntimeConfig(
    worktreePath: string,
    activePluginNames: string[]
  ): Promise<Record<string, string> | null>;

  /**
   * 调用所有激活插件的 writeRuntimeConfig（全部执行）
   */
  async writeRuntimeConfig(
    worktreePath: string,
    config: Record<string, string>,
    activePluginNames: string[]
  ): Promise<void>;

  /**
   * 按激活顺序依次调用插件的 devServerCommand，返回第一个非 null 的结果
   * 供 terminal session 插件查询 dev server 启动命令
   */
  async getDevServerCommand(
    worktreePath: string,
    activePluginNames: string[]
  ): Promise<string[] | null>;  // 如 ['npm', 'run', 'dev']，无 dev server 则返回 null

  /**
   * 调用所有激活插件的 install（全部执行，任一失败则整体失败）
   *
   * @param verbose 为 true 时，捕获 PluginCommandError 后将 output 展示给用户
   */
  async runInstall(worktreePath: string, activePluginNames: string[], verbose?: boolean): Promise<void>;

  /**
   * 调用所有激活插件的 lint（任一插件抛出异常则整体失败）
   * 插件内部若无 lint 脚本应静默跳过，不抛异常
   *
   * @param verbose 为 true 时，捕获 PluginCommandError 后将 output 展示给用户
   */
  async runLint(worktreePath: string, activePluginNames: string[], verbose?: boolean): Promise<void>;

  /**
   * 调用所有激活插件的 build（任一插件抛出异常则整体失败）
   * 插件内部若无 build 脚本应静默跳过，不抛异常
   *
   * @param verbose 为 true 时，捕获 PluginCommandError 后将 output 展示给用户
   */
  async runBuild(worktreePath: string, activePluginNames: string[], verbose?: boolean): Promise<void>;

  /**
   * 调用所有激活插件的 bumpVersion
   *
   * 特殊规则：若所有激活插件均未实现 bumpVersion 方法，
   * 则 PluginManager 抛出错误，终止 release 流程。
   * 版本号更新是 release 的必要步骤，不允许无声跳过。
   */
  async runBumpVersion(
    worktreePath: string,
    version: string,
    activePluginNames: string[]
  ): Promise<void>;

  /**
   * 调用所有激活插件的 publish（任一插件抛出异常则整体失败）
   *
   * @param verbose 为 true 时，捕获 PluginCommandError 后将 output 展示给用户
   */
  async runPublish(worktreePath: string, activePluginNames: string[], verbose?: boolean): Promise<void>;

  /**
   * 检查激活插件是否满足发布条件
   * 任一插件返回 false，则该 context 视为不可发布
   */
  async runCheckPublishable(worktreePath: string, activePluginNames: string[]): Promise<boolean>;

  /**
   * 返回第一个激活插件中 portConfig() 不为 null 的配置
   * 按激活顺序依次查询，取第一个有效结果
   */
  getPortConfig(activePluginNames: string[]): PortConfig | null;
}
```

**全局单例**：

```typescript
// src/plugins/index.ts
import { PluginManager } from './manager.js';
import { NpmPlugin } from './builtin/npm.js';
import { MavenPlugin } from './builtin/maven.js';
import { GradlePlugin } from './builtin/gradle.js';
import { PipPlugin } from './builtin/pip.js';
import { XcodePlugin } from './builtin/xcode.js';

export const pluginManager = new PluginManager();
pluginManager.register(new NpmPlugin());
pluginManager.register(new MavenPlugin());
pluginManager.register(new GradlePlugin());
pluginManager.register(new PipPlugin());
pluginManager.register(new XcodePlugin());
```

---

## 5. 配置 Schema 变更（V4）

V4 版本将 `plugins[]` + `pluginSettings{}` 替换为结构化的 `toolchain` 和 `projects` 字段：

```typescript
// src/core/config-schema.ts

// 工具链配置（存储工具链类型 + 专属设置）
const ToolchainConfigSchema = z.object({
  type: z.string(),                                          // 工具链类型，如 'npm'、'xcode'
  settings: z.record(z.string(), z.unknown()).default({}),   // 工具链专属配置（repairSettings 写入）
});
export type ToolchainConfig = z.infer<typeof ToolchainConfigSchema>;

// Mono Repo 子项目
const SubProjectSchema = z.object({
  path: z.string(),                                          // 相对于根目录的路径，如 'frontend'
  toolchain: z.union([ToolchainConfigSchema, z.null()]),     // null 表示该子项目无工具链
});
export type SubProject = z.infer<typeof SubProjectSchema>;

// V4 Settings（工具链相关字段）
const SettingsSchemaBase = z.object({
  version: z.number(),
  lang: z.enum(['en', 'zh-CN']).optional(),
  systemCommands: SystemCommandsSchema.optional(),
  tmux: TmuxConfigSchema.optional(),

  // 单项目模式（toolchain !== undefined 时生效）
  // null 表示明确无工具链（避免重复提示）
  toolchain: z.union([ToolchainConfigSchema, z.null()]).optional(),

  // Mono Repo 模式（projects !== undefined 时生效）
  projects: z.array(SubProjectSchema).optional(),
});

export const CURRENT_CONFIG_VERSION = 4;
```

**存储示例 — 单项目模式**（`.colyn/settings.json`）：

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

**存储示例 — Mono Repo 模式**（`.colyn/settings.json`）：

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

**关于 Migration**：

V3 配置（含 `plugins`/`pluginSettings` 字段）在首次命令运行时通过 Zod transform 自动迁移到 V4（见第 7 节）。V4 的 `toolchain`/`projects` 均为**可选字段**，两者都未定义时触发「按需发现」策略（见第 6 节）。

---

## 6. 与现有命令的集成

所有命令通过 `src/core/toolchain-resolver.ts` 获取当前应操作的子项目列表（`ToolchainContext[]`），实现单项目/Mono Repo 的统一处理。

### 6.0 工具链解析器（toolchain-resolver.ts）

**核心类型**：

```typescript
export type ToolchainContext = {
  absolutePath: string;                   // 子项目的绝对路径（供 PluginManager 使用）
  subPath: string;                        // 相对于 worktree 根目录的相对路径（'.' 表示根目录）
  toolchainName: string;                  // 工具链名称，如 'npm'、'xcode'
  toolchainSettings: Record<string, unknown>; // 当前工具链专属配置
};
```

**两个核心函数**：

```typescript
// 用于 colyn init：强制重新检测，写入 settings.json，返回 contexts
export async function detectAndConfigureToolchains(
  projectRoot: string,
  mainDirPath: string,
  nonInteractive?: boolean
): Promise<ToolchainContext[]>

// 用于 add/merge/release/repair：读取配置 + 处理新发现子目录
export async function resolveToolchains(
  projectRoot: string,
  worktreePath: string,
  nonInteractive?: boolean
): Promise<ToolchainContext[]>
```

**resolveToolchains 决策树**：

```
1. settings.toolchain !== undefined → 单项目模式，返回单个 context
   （toolchain === null 表示明确无工具链，返回空数组）

2. settings.projects !== undefined → Mono Repo 模式
   a. 遍历配置的 projects，生成 contexts
   b. 扫描 worktreePath 中新出现的子目录（配置中未记录的）
   c. 对新目录：先自动检测，失败则 prompt 用户选择
   d. 将新发现写入 settings.projects 保存

3. 两者都未定义 → 触发「按需发现」
   a. 检测根目录是否有工具链 → 有则单项目模式
   b. 无则扫描一级子目录，自动检测 + 可能 prompt
   c. 有子目录工具链 → Mono Repo 模式；全无 → 保存 toolchain=null
```

### 6.1 `colyn init` 命令

**流程**：调用 `detectAndConfigureToolchains(projectRoot, mainDirPath)`，对每个返回的 context 执行：

```
1. detectAndConfigureToolchains：
   - 检测根目录是否有工具链（单项目）
   - 无则扫描一级子目录（Mono Repo）
   - 有子目录未被识别时，prompt 用户手动选择
   - 结果写入 settings.json（toolchain 或 projects）

2. 对每个 context：
   - pluginManager.ensureRuntimeConfigIgnored(ctx.absolutePath, [ctx.toolchainName])
   - pluginManager.runRepairSettings(ctx.absolutePath, ctx.toolchainName, ctx.toolchainSettings)
   - 若有返回 → saveRepairSettingsResult(projectRoot, ctx.subPath, newSettings)

3. 对每个 context：
   - pluginManager.getPortConfig([ctx.toolchainName])
   - 有端口 → 询问端口，pluginManager.writeRuntimeConfig(ctx.absolutePath, config, [ctx.toolchainName])
```

**交互示例（单项目，有匹配）**：
```
✔ 检测到单项目（npm）
? 请输入主分支端口号：(3000)
```

**交互示例（Mono Repo，部分无匹配）**：
```
✔ 检测到 Mono Repo 结构，发现 2 个子项目
ℹ 子目录 scripts 未被任何工具链识别
? 请为 scripts 选择工具链：
  ○ Node.js (npm)
  ○ Java (Maven)
  ○ (无工具链)
```

### 6.2 `colyn add` 命令

```typescript
const contexts = await resolveToolchains(projectRoot, paths.mainDir);

for (const ctx of contexts) {
  const worktreeSubPath = ctx.subPath === '.' ? worktreePath : path.join(worktreePath, ctx.subPath);
  // 从 mainDir 对应子目录读取 base port
  const mainConfig = await pluginManager.readRuntimeConfig(ctx.absolutePath, [ctx.toolchainName]);
  // Mono Repo 中每个子项目端口独立：basePort + worktreeId
  const portConfig = pluginManager.getPortConfig([ctx.toolchainName]);
  const newPort = basePort + id;  // basePort 从 mainConfig 读取
  await pluginManager.writeRuntimeConfig(worktreeSubPath, { ...mainConfig, [portKey]: newPort, WORKTREE: id }, [ctx.toolchainName]);
  await pluginManager.runInstall(worktreeSubPath, [ctx.toolchainName], verbose);
}
```

### 6.3 `colyn merge` 命令

```typescript
const contexts = await resolveToolchains(projectRoot, worktree.path);

for (const ctx of contexts) {
  await pluginManager.runLint(ctx.absolutePath, [ctx.toolchainName], verbose);
  await pluginManager.runBuild(ctx.absolutePath, [ctx.toolchainName], verbose);
}
```

### 6.4 `colyn release` 命令

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

### 6.5 `colyn repair` 命令

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

> **install 的两个触发场景**：
> - `colyn add`（worktree 目录）：为新 worktree 安装依赖，便于立即开始开发
> - `colyn release`（主分支目录）：release 前在主分支确保依赖最新，避免因依赖缺失导致 lint/build 失败；release 后执行 publish

---

## 7. 版本迁移方案

### 7.1 V3 → V4 迁移（自动 Zod transform）

V3 配置（含 `plugins`/`pluginSettings` 字段）**无需用户操作**，首次运行任意 colyn 命令时，`config-migration.ts` 的 Zod transform 链自动将其升级到 V4：

```typescript
// src/core/config-migration.ts

function migrateV3ToV4Recursive(settings: V3Settings): Settings {
  const result: Settings = {
    version: 4,
    lang: settings.lang,
    systemCommands: settings.systemCommands,
  };
  if (settings.tmux) result.tmux = settings.tmux;

  // 丢弃 plugins/pluginSettings
  // toolchain/projects 故意不设置（undefined），触发后续按需发现
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
  V3ToV4Schema,   // V3 → V4（新增）
  SettingsSchema, // 当前版本 V4
]);
```

### 7.2 迁移策略

- **丢弃旧字段**：`plugins` / `pluginSettings` 在迁移时被丢弃
- **按需重新发现**：`toolchain`/`projects` 故意设为 `undefined`，触发下次命令执行时的「按需发现」
- **用户无感知**：迁移后首次执行工具链感知命令（init/add/merge/release/repair）时，`resolveToolchains` 自动重新检测并保存结果

### 7.3 无法检测时

`resolveToolchains` 检测失败（所有目录均无工具链匹配）时：
- 保存 `toolchain: null` 到 settings.json
- 返回空数组（`[]`）
- 命令继续执行，跳过所有工具链相关步骤（不 install、不 lint、不 bumpVersion、不 publish）

---

## 8. 目录结构

```
src/
├── types/
│   ├── index.ts                  # 现有类型
│   └── plugin.ts                 # ToolchainPlugin 接口 + PortConfig + RepairSettingsContext
│
├── plugins/
│   ├── index.ts                  # 导出 pluginManager 单例（register 各插件）
│   ├── manager.ts                # PluginManager 类
│   └── builtin/
│       ├── npm.ts                # npm 插件
│       ├── maven.ts              # Maven 插件
│       ├── gradle.ts             # Gradle 插件
│       ├── pip.ts                # pip 插件
│       └── xcode.ts             # Xcode 插件
│
├── core/
│   ├── config-schema.ts          # V4 Schema（ToolchainConfig + SubProject）
│   ├── config-migration.ts       # Zod 迁移链（V0→V3, V1→V2, V2→V3, V3→V4）
│   ├── toolchain-resolver.ts     # 新增：按需发现 + resolveToolchains
│   └── ...（其他文件不变）
│
└── commands/
    ├── init.handlers.ts          # 调用 detectAndConfigureToolchains
    ├── add.ts                    # 调用 resolveToolchains，循环处理各 context
    ├── merge.ts                  # 调用 resolveToolchains，lint/build 循环
    ├── release.ts                # 传递 projectRoot，调用 executeRelease
    ├── release.helpers.ts        # 调用 resolveToolchains，install/lint/build/bump 循环
    └── repair.helpers.ts         # 调用 resolveToolchains，gitignore/repairSettings 循环
```

---

## 9. 实施历史

### 阶段一：核心框架（已完成）

1. 定义 `ToolchainPlugin` 接口（`src/types/plugin.ts`）
2. 实现 `PluginManager`（`src/plugins/manager.ts`）
3. 更新 `config-schema.ts`（V3 → V4 类型）
4. 实现 npm 插件（`src/plugins/builtin/npm.ts`）

### 阶段二：命令集成（已完成）

5. 集成到 `colyn init`（通过 toolchain-resolver 检测 + 配置写入）
6. 集成到 `colyn add`（配置复制 + 依赖安装，支持 Mono Repo）
7. 集成到 `colyn merge`（lint/build 预检）
8. 集成到 `colyn release`（lint + build + bumpVersion + publish）
9. 实现 V3→V4 Zod transform 迁移

### 阶段三：更多插件（已完成）

10. 实现 maven 插件
11. 实现 gradle 插件
12. 实现 pip 插件

### 阶段四：Mono Repo 支持（已完成）

13. 新建 `toolchain-resolver.ts`（按需发现策略）
14. 实现 Xcode 插件（含子目录检测、scheme 自动识别）
15. 所有命令改为循环处理 `ToolchainContext[]`

---

## 10. 关键设计决策记录

| 决策 | 选择 | 原因 |
|------|------|------|
| 插件粒度 | 按工具链（npm/maven/gradle/pip/xcode） | 工具链决定命令差异，不是编程语言 |
| 命令执行方式 | 插件直接执行（`Promise<void>`） | 灵活性高，支持复杂多步操作 |
| readRuntimeConfig/writeRuntimeConfig 参数 | 统一传 `worktreePath` | 调用方无需知道配置文件路径，由插件封装 |
| maven/gradle 本地配置文件 | `application-local.properties`（本地 profile） | 不提交 git；Spring Boot profile 机制覆盖主配置 |
| maven/gradle 配置格式 | 优先 `.properties`，同时支持 `.yaml` | properties 更简单，yaml 更强大，两种格式均流行 |
| .gitignore 更新 | 插件通过 `getRuntimeConfigFileName()` 声明文件名，`PluginManager.ensureRuntimeConfigIgnored()` 统一处理 | 关注点分离——插件只声明文件名，colyn 负责 gitignore 操作，幂等且可重复执行 |
| 插件专属配置（V4） | 通过 `repairSettings(context)` 交互获取，由 `saveRepairSettingsResult()` 保存到 `toolchain.settings` 或 `projects[i].toolchain.settings` | 与工具链配置内聚（而非 V3 的 pluginSettings 全局字典）；Mono Repo 每个子项目独立配置 |
| lint/build 脚本缺失 | 插件内部静默跳过 | 不是所有项目都配置 lint/build，不应视为错误 |
| bumpVersion 未实现 | PluginManager 报错终止 release | 版本号更新是 release 必要步骤，不允许无声跳过 |
| install 读取 npm 命令 | 插件自行读 `.colyn/settings.json` | 避免接口复杂化，插件内部自主获取配置 |
| devServerCommand | 返回 `string[]`，不执行 | 执行职责归 terminal session 插件，关注点分离 |
| install 触发时机 | `add`（worktree）+ `release`（主分支） | 见第 6 节说明 |
| 无法检测工具链 | prompt 用户选择（或 nonInteractive 模式下跳过） | 比报错更友好，覆盖特殊场景 |
| V4 配置结构 | `toolchain: {type, settings}`（单项目）/ `projects: [{path, toolchain}]`（Mono Repo） | 将工具链类型与专属配置内聚，支持子项目独立配置 |
| V3→V4 迁移策略 | Zod transform 丢弃 plugins/pluginSettings，toolchain/projects 留 undefined | undefined 触发按需发现，用户无感知，自动重新检测 |
| Mono Repo 子项目发现 | 「按需发现」：有新子目录时在命令执行时就地检测 + 保存 | 避免用户手动维护配置，命令执行时自动更新 |
| Mono Repo 端口 | 每个子项目独立：从主分支 base port + worktree ID | 端口不冲突，符合 colyn 多 worktree 开发模式 |
| runRepairSettings 返回值（V4） | `Promise<Record<string,unknown> \| null>`（原为 void） | 调用方（toolchain-resolver）负责保存，解耦持久化逻辑 |
