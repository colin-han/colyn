# 命令参考 — 系统与配置

[← 返回命令参考](README.md)

---

## colyn repair

检查并修复项目配置。

### 语法

```bash
colyn repair
```

### 功能说明

`colyn repair` 用于移动项目目录后或配置出现问题时，自动检查并修复项目配置。

**检查和修复内容：**

1. **主分支 .env.local**
   - 检查 PORT 和 WORKTREE 环境变量
   - WORKTREE 必须为 "main"

2. **Worktree .env.local**
   - 检查 PORT 和 WORKTREE 环境变量
   - PORT 必须为 `主端口 + ID`
   - WORKTREE 必须为 ID

3. **Git worktree 连接**
   - 运行 `git worktree repair` 修复连接
   - 修复主分支与 worktree 的双向连接

4. **插件初始化**（非致命）
   - 根据 `.colyn/settings.json` 中配置的工具链插件，重新运行插件 init
   - 失败时仅显示警告，不中断修复流程

5. **孤儿 worktree 目录**
   - 检测路径失效的 worktree（可修复）
   - 检测真孤儿型 worktree（仅报告）

**Tmux 集成：**
- 如果 session 不存在则创建
- 如果 window 不存在则创建并设置 3-pane 布局

### 使用场景

```bash
# 移动项目目录后
$ mv ~/project ~/Desktop/project
$ cd ~/Desktop/project

# 运行修复
$ colyn repair
✔ 检测并修复孤儿 worktree 目录...
✔ 已修复 2 个路径失效的 worktree
✔ 创建了 session "project" 和 3 个 window

✓ 修复完成！
```

### 执行结果

```
✔ 检查主分支 .env.local
✔ 检查 worktree task-1 .env.local
✗ 修复 worktree task-2 .env.local
  - PORT: 10005 → 10002
  - WORKTREE: 3 → 2
✔ 修复 git worktree 连接
✔ 检查孤儿 worktree 目录

✓ 修复完成！
```

### 常见错误

| 错误场景 | 系统行为 |
|---------|---------|
| 项目未初始化 | 报错退出，提示先运行 `colyn init` |
| 不是 git 仓库 | 报错退出，提示确保在 git 项目中运行 |
| git worktree repair 失败 | 记录错误，继续其他检查 |
| 无法写入 .env.local | 记录错误，继续其他检查 |

### 提示

- 移动项目目录后建议立即运行
- 采用"尽力而为"策略，单个错误不会中断流程
- 只修复明确的配置错误，不删除文件
- 可以在项目的任意位置运行

---

## colyn config

管理 Colyn 配置。

### 语法

```bash
# 显示 tmux 配置信息（默认行为）
colyn config [选项]

# 获取配置值
colyn config get <key> [选项]

# 设置配置值
colyn config set <key> <value> [选项]
```

### 子命令

#### `colyn config get <key>`

获取配置项的值。

**参数：**
- `key` - 配置键名（`npm` 或 `lang`）

**选项：**
- `--user` - 从用户级配置读取（`~/.config/colyn/settings.json`）

**示例：**
```bash
# 获取当前项目的语言设置
$ colyn config get lang
zh-CN

# 获取用户级语言设置
$ colyn config get lang --user
en
```

#### `colyn config set <key> <value>`

设置配置项的值。

**支持的配置项：**

| 配置键 | 说明 | 有效值 |
|-------|------|--------|
| `npm` | 包管理器命令 | `npm`, `yarn`, `pnpm` 等 |
| `lang` | 界面语言 | `en`, `zh-CN` |

**选项：**
- `--user` - 设置用户级配置（影响所有项目）

**示例：**
```bash
# 设置项目级语言为中文
$ colyn config set lang zh-CN
✓ 配置已设置：lang = zh-CN (项目)

# 设置用户级语言为英文
$ colyn config set lang en --user
✓ 配置已设置：lang = en (用户)

# 设置包管理器为 yarn
$ colyn config set npm yarn --user
✓ 配置已设置：npm = yarn (用户)
```

