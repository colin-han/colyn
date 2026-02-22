# 需求文档 - Mono Repo 支持

**创建时间**：2026-02-22
**状态**：✅ 已确认，可开始实现
**相关设计**：`docs/design-plugin-toolchain.md`

---

## 1. 背景

### 1.1 当前系统假设

当前 colyn 的工具链系统假设：**一个 git 仓库 = 一个项目**。所有工具链操作均在 worktree 根目录执行，端口分配也是每个 worktree 一个端口。

### 1.2 Mono Repo 场景

实际开发中，很多团队将多个相关项目放在同一个 git 仓库中：

```
my-project/
  ├── frontend/          # 前端（npm）
  ├── backend/           # 后端（maven）
  └── shared/            # 共享库（无工具链）
```

当前 colyn 无法支持这种场景，因为工具链检测和操作都在根目录执行，无法找到子目录中的配置文件。

---

## 2. 两种运行模式

### 2.1 单项目模式（Single Project Mode）

- **触发条件**：worktree 根目录被某个工具链匹配
- **行为**：工具链在 worktree 根目录执行，与现有行为完全一致

### 2.2 Mono Repo 模式

- **触发条件**：根目录没有任何工具链匹配，但一级子目录中有匹配
- **行为**：每个子项目在各自目录中执行工具链操作

---

## 3. 核心设计决策

### 3.1 模式检测

**时机**：仅在 `colyn init` 时执行一次，结果写入 settings。

**检测流程**：

```
Step 1：在 worktree 根目录运行所有工具链 detect()
  ├─ 有任意匹配 → 单项目模式，进入 Step 3
  └─ 无匹配 → Step 2

Step 2：遍历一级子目录（跳过 . 开头的隐藏目录）
  ├─ 有任意子目录被匹配 → Mono Repo 模式，进入 Step 3
  └─ 无匹配 → 提示用户（无工具链项目，仍可使用 colyn 管理 worktree）

Step 3：对每个未匹配的目录，让用户选择工具链（见 3.2 节）
```

### 3.2 "按需发现"策略（统一规则）

**适用范围**：所有需要用到工具链的命令（`init`、`add`、`merge`、`release`、`repair` 等）。

**规则**：任何时候命令遇到**没有工具链配置记录**的目录时：

1. 自动运行 `detect()` 尝试识别
2. 如果识别成功，直接使用（不提示用户）
3. 如果识别失败，提示用户手动选择：

```
发现子目录 shared/ 没有被任何工具链识别。
? 请为 shared/ 选择工具链：
  ❯ (无工具链)
    npm
    maven
    gradle
    pip
    xcode
```

4. 用户的选择（包括"无工具链"）写入 settings
5. 继续执行原命令

**"未配置"与"已配置为无工具链"的区别**：

| 状态 | settings 中的记录 | 遇到时的行为 |
|------|-----------------|------------|
| 未配置 | 该目录没有记录 | 触发"按需发现"流程 |
| 已配置为无工具链 | `"toolchain": null` | 跳过，不触发 |
| 已配置工具链 | `"toolchain": { "type": "npm", "settings": {} }` | 正常使用 |

### 3.3 端口与 Runtime Config

**原则**：每个工具链实例在**自己的子目录**中维护自己的 runtime config 文件和 .gitignore 条目，彼此完全独立。

```
worktree/
  ├── frontend/
  │   ├── .env.local              ← npm 工具链维护（PORT=3000）
  │   └── .gitignore              ← npm 工具链确保 .env.local 被忽略
  └── backend/
      ├── application-local.properties  ← maven 工具链维护（server.port=8080）
      └── .gitignore                    ← maven 工具链确保配置文件被忽略
```

**端口分配**：每个子项目独立读取自己目录的 base port，叠加 worktree ID：

```
frontend/ base port: 3000  →  main: 3000, task-1: 3001, task-2: 3002
backend/  base port: 8080  →  main: 8080, task-1: 8081, task-2: 8082
```

### 3.4 配置结构变更

`plugins`（数组，多选）改为 `toolchain`（对象，单选），将工具链类型与配置内聚在同一对象中。工具链在配置层面与 plugin 体系独立，但本次代码接口（`ToolchainPlugin`）暂不重构。

**toolchain 字段格式**：
```json
// 有工具链时
"toolchain": {
  "type": "npm",      // 工具链类型标识符
  "settings": { }     // 工具链专属配置（如 xcode 的 scheme/destination）
}

// 明确配置为无工具链时
"toolchain": null
```

**单项目模式（v4）**：
```json
{
  "version": 4,
  "toolchain": {
    "type": "npm",
    "settings": {}
  }
}
```

**Mono Repo 模式（v4）**：
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
      "path": "shared",
      "toolchain": null
    }
  ]
}
```

### 3.5 Migration（v3 → v4）

**策略**：丢弃旧的 `plugins` 配置，重新自动识别工具链。

```
v3 配置：{ "version": 3, "plugins": ["npm", "xcode"] }
                              ↓
