# 工具链插件设计文档

**状态**：设计阶段
**创建时间**：2026-02-21
**相关需求**：`docs/requirements/requirement-plugin-system.md`

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
  /** 项目根目录（.colyn 的父目录） */
  projectRoot: string;
  /** 主分支目录路径（包含项目代码文件） */
  worktreePath: string;
  /** 当前已保存的本插件专属配置（来自 settings.json 的 pluginSettings[name]） */
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
   * 结果由 colyn 保存到 `.colyn/settings.json` 的 `pluginSettings[name]` 字段。
   *
   * **典型用途**：Xcode 插件通过此方法询问用户 scheme 和 destination，
   * 供后续 `build` 命令使用。
   *
   * @param context 包含 projectRoot、worktreePath、当前已保存配置、非交互模式标志
   * @returns 插件专属配置键值对（将完整覆盖 pluginSettings[name]）
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
}
```

### 2.2 设计原则

1. **直接执行**：操作类方法（`install`、`lint`、`build`、`bumpVersion`）由插件自行执行，失败时抛出异常，colyn 捕获后显示错误并终止当前命令
2. **可选扩展点**：所有方法均为可选，插件只需实现关心的部分
3. **路径由插件决定**：`readRuntimeConfig` 和 `writeRuntimeConfig` 均接收 `worktreePath`，由插件自行推断应读写哪个配置文件（npm 插件用 `.env.local`，maven 插件用 `application-local.properties`）
4. **阶段失败语义**：lint 失败、build 失败均会阻止后续步骤
5. **缺失静默跳过（lint/build）**：若工具链没有对应脚本，插件内部静默跳过，不视为失败
6. **缺失报错（bumpVersion）**：已激活插件若未实现 `bumpVersion`，PluginManager 报错终止 release
7. **插件自主读配置**：`install` 等需要 npm/yarn/pnpm 命令的方法，由插件自行读取 `.colyn/settings.json` 获取 `systemCommands.npm` 配置
8. **工具链信息分离**：`devServerCommand` 只返回命令数组，不执行——执行职责留给 terminal session 插件
9. **结构化失败信息**：lint / build 失败时抛出 `PluginCommandError`，`output` 字段携带命令的完整输出；所有 colyn 命令支持 `-v` / `--verbose` 选项，开启后在失败时展示详情
10. **gitignore 由调用方统一管理**：插件通过 `getRuntimeConfigFileName()` 声明运行时配置文件名，由 `PluginManager.ensureRuntimeConfigIgnored()` 统一负责将其加入 `.gitignore`，插件无需自行操作文件系统
11. **插件专属配置持久化**：部分插件（如 Xcode）需要构建参数等无法自动推断的配置。插件通过 `repairSettings(context)` 方法识别并交互式获取这些配置，由 `PluginManager.runRepairSettings()` 统一保存到 `settings.json` 的 `pluginSettings[name]` 字段；后续命令（如 `build`）从 `currentSettings` 读取，无需重复询问

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

---

## 4. 插件管理器

**文件**：`src/plugins/manager.ts`

```typescript
class PluginManager {
  private readonly plugins: ToolchainPlugin[];

  constructor(plugins: ToolchainPlugin[]) {
    this.plugins = plugins;
  }

  /**
   * 检测项目匹配哪些工具链（用于 colyn init）
   */
  async detectAll(worktreePath: string): Promise<ToolchainPlugin[]>;

  /**
   * 从配置中加载已激活的插件列表
   * 配置来源：.colyn/settings.json 的 plugins 字段
   */
  getActive(enabledPluginNames: string[]): ToolchainPlugin[];

  /**
   * 确保激活插件的运行时配置文件被 .gitignore 忽略
   * 调用各插件的 getRuntimeConfigFileName()，幂等地将文件名加入 .gitignore
   * 在 colyn init 和 colyn repair 时调用
   */
  async ensureRuntimeConfigIgnored(worktreePath: string, activePlugins: ToolchainPlugin[]): Promise<void>;

  /**
   * 运行所有激活插件的 repairSettings，将结果保存到 settings.json
   * 各插件可自动检测或交互式询问必要配置，结果保存到 pluginSettings[name]
   * 在 colyn init 和 colyn repair 时调用
   */
  async runRepairSettings(
    projectRoot: string,
    worktreePath: string,
    activePluginNames: string[],
    nonInteractive?: boolean
  ): Promise<void>;

