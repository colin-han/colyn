# 命令参考手册

本章节提供 Colyn 所有命令的详细参考文档。

---

## 目录

- [全局选项](#全局选项)
- [colyn init](#colyn-init)
- [colyn add](#colyn-add)
- [colyn list](#colyn-list)
- [colyn merge](#colyn-merge)
- [colyn remove](#colyn-remove)
- [colyn checkout](#colyn-checkout)
- [colyn info](#colyn-info)
- [colyn repair](#colyn-repair)
- [colyn config](#colyn-config)
- [colyn completion](#colyn-completion)
- [colyn system-integration](#colyn-system-integration)
- [colyn release](#colyn-release)

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
| `--yes` | `-y` | 在“已有项目”场景下跳过确认提示 | 否 |

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

为指定分支创建新的 Worktree。

### 语法

```bash
colyn add <branch>
```

### 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `branch` | 是 | 分支名称（支持本地分支、远程分支或新建分支） |

### 功能说明

`colyn add` 会智能处理分支：

1. **本地分支存在** - 直接使用本地分支创建 Worktree
2. **远程分支存在** - 自动创建本地跟踪分支
3. **分支不存在** - 基于主分支创建新分支

创建的 Worktree 会：
- 自动分配 ID（递增）
- 自动分配端口号（主端口 + ID）
- 复制主分支环境变量并更新 PORT 和 WORKTREE
- 执行后自动切换到 Worktree 目录

### 示例

```bash
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
| `--push` | 合并后自动推送到远程 |

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
- `.env.local` 的本地变更不会触发该检查

**合并后：**
- 询问是否推送到远程仓库
- 保留 worktree（由用户决定删除时机）

### 示例

**基本合并：**

```bash
# 在 worktree 目录中合并
$ cd worktrees/task-1
$ colyn merge

# 通过 ID 合并
$ colyn merge 1

# 通过分支名合并
$ colyn merge feature/login
```

**自动推送：**

```bash
$ colyn merge 1 --push
```

### 执行结果

```
检测到 worktree:
  ID: 1
  分支: feature/login
  路径: /path/to/worktrees/task-1

✓ 前置检查通过
✓ 主分支工作目录干净
✓ Worktree 工作目录干净

步骤 1/2: 在 worktree 中更新主分支代码
  目录: /path/to/worktrees/task-1
  执行: git rebase main
✔ 主分支已变基到 worktree

步骤 2/2: 在主分支中合并 worktree 分支
  目录: /path/to/my-project
  执行: git merge --no-ff feature/login
✔ worktree 已合并到主分支
✓ 合并完成！

合并信息：
  主分支: main
  合并分支: feature/login
  提交: a1b2c3d Merge branch 'feature/login'

? 是否推送到远程仓库？(y/N) › Yes

✓ 合并完成并已推送到远程！

后续操作：
  1. 查看合并后的代码：
     cd my-project

  2. 如需删除 worktree：
     colyn remove 1
```

### 处理合并冲突

如果在 worktree 中合并主分支时发生冲突：

```
✗ 变基主分支时发生冲突

冲突文件：
  src/app.ts
  src/config.ts

解决步骤：
  1. 进入 worktree 目录解决冲突：
     cd worktrees/task-1
  2. 编辑冲突文件，解决冲突标记
  3. 添加已解决的文件：
     git add <file>
  4. 继续变基：
     git rebase --continue
  5. 如需放弃变基：
     git rebase --abort
  6. 重新运行合并命令：
     colyn merge feature/login
```

### 常见错误

| 错误场景 | 错误信息 | 解决方法 |
|---------|---------|---------|
| 未初始化 | `✗ 当前目录未初始化` | 运行 `colyn init` |
| Worktree 不存在 | `✗ 找不到 worktree` | 检查 ID 或分支名，运行 `colyn list` 查看 |
| 主分支不干净 | `✗ 主分支目录有未提交的更改` | 提交或 stash 主分支的更改 |
| Worktree 不干净 | `✗ Worktree 目录有未提交的更改` | 提交 worktree 的更改 |
| 推送失败 | `✗ 推送到远程仓库失败` | 本地合并已完成，检查网络后手动推送 |

> 说明：`.env.local` 变更不会单独触发“目录不干净”错误。

### 提示

- 合并后不会自动删除 worktree，由用户决定删除时机
- 使用 `--no-ff` 保持清晰的分支历史，便于追踪功能开发周期
- 冲突在 worktree 中解决，不影响主分支稳定性
- 可以在项目的任意位置运行

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

**基本删除：**

```bash
# 在 worktree 目录中删除
$ cd worktrees/task-1
$ colyn remove

# 通过 ID 删除
$ colyn remove 1

# 通过分支名删除
$ colyn remove feature/login
```

**强制删除（忽略未提交更改）：**

```bash
$ colyn remove 1 --force
```

**快速删除（跳过确认）：**

```bash
$ colyn remove 1 -y
```

### 执行结果

```
将要删除的 worktree:
  ID: 1
  分支: feature/login
  路径: /path/to/worktrees/task-1
  端口: 10001

? 确定要删除这个 worktree 吗？(y/N) › Yes
✔ Worktree 已删除

? 是否同时删除本地分支 "feature/login"？(Y/n) › Yes
✔ 分支 "feature/login" 已删除

✓ Worktree 已删除

删除信息:
  ID: 1
  分支: feature/login (已删除)
  路径: /path/to/worktrees/task-1

已自动切换到主分支目录:
  /path/to/my-project

📂 已切换到: /path/to/my-project
```

### 删除未合并的分支

```
将要删除的 worktree:
  ID: 2
  分支: feature/experimental
  路径: /path/to/worktrees/task-2
  端口: 10002

⚠ 分支 "feature/experimental" 尚未合并到 main
  删除后可能丢失未合并的更改

? 确定要删除这个 worktree 吗？(y/N) › Yes
✔ Worktree 已删除

? 是否同时删除本地分支 "feature/experimental"？(y/N) › Yes
✔ 分支 "feature/experimental" 已删除（使用 git branch -D 强制删除）

✓ Worktree 已删除
```

### 有未提交更改时删除

```
将要删除的 worktree:
  ID: 1
  分支: feature/login
  路径: /path/to/worktrees/task-1

⚠ 检测到未提交的更改

变更文件:
  - src/login.ts
  - src/auth.ts
  ... 以及其他 3 个文件

✗ 无法删除：存在未提交的更改
  提示: 请先提交或暂存更改，或使用 --force 强制删除：
  cd "/path/to/worktrees/task-1"
  git add . && git commit -m "..."

或者强制删除：
  colyn remove 1 --force
```

### 常见错误

| 错误场景 | 错误信息 | 解决方法 |
|---------|---------|---------|
| 未初始化 | `✗ 当前目录未初始化` | 运行 `colyn init` |
| Worktree 不存在 | `✗ 找不到 worktree` | 检查 ID 或分支名，运行 `colyn list` 查看 |
| 有未提交更改 | `✗ 无法删除：存在未提交的更改` | 提交更改或使用 `--force` |

### 提示

- 删除前会检查未提交更改，防止意外丢失工作
- 未合并分支只显示警告，允许继续删除
- 分支删除使用安全删除（`-d`）或强制删除（`-D`），取决于是否已合并
- 如果当前在被删除的 worktree 中，会自动切换到主分支目录
- 可以在项目的任意位置运行

---

## colyn checkout

在 Worktree 中切换或创建分支。

### 语法

```bash
colyn checkout [worktree-id] <branch> [选项]

# 别名
colyn co [worktree-id] <branch> [选项]
```

### 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `worktree-id` | 否 | Worktree 的 ID，省略时使用当前 worktree |
| `branch` | 是 | 目标分支名称 |

### 选项

| 选项 | 说明 |
|------|------|
| `--no-fetch` | 跳过从远程获取分支信息 |

### 功能说明

`colyn checkout` 允许在 worktree 中切换分支，复用已有 worktree 进行不同分支的开发。

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

**执行后：**
- 自动切换到目标 worktree 目录

### 示例

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
旧分支 feature/old 已删除

当前状态：
  Worktree: task-1
  分支: feature/new-login
  路径: /path/to/worktrees/task-1

📂 已切换到: /path/to/worktrees/task-1
```

### 执行结果（旧分支未合并）

```
⚠ 当前分支 feature/old 尚未合并到主分支

如果切换分支，这些更改将保留在原分支上。
? 是否继续切换？ (y/N) y

✓ 已切换到分支 feature/new-login

日志已归档到: .claude/logs/archived/feature-old/

当前状态：
  Worktree: task-1
  分支: feature/new-login
  路径: /path/to/worktrees/task-1

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
| `project-path` | 主目录完整路径 | `/Users/me/work/myapp/myapp` |
| `worktree-id` | Worktree ID（主分支为 0） | `1` |
| `worktree-dir` | Worktree 目录名 | `task-1` |
| `branch` | 当前分支名称 | `feature/login` |

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
📁 Project:      myapp
📂 Project Path: /Users/me/work/myapp/myapp
🔢 Worktree ID:  1
📁 Worktree Dir: task-1
🌿 Branch:       feature/login
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

$ colyn info --field=project-path
/Users/me/work/myapp/myapp
```

**获取多个字段：**

```bash
# 默认用 tab 分隔
$ colyn info -f project -f branch
myapp	feature/login

# 自定义分隔符
$ colyn info -f project -f branch -s "/"
myapp/feature/login

$ colyn info -f project -f worktree-id -s ":"
myapp:1
```

**模板字符串格式化：**

```bash
$ colyn info --format="{project}/{worktree-dir}"
myapp/task-1

$ colyn info --format="当前在 {branch} 分支工作"
当前在 feature/login 分支工作

$ colyn info --format="{project}:{worktree-id}:{branch}"
myapp:1:feature/login
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
- 字段输出适合在脚本中使用

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

4. **孤儿 worktree 目录**
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

修复摘要：
  ✓ 修复了 1 个 .env.local 文件
  ✓ Git worktree 连接已修复
  ✓ 未发现孤儿 worktree 目录

详细信息：
  主分支：
    ✓ .env.local 配置正确

  Worktree task-1：
    ✓ .env.local 配置正确

  Worktree task-2：
    ✗ PORT 错误：10005 → 10002
    ✗ WORKTREE 错误：3 → 2
```

### 孤儿 worktree 检测

**路径失效型（可修复）：**
- 原因：项目目录被移动或改名
- 处理：使用 `git worktree repair <new-path>` 修复路径

**真孤儿型（仅报告）：**
- 原因：手动删除了 worktree，或 git 数据损坏
- 处理：仅报告，建议用户手动清理

```
✓ 修复完成！

修复摘要：
  ✓ 检查了 3 个 .env.local 文件，无问题
  ✓ Git worktree 连接正常
  ⚠ 发现 1 个孤儿 worktree 目录：
    - worktrees/task-3 (目录存在但 git 不识别)

建议操作：
  运行 colyn remove 命令清理，或手动删除目录
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
- `--user` - 从用户级配置读取（`~/.config/colyn/settings.json`），而不是项目配置

**输出：**
配置值输出到 stdout，可供脚本解析。

**示例：**
```bash
# 获取当前项目的语言设置
$ colyn config get lang
zh-CN

# 获取用户级语言设置
$ colyn config get lang --user
en

# 在脚本中使用
LANG=$(colyn config get lang)
```

#### `colyn config set <key> <value>`

设置配置项的值。

**参数：**
- `key` - 配置键名（`npm` 或 `lang`）
- `value` - 配置值

**选项：**
- `--user` - 设置用户级配置（`~/.config/colyn/settings.json`），而不是项目配置

**支持的配置项：**

| 配置键 | 说明 | 有效值 |
|-------|------|--------|
| `npm` | 包管理器命令 | `npm`, `yarn`, `pnpm` 等 |
| `lang` | 界面语言 | `en`, `zh-CN` |

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

#### `colyn config`（默认）

显示 tmux 配置信息（保持向后兼容）。

**选项：**
- `--json` - 以 JSON 格式输出

### 配置文件优先级

配置值按以下优先级决定（从高到低）：

1. **环境变量**：`COLYN_NPM`、`COLYN_LANG`
2. **项目配置**：`.colyn/settings.json`
3. **用户配置**：`~/.config/colyn/settings.json`
4. **默认值**：`npm='npm'`、`lang='en'`

### 配置文件位置

- **用户级配置**：`~/.config/colyn/settings.json`
  - 影响所有项目
  - 使用 `--user` 选项操作

- **项目级配置**：`.colyn/settings.json`（项目根目录）
  - 仅影响当前项目
  - 优先级高于用户配置

### 语言设置

设置界面语言可以通过三种方式：

**方式 1：使用配置命令（推荐）**
```bash
# 设置用户级默认语言
colyn config set lang zh-CN --user

# 为当前项目设置特定语言
colyn config set lang en
```

**方式 2：使用环境变量（临时）**
```bash
# 临时使用中文界面
COLYN_LANG=zh-CN colyn --help
```

**方式 3：编辑配置文件**
```json
{
  "lang": "zh-CN"
}
```

### 注意事项

- 设置无效的配置值会报错（如不支持的语言）
- 配置更改立即生效，无需重启
- 项目配置会覆盖用户配置

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

**输出补全脚本：**

```bash
# 输出 bash 补全脚本
$ colyn completion bash

# 输出 zsh 补全脚本
$ colyn completion zsh
```

**显示安装说明：**

```bash
$ colyn completion zsh --install
```

**手动安装：**

```bash
# Bash
$ colyn completion bash > ~/.colyn-completion.bash
$ echo "source ~/.colyn-completion.bash" >> ~/.bashrc

# Zsh
$ colyn completion zsh > ~/.colyn-completion.zsh
$ echo "source ~/.colyn-completion.zsh" >> ~/.zshrc
```

### 提示

- `colyn system-integration` 命令会自动配置补全脚本
- 支持动态补全 worktree ID 和分支名
- Tab 键可自动完成命令和参数

---

## colyn system-integration

配置 shell 集成（支持自动目录切换和命令补全）。

### 语法

```bash
colyn system-integration
```

### 功能说明

`colyn system-integration` 自动完成 shell 集成配置：

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

**首次安装后配置：**

```bash
# 安装 colyn
$ npm install -g colyn

# 配置 shell 集成
$ colyn system-integration

检测系统环境...
✓ Shell 类型: zsh
✓ 配置文件: /Users/username/.zshrc
✓ Colyn 安装路径: /Users/username/.volta/tools/image/packages/colyn/lib/node_modules/colyn

配置 shell 集成...
✓ 已添加 shell 集成到 ~/.zshrc
✓ 已添加补全脚本到 ~/.zshrc

✓ 安装完成！

生效配置：
  方式 1（推荐）：重新打开终端
  方式 2：运行命令：source ~/.zshrc

功能说明：
  ✓ colyn 命令支持自动目录切换
  ✓ 使用 Tab 键可自动完成命令和参数
```

**更新已有配置：**

```bash
$ colyn system-integration

检测系统环境...
✓ Shell 类型: zsh
✓ 配置文件: /Users/username/.zshrc
✓ Colyn 安装路径: /Users/username/.volta/tools/image/packages/colyn/lib/node_modules/colyn

配置 shell 集成...
✓ 已更新 ~/.zshrc 中的 shell 集成配置
✓ 已更新补全脚本配置

✓ 更新完成！

生效配置：
  运行命令：source ~/.zshrc
```

### 常见错误

| 错误场景 | 错误信息 | 解决方法 |
|---------|---------|---------|
| 找不到 colyn.sh | `✗ 找不到 shell 集成脚本` | 检查 colyn 安装是否完整，重新安装 |
| 无法写入配置文件 | `✗ 无法写入配置文件` | 检查文件权限或手动添加配置 |
| Windows 平台 | `⚠ Windows 平台暂不支持自动配置` | 查看 README.md 中的 Windows 配置说明 |

### 提示

- npm 全局安装后建议立即运行
- 支持 macOS 和 Linux
- 支持 bash 和 zsh
- 配置后需要重新打开终端或运行 `source` 命令生效
- 不会覆盖用户配置文件的其他内容

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

### 功能说明

`colyn release` 提供统一的发布入口，无论从哪个目录执行，始终在主分支中完成发布，并默认自动将最新代码同步到所有 worktree。

如果在项目根目录执行，Colyn 会自动在主分支目录执行发布检查与发布流程。

**执行流程：**
1. 检查当前目录是否有未提交代码
2. 检查当前分支是否已合并（仅在 worktree 中执行时）
3. 检查 git 状态（主分支）
4. 运行 lint 和 build
5. 更新 package.json 版本
6. 创建提交与 tag
7. 推送到远程
8. **自动更新所有 worktree（除非使用 `--no-update`）**

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

# 在 worktree 中发布 patch 版本
$ cd worktrees/task-1
$ colyn release patch

步骤 1: 检查当前目录状态
✓ 工作目录干净
步骤 2: 检查分支合并状态
✓ 分支 feature/login 已合并到 main
步骤 3: 检查 git 状态 (Main Branch)
✓ 工作区干净
...
✓ 发布完成

正在更新所有 worktree...
✓ 所有 worktree 已更新

# 在主分支中发布 minor 版本
$ cd my-project
$ colyn release minor

# 发布指定版本号
$ colyn release 1.2.3

# 发布但不自动更新 worktree
$ colyn release --no-update
```

### 常见错误

| 错误场景 | 错误信息 | 解决方法 |
|---------|---------|---------|
| 在项目外执行 | `✗ 当前目录不属于 Colyn 项目` | 在项目目录内执行 |
| 当前目录有未提交代码 | `✗ 当前目录有未提交的更改` | 提交或 stash 更改 |
| 当前分支未合并 | `✗ 分支未合并到主分支` | 先合并分支：`colyn merge <branch>` |
| 主分支工作区不干净 | `✗ 工作区有未提交更改` | 提交或 stash 更改 |

### 提示

- 复用现有发布脚本逻辑
- 无需手动切换到主分支目录
- 发布流程与 `yarn release:xxx` 保持一致
- 默认自动更新所有 worktree，确保所有开发分支基于最新版本
- 如果不希望自动更新，使用 `--no-update` 选项
- **最常用方式**：直接运行 `colyn release` 即可发布 patch 版本
---

## 总结

本命令参考手册涵盖了 Colyn 的所有命令。每个命令都：
- 提供清晰的语法格式
- 说明参数和选项的用法
- 包含实际的使用示例
- 列出常见错误和解决方法
- 给出实用的提示

建议结合[快速开始指南](01-quick-start.md)和[核心概念](03-core-concepts.md)一起阅读，以更好地理解和使用 Colyn。
