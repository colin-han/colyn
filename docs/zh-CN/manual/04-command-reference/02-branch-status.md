# 命令参考 — 分支与状态

[← 返回命令参考](README.md)

---

## colyn checkout

在 Worktree 中切换或创建分支。

### 语法

```bash
colyn checkout [worktree-id] [branch] [选项]

# 别名
colyn co [worktree-id] [branch] [选项]
```

### 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `worktree-id` | 否 | Worktree 的 ID，省略时使用当前 worktree |
| `branch` | 否 | 目标分支名称，省略时交互式选择 |

### 选项

| 选项 | 说明 |
|------|------|
| `--fetch` | 切换前从远程获取分支信息（默认行为） |
| `--no-fetch` | 跳过从远程获取分支信息 |

> **关于 fetch 行为：** fetch 默认开启，切换前会先从远程获取分支信息；fetch 成功后还会顺带更新主分支（如果主分支落后于远程）。使用 `--no-fetch` 会同时跳过 fetch 和主分支更新这两个步骤。

### 功能说明

`colyn checkout` 允许在 worktree 中切换分支，复用已有 worktree 进行不同分支的开发。

如果需要创建新的 worktree，请使用 `colyn add [branch]`（省略 `branch` 可交互式选择）。

`colyn checkout` 有两种入口：

1. **带 `branch` 参数**：直接切换到目标分支
2. **不带 `branch` 参数**：进入交互式选择器，按以下顺序展示
   - `[新建分支]`（默认选中）
   - `pending` Todo 对应分支
   - 本地已有分支（已排除主分支）

交互式创建分支时，会先选择 `type`，再输入 `name`，最终拼接为 `type/name`。

如果在交互式列表中选择的是 `pending` Todo 对应分支，`checkout` 成功后会执行与 `todo start` 一致的后置动作：
- 将该 Todo 标记为 `completed`
- 在终端输出该 Todo 的 message
- 自动复制该 message 到系统剪贴板

**前置检查：**
- 有未提交更改 → 拒绝切换
- 当前分支未合并到主分支 → 警告并要求确认
- 目标分支是主分支 → 拒绝切换
- 目标分支已在其他 worktree 使用 → 拒绝切换

**分支处理：**
1. 本地分支存在 → 直接切换
2. 远程分支存在 → 自动创建本地分支并跟踪远程
3. 分支不存在 → 自动创建新分支

**日志归档：**
- 切换成功后，自动归档当前分支的工作日志到 `.claude/logs/archived/<旧分支名>/`

**旧分支清理：**
- 如果旧分支已合并到主分支，提示用户是否删除

**tmux 集成：**
- 在 tmux 中，自动更新 window 名称为新分支名
- 如果使用 iTerm2，自动更新 tab title

### 示例

**不带参数：交互式选择分支：**

```bash
$ colyn checkout
# 或使用别名
$ colyn co
```

**在当前 worktree 中切换分支：**

```bash
$ cd worktrees/task-1
$ colyn checkout feature/new-login
# 或使用别名
$ colyn co feature/new-login
```

**指定 worktree ID 切换分支：**

```bash
$ colyn checkout 1 feature/new-login
$ colyn co 1 feature/new-login
```

**跳过远程获取：**

```bash
$ colyn checkout feature/test --no-fetch
```

### 执行结果（旧分支已合并）

```
✓ 已切换到分支 feature/new-login

✓ 分支 feature/old 已合并到主分支
? 是否删除旧分支 feature/old？ (Y/n) y
✓ 已删除分支 feature/old

日志已归档到: .claude/logs/archived/feature-old/

📂 已切换到: /path/to/worktrees/task-1
```

### 常见错误

| 错误场景 | 错误信息 | 解决方法 |
|---------|---------|---------|
| 有未提交更改 | `✗ worktree 中有未提交的更改` | 提交更改或使用 `git stash` |
| 目标分支已被使用 | `✗ 分支已在其他 worktree 中使用` | 切换到对应 worktree，或使用其他分支名 |
| 目标是主分支 | `✗ 不能在 worktree 中切换到主分支` | 直接使用主分支目录 |

