# 命令参考 — Worktree 管理

[← 返回命令参考](README.md)

---

## 全局选项

所有 Colyn 命令都支持以下全局选项：

### `-C, --no-color`

禁用彩色输出。

**适用场景：**
- 在 CI/CD 环境中运行
- 将输出重定向到文件
- 终端不支持颜色显示
- 需要纯文本输出用于脚本解析

**示例：**
```bash
colyn list --no-color           # 列出 worktree（无颜色）
colyn info --short -C           # 显示项目信息（无颜色）
colyn checkout feature/test -C  # 切换分支（无颜色）
```

---

## colyn init

初始化 Worktree 管理结构。

### 语法

```bash
colyn init [选项]
```

### 选项

| 选项 | 短选项 | 说明 | 默认值 |
|------|--------|------|--------|
| `--port <port>` | `-p` | 主分支开发服务器端口号 | 10000 |
| `--yes` | `-y` | 在"已有项目"场景下跳过确认提示 | 否 |

### 功能说明

`colyn init` 会根据当前目录的状态采取不同的初始化策略：

#### 1. 空目录
- 创建主分支目录、worktrees 目录和配置目录
- 配置环境变量文件
- 提示用户在主分支目录中初始化项目

#### 2. 已有项目
- 显示当前文件列表并询问用户确认
- 创建目录结构并移动所有文件到主分支目录
- 如果是 git 仓库，检查工作目录必须干净
- 配置环境变量和 .gitignore
- **自动检测工具链插件**（npm / Maven / Gradle / pip），写入 `.colyn/settings.json`
- 根据检测到的插件运行初始化（写入工具链运行配置、安装依赖等）

#### 3. 已初始化项目（补全模式）
- 检测缺失的部分并补全
- 不会覆盖已有配置
- 环境变量智能合并

### 示例

```bash
# 交互式询问端口
$ colyn init
? 请输入主分支开发服务器端口: (10000)

# 直接指定端口
$ colyn init --port 10000
$ colyn init -p 3000

# 非交互场景（CI/脚本）建议同时指定 --port 和 --yes
$ colyn init -p 3000 --yes
```

### 执行结果

初始化后的目录结构：

```
my-project/                 # 项目根目录
├── my-project/             # 主分支目录
│   ├── .git/              # Git 仓库（如果是 git 项目）
│   ├── src/               # 源代码
│   ├── .env.local         # PORT=10000, WORKTREE=main
│   ├── .gitignore         # 包含 .env.local 忽略规则
│   └── ...                # 其他项目文件
├── worktrees/             # Worktree 目录（初始为空）
└── .colyn/                # Colyn 配置目录
    └── settings.json      # 项目配置（包含 plugins 字段）
```

### 常见错误

| 错误场景 | 错误信息 | 解决方法 |
|---------|---------|---------|
| 工作目录不干净 | `✗ 工作目录不干净，存在未提交的更改` | 运行 `git add .` 和 `git commit`，或 `git stash` |
| 目录名冲突 | `✗ 主分支目录名与现有文件冲突` | 重命名或删除与主分支目录同名的文件 |
| 无效端口号 | `✗ 无效的端口号` | 输入 1-65535 之间的端口号 |

### 提示

- 初始化是所有其他 Colyn 命令的前置条件
- 端口号可以在主分支目录的 `.env.local` 中随时修改
- 补全模式只添加缺失部分，不会覆盖已有配置
- 在非交互环境中，请显式传入 `--port`；已有项目场景建议配合 `--yes`

---

## colyn add

为指定分支创建新的 Worktree。`branch` 参数可选，省略时进入交互式分支选择。

### 语法

```bash
colyn add [branch]
```

### 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `branch` | 否 | 分支名称（支持本地分支、远程分支或新建分支） |

### 功能说明

`colyn add` 有两种入口：

1. **带 `branch` 参数**：直接按参数执行
2. **不带 `branch` 参数**：进入交互式选择器，按以下顺序展示
   - `[新建分支]`（默认选中）
   - `pending` Todo 对应分支
   - 本地已有分支（已排除主分支）

交互式创建分支时，会先选择 `type`，再输入 `name`，最终拼接为 `type/name`。

如果在交互式列表中选择的是 `pending` Todo 对应分支，`add` 成功后会执行与 `todo start` 一致的后置动作：
- 将该 Todo 标记为 `completed`
- 在终端输出该 Todo 的 message
- 自动复制该 message 到系统剪贴板

`colyn add` 会智能处理分支：

1. **本地分支存在** - 直接使用本地分支创建 Worktree
2. **远程分支存在** - 自动创建本地跟踪分支
3. **分支不存在** - 基于主分支创建新分支

创建的 Worktree 会：
- 自动分配 ID（递增）
- 自动分配端口号（主端口 + ID）
- 复制主分支环境变量并更新 PORT 和 WORKTREE
- 执行后自动切换到 Worktree 目录

