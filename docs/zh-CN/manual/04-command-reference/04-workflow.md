# 命令参考 — 工作流工具

[← 返回命令参考](README.md)

---

## colyn release

发布新版本。

### 语法

```bash
colyn release [version-type] [选项]
```

### 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `version-type` | 否 | 版本类型或显式版本号（默认：`patch`）：<br>- `patch` / `minor` / `major`<br>- 显式版本号：`1.2.3` |

### 选项

| 选项 | 说明 |
|------|------|
| `--no-update` | 跳过发布后自动更新所有 worktree |
| `--no-build` | 跳过 lint 和 build 步骤（适用于已在 CI 中验证或紧急发布） |
| `--no-version-update` | 跳过读取版本、更新版本号、commit 和打 tag，仅推送当前分支 |
| `--no-tag` | 仅跳过打 tag，版本号仍会更新并推送分支 |
| `--verbose` / `-v` | 显示 install/lint/build 的完整命令输出（失败时） |

### 功能说明

`colyn release` 提供统一的发布入口，无论从哪个目录执行，始终在主分支中完成发布，并默认自动将最新代码同步到所有 worktree。

**执行流程：**
1. 检查当前目录是否有未提交代码
2. 检查当前分支是否已合并（仅在 worktree 中执行时）
3. 检查 git 状态（主分支）
4. 安装依赖（使用配置的包管理器命令）
5. 运行 lint 和 build
6. 更新 package.json 版本
7. 创建提交与 tag
8. 推送到远程
9. **自动更新所有 worktree（除非使用 `--no-update`）**

### 运行位置规则

- 必须在项目目录内执行（主分支或任意 Worktree 目录）
- 不允许在项目目录外执行
- 实际执行路径始终为主分支目录

### 示例

```bash
# 快速发布 patch 版本（最常用）
$ colyn release
✓ 发布 v1.2.4 成功
正在更新所有 worktree...
✓ 所有 worktree 已更新

# 在 worktree 中发布
$ cd worktrees/task-1
$ colyn release patch

# 在主分支中发布 minor 版本
$ cd my-project
$ colyn release minor

# 发布指定版本号
$ colyn release 1.2.3

# 发布但不自动更新 worktree
$ colyn release --no-update

# 跳过 lint 和 build（已在 CI 中验证过）
$ colyn release patch --no-build

# 仅推送当前分支，不动版本号也不打 tag（例如只想触发部署流水线）
$ colyn release --no-version-update

# 更新版本并推送分支，但不创建 tag（由 CI 统一打 tag）
$ colyn release patch --no-tag
```

### 常见错误

| 错误场景 | 错误信息 | 解决方法 |
|---------|---------|---------|
| 在项目外执行 | `✗ 当前目录不属于 Colyn 项目` | 在项目目录内执行 |
| 当前目录有未提交代码 | `✗ 当前目录有未提交的更改` | 提交或 stash 更改 |
| 当前分支未合并 | `✗ 分支未合并到主分支` | 先合并分支：`colyn merge <branch>` |

### 提示

- **最常用方式**：直接运行 `colyn release` 即可发布 patch 版本
- 无需手动切换到主分支目录
- 包管理器命令通过 `colyn config set systemCommands.npm <命令>` 配置（默认 `npm`）
- 默认自动更新所有 worktree，确保所有开发分支基于最新版本

---

## colyn update

将主分支的最新代码更新到 worktree。**默认更新所有 worktree。**

### 语法

```bash
colyn update [target] [选项]
```

### 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `target` | 否 | 支持以下形式：<br>- 数字：按 ID 查找（如 `1`）<br>- 分支名：按分支名查找（如 `feature/login`）<br>- 不传：默认更新**所有** worktree |

### 选项

所有开关型选项都有正 / 反两种形式，默认值可通过 `.colyn/settings.json` 的 `commands.update.*` 覆盖（见配置手册）。

| 选项 | 默认 | 说明 |
|------|------|------|
| `--rebase` / `--no-rebase` | `--rebase` | 更新时使用 rebase；`--no-rebase` 改用 merge |
| `--fetch` / `--no-fetch` | `--fetch` | 更新前是否从远程 fetch 主分支最新代码 |
| `--all` / `--no-all`（别名 `--current-only`） | `--all` | 更新范围：所有 worktree 还是仅当前 worktree |

