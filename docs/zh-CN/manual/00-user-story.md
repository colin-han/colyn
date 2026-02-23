# 从一个人到一支 AI 团队：小明的并行 Vibe Coding 之旅

> 你有 3 个功能要做，3 个 Claude Code 在等你下指令——为什么还要一个一个来？

---

## 瓶颈

小明是一名独立开发者，正在用 Next.js 做一个任务管理 SaaS。他已经习惯了用 Claude Code 做 Vibe Coding——描述需求，让 AI 写代码，自己审查和微调。单个功能的开发效率确实很高。

但周末他想冲刺一下，同时推进三个功能：用户认证、任务管理、数据仪表盘。问题来了：

**AI 能并行工作，但你不能。** Claude 在跑的时候你在干等，等它写完你审查，审查完再给下一个任务。AI 的生产力被你的注意力带宽卡住了。

想切到别的分支先做点别的？`git stash` → 切分支 → `git stash pop`。代码上下文丢了不说，Claude 的会话上下文也丢了——每次切回来都像给新来的实习生重新交代一遍项目背景。

Git worktree 本可以解决并行的问题，但 `git worktree add ../my-project-feature feature/auth` 冗长易错，端口冲突要手动管，依赖要重新装，开了三个终端窗口还得记住哪个是哪个。

**如果有一个工具，能让你同时指挥 3 个 AI 并行开发，每个都有独立的代码、端口和运行环境——你只需要一条命令？**

---

## 初识 Colyn：五分钟上手

小明发现了 Colyn。安装很快：

```bash
npm install -g colyn-cli
```

安装后配置 Shell 集成，这一步很关键——它让 Colyn 的命令执行后能自动切换到目标目录：

```bash
colyn setup
source ~/.zshrc
```

### 初始化项目

在项目根目录中：

```bash
cd my-task-app
colyn init -p 3000
```

项目结构发生了变化：

```
my-task-app/                   # 项目根目录
├── .colyn/                    # Colyn 标识目录
├── my-task-app/               # 主分支目录（PORT=3000）
│   ├── .git/
│   ├── src/
│   ├── package.json
│   └── .env.local             # PORT=3000, WORKTREE=main
└── worktrees/                 # Worktree 目录（稍后创建）
```

小明注意到，整个过程中他没有配置任何东西。Colyn 自动检测到了 `package.json`，识别出这是一个 Node.js 项目；项目名从目录名推断；端口写入了 `.env.local`。**什么都没配，就能用了。**

### 创建第一个 Worktree

```bash
colyn add feature/auth
```

终端输出：

```
✓ Creating worktree for branch: feature/auth
✓ Assigned ID: 1
✓ Port: 3001
✓ Created at: worktrees/task-1
⠿ 安装依赖...
✓ 依赖安装完成
📂 已切换到: /path/to/my-task-app/worktrees/task-1
```

小明发现自己已经在新目录里了。他没执行 `cd`，Colyn 自动帮他切换了。端口 3001 也自动分配好了，`npm run dev` 直接就能跑，不会和主分支的 3000 冲突。依赖也自动装好了。

用 `colyn list` 看一眼全局：

```
┌────────┬──────────────┬──────┬──────────────────────┐
│ ID     │ 分支         │ 端口 │ 路径                  │
├────────┼──────────────┼──────┼──────────────────────┤
│ 0-main │ main         │ 3000 │ my-task-app           │
│ 1      │ feature/auth │ 3001 │ worktrees/task-1      │
└────────┴──────────────┴──────┴──────────────────────┘
```

清清楚楚。比起 `git worktree add ../my-task-app-feature-auth feature/auth`，`colyn add feature/auth` 简单太多了。

---

## 并行起飞：灵感不断，AI 不停

### 规划任务

小明先把三个核心功能记录下来：

