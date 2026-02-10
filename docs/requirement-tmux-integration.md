# Colyn tmux 集成需求文档

## 版本信息
- 文档版本：1.0
- 创建日期：2026-01-24
- 基于故事：blog/parallel-vibe-coding-2-with-tmux.md

---

## 1. 概述

### 1.1 目标

为 Colyn 增加 tmux 集成功能，实现：
- 一个 tmux session 统一管理整个项目
- 一个 worktree 对应一个 tmux window
- 每个 window 固定的 3-pane 布局
- Dev server 自动启动
- 无缝的 worktree 切换体验

### 1.2 核心原则

1. **零配置**：无需用户配置即可使用
2. **自动检测**：智能适配 tmux 环境
3. **非侵入**：不在 tmux 中也完全可用
4. **零学习成本**：现有命令自动升级，另提供 `colyn tmux` 作为补充

### 1.3 用户价值

- 🚀 **效率提升**：Ctrl-b 0-4 秒切 worktree
- 🎯 **专注工作**：一个窗口掌控全局
- 🤖 **自动化**：dev server 自动启动
- 👀 **可视化**：实时查看日志和状态

---

## 2. 功能需求

### 2.1 命令设计

**设计方案**：自动化为主，提供 `colyn tmux` 作为补充命令

所有现有命令自动适配 tmux 环境，另提供 `colyn tmux` 进行主动修复与管理：

| 命令 | tmux 中 | 非 tmux 中 |
|------|---------|-----------|
| `colyn init` | 设置 Window 0 | 创建 session (detached) |
| `colyn add` | 创建 window + 切换 | 正常创建 worktree |
| `colyn checkout` | 更新 window 名称 | 切换目录 |
| `colyn list` | 显示 window 编号 + 切换提示 | 显示 ID 列（0-main） |
| `colyn repair` | 修复缺失的 window | 创建 session + 修复 window |
| `colyn tmux` | 运行 tmux 修复/管理 | 运行 tmux 修复/管理 |

**补充命令**：`colyn tmux` 用于手动修复或管理 tmux，用户仍可使用 tmux 原生快捷键切换 window。

### 2.2 Session 管理

#### 2.2.1 Session 创建

**colyn init 行为**：

不在 tmux 中：
```bash
$ colyn init -p 3000

✓ 项目初始化完成
✓ 检测到你不在 tmux 中
✓ 已创建 tmux session: my-task-app
✓ 已设置 Window 0: main
  ├─ Claude Code  (左侧 60%)
  ├─ Dev Server   (右上 20%)
  └─ Bash         (右下 20%)

💡 提示: 运行 'tmux attach -t my-task-app' 进入工作环境
```

在 tmux 中：
```bash
$ colyn init -p 3000

✓ 项目初始化完成
✓ 检测到在 tmux session 中
✓ 将使用当前 session: existing-session
✓ 已设置 Window 0: main
```

#### 2.2.2 Session 命名

- **不在 tmux 中**：session 名称 = 项目名称
- **在 tmux 中**：使用当前 session
- **已存在同名 session**：直接复用，不询问

#### 2.2.3 配置存储

**遵循最小配置原则**：

Session name 无需存储在配置文件中，因为它永远等于项目名称。

```typescript
// 代码中自动推断
function getSessionName(config: Config): string {
  return config.project;  // session name = project name
}
```

配置文件中不需要 tmux 相关配置：

```json
// .colyn/settings.json
{
  "tmux": {
    "autoRun": true
  }
  // ❌ 不需要 tmux.sessionName - 从 project 自动推断
}
```

### 2.3 Window 管理

#### 2.3.1 Window 映射关系

```
Worktree     Window     Window Name
────────────────────────────────────
main         0          main
task-1       1          auth
task-2       2          tasks
task-3       3          categories
```

**映射规则**：
- Window Index = Worktree ID
- Window 0 固定为 main
- Window Name = 分支名（去掉 feature/ 前缀）

#### 2.3.2 Window 创建

**colyn add 行为**：

```typescript
colyn add feature/auth →
  1. 创建 worktree (task-1)
  2. 创建 Window 1，命名为 "auth"
  3. 设置 3-pane 布局
  4. 启动 dev server
  5. 自动切换到 Window 1
```

