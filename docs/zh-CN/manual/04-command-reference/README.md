# 命令参考手册

本章节提供 Colyn 所有命令的详细参考文档。

---

## 目录

- [全局选项](01-worktree.md#全局选项)

### Worktree 管理

- [colyn init](01-worktree.md#colyn-init) — 初始化 Worktree 管理结构
- [colyn add](01-worktree.md#colyn-add) — 创建新 Worktree
- [colyn list](01-worktree.md#colyn-list) — 列出所有 Worktree
- [colyn list-project](01-worktree.md#colyn-list-project) — 列出所有项目的 Worktree
- [colyn merge](01-worktree.md#colyn-merge) — 合并 Worktree 到主分支
- [colyn remove](01-worktree.md#colyn-remove) — 删除 Worktree

### 分支与状态

- [colyn checkout](02-branch-status.md#colyn-checkout) — 在 Worktree 中切换分支
- [colyn info](02-branch-status.md#colyn-info) — 显示当前目录的项目信息
- [colyn status](02-branch-status.md#colyn-status) — 查询或设置工作流状态

### 系统与配置

- [colyn repair](03-system-config.md#colyn-repair) — 检查并修复项目配置
- [colyn config](03-system-config.md#colyn-config) — 管理 Colyn 配置
- [colyn completion](03-system-config.md#colyn-completion) — 生成 shell 自动补全脚本
- [colyn setup](03-system-config.md#colyn-setup) — 配置 shell 集成

### 工作流工具

- [colyn release](04-workflow.md#colyn-release) — 发布新版本
- [colyn todo](04-workflow.md#colyn-todo) — 管理项目 Todo 任务列表

---

## 快速查阅

| 命令 | 别名 | 用途 |
|------|------|------|
| `colyn init` | - | 初始化项目 |
| `colyn add` | - | 创建 Worktree |
| `colyn list` | - | 列出 Worktree |
| `colyn list-project` | `lsp` | 列出所有项目 |
| `colyn merge` | - | 合并分支 |
| `colyn remove` | - | 删除 Worktree |
| `colyn checkout` | `co` | 切换分支 |
| `colyn info` | - | 查看位置信息 |
| `colyn status` | `st` | 查询/设置工作流状态 |
| `colyn repair` | - | 修复配置 |
| `colyn config` | - | 管理配置 |
| `colyn completion` | - | 生成补全脚本 |
| `colyn setup` | - | 配置 shell 集成 |
| `colyn release` | - | 发布版本 |
| `colyn todo` | - | 管理待办任务 |