```bash
colyn todo add feature/auth "实现用户认证

## 任务说明
- 添加邮箱/密码登录和注册表单
- 后端 API：POST /api/auth/login, POST /api/auth/register
- 使用 JWT token 认证

## 验收标准
- 登录成功后跳转到首页
- 登录失败显示错误提示
- 注册时验证邮箱格式和密码强度"

colyn todo add feature/tasks "实现任务 CRUD

## 任务说明
- 任务列表页面，支持分页
- 创建/编辑/删除任务
- 任务状态：待办、进行中、已完成

## 验收标准
- 任务列表支持按状态筛选
- 删除前有确认弹窗
- 表单验证：标题必填"

colyn todo add feature/dashboard "实现数据仪表盘

## 任务说明
- 显示任务统计：总数、各状态占比
- 最近 7 天任务完成趋势图
- 使用 Recharts 绑定数据

## 验收标准
- 图表数据实时更新
- 空数据状态的友好展示"
```

任务描述用 Markdown 写，后面会直接粘贴给 Claude 作为任务上下文——写得越清晰，AI 的产出质量越高。

### 创建 Worktree 并启动 AI

小明创建了 3 个 worktree。他的经验是：**不要超过 3 个**——这取决于你能同时关注多少件事，超过 3 个反而会分散注意力。

```bash
# 之前已创建 worktree 1 (feature/auth)，再创建两个
colyn add feature/tasks      # → worktrees/task-2, PORT=3002
colyn add feature/dashboard  # → worktrees/task-3, PORT=3003
```

然后用 `colyn todo start` 在每个 worktree 中启动任务：

```bash
# 在 worktree 1 中
cd worktrees/task-1
colyn todo start feature/auth

✓ Todo "feature/auth" 已标记为完成

任务描述：
实现用户认证
...

✓ 已复制到剪贴板
```

`todo start` 做了两件事：切换到对应的分支，然后把任务描述复制到剪贴板。小明只需要打开 Claude Code，按 `Cmd+V` 粘贴，再补充一些细节，Claude 就可以开工了。

三个 worktree 都这样操作一遍，三个 Claude Code 实例同时开始工作。

```
浏览器同时打开三个端口验证：
http://localhost:3001  ← 认证功能
http://localhost:3002  ← 任务管理
http://localhost:3003  ← 数据仪表盘
```

### 开发中途捕捉灵感

正在 worktree 1 审查认证功能的代码时，小明突然想到："对了，还需要一个密码重置功能。" 以前他要么立刻切过去做（打断当前工作），要么记在脑子里（容易忘）。

现在他只需要一条命令：

```bash
colyn todo add feature/reset-password "实现密码重置功能

- 用户点击「忘记密码」→ 输入邮箱 → 发送重置链接
- 重置链接 24 小时有效
- 新密码不能与旧密码相同"
```

一秒钟捕获灵感，不打断当前工作。这个 todo 静静地躺在待办列表里，等某个 worktree 空闲时再来处理。

过了一会儿，又想到"任务需要支持标签功能"，再来一条：

```bash
colyn todo add feature/tags "实现任务标签系统

- 可创建自定义标签（名称 + 颜色）
- 每个任务支持多个标签
- 任务列表可按标签筛选"
```

`colyn todo` 随时查看全局待办：

```
  Type     Name             Message                         Status
  -----------------------------------------------------------------------
  feature  reset-password   实现密码重置功能                  待办
  feature  tags             实现任务标签系统                  待办
```

心里有数，不会遗漏。

### 一个问题

此时小明的屏幕上有三个终端窗口、三个浏览器标签页。`Cmd+Tab` 来回切换，经常搞混——"这是哪个 worktree 来着？"

**有没有更优雅的方式？**

---

## tmux 登场：一个窗口统治一切

小明发现 Colyn 内置了 tmux 集成。运行 `colyn repair`，Colyn 自动为当前项目创建了完整的 tmux 环境：

```bash
colyn repair

✔ 检查主分支 .env.local...
✔ 修复 git worktree 连接...
✔ 创建了 session "my-task-app" 和 3 个 window

💡 运行 'tmux attach -t my-task-app' 进入工作环境
```

进入 tmux：

```bash
tmux attach -t my-task-app
```

