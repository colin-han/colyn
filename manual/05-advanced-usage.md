# 高级用法

本章介绍 Colyn 的高级功能和使用场景。

---

## 多 Worktree 并行开发

### 并行 Vibe Coding 方法论

**核心理念**：使用多个 worktree 实现多个功能的并行开发，每个 worktree 独立运行开发服务器，避免分支切换带来的上下文丢失。

**适用场景**：
- 同时开发多个独立功能
- 功能开发的同时处理 Bug 修复
- 在不同分支间快速对比测试
- 使用 AI 工具（如 Claude Code）并行协作

### 实践示例

```bash
# 创建三个并行的 worktree
colyn add feature/authentication
colyn add feature/dashboard
colyn add feature/notifications

# 查看所有 worktree
colyn list

# 输出：
# ┌────────┬──────────────────────┬──────┐
# │ ID     │ 分支                 │ 端口 │
# ├────────┼──────────────────────┼──────┤
# │ 0-main │ main                 │ 3000 │
# │ 1      │ feature/auth       * │ 3001 │
# │ 2      │ feature/dashboard    │ 3002 │
# │ 3      │ feature/notifications│ 3003 │
# └────────┴──────────────────────┴──────┘
```

在浏览器中同时访问：
- http://localhost:3001 - 查看认证功能
- http://localhost:3002 - 查看仪表板
- http://localhost:3003 - 查看通知功能

---

## JSON 输出与脚本集成

### 使用 JSON 格式输出

Colyn 提供 JSON 格式输出，便于在脚本中处理：

```bash
# 获取 JSON 格式的 worktree 列表
colyn list --json
```

输出示例：

```json
[
  {
    "id": "0-main",
    "branch": "main",
    "port": 3000,
    "path": "/path/to/project/my-project",
    "isCurrent": false
  },
  {
    "id": "1",
    "branch": "feature/login",
    "port": 3001,
    "path": "/path/to/project/worktrees/task-1",
    "isCurrent": true
  }
]
```

### 脚本使用示例

**获取当前 worktree 的分支名**：

```bash
colyn list --json | jq -r '.[] | select(.isCurrent) | .branch'
# 输出: feature/login
```

**获取所有端口号**：

```bash
colyn list --json | jq -r '.[].port'
# 输出:
# 3000
# 3001
# 3002
```

**统计 worktree 数量**：

```bash
colyn list --json | jq 'length'
# 输出: 3
```

---

## 路径输出模式

### 使用 --paths 选项

获取所有 worktree 的路径列表：

```bash
colyn list --paths
```

输出：

```
/path/to/project/my-project
/path/to/project/worktrees/task-1
/path/to/project/worktrees/task-2
```

### 在脚本中使用

**遍历所有 worktree**：

```bash
#!/bin/bash
# 对所有 worktree 执行命令

colyn list --paths | while read -r path; do
  echo "Processing: $path"
  (cd "$path" && git status)
done
```

---

## 灵活的目标识别

### 多种指定 Worktree 的方式

Colyn 支持三种方式识别 worktree：

#### 1. 使用 ID

```bash
colyn merge 1
colyn remove 2
colyn checkout 1 new-branch
```

#### 2. 使用分支名

```bash
colyn merge feature/login
colyn remove feature/dashboard
```

#### 3. 自动识别（在 worktree 目录中）

```bash
# 在 worktrees/task-1/ 目录中
cd worktrees/task-1
colyn merge              # 自动识别为 worktree 1
colyn remove             # 自动识别为 worktree 1
colyn checkout new-branch  # 在当前 worktree 中切换分支
```

---

## Info 命令的高级用法

### 输出格式选项

**完整信息**：

```bash
colyn info

# 输出:
# 📁 Project:      my-project
# 📂 Project Path: /path/to/my-project
# 🔢 Worktree ID:  1
# 📁 Worktree Dir: task-1
# 🌿 Branch:       feature/login
```

**简短标识符**：

```bash
colyn info --short

# 输出:
# my-project/task-1 (⎇ feature/login)
```

**特定字段**：

```bash
# 获取分支名
colyn info -f branch
# 输出: feature/login

# 获取端口号
colyn info -f port
# 输出: 3001

# 多个字段
colyn info -f project -f branch -f port
# 输出: my-project    feature/login    3001
```

