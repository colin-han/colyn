# tmux 集成

本章介绍 Colyn 的 tmux 集成功能，让你在一个终端窗口中高效管理多个 worktree。

---

## 什么是 tmux 集成？

### tmux 简介

tmux（terminal multiplexer）是一个终端复用器，允许你在一个终端窗口中创建、管理和切换多个终端会话。

**核心概念**：

```
Session (会话)
├── Window 0 (窗口)
│   ├── Pane 0 (窗格)
│   ├── Pane 1
│   └── Pane 2
├── Window 1
│   ├── Pane 0
│   └── Pane 1
└── Window 2
    └── Pane 0
```

### Colyn + tmux 的价值

Colyn 的 tmux 集成让"并行 Vibe Coding"体验升级：

**之前（仅使用 Git Worktree）**：
- ✅ 多个 AI 可以并行工作
- ✅ Git worktree 提供代码隔离
- ⚠️ 需要管理多个终端窗口
- ⚠️ 切换 worktree 需要手动切换窗口

**现在（Colyn + tmux）**：
- ✅ 多个 AI 并行工作
- ✅ Git worktree 提供代码隔离
- ✅ **一个 tmux session 统一管理**
- ✅ **快捷键秒切 worktree**
- ✅ **自动布局和启动服务**
- ✅ **实时查看所有 worktree 状态**

---

## 映射关系

Colyn 将其概念自然映射到 tmux：

| Colyn 概念 | tmux 概念 | 说明 |
|------------|-----------|------|
| **Project Name** | **Session Name** | 项目名 = Session 名 |
| **Worktree ID** | **Window Index** | ID 0 → Window 0, ID 1 → Window 1 |
| **Branch Name** | **Window Name** | 使用分支名的最后一段 |

### 示例

假设你的项目名为 `my-task-app`，有以下 worktrees：

| Worktree ID | 分支 | tmux Window | Window Name |
|-------------|------|-------------|-------------|
| 0 (main) | main | Window 0 | main |
| 1 | feature/auth | Window 1 | auth |
| 2 | feature/tasks | Window 2 | tasks |
| 3 | bugfix/user/login | Window 3 | login |

tmux 状态栏显示：
```
[my-task-app] 0:main  1:auth*  2:tasks  3:login
```

---

## Window 布局

### 固定 3-Pane 布局

每个 window 采用固定的三窗格布局：

```
┌────────────────────┬──────────┐
│                    │  Dev     │
│                    │  Server  │  ← 30% (Pane 1)
│   Claude Code      ├──────────┤
│                    │          │
│                    │  Bash    │  ← 70% (Pane 2)
│      60%           │   40%    │
│   (Pane 0)         │          │
└────────────────────┴──────────┘
```

### Pane 分配

| Pane | 位置 | 大小 | 用途 |
|------|------|------|------|
| **Pane 0** | 左侧 | 60% | Claude Code（AI 编程助手）|
| **Pane 1** | 右上 | 12% | Dev Server（开发服务器日志）|
| **Pane 2** | 右下 | 28% | Bash（命令行操作）|

### 布局特点

- ✅ **一致性**: 所有 window 使用相同布局
- ✅ **专注**: 左侧 60% 用于 AI 编程
- ✅ **监控**: 右上显示实时日志
- ✅ **灵活**: 右下用于临时操作
- ❌ **暂不可配置**: MVP 阶段采用固定布局

---

## 自动化功能

### 1. Session 自动创建

**`colyn init` 行为**：

#### 不在 tmux 中

```bash
$ colyn init -p 3000

✓ 项目初始化完成
✓ 检测到你不在 tmux 中
✓ 已创建 tmux session: my-task-app
✓ 已设置 Window 0: main
  ├─ Claude Code  (左侧 60%)
  ├─ Dev Server   (右上 12%)
  └─ Bash         (右下 28%)

💡 提示: 运行 'tmux attach -t my-task-app' 进入工作环境
```

#### 在 tmux 中

```bash
$ colyn init -p 3000

✓ 项目初始化完成
✓ 检测到在 tmux session 中
✓ 将使用当前 session: existing-session
✓ 已设置 Window 0: main
```