  /**
   * 调用所有激活插件的 readRuntimeConfig（顺序尝试，取第一个非 null 的结果）
   * 传入 worktreePath，由各插件自行决定读取哪个文件
   */
  async readRuntimeConfig(
    worktreePath: string,
    activePlugins: ToolchainPlugin[]
  ): Promise<Record<string, string> | null>;

  /**
   * 调用所有激活插件的 writeRuntimeConfig（全部执行）
   */
  async writeRuntimeConfig(
    worktreePath: string,
    config: Record<string, string>,
    activePlugins: ToolchainPlugin[]
  ): Promise<void>;

  /**
   * 按激活顺序依次调用插件的 devServerCommand，返回第一个非 null 的结果
   * 供 terminal session 插件查询 dev server 启动命令
   */
  async getDevServerCommand(
    worktreePath: string,
    activePlugins: ToolchainPlugin[]
  ): Promise<string[] | null>;  // 如 ['npm', 'run', 'dev']，无 dev server 则返回 null

  /**
   * 调用所有激活插件的 install（全部执行，任一失败则整体失败）
   *
   * @param verbose 为 true 时，捕获 PluginCommandError 后将 output 展示给用户
   */
  async runInstall(worktreePath: string, activePlugins: ToolchainPlugin[], verbose?: boolean): Promise<void>;

  /**
   * 调用所有激活插件的 lint（任一插件抛出异常则整体失败）
   * 插件内部若无 lint 脚本应静默跳过，不抛异常
   *
   * @param verbose 为 true 时，捕获 PluginCommandError 后将 output 展示给用户
   */
  async runLint(worktreePath: string, activePlugins: ToolchainPlugin[], verbose?: boolean): Promise<void>;

  /**
   * 调用所有激活插件的 build（任一插件抛出异常则整体失败）
   * 插件内部若无 build 脚本应静默跳过，不抛异常
   *
   * @param verbose 为 true 时，捕获 PluginCommandError 后将 output 展示给用户
   */
  async runBuild(worktreePath: string, activePlugins: ToolchainPlugin[], verbose?: boolean): Promise<void>;

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
    activePlugins: ToolchainPlugin[]
  ): Promise<void>;

  /**
   * 返回第一个激活插件中 portConfig() 不为 null 的配置
   * 按激活顺序依次查询，取第一个有效结果
   */
  getPortConfig(activePlugins: ToolchainPlugin[]): PortConfig | null;
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

export const pluginManager = new PluginManager([
  NpmPlugin,
  MavenPlugin,
  GradlePlugin,
  PipPlugin,
]);
```

---

## 5. 配置 Schema 变更

在现有的 `Settings` Schema 中添加可选的 `plugins` 字段：

```typescript
// src/core/config-schema.ts 增加

const SettingsSchemaBase = z.object({
  version: z.number(),
  lang: z.enum(['en', 'zh-CN']).optional(),
  systemCommands: SystemCommandsSchema.optional(),
  tmux: TmuxConfigSchema.optional(),

  // 新增：工具链插件配置
  plugins: z.array(z.string()).optional(),
  //        ↑ 插件名列表，如 ['npm']、['maven', 'pip']

  // 新增：插件专属配置（由 repairSettings 写入）
  pluginSettings: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  //               ↑ { pluginName: { key: value, ... } }
});
```

**存储示例**（`.colyn/settings.json`）：

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

**关于 Migration**：

`plugins` 和 `pluginSettings` 都是**可选字段**，旧配置中不存在时视为 `undefined`，不需要创建 Migration。旧项目的迁移逻辑通过运行时检测处理（见第 7 节）。

---

## 6. 与现有命令的集成

### 6.1 `colyn init` 命令

**新增步骤**（在现有初始化流程中插入）：

```
步骤 N：工具链检测与选择
  1. 调用 pluginManager.detectAll(worktreePath) 扫描所有插件
  2. 如果有匹配插件 → 交互式展示，让用户确认
  3. 如果没有匹配插件 → 展示所有可用插件，让用户手动选择
  4. 将选择结果写入 .colyn/settings.json 的 plugins 字段

步骤 N+1：端口配置（条件执行）
  调用 pluginManager.getPortConfig(activePlugins)
  如果返回非 null → 交互式询问用户主分支端口号（默认值取自 portConfig.defaultPort）
  如果返回 null  → 跳过（该工具链不需要端口）

步骤 N+2：确保运行时配置文件被 .gitignore 忽略
  调用 pluginManager.ensureRuntimeConfigIgnored(worktreePath, activePlugins)
  各插件通过 getRuntimeConfigFileName() 返回文件名，colyn 统一负责将其加入 .gitignore