#### 2.3.3 Window 切换

**colyn checkout 行为**：

在 worktree 中切换分支时：
```typescript
colyn checkout feature/new-feature →
  1. 切换到新分支
  2. 归档旧分支的日志
  3. 更新 window 名称为 "new-feature"
  4. 刷新环境
```

切换到其他 worktree 时：
```typescript
colyn checkout 1 →
  1. 切换到 worktree task-1
  2. 切换到 Window 1
  3. 如果 Window 1 不存在，自动重建
```

**Window 名称同步**：
- 分支切换后，window 名称自动更新为新分支的最后一段
- 确保 window 名称始终反映当前分支
- 示例：`feature/auth` → `feature/new-ui` 时，window 从 "auth" 改为 "new-ui"

#### 2.3.4 Window 编号分配

- Worktree ID 递增，不复用
- Window Index = Worktree ID
- 允许 window 编号中有空隙（删除 worktree 后）

### 2.4 Pane 布局

#### 2.4.1 固定布局

```
┌──────────────┬─────────┐
│              │  Dev    │
│              │  Server │  ← 30%
│   Claude     ├─────────┤
│   Code       │         │
│              │  Bash   │  ← 70%
│     60%      │   40%   │
└──────────────┴─────────┘
```

**Pane 分配**：
- Pane 0 (左侧 60%)：Claude Code
- Pane 1 (右上 30% of 40% = 12%)：Dev Server
- Pane 2 (右下 70% of 40% = 28%)：Bash

#### 2.4.2 实现方式

```typescript
// 1. 垂直分割：左 60%，右 40%
tmux split-window -h -p 40 -c "$worktreePath"

// 2. 分割右侧为上下：上 30%，下 70%
tmux split-window -v -p 70 -c "$worktreePath"

// 3. 选择左侧 pane
tmux select-pane -t 0
```

#### 2.4.3 布局策略

- ✅ 固定布局，不可配置（MVP）
- ✅ 所有 window 统一布局
- ❌ 不支持自定义布局（未来可考虑）
- ❌ 不负责布局持久化（用户可用 tmux 插件）

### 2.5 Pane 内容自动化

#### 2.5.1 配置文件

Pane 命令可通过配置文件自定义（可选）。

**两层配置机制**：

| 层级 | 路径 | 说明 |
|------|------|------|
| 用户级 | `~/.config/colyn/settings.json` | 用户默认配置，适用于所有项目 |
| 项目级 | `{projectRoot}/.colyn/settings.json` | 项目特定配置，覆盖用户级设置 |

**优先级**：项目级 > 用户级 > 内置默认值

**配置格式**：

```json
{
  "tmux": {
    "autoRun": true,
    "leftPane": {
      "command": "auto continues claude session",
      "size": "60%"
    },
    "rightTopPane": {
      "command": "auto start dev server",
      "size": "30%"
    },
    "rightBottomPane": {
      "command": null,
      "size": "70%"
    }
  }
}
```

**配置说明**：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `autoRun` | boolean | `true` | 是否自动运行命令，`false` 禁用所有自动运行 |
| `leftPane.command` | string \| null | 见下方 | 左侧 Pane 命令 |
| `leftPane.size` | string | `"60%"` | 左侧 Pane 宽度 |
| `rightTopPane.command` | string \| null | 见下方 | 右上 Pane 命令 |
| `rightTopPane.size` | string | `"30%"` | 右上 Pane 占右侧高度比例 |
| `rightBottomPane.command` | string \| null | `null` | 右下 Pane 命令 |
| `rightBottomPane.size` | string | `"70%"` | 右下 Pane 占右侧高度比例 |

**内置命令**：

| 命令 | 说明 |
|------|------|
| `auto continues claude session` | 自动继续 Claude 会话（检测当前目录是否已有 Claude session，存在则 `claude -c`，否则 `claude`）|
| `auto continues claude session with dangerously skip permissions` | 同上，但添加 `--dangerously-skip-permissions` 参数 |
| `auto start dev server` | 自动启动 dev server（检测 package.json 的 dev 脚本）|