### 提示

- 可以复用已有 worktree 进行不同分支的开发
- 不传 `branch` 时可交互选择（新建分支 / Todo 分支 / 本地分支）
- 交互选择器中若选择 Todo 分支，会自动完成 Todo 并复制 message 到剪贴板
- 切换前会自动归档 `.claude/logs/` 目录下的日志文件
- fetch 成功后会自动更新主分支（如果主分支落后于远程）
- 已合并的旧分支可选删除

---

## colyn info

显示当前目录的项目信息。

### 语法

```bash
colyn info [选项]
```

### 选项

| 选项 | 短选项 | 说明 |
|------|--------|------|
| `--short` | `-S` | 输出简短标识符（带分支信息），支持降级 |
| `--field=<name>` | `-f <name>` | 输出指定字段（可多次使用） |
| `--format=<template>` | - | 使用模板字符串格式化输出 |
| `--separator=<char>` | `-s <char>` | 多字段时的分隔符（默认 tab） |

### 可用字段

| 字段名 | 说明 | 示例值 |
|--------|------|--------|
| `project` | 主目录名称 | `myapp` |
| `project-path` | 主目录完整路径 | `/Users/me/work/myapp` |
| `worktree-id` | Worktree ID（主分支为 0） | `1` |
| `worktree-dir` | Worktree 目录名 | `task-1` |
| `worktree-path` | Worktree 目录完整路径 | `/Users/me/work/myapp/worktrees/task-1` |
| `branch` | 当前分支名称 | `feature/login` |
| `status` | 工作流状态（`idle`/`running`/`waiting-confirm`/`finish`） | `running` |
| `last-updated-at` | 状态最后更新时间（ISO 8601，未设置时为空字符串） | `2026-02-22T10:00:00.000Z` |

### 功能说明

`colyn info` 支持多种输出格式，适应不同使用场景：

#### 1. 简短标识符（`--short`）
- 输出格式：`{project}/{worktree-dir} (⎇ {branch})`
- 支持智能降级：Colyn 项目 → Git 仓库 → 普通目录
- 推荐用于 shell 提示符

#### 2. 完整信息（默认）
- 显示所有字段，带颜色和图标
- 便于人工查看

#### 3. 字段输出（`--field`）
- 输出纯文本，适合脚本使用
- 可指定多个字段

#### 4. 模板格式（`--format`）
- 使用 `{field-name}` 占位符
- 灵活的自定义格式

### 示例

**显示完整信息（默认）：**

```bash
$ colyn info
📁 Project:       myapp
📂 Project Path:  /Users/me/work/myapp
🔢 Worktree ID:   1
📁 Worktree Dir:  task-1
📂 Worktree Path: /Users/me/work/myapp/worktrees/task-1
🌿 Branch:        feature/login
⚡ Status:        running
📅 Last Updated:  2026-02-22 18:00:04
```

**输出简短标识符（推荐用于 shell 提示符）：**

```bash
# 在 colyn 项目中
$ colyn info --short
myapp/task-1 (⎇ feature/login)

# 在 git 仓库中（未初始化 colyn）
$ colyn info --short
my-repo (⎇ main)

# 在非 git 目录中
$ colyn info --short
my-folder
```

**在 shell 提示符中使用：**

```bash
# 添加到 .zshrc 或 .bashrc
PS1='[$(colyn info -S)] $ '

# 效果
[myapp/task-1 (⎇ feature/login)] $
```

**获取单个字段：**

```bash
$ colyn info -f branch
feature/login

$ colyn info -f status
running
```

**获取多个字段：**

```bash
# 默认用 tab 分隔
$ colyn info -f project -f branch
myapp	feature/login

# 自定义分隔符
$ colyn info -f project -f branch -s "/"
myapp/feature/login
```

