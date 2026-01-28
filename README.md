# Colyn

**中文** | [English](README-en.md)

Git Worktree 管理工具 - 简化多分支并行开发工作流。

---

## 功能特点

- **简化 worktree 管理**：一键创建和管理 git worktree
- **自动端口分配**：避免多个开发服务器端口冲突
- **自动目录切换**：命令执行后自动切换到目标目录
- **智能分支处理**：自动识别本地分支、远程分支或创建新分支
- **自动补全**：支持 Bash/Zsh Tab 键补全命令、选项和参数
- **跨平台支持**：macOS、Linux、Windows

---

## 安装

### 方式 1：npm 全局安装（推荐）

```bash
# 使用 npm 安装
npm install -g colyn

# 或使用 volta（推荐）
volta install colyn

# 配置 shell 集成（支持自动目录切换）
colyn system-integration
```

配置完成后，重新打开终端或运行 `source ~/.zshrc`（或 `~/.bashrc`）即可使用完整功能。

### 方式 2：使用安装脚本

```bash
# 在项目根目录执行
volta run yarn install-to ~/my-tools/colyn
```

安装完成后，重新打开终端即可使用 `colyn` 命令（已自动配置 shell 集成和自动补全）。

### 方式 3：手动配置

如果自动配置未生效，手动添加到 shell 配置文件：

```bash
# 添加到 ~/.zshrc 或 ~/.bashrc
source ~/my-tools/colyn/colyn.d/colyn.sh
source ~/my-tools/colyn/colyn.d/completion.bash  # 或 completion.zsh
```

详细安装说明请参考 [docs/installation.md](docs/installation.md)。

---

## 快速开始

### 初始化项目

```bash
# 在现有 git 项目中运行
colyn init -p 10000
```

初始化后的目录结构：

```
my-project/                    # 根目录
├── my-project/                # 主分支目录
│   ├── .git/
│   ├── src/
│   ├── .env.local            # PORT=10000, WORKTREE=main
│   └── ...
└── worktrees/                 # worktrees 目录
```

### 创建 worktree

```bash
# 创建新的 worktree（自动切换到目标目录）
colyn add feature/login
# 📂 已切换到: worktrees/task-1

# 查看当前目录
pwd
# /path/to/project/worktrees/task-1
```

创建后的目录结构：

```
my-project/
├── my-project/                # 主分支目录 (PORT=10000)
└── worktrees/
    └── task-1/                # 新的 worktree (PORT=10001)
        ├── src/
        ├── .env.local
        └── ...
```

---

## 命令参考

### 全局选项

所有命令都支持以下全局选项：

```bash
-C, --no-color  禁用颜色输出
```

**使用场景**：
- 在 CI/CD 环境中运行
- 将输出重定向到文件
- 终端不支持颜色显示
- 需要纯文本输出用于脚本解析

**示例**：
```bash
colyn list --no-color           # 列出 worktree（无颜色）
colyn info --short -C           # 显示项目信息（无颜色，使用缩写）
colyn checkout feature/test -C  # 切换分支（无颜色）
```

### `colyn init`

初始化 worktree 管理结构。

```bash
colyn init [options]

选项：
  -p, --port <port>  主分支开发服务器端口
```

**功能**：
- 自动检测目录状态（空目录、已初始化、现有项目）
- 创建主分支目录和 worktrees 目录
- 配置环境变量（PORT 和 WORKTREE）
- 配置 .gitignore 忽略 .env.local

### `colyn add <branch>`

为指定分支创建新的 worktree。

```bash
colyn add <branch>

参数：
  branch  分支名称（支持本地分支、远程分支或新建分支）
```

**功能**：
- 自动分配 worktree ID 和端口号
- 智能处理分支（本地、远程、新建）
- 复制主分支环境变量并更新
- 执行后自动切换到 worktree 目录

### `colyn merge [target]`

将 worktree 分支合并回主分支。