### 功能说明

`colyn update` 用主分支的最新代码同步 worktree：

- 默认先从远程 `fetch` 主分支最新代码（`--no-fetch` 跳过）
- 默认使用 `rebase` 将主分支代码应用到 worktree 分支（`--no-rebase` 改用 merge）
- **不传 `target` 时默认更新所有 worktree**；指定 `target`（ID 或分支名）或使用 `--current-only` 时，仅更新对应的单个 worktree

> 与 `colyn merge` 的关系：merge 完成后会自动触发同样的更新流程（见 `colyn merge` 的"步骤 3"）。

### 示例

```bash
# 更新所有 worktree（默认）
$ colyn update

# 仅更新当前 worktree
$ colyn update --current-only

# 通过 ID 更新指定 worktree
$ colyn update 1

# 通过分支名更新
$ colyn update feature/login

# 跳过 fetch（离线场景）
$ colyn update --no-fetch
```

---

## colyn todo

管理项目的 Todo 任务列表，与并行 Vibe Coding 工作流深度集成。

### 语法

```bash
colyn todo [子命令] [选项]
```

不带子命令时等同于 `colyn todo list`，显示所有待办任务。

### 子命令

| 子命令 | 说明 |
|--------|------|
| `add [todoId] [message...]` | 添加 Todo 任务 |
| `start [todoId]` | 开始执行任务（切换分支 + 复制描述到剪贴板） |
| `list` / `ls` | 列出任务（默认显示待办） |
| `edit [todoId] [message]` | 编辑 Todo 任务的描述 |
| `remove [todoId]` | 删除任务（省略时交互式选择） |
| `archive` | 归档所有已完成任务 |
| `complete [todoId]` | 将待办任务标记为已完成 |
| `uncomplete [todoId]` | 将已完成任务回退为待办 |

### Todo ID 格式

Todo ID 采用 `{type}/{name}` 格式，与 Git 分支名一致：

```
feature/login
bugfix/fix-crash
refactor/auth-module
document/api-guide
```

**支持的类型**：`feature` / `bugfix` / `refactor` / `document`

---

### colyn todo add

添加新的待办任务。所有参数均为可选，无参数时进入完全交互式模式。

#### 语法

```bash
colyn todo add [todoId] [message...]
```

#### 参数

| 参数 | 说明 |
|------|------|
| `todoId` | Todo ID（格式：`type/name`），省略时交互式选择 |
| `message...` | 任务描述，可包含空格且无需引号（多个词会自动拼接）；省略时打开编辑器（支持 Markdown） |

#### 示例

```bash
# 完全交互式（选择 type → 输入 name → 编辑器输入描述）
$ colyn todo add

# 指定 ID，描述通过编辑器输入
$ colyn todo add feature/login

# 全部直接指定（描述可加引号）
$ colyn todo add feature/login "实现用户登录功能"

# 描述也可不加引号，多个词会自动拼接
$ colyn todo add feature/login 实现用户登录功能
```

#### 编辑器说明

无 `message` 参数时，自动打开编辑器（优先使用 `$VISUAL`，其次 `$EDITOR`，默认 `vim`）。以 `# ` 开头的行为注释，保存退出后自动过滤。文件格式为 `.md`，支持 Markdown 语法。

---

### colyn todo start

开始执行待办任务：在当前 Worktree 切换/创建对应分支，并将任务描述复制到剪贴板。

#### 语法

```bash
colyn todo start [选项] [todoId]
```

`todoId` 为可选参数。不指定时，交互式展示所有待办任务供选择。

#### 选项

| 选项 | 说明 |
|------|------|
| `--no-clipboard` | 跳过复制描述到剪贴板 |

#### 执行过程

1. 若未指定 `todoId`，列出所有 `pending` 任务并交互式选择；无待办任务则退出
2. 在当前 Worktree 切换到 `{type}/{name}` 分支（若不存在则创建）
3. 将 todo 状态标记为 `completed`
4. 在终端输出任务描述（message）
5. 将任务描述复制到剪贴板（macOS / Linux / Windows 均支持）

#### 示例