**tmux 集成**（如果在 tmux 中）：
- 自动创建新的 tmux window
- 设置 3-pane 布局（Claude Code + Dev Server + Bash）
- 自动切换到新 window
- 如果使用 iTerm2，自动设置 tab title

### 示例

```bash
# 不带参数：交互式选择（默认选中 [新建分支]）
$ colyn add

# 创建新分支的 worktree
$ colyn add feature/login

# 基于已有本地分支创建 worktree
$ colyn add bugfix/auth-error

# 从远程分支创建 worktree（自动去除 origin/ 前缀）
$ colyn add origin/feature/payment

# 执行后自动切换到 worktree 目录
$ pwd
/path/to/worktrees/task-1
```

### 执行结果

```
✔ 使用本地分支: feature/login
✔ Worktree 创建完成: task-1
✔ 环境变量配置完成
✔ 配置文件更新完成

✓ Worktree 创建成功！

Worktree 信息：
  ID: 1
  分支: feature/login
  路径: /path/to/worktrees/task-1
  端口: 10001

后续操作：
  1. 启动开发服务器（端口已自动配置）：
     npm run dev

  2. 查看所有 worktree：
     colyn list

📂 已切换到: /path/to/worktrees/task-1
```

创建后的目录结构：

```
my-project/
├── my-project/                # 主分支目录 (PORT=10000)
└── worktrees/
    └── task-1/                # 新的 worktree (PORT=10001)
        ├── src/
        ├── .env.local         # PORT=10001, WORKTREE=1
        └── ...
```

### 常见错误

| 错误场景 | 错误信息 | 解决方法 |
|---------|---------|---------|
| 未初始化 | `✗ 当前目录未初始化` | 运行 `colyn init` |
| 分支已有 worktree | `✗ 分支已关联到现有 worktree` | 切换到已有 worktree，或删除后重建 |
| 分支名称无效 | `✗ 无效的分支名称` | 使用有效的分支名称（字母、数字、下划线、连字符和斜杠） |

### 提示

- ID 不会重用，即使删除了某个 worktree
- 可以在项目的任意位置运行此命令
- 分支名会自动去除 `origin/` 前缀
- 交互选择器中的本地分支会自动忽略主分支目录当前分支
- 交互选择器中若选择 Todo 分支，会自动完成 Todo 并复制 message 到剪贴板
- 命令执行后会自动切换到新创建的 worktree 目录

---

## colyn list

列出所有 Worktree。

### 语法

```bash
colyn list [选项]
```

### 选项

| 选项 | 短选项 | 说明 | 默认值 |
|------|--------|------|--------|
| `--json` | - | 以 JSON 格式输出 | 否 |
| `--paths` | `-p` | 只输出路径（每行一个） | 否 |
| `--no-main` | - | 不显示主分支 | 否（显示主分支） |
| `--refresh [interval]` | `-r` | 监听文件变化自动刷新（可选：刷新间隔秒数） | 否 |

### 功能说明

`colyn list` 提供四种输出模式：

#### 1. 表格格式（默认）
- 彩色输出，美观易读
- 当前所在 worktree 用 `→` 箭头标识
- 主分支 ID 显示为 `0-main`
- 显示 git 状态和与主分支的差异
- 响应式布局：根据终端宽度自动调整显示列

#### 2. JSON 格式（`--json`）
- 机器可读，便于脚本处理
- 包含完整信息
- 数组格式

#### 3. 路径格式（`--paths`）
- 每行一个路径（相对路径）
- 便于管道操作

#### 4. 自动刷新（`--refresh`）
- 自动监听文件变化并刷新表格
- 仅支持表格输出，不能与 `--json` 或 `--paths` 同时使用
- 默认按文件事件刷新；可选传入秒数参数作为刷新间隔（正整数）

### 示例

**表格格式（默认）：**

```bash
$ colyn list

ID    Branch            Port   Status      Diff   Path
  0-main   main         10000              -      my-app
  1   feature/login     10001  M:3         ↑2 ↓1  worktrees/task-1
→ 2   feature/dashboard 10002              ↑5     worktrees/task-2
```

**说明：**
- `→` 箭头标识当前所在的 worktree，整行青色高亮
- `Status`: 未提交修改统计（M:已修改 S:已暂存 ?:未跟踪）
- `Diff`: 与主分支的提交差异（↑领先 ↓落后 ✓已同步）

**JSON 格式：**

```bash
$ colyn list --json
```

```json
[
  {
    "id": null,
    "branch": "main",
    "port": 10000,
    "path": "my-app",
    "isMain": true,
    "isCurrent": false,
    "status": { "modified": 0, "staged": 0, "untracked": 0 },
    "diff": { "ahead": 0, "behind": 0 }
  },
  {
    "id": 1,
    "branch": "feature/login",
    "port": 10001,
    "path": "worktrees/task-1",
    "isMain": false,
    "isCurrent": false,
    "status": { "modified": 3, "staged": 1, "untracked": 2 },
    "diff": { "ahead": 2, "behind": 1 }
  }
]
```