眼前的画面让小明眼前一亮。所有 worktree 统一在一个 tmux session 里，每个 worktree 对应一个 window：

```
tmux 状态栏：
[my-task-app] 0:main  1:auth*  2:tasks  3:dashboard
```

按 `Ctrl-b 1`，切到认证功能的 window。每个 window 都是固定的三栏布局：

```
┌──────────────────────┬───────────────┐
│                      │  Dev Server   │
│                      │  PORT=3001    │  ← 右上：开发服务器日志
│   Claude Code        ├───────────────┤
│                      │               │
│                      │  Bash         │  ← 右下：手动操作
│       60%            │     40%       │
│                      │               │
└──────────────────────┴───────────────┘
```

- **左侧 60%**：Claude Code，AI 主力
- **右上**：Dev Server，实时查看日志
- **右下**：Bash，跑测试、Git 操作

**最关键的是**：Claude Code 和 Dev Server 都自动启动了。每个 window 进去就是完整的开发环境，不需要手动配置任何东西。

快捷键秒切：

```
Ctrl-b 0  → 主分支（干净、稳定，用于合并）
Ctrl-b 1  → 认证功能
Ctrl-b 2  → 任务管理
Ctrl-b 3  → 数据仪表盘
```

不再迷路，不再 `Cmd+Tab`。状态栏上清清楚楚地显示着每个 window 的名字，带 `*` 号的是当前 window。

小明还发现了一些实用的操作：

- `Ctrl-b z`：把当前 pane 全屏（放大 Claude Code 的输出仔细看），再按一次还原
- `Ctrl-b o`：在三个 pane 之间切换
- `Ctrl-b d`：分离 session（一切后台运行，tmux session 不会丢失）

三个 AI 同时在各自的 window 里写代码。小明用 `Ctrl-b 1/2/3` 来回切换，查看进度，审查代码，给出反馈。**从管理三个终端窗口变成了在一个窗口里指挥三个 AI。**

---

## 收获：合并、检查与复用

### 合并第一个功能

认证功能开发完成了。小明在 worktree 1 里直接执行合并：

```bash
# 在 worktrees/task-1 目录中
colyn merge --push
```

他不需要指定 worktree ID——Colyn 自动识别当前所在的 worktree。

合并过程中，Colyn 自动跑了一轮检查：

```
⠿ 运行 Lint 检查...
✔ Lint 检查通过
⠿ 运行 Build 检查...
✔ Build 检查通过
⠿ 合并分支...
✓ feature/auth 已合并到 main
✓ 已推送到远程
```

Lint 和 Build 是 Colyn 的工具链插件自动执行的——它检测到 `package.json` 里有 `lint` 和 `build` 脚本，就会在合并前运行。**代码质量有了自动把关。**

如果检查失败呢？合并会被阻止，小明需要先修复问题。紧急情况下也可以用 `--skip-build` 跳过检查，但 Colyn 的默认行为是安全优先。

### 处理合并冲突

合并任务管理功能时，因为和认证功能修改了同一个导航组件，出现了冲突：

```bash
cd worktrees/task-2
colyn merge

⚠ 合并冲突！
请在当前 worktree 中解决冲突后重试
```

冲突发生在 worktree 里，主分支不受影响。小明在 worktree 中解决冲突、提交，然后再次 `colyn merge --push`，干净利落。

### 复用 Worktree：最高效的方式

认证功能合并完了，worktree 1 空闲了。小明不会删除它——**复用 worktree 才是 Colyn 推荐的方式**。

```bash
cd worktrees/task-1
colyn todo start
```

`todo start` 列出所有待办任务：

```
? 选择要开始的任务 ›
❯ feature/reset-password  实现密码重置功能
  feature/tags            实现任务标签系统
```

小明选择了"密码重置"——这和刚刚完成的认证功能密切相关。

```
✓ 切换到分支: feature/reset-password
✓ 更新 window 名称: reset-password
✓ 归档日志: .claude/logs/archived/feature-auth/
✓ Todo "feature/reset-password" 已标记为完成

任务描述：
实现密码重置功能
- 用户点击「忘记密码」→ 输入邮箱 → 发送重置链接
...

✓ 已复制到剪贴板
```

