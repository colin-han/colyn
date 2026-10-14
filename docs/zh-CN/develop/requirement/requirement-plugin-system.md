# Colyn 插件系统需求文档

**创建时间**：2026-02-14
**状态**：需求分析阶段
**负责人**：待定

---

## 1. 需求概述

### 1.1 背景

当前 colyn 的设计主要针对 Node.js web 项目，核心功能包括：
- 端口分配（为每个 worktree 分配不同端口）
- 环境变量管理（通过 `.env.local` 文件）
- 开发服务器配置

这种设计对于 Java、Python、Go 等其他开发环境不够友好，因为：
- Java 项目通常使用 `application.properties` 或 `application.yml`
- Python 项目可能使用虚拟环境和 `.env` 文件
- 某些项目（库项目、CLI 工具）可能不需要端口分配
- 不同环境有不同的依赖管理工具和构建流程

### 1.2 目标

设计并实现一个插件系统，使 colyn 能够：
1. **支持多种开发环境**：Node.js、Java、Python、Go 等
2. **易于扩展**：开发者可以轻松创建新的环境插件
3. **向后兼容**：现有 Node.js 项目平滑迁移
4. **零配置体验**：自动检测并推荐合适的插件

### 1.3 目标用户

- **Node.js 开发者**：现有用户，需要无缝迁移
- **Java 开发者**：使用 Maven/Gradle + Spring Boot
- **Python 开发者**：使用 pip/poetry + 虚拟环境
- **全栈开发者**：同时开发前端和后端（需要多插件支持）
- **插件开发者**：为 colyn 创建新环境支持的开发者

---

## 2. 核心需求

### 2.1 插件覆盖范围

插件系统需要解决以下开发环境差异问题：

#### 2.1.1 环境变量管理
- **问题**：不同环境使用不同的配置文件格式
  - Node.js: `.env.local`
  - Java: `application.properties`, `application.yml`
  - Python: `.env`, `.ini`
- **需求**：插件能够读写对应环境的原生配置格式

#### 2.1.2 端口分配策略
- **问题**：某些环境可能不需要端口（库项目、批处理、CLI 工具）
- **需求**：由插件决定是否需要端口分配以及如何配置

#### 2.1.3 依赖管理集成
- **问题**：不同环境使用不同的包管理工具
  - Node.js: npm/yarn/pnpm
  - Java: Maven/Gradle
  - Python: pip/poetry/conda
- **需求**：插件能够在创建 worktree 时自动安装依赖

#### 2.1.4 构建和启动命令
- **问题**：不同环境的开发服务器启动方式不同
  - Node.js: `npm run dev`
  - Java: `mvn spring-boot:run`
  - Python: `python manage.py runserver`
- **需求**：插件能够配置启动命令并集成到工作流中

### 2.2 多插件支持

**需求**：支持多插件模式

一个项目可以同时启用多个插件，例如：
- 全栈项目：同时启用 Node.js 插件（前端）和 Java 插件（后端）
- Monorepo 项目：不同子项目使用不同插件

**说明**：
- 环境检测时，所有返回 `true` 的插件都会被启用
- 用户可以在交互式选择中调整插件列表

### 2.3 插件推断方式

**需求**：init 命令使用交互式选择

工作流程：
1. `colyn init` 执行时，所有插件的环境检测扩展点被调用
2. 收集所有返回 `true` 的插件（匹配当前环境）
3. 显示匹配的插件列表，让用户选择启用哪些
4. 将选择保存到配置文件

示例交互：
```
✔ 检测到以下开发环境：

  ☑ Node.js (检测到 package.json)
  ☑ Python (检测到 requirements.txt)

? 请选择要启用的插件：(使用空格选择，回车确认)
  ◉ Node.js Web Plugin
  ◉ Python Plugin
```

### 2.4 成功标准

**主要成功标准：易于扩展**

- 开发者可以轻松创建新的环境插件，无需修改 colyn 核心代码
- 插件开发有清晰的 TypeScript 接口定义
- 提供完善的插件开发文档和示例

**其他成功标准：**
- 零配置体验：用户在不同类型项目中运行 init，无需手动配置即可工作
- 向后兼容：现有 Node.js 项目无需迁移即可继续使用（一次性自动迁移）
- 覆盖主流环境：至少支持 3-5 种常见开发环境