**路径格式：**

```bash
$ colyn list --paths
my-app
worktrees/task-1
worktrees/task-2

# 只输出任务 worktree 路径
$ colyn list --paths --no-main
worktrees/task-1
worktrees/task-2
```

**自动刷新模式：**

```bash
# 监听文件变化自动刷新
$ colyn list -r

# 每 2 秒刷新一次
$ colyn list --refresh 2
```

### 脚本使用示例

```bash
# 在所有 worktree 中执行命令
$ colyn list --paths | xargs -I {} sh -c 'cd {} && git status'

# 统计 worktree 数量
$ colyn list --paths --no-main | wc -l

# 使用 jq 处理 JSON 输出
$ colyn list --json | jq '.[] | select(.isMain == false) | .path'
```

### 常见错误

| 错误场景 | 错误信息 | 解决方法 |
|---------|---------|---------|
| 项目未初始化 | `✗ 当前目录未初始化` | 运行 `colyn init` |
| 选项冲突 | `✗ --json 和 --paths 不能同时使用` | 选择其中一种输出格式 |
| 刷新模式冲突 | `✗ --refresh 不能与 --json 或 --paths 同时使用` | 切换为表格模式 |

### 提示

- 可以在项目的任意位置运行
- 路径输出为相对于项目根目录的相对路径
- 主分支的 ID 显示为 `0-main`
- 终端窄时表格会自动隐藏不重要的列

---

## colyn list-project

列出全局状态索引（`~/.colyn-status.json`）中的项目和 Worktree。

**别名：** `lsp`

### 语法

```bash
colyn list-project [选项]
colyn lsp [选项]        # 使用别名
```

### 选项

| 选项 | 短选项 | 说明 | 默认值 |
|------|--------|------|--------|
| `--json` | - | 以 JSON 格式输出 | 否 |
| `--paths` | `-p` | 只输出路径（每行一个） | 否 |

### 功能说明

`colyn list-project` 通过全局状态索引文件 `~/.colyn-status.json` 获取项目列表，并显示每个项目的 worktree 信息。

**核心特性：**
- 跨项目查看：一次性查看全局状态索引中的 colyn 项目
- 完全复用 `list` 命令的数据结构和输出格式
- 支持三种输出模式：表格、JSON、路径

**与 `list` 命令的区别：**
- `list` - 查看**当前项目**的所有 worktree
- `list-project` - 查看**全局状态索引中项目**的所有 worktree

**要求：**
- `~/.colyn-status.json` 中存在项目索引记录
- 项目目录结构有效（包含 `.colyn/`、`{project}/{project}` 主目录、`worktrees/`）

### 示例

**表格格式（默认）：**

```bash
$ colyn list-project

┌─────────┬──────────────────┬───────────┬─────────────────────┐
│ Project │ Path             │ Worktrees │ Updated             │
├─────────┼──────────────────┼───────────┼─────────────────────┤
│ backend │ /path/to/backend │ 2         │ 2026/02/23 20:30:00 │
│ colyn   │ /path/to/colyn   │ 4         │ 2026/02/23 20:28:11 │
└─────────┴──────────────────┴───────────┴─────────────────────┘

backend 的 Worktrees:
┌──────────┬──────────────┬──────┬────────┬──────┬──────────────────┐
│ ID       │ Branch       │ Port │ Status │ Diff │ Path             │
├──────────┼──────────────┼──────┼────────┼──────┼──────────────────┤
│   0-main │ develop      │ 3010 │        │ -    │ backend          │
│   1      │ feature/auth │ 3011 │        │ ✓    │ worktrees/task-1 │
└──────────┴──────────────┴──────┴────────┴──────┴──────────────────┘
```

**路径格式：**

```bash
$ colyn list-project --paths
/path/to/backend/backend
/path/to/backend/worktrees/task-1
/path/to/colyn/colyn
/path/to/colyn/worktrees/task-1
```

### 脚本使用示例

```bash
# 在所有项目的所有 worktree 中运行 git status
$ colyn list-project --paths | xargs -I {} sh -c 'echo "=== {} ===" && cd {} && git status'

# 统计总的 worktree 数量
$ colyn list-project --paths | wc -l

# 查看特定项目的 worktree
$ colyn list-project --json | jq '.[] | select(.projectName == "colyn")'
```

### 常见错误

| 错误场景 | 错误信息 | 解决方法 |
|---------|---------|---------|
| 全局状态索引为空 | `暂无项目` | 在项目内执行 `colyn status set running`（或其他状态）写入索引 |
| 选项冲突 | `✗ --json 和 --paths 不能同时使用` | 选择其中一种输出格式 |

