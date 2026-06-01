# 最佳实践

本章分享使用 Colyn 的推荐工作流程和最佳实践。

---

## Todo 驱动的 Vibe Coding 工作流

将 `colyn todo` 与 Claude Code 结合，形成高效的并行开发循环。

### 推荐工作流程

```
规划阶段（Planning）
  │
  ▼
colyn todo add               # 记录所有待完成的任务
colyn todo add               # 可以一次性添加多个
  │
  ▼
执行阶段（Execution）
  │
  ├─► colyn todo start feature/login   # 切换分支 + 复制描述到剪贴板
  │         │
  │         ▼
  │   打开 Claude Code，粘贴描述作为任务上下文
  │         │
  │         ▼
  │   完成开发 → colyn merge → colyn todo 查看下一个任务
  │
  └─► （在其他 Worktree 中并行进行另一个任务）
  │
  ▼
整理阶段（Cleanup）
  │
  ▼
colyn todo archive -y        # 归档所有已完成任务
```

### 任务描述的最佳写法

任务描述（message）会在 `todo start` 时复制到剪贴板，粘贴给 Claude 作为上下文。建议遵循以下格式：

```markdown
实现用户登录功能

## 任务说明
- 添加邮箱/密码登录表单
- 后端 API：POST /api/auth/login
- 验证用户凭据，返回 JWT token

## 验收标准
- 登录成功后跳转到首页
- 登录失败显示友好错误提示
- 支持"记住我"选项（7天 token 有效期）

## 参考
- 设计稿：Figma 链接
- API 文档：docs/api.md
```

**建议包含的内容**：
- 一句话说明任务目标（第一行）
- 具体的实现要点
- 明确的验收标准
- 相关的参考资料链接

### 利用 Todo 类型组织工作

```bash
# 功能开发
colyn todo add feature/login "实现用户登录"
colyn todo add feature/signup "实现用户注册"

# Bug 修复
colyn todo add bugfix/fix-logout "修复登出后 token 未清除的问题"

# 重构
colyn todo add refactor/auth-module "重构 auth 模块，拆分职责"

# 文档
colyn todo add document/api-guide "编写 API 使用文档"
```

类型前缀使得分支名具有语义，在 `git log` 和 `colyn list` 中一目了然。

---

## 项目初始化

### 选择合适的 Base Port

**推荐**：选择一个不常用的端口范围

```bash
# 推荐的端口范围
colyn init -p 10000  # 10000-10099
colyn init -p 20000  # 20000-20099
colyn init -p 30000  # 30000-30099

# 避免使用常见端口
# 3000 - Create React App 默认端口
# 8080 - 常见的开发服务器端口
# 5000 - Flask 默认端口
```

**原因**：避免与其他项目或系统服务冲突。

### 项目命名规范

**推荐**：使用描述性的项目名称

```bash
# 好的项目名
my-task-app/
user-management-system/
e-commerce-platform/

# 避免
project1/
test/
app/
```

**原因**：
- 项目名即为 tmux Session 名称
- 更容易识别和切换
- 便于团队协作

---

## Worktree 管理

### 核心理念：复用 Worktree

**推荐方法**：尽可能复用 worktree，使用 `checkout` 切换分支来管理不同的功能任务。

**原因**：
- 避免创建过多 worktree 占用磁盘空间
- 保持稳定的开发环境配置
- 端口号保持一致，便于记忆
- 在 tmux 中保持固定的 window 位置

### 推荐的 Worktree 配置

**典型配置**（3-5 个固定的 worktree）：

```bash
# 推荐配置
0-main     main 分支（保持干净，用于合并和发布）
1          主要开发工作区（通过 checkout 切换不同功能）
2          次要开发工作区（并行开发或实验）
3          快速修复工作区（临时 Bug 修复或 Code Review）
```

**工作流程**：

```bash
# 初始化时创建固定的 worktrees
colyn add feature/initial-task   # 创建 task-1
colyn add feature/secondary      # 创建 task-2
colyn add feature/quick-fix      # 创建 task-3

# 之后不再创建新的 worktree，而是在现有 worktree 中切换分支
cd worktrees/task-1
colyn checkout feature/new-feature    # 在 task-1 中切换到新功能
# 完成后合并
colyn merge

# 继续下一个功能，仍在 task-1 中
colyn checkout feature/another-feature
```

### 使用 Checkout 管理任务

**推荐**：在固定的 worktree 中使用 `checkout` 切换分支