---

## 3. 扩展点设计

插件系统采用**基于扩展点**（Extension Points）而非生命周期钩子的设计理念。

### 3.1 核心扩展点列表

| 扩展点 | 描述 | 返回类型 | 执行策略 |
|--------|------|----------|----------|
| `detectEnvironment` | 检测项目是否匹配当前插件环境 | `boolean` | 全部执行 |
| `readConfig` | 读取环境配置文件 | `Record<string, string>` | 顺序尝试 |
| `writeConfig` | 写入环境配置文件 | `void` | 全部执行 |
| `portAllocation` | 决定是否需要端口以及如何分配 | `PortConfig \| null` | 全部执行 |
| `versionUpdate` | 更新项目版本号（release 命令） | `void` | 全部执行 |
| `installDependencies` | 安装项目依赖（add 命令） | `void` | 全部执行 |
| `startDevServer` | 启动开发服务器配置 | `ServerConfig` | 全部执行 |

### 3.2 扩展点详细说明

#### 3.2.1 detectEnvironment - 环境检测

**用途**：检测当前项目是否匹配该插件的环境类型

**签名**：
```typescript
detectEnvironment(projectPath: string): boolean
```

**返回**：
- `true`: 当前项目匹配此插件环境
- `false`: 不匹配

**执行策略**：
- 所有插件的此扩展点都会被调用
- 返回 `true` 的插件会在交互式选择中展示给用户
- 用户可以选择启用所有匹配的插件（支持多插件模式）

**示例实现**：
```typescript
// Node.js 插件
detectEnvironment(projectPath: string): boolean {
  const packageJson = path.join(projectPath, 'package.json');
  return fs.existsSync(packageJson);
}

// Java 插件
detectEnvironment(projectPath: string): boolean {
  const pomXml = path.join(projectPath, 'pom.xml');
  const buildGradle = path.join(projectPath, 'build.gradle');
  return fs.existsSync(pomXml) || fs.existsSync(buildGradle);
}
```

#### 3.2.2 readConfig - 读取配置

**用途**：从环境配置文件中读取键值对

**签名**：
```typescript
readConfig(configPath: string): Record<string, string> | null
```

**返回**：
- 成功：返回配置键值对
- 失败：返回 `null`（配置文件不存在或格式不支持）

**执行策略**：
- 按插件注册顺序依次尝试
- 第一个成功返回（非 `null`）的结果生效
- 适用于单一配置文件场景

**统一键值对说明**：
- 所有插件都返回 `Record<string, string>` 格式
- colyn 核心关注的标准键：
  - `PORT`: 开发服务器端口
  - `WORKTREE`: worktree 标识（main 或数字 ID）
- 插件可以读取其他自定义键，但 colyn 核心不处理

**示例实现**：
```typescript
// Node.js 插件
readConfig(configPath: string): Record<string, string> | null {
  if (!fs.existsSync(configPath)) return null;
  return dotenv.parse(fs.readFileSync(configPath));
}

// Java 插件
readConfig(configPath: string): Record<string, string> | null {
  if (!fs.existsSync(configPath)) return null;
  const properties = propertiesReader(configPath);
  return properties.getAllProperties();
}
```

#### 3.2.3 writeConfig - 写入配置

**用途**：将键值对写入环境配置文件

**签名**：
```typescript
writeConfig(configPath: string, config: Record<string, string>): void
```

**执行策略**：
- 所有已启用插件的此扩展点都会被调用
- 每个插件写入自己的配置文件格式

**示例实现**：
```typescript
// Node.js 插件
writeConfig(configPath: string, config: Record<string, string>): void {
  const content = Object.entries(config)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  fs.writeFileSync(configPath, content);
}

// Java 插件
writeConfig(configPath: string, config: Record<string, string>): void {
  const properties = new Properties();
  Object.entries(config).forEach(([key, value]) => {
    properties.set(key, value);
  });
  properties.store(configPath);
}
```

#### 3.2.4 portAllocation - 端口分配

**用途**：决定是否需要端口以及如何分配

**签名**：
```typescript
interface PortConfig {
  enabled: boolean;        // 是否启用端口分配
  key: string;            // 配置文件中的键名（如 "PORT", "server.port"）
  defaultPort?: number;   // 建议的默认端口
}

portAllocation(): PortConfig | null
```