**模板字符串格式化：**

```bash
$ colyn info --format="{project}/{worktree-dir}"
myapp/task-1

$ colyn info --format="[{status}] {project}/{worktree-dir}"
[running] myapp/task-1
```

### 位置要求

**使用 `--short` 选项：**
- 支持在任何位置运行，会自动降级

**使用其他选项：**
- 必须在主分支目录或 worktree 目录中执行
- 在其他位置执行会报错

### 常见错误

| 错误场景 | 错误信息 | 解决方法 |
|---------|---------|---------|
| 不在工作目录 | `✗ 当前目录不在 worktree 或主分支中` | 切换到主分支目录或 worktree 目录 |
| 无效字段名 | `✗ 无效的字段名` | 使用正确的字段名 |

### 提示

- `--short` 选项支持智能降级，可在任何目录使用
- 适合集成到 shell 提示符、终端标题或日志前缀
- `status` 和 `last-updated-at` 字段可与 `colyn status set` 联动，追踪工作流进度

---

## colyn status

查询或设置当前 Worktree 的工作流状态。

### 语法

```bash
colyn status [get] [--json]
colyn status set <status>
```

- `get` 为可选子命令，`colyn status` 与 `colyn status get` 等价
- 别名：`st`

### 子命令

#### `colyn status get`（默认）

获取当前 Worktree 的工作流状态。

| 选项 | 说明 |
|------|------|
| `--json` | 以 JSON 格式输出 |

#### `colyn status set <status>`

设置当前 Worktree 的工作流状态。

| 参数 | 说明 |
|------|------|
| `<status>` | 状态值：`idle` \| `running` \| `waiting-confirm` \| `finish` |

### 状态值说明

| 状态值 | 含义 |
|--------|------|
| `idle` | 空闲，没有正在进行的任务 |
| `running` | 运行中，Claude 正在处理任务 |
| `waiting-confirm` | 等待用户确认 |
| `finish` | 已完成，等待合并 |

### 示例

**查询状态（人类可读）：**

```bash
$ colyn status
Status:   running
Updated:  2026-02-22 18:00:04
```

**从未设置时：**

```bash
$ colyn status
Status:   idle
Updated:  （从未设置）
```

**JSON 格式输出：**

```bash
$ colyn status --json
{"worktreeDir":"task-1","worktreeId":1,"status":"running","updatedAt":"2026-02-22T10:00:04.000Z"}

$ colyn status get --json
{"worktreeDir":"task-1","worktreeId":1,"status":"running","updatedAt":"2026-02-22T10:00:04.000Z"}
```

**设置状态：**

```bash
$ colyn status set running
✓ 状态已更新: running

$ colyn status set finish
✓ 状态已更新: finish

$ colyn status set invalid
✗ 无效的状态值: invalid
  有效状态: idle, running, waiting-confirm, finish
```

### 自动重置

以下命令成功执行后，对应 Worktree 状态会自动重置为 `idle`：

- `colyn add`：创建新 Worktree 后
- `colyn checkout`：切换分支后
- `colyn merge`：合并到主分支后

### 状态文件

状态持久化到以下两个文件：

| 文件 | 说明 |
|------|------|
| `{projectRoot}/.colyn/status.json` | 项目级状态（各 Worktree 的状态） |
| `~/.colyn-status.json` | 全局索引（记录有活跃状态的项目路径） |

### 与 colyn info 的关系

`colyn info` 读取状态文件，提供 `status` 和 `last-updated-at` 字段：

```bash
$ colyn info -f status
running

$ colyn info --format="[{status}] {project}/{worktree-dir}"
[running] myapp/task-1
```

### 常见错误

| 错误场景 | 错误信息 | 解决方法 |
|---------|---------|---------|
| 不在 colyn 项目中 | `✗ 当前目录不是 colyn 项目` | 切换到 colyn 项目目录 |
| 无效状态值 | `✗ 无效的状态值: xxx` | 使用有效状态值 |