**默认值**：
- `leftPane.command`: `"auto continues claude session"`
- `rightTopPane.command`: `"auto start dev server"`
- `rightBottomPane.command`: `null`（不执行命令）

**"auto" 检测逻辑**：

| 内置命令 | 检测逻辑 |
|---------|---------|
| `auto continues claude session` | 检查当前目录是否已有 Claude session，存在则 `claude -c`，否则 `claude` |
| `auto continues claude session with dangerously skip permissions` | 同上，但添加 `--dangerously-skip-permissions` 参数 |
| `auto start dev server` | 检查 package.json 的 dev 脚本，存在则运行 |

**配置示例**：

```json
// 禁用所有自动命令
{
  "tmux": {
    "autoRun": false
  }
}

// 自定义命令
{
  "tmux": {
    "leftPane": {
      "command": "nvim"
    },
    "rightTopPane": {
      "command": "npm run start"
    },
    "rightBottomPane": {
      "command": "htop"
    }
  }
}

// 自定义布局大小
{
  "tmux": {
    "leftPane": {
      "size": "50%"
    },
    "rightTopPane": {
      "size": "40%"
    }
  }
}

// 使用 dangerously skip permissions 模式
{
  "tmux": {
    "leftPane": {
      "command": "auto continues claude session with dangerously skip permissions"
    }
  }
}

// 禁用 Claude 自动启动
{
  "tmux": {
    "leftPane": {
      "command": null
    }
  }
}
```

**两层配置合并示例**：

```json
// ~/.config/colyn/settings.json（用户级）
{
  "tmux": {
    "leftPane": {
      "command": "auto continues claude session with dangerously skip permissions",
      "size": "50%"
    },
    "rightBottomPane": {
      "command": "htop"
    }
  }
}

// {projectRoot}/.colyn/settings.json（项目级）
{
  "tmux": {
    "leftPane": {
      "command": "nvim"  // 只覆盖 command，保留用户级的 size
    }
  }
}

// 最终生效配置
{
  "tmux": {
    "autoRun": true,
    "leftPane": {
      "command": "nvim",
      "size": "50%"
    },
    "rightTopPane": {
      "command": "auto start dev server",
      "size": "30%"
    },
    "rightBottomPane": {
      "command": "htop",
      "size": "70%"
    }
  }
}
```

**遵循最小配置原则**：配置文件完全可选，不存在时使用默认行为。

#### 2.5.2 左侧 Pane（Claude Code）

**默认行为（"auto"）**：
- 检测当前目录是否已有 Claude session
- 通过检查 `~/.claude/projects/{encodedPath}` 是否存在 `.jsonl` 会话文件判断
- `{encodedPath}` 规则：将绝对路径中的分隔符 `/` 替换为 `-`（例：`/Users/name/project` → `-Users-name-project`）
- 如果存在，执行 `claude -c` 继续会话
- 如果不存在，执行 `claude` 启动新会话

**原因**：
- `.claude` 目录可能仅包含日志，不能准确代表 Claude session
- `~/.claude/projects/{encodedPath}` 记录了该目录的 Claude 会话
- `-c` 参数仅在已有会话时继续，避免错误复用

#### 2.5.3 右上 Pane（Dev Server）

**默认行为（"auto"）**：
- 检测 package.json 的 `dev` 脚本
- 自动执行 `npm run dev` / `yarn dev` / `pnpm dev`
- PORT 从 .env.local 自动读取

**检测逻辑**：
```typescript
// 1. 读取 package.json
const devScript = packageJson.scripts?.dev;

// 2. 如果存在，自动启动
if (devScript) {
  tmux send-keys "npm run dev" Enter
}

// 3. 如果不存在，显示提示
else {
  echo "# 未检测到 dev 脚本"
}
```

**项目类型支持**：
- ✅ npm 项目（MVP）
- ❌ Rails、Django 等（未来可扩展）

#### 2.5.4 右下 Pane（Bash）

**默认行为（null）**：
- 切换到 worktree 目录
- **不**执行额外命令
- 保持干净的 shell

**用途**：
- 执行 git 命令
- 运行测试
- 安装依赖
- 任意命令行操作

### 2.6 colyn list 集成