**返回**：
- 需要端口：返回 `PortConfig` 对象
- 不需要端口：返回 `null`（如库项目、CLI 工具）

**执行策略**：
- 所有已启用插件的此扩展点都会被调用
- colyn 为每个返回非 `null` 的插件分配端口

**示例实现**：
```typescript
// Node.js Web 插件
portAllocation(): PortConfig {
  return {
    enabled: true,
    key: 'PORT',
    defaultPort: 3000
  };
}

// Node.js Library 插件（库项目）
portAllocation(): PortConfig | null {
  return null; // 库项目不需要端口
}

// Java Spring Boot 插件
portAllocation(): PortConfig {
  return {
    enabled: true,
    key: 'server.port',
    defaultPort: 8080
  };
}
```

#### 3.2.5 versionUpdate - 版本更新

**用途**：在 `colyn release` 命令中更新项目版本号

**签名**：
```typescript
versionUpdate(projectPath: string, newVersion: string): void
```

**执行策略**：
- 所有已启用插件的此扩展点都会被调用
- 每个插件更新自己环境的版本文件

**示例实现**：
```typescript
// Node.js 插件
versionUpdate(projectPath: string, newVersion: string): void {
  const pkgPath = path.join(projectPath, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
}

// Java Maven 插件
versionUpdate(projectPath: string, newVersion: string): void {
  const pomPath = path.join(projectPath, 'pom.xml');
  // 使用 XML 解析器更新 <version> 标签
  updatePomVersion(pomPath, newVersion);
}
```

#### 3.2.6 installDependencies - 依赖安装

**用途**：在创建 worktree 后自动安装依赖

**签名**：
```typescript
interface DependencyInstallConfig {
  enabled: boolean;           // 是否启用自动安装
  command: string;           // 安装命令
  displayName: string;       // 显示名称（如 "npm install"）
}

installDependencies(worktreePath: string): DependencyInstallConfig | null
```

**返回**：
- 需要安装：返回 `DependencyInstallConfig` 对象
- 不需要安装：返回 `null`

**执行策略**：
- 所有已启用插件的此扩展点都会被调用
- colyn 按顺序执行所有返回非 `null` 的安装命令

**示例实现**：
```typescript
// Node.js 插件
installDependencies(worktreePath: string): DependencyInstallConfig {
  return {
    enabled: true,
    command: 'npm install',
    displayName: 'Installing Node.js dependencies'
  };
}

// Python 插件
installDependencies(worktreePath: string): DependencyInstallConfig {
  return {
    enabled: true,
    command: 'pip install -r requirements.txt',
    displayName: 'Installing Python dependencies'
  };
}
```

#### 3.2.7 startDevServer - 启动开发服务器

**用途**：提供启动开发服务器的配置

**签名**：
```typescript
interface ServerConfig {
  command: string;           // 启动命令
  cwd?: string;             // 工作目录（相对于 worktree 路径）
  env?: Record<string, string>;  // 额外的环境变量
  displayName?: string;     // 显示名称
}

startDevServer(worktreePath: string): ServerConfig | null
```

**返回**：
- 有开发服务器：返回 `ServerConfig` 对象
- 无开发服务器：返回 `null`（如库项目）

**执行策略**：
- 所有已启用插件的此扩展点都会被调用
- colyn 收集所有配置，交由其他机制执行

**示例实现**：
```typescript
// Node.js 插件
startDevServer(worktreePath: string): ServerConfig {
  return {
    command: 'npm run dev',
    displayName: 'Node.js Dev Server'
  };
}

// Java Spring Boot 插件
startDevServer(worktreePath: string): ServerConfig {
  return {
    command: 'mvn spring-boot:run',
    displayName: 'Spring Boot Server'
  };
}
```

### 3.3 扩展点执行策略总结

| 扩展点 | 策略 | 说明 |
|--------|------|------|
| `detectEnvironment` | 全部执行 | 收集所有匹配的插件 |
| `readConfig` | 顺序尝试 | 第一个成功的生效 |
| `writeConfig` | 全部执行 | 每个插件写入自己的配置文件 |
| `portAllocation` | 全部执行 | 为需要端口的插件分配 |
| `versionUpdate` | 全部执行 | 每个插件更新自己的版本文件 |
| `installDependencies` | 全部执行 | 按顺序执行所有安装命令 |
| `startDevServer` | 全部执行 | 收集所有服务器配置 |

