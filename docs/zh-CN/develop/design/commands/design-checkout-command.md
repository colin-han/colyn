# Checkout 命令设计文档

## 概述

`colyn checkout` 命令用于在 worktree 中切换或创建分支，允许复用已有 worktree 进行不同分支的开发。

与 `colyn add [branch]` 的关系：
- `add` 用于创建新 worktree（可无参交互选择分支）
- `checkout` 用于复用现有 worktree 切换分支（支持无参交互选择分支）

## 命令语法

```bash
# 完整命令
colyn checkout [worktree-id] [branch]

# 别名
colyn co [worktree-id] [branch]
```

### 参数说明

| 参数 | 必需 | 说明 |
|------|------|------|
| `worktree-id` | 可选 | 目标 worktree 的 ID，省略时使用当前 worktree |
| `branch` | 可选 | 要切换到的分支名；省略时交互式选择 |

### 无参数交互选择

当未提供 `branch` 时，进入交互式选择器，列表顺序如下：

1. `[新建分支]`（默认选中）
2. `pending` Todo 对应分支
3. 本地已存在分支（过滤主分支目录当前分支）

交互式创建分支时，会先选择 `type`，再输入 `name`，最终拼接为 `type/name`。

如果在列表中选择的是 `pending` Todo 对应分支，`checkout` 成功后会追加以下动作（与 `todo start` 对齐）：
- 将该 Todo 标记为 `completed`
- 写入 `startedAt` 和 `branch`
- 在终端输出该 Todo 的 message
- 将 message 复制到系统剪贴板

## 核心行为

### 前置检查

| 场景 | 行为 |
|------|------|
| 有未提交更改 | **拒绝切换**，要求先提交 |
| 当前分支未合并到主分支 | **警告并要求确认** |
| 目标分支是主分支 | **拒绝切换**，避免误操作 |
| 目标分支已在其他 worktree 使用 | **拒绝切换**，每个分支应只有一个工作目录 |

合并判定实现采用：

- `git merge-base --is-ancestor refs/heads/<currentBranch> refs/heads/<mainBranch>`
- 返回 0 视为“已合并到主分支”

### 分支处理

| 场景 | 行为 |
|------|------|
| 本地分支存在 | 直接切换 |
| 远程分支存在 | 自动创建本地分支并跟踪远程 |
| 分支不存在 | 自动创建新分支 |

### 日志归档

切换分支成功后，自动归档当前分支的工作日志：

1. 检查 `.claude/logs/` 目录是否存在
2. 将该目录下**除 `archived/` 之外的所有文件和子目录**移动到 `.claude/logs/archived/{旧分支名}/`
3. 如果归档目录已存在，追加内容（不覆盖同名文件/目录）

```
切换前：
.claude/logs/
├── task-20260115.md
├── debug-notes.md
├── session-1/
│   └── trace.log
└── archived/
    └── feature-old/

切换后（从 feature/login 切换走）：
.claude/logs/
└── archived/
    ├── feature-old/
    └── feature-login/
        ├── task-20260115.md
        ├── debug-notes.md
        └── session-1/
            └── trace.log
```

### 旧分支清理

切换成功后，如果旧分支已合并到主分支，会提示用户是否删除旧分支：

```
✓ 分支 feature/old 已合并到主分支
? 是否删除旧分支 feature/old？ (Y/n)
```

删除执行策略：

- 已确认“旧分支已合并到主分支”后，使用 `git branch -D <old-branch>` 删除
- 这样可避免 `git branch -d` 按“当前 HEAD”判定导致的误报失败

### 执行后行为

- 自动切换到目标 worktree 目录（通过 shell 函数）
- 若分支来自 `pending` Todo 选择项，会自动完成该 Todo，并输出/复制 message

## 命令流程

```mermaid
flowchart TD
    Start([colyn checkout [branch]]) --> Parse[1. 解析参数<br/>确定目标 worktree]
    Parse --> ResolveBranch{2. 提供 branch 参数?}
    ResolveBranch -->|否| Select[交互式选择分支<br/>默认新建分支]
    Select --> Validate
    ResolveBranch -->|是| Validate[3. 验证 worktree 存在]
    Validate --> CheckClean{4. 有未提交更改?}

    CheckClean -->|是| ErrorDirty[❌ 拒绝切换<br/>要求先提交]
    ErrorDirty --> Exit1([退出])

    CheckClean -->|否| CheckMain{5. 目标是主分支?}
    CheckMain -->|是| ErrorMain[❌ 拒绝切换<br/>提示使用主分支目录]
    ErrorMain --> Exit2([退出])

    CheckMain -->|否| CheckUsed{6. 分支被其他<br/>worktree 使用?}
    CheckUsed -->|是| ErrorUsed[❌ 拒绝切换<br/>提示切换到对应 worktree]
    ErrorUsed --> Exit3([退出])

    CheckUsed -->|否| CheckMerged{7. 当前分支<br/>已合并?}
    CheckMerged -->|否| WarnUnmerged[⚠️ 警告未合并]
    WarnUnmerged --> Confirm{用户确认?}
    Confirm -->|否| Cancel[取消操作]
    Cancel --> Exit4([退出])
    Confirm -->|是| ProcessBranch

    CheckMerged -->|是| ProcessBranch[8. 处理分支<br/>本地/远程/新建]
    ProcessBranch --> Archive[9. 归档日志文件]
    Archive --> Checkout[10. 执行 git checkout]
    Checkout --> TodoPost{11. 来自 Todo 选择?}
    TodoPost -->|是| UpdateTodo[标记 Todo 完成<br/>输出并复制 message]
    TodoPost -->|否| CheckMergedAgain{12. 旧分支已合并?}
    UpdateTodo --> CheckMergedAgain

    CheckMergedAgain -->|是| AskDelete{提示删除旧分支?}
    AskDelete -->|是| DeleteBranch[删除旧分支]
    DeleteBranch --> Result
    AskDelete -->|否| Result

    CheckMergedAgain -->|否| Result[13. 显示结果]
    Result --> Output[14. 输出 JSON]
    Output --> Success([✓ 完成])

    style ErrorDirty fill:#ffcccc
    style ErrorMain fill:#ffcccc
    style ErrorUsed fill:#ffcccc
    style Cancel fill:#ffffcc
    style Success fill:#ccffcc
```

## 输出示例

### 成功切换（旧分支已合并）

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
```

### 成功切换（旧分支未合并）

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
```

### 有未提交更改

```
✗ worktree task-1 中有未提交的更改

变更文件 (3 个):
  - src/index.ts
  - src/utils.ts
  - package.json

提示：
  - 查看状态: cd "/path/to/task-1" && git status
  - 提交更改: git add . && git commit -m "..."
  - 或者暂存: git stash
```

### 目标分支已被使用

```
✗ 分支 feature/login 已在 task-2 中使用

提示: 请直接切换到 task-2 目录工作，或使用其他分支名
      cd "/path/to/worktrees/task-2"
```

### 目标是主分支

```
✗ 不能在 worktree 中切换到主分支

提示: 请直接使用主分支目录
      cd "/path/to/main"
```

## 退出码

| 退出码 | 说明 |
|--------|------|
| 0 | 成功 |
| 1 | 有未提交的更改 / Git 操作失败 |
| 2 | 目标分支是主分支 |
| 3 | 目标分支已被其他 worktree 使用 |
| 4 | 用户取消操作 |