### 2. Window 自动创建

**`colyn add` 行为**：

```bash
$ colyn add feature/auth

✓ 正在创建 worktree...
✓ 分配 ID: 1，端口: 3001
✓ 创建 Window 1: auth
  ├─ 布局设置: 3-pane
  ├─ Claude Code 启动中...
  ├─ Dev Server 启动中...
  └─ Bash 就绪

✓ 已切换到 Window 1
📂 路径: /path/to/worktrees/task-1
```

### 3. 自动启动服务

#### Claude Code（Pane 0）

**默认行为**：
- 检测当前目录是否已有 Claude 会话
- 如果存在，执行 `claude -c` 继续会话
- 如果不存在，执行 `claude` 启动新会话

**检测逻辑**：
```bash
# 检查 ~/.claude/projects/{encodedPath}/ 是否有 .jsonl 文件
# encodedPath: 将路径 /Users/name/project 编码为 -Users-name-project
```

#### Dev Server（Pane 1）

**默认行为**：
- 检测 `package.json` 中的 `dev` 脚本
- 自动执行 `npm run dev`（或 `yarn dev`、`pnpm dev`）
- PORT 环境变量自动从 `.env.local` 读取

**示例输出**：
```bash
$ npm run dev

> my-app@1.0.0 dev
> next dev

- ready started server on 0.0.0.0:3001, url: http://localhost:3001
- info Loaded env from /path/to/.env.local
```

#### Bash（Pane 2）

**默认行为**：
- 切换到 worktree 目录
- 不执行额外命令
- 保持干净的 shell 环境

---

## colyn tmux 命令

除了 `colyn add` / `colyn init` 等命令会自动管理 tmux，Colyn 还提供 `colyn tmux` 命令，用于手动启动或结束项目的 tmux 环境。

### colyn tmux start

启动并修复项目的 tmux session 和 windows：session 不存在时创建（detached），为缺失的 worktree 创建 window 并应用 3-pane 布局。`colyn tmux`（无子命令）等同于 `colyn tmux start`。

```bash
# 启动 / 修复当前项目的 tmux 环境
colyn tmux start

# 等价写法
colyn tmux
```

### colyn tmux stop

结束当前项目的 tmux session。

| 选项 | 说明 |
|------|------|
| `-f` / `--force` | 跳过确认直接结束 |

```bash
# 结束当前项目的 session（会先确认）
colyn tmux stop

# 跳过确认直接结束
colyn tmux stop --force
```

> 注：session 名称等于项目名。结束 session 只关闭 tmux 工作环境，不影响 worktree 目录或代码。

---

## iTerm2 集成

### 自动 Tab Title 同步

如果你使用 **iTerm2** 作为终端模拟器，Colyn 会自动设置 iTerm2 的 tab title，让你更容易识别当前项目和工作环境。

#### tmux 环境

当在 tmux 中工作时，iTerm2 tab title 显示统一的项目标识：

```
🐶 my-task-app #tmux
```

**特点**：
- ✅ 一个 iTerm2 tab 运行一个 tmux session
- ✅ 所有 tmux window 共享同一个 tab
- ✅ Tab title 不随 window 切换而变化
- ✅ `#tmux` 后缀明确标识这是 tmux 环境
- ✅ 狗头 emoji 🐶 让 tab 更容易识别

#### 非 tmux 环境

当不在 tmux 中工作时，tab title 显示详细的 worktree 信息：

```
🐶 my-task-app #1 - auth
```

**格式**：`🐶 {项目名} #{worktree ID} - {分支名}`

**示例**：

| 场景 | Tab Title |
|------|-----------|
| 主分支 | `🐶 my-task-app #0 - main` |
| Worktree #1 | `🐶 my-task-app #1 - auth` |
| Worktree #2 | `🐶 my-task-app #2 - user-profile` |

#### 触发时机

Tab title 会在以下情况自动更新：

