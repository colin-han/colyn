# 故障排除

本章提供常见问题的解决方案。

---

## 安装问题

### Q: 运行 `colyn` 提示 "command not found"

**可能原因**：
1. 未添加到 PATH
2. Shell 配置未重新加载
3. 安装失败

**解决方案**：

```bash
# 1. 检查是否已安装
which colyn

# 2. 如果找不到，检查安装方式

# npm 全局安装
npm list -g colyn

# 如果未安装，重新安装
npm install -g colyn

# 3. 如果已安装但找不到，检查 PATH
echo $PATH

# 4. 重新加载 shell 配置
source ~/.zshrc  # 或 ~/.bashrc

# 5. 或使用绝对路径
/usr/local/bin/colyn --version
```

### Q: npm 安装时权限错误

**错误信息**：
```
EACCES: permission denied
```

**解决方案**：

```bash
# 方法 1: 使用 volta（推荐）
curl https://get.volta.sh | bash
volta install colyn

# 方法 2: 修复 npm 权限
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
source ~/.zshrc
npm install -g colyn

# 方法 3: 使用 sudo（不推荐）
sudo npm install -g colyn
```

### Q: Shell 集成配置失败

**解决方案**：

```bash
# 1. 手动配置
colyn setup

# 2. 如果失败，检查 shell 类型
echo $SHELL

# 3. 手动添加到配置文件
# 对于 Zsh，编辑 ~/.zshrc
# 对于 Bash，编辑 ~/.bashrc

# 添加以下内容（替换为实际路径）
source /path/to/colyn.d/shell/colyn.sh
# Zsh:
source /path/to/colyn.d/shell/completion.zsh
# Bash:
source /path/to/colyn.d/shell/completion.bash

# 4. 重新加载配置
source ~/.zshrc
```

---

## 初始化问题

### Q: `colyn init` 提示 "Not a git repository"

**错误信息**：
```
✗ 错误: 当前目录不是 git 仓库
```

**解决方案**：

```bash
# 初始化 git 仓库
git init

# 然后再运行
colyn init -p 3000
```

### Q: 初始化后目录结构不对

**检查清单**：

```bash
# 1. 检查项目结构
tree -L 2 .

# 应该看到：
# .
# ├── .colyn/
# ├── my-project/
# │   ├── .git/
# │   └── ...
# └── worktrees/

# 2. 如果结构不对，运行修复
colyn repair
```

### Q: .env.local 文件缺失

**解决方案**：

```bash
# 1. 检查主分支目录
cd my-project/my-project
cat .env.local

# 2. 如果不存在，手动创建
echo "PORT=3000" > .env.local
echo "WORKTREE=main" >> .env.local

# 3. 或重新运行初始化
cd ../..
colyn repair
```

---

## Worktree 创建问题

### Q: `colyn add` 提示分支已存在

**错误信息**：
```
✗ 错误: 分支 feature/login 已有对应的 worktree
```

**解决方案**：

```bash
# 1. 查看现有 worktree
colyn list

# 2. 如果要使用该分支，切换到对应的 worktree
cd worktrees/task-1

# 3. 如果要删除旧的，再创建新的
colyn remove 1
colyn add feature/login
```

### Q: 创建后没有自动切换目录

**可能原因**：
- Shell 集成未配置
- 使用的是 Node.js 二进制而非 shell 函数

**解决方案**：

```bash
# 1. 配置 shell 集成
colyn setup
source ~/.zshrc

# 2. 验证是否使用 shell 函数
type colyn

# 应该输出: colyn is a shell function
# 而不是: colyn is /usr/local/bin/colyn

# 3. 如果仍然是二进制，重新配置
source ~/.zshrc
type colyn
```

### Q: 端口分配冲突

**检查端口**：

```bash
# 1. 查看分配的端口
colyn list

# 2. 检查端口是否被占用
lsof -i :3001

# 3. 如果被占用，修改 base port
# 编辑主分支的 .env.local
cd my-project/my-project
vim .env.local
# 修改 PORT=3000 为 PORT=4000

# 4. 重新创建 worktrees
```

---

## 合并问题

### Q: `colyn merge` 提示工作目录不干净

**错误信息**：
```
✗ 错误: 工作目录有未提交的更改
```

> 说明：`.env.local` 的本地变更不会单独触发此错误。

**解决方案**：

```bash
# 1. 查看未提交的更改
git status

# 2. 提交更改
git add .
git commit -m "完成功能"

# 3. 或暂存更改
git stash

# 4. 然后再合并
colyn merge 1

# 5. 恢复暂存
git stash pop
```

### Q: 合并时发生冲突