```bash
# 不带参数：交互式选择待办任务
$ colyn todo start
? 选择要开始的任务 ›
❯ feature/login    实现用户登录功能，支持邮箱和手机号…
  bugfix/fix-crash  修复应用崩溃问题

# 直接指定任务 ID
$ colyn todo start feature/login

✓ Todo "feature/login" 已标记为完成

任务描述：
实现用户登录功能，支持邮箱和手机号两种方式
- 添加登录表单
- 验证用户凭据

✓ 已复制到剪贴板

# 跳过剪贴板操作
$ colyn todo start feature/login --no-clipboard
```

**交互式选择说明**：
- 每行只显示 message 首行，按终端宽度自动截断
- 选中某项时，列表下方会显示该任务 message 的前 4 行内容作为预览

**典型工作流**：`todo start` 后直接打开 Claude Code，将剪贴板内容粘贴到输入框，作为本次会话的任务上下文。

---

### colyn todo list

列出 Todo 任务。

#### 语法

```bash
colyn todo list [选项]
colyn todo ls [选项]
colyn todo           # 不带子命令时等同于此命令
```

#### 选项

| 选项 | 说明 |
|------|------|
| `--completed` | 显示已完成（`completed`）的任务 |
| `--archived` | 显示已归档的任务 |
| `--id-only` | 仅输出 Todo ID（每行一个），用于脚本集成 |
| `--json` | 以 JSON 格式输出任务列表 |

#### 示例

```bash
# 显示待办任务（默认）
$ colyn todo
  Type     Name       Message                    Status  Created
  ---------------------------------------------------------------
  feature  login      实现用户登录功能，支持邮…    待办    2026/02/22 10:00
  bugfix   fix-crash  修复应用崩溃问题              待办    2026/02/22 11:30

# 显示已完成任务
$ colyn todo list --completed

# 仅输出 ID（用于脚本）
$ colyn todo list --id-only
feature/login
bugfix/fix-crash

# 以 JSON 格式输出（用于脚本集成）
$ colyn todo list --json
[
  {
    "type": "feature",
    "name": "login",
    "message": "实现用户登录功能",
    "status": "pending",
    "createdAt": "2026-02-22T10:00:00.000Z"
  }
]

# JSON 格式输出已完成任务
$ colyn todo list --json --completed

# JSON 格式输出归档任务（含 archivedAt 字段）
$ colyn todo list --json --archived
```

---

### colyn todo edit

编辑已有 Todo 任务的描述。

#### 语法

```bash
colyn todo edit [todoId] [message]
```

#### 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `todoId` | 否 | 格式为 `{type}/{name}`；省略时交互式选择 |
| `message` | 否 | 新的描述文本；省略时打开 `$EDITOR`（默认 vim）编辑 |

#### 行为逻辑

- 无 `todoId`：显示所有 Todo 的交互式选择列表
- 无 `message`：通过 `$VISUAL` / `$EDITOR` / `vim` 打开编辑器
- Todo 已完成（`completed`）：询问是否改回 `pending`；拒绝则退出

#### 示例

```bash
# 直接指定 todoId 和新描述
$ colyn todo edit feature/login "优化用户登录界面与认证流程"
✓ Todo "feature/login" 的描述已更新

# 只指定 todoId，用编辑器修改
$ colyn todo edit feature/login

# 两者都不指定，交互式选择后再编辑
$ colyn todo edit
? 请选择要编辑的 Todo 任务
❯ feature/login  (待办: 实现用户登录功能)
```

---

### colyn todo remove

删除一个 Todo 任务。

#### 语法

```bash
colyn todo remove [todoId] [选项]
```

#### 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `todoId` | 否 | 要删除的 Todo ID；省略时交互式选择 |

#### 选项

| 选项 | 短选项 | 说明 |
|------|--------|------|
| `--yes` | `-y` | 跳过确认直接删除 |

#### 示例

```bash
# 交互式选择要删除的任务
$ colyn todo remove
? 选择要删除的任务
❯ feature/login  (待办)
  bugfix/crash   (待办)

# 直接删除指定任务
$ colyn todo remove feature/login
? 确认删除 Todo "feature/login"？ (y/N) y
✓ 已删除 Todo: feature/login

# 跳过确认直接删除
$ colyn todo remove feature/login -y
✓ 已删除 Todo: feature/login
```

---

### colyn todo archive

将所有 `completed` 状态的任务批量归档，移入 `.colyn/archived-todo.json`。