| 命令 | tmux 环境 | 非 tmux 环境 |
|------|-----------|--------------|
| `colyn tmux start` | 设置为 `🐶 {项目} #tmux` | - |
| `colyn add <branch>` | 保持 `🐶 {项目} #tmux` | 设置为 `🐶 {项目} #{ID} - {分支}` |
| `colyn checkout <branch>` | 保持 `🐶 {项目} #tmux` | 更新为 `🐶 {项目} #{ID} - {新分支}` |

#### 兼容性

- ✅ **仅在 iTerm2 中生效**：其他终端模拟器不受影响
- ✅ **自动检测**：无需手动配置
- ✅ **无侵入**：不影响终端的正常功能

---

## 快捷键导航

### tmux 基础快捷键

所有 tmux 快捷键都以 **`Ctrl-b`** 作为前缀（按下后释放，再按下一个键）。

### Window 切换

| 快捷键 | 功能 | 示例 |
|--------|------|------|
| `Ctrl-b 0` | 切换到 Window 0（主分支）| 快速回到主分支 |
| `Ctrl-b 1` | 切换到 Window 1 | 切换到第一个 worktree |
| `Ctrl-b 2` | 切换到 Window 2 | 切换到第二个 worktree |
| `Ctrl-b n` | 下一个 window | 顺序浏览 |
| `Ctrl-b p` | 上一个 window | 反向浏览 |
| `Ctrl-b l` | 最近使用的 window | 快速切换 |
| `Ctrl-b w` | 列出所有 window | 可视化选择 |

### Pane 切换

| 快捷键 | 功能 |
|--------|------|
| `Ctrl-b o` | 切换到下一个 pane |
| `Ctrl-b ;` | 切换到上一个活动 pane |
| `Ctrl-b ←/→/↑/↓` | 方向键切换 pane |
| `Ctrl-b q` | 显示 pane 编号（2秒内按数字切换）|

### Pane 调整

| 快捷键 | 功能 |
|--------|------|
| `Ctrl-b z` | 放大/还原当前 pane（全屏切换）|
| `Ctrl-b Ctrl-↑/↓/←/→` | 调整 pane 大小 |
| `Ctrl-b Space` | 切换布局预设 |

### Session 管理

| 快捷键 | 功能 |
|--------|------|
| `Ctrl-b d` | 分离 session（后台运行）|
| `Ctrl-b s` | 列出所有 session |
| `Ctrl-b $` | 重命名当前 session |

---

## 命令行操作

### 附加到 Session

```bash
# 附加到 session
tmux attach -t my-task-app

# 简写
tmux a -t my-task-app

# 如果 session 不存在则创建
tmux new-session -A -s my-task-app
```

### 列出 Sessions

```bash
# 列出所有 session
tmux ls

# 输出示例
my-task-app: 4 windows (created Mon Feb 10 10:30:15 2026)
other-project: 2 windows (created Mon Feb 10 09:15:22 2026)
```

### 杀死 Session

```bash
# 杀死指定 session
tmux kill-session -t my-task-app

# 杀死所有 session（除了当前）
tmux kill-session -a
```

---

## 工作流程示例

### 场景 1：启动新项目

```bash
# 1. 初始化项目（创建 session）
$ colyn init -p 3000
✓ 已创建 tmux session: my-task-app
💡 运行 'tmux attach -t my-task-app' 进入

# 2. 进入 tmux
$ tmux attach -t my-task-app

# 现在在 Window 0 (main)
# - Pane 0: Claude Code 已启动
# - Pane 1: Dev Server 运行在 3000 端口
# - Pane 2: Bash

# 3. 创建第一个 worktree（自动切换到 Window 1）
$ colyn add feature/auth
✓ 已切换到 Window 1

# 4. 继续创建更多 worktrees
$ colyn add feature/tasks    # → Window 2
$ colyn add feature/dashboard # → Window 3

# 5. 使用快捷键在 worktrees 之间切换
Ctrl-b 0  # → 回到主分支
Ctrl-b 1  # → feature/auth
Ctrl-b 2  # → feature/tasks
Ctrl-b 3  # → feature/dashboard
```

### 场景 2：恢复工作