**处理流程**：

```bash
# 1. Colyn 会在 worktree 中先合并 main
cd worktrees/task-1

# 2. 解决冲突
# 手动编辑冲突文件
vim src/conflicted-file.ts

# 3. 标记已解决
git add src/conflicted-file.ts

# 4. 完成合并
git commit

# 5. 再次运行 merge
cd ../..
colyn merge 1
```

### Q: 合并后推送失败

**可能原因**：
- 远程分支已更新
- 没有推送权限

**解决方案**：

```bash
# 1. 拉取远程更新
cd my-project/my-project
git pull origin main

# 2. 如果有冲突，解决后再推送
git push origin main

# 或使用 colyn merge 的 --push 选项
colyn merge 1 --push
```

---

## 删除问题

### Q: `colyn remove` 提示有未提交的更改

**解决方案**：

```bash
# 1. 提交更改
cd worktrees/task-1
git add .
git commit -m "保存更改"

# 2. 或强制删除（会丢失更改）
colyn remove 1 --force

# 3. 或暂存更改
git stash
cd ../..
colyn remove 1
```

> 说明：`.env.local` 的本地变更不会单独触发此错误。

### Q: 删除后 Git 仍显示 worktree

**解决方案**：

```bash
# 1. 查看 git worktree 列表
git worktree list

# 2. 如果仍存在，手动删除
git worktree remove worktrees/task-1

# 3. 或运行修复
colyn repair
```

### Q: 删除后没有自动切换目录

**原因**：Shell 集成未配置

**解决方案**：

```bash
# 配置 shell 集成
colyn setup
source ~/.zshrc

# 或手动切换
cd ../../my-project
```

---

## Checkout 问题

### Q: `checkout` 提示分支不存在

**解决方案**：

```bash
# 1. 检查分支名是否正确
git branch -a

# 2. 如果是远程分支，先 fetch
git fetch origin

# 3. 然后 checkout
colyn checkout feature/new-feature

# 4. 或跳过 fetch（如果确定是新分支）
colyn checkout feature/new-feature --no-fetch
```

### Q: 切换分支时提示未合并

**警告信息**：
```
⚠️  当前分支未合并到主分支
```

**解决方案**：

```bash
# 1. 确认是否要放弃当前分支
# 如果需要保留，先合并
colyn merge 1

# 2. 然后再切换
colyn checkout new-branch

# 3. 或强制切换（会提示删除旧分支）
colyn checkout new-branch
# 选择 "是" 删除旧分支
```

---

## tmux 集成问题

### Q: tmux session 未自动创建

**检查**：

```bash
# 1. 查看 session 列表
tmux ls

# 2. 如果不存在，手动创建
tmux new -s my-project

# 3. 或运行 repair
colyn repair
```

### Q: tmux window 布局不正确

**解决方案**：

```bash
# 1. 运行 repair 重建布局
colyn repair

# 2. 或手动调整布局
tmux select-layout main-vertical
```

### Q: Dev server 未自动启动

**可能原因**：
- package.json 中没有 dev 脚本
- 依赖未安装

**解决方案**：

```bash
# 1. 检查 package.json
cat package.json | grep "dev"

# 应该有类似：
# "scripts": {
#   "dev": "next dev"
# }

# 2. 安装依赖
npm install

# 3. 手动启动
npm run dev
```

---

## 项目移动问题

### Q: 移动项目后 worktree 无法使用

**症状**：
- `git worktree list` 显示路径错误
- `colyn list` 无法列出 worktree

**解决方案**：

```bash
# 1. 运行 repair 命令
colyn repair

# 2. 这会自动：
#    - 修复 git worktree 路径
#    - 更新 .env.local 文件
#    - 重建 tmux session/windows
```

### Q: repair 命令执行失败

**解决方案**：

```bash
# 1. 手动修复 git worktree
cd my-project/my-project
git worktree repair

# 2. 检查孤儿 worktree
git worktree list

# 3. 手动删除无效的
git worktree remove --force worktrees/task-1

# 4. 重新创建
cd ../..
colyn add feature/branch-name
```

---

## 环境变量问题

### Q: PORT 环境变量未生效

**检查**：

```bash
# 1. 查看 .env.local
cat .env.local

# 2. 确认应用读取了环境变量
echo $PORT

# 3. 如果未读取，检查应用配置
# 大多数框架会自动读取 .env.local
# 如果不行，使用 dotenv
npm install dotenv
```

**在代码中手动加载**：

```javascript
// 在应用入口文件顶部
require('dotenv').config({ path: '.env.local' });

// 使用
const port = process.env.PORT || 3000;
```