---

## 4. 插件架构

### 4.1 插件组织和分发

**采用混合模式**：

1. **内置插件**（核心插件）：
   - 随 colyn 一起发布，打包在核心代码中
   - 包括：Node.js、Java、Python 等主流环境
   - 位置：`src/plugins/builtin/`

2. **社区插件**（扩展插件）：
   - 作为独立的 npm 包发布
   - 命名规范：`@colyn/plugin-{name}` 或 `colyn-plugin-{name}`
   - 用户按需安装：`npm install -g @colyn/plugin-rust`

3. **本地插件**（可选，未来扩展）：
   - 用户可以在项目或全局目录下放置自定义插件
   - 适用于企业内部或个人定制需求

### 4.2 插件声明方式

**采用 TypeScript 接口**：

```typescript
// src/types/plugin.ts
export interface Plugin {
  // 插件元数据
  name: string;
  version: string;
  description: string;

  // 扩展点实现（可选）
  detectEnvironment?(projectPath: string): boolean;
  readConfig?(configPath: string): Record<string, string> | null;
  writeConfig?(configPath: string, config: Record<string, string>): void;
  portAllocation?(): PortConfig | null;
  versionUpdate?(projectPath: string, newVersion: string): void;
  installDependencies?(worktreePath: string): DependencyInstallConfig | null;
  startDevServer?(worktreePath: string): ServerConfig | null;
}
```

**插件实现示例**：

```typescript
// src/plugins/builtin/nodejs.ts
export const NodeJsPlugin: Plugin = {
  name: 'nodejs',
  version: '1.0.0',
  description: 'Node.js Web Project Support',

  detectEnvironment(projectPath: string): boolean {
    const packageJson = path.join(projectPath, 'package.json');
    return fs.existsSync(packageJson);
  },

  readConfig(configPath: string): Record<string, string> | null {
    if (!fs.existsSync(configPath)) return null;
    return dotenv.parse(fs.readFileSync(configPath));
  },

  writeConfig(configPath: string, config: Record<string, string>): void {
    const content = Object.entries(config)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    fs.writeFileSync(configPath, content);
  },

  portAllocation(): PortConfig {
    return {
      enabled: true,
      key: 'PORT',
      defaultPort: 3000
    };
  },

  // ... 其他扩展点实现
};
```

### 4.3 插件管理

**通过配置文件管理**：

插件启用状态保存在 `.colyn/config.json`：

```json
{
  "plugins": {
    "enabled": ["nodejs", "python"],
    "config": {
      "nodejs": {
        "autoInstall": true
      },
      "python": {
        "autoInstall": false,
        "virtualEnv": "venv"
      }
    }
  }
}
```

**说明**：
- `enabled`: 当前项目启用的插件列表
- `config`: 各插件的自定义配置（可选）

**管理命令**（未来扩展）：
```bash
# 查看已启用的插件
colyn plugin list

# 启用/禁用插件
colyn plugin enable python
colyn plugin disable java
```

---

## 5. 向后兼容策略

### 5.1 一次性迁移

**目标**：现有 Node.js 项目升级到插件系统后，首次运行时自动迁移

**迁移流程**：

1. **检测旧项目**：
   - 检查 `.colyn/config.json` 是否存在 `plugins` 字段
   - 不存在 = 旧项目，需要迁移

2. **自动迁移**：
   ```
   ⚠ 检测到旧版本 colyn 项目，正在自动迁移...

   ✔ 检测环境: Node.js
   ✔ 启用插件: nodejs
   ✔ 更新配置文件

   ✓ 迁移完成！项目已升级到插件系统。
   ```

3. **更新配置**：
   - 在 `.colyn/config.json` 中添加：
     ```json
     {
       "plugins": {
         "enabled": ["nodejs"]
       }
     }
     ```

4. **保持行为一致**：
   - 迁移后的行为与旧版本完全一致
   - `.env.local` 文件格式不变
   - 端口分配逻辑不变

### 5.2 兼容性保证

- 现有的 `.env.local` 文件继续有效
- 命令行参数和选项保持不变
- 输出格式保持一致
- 所有现有功能正常工作

---

## 6. 用户体验