```bash
colyn merge [target] [options]

参数：
  target  可选，支持以下形式：
          - 数字：按 ID 查找（如 colyn merge 1）
          - 分支名：按分支名查找（如 colyn merge feature/login）
          - 不传：自动识别当前 worktree

选项：
  --push     合并后自动推送到远程
```

**功能**：
- 智能识别 worktree（ID、分支名或自动检测）
- 前置检查（主分支和 worktree 工作目录必须干净）
- 两步合并策略：先在 worktree 合并主分支，再在主分支合并 worktree
- 使用 `--no-ff` 保持清晰的分支历史
- 可选推送到远程仓库
- 合并后保留 worktree（由用户决定删除时机）

### `colyn list`

列出所有 worktree。

```bash
colyn list [options]

选项：
  --json     以 JSON 格式输出
  -p, --paths  只输出路径（每行一个）
  --no-main  不显示主分支
```

**功能**：
- 表格形式展示所有 worktree
- 显示 ID、分支名、端口、路径
- 高亮当前所在的 worktree
- 支持 JSON 输出便于脚本使用

### `colyn remove [target]`

删除不再需要的 worktree。

```bash
colyn remove [target] [options]

参数：
  target  可选，支持以下形式：
          - 数字：按 ID 查找（如 colyn remove 1）
          - 分支名：按分支名查找（如 colyn remove feature/login）
          - 不传：自动识别当前 worktree

选项：
  -f, --force  强制删除（忽略未提交的更改）
  -y, --yes    跳过确认提示
```

**功能**：
- 智能识别 worktree（ID、分支名或自动检测）
- 检查未提交更改，有更改时拒绝删除（除非 --force）
- 检查分支是否已合并（未合并时显示警告）
- 删除后询问是否同时删除本地分支
- 如果当前在被删除的 worktree 中，自动切换到主分支目录

### `colyn checkout [worktree-id] <branch>`

在 worktree 中切换分支。

```bash
colyn checkout [worktree-id] <branch> [options]

参数：
  worktree-id  可选，worktree 的 ID（在 worktree 目录中可省略）
  branch       目标分支名称

选项：
  --no-fetch   跳过从远程获取分支信息

别名：
  colyn co [worktree-id] <branch> [options]
```

**功能**：
- 在 worktree 目录中自动识别当前 worktree，或通过 ID 指定
- 智能处理分支（本地分支、远程跟踪、创建新分支）
- 自动从远程获取最新分支信息（可用 --no-fetch 跳过）
- fetch 成功后自动更新主分支（如果主分支落后于远程）
- 检查当前分支是否已合并，未合并时提示确认
- 自动归档 `.claude/logs/` 下的日志文件到 `archived/<branch-name>/`
- 已合并的分支可选删除

### `colyn info`

显示当前目录的项目信息。

```bash
colyn info [options]

选项：
  -S, --short             输出简短标识符（带分支信息）
  -f, --field <name>      输出指定字段（可多次使用）
  --format <template>     使用模板字符串格式化输出
  -s, --separator <char>  多字段时的分隔符（默认 tab）
```

**功能**：
- 显示项目名、路径、worktree ID、分支等信息
- 支持多种输出格式（完整信息、字段、模板、简短标识符）
- `--short` 选项支持智能降级（colyn 项目 → git 仓库 → 普通目录）

**使用示例**：
```bash
# 显示完整信息
$ colyn info
📁 Project:      my-project
📂 Project Path: /path/to/my-project
🔢 Worktree ID:  1
📁 Worktree Dir: task-1
🌿 Branch:       feature/login

# 输出简短标识符（推荐用于 shell 提示符）
$ colyn info --short
my-project/task-1 (⎇ feature/login)

# 在 shell 提示符中使用
$ PS1='[$(colyn info -S)] $ '
[my-project/task-1 (⎇ feature/login)] $

# 获取单个字段
$ colyn info -f branch
feature/login
```

### `colyn completion [shell]`

生成 shell 自动补全脚本。

```bash
colyn completion [shell] [options]

参数：
  shell  shell 类型（bash 或 zsh）

选项：
  --install  显示安装说明
```

