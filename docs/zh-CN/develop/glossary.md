# Colyn 术语表

本文档定义了 Colyn 项目中常用的术语和概念。

---

## Git 相关术语

### Worktree

**定义**：Git 的一个功能，允许从同一个仓库同时检出多个分支到不同的目录。

**来源**：Git 2.5+ 引入的功能（`git worktree`）

**在 Colyn 中的用法**：
- Colyn 的核心功能就是简化 Git worktree 的管理
- 每个 worktree 对应一个独立的工作目录
- 每个 worktree 可以运行独立的开发服务器

**示例**：
```bash
# Git 原生命令
git worktree add ../feature-branch feature/login

# Colyn 简化命令
colyn add feature/login
```

**相关文档**：
- [Git worktree 官方文档](https://git-scm.com/docs/git-worktree)

---

### Main Branch（主分支）

**定义**：项目的主要开发分支，通常是 `main` 或 `master`。

**来源**：Git 分支管理概念

**在 Colyn 中的用法**：
- 主分支单独存放在项目根目录的同名子目录中
- 例如项目根目录为 `my-app/`，主分支在 `my-app/my-app/`
- 主分支的信息（分支名、端口）作为其他 worktree 的参考

**推断方式**：
```typescript
// 从主分支目录的当前分支推断
getMainBranch() => execSync('git branch --show-current', { cwd: mainDir })
```

**相关术语**：[Base Port](#base-port基础端口)

---

### Branch Name（分支名）

**定义**：Git 分支的名称，用于标识不同的开发线。

**来源**：Git 分支管理概念

**在 Colyn 中的用法**：
- 用于创建 worktree 时指定目标分支
- 其最后一段（分支短名，branch short name）用于 iTerm2 tab title 显示
- 支持本地分支、远程分支或新建分支
- 格式为 `{category}/{name}`，其中 category 使用 Category 的 `name` 字段

**命名约定示例**：
```
feature/auth           # 新功能
bugfix/user/login      # Bug 修复
feature/ui/dark-mode   # UI 功能
main                   # 主分支
```

**相关术语**：[Branch Category](#branch-category分支类别)

---

## Colyn 核心概念

### Worktree ID

**定义**：Colyn 为每个 worktree 分配的唯一数字标识符。

**来源**：Colyn 自定义概念

**在 Colyn 中的用法**：
- 主分支固定为 ID `0`（`colyn list` 中显示为 `0`；`colyn list-project` 的 worktree 详情表中显示为 `0-main`）
- 其他 worktree 从 `1` 开始递增
- ID 用于目录命名（`{prefix}-{id}`，默认前缀 `task`，即 `task-1`、`task-2` 等；见 [Worktree prefix](#worktree-prefixworktree-目录名前缀)）
- ID 用于端口分配（base port + ID）
- ID 显示在 iTerm2 tab title 中（`🐶 {projectName} #{worktreeId} - {分支短名}`）

**示例**：
```bash
colyn list

┌────────┬─────────────────────┬──────┐
│ ID     │ 分支                │ 端口 │
├────────┼─────────────────────┼──────┤
│ 0      │ main                │ 3000 │
│ 1      │ feature/auth        │ 3001 │
│ 2      │ feature/tasks       │ 3002 │
└────────┴─────────────────────┴──────┘
```

**相关术语**：[Base Port](#base-port基础端口)

---

### Project Name（项目名）

**定义**：Colyn 项目的名称，用于标识整个项目。

**来源**：Colyn 自定义概念

**推断方式**：
```typescript
// 从项目根目录名推断
getProjectName() => path.basename(projectRoot)
```

**在 Colyn 中的用法**：
- 用作目录名称
- 显示在 iTerm2 tab title 中
- 用于各种提示信息

**示例**：
```bash
# 项目结构
my-task-app/              # ← 项目名 = "my-task-app"
├── my-task-app/          # 主分支目录
└── worktrees/            # worktree 目录
```

**相关术语**：[Worktree ID](#worktree-id)

---

### Worktree prefix（Worktree 目录名前缀）

**定义**：worktree 目录名 `{prefix}-{id}` 中 `{id}` 之前的部分，由配置项 `worktreePrefix` 决定，默认 `task`。

**来源**：Colyn 自定义概念

**在 Colyn 中的用法**：
- 通过 `colyn config set worktreePrefix <prefix>` 设置（项目级优先于用户级）
- 必须以字母开头，仅含字母、数字、下划线、连字符
- 修改后已有目录不会自动识别，运行 `colyn repair` 会把 git 已登记的旧前缀目录重命名为新前缀
- 所有生成、解析目录名的代码必须经由 `src/core/worktree-naming.ts`，禁止硬编码 `task-`

**示例**：
```bash
colyn config set worktreePrefix edt
colyn repair          # task-1 → edt-1
colyn add feature/x   # 创建 worktrees/edt-2
```

---

### Base Port（基础端口）

**定义**：主分支使用的开发服务器端口，也是分配其他端口的基础。

**来源**：Colyn 自定义概念

**推断方式**：
```typescript
// 从主分支的 .env.local 读取
getBasePort() => readEnvLocal(mainDir).PORT
```

**在 Colyn 中的用法**：
- 主分支使用 base port
- Worktree 端口 = base port + worktree ID
- 避免多个开发服务器的端口冲突

**示例**：
```bash
# 主分支 .env.local
PORT=3000

# 各 worktree 的端口
main:    3000  (base port)
task-1:  3001  (3000 + 1)
task-2:  3002  (3000 + 2)
task-3:  3003  (3000 + 3)
```

**相关术语**：[Dev Server](#dev-server开发服务器)

---

### 并行 Vibe Coding

**定义**：使用 Colyn + Git worktree 实现多个 AI（如 Claude Code）并行开发不同功能的工作模式。

**来源**：Colyn 项目创造的术语

**核心特点**：
1. 多个 worktree 同时存在
2. 每个 worktree 运行独立的 Claude Code 实例
3. 每个 worktree 有独立的开发服务器
4. 通过 `colyn <N>` 在各 worktree 之间快速切换

**工作流程**：
```bash
# 1. 创建多个并行分支
colyn add feature/auth
colyn add feature/tasks
colyn add feature/dashboard

# 2. 在每个 worktree 中启动 Claude Code
# 3. 多个 AI 同时工作
# 4. 定期合并回主分支
```

**参考文档**：
- `blog/parallel-vibe-coding-with-colyn.md`

**相关术语**：[Claude Code](#claude-code)

---

### 最小配置原则

**定义**：能够自动推断的配置，就不在配置文件中存储。

**来源**：Colyn 项目的设计原则

**核心理念**：
- 只存储无法自动推断的信息
- 能从环境推断的，就不存储
- 能动态获取的，就不缓存

**实践**：
- ❌ 不存储 project name（从目录名推断）
- ❌ 不存储 main branch（从 git 推断）
- ❌ 不存储 base port（从 .env.local 读取）
- ✅ 目前项目完全零配置

**参考文档**：
- `CLAUDE.md#配置设计原则`
- `.claude/logs/minimal-config-principle-20260124.md`

---

### 命令默认值配置（Command Defaults Config）

**定义**：`settings.json` 中 `commands.*` 节点存放的各子命令开关型参数的项目级或用户级默认值。

**来源**：Colyn v3.3 引入

**在 Colyn 中的用法**：
- 支持命令：`merge`、`update`、`release`、`checkout`
- 支持字段：各命令的布尔型开关（如 `build`、`rebase`、`fetch`、`all` 等）
- 顶层 `verbose` 字段对所有命令共享
- 可通过 `branchOverrides` 按分支递归覆盖

**示例**：
```jsonc
{
  "version": 4,
  "verbose": true,
  "commands": {
    "merge": { "build": false },
    "update": { "all": false }
  }
}
```

**参考文档**：`docs/zh-CN/develop/design/design-command-defaults.md`

**相关术语**：[三态解析](#三态解析three-source-resolution)、[最小配置原则](#最小配置原则)

---

### 三态解析（Three-Source Resolution）

**定义**：针对开关型 CLI 参数的三级优先级解析链，按以下顺序依次检查：

1. **命令行显式指定**：用户输入 `--xxx` 或 `--no-xxx`（commander 的 `getOptionValueSource() === 'cli'`）
2. **settings.json 配置**：合并后的 `commands.<cmd>.<key>` 节点值（含 branchOverrides）
3. **命令内置默认值**：命令实现中传入的 fallback 值

**来源**：Colyn v3.3 引入

**核心原则**：命令行显式指定永远优先，配置文件只在用户未显式指定时生效。

**实现**：
```typescript
// source === 'cli' → 保留用户输入，不覆盖
// source !== 'cli' && config 有值 → 用配置值
// 否则 → 用内置默认
applyCommandDefaults(cmd, opts, configDefaults, builtinDefaults)
```

**参考文档**：`docs/zh-CN/develop/design/design-command-defaults.md`

**相关术语**：[命令默认值配置](#命令默认值配置command-defaults-config)

---

### 运行时配置同步（Runtime Config Sync）

**定义**：在主分支目录与 worktree 目录之间同步运行时配置文件（由工具链插件定义，如 npm/pip 项目的 `.env.local`、maven/gradle 项目的 `application-local.properties`）的机制。

**来源**：Colyn 核心命令机制

**核心规则**：
- 同步只"补充缺失的 key"，**永不覆盖既有值、永不删除 key**
- 同名 key 两侧值不同时跳过该 key，并在输出中提示差异（由人工决定取舍）
- `PORT`（或 `server.port`）与 `WORKTREE` 是身份键，永远保留所属侧的值，不参与同步

**触发时机**：
| 命令 | 方向 |
|------|------|
| `colyn add` | 创建时复制主分支配置（即初始同步） |
| `colyn update`（含 `merge` 后置 `--update` 环节） | 主分支 → worktree |
| `colyn merge`（合并成功后） | worktree → 主分支 |

**示例**：
```bash
$ colyn update
✔ 运行时配置已同步：新增 2 项 (API_KEY, BASE_URL)
⚠ 1 项配置与主分支不同，已跳过：DATABASE_URL
```

**配置**：默认开启，可通过 `--no-sync-config` 关闭，或在 `settings.json` 的 `commands.update.syncConfig` / `commands.merge.syncConfig` 设置默认值。

**参考文档**：`docs/zh-CN/develop/design/design-runtime-config-sync.md`

**相关术语**：[.env.local](#envlocal)、[Base Port](#base-port基础端口)、[Worktree ID](#worktree-id)、[命令默认值配置](#命令默认值配置command-defaults-config)、[未跟踪文件同步](#未跟踪文件同步untracked-file-sync)

---

### 未跟踪文件同步（Untracked File Sync）

**定义**：在主分支目录与 worktree 目录之间，按用户配置的 `syncFiles` 清单同步被 git 忽略/未跟踪的本地文件（如种子数据、本地证书）的机制。

**来源**：Colyn 核心命令机制

**核心规则**：
- 同步只"复制缺失的文件"，**永不覆盖既有内容、永不删除文件**
- 两侧内容不同（冲突）时不覆盖、不合并，**报错提示**两侧路径与修改时间，由人工处理
- 已跟踪文件与运行时配置文件（`.env.local` 等）被排除，不参与本机制

**触发时机**：与运行时配置同步完全一致（`add` 创建时、`update` 主→worktree、`merge` worktree→主、`repair` 重建时）。

**配置**：
```jsonc
{
  "syncFiles": [".env.*", "data/*.json", "certs/**"]  // 支持通配符，默认 [] 即关闭
}
```

**示例**：
```bash
$ colyn update
✔ 未跟踪文件已同步：复制 2 个文件 (data/seed.json, .env.staging)
✗ 1 个文件两侧内容不同，已跳过，请人工处理：certs/local.pem
```

**参考文档**：`docs/zh-CN/develop/design/design-untracked-file-sync.md`

**相关术语**：[运行时配置同步](#运行时配置同步runtime-config-sync)

---

### Branch Category（分支类别）

**定义**：描述分支用途的分类标签，是 Colyn Todo 和分支命名系统中的基础概念。

**来源**：Colyn 自定义概念

**数据结构**：
```typescript
interface BranchCategory {
  name: string;   // 类别名，用于 Branch Name 和 Todo ID
  abbr?: string;  // 显示缩写（可含 emoji），仅用于 UI 展示
}
```

**默认值**：
| name | abbr |
|------|------|
| `feature` | `✨feat` |
| `bugfix` | `🐛fix` |
| `refactor` | `♻️ref` |
| `document` | `📝doc` |

**与 Branch Name 和 Todo ID 的关系**：
- Branch Name 格式：`{category.name}/{taskName}` → `feature/user-auth`
- Todo ID 格式：`{category.name}/{taskName}` → `feature/user-auth`
- 两者格式完全相同，一个 Todo 与其对应的分支共享同一标识符

**abbr 的使用范围**（仅 UI 展示，不写入任何数据）：
- 类型选择列表：显示 `✨feat (feature)`
- `todo list` 表格：显示 `✨feat`

**配置**：在 `settings.json` 的 `branchCategories` 字段中定义，支持项目级和用户级配置，按 `name` 去重合并。

**查看当前列表**：
```bash
colyn config get branchCategories
```

**相关术语**：[Branch Name](#branch-name分支名)、[Todo ID](#todo-id)

---

### Todo Backend（Todo 存储后端）

**定义**：Colyn Todo 功能的存储抽象层，定义了统一的 `TodoBackend` 接口，允许将 todo 数据存储到不同的后端系统（本地文件或 IMS）。

**来源**：Colyn v3.4 引入

**在 Colyn 中的用法**：
- 任意时刻只有一个 active backend，由 `todo.backend` 配置项指定
- 内置两种实现：`local`（默认）和 `github`（GitHub Issues）
- 所有消费方（`todo`/`co`/`add`）只依赖接口，不感知具体实现

**内置 Backend**：

| 名称 | 说明 |
|------|------|
| `local` | 默认实现，将 todo 存储在 `.colyn/todo.json` 与 `.colyn/archived-todo.json` |
| `github` | 将 todo 映射到 GitHub Issues，通过 gh CLI 读写 |

**配置**：
```jsonc
{
  "todo": {
    "backend": "local"  // 'local' | 'github'
  }
}
```

**参考文档**：`docs/zh-CN/develop/design/design-todo-backend.md`

**相关术语**：[IMS / Issues Management System](#ims--issues-management-system问题管理系统)、[Todo ID](#todo-id)

---

### IMS / Issues Management System（问题管理系统）

**定义**：用于跟踪和管理软件开发任务、Bug 和功能请求的外部系统，如 GitHub Issues。在 Colyn 中作为 Todo backend 的一种实现类型。

**来源**：Colyn v3.4 引入的概念

**在 Colyn 中的用法**：
- 代表以外部问题管理系统作为 todo 存储后端的一类实现
- 当前支持的 IMS：GitHub Issues（`github` backend）
- IMS backend 的特点：`assignsName=true`（由 IMS 回填任务 ID，如 issue 号）

**示例**：

```
colyn type "feature" → GitHub Issues label "enhancement"
todo ID "feature/42" ← GitHub issue #42 回填
```

**参考文档**：`docs/zh-CN/develop/design/design-todo-backend.md`

**相关术语**：[Todo Backend](#todo-backend-todo-存储后端)

---

### Todo ID

**定义**：Colyn Todo 任务的唯一标识符，格式为 `{category}/{name}`。

**来源**：Colyn 自定义概念

**格式**：
```
{category.name}/{taskName}

示例：
  feature/user-auth
  bugfix/login-crash
  refactor/api-layer
```

**与 Branch Name 的等价性**：
- Todo ID 与对应的 Branch Name 完全一致
- `colyn todo start feature/user-auth` 会直接用该 ID 作为分支名创建分支
- `colyn add` 时选择 pending todo，选中后直接用 Todo ID 作为分支名

**用法示例**：
```bash
# 添加 todo（type 使用 category.name）
colyn todo add feature/user-auth "实现 JWT 认证"

# 通过 Todo ID 启动任务并创建分支
colyn todo start feature/user-auth

# 通过 Todo ID 标记完成
colyn todo complete feature/user-auth
```

**相关术语**：[Branch Category](#branch-category分支类别)、[Branch Name](#branch-name分支名)

---

## 开发工具术语

### Dev Server（开发服务器）

**定义**：用于本地开发的 Web 服务器，通常支持热重载。

**来源**：通用 Web 开发概念

**在 Colyn 中的用法**：
- 每个 worktree 运行独立的 dev server
- 通过 PORT 环境变量指定端口

**常见框架**：
- Next.js: `npm run dev`
- Vite: `npm run dev`
- Create React App: `npm start`

**端口分配**：
```bash
# 每个 worktree 的 .env.local
PORT=3001  # task-1
PORT=3002  # task-2
PORT=3003  # task-3
```

**相关术语**：[Base Port](#base-port基础端口)

---

### Claude Code

**定义**：Anthropic 官方的 Claude AI 命令行工具，用于在终端中与 Claude 对话和协作编程。

**来源**：Anthropic 官方工具

**在 Colyn 中的用法**：
- 在每个 worktree 中独立运行
- 实现并行 Vibe Coding

**使用场景**：
```bash
# 在 worktree 中启动 Claude Code
cd worktrees/task-1
claude

# Claude 帮助开发当前分支的功能
> 帮我实现用户认证功能...
```

**相关术语**：[并行 Vibe Coding](#并行-vibe-coding)

---

## 环境变量

### .env.local

**定义**：用于存储本地环境变量的文件，不提交到 Git 仓库。

**来源**：通用环境变量管理约定

**在 Colyn 中的用法**：
- 每个 worktree 有独立的 `.env.local` 文件
- 存储 PORT 环境变量
- 存储 WORKTREE 标识符
- 自动被 `.gitignore` 忽略

**示例**：
```bash
# 主分支 .env.local
PORT=3000
WORKTREE=main

# task-1 的 .env.local
PORT=3001
WORKTREE=1
```

**相关术语**：[Base Port](#base-port基础端口)、[Dev Server](#dev-server开发服务器)

---

### PORT

**定义**：指定开发服务器监听端口的环境变量。

**来源**：通用环境变量约定

**在 Colyn 中的用法**：
- 存储在每个 worktree 的 `.env.local` 中
- 值 = base port + worktree ID
- 避免多个开发服务器的端口冲突

**读取方式**：
```typescript
// 开发服务器自动读取
const port = process.env.PORT || 3000;
```

**相关术语**：[Base Port](#base-port基础端口)、[.env.local](#envlocal)

---

### WORKTREE

**定义**：标识当前工作目录是哪个 worktree 的环境变量。

**来源**：Colyn 自定义环境变量

**在 Colyn 中的用法**：
- 主分支：`WORKTREE=main`
- 其他 worktree：`WORKTREE=1`、`WORKTREE=2` 等
- 可用于应用逻辑中区分不同 worktree

**示例**：
```typescript
// 在应用代码中使用
if (process.env.WORKTREE === 'main') {
  // 主分支特有逻辑
}
```

**相关术语**：[Worktree ID](#worktree-id)、[.env.local](#envlocal)

---

## 快速参考

### 术语分类

**Git 概念**：
- Worktree
- Main Branch
- Branch Name

**Colyn 核心**：
- Worktree ID
- Project Name
- Base Port
- Branch Category
- Todo ID
- Todo Backend
- IMS / Issues Management System
- 并行 Vibe Coding
- 最小配置原则
- 命令默认值配置
- 三态解析
- 运行时配置同步
- 未跟踪文件同步

**环境变量**：
- .env.local
- PORT
- WORKTREE

**工具**：
- Dev Server
- Claude Code

### 推断规则总结

| 信息 | 推断来源 | 方法 |
|------|---------|------|
| Project name | 主目录名称 | `path.basename(projectRoot)` |
| Main branch | Git 仓库 | `git branch --show-current` |
| Base port | .env.local | `readEnvLocal().PORT` |
| 分支短名（iTerm2 tab title） | Branch name | `branch.split('/').pop()` |
| Branch Name | Category + task name | `{category.name}/{name}` |
| Todo ID | Category + task name | `{category.name}/{name}`（与 Branch Name 相同） |

---

## 参考资源

- **Git Worktree**：[官方文档](https://git-scm.com/docs/git-worktree)
- **Colyn 设计原则**：`CLAUDE.md`
- **用户故事**：
  - `blog/parallel-vibe-coding-with-colyn.md`

---

**文档版本**：1.3
**最后更新**：2026-10-14