```bash
# 早上启动电脑，恢复昨天的工作

# 1. 附加到 session
$ tmux attach -t my-task-app

# 2. 查看所有 worktrees
$ colyn list

┌────────┬──────────────────┬──────┐
│ ID     │ 分支             │ 端口 │
├────────┼──────────────────┼──────┤
│ 0-main │ main             │ 3000 │
│ 1      │ feature/auth     │ 3001 │
│ 2      │ feature/tasks    │ 3002 │
│ 3      │ feature/dashboard│ 3003 │
└────────┴──────────────────┴──────┘

💡 使用 Ctrl-b 1 切换到 Window 1

# 3. 切换到要继续的 worktree
Ctrl-b 2  # 继续开发 tasks 功能

# 4. 所有上下文都还在
# - Claude Code 会话历史保留
# - Dev Server 可能需要重启（Ctrl-c 后 npm run dev）
# - Bash 在正确的目录
```

### 场景 3：并行开发和测试

```bash
# 同时开发三个功能

# Window 1 (feature/auth)
# - Pane 0: Claude 帮助实现登录
# - Pane 1: Dev Server http://localhost:3001
# - Pane 2: 运行测试 npm test

# Window 2 (feature/tasks)
# - Pane 0: Claude 帮助实现任务管理
# - Pane 1: Dev Server http://localhost:3002
# - Pane 2: 查看日志 tail -f logs/app.log

# Window 3 (feature/dashboard)
# - Pane 0: Claude 帮助实现仪表板
# - Pane 1: Dev Server http://localhost:3003
# - Pane 2: 数据库操作 psql

# 在浏览器中同时打开三个端口
# 快速对比不同功能的效果

# 使用 Ctrl-b 1/2/3 快速切换
```

### 场景 4：代码审查和合并

```bash
# 1. 在 Window 1 查看要合并的代码
Ctrl-b 1
$ git diff main

# 2. 切换到主分支进行合并
Ctrl-b 0
$ colyn merge 1

# 3. 合并后切换回 Window 1 检查
Ctrl-b 1
$ git log

# 4. 确认无误后删除 worktree
$ colyn remove 1

# 5. Window 1 自动关闭，回到 Window 0
```

---

## Colyn 命令在 tmux 中的行为

### `colyn init`

| 场景 | 行为 |
|------|------|
| 不在 tmux 中 | 创建新的 detached session |
| 在 tmux 中 | 使用当前 session，设置 Window 0 |

### `colyn add`

| 场景 | 行为 |
|------|------|
| 不在 tmux 中 | 正常创建 worktree，显示 tmux 提示 |
| 在 tmux 中 | 创建 worktree + 创建 window + 自动切换 |

### `colyn list`

```bash
# 在 tmux 中会显示额外提示
$ colyn list

┌────────┬──────────────┬──────┐
│ ID     │ 分支         │ 端口 │
├────────┼──────────────┼──────┤
│ 0-main │ main         │ 3000 │
│ 1      │ feature/auth │ 3001 │
└────────┴──────────────┴──────┘

💡 使用 Ctrl-b 1 切换到 Window 1
```

### `colyn checkout`

```bash
# 在 worktree 中切换分支
$ colyn checkout feature/new-ui

✓ 切换到分支: feature/new-ui
✓ 更新 window 名称: new-ui
✓ 归档日志: .claude/logs/archived/auth/

# tmux 状态栏自动更新
# 之前: [my-task-app] 0:main  1:auth*
# 之后: [my-task-app] 0:main  1:new-ui*
```

### `colyn repair`

```bash
# 项目移动后修复
$ colyn repair

✔ 检查主分支 .env.local...
✔ 修复 git worktree 连接...
✔ 检测并修复孤儿 worktree 目录...
✔ 创建了 session "my-task-app" 和 3 个 window

修复摘要：
  ✓ 创建了 tmux session: my-task-app
  ✓ 创建了 3 个 tmux window
  ✓ 1 个 tmux window 已存在（保持原布局）
```

---

## 自定义配置

### 配置文件

Pane 命令可以通过配置文件自定义（完全可选）。

**两层配置机制**：

| 层级 | 路径 | 优先级 |
|------|------|--------|
| 用户级 | `~/.colyn/settings.json` | 低 |
| 项目级 | `{projectRoot}/.colyn/settings.json` | 高 |

