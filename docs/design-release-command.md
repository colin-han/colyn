# Release 命令设计文档（用户交互视角）

**创建时间**：2026-02-09
**最后更新**：2026-02-10
**命令名称**：`colyn release`
**状态**：✅ 已实现

---

## 1. 需求概述

### 1.1 背景

当前发布流程依赖 `yarn release:patch/minor/major` 或 `node scripts/release.js <type>`。该流程包含 git 状态校验、版本号更新、编译、提交、打 tag 与推送等步骤。

在 Worktree 场景中，用户可能不在 Main Branch 目录，导致发布操作分散或误操作。需要提供统一入口，**无论从哪个目录执行，始终在 Main Branch 中完成发布**。

### 1.2 用户目标

- 使用一条 `colyn release` 命令完成现有发布流程
- 不必手动切换到 Main Branch 目录
- 行为与现有 `yarn release:xxx` 保持一致
- 发布后自动将最新代码同步到所有 Worktree

### 1.3 核心价值

- ✅ **统一入口**：替代 `yarn release:xxx` 的命令门面
- ✅ **强制主分支**：永远在 Main Branch 目录执行发布
- ✅ **流程一致**：复用现有发布脚本逻辑
- ✅ **自动同步**：发布后自动更新所有 Worktree（可通过 `--no-update` 跳过）

---

## 2. 命令定义

### 2.1 基本用法

```bash
colyn release [version-type] [选项]
```

`[version-type]` 支持（可选，默认 `patch`）：
- `patch` / `minor` / `major`
- 显式版本号：`1.2.3`

**选项：**
- `--no-update` - 跳过发布后自动更新所有 Worktree

示例：
```bash
colyn release                    # 发布 patch 版本（默认）并自动更新所有 worktree
colyn release patch              # 发布 patch 版本并自动更新所有 worktree
colyn release minor              # 发布 minor 版本并自动更新所有 worktree
colyn release major              # 发布 major 版本并自动更新所有 worktree
colyn release 1.2.3              # 发布指定版本并自动更新所有 worktree
colyn release patch --no-update  # 发布但不更新 worktree
colyn release --no-update        # 发布 patch 版本但不更新 worktree
```

### 2.2 运行位置规则

- 命令**必须在项目目录内执行**（Main Branch 或任意 Worktree 目录）。
- 不允许在项目目录外执行。
- 实际执行路径**始终为 Main Branch 目录**。

---

## 3. 用户使用场景

### 3.1 在 Worktree 中发布

```bash
$ cd worktrees/task-1
$ colyn release patch

步骤 1: 检查 git 状态 (Main Branch)
✓ 工作区干净
...
✓ 发布完成
```

### 3.2 在项目根目录发布

```bash
$ cd /path/to/project
$ colyn release minor
```

### 3.3 在项目外执行（不允许）

```bash
$ cd ~
$ colyn release major
✗ 当前目录不属于 Colyn 项目，请在项目目录内执行
```

---

## 4. 处理流程（高层）

1. 解析参数（version-type 和选项，version-type 默认为 `patch`）
2. 发现项目路径（Main Branch 目录、Worktrees 目录）
3. 校验项目已初始化（支持 Worktree 结构）
4. **检查当前目录是否有未提交的代码 - 如果有，报错退出**
5. **检查当前分支是否已合并到主分支（仅在 worktree 中执行时）- 如果未合并，报错退出**
6. 进入 Main Branch 目录执行发布流程
7. **发布成功后，自动更新所有 Worktree（除非指定 `--no-update`）**
8. 返回发布结果

---

## 5. 关键行为与校验

### 5.1 Main Branch 强制

- 使用路径发现逻辑定位 Main Branch 目录
- 在 Main Branch 目录中运行发布脚本
- 直接在 Main Branch 目录当前分支上执行，不做分支切换或报错

### 5.2 工作区状态

- 复用现有发布脚本的检查逻辑（要求工作区干净）

### 5.3 与现有发布脚本一致

- 运行 lint / build
- 更新 `package.json` 版本
- 创建提交与 tag
- 推送到远程

### 5.4 自动更新 Worktree

- 发布成功后，自动执行 `colyn update --all`
- 将主分支最新代码（刚发布的版本）同步到所有 Worktree
- 如果更新失败，仅显示警告，不影响发布成功状态
- 可通过 `--no-update` 选项跳过自动更新

### 5.5 发布前安全检查

**检查当前目录状态**：
- 检查当前工作目录是否有未提交的更改
- 如果有未提交代码，报错退出
- 确保用户不会在有未保存工作的情况下误操作

**检查分支合并状态**（方案 A）：
- 如果在 worktree 中执行 release，检查该分支是否已合并到主分支
- 如果未合并，报错退出，提示先合并
- 如果在主分支目录执行，不进行此检查
- 目的：防止在未完成的功能分支上误触发发布

---

## 6. 错误处理

- 参数缺失：不再报错，默认使用 `patch`
- 项目未初始化：提示先执行 `colyn init`
- 当前目录有未提交代码：报错退出，提示先提交代码
- 当前分支未合并（在 worktree 中）：报错退出，提示先合并分支
- 发布脚本任一步骤失败：输出明确错误与回滚建议

---

## 7. 输出规范

- 用户提示与进度信息输出到 stderr
- 命令结束**不输出 JSON 到 stdout**

---

## 8. 与现有文档的关系

- `docs/release-guide.md` 仍保留为发布流程说明
- `colyn release` 作为发布入口，减少手动步骤

---

## 9. 待确认问题

1. 是否需要提供 `--no-push` 或 `--dry-run` 之类的可选参数？**不需要**
2. 当 Main Branch 目录当前分支不是 Main Branch 时，是直接报错还是自动切换？**不报错、不切换，直接在当前分支执行**