Migration 执行：
  1. 清空原 plugins / pluginSettings 配置
  2. 在 worktree 根目录重新运行 detect()
  3. 如果识别成功，写入：
     "toolchain": { "type": "npm", "settings": {} }
  4. 如果识别失败，进入"按需发现"流程
```

> Migration 在 settings 加载时自动执行，用户无感知（可能会触发一次工具链选择交互）。

### 3.6 同种工具链的多个子项目

允许多个子目录使用同一工具链，以 `path` 区分：

```json
{
  "projects": [
    { "path": "web-app",   "toolchain": { "type": "npm", "settings": {} } },
    { "path": "admin-app", "toolchain": { "type": "npm", "settings": {} } }
  ]
}
```

### 3.7 原多插件组合（如 npm + xcode）

原来通过 `["npm", "xcode"]` 同时激活的组合，在 Mono Repo 模式下改为拆分到不同子目录：

```json
{
  "projects": [
    { "path": "js",  "toolchain": { "type": "npm",   "settings": {} } },
    { "path": "ios", "toolchain": { "type": "xcode", "settings": { "scheme": "MyApp", "destination": "..." } } }
  ]
}
```

---

## 4. 各命令的行为变化

### 4.1 `colyn init`

```
1. 检测模式（见 3.1 节）
2. 对每个子目录执行"按需发现"流程（见 3.2 节）
3. 对每个已配置工具链的目录：
   a. 写入 runtime config（端口等）
   b. 确保 .gitignore 忽略 runtime config 文件
   c. 执行 repairSettings（如有）
4. 将模式和子项目配置写入 settings
```

### 4.2 `colyn add`

```
1. 创建 git worktree
2. 对 settings 中的每个子项目：
   a. 检查该子目录在新 worktree 中是否存在
      ├─ 不存在 → 跳过（不报错）
      └─ 存在 → 继续
   b. 从主分支对应子目录读取 base port
   c. 计算新端口（base port + worktree ID）
   d. 在新 worktree 的子目录写入 runtime config
   e. 执行 install
3. 对新 worktree 中发现但 settings 未记录的子目录：
   触发"按需发现"流程，完成配置后执行 2b-2e
```

### 4.3 `colyn merge` / `colyn release`

```
1. 对 settings 中的每个子项目：
   a. 跳过 toolchain = null 的子项目
   b. 执行 lint（merge）
   c. 执行 build（merge/release）
2. 对新发现的未配置子目录：
   触发"按需发现"流程，完成配置后执行 lint/build
```

### 4.4 `colyn repair`

```
1. 对 settings 中的每个子项目：
   触发对应工具链的 repairSettings
2. 对新发现的未配置子目录：
   触发"按需发现"流程，完成配置后执行 repairSettings
```

---

## 5. 影响范围

### 5.1 需要修改的模块

| 模块 | 影响类型 | 说明 |
|------|---------|------|
| `src/core/config-schema.ts` | **破坏性变更** | `plugins[]` → `toolchain`（单选）+ `projects[]` 结构 |
| `src/core/plugin-manager.ts` | **重大修改** | 支持 per-subproject 工具链管理，实现"按需发现"逻辑 |
| `src/commands/init.ts` | **重大修改** | 模式检测、子目录扫描、用户确认流程 |
| `src/commands/add.ts` | **重大修改** | 多子项目的 runtime config 和 install |
| `src/commands/merge.ts` | 修改 | 多子项目的 lint/build |
| `src/commands/release.ts` | 修改 | 同 merge |
| `src/commands/repair.ts` | 修改 | 多子项目的 repairSettings |
| Migration | **必须创建** | version 3 → version 4，丢弃旧 plugins，重新识别 |
| `src/i18n/` | 新增 | 相关文本翻译（中英文） |

### 5.2 不受影响的模块

- 所有内置工具链插件（npm / maven / gradle / pip / xcode）的 detect / install / lint / build 等方法实现基本不变，仅调用时传入的目录参数会变化
- tmux 集成
- `colyn list`、`colyn checkout`、`colyn remove` 等不依赖工具链的命令
- `ToolchainPlugin` 接口定义（本次不重构）

---

## 6. 新增术语

以下术语需要添加到 `docs/glossary.md`：

| 术语 | 定义 |
|------|------|
| **Mono Repo** | 将多个相关项目放在同一 git 仓库中的代码组织方式 |
| **Sub Project** | Mono Repo 中的一个子项目，对应一级子目录 |
| **Single Project Mode** | 整个仓库只有一个项目，工具链在根目录执行 |
| **按需发现（On-demand Discovery）** | 遇到未配置目录时即时触发工具链识别和用户选择的机制 |

---

**文档版本**：1.0（正式版）
**最后更新**：2026-02-22