#### 语法

```bash
colyn todo archive [选项]
```

#### 选项

| 选项 | 短选项 | 说明 |
|------|--------|------|
| `--yes` | `-y` | 跳过确认直接归档 |

#### 示例

```bash
# 交互式确认归档
$ colyn todo archive
? 确认归档 3 个已完成的任务？ (Y/n)

# 直接归档（无需确认）
$ colyn todo archive -y
✓ 已归档 3 个任务
```

---

### colyn todo uncomplete

将 `completed` 状态的任务回退为 `pending`（清除 `startedAt` 和 `branch` 记录）。省略 `todoId` 时，自动使用当前 Worktree 的分支名。

#### 语法

```bash
colyn todo uncomplete [todoId]
```

#### 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `todoId` | 否 | 要回退的 Todo ID；省略时使用当前分支名 |

#### 示例

```bash
# 在 feature/login Worktree 中直接执行（自动推断）
$ colyn todo uncomplete
ℹ 使用当前分支名: feature/login
✓ Todo "feature/login" 已回退为待办状态

# 显式指定 ID
$ colyn todo uncomplete feature/login
✓ Todo "feature/login" 已回退为待办状态
```

---

### colyn todo complete

将 `pending` 状态的任务标记为 `completed`。省略 `todoId` 时，交互式选择待办任务。

#### 语法

```bash
colyn todo complete [todoId]
```

#### 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `todoId` | 否 | 要标记完成的 Todo ID；省略时交互式选择 |

#### 示例

```bash
# 交互式选择待办任务
$ colyn todo complete
? 选择要完成的任务
❯ feature/login
  bugfix/fix-crash
✓ Todo "feature/login" 已标记为完成

# 显式指定 ID
$ colyn todo complete feature/login
✓ Todo "feature/login" 已标记为完成
```

---

### 数据存储

| 文件 | 说明 |
|------|------|
| `.colyn/todo.json` | 所有活跃 Todo（pending + completed） |
| `.colyn/archived-todo.json` | 已归档的 Todo |

所有 Worktree 共享同一份 todo 数据。

### 推荐工作流

```bash
# 1. 规划任务
colyn todo add feature/login "实现用户登录功能"
colyn todo add feature/dashboard "实现数据仪表盘"

# 2. 查看待办
colyn todo list

# 3. 开始任务（切换分支并获取任务上下文）
colyn todo start feature/login
# → 将任务描述粘贴到 Claude Code 输入框

# 4. 开发完成后合并
colyn merge feature/login

# 5. 归档已完成任务
colyn todo archive -y
```

### 常见错误

| 错误场景 | 错误信息 | 解决方法 |
|---------|---------|---------|
| Todo ID 格式错误 | `✗ Todo ID 格式错误，应为 {type}/{name}` | 使用正确格式，如 `feature/login` |
| Todo 不存在 | `✗ Todo "xxx" 不存在` | 先用 `todo add` 添加，或用 `colyn todo list` 查看 |
| Todo 不是待办状态 | `✗ Todo "xxx" 不是待办状态` | 使用 `colyn todo uncomplete` 回退后再 start |
| 重复添加 | `✗ Todo "xxx" 已存在` | 每个 type/name 只能添加一次 |

### 提示

- `colyn todo` 不带任何参数即可查看待办列表，是最常用的调用方式
- `todo start` 执行的是完整的 `colyn checkout` 流程，包括未提交检查、fetch 远程、归档旧日志等
- 需要新建 worktree 时，使用 `colyn add [branch]`；不传 `branch` 可交互选择（新建分支 / Todo 分支 / 本地分支）
- 复用现有 worktree 时，使用 `colyn checkout [branch]`；不传 `branch` 同样可交互选择（新建分支 / Todo 分支 / 本地分支）
- 在 `add/checkout` 交互列表中选择 Todo 分支时，也会像 `todo start` 一样输出 message、复制到剪贴板，并将 Todo 标记为完成
- `todo complete` 只更新任务状态，不会触发分支切换与剪贴板复制
- 描述（message）支持完整的 Markdown 语法，有助于在 Claude 会话中提供清晰的上下文
- 定期执行 `colyn todo archive -y` 可保持待办列表整洁
- 设置 `$EDITOR` 环境变量可以使用自己喜欢的编辑器编辑描述