**功能**：
- 生成 Bash 或 Zsh 补全脚本
- 支持命令、选项、参数的自动补全
- 实时查询 worktree 列表进行动态补全
- 提供安装说明

**示例**：
```bash
# 输出 bash 补全脚本
colyn completion bash

# 显示 zsh 安装说明
colyn completion zsh --install

# 手动安装
colyn completion bash > ~/.colyn-completion.bash
echo "source ~/.colyn-completion.bash" >> ~/.bashrc
```

### `colyn repair`

检查并修复项目配置（移动目录后使用）。

```bash
colyn repair
```

**功能**：
- 检查并修复主分支和所有 worktree 的 `.env.local` 文件
- 运行 `git worktree repair` 修复 git 连接
- 智能检测并修复路径失效的 worktree（项目移动后）
- 检测孤儿 worktree 目录

**使用场景**：
```bash
# 移动项目目录后
$ mv ~/project ~/Desktop/project
$ cd ~/Desktop/project

# 运行修复
$ colyn repair
✔ 检测并修复孤儿 worktree 目录...
✔ 已修复 2 个路径失效的 worktree

✓ 修复完成！
```

### `colyn system-integration`

配置 shell 集成（支持自动目录切换和命令补全）。

```bash
colyn system-integration
```

**功能**：
- 自动检测 shell 类型（bash/zsh）和配置文件
- 添加 shell 集成到配置文件（`~/.zshrc` 或 `~/.bashrc`）
- 支持更新已有配置
- 配置后需要重新打开终端或运行 `source` 命令生效

**使用场景**：
- npm 全局安装后首次配置
- 升级 colyn 后更新配置
- 配置文件被误删后恢复

---

## 环境变量

Colyn 会在每个 worktree 的 `.env.local` 中设置以下环境变量：

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `PORT` | 开发服务器端口 | `10001` |
| `WORKTREE` | Worktree 标识 | `1` 或 `main` |

---

## 架构说明

Colyn 采用 Bash + Node.js 双层架构：

```
shell/colyn.sh (Shell 函数)
    │
    └──► bin/colyn (Bash 入口)
            │
            └──► dist/index.js (Node.js 核心)
                        │
                 stderr → 彩色输出
                 stdout → JSON 结果
                        │
    ◄───────────────────┘
    │
    └──► 解析 JSON ──► cd 目标目录
```

**为什么需要双层架构？**

子进程无法修改父进程的工作目录。通过 shell 函数包装，可以：
1. 捕获 Node.js 输出的 JSON 结果
2. 解析目标目录
3. 在当前 shell 中执行 `cd` 命令

---

## 开发

### 环境要求

- Node.js >= 18（推荐使用 [Volta](https://volta.sh) 管理）
- Git >= 2.15
- Yarn

### 开发命令

```bash
# 安装依赖
volta run yarn install

# 编译
volta run yarn build

# 监听模式编译
volta run yarn dev

# 运行测试
volta run yarn test

# 本地测试
volta run yarn colyn init
```

### 项目结构

```
colyn/
├── bin/
│   └── colyn              # Bash 入口脚本
├── shell/
│   ├── colyn.sh           # Shell 集成脚本
│   ├── completion.bash    # Bash 补全脚本
│   └── completion.zsh     # Zsh 补全脚本
├── src/
│   ├── cli.ts             # CLI 入口
│   ├── commands/          # 命令实现
│   ├── types/             # 类型定义
│   └── utils/             # 工具函数
├── scripts/
│   └── install.js         # 安装脚本
├── docs/                   # 文档
└── dist/                   # 编译输出
```

---

## 路线图

- [x] `init` - 初始化项目结构
- [x] `add` - 创建 worktree
- [x] `list` - 列出所有 worktree
- [x] `merge` - 合并 worktree 到主分支
- [x] `remove` - 删除 worktree
- [x] `checkout` - 在 worktree 中切换分支
- [x] `info` - 显示当前目录信息
- [x] `completion` - 自动补全功能
- [x] `repair` - 检查并修复项目配置
- [x] `system-integration` - 配置 shell 集成

---

## 许可证

MIT