### 6.1 初始化流程（init 命令）

```bash
$ colyn init

? 请输入主分支开发服务器端口: (10000) 10000

✔ 检测到以下开发环境：
  • Node.js (package.json)
  • Python (requirements.txt)

? 请选择要启用的插件：(使用空格选择，回车确认)
  ◉ Node.js Web Plugin
  ◉ Python Plugin

✔ 创建目录结构
✔ 移动项目文件
✔ 配置环境变量 (Node.js)
✔ 配置环境变量 (Python)
✔ 保存插件配置

✓ 初始化成功！

已启用插件:
  • Node.js Web Plugin
  • Python Plugin

后续操作：
  1. 创建 worktree:
     colyn add <branch-name>
```

### 6.2 创建 Worktree 流程（add 命令）

```bash
$ colyn add feature/auth

✔ 创建 worktree: task-1
✔ 切换分支: feature/auth
✔ 复制环境配置
  • Node.js: .env.local (PORT=10001)
  • Python: .env (PORT=10001)
✔ 安装依赖
  • Installing Node.js dependencies... 完成
  • Installing Python dependencies... 完成

✓ Worktree 创建成功！

启动开发服务器:
  • Node.js: npm run dev
  • Python: python manage.py runserver

📂 已切换到: /path/to/project/worktrees/task-1
```

### 6.3 版本发布流程（release 命令）

```bash
$ colyn release 1.2.0

✔ 更新版本号
  • Node.js: package.json (1.2.0)
  • Python: setup.py (1.2.0)
✔ Git 提交: "chore: release v1.2.0"
✔ Git 标签: v1.2.0

✓ 版本发布完成！
```

---

## 7. 首批内置插件

### 7.1 Node.js Web Plugin

**环境检测**：
- 检查 `package.json` 存在

**配置文件**：
- `.env.local`

**端口分配**：
- 启用，默认端口 3000
- 配置键：`PORT`

**依赖安装**：
- `npm install` 或 `yarn install`

**开发服务器**：
- 读取 `package.json` 的 `scripts.dev` 或 `scripts.start`

**版本管理**：
- 更新 `package.json` 的 `version` 字段

### 7.2 Java Spring Boot Plugin

**环境检测**：
- 检查 `pom.xml` 或 `build.gradle` 存在
- 检查 `src/main/resources/application.properties` 或 `application.yml` 存在

**配置文件**：
- `application.properties` 或 `application.yml`

**端口分配**：
- 启用，默认端口 8080
- 配置键：`server.port`

**依赖安装**：
- Maven: `mvn clean install`
- Gradle: `gradle build`

**开发服务器**：
- Maven: `mvn spring-boot:run`
- Gradle: `gradle bootRun`

**版本管理**：
- 更新 `pom.xml` 的 `<version>` 标签
- 或更新 `build.gradle` 的 `version` 属性

### 7.3 Python Plugin

**环境检测**：
- 检查 `requirements.txt`、`pyproject.toml` 或 `setup.py` 存在

**配置文件**：
- `.env`

**端口分配**：
- 启用，默认端口 8000
- 配置键：`PORT`

**依赖安装**：
- `pip install -r requirements.txt`
- 或 `poetry install`（如果检测到 `pyproject.toml`）

**开发服务器**：
- Django: `python manage.py runserver`
- Flask: `flask run`
- FastAPI: `uvicorn main:app --reload`

**版本管理**：
- 更新 `setup.py` 的 `version` 参数
- 或更新 `pyproject.toml` 的 `version` 字段

---

## 8. 验收标准

### 8.1 功能验收

- [ ] 插件系统基础架构实现
  - [ ] Plugin 接口定义
  - [ ] 扩展点调用机制
  - [ ] 插件注册和管理

- [ ] 内置插件实现
  - [ ] Node.js Web Plugin
  - [ ] Java Spring Boot Plugin（可选，第一阶段可先实现 Node.js）
  - [ ] Python Plugin（可选）

- [ ] init 命令集成
  - [ ] 环境检测
  - [ ] 交互式插件选择
  - [ ] 插件配置保存

- [ ] add 命令集成
  - [ ] 配置文件复制（调用 readConfig/writeConfig）
  - [ ] 端口分配（调用 portAllocation）
  - [ ] 依赖安装（调用 installDependencies）