### 配置格式

```json
{
  "tmux": {
    "autoRun": true,
    "leftPane": {
      "command": "auto continues claude session",
      "size": "60%"
    },
    "topRightPane": {
      "command": "auto start dev server",
      "size": "30%"
    },
    "bottomRightPane": {
      "command": null,
      "size": "70%"
    }
  }
}
```

### 配置选项

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `autoRun` | boolean | `true` | 是否自动运行命令 |
| `leftPane.command` | string \| null | `"auto continues claude session"` | 左侧 Pane 命令 |
| `leftPane.size` | string | `"60%"` | 左侧 Pane 宽度 |
| `topRightPane.command` | string \| null | `"auto start dev server"` | 右上 Pane 命令 |
| `topRightPane.size` | string | `"30%"` | 右上占右侧高度比例 |
| `bottomRightPane.command` | string \| null | `null` | 右下 Pane 命令 |
| `bottomRightPane.size` | string | `"70%"` | 右下占右侧高度比例 |

### 内置命令

| 命令 | 说明 |
|------|------|
| `auto continues claude session` | 自动继续或启动 Claude 会话 |
| `auto continues claude session with dangerously skip permissions` | 同上，但跳过权限检查 |
| `auto start dev server` | 自动启动开发服务器 |

### 配置示例

#### 禁用所有自动命令

```json
{
  "tmux": {
    "autoRun": false
  }
}
```

#### 使用 Neovim 替代 Claude Code

```json
{
  "tmux": {
    "leftPane": {
      "command": "nvim"
    }
  }
}
```

#### 右下 Pane 运行监控工具

```json
{
  "tmux": {
    "bottomRightPane": {
      "command": "htop"
    }
  }
}
```

#### 自定义布局大小

```json
{
  "tmux": {
    "leftPane": {
      "size": "50%"
    },
    "topRightPane": {
      "size": "40%"
    },
    "bottomRightPane": {
      "size": "60%"
    }
  }
}
```

#### 两层配置合并

```json
// ~/.colyn/settings.json（用户级）
{
  "tmux": {
    "leftPane": {
      "command": "auto continues claude session with dangerously skip permissions",
      "size": "50%"
    }
  }
}

// {projectRoot}/.colyn/settings.json（项目级）
{
  "tmux": {
    "leftPane": {
      "command": "nvim"  // 只覆盖 command，保留用户级的 size: 50%
    }
  }
}
```

---

## 非 tmux 环境兼容性

### 完全降级

**所有功能在非 tmux 环境下正常工作**：

| 命令 | 非 tmux 行为 |
|------|-------------|
| `init` | 创建 session (detached)，提示用户 attach |
| `add` | 正常创建 worktree，首次显示 tmux 提示 |
| `checkout` | 正常切换目录 |
| `list` | 正常列表，不显示 tmux 提示 |
| `repair` | 修复文件和 git，跳过 tmux 部分 |

### 首次使用提示

```bash
$ colyn add feature/auth

✓ 创建 worktree...

💡 提示: Colyn 支持 tmux 集成，获得更好的多 worktree 体验
   运行 'tmux attach -t my-task-app' 进入 tmux 环境

   这个提示只显示一次
```

### tmux 未安装

- 完全禁用 tmux 功能
- 所有命令正常工作
- 不显示任何提示
- 不报错

---

## 常见问题

### Q: 如何退出 tmux？

```bash
# 方式 1: 分离 session（推荐，session 继续后台运行）
Ctrl-b d

# 方式 2: 杀死当前 session
tmux kill-session

# 方式 3: 在最后一个 window 中退出所有 pane
exit  # 在每个 pane 中输入
```

### Q: Window 关闭了怎么办？

```bash
# 使用 repair 命令重建
$ colyn repair

✔ 创建了缺失的 window
```

### Q: 如何查看所有 tmux 快捷键？

```bash
# 在 tmux 中按
Ctrl-b ?

# 显示完整的快捷键列表
# 按 q 退出
```

### Q: 可以自定义 tmux 前缀键吗？