---

## colyn merge

将 Worktree 分支合并回主分支。

### 语法

```bash
colyn merge [target] [选项]
```

### 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `target` | 否 | 支持以下形式：<br>- 数字：按 ID 查找（如 `1`）<br>- 分支名：按分支名查找（如 `feature/login`）<br>- 不传：自动识别当前 worktree |

### 选项

| 选项 | 说明 |
|------|------|
| `--no-rebase` | 使用 merge 而非 rebase 更新 worktree |
| `--no-update` | 合并后不自动更新当前 worktree |
| `--update-all` | 合并后更新所有 worktrees |
| `--no-fetch` | 跳过从远程拉取主分支最新代码 |
| `--skip-build` | 跳过 lint 和 build 检查 |
| `--verbose` / `-v` | 显示 lint/build 的完整命令输出（失败时） |

### 功能说明

`colyn merge` 采用两步合并策略，使用 `--no-ff` 保持清晰的分支历史：

**步骤 1：在 Worktree 中更新主分支代码**
- 在 worktree 中执行 `git rebase main`
- 如果有冲突，在 worktree 中解决（不影响主分支）

**步骤 2：在主分支中合并 Worktree 分支**
- 在主分支中执行 `git merge --no-ff <branch>`
- 强制创建合并提交，保持清晰的分支历史

**前置检查：**
- 主分支工作目录必须干净
- Worktree 工作目录必须干净
- 根据项目配置的工具链插件运行 lint 和编译检查

### 示例

```bash
# 在 worktree 目录中合并
$ cd worktrees/task-1
$ colyn merge

# 通过 ID 合并
$ colyn merge 1

# 通过分支名合并
$ colyn merge feature/login
```

### 处理合并冲突

如果在 worktree 中合并主分支时发生冲突：

```
✗ 变基主分支时发生冲突

解决步骤：
  1. 进入 worktree 目录解决冲突：
     cd worktrees/task-1
  2. 编辑冲突文件，解决冲突标记
  3. 添加已解决的文件：
     git add <file>
  4. 继续变基：
     git rebase --continue
  5. 重新运行合并命令：
     colyn merge feature/login
```

### 常见错误

| 错误场景 | 错误信息 | 解决方法 |
|---------|---------|---------|
| 主分支不干净 | `✗ 主分支目录有未提交的更改` | 提交或 stash 主分支的更改 |
| Worktree 不干净 | `✗ Worktree 目录有未提交的更改` | 提交 worktree 的更改 |
| Lint 检查失败 | `✗ Lint 检查失败` | 修复 lint 错误后重试 |
| 编译失败 | `✗ 编译失败` | 修复编译错误后重试 |

---

## colyn remove

删除不再需要的 Worktree。

### 语法

```bash
colyn remove [target] [选项]
```

### 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `target` | 否 | 支持以下形式：<br>- 数字：按 ID 查找（如 `1`）<br>- 分支名：按分支名查找（如 `feature/login`）<br>- 不传：自动识别当前 worktree |

### 选项

| 选项 | 短选项 | 说明 |
|------|--------|------|
| `--force` | `-f` | 强制删除（忽略未提交的更改） |
| `--yes` | `-y` | 跳过所有确认提示（默认保留本地分支） |

### 功能说明

`colyn remove` 安全地删除 worktree：

**前置检查：**
- 检查未提交更改（有更改时拒绝删除，除非 `--force`）
- 检查分支合并状态（未合并时显示警告）

**删除流程：**
1. 显示将要删除的 worktree 信息
2. 询问用户确认（可用 `--yes` 跳过）
3. 执行 `git worktree remove`
4. 询问是否同时删除本地分支（`--yes` 时跳过并默认保留）
5. 如果当前在被删除的 worktree 中，自动切换到主分支目录

### 示例

```bash
# 在 worktree 目录中删除
$ cd worktrees/task-1
$ colyn remove

# 通过 ID 删除
$ colyn remove 1

# 通过分支名删除
$ colyn remove feature/login

# 强制删除（忽略未提交更改）
$ colyn remove 1 --force

# 快速删除（跳过确认）
$ colyn remove 1 -y
```

### 常见错误

| 错误场景 | 错误信息 | 解决方法 |
|---------|---------|---------|
| Worktree 不存在 | `✗ 找不到 worktree` | 检查 ID 或分支名，运行 `colyn list` 查看 |
| 有未提交更改 | `✗ 无法删除：存在未提交的更改` | 提交更改或使用 `--force` |

### 提示

- 删除前会检查未提交更改，防止意外丢失工作
- 未合并分支只显示警告，允许继续删除
- 如果当前在被删除的 worktree 中，会自动切换到主分支目录
- 可以在项目的任意位置运行