```bash
# 在 worktree 1 中工作
cd worktrees/task-1

# 开发功能 A
colyn checkout feature/user-auth
# ... 开发、测试、提交 ...
colyn merge

# 切换到功能 B（同一个 worktree）
colyn checkout feature/dashboard
# ... 开发、测试、提交 ...
colyn merge

# 切换到 Bug 修复（同一个 worktree）
colyn checkout bugfix/issue-123
# ... 修复、测试、提交 ...
colyn merge
```

**优势**：
- 保持相同的端口号（如 3001）
- 保持相同的 tmux window（如 Window 1）
- 无需重新配置开发环境
- 避免磁盘空间浪费

### 何时创建新 Worktree

**仅在以下情况创建新的 worktree**：

#### 1. 需要长期并行开发

```bash
# 两个功能需要同时运行和对比
colyn add feature/new-ui        # task-1: 新 UI 设计
colyn add feature/old-ui        # task-2: 旧 UI 保留对比
```

#### 2. 需要不同的开发环境

```bash
# 不同版本的依赖或配置
colyn add feature/node-18       # task-1: Node 18 环境
colyn add feature/node-20       # task-2: Node 20 环境
```

#### 3. 达到 worktree 数量上限

如果已有的 3-5 个 worktree 都在使用中，且需要新增并行开发环境。

### 一般不删除 Worktree

**推荐**：创建后保持 worktree，通过 `checkout` 复用

```bash
# ❌ 不推荐：频繁创建和删除
colyn add feature/a
colyn merge feature/a
colyn remove feature/a
colyn add feature/b
colyn merge feature/b
colyn remove feature/b

# ✅ 推荐：复用 worktree
colyn add feature/a          # 只创建一次
colyn merge feature/a
colyn checkout feature/b     # 复用，切换分支
colyn merge feature/b
colyn checkout feature/c     # 继续复用
```

**仅在以下情况删除 worktree**：
- 确定不再需要这个并行开发环境
- 需要调整 worktree 的数量结构
- worktree 出现问题需要重建

---

## 分支管理

### 分支命名规范

**推荐的命名格式**：

```bash
# 功能开发
feature/<简短描述>
feature/user-authentication
feature/payment-integration
feature/dark-mode

# Bug 修复
bugfix/<问题描述>
bugfix/login-error
bugfix/memory-leak
bugfix/api-timeout

# 性能优化
perf/<优化内容>
perf/database-query
perf/image-compression

# 重构
refactor/<重构内容>
refactor/auth-module
refactor/api-client

# 文档
docs/<文档内容>
docs/api-reference
docs/user-guide

# 热修复
hotfix/<问题描述>
hotfix/security-patch
hotfix/critical-bug
```

**原因**：
- 清晰的分类便于管理
- tmux Window 名称更易读
- 便于团队协作

### 主分支保持干净

**最佳实践**：

```bash
# ✗ 错误方式：在主分支中开发
cd my-project/my-project
# 直接修改代码...

# ✓ 正确方式：在 worktree 中开发
cd worktrees/task-1
colyn checkout feature/new-feature
# 在 worktree 中修改代码
```

**主分支用途**：
- 作为其他分支的基准
- 接收合并后的代码
- 运行稳定版本
- 保持干净，不直接在其中开发

---

## Git 操作

### 提交前检查

**推荐工作流**：

```bash
# 1. 检查状态
git status

# 2. 查看差异
git diff

# 3. 添加文件（避免 git add .）
git add src/component.tsx
git add src/utils.ts

# 4. 提交
git commit -m "feat: add user authentication"

# 5. 推送
git push
```

**避免**：
```bash
# 不推荐：盲目添加所有文件
git add .
git add -A
```

**原因**：可能意外提交敏感文件或临时文件。

### 合并策略

**推荐：在 worktree 目录中使用 colyn merge**

```bash
# ✓ 推荐：在 worktree 目录或其子目录中合并
cd worktrees/task-1
colyn merge

# 或在子目录中
cd worktrees/task-1/src
colyn merge

# Colyn 会自动识别当前 worktree 并合并
```

**为什么不推荐指定 ID**：

```bash
# ✗ 不推荐：从项目根目录指定 ID
cd /path/to/project
colyn merge 1
```

**原因**：
- 在 worktree 中工作时，自动识别更自然
- 减少记忆 worktree ID 的负担
- 避免指定错误的 ID
- 符合"在哪里工作就在哪里合并"的直觉