**自定义格式**：

```bash
colyn info --format '{project}/{worktreeDir} on {branch}'
# 输出: my-project/task-1 on feature/login
```

### 集成到 Shell 提示符

将项目信息显示在 shell 提示符中：

```bash
# 添加到 ~/.zshrc
function colyn_prompt() {
  if colyn info &>/dev/null; then
    colyn info --short
  fi
}

PROMPT='[$(colyn_prompt)] %~ $ '
```

效果：

```bash
# 在 worktree 中
[my-project/task-1 (⎇ feature/login)] ~/project/worktrees/task-1 $

# 在主分支中
[my-project/main (⎇ main)] ~/project/my-project $

# 在非 Colyn 项目中
~/other-project $
```

---

## Worktree 复用策略

### 何时使用 `add` vs `checkout`

**使用 `colyn add`**（创建新 worktree）：
- 长期并行开发的功能
- 需要独立运行服务器的分支
- 不同阶段的功能测试

```bash
colyn add feature/payment     # 支付功能
colyn add feature/analytics   # 分析功能
colyn add feature/admin       # 管理功能
```

**使用 `colyn checkout`**（在现有 worktree 中切换分支）：
- 快速切换到其他分支
- 临时的 Bug 修复
- 功能相关的多个分支
- Code Review

```bash
# 在 worktree 1 中切换分支
colyn checkout 1 bugfix/issue-100
# 修复完成后切换到另一个 bug
colyn checkout 1 bugfix/issue-101
```

### Checkout 的自动归档功能

`colyn checkout` 会自动归档 `.claude/logs/` 目录中的日志文件：

```bash
# 当前在 feature/auth 分支
cd worktrees/task-1

# 切换到新分支
colyn checkout feature/payment

# Colyn 自动执行：
# 1. 检查 feature/auth 是否已合并
# 2. 归档日志文件到 .claude/logs/archived/feature-auth/
# 3. 切换到 feature/payment 分支
# 4. (可选) 删除已合并的旧分支
```

---

## 项目迁移和修复

### 移动项目到新位置

当需要移动项目目录时：

```bash
# 1. 移动整个项目
mv ~/old-location/my-project ~/new-location/my-project

# 2. 进入新位置
cd ~/new-location/my-project

# 3. 运行修复命令
colyn repair
```

**`colyn repair` 会自动**：
1. 修复 Git worktree 的路径引用
2. 检查并修复所有 `.env.local` 文件
3. 检测并处理孤儿 worktree 目录
4. 如果配置了 tmux，修复或重建 session 和 windows

### Repair 命令的应用场景

**场景 1：项目移动后**

```bash
$ mv ~/project ~/Desktop/project
$ cd ~/Desktop/project
$ colyn repair

✓ 检测并修复孤儿 worktree 目录...
✓ 已修复 2 个路径失效的 worktree
✓ .env.local 文件检查完成
✓ 修复完成！
```

**场景 2：意外删除 worktree 目录后**

```bash
# 误删了 worktrees/task-1 目录
$ rm -rf worktrees/task-1

# 运行 repair 清理 Git 元数据
$ colyn repair

⚠️  检测到孤儿 worktree: task-1
✓ 已清理 Git worktree 元数据
```

**场景 3：环境变量文件损坏**

```bash
# .env.local 文件损坏或缺失
$ colyn repair

✓ 检查主分支 .env.local... 完好
✓ 检查 worktree 1 .env.local... 已修复
✓ 检查 worktree 2 .env.local... 完好
```

---

## 命令选项组合

### Merge 命令的高级用法

**基本合并**：

```bash
colyn merge 1
```

**合并并推送**：

```bash
colyn merge 1 --push
```

**在 worktree 目录中自动识别**：

```bash
cd worktrees/task-1
colyn merge --push
```

### Remove 命令的高级用法

**强制删除（忽略未提交的更改）**：

```bash
colyn remove 1 --force
```

**跳过确认提示**：

```bash
colyn remove 1 --yes
```

**组合选项**：

```bash
colyn remove 1 --force --yes
# 或缩写
colyn remove 1 -f -y
```

### List 命令的高级用法