步骤 N+3：修复插件专属项目配置
  调用 pluginManager.runRepairSettings(projectRoot, worktreePath, activePlugins)
  各插件通过 repairSettings() 自动检测或交互式询问必要配置项（如 Xcode 的 scheme/destination）
  结果保存到 settings.json 的 pluginSettings[pluginName] 字段

步骤 N+4：写入配置文件
  调用 pluginManager.writeRuntimeConfig() 让各插件写入各自格式的配置文件
```

**交互示例（有匹配，需要端口）**：
```
✔ 检测到工具链：

? 请确认要启用的工具链插件：（空格选择，回车确认）
  ◉ Node.js (npm)  [已检测到 package.json]

✔ 已启用插件: npm

? 请输入主分支端口号：(3000)
```

**交互示例（无匹配）**：
```
⚠ 未能自动识别工具链

? 请选择项目使用的工具链：
  ○ Node.js (npm)
  ○ Java (Maven)
  ○ Java (Gradle)
  ○ Python (pip/poetry)
  ○ 不使用工具链
```

### 6.2 `colyn add` 命令

**新增步骤**（在创建 worktree 后插入）：

```
步骤 N：复制环境配置
  原逻辑（复制 .env.local）→ 改为调用 pluginManager.writeRuntimeConfig()
  各插件写入各自格式的配置文件，包含 PORT 和 WORKTREE 值

步骤 N+1：安装依赖（可选）
  调用 pluginManager.runInstall(worktreePath, activePlugins)
  各插件自行执行安装命令，显示进度
```

**输出示例**：
```
✔ 创建 worktree: task-1
✔ 复制环境配置 → .env.local (PORT=10001)
✔ 安装依赖
  → npm install ... 完成
```

### 6.3 `colyn merge` 命令

**新增选项**：`-v` / `--verbose`：失败时展示命令完整输出

**新增步骤**（在 merge 前插入）：

```
步骤 0（预检）：代码质量检查
  调用 pluginManager.runLint(worktreePath, activePlugins, verbose)
  任一插件 lint 失败 → 输出错误，终止 merge
```

**输出示例**：
```
✔ 检查代码质量...
  → npm run lint ... 完成

✔ 合并分支 feature/auth → main
```

**失败示例（默认）**：
```
✖ 代码质量检查失败（npm lint）
  使用 -v 查看详情：colyn merge -v
```

**失败示例（-v）**：
```
✖ 代码质量检查失败（npm lint）

  src/foo.ts:10:5 error  'x' is not defined
  ...（完整 lint 输出）

  请修复后重试：colyn merge
```

### 6.4 `colyn release` 命令

**新增选项**：`-v` / `--verbose`：lint / build 失败时展示命令完整输出

**在现有流程中插入 install → lint → build → bumpVersion**：

```
原有步骤：
  1. 检查依赖（checkDependenciesInstalled）
  2. 执行更新（executeUpdate）
  3. 执行发布（executeRelease）

新增步骤（在步骤 1 之前，在主分支目录下执行）：
  0a. 安装依赖（pluginManager.runInstall，worktreePath = mainDir）
      确保主分支依赖为最新状态，再执行后续步骤
  0b. 代码质量检查（pluginManager.runLint，worktreePath = mainDir，verbose）
  0c. 构建项目（pluginManager.runBuild，worktreePath = mainDir，verbose）

新增步骤（在步骤 3 中）：
  3a. 更新版本号（pluginManager.runBumpVersion，worktreePath = mainDir）
```

> **install 的两个触发场景**：
> - `colyn add`（worktree 目录）：为新 worktree 安装依赖，便于立即开始开发
> - `colyn release`（主分支目录）：release 前在主分支确保依赖最新，避免因依赖缺失导致 lint/build 失败

---

## 7. 旧项目迁移方案

### 7.1 触发时机

**任意 colyn 命令首次执行时**自动检测并迁移：

```typescript
// 在命令执行前的通用检查中
async function ensurePluginsConfigured(configDir: string, worktreePath: string) {
  const settings = await loadProjectConfig(worktreePath);

  // 检查是否已有 plugins 配置
  if (settings?.plugins !== undefined) return;

  // 旧项目：自动检测并迁移
  await autoMigratePlugins(configDir, worktreePath);
}
```

### 7.2 迁移逻辑

```
1. 运行 pluginManager.detectAll(worktreePath) 检测工具链
2. 将检测结果写入 .colyn/settings.json 的 plugins 字段
3. 显示迁移提示（非阻塞）：
   "ℹ 已自动配置工具链插件：npm
    如需修改，运行 colyn config 或编辑 .colyn/settings.json"