- [ ] release 命令集成（可选）
  - [ ] 版本更新（调用 versionUpdate）

### 8.2 兼容性验收

- [ ] 现有 Node.js 项目自动迁移
- [ ] 迁移后行为一致（端口、配置、命令输出）
- [ ] 所有现有命令正常工作

### 8.3 易用性验收

- [ ] 新建 Node.js 项目零配置可用
- [ ] 新建 Java 项目零配置可用（如果实现 Java 插件）
- [ ] 插件开发文档完整
- [ ] 至少有一个示例插件

### 8.4 扩展性验收

- [ ] 外部开发者可以创建新插件
- [ ] 插件接口稳定，向后兼容
- [ ] 插件安装和启用流程清晰

---

## 9. 非功能需求

### 9.1 性能

- 环境检测不应明显增加 init 命令执行时间（< 100ms）
- 插件加载机制高效，不影响命令启动速度

### 9.2 可维护性

- 插件代码与核心代码解耦
- 每个插件独立测试
- 清晰的错误处理和日志

### 9.3 文档

- 插件开发指南
- 各内置插件的说明文档
- 从旧版本迁移指南

---

## 10. 风险和限制

### 10.1 风险

1. **API 稳定性**：
   - 插件接口一旦发布，修改会影响社区插件
   - 缓解：第一版充分设计和评审，预留扩展性

2. **插件质量**：
   - 社区插件质量参差不齐
   - 缓解：提供插件开发最佳实践和测试指南

3. **配置复杂度**：
   - 多插件模式可能增加配置复杂度
   - 缓解：合理的默认值和清晰的交互提示

### 10.2 限制

1. **配置格式限制**：
   - 统一键值对格式可能无法表达所有配置语义
   - 解决：插件可以在 `writeConfig` 中自由实现原生格式

2. **执行顺序限制**：
   - 多插件执行顺序可能影响结果
   - 解决：明确定义各扩展点的执行策略

---

## 11. 未来扩展

### 11.1 短期（v1.0）

- 实现核心插件系统和 Node.js 插件
- 支持基本的环境检测和配置管理
- 完成向后兼容迁移

### 11.2 中期（v1.1-v1.2）

- 增加 Java、Python 内置插件
- 支持社区插件发布和安装
- 提供插件管理命令（enable/disable/list）

### 11.3 长期（v2.0+）

- 支持本地自定义插件
- 插件市场（发现和分享插件）
- 插件依赖管理（插件间依赖）
- 插件热更新

---

## 12. 参考资料

### 12.1 类似项目

- **Vite Plugin System**: 代码驱动，清晰的钩子定义
- **Babel Plugin System**: 配置驱动，简单易用
- **ESLint Plugin System**: 规则和配置结合
- **Rollup Plugin System**: 灵活的钩子机制

### 12.2 相关文档

- `docs/design-init-command.md` - init 命令设计
- `docs/design-add-command.md` - add 命令设计
- `docs/design-release-command.md` - release 命令设计

---

## 13. 附录

### 13.1 术语表

- **扩展点（Extension Point）**：插件可以实现的功能点
- **内置插件（Builtin Plugin）**：随 colyn 核心代码分发的插件
- **社区插件（Community Plugin）**：第三方开发的 npm 包插件
- **环境检测（Environment Detection）**：识别项目开发环境类型的过程
- **配置键值对（Config Key-Value Pairs）**：统一的配置数据格式

### 13.2 Q&A

**Q: 为什么采用扩展点而不是生命周期钩子？**
A: 扩展点更清晰地表达"做什么"，而生命周期钩子关注"何时做"。扩展点让插件职责更明确，降低耦合度。

**Q: 为什么配置读写要返回统一键值对而不是原生格式？**
A: 统一格式简化了 colyn 核心逻辑（如端口分配、worktree ID 管理）。插件在 writeConfig 时可以自由实现原生格式，保留完整语义。

**Q: 多插件模式下如何避免配置冲突？**
A: 每个插件负责自己的配置文件（.env.local vs application.properties），文件隔离避免冲突。如果需要共享配置，由插件协商处理。

**Q: 如何保证插件接口的稳定性？**
A: 采用语义化版本，主版本号变更表示破坏性更新。提供充足的弃用警告期，给插件开发者迁移时间。

---

**文档结束**