**Colyn 合并的优势**：
1. 自动检查工作目录状态
2. 两步合并策略（先更新 worktree，再合并到主分支）
3. 使用 `--no-ff` 保持清晰的分支历史
4. 合并失败时在 worktree 中解决冲突

**合并到主分支**：

```bash
# 在 worktree 中合并
cd worktrees/task-1
colyn merge
```

### 处理合并冲突

**最佳实践**：

```bash
# 1. 在 worktree 中尝试合并
cd worktrees/task-1
colyn merge

# 2. 如果有冲突，就在当前 worktree 中解决
# 手动解决冲突文件
vim src/conflicted-file.ts

# 标记已解决
git add src/conflicted-file.ts
git commit

# 3. 再次尝试合并
colyn merge
```

**原因**：冲突在开发环境（worktree）中解决，不影响主分支。

---

## 环境配置

### .env.local 文件管理

**推荐配置**：

```bash
# .env.local (不提交到 Git)
PORT=3001
WORKTREE=1

# 项目特定配置
DATABASE_URL=postgresql://localhost:5432/dev_db
API_KEY=dev-api-key-for-testing
FEATURE_FLAG_NEW_UI=true
```

**最佳实践**：
1. **不要提交 .env.local** - 已在 .gitignore 中
2. **提供 .env.local.example** - 作为模板
3. **使用不同的数据库** - 每个 worktree 独立数据库

**示例 .env.local.example**：

```bash
# .env.local.example
PORT=3000
WORKTREE=main

# Database (使用不同的数据库名)
DATABASE_URL=postgresql://localhost:5432/myapp_dev

# API Keys (使用测试密钥)
API_KEY=your-api-key-here

# Feature Flags
FEATURE_FLAG_NEW_UI=false
```

### 依赖管理

**推荐**：每个 worktree 独立安装依赖

```bash
# 创建新 worktree 后
cd worktrees/task-1
npm install  # 或 yarn install

# 原因：
# 1. 避免依赖冲突
# 2. 不同分支可能有不同的依赖版本
# 3. 构建产物独立
```

**优化**：使用符号链接共享 node_modules（高级用法）

```bash
# 仅在确认依赖完全相同时使用
ln -s ../../my-project/node_modules worktrees/task-1/node_modules
```

---

## tmux 使用

### Window 组织

**推荐布局**：

```
Window 0: main        # 主分支（稳定版本）
Window 1: feature-a   # 当前主要开发
Window 2: feature-b   # 并行开发
Window 3: bugfix      # 临时 Bug 修复
Window 4: review      # Code Review
```

**导航技巧**：

```bash
# 使用数字键快速切换
Ctrl-b 0  # 主分支
Ctrl-b 1  # 主要功能
Ctrl-b 2  # 次要功能

# 使用 tmux 命令
tmux select-window -t :1
```

### Pane 使用建议

**推荐工作流**：

```
┌──────────────┬─────────┐
│              │  Dev    │  ← 观察日志
│              │  Server │
│   Claude     ├─────────┤
│   Code       │         │
│              │  Bash   │  ← 运行测试、Git 命令
│              │         │
└──────────────┴─────────┘
```

**Pane 职责**：
- **Pane 0 (Claude)**: AI 协作开发
- **Pane 1 (Dev Server)**: 后台运行，观察日志
- **Pane 2 (Bash)**: 执行命令（测试、Git、构建）

### Session 管理

**最佳实践**：

```bash
# 1. 一个项目一个 session
my-task-app     # Session for task app
blog-platform   # Session for blog
api-service     # Session for API

# 2. 使用有意义的 session 名
tmux new -s my-task-app  # 而不是 tmux new -s s1

# 3. 列出所有 session
tmux ls

# 4. 切换 session
tmux switch -t my-task-app
```

---

## 团队协作

### 共享项目结构

**推荐工作流**：

1. **初始化项目**（一次性）：
   ```bash
   # 团队成员 A 初始化
   colyn init -p 10000
   git add .
   git commit -m "chore: initialize colyn structure"
   git push
   ```

2. **其他成员克隆**：
   ```bash
   # 团队成员 B/C/D
   git clone <repository>
   cd <project>

   # 已经有 .colyn/ 目录和主分支结构
   # 直接创建自己的 worktree
   colyn add feature/my-feature
   ```

### .gitignore 配置

**必须包含**：