```

### 7.3 无法检测时

如果旧项目中工具链检测失败（无任何匹配），写入空数组：

```json
{ "plugins": [] }
```

功能降级：跳过所有工具链相关步骤（不 install、不 lint、不 bumpVersion）。

---

## 8. 目录结构

```
src/
├── types/
│   ├── index.ts           # 现有类型
│   └── plugin.ts          # 新增：ToolchainPlugin 接口 + PortConfig
│
├── plugins/
│   ├── index.ts           # 导出 pluginManager 单例
│   ├── manager.ts         # PluginManager 类
│   └── builtin/
│       ├── npm.ts         # npm 插件
│       ├── maven.ts       # Maven 插件
│       ├── gradle.ts      # Gradle 插件
│       └── pip.ts         # pip 插件
│
├── core/
│   ├── config-schema.ts   # 添加 plugins 字段到 Settings Schema
│   └── ...（其他文件不变）
│
└── commands/
    ├── init.ts            # 集成工具链检测
    ├── add.ts             # 集成 install
    ├── merge.ts           # 集成 lint 预检
    └── release.ts         # 集成 lint + build + bumpVersion
```

---

## 9. 实施计划

### 阶段一：核心框架

1. 定义 `ToolchainPlugin` 接口（`src/types/plugin.ts`）
2. 实现 `PluginManager`（`src/plugins/manager.ts`）
3. 更新 `config-schema.ts` 添加 `plugins` 字段
4. 实现 npm 插件（`src/plugins/builtin/npm.ts`，迁移现有逻辑）

### 阶段二：命令集成

5. 集成到 `colyn init`（检测 + 用户选择 + 配置写入）
6. 集成到 `colyn add`（配置复制 + 依赖安装）
7. 集成到 `colyn merge`（lint 预检）
8. 集成到 `colyn release`（lint + build + bumpVersion）
9. 实现旧项目自动迁移逻辑

### 阶段三：更多插件

10. 实现 maven 插件
11. 实现 gradle 插件
12. 实现 pip 插件

---

## 10. 关键设计决策记录

| 决策 | 选择 | 原因 |
|------|------|------|
| 插件粒度 | 按工具链（npm/maven/gradle/pip） | 工具链决定命令差异，不是编程语言 |
| 命令执行方式 | 插件直接执行（`Promise<void>`） | 灵活性高，支持复杂多步操作 |
| readRuntimeConfig/writeRuntimeConfig 参数 | 统一传 `worktreePath` | 调用方无需知道配置文件路径，由插件封装 |
| maven/gradle 本地配置文件 | `application-local.properties`（本地 profile） | 不提交 git；Spring Boot profile 机制覆盖主配置 |
| maven/gradle 配置格式 | 优先 `.properties`，同时支持 `.yaml` | properties 更简单，yaml 更强大，两种格式均流行 |
| .gitignore 更新 | 插件通过 `getRuntimeConfigFileName()` 声明文件名，`PluginManager.ensureRuntimeConfigIgnored()` 统一处理 | 关注点分离——插件只声明文件名，colyn 负责 gitignore 操作，幂等且可重复执行 |
| 插件专属配置 | 通过 `repairSettings(context)` + `pluginSettings` 字段机制，在 init/repair 时交互获取并持久化 | 解决 xcodebuild 等需要用户决策的参数问题，避免每次 build 都重新询问 |
| lint/build 脚本缺失 | 插件内部静默跳过 | 不是所有项目都配置 lint/build，不应视为错误 |
| bumpVersion 未实现 | PluginManager 报错终止 release | 版本号更新是 release 必要步骤，不允许无声跳过 |
| install 读取 npm 命令 | 插件自行读 `.colyn/settings.json` | 避免接口复杂化，插件内部自主获取配置 |
| devServerCommand | 返回 `string[]`，不执行 | 执行职责归 terminal session 插件，关注点分离 |
| install 触发时机 | `add`（worktree）+ `release`（主分支） | 见第 6 节说明 |
| 无法检测工具链 | 展示所有选项让用户选择 | 比报错更友好，覆盖特殊场景 |
| plugins 配置存储 | `settings.json` 的 `plugins` 可选字段 | 不需要 Migration，向后兼容 |
| 旧项目迁移 | 首次运行任意命令自动检测并迁移 | 零摩擦升级体验 |
| 多工具链支持 | 不支持（超出范围） | 降低复杂度，聚焦核心场景 |