```bash
# 编辑 ~/.tmux.conf
# 将前缀从 Ctrl-b 改为 Ctrl-a
unbind C-b
set -g prefix C-a
bind C-a send-prefix

# 重新加载配置
tmux source-file ~/.tmux.conf
```

### Q: Pane 大小不对怎么调整？

```bash
# 方式 1: 使用快捷键
Ctrl-b Ctrl-↑/↓/←/→

# 方式 2: 修改配置文件
# {projectRoot}/.colyn/settings.json
{
  "tmux": {
    "leftPane": { "size": "70%" }
  }
}
```

### Q: Dev Server 没有自动启动？

**检查清单**：
1. `package.json` 中是否有 `dev` 脚本？
2. 配置中是否禁用了 `autoRun`？
3. 配置中 `topRightPane.command` 是否为 `null`？

```bash
# 手动启动
Ctrl-b 1  # 切换到右上 pane
npm run dev
```

### Q: Claude Code 会话没有继续？

**原因**：可能是第一次使用该 worktree。

```bash
# 检查是否有会话文件
ls ~/.claude/projects/-Users-*-worktrees-task-1/*.jsonl

# 如果没有，手动启动 Claude 建立会话
claude
```

### Q: 如何在 Pane 之间复制粘贴？

```bash
# 1. 进入复制模式
Ctrl-b [

# 2. 使用 vim 风格导航
h/j/k/l  # 移动光标
Space    # 开始选择
Enter    # 复制选中内容

# 3. 粘贴
Ctrl-b ]
```

### Q: 能否在不同 Window 中使用不同布局？

**暂不支持**。MVP 阶段所有 window 使用统一的 3-pane 布局。

未来可能支持自定义布局。

---

## 最佳实践

### 1. 合理命名分支

使用描述性的分支名，Window name 更易识别：

```bash
# ✅ 推荐
feature/user-authentication  → Window name: authentication
feature/dashboard-redesign   → Window name: redesign
bugfix/login-error          → Window name: error

# ❌ 不推荐
feature/abc                 → Window name: abc
fix                        → Window name: fix
```

### 2. 保持 Window 数量合理

- **建议**: 3-5 个 worktrees（Window 0-4）
- **原因**:
  - Ctrl-b 0-9 快捷键覆盖范围
  - 认知负担
  - 资源占用

### 3. 定期合并和清理

```bash
# 每周清理已合并的 worktrees
$ colyn list
# 检查哪些功能已完成
$ colyn merge 1
$ colyn remove 1
```

### 4. 使用 Session 分离

工作暂停时分离 session：

```bash
# 下班前
Ctrl-b d

# 第二天
tmux attach -t my-task-app
# 所有上下文都还在
```

### 5. 备份 tmux 配置

如果你自定义了 tmux 配置，记得备份：

```bash
# 备份到项目中（不提交到 git）
cp ~/.tmux.conf project/.tmux.conf.backup

# 或使用版本控制
git clone https://github.com/username/dotfiles
ln -s ~/dotfiles/tmux.conf ~/.tmux.conf
```

---

## tmux 学习资源

### 官方文档

- [tmux GitHub Wiki](https://github.com/tmux/tmux/wiki)
- [tmux 手册页](https://man.openbsd.org/tmux.1)

### 推荐教程

- [tmux Cheat Sheet](https://tmuxcheatsheet.com/)
- [A Quick and Easy Guide to tmux](https://www.hamvocke.com/blog/a-quick-and-easy-guide-to-tmux/)

### 常用插件

- [tmux-resurrect](https://github.com/tmux-plugins/tmux-resurrect) - 保存和恢复 session
- [tmux-continuum](https://github.com/tmux-plugins/tmux-continuum) - 自动保存 session
- [tmux-yank](https://github.com/tmux-plugins/tmux-yank) - 增强复制功能

---

## 下一步

- 查看 [最佳实践](07-best-practices.md) 了解推荐的工作流程
- 遇到问题？参考 [故障排除](08-troubleshooting.md)
- 想要更高级的用法？查看 [高级用法](05-advanced-usage.md)