### 配置文件优先级

配置值按以下优先级决定（从高到低）：

1. **环境变量**：仅 `COLYN_LANG`
2. **项目配置**：`.colyn/settings.json`
3. **用户配置**：`~/.config/colyn/settings.json`
4. **默认值**：`npm='npm'`、`lang='en'`

### 配置文件位置

- **用户级配置**：`~/.config/colyn/settings.json`（影响所有项目）
- **项目级配置**：`.colyn/settings.json`（仅影响当前项目，优先级更高）

### 语言设置

```bash
# 设置用户级默认语言（推荐）
colyn config set lang zh-CN --user

# 为当前项目设置特定语言
colyn config set lang en

# 临时使用（环境变量）
COLYN_LANG=zh-CN colyn --help
```

---

## colyn completion

生成 shell 自动补全脚本。

### 语法

```bash
colyn completion [shell] [选项]
```

### 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `shell` | 否 | Shell 类型（bash 或 zsh） |

### 选项

| 选项 | 说明 |
|------|------|
| `--install` | 显示安装说明 |

### 功能说明

`colyn completion` 生成 shell 自动补全脚本，支持：
- 命令补全
- 选项补全
- 参数补全（实时查询 worktree 列表）

### 示例

```bash
# 输出 bash 补全脚本
$ colyn completion bash

# 输出 zsh 补全脚本
$ colyn completion zsh

# 显示 zsh 安装说明
$ colyn completion zsh --install

# 手动安装到 Bash
$ colyn completion bash > ~/.colyn-completion.bash
$ echo "source ~/.colyn-completion.bash" >> ~/.bashrc

# 手动安装到 Zsh
$ colyn completion zsh > ~/.colyn-completion.zsh
$ echo "source ~/.colyn-completion.zsh" >> ~/.zshrc
```

### 提示

- `colyn setup` 命令会自动配置补全脚本
- 支持动态补全 worktree ID 和分支名
- Tab 键可自动完成命令和参数

---

## colyn setup

配置 shell 集成（支持自动目录切换和命令补全）。

### 语法

```bash
colyn setup
```

### 功能说明

`colyn setup` 自动完成 shell 集成配置：

**检测和配置：**
1. 检测 shell 类型（bash/zsh）
2. 检测 shell 配置文件路径
3. 定位 colyn.sh 文件路径
4. 添加 shell 集成到配置文件
5. 添加补全脚本到配置文件

**更新策略：**
- 如果配置已存在：更新路径
- 如果配置不存在：追加新配置
- 保持其他配置不变

### 使用场景

```bash
# 安装后首次配置
$ npm install -g colyn
$ colyn setup

检测系统环境...
✓ Shell 类型: zsh
✓ 配置文件: /Users/username/.zshrc
✓ Colyn 安装路径: /Users/username/.volta/...

配置 shell 集成...
✓ 已添加 shell 集成到 ~/.zshrc
✓ 已添加补全脚本到 ~/.zshrc

✓ 安装完成！

生效配置：
  方式 1（推荐）：重新打开终端
  方式 2：运行命令：source ~/.zshrc
```

### 常见错误

| 错误场景 | 错误信息 | 解决方法 |
|---------|---------|---------|
| 找不到 colyn.sh | `✗ 找不到 shell 集成脚本` | 检查 colyn 安装是否完整，重新安装 |
| 无法写入配置文件 | `✗ 无法写入配置文件` | 检查文件权限或手动添加配置 |
| Windows 平台 | `⚠ Windows 平台暂不支持自动配置` | 查看 README.md 中的 Windows 配置说明 |

### 提示

- npm 全局安装后建议立即运行
- 支持 macOS 和 Linux，支持 bash 和 zsh
- 配置后需要重新打开终端或运行 `source` 命令生效
- 不会覆盖用户配置文件的其他内容