#### 2.6.1 显示格式

```
┌────────┬─────────────────────┬──────┬──────┬──────────────────┐
│ ID     │ 分支                │ 端口 │ Diff │ 路径             │
├────────┼─────────────────────┼──────┼──────┼──────────────────┤
│ 0-main │ main                │ 3000 │ -    │ my-task-app      │
│ 1      │ feature/auth        │ 3001 │ +127 │ task-1           │
│ 2      │ feature/tasks       │ 3002 │ +89  │ task-2           │
└────────┴─────────────────────┴──────┴──────┴──────────────────┘
```

**在 tmux 中额外显示提示**：
```
💡 使用 Ctrl-b 1 切换到 Window 1
```

#### 2.6.2 ID 列规则

- **Main**：总是显示 "0-main"（无论是否在 tmux 中）
- **Worktree**：显示数字 ID（对应 tmux window 编号）

### 2.8 colyn repair 集成

#### 2.8.1 修复行为

**colyn repair 行为**：

```bash
$ colyn repair

✔ 检查主分支 .env.local...
✔ 检查 worktree task-1 .env.local...
✔ 修复 git worktree 连接...
✔ 检测并修复孤儿 worktree 目录...
✔ 创建了 session "my-task-app" 和 3 个 window

修复摘要：
  ✓ 创建了 tmux session: my-task-app
  ✓ 创建了 3 个 tmux window
  ✓ 1 个 tmux window 已存在（保持原布局）
```

#### 2.8.2 修复规则

| 场景 | 行为 |
|------|------|
| Session 不存在 | 创建 session（detached 模式） |
| Window 不存在 | 创建 window 并设置 3-pane 布局 |
| Window 已存在 | 跳过，保持用户现有布局不变 |
| tmux 未安装 | 跳过 tmux 修复，不报错 |

#### 2.8.3 使用场景

- 项目移动后，tmux session 丢失
- 手动关闭了某些 window
- 新 clone 的项目需要设置 tmux 环境

### 2.7 非 tmux 环境兼容性

#### 2.7.1 降级策略

**所有功能在非 tmux 环境下必须正常工作**

| 命令 | 非 tmux 行为 |
|------|-------------|
| `init` | 创建 session (detached)，提示 attach |
| `add` | 正常创建 worktree，首次显示 tmux 提示 |
| `checkout` | 切换目录 |
| `list` | 正常列表 |

#### 2.7.2 提示策略

**首次使用提示**：
```
💡 提示: Colyn 支持 tmux 集成，获得更好的多 worktree 体验
   运行 'tmux attach -t my-task-app' 进入 tmux 环境
```

**何时显示**：
- 第一次运行 `colyn add`（不在 tmux 中）
- 只显示一次（记录到 `.colyn/.tmux-hint-shown`）

#### 2.7.3 错误处理

**tmux 未安装**：
- 完全禁用 tmux 功能
- 所有命令正常工作
- 不显示任何提示

**tmux 命令失败**：
- 降级到非 tmux 模式
- 显示警告但不中断流程
- Worktree 正常创建

---

## 3. 配置文件设计

### 3.1 最小配置原则

**遵循项目的最小配置原则**：只存储无法自动推断的信息。

### 3.2 零配置

**目前项目不需要任何配置文件**，所有信息都从环境中自动推断：

```bash
# 项目结构
my-task-app/                    # ← 项目名从目录名推断
├── my-task-app/                # 主分支目录
│   ├── .git/                   # ← 主分支从 git branch --show-current 推断
│   └── .env.local              # ← Base port 从这里读取
└── worktrees/
    └── task-1/
        └── .env.local          # ← Port 从这里读取
```

**推断规则**：

```typescript
// 所有信息都从环境推断
getProjectName() => path.basename(projectRoot)
getMainBranch() => execSync('git branch --show-current', { cwd: mainDir })
getBasePort() => readEnvLocal(mainDir).PORT
getSessionName() => getProjectName()
getWindowName(branch) => branch.split('/').pop()
```

### 3.3 自动推断规则