```gitignore
# .gitignore

# Colyn 生成的环境文件
.env.local

# Worktrees 目录（可选）
worktrees/

# Node modules
node_modules/

# 构建产物
dist/
build/
.next/

# IDE
.idea/
.vscode/
*.swp
```

**注意**：
- `.env.local` 必须忽略（避免提交敏感信息）
- `worktrees/` 可以忽略（每个人创建自己的）
- `.colyn/` 需要提交（标识项目结构）

### 文档化 Port 分配

**在 README.md 中记录**：

```markdown
## 开发环境

本项目使用 Colyn 管理 Git Worktree。

### Port 分配

- Base Port: 10000
- 主分支: 10000
- Worktree 1: 10001
- Worktree 2: 10002
- ...

### 快速开始

\`\`\`bash
# 初始化（仅首次）
colyn init -p 10000

# 创建 worktree
colyn add feature/your-feature

# 启动开发服务器
npm run dev
\`\`\`
```

---

## 性能优化

### 管理 Worktree 数量

**推荐**：创建固定数量的 worktree（3-5 个），长期复用

```bash
# 初始化时创建
colyn add feature/work-1   # task-1: 主要工作区
colyn add feature/work-2   # task-2: 次要工作区
colyn add feature/work-3   # task-3: 快速修复区

# 之后通过 checkout 切换，不再创建新的
cd worktrees/task-1
colyn checkout feature/new-task
```

**一般不删除 worktree**，除非：
- 确定不再需要这个并行工作环境
- 需要重新规划 worktree 结构

### 清理已合并的分支

**推荐**：定期清理已合并的 Git 分支（而不是 worktree）

```bash
# 删除已合并到 main 的本地分支
git branch --merged main | grep -v "main" | xargs git branch -d

# 清理远程已删除的分支
git fetch --prune
```

**注意**：清理的是 Git 分支，worktree 保留继续使用。

### 使用浅克隆（大型仓库）

```bash
# 如果仓库很大，使用浅克隆
git clone --depth 1 <repository>

# 初始化 Colyn
colyn init -p 10000
```

---

## 安全实践

### 环境变量安全

**规则**：

1. **敏感信息只放在 .env.local**
   ```bash
   # .env.local (不提交)
   DATABASE_PASSWORD=secret
   API_SECRET_KEY=super-secret
   JWT_SECRET=jwt-secret-key
   ```

2. **提供 .env.local.example 模板**
   ```bash
   # .env.local.example (提交到 Git)
   DATABASE_PASSWORD=your-password-here
   API_SECRET_KEY=your-api-key-here
   JWT_SECRET=your-jwt-secret-here
   ```

3. **检查 .gitignore**
   ```bash
   # 确保 .env.local 被忽略
   git check-ignore .env.local
   # 应该输出：.env.local
   ```

### 避免意外提交

**使用 pre-commit hook**：

```bash
# .git/hooks/pre-commit
#!/bin/bash

# 检查是否意外添加了 .env.local
if git diff --cached --name-only | grep -q ".env.local"; then
  echo "错误：不要提交 .env.local 文件！"
  exit 1
fi
```

---

## 工作流推荐

### 日常开发流程（推荐）

```bash
# 早上开始工作
tmux attach -t my-project  # 附加到 tmux session

# 查看当前状态
colyn list

# 继续昨天的工作或切换到新功能
cd worktrees/task-1
colyn checkout feature/new-feature

# 开发过程中
git add src/component.tsx
git commit -m "feat: implement feature"

# 功能完成
colyn merge

# 继续下一个功能（复用同一个 worktree）
colyn checkout feature/next-task

# 晚上下班
Ctrl-b d  # 分离 session（保持运行）
```

### 多功能并行开发（初始化阶段）

```bash
# 项目初始化时创建固定的 worktrees
colyn add feature/authentication  # task-1: 主工作区
colyn add feature/dashboard       # task-2: 次工作区
colyn add feature/quick-fixes     # task-3: 快速修复区

# 在 tmux 中快速切换
Ctrl-b 1  # Window 1 - 主工作区
Ctrl-b 2  # Window 2 - 次工作区
Ctrl-b 3  # Window 3 - 快速修复区

# 各工作区通过 checkout 切换不同任务
# task-1 当前：feature/authentication
# task-2 当前：feature/dashboard
# task-3 当前：feature/quick-fixes

# 快速切换和测试
# http://localhost:10001 - 主工作区
# http://localhost:10002 - 次工作区
# http://localhost:10003 - 快速修复区
```

