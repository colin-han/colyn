# 快速开始

本指南将帮助你在 5 分钟内开始使用 Colyn。

---

## 前置要求

在开始之前，确保你已安装：

- **Node.js** 18 或更高版本
- **Git** 2.15 或更高版本
- **npm** 或 **yarn** 包管理器

---

## 步骤 1: 安装 Colyn

### 使用 npm（推荐）

```bash
# 全局安装
npm install -g colyn-cli

# 或使用 volta（推荐）
volta install colyn-cli
```

### 配置 Shell 集成

安装后，配置 shell 集成以启用自动目录切换功能：

```bash
colyn setup
```

然后重新打开终端或运行：

```bash
# Zsh
source ~/.zshrc

# Bash
source ~/.bashrc
```

> **什么是 Shell 集成？**
> Shell 集成允许 Colyn 在命令执行后自动切换到目标目录，极大提升使用体验。

---

## 步骤 2: 初始化项目

在你的 Git 项目根目录中运行：

```bash
cd /path/to/your/project
colyn init -p 3000
```

这将：
- 重组项目结构，创建主分支目录和 worktrees 目录
- 配置环境变量（PORT 和 WORKTREE）
- 自动设置 .gitignore

### 初始化后的目录结构

```
my-project/                    # 项目根目录
├── .colyn/                    # Colyn 标识目录
├── my-project/                # 主分支目录
│   ├── .git/                  # Git 仓库
│   ├── src/
│   ├── .env.local             # PORT=3000, WORKTREE=main
│   └── ...
└── worktrees/                 # Worktrees 目录（稍后创建）
```

---

## 步骤 3: 创建第一个 Worktree

现在创建一个新的 worktree 来开发新功能：

```bash
colyn add feature/login
```

这将：
1. 创建新的 worktree 在 `worktrees/task-1/` 目录
2. 自动分配端口号 3001
3. 复制并更新 .env.local 文件
4. **自动切换到 worktree 目录**（如果已配置 shell 集成）

### 验证切换

```bash
# 查看当前目录
pwd
# 输出: /path/to/my-project/worktrees/task-1

# 查看环境变量
cat .env.local
# PORT=3001
# WORKTREE=1
```

---

## 步骤 4: 在 Worktree 中开发

现在你可以在新的 worktree 中开发功能：

```bash
# 安装依赖（如果需要）
npm install

# 启动开发服务器
npm run dev
# Server running at http://localhost:3001
```

---

## 步骤 5: 创建更多 Worktrees

你可以创建多个 worktree 来并行开发：

```bash
# 创建第二个 worktree
colyn add feature/dashboard
# 自动切换到 worktrees/task-2/，端口 3002

# 创建第三个 worktree
colyn add bugfix/user-profile
# 自动切换到 worktrees/task-3/，端口 3003
```

---

## 步骤 6: 查看所有 Worktrees

随时查看所有 worktree 的状态：

```bash
colyn list
```

输出示例：

```
┌────────┬──────────────────────┬──────┬────────────────────────────┐
│ ID     │ 分支                 │ 端口 │ 路径                       │
├────────┼──────────────────────┼──────┼────────────────────────────┤
│ 0      │ main                 │ 3000 │ /path/to/my-project        │
│ 1      │ feature/login      * │ 3001 │ worktrees/task-1           │
│ 2      │ feature/dashboard    │ 3002 │ worktrees/task-2           │
│ 3      │ bugfix/user-profile  │ 3003 │ worktrees/task-3           │
└────────┴──────────────────────┴──────┴────────────────────────────┘

* 表示当前所在的 worktree
```

---

## 步骤 7: 合并完成的功能

当功能开发完成后，合并回主分支：

```bash
# 确保所有更改已提交
git status

# 合并到主分支
colyn merge 1

# 或使用分支名
colyn merge feature/login

# 合并到主分支
colyn merge 1
```

合并过程：
1. 检查工作目录是否干净
2. 在 worktree 中先合并主分支
3. 在主分支中合并 worktree 分支
4. 使用 `--no-ff` 保持清晰的分支历史
5. （可选）推送到远程仓库

---

## 步骤 8: 删除不需要的 Worktree

功能合并后，可以删除 worktree：

```bash
colyn remove 1

# 或使用分支名
colyn remove feature/login
```

删除前会进行检查：
- 是否有未提交的更改
- 分支是否已合并
- 是否需要同时删除本地分支

如果当前在被删除的 worktree 中，会自动切换到主分支目录。

---

## 步骤 9: 在 Worktree 中切换分支

你可以在现有 worktree 中切换到其他分支，而不是创建新的 worktree：

```bash
# 在当前 worktree 中切换分支
colyn checkout feature/new-feature

# 或指定 worktree ID
colyn checkout 1 feature/new-feature
```

这会：
1. 检查当前分支是否已合并
2. 自动归档 `.claude/logs/` 下的日志文件
3. 切换到新分支
4. （可选）删除已合并的旧分支

---

## 常用命令速查

| 命令 | 说明 |
|------|------|
| `colyn init -p 3000` | 初始化项目结构 |
| `colyn add <branch>` | 创建新的 worktree |
| `colyn list` | 列出所有 worktree |
| `colyn merge <target>` | 合并 worktree 到主分支 |
| `colyn remove <target>` | 删除 worktree |
| `colyn checkout <branch>` | 在 worktree 中切换分支 |
| `colyn info` | 显示当前目录信息 |
| `colyn repair` | 修复项目配置 |

---

## 下一步

现在你已经掌握了 Colyn 的基本用法，接下来可以：

- 📖 阅读 [核心概念](03-core-concepts.md) 深入理解 Colyn 的工作原理
- 📚 查看 [命令参考](04-command-reference.md) 了解所有命令的详细用法
- 🚀 学习 [高级用法](05-advanced-usage.md) 掌握更多技巧
- 🖥️ 如果使用 tmux，查看 [tmux 集成](06-tmux-integration.md)

---

## 故障排除

遇到问题？查看 [故障排除](08-troubleshooting.md) 章节。

常见问题：

- **命令执行后没有自动切换目录** → 确认已运行 `colyn setup` 并重启终端
- **端口冲突** → 检查 .env.local 文件中的 PORT 配置
- **分支已存在** → 使用 `colyn list` 查看现有 worktree