| 需要的信息 | 推断来源 | 说明 |
|-----------|---------|------|
| Project name | 主目录名称 | `my-task-app/` → `my-task-app` |
| Main branch | 主分支目录的当前分支 | `git branch --show-current` |
| Base port | 主分支 .env.local | PORT 环境变量 |
| Session name | Project name | 永远相等 |
| Window index | Worktree ID | 一对一映射 |
| Window name | 分支名 | 使用 `/` 分割后的最后一段 |
| Dev command | package.json | 检测 scripts.dev |
| Pane layout | 固定布局 | 60/20/20 固定比例 |

**Window name 示例**：
```typescript
// 提取分支名的最后一段
function getWindowName(branch: string): string {
  return branch.split('/').pop() || branch;
}

// 示例
feature/auth → auth
bugfix/user/login → login
feature/ui/dark-mode → dark-mode
main → main
```

### 3.4 配置文件的未来

如果将来确实需要配置某些无法推断的信息，才会引入配置文件。

当前设计确保：
- **零配置**：用户无需创建或编辑任何配置文件
- **零维护**：没有配置文件需要维护
- **零不一致**：不存在配置与实际状态不一致的问题
- **最简单**：符合 colyn 的设计理念

---

## 4. 实现计划

### 4.1 MVP 范围

**必须实现**（1 周）：
1. ✅ tmux 环境检测
2. ✅ Session 创建和管理
3. ✅ Window 自动创建
4. ✅ 3-pane 固定布局
5. ✅ Dev server 自动启动
6. ✅ colyn list 显示 window 信息

**MVP 之后**：
7. ⏸️ colyn checkout 切换 window
8. ⏸️ 用户体验优化

### 4.2 实现阶段

#### 阶段 1：基础检测和 Session（1-2 天）
- tmux 环境检测
- Session 创建/使用
- 配置文件扩展

#### 阶段 2：Window 和布局（2-3 天）
- Window 创建和命名
- 3-pane 布局设置
- Main window 初始化

#### 阶段 3：Dev Server 启动（2-3 天）
- package.json 检测
- 自动启动逻辑
- 错误处理

#### 阶段 4：List 集成（1 天）
- ID 列格式调整
- Window 状态检测
- 提示信息显示

#### 阶段 5：Checkout 集成（2 天）
- Window 切换
- Window 恢复
- 非 tmux 兼容

#### 阶段 6：用户体验优化（1-2 天）
- 首次使用提示
- 错误处理完善
- 文档更新

**总计：9-13 天（约 2 周）**

### 4.3 技术架构

#### 核心模块

```
src/utils/tmux.ts           # tmux 工具函数
  - isInTmux()
  - getCurrentSession()
  - createSession()
  - createWindow()
  - setupPaneLayout()
  - switchWindow()

src/utils/dev-server.ts     # dev server 管理
  - detectDevCommand()
  - startDevServer()

src/commands/init.ts        # 扩展 init 命令
src/commands/add.ts         # 扩展 add 命令
src/commands/checkout.ts    # 扩展 checkout 命令
src/commands/list.ts        # 扩展 list 命令
```

#### 依赖关系

```
commands/init.ts
  → utils/tmux.ts (createSession, setupPaneLayout)
  → utils/dev-server.ts (startDevServer)

commands/add.ts
  → utils/tmux.ts (createWindow, setupPaneLayout)
  → utils/dev-server.ts (startDevServer)

commands/checkout.ts
  → utils/tmux.ts (switchWindow, createWindow)

commands/list.ts
  → utils/tmux.ts (isInTmux, checkWindowExists)
```

---

## 5. 验收标准

### 5.1 功能验收

#### 场景 1：不在 tmux 中初始化
```bash
$ colyn init -p 3000
✓ 创建 session: my-task-app
✓ 提示用户 attach

$ tmux attach -t my-task-app
→ 进入 Window 0 (main)
→ 3 个 pane 就位
→ Dev server 已启动
```

#### 场景 2：在 tmux 中创建 worktree
```bash
$ colyn add feature/auth
✓ 创建 worktree
✓ 创建 Window 1
✓ 自动切换到 Window 1
→ 3 个 pane 就位
→ Dev server 已启动
```

#### 场景 3：查看列表
```bash
$ colyn list
→ ID 列显示 "0-main", "1", "2"...
→ 显示切换提示
```