### Bug 修复流程（复用 worktree）

```bash
# 使用快速修复工作区
cd worktrees/task-3
colyn checkout bugfix/issue-123

# 修复 Bug
# ... 编写代码 ...

# 测试修复
npm run test

# 合并修复
colyn merge

# 继续下一个 Bug（复用同一个 worktree）
colyn checkout bugfix/issue-124
```

---

## 监控和维护

### 定期运行 Repair

**推荐**：每周或移动项目后运行

```bash
colyn repair
```

**检查内容**：
- Git worktree 路径是否正确
- .env.local 文件是否完整
- tmux session/window 是否正常

### 检查磁盘使用

```bash
# 查看 worktrees 目录大小
du -sh worktrees/*

# 示例输出
1.2G    worktrees/task-1
980M    worktrees/task-2
1.5G    worktrees/task-3
```

### 备份重要分支

```bash
# 定期推送到远程
git push origin feature/important-feature

# 或创建本地备份
git branch backup/feature-important-feature feature/important-feature
```

---

## 避免的反模式

### ❌ 在主分支中开发

```bash
# 不要这样做
cd my-project/my-project
# 直接修改文件...
git commit -m "add feature"
```

**原因**：主分支应保持干净，作为合并目标。

### ❌ 为每个功能创建新 Worktree

```bash
# ❌ 不推荐：频繁创建和删除
colyn add feature/a
# 完成后
colyn remove feature/a

colyn add feature/b
# 完成后
colyn remove feature/b

colyn add feature/c
# 完成后
colyn remove feature/c
```

**问题**：
- 浪费时间创建和删除
- 端口号不固定，难以记忆
- tmux window 位置不稳定
- 重复配置开发环境

**正确做法**：

```bash
# ✓ 推荐：创建固定 worktree，通过 checkout 切换
colyn add feature/workspace-1   # 只创建一次

# 在同一个 worktree 中切换功能
colyn checkout feature/a
# 完成后
colyn merge

colyn checkout feature/b
# 完成后
colyn merge

colyn checkout feature/c
# 完成后
colyn merge
```

### ❌ 忽略未提交的更改

```bash
# 不要在有更改时切换或删除
colyn checkout new-branch  # 会警告
colyn remove 1             # 会拒绝
```

**原因**：可能丢失工作成果。

### ❌ 手动修改 .env.local

```bash
# 不要手动修改端口
# .env.local
PORT=9999  # 不要这样改
WORKTREE=1
```

**原因**：破坏 Colyn 的端口分配系统。

### ❌ 提交 .env.local

```bash
# 不要提交环境文件
git add .env.local  # 绝对不要
git commit
```

**原因**：可能泄露敏感信息。

---

## 小贴士

### 🎯 使用快捷键

学习并使用 tmux 快捷键提升效率：

```bash
Ctrl-b 0-9   # 快速切换 window
Ctrl-b o     # 切换 pane
Ctrl-b z     # 最大化当前 pane
Ctrl-b [     # 进入复制模式（滚动查看）
```

### 🎯 利用命令别名

创建常用命令的别名：

```bash
# ~/.zshrc
alias ca='colyn add'
alias cm='colyn merge'
alias cl='colyn list'
```

### 🎯 保持简洁的分支名

```bash
# 好的分支名
feature/login
bugfix/api-error

# 避免过长
feature/implement-user-authentication-with-oauth-and-jwt
```

**原因**：tmux window 名称会更易读。

### 🎯 定期同步远程

```bash
# 定期 fetch 和 pull
git fetch origin
git pull origin main
```

### 🎯 使用 .gitignore 模板

从标准模板开始：

```bash
# 使用 Node.js 模板
curl -o .gitignore https://raw.githubusercontent.com/github/gitignore/main/Node.gitignore

# 添加 Colyn 特定配置
echo ".env.local" >> .gitignore
```

---

## 总结

遵循这些最佳实践可以：

- ✅ 提高开发效率
- ✅ 避免常见错误
- ✅ 保持项目整洁
- ✅ 便于团队协作
- ✅ 确保数据安全

---

## 下一步

- 遇到问题？查看 [故障排除](08-troubleshooting.md)
- 查找术语？参考 [术语表](09-glossary.md)
- 学习更多技巧？回顾 [高级用法](05-advanced-usage.md)