注意发生了什么：

1. Worktree 切换到了新分支 `feature/reset-password`
2. tmux window 名称自动从 `auth` 更新为 `reset-password`
3. 之前的 Claude 日志自动归档
4. 任务描述复制到剪贴板，准备粘贴给 Claude

**更关键的是**：因为是同一个 worktree 目录（`worktrees/task-1`），Claude Code 的项目上下文得以保留。Claude 已经熟悉了这个目录的代码结构、认证模块的实现方式。现在让它做密码重置——一个与认证高度相关的功能——它不需要从头理解项目，直接就能在已有的认证代码基础上扩展。

这就是复用 worktree 的核心优势：

- **端口不变**（3001），浏览器书签还能用
- **Window 位置不变**（`Ctrl-b 1`），肌肉记忆不受影响
- **Claude 上下文复用**——做相关功能时效率显著提升
- **环境不变**，不需要重新装依赖

小明把任务描述粘贴到 Claude Code 里，补充了一些细节，Claude 又开始工作了。而 worktree 2 和 3 里的 AI 还在继续各自的任务。

---

## 长期节奏：发布与日常

### 发布版本

三个核心功能和后续的密码重置、标签系统都开发完成后，小明准备发布第一个版本：

```bash
colyn release minor
```

```
✓ 检查 git 状态...
⠿ 安装依赖...
✔ 依赖安装完成
⠿ 运行 Lint 检查...
✔ Lint 检查通过
⠿ 运行 Build 检查...
✔ Build 检查通过
✓ 更新版本: 0.0.0 → 0.1.0
✓ 创建 tag: v0.1.0
✓ 推送到远程
正在更新所有 worktree...
✓ 所有 worktree 已更新
✓ 发布 v0.1.0 成功
```

一条命令完成了完整的发布流程：lint、build、版本号更新、tag、推送、同步所有 worktree。无论小明在哪个目录执行，Colyn 都会在主分支中完成发布。

### 日常工作节奏

从那个冲刺周末之后，小明形成了稳定的开发节奏：

**早上**：打开终端，一条命令恢复所有上下文：

```bash
tmux attach -t my-task-app
```

所有 window、pane、甚至 Claude 的会话历史都还在。

**开发循环**：

```
随时想到新点子 → colyn todo add 捕获灵感
某个 worktree 空闲 → colyn todo start 挑选下一个任务
                   → 粘贴到 Claude → 补充细节 → AI 开工
开发完成 → colyn merge --push
定期整理 → colyn todo archive -y（归档已完成任务）
```

**晚上**：`Ctrl-b d` 分离 tmux session，一切后台运行。明天 attach 回来继续。

### 搬家也不怕

有一次小明把项目目录从 `~/projects` 移到了 `~/Desktop`。Git worktree 的路径引用全部失效了。

```bash
colyn repair
```

```
✔ 检查主分支 .env.local...
✔ 修复 git worktree 连接...
✔ 检测并修复孤儿 worktree 目录...
✔ 创建了 session "my-task-app" 和 3 个 window
✓ 修复完成！
```

一条命令，自动修复所有路径引用、环境变量文件和 tmux session。

### 不只是 Node.js

小明后来接了一个 Java Spring Boot 的项目，Colyn 同样能用——工具链插件自动检测到 `pom.xml`，端口默认 8080，配置文件写入 `application-local.properties`。Python、Gradle、甚至 Xcode 项目都有对应的插件。

对于前后端分离的 Mono Repo 项目，Colyn 也能处理——自动扫描子目录，每个子项目独立管理工具链。

---

小明回想起那个周末，一个人对着屏幕，同时指挥三个 AI 开发不同的功能，在 tmux 的 window 之间来回切换审查代码。他不再是那个写每一行代码的人了——他是那个拆解任务、分配给 AI、审查成果的指挥者。

**从"一个人写代码"到"指挥一支 AI 团队"，中间只差一个 `colyn init`。**