#### 场景 4：切换 worktree
```bash
$ colyn checkout 1
✓ 切换到 Window 1

# 或使用 tmux 快捷键
Ctrl-b 1
```

### 5.2 非功能验收

- ✅ 不在 tmux 中所有功能正常
- ✅ tmux 未安装不报错
- ✅ tmux 操作失败不中断主流程
- ✅ 配置文件自动生成
- ✅ 无需用户手动配置

### 5.3 测试清单

#### 环境测试
- [ ] tmux 未安装
- [ ] tmux 已安装，不在其中
- [ ] tmux 已安装，在其中
- [ ] tmux 2.x 版本
- [ ] tmux 3.x 版本

#### 命令测试
- [ ] colyn init（各种环境）
- [ ] colyn add（创建第 1、2、3 个 worktree）
- [ ] colyn checkout（存在/不存在的 window）
- [ ] colyn list（tmux/非 tmux）

#### 边界情况
- [ ] Session 已存在
- [ ] Window 被手动关闭
- [ ] Pane 被手动关闭
- [ ] Dev server 启动失败
- [ ] package.json 不存在

---

## 6. 风险和缓解

### 6.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| tmux 版本兼容性 | 高 | 测试常见版本，使用兼容命令 |
| Shell 环境差异 | 中 | 明确指定 shell，传递环境变量 |
| 性能问题 | 低 | 优化 tmux 命令执行，批量操作 |

### 6.2 用户体验风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 用户不熟悉 tmux | 中 | 提供清晰的提示和文档 |
| 破坏用户现有 session | 高 | 使用当前 session，不强制创建 |
| 配置复杂 | 中 | 零配置，自动生成 |

---

## 7. 文档需求

### 7.1 用户文档

- [ ] README 添加 tmux 集成说明
- [ ] 创建 docs/tmux-integration.md
- [ ] 添加 tmux 使用示例
- [ ] FAQ：常见问题解答

### 7.2 开发文档

- [ ] API 文档：src/utils/tmux.ts
- [ ] 架构说明：tmux 集成设计
- [ ] 贡献指南：如何扩展 tmux 功能

---

## 8. 未来扩展

### 8.1 可能的增强

1. **更多项目类型支持**
   - Rails、Django、Go 等
   - 自定义 dev 命令

2. **布局定制**
   - 用户自定义 pane 大小
   - 多种预设布局

3. **Session 管理命令**
   - `colyn tmux status` - 查看 session 状态
   - `colyn tmux attach` - 快速附加

4. **Window 修复**
   - `colyn repair` - 修复被破坏的布局

5. **远程协作**
   - 共享 tmux session
   - 多人协作同一个项目

### 8.2 社区反馈

**MVP 发布后收集**：
- 用户最常用的功能
- 最大的痛点
- 期望的新功能

**基于反馈迭代**，不预先实现不确定的功能。

---

## 9. 总结

### 9.1 核心价值

Colyn tmux 集成让并行 Vibe Coding 的体验升级：

**之前**：
- ✅ 多个 AI 并行工作
- ✅ Git worktree 隔离
- ⚠️ 需要管理多个终端窗口

**现在**：
- ✅ 多个 AI 并行工作
- ✅ Git worktree 隔离
- ✅ **一个 tmux session 统一管理**
- ✅ **三个 pane 自动布局**
- ✅ **window 自动创建**
- ✅ **dev server 自动启动**
- ✅ **秒切 worktree**

### 9.2 成功标准

1. **用户无需学习新命令**
2. **不在 tmux 中也能正常使用**
3. **tmux 操作失败不影响核心功能**
4. **零配置即可使用**
5. **提升多 worktree 工作效率 10 倍**

### 9.3 下一步

1. ✅ 评审此需求文档
2. ⏸️ 创建技术设计文档
3. ⏸️ 实施 MVP（阶段 1-4）
4. ⏸️ 内部测试和优化
5. ⏸️ 发布和收集反馈

---

**文档结束**

*本需求文档基于 blog/parallel-vibe-coding-2-with-tmux.md 中的用户故事编写，确保实现符合用户期望。*
