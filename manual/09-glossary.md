# 术语表

本术语表定义了 Colyn 和相关工具中使用的术语和概念。

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

---

### Main Branch（主分支）

**定义**：项目的主要开发分支，通常是 `main` 或 `master`。

**在 Colyn 中的用法**：
- 主分支单独存放在项目根目录的同名子目录中
- 例如项目根目录为 `my-app/`，主分支在 `my-app/my-app/`
- 主分支的信息（分支名、端口）作为其他 worktree 的参考

**推断方式**：
```typescript
// 从主分支目录的当前分支推断
getMainBranch() => execSync('git branch --show-current', { cwd: mainDir })
```

---

### Branch Name（分支名）

**定义**：Git 分支的名称，用于标识不同的开发线。

**在 Colyn 中的用法**：
- 用于创建 worktree 时指定目标分支
- 用于生成 tmux window 名称
- 支持本地分支、远程分支或新建分支

**命名约定示例**：
```
feature/auth           # 新功能
bugfix/user/login      # Bug 修复
feature/ui/dark-mode   # UI 功能
main                   # 主分支
```

---

## Colyn 核心概念

### Worktree ID

**定义**：Colyn 为每个 worktree 分配的唯一数字标识符。

**在 Colyn 中的用法**：
- 主分支固定显示为 ID `0-main`
- 其他 worktree 从 `1` 开始递增
- ID 用于目录命名（`task-1`、`task-2` 等）
- ID 用于端口分配（base port + ID）
- 在 tmux 集成中，ID = Window Index

**示例**：
```bash
colyn list

┌────────┬─────────────────────┬──────┐
│ ID     │ 分支                │ 端口 │
├────────┼─────────────────────┼──────┤
│ 0-main │ main                │ 3000 │
│ 1      │ feature/auth        │ 3001 │
│ 2      │ feature/tasks       │ 3002 │
└────────┴─────────────────────┴──────┘
```

---

### Project Name（项目名）

**定义**：Colyn 项目的名称，用于标识整个项目。

**推断方式**：
```typescript
// 从项目根目录名推断
getProjectName() => path.basename(projectRoot)
```

**在 Colyn 中的用法**：
- 用作目录名称
- 在 tmux 集成中用作 session 名称
- 用于各种提示信息

**示例**：
```bash
# 项目结构
my-task-app/              # ← 项目名 = "my-task-app"
├── my-task-app/          # 主分支目录
└── worktrees/            # worktree 目录
```

---

### Base Port（基础端口）

**定义**：主分支使用的开发服务器端口，也是分配其他端口的基础。

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

---

### 并行 Vibe Coding

**定义**：使用 Colyn + Git worktree 实现多个 AI（如 Claude Code）并行开发不同功能的工作模式。

**核心特点**：
1. 多个 worktree 同时存在
2. 每个 worktree 运行独立的 Claude Code 实例
3. 每个 worktree 有独立的开发服务器
4. 使用 tmux 在一个窗口中管理所有 worktree

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

---

### 最小配置原则

**定义**：能够自动推断的配置，就不在配置文件中存储。

**核心理念**：
- 只存储无法自动推断的信息
- 能从环境推断的，就不存储
- 能动态获取的，就不缓存

**实践**：
- ❌ 不存储 project name（从目录名推断）
- ❌ 不存储 main branch（从 git 推断）
- ❌ 不存储 base port（从 .env.local 读取）
- ❌ 不存储 session name（等于 project name）
- ✅ 目前项目完全零配置

---

## 开发工具术语

### Dev Server（开发服务器）

**定义**：用于本地开发的 Web 服务器，通常支持热重载。

**在 Colyn 中的用法**：
- 每个 worktree 运行独立的 dev server
- 通过 PORT 环境变量指定端口
- 在 tmux 集成中自动启动（检测 `package.json` 的 `dev` 脚本）

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

---

### Claude Code

**定义**：Anthropic 官方的 Claude AI 命令行工具，用于在终端中与 Claude 对话和协作编程。

**在 Colyn 中的用法**：
- 在每个 worktree 中独立运行
- 实现并行 Vibe Coding
- 在 tmux 集成中占据左侧 pane（60%）

**使用场景**：
```bash
# 在 worktree 中启动 Claude Code
cd worktrees/task-1
claude

# Claude 帮助开发当前分支的功能
> 帮我实现用户认证功能...
```

---

## tmux 相关术语

### Session（tmux 会话）

**定义**：tmux 的顶层容器，包含一个或多个 window。

**在 Colyn 中的用法**：
- 一个 Colyn 项目对应一个 tmux session
- Session 名称 = 项目名称
- 所有 worktree 的 window 都在同一个 session 中

**命令**：
```bash
# 查看所有 session
tmux ls

# 附加到 session
tmux attach -t my-task-app

# 分离 session
Ctrl-b d
```

**层级关系**：
```
Session (my-task-app)
  └─ Window 0 (main)
  └─ Window 1 (auth)
  └─ Window 2 (tasks)
```

---

### Session Name（tmux 会话名称）

**定义**：tmux session 的标识符，用于附加和管理 session。