### Q: WORKTREE 环境变量错误

**解决方案**：

```bash
# 1. 检查 .env.local
cat .env.local

# 2. 如果错误，手动修正
echo "WORKTREE=1" >> .env.local

# 3. 或运行 repair
colyn repair
```

---

## 性能问题

### Q: 系统变慢

**可能原因**：
- 创建了过多 worktree
- 多个开发服务器同时运行
- node_modules 占用过多空间

**解决方案**：

```bash
# 1. 查看 worktree 数量
colyn list

# 2. 删除不用的 worktree
colyn remove 1
colyn remove 2

# 3. 停止不用的开发服务器
# 在对应的 pane 中按 Ctrl-C

# 4. 清理 node_modules
find worktrees -name "node_modules" -type d -prune -exec rm -rf {} \;
```

### Q: 磁盘空间不足

**检查使用量**：

```bash
# 查看各 worktree 大小
du -sh worktrees/*

# 输出示例
1.2G    worktrees/task-1
980M    worktrees/task-2
1.5G    worktrees/task-3
```

**清理方案**：

```bash
# 1. 删除不用的 worktree
colyn remove 1

# 2. 清理 node_modules
cd worktrees/task-2
rm -rf node_modules

# 3. 清理构建产物
rm -rf .next build dist
```

---

## 命令补全问题

### Q: Tab 补全不工作

**解决方案**：

```bash
# 1. 生成补全脚本
colyn completion zsh > ~/.colyn-completion.zsh

# 2. 添加到配置文件
echo "source ~/.colyn-completion.zsh" >> ~/.zshrc

# 3. 重新加载
source ~/.zshrc

# 4. 测试
colyn ad<Tab>  # 应该补全为 colyn add
```

### Q: 补全脚本加载缓慢

**优化方案**：

```bash
# 使用延迟加载
# 在 ~/.zshrc 中
autoload -Uz compinit
compinit -C  # -C 跳过检查，加快速度
```

---

## Git 相关问题

### Q: 分支切换后代码未更新

**可能原因**：缓存或编译器问题

**解决方案**：

```bash
# 1. 清理缓存
rm -rf node_modules/.cache
rm -rf .next

# 2. 重新安装依赖
npm install

# 3. 重新启动开发服务器
npm run dev
```

### Q: Git 提示 "worktree locked"

**解决方案**：

```bash
# 1. 检查锁定状态
cat .git/worktrees/task-1/locked

# 2. 删除锁定文件
rm .git/worktrees/task-1/locked

# 3. 或使用 git 命令
git worktree unlock worktrees/task-1
```

---

## 其他问题

### Q: `colyn info` 在非 Colyn 项目中报错

**预期行为**：在非 Colyn 项目中会智能降级

**验证**：

```bash
# 在 git 仓库中（非 Colyn 项目）
cd /some/git/repo
colyn info --short
# 输出: repo-name (⎇ main)

# 在普通目录中
cd /tmp
colyn info --short
# 输出: tmp
```

### Q: 颜色输出异常

**解决方案**：

```bash
# 1. 检查终端支持
echo $TERM

# 2. 如果终端不支持颜色，禁用
colyn list --no-color

# 3. 或设置环境变量
export NO_COLOR=1
colyn list

# 4. 或使用别名
alias colyn='colyn --no-color'
```

### Q: 日志文件归档失败

**发生在**：`colyn checkout` 时

**解决方案**：

```bash
# 1. 手动创建归档目录
mkdir -p .claude/logs/archived

# 2. 手动归档
mv .claude/logs/*.md .claude/logs/archived/

# 3. 再次运行 checkout
colyn checkout new-branch
```

---

## 获取帮助

### 命令行帮助

```bash
# 查看所有命令
colyn --help

# 查看特定命令帮助
colyn add --help
colyn merge --help
```

### 诊断信息

收集诊断信息用于报告问题：

```bash
# 系统信息
uname -a
node --version
git --version
colyn --version

# Colyn 状态
colyn list --json
colyn info

# Git 状态
git worktree list
git status

# 目录结构
tree -L 2 .
```

### 提交 Issue

如果问题仍未解决，请在 GitHub 提交 Issue：

1. 访问：https://github.com/anthropics/colyn/issues
2. 提供以下信息：
   - 操作系统和版本
   - Node.js 和 Git 版本
   - Colyn 版本
   - 完整的错误信息
   - 重现步骤
   - 诊断信息

---

## 下一步

- 查找术语？参考 [术语表](09-glossary.md)
- 学习最佳实践？查看 [最佳实践](07-best-practices.md)
- 深入了解？阅读 [核心概念](03-core-concepts.md)
