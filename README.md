# Colyn

**中文** | [English](README-en.md)

让多个 AI 同时帮你写代码。Colyn 是专为**并行 Vibe Coding** 设计的 Git Worktree 管理工具。

---

## 为什么需要 Colyn？

AI 编程助手已经能独立完成复杂功能，但你还在**一次只做一件事**：等 Claude 跑完，审查，再给下一个任务。你的注意力带宽成了瓶颈。

Colyn 让你同时指挥多个 AI 并行开发不同功能——每个 worktree 有独立的代码分支、开发端口、运行环境，用一条命令创建，用 `Ctrl-b 1/2/3` 在 tmux 中秒切。

**[→ 看完整的使用场景：用户故事](docs/zh-CN/manual/00-user-story.md)**

---

## 核心能力

- **并行 Worktree 管理**：`colyn add feature/auth` 一键创建 worktree，自动分配端口、安装依赖、切换目录
- **任务队列（Todo）**：随时 `colyn todo add` 捕捉灵感，`colyn todo start` 选任务时自动复制上下文到剪贴板，粘贴给 Claude 即可开工
- **tmux 深度集成**：每个 worktree 自动对应一个 tmux window，固定三栏布局（Claude Code / Dev Server / Bash），自动启动
- **合并质量把关**：`colyn merge` 前自动运行 lint 和 build，失败则阻止合并
- **Worktree 复用**：`colyn checkout` 在同一个 worktree 中切换任务，复用 Claude 的项目上下文，相关功能开发效率更高
- **多工具链支持**：npm、Maven、Gradle、pip、Xcode 项目开箱即用

---

## 安装

```bash
npm install -g colyn

# 配置 shell 集成（启用自动目录切换）
colyn setup
```

---

## 快速开始

```bash
# 初始化项目
colyn init -p 3000

# 创建并行 worktree（自动切换到新目录，端口 3001）
colyn add feature/auth

# 查看全局状态
colyn list
```

**[→ 完整的快速开始指南](docs/zh-CN/manual/01-quick-start.md)**

---

## 文档

| 文档 | 说明 |
|------|------|
| [用户故事](docs/zh-CN/manual/00-user-story.md) | 通过完整场景了解 Colyn 的工作方式 |
| [快速开始](docs/zh-CN/manual/01-quick-start.md) | 5 分钟上手 |
| [核心概念](docs/zh-CN/manual/03-core-concepts.md) | 理解 worktree、端口、双层架构 |
| [tmux 集成](docs/zh-CN/manual/06-tmux-integration.md) | 一个窗口管理所有 worktree |
| [最佳实践](docs/zh-CN/manual/07-best-practices.md) | 推荐工作流程 |
| [命令参考](docs/zh-CN/manual/04-command-reference/README.md) | 所有命令详细说明 |
| [插件系统](docs/zh-CN/manual/11-plugin-system.md) | 多语言工具链支持 |
| [故障排除](docs/zh-CN/manual/08-troubleshooting.md) | 常见问题解答 |

---

## 开发

```bash
volta run yarn install   # 安装依赖
volta run yarn build     # 编译
volta run yarn test      # 运行测试
```

---

## 许可证

MIT