**推断方式**：
```typescript
// 永远等于项目名
getSessionName() => getProjectName()
```

**在 Colyn 中的用法**：
- 自动使用项目名作为 session 名称
- 用户通过 session 名称附加到工作环境
- 不需要存储在配置文件中

**示例**：
```bash
# 项目名为 "my-task-app"
# Session 名称自动为 "my-task-app"

tmux attach -t my-task-app
```

---

### Window（tmux 窗口）

**定义**：tmux session 中的一个标签页，包含一个或多个 pane。

**在 Colyn 中的用法**：
- 一个 worktree 对应一个 window
- Window 0 固定为主分支
- 其他 window 的 index = worktree ID

**导航快捷键**：
```bash
Ctrl-b 0    # 切换到 Window 0
Ctrl-b 1    # 切换到 Window 1
Ctrl-b 2    # 切换到 Window 2
Ctrl-b n    # 下一个 window
Ctrl-b p    # 上一个 window
```

**层级关系**：
```
Window (auth)
  └─ Pane 0 (Claude Code)
  └─ Pane 1 (Dev Server)
  └─ Pane 2 (Bash)
```

---

### Window Index（tmux 窗口索引）

**定义**：tmux window 的数字标识符，从 0 开始。

**在 Colyn 中的用法**：
- Window Index = Worktree ID
- 主分支固定为 Window 0
- 用于快速切换（Ctrl-b 0-9）

**映射关系**：
```
Worktree     Window Index
────────────────────────
main         0
task-1       1
task-2       2
task-3       3
```

---

### Window Name（窗口名称）

**定义**：tmux window 的可读名称，显示在状态栏中。

**提取方式**：
```typescript
// 使用分支名的最后一段
function getWindowName(branch: string): string {
  return branch.split('/').pop() || branch;
}

// 示例
feature/auth → auth
bugfix/user/login → login
feature/ui/dark-mode → dark-mode
main → main
```

**在 Colyn 中的用法**：
- 自动从分支名提取
- 切换分支时自动更新
- 帮助用户识别当前 window 的功能

**状态栏显示**：
```
[my-task-app] 0:main  1:auth*  2:tasks  3:categories
```

---

### Pane（tmux 窗格）

**定义**：tmux window 的分割区域，每个 pane 是一个独立的终端。

**在 Colyn 中的用法**：

每个 window 固定分为 3 个 pane：

```
┌──────────────┬─────────┐
│              │  Dev    │
│              │  Server │  ← 30% (Pane 1)
│   Claude     ├─────────┤
│   Code       │         │
│              │  Bash   │  ← 70% (Pane 2)
│     60%      │   40%   │
│  (Pane 0)    │         │
└──────────────┴─────────┘
```

**Pane 分配**：
- Pane 0（左侧 60%）：Claude Code
- Pane 1（右上 12%）：Dev Server（自动启动）
- Pane 2（右下 28%）：Bash 命令行

**导航快捷键**：
```bash
Ctrl-b o         # 切换到下一个 pane
Ctrl-b ;         # 切换到上一个活动 pane
Ctrl-b ←/→/↑/↓   # 方向键切换 pane
```

---

## 环境变量

### .env.local

**定义**：用于存储本地环境变量的文件，不提交到 Git 仓库。

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

---

### PORT

**定义**：指定开发服务器监听端口的环境变量。

**在 Colyn 中的用法**：
- 存储在每个 worktree 的 `.env.local` 中
- 值 = base port + worktree ID
- 避免多个开发服务器的端口冲突

**读取方式**：
```javascript
// 开发服务器自动读取
const port = process.env.PORT || 3000;
```

---

### WORKTREE

**定义**：标识当前工作目录是哪个 worktree 的环境变量。

**在 Colyn 中的用法**：
- 主分支：`WORKTREE=main`
- 其他 worktree：`WORKTREE=1`、`WORKTREE=2` 等
- 可用于应用逻辑中区分不同 worktree

**示例**：
```javascript
// 在应用代码中使用
if (process.env.WORKTREE === 'main') {
  // 主分支特有逻辑
}
```

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
- 并行 Vibe Coding
- 最小配置原则

**tmux 概念**：
- Session
- Session Name
- Window
- Window Index
- Window Name
- Pane

**环境变量**：
- .env.local
- PORT
- WORKTREE

**工具**：
- Dev Server
- Claude Code

---

### 推断规则总结

| 信息 | 推断来源 | 方法 |
|------|---------|------|
| Project name | 主目录名称 | `path.basename(projectRoot)` |
| Main branch | Git 仓库 | `git branch --show-current` |
| Base port | .env.local | `readEnvLocal().PORT` |
| Session name | Project name | `getProjectName()` |
| Window index | Worktree ID | 一对一映射 |
| Window name | Branch name | `branch.split('/').pop()` |
| Dev command | package.json | `scripts.dev` |

---

## 相关资源

- **Git Worktree**：[官方文档](https://git-scm.com/docs/git-worktree)
- **tmux**：[官方文档](https://github.com/tmux/tmux/wiki)
- **Colyn GitHub**：[仓库地址](https://github.com/anthropics/colyn)