**不显示主分支**：

```bash
colyn list --no-main

# 只显示 worktrees，不显示主分支
```

**组合 JSON 和 no-main**：

```bash
colyn list --json --no-main | jq -r '.[].branch'
# 输出所有 worktree 的分支名（不包括主分支）
```

---

## 环境变量的高级应用

### 使用 WORKTREE 环境变量

在应用代码中区分不同的 worktree：

```javascript
// config.js
const worktree = process.env.WORKTREE || 'unknown';

if (worktree === 'main') {
  console.log('Running in main branch');
  // 主分支特有配置
} else {
  console.log(`Running in worktree ${worktree}`);
  // Worktree 特有配置
}
```

### 自定义环境变量

在 `.env.local` 中添加项目特定的环境变量：

```bash
# worktrees/task-1/.env.local
PORT=3001
WORKTREE=1

# 自定义变量
DATABASE_URL=postgresql://localhost:5432/dev_db_1
FEATURE_FLAGS=new-ui,beta-features
DEBUG_MODE=true
```

---

## 禁用颜色输出

### 全局选项 --no-color

在不支持颜色的环境中（如 CI/CD），使用 `--no-color` 选项：

```bash
colyn list --no-color
colyn info --no-color
colyn checkout feature/test --no-color
```

### 使用场景

**CI/CD 环境**：

```yaml
# .github/workflows/test.yml
steps:
  - name: List worktrees
    run: colyn list --no-color --json
```

**输出重定向到文件**：

```bash
colyn list --no-color > worktrees.txt
```

**环境变量**：

```bash
export NO_COLOR=1
colyn list  # 自动禁用颜色
```

---

## 从项目任意位置运行命令

### 自动定位项目根目录

Colyn 会自动向上查找 `.colyn/` 目录，定位项目根目录：

```bash
# 在深层目录中
cd my-project/worktrees/task-1/src/components

# 仍然可以使用 colyn 命令
colyn list          # ✓ 正常工作
colyn add feature/new  # ✓ 正常工作

# Colyn 自动找到项目根目录 my-project/
```

### 工作原理

```javascript
// Colyn 内部逻辑
function findProjectRoot(startDir) {
  let currentDir = startDir;

  while (currentDir !== '/') {
    if (fs.existsSync(path.join(currentDir, '.colyn'))) {
      return currentDir;  // 找到项目根目录
    }
    currentDir = path.dirname(currentDir);  // 向上一级
  }

  throw new Error('未找到 Colyn 项目');
}
```

---

## 命令别名

### 创建常用命令别名

在 shell 配置文件中添加别名：

```bash
# ~/.zshrc 或 ~/.bashrc

# Colyn 命令别名
alias ca='colyn add'
alias cl='colyn list'
alias cm='colyn merge'
alias cr='colyn remove'
alias co='colyn checkout'  # 注意：colyn 已内置 co 别名

# 带选项的别名
alias cmp='colyn merge --push'    # 合并并推送
alias clj='colyn list --json'     # JSON 格式列表
alias cln='colyn list --no-color' # 无颜色列表
```

使用别名：

```bash
ca feature/new-feature  # 等同于 colyn add feature/new-feature
cmp 1                   # 等同于 colyn merge 1 --push
```

---

## 与 Git 工作流集成

### Colyn 在 Git Flow 中的应用

**Feature 分支**：

```bash
# 开始新功能
colyn add feature/user-profile

# 开发...

# 完成后合并
colyn merge feature/user-profile --push

# 清理
colyn remove feature/user-profile
```

**Hotfix 流程**：

```bash
# 紧急修复
colyn add hotfix/security-patch

# 修复...

# 快速合并和推送
colyn merge hotfix/security-patch --push

# 立即删除
colyn remove hotfix/security-patch -y
```

**Release 分支**：

```bash
# 准备发布
colyn add release/v1.2.0

# 版本准备、测试...

# 合并到主分支
colyn merge release/v1.2.0 --push
```

---

## 下一步

- 学习 [tmux 集成](06-tmux-integration.md) 提升工作效率
- 查看 [最佳实践](07-best-practices.md) 了解推荐工作流程
- 遇到问题？参考 [故障排除](08-troubleshooting.md)

