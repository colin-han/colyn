# Colyn 用户手册

**版本**: 2.5.5
**最后更新**: 2026-02-10

---

## 欢迎使用 Colyn

Colyn 是一个强大的 Git Worktree 管理工具，专为需要并行开发多个功能的开发者设计。它简化了 Git worktree 的创建和管理流程，自动处理端口分配，支持 tmux 集成，让你能够轻松实现多分支并行开发。

### 核心特性

- **🚀 简化 Worktree 管理**: 一键创建和管理 git worktree，无需复杂的命令
- **🎯 自动端口分配**: 智能分配开发服务器端口，避免端口冲突
- **📁 自动目录切换**: 命令执行后自动切换到目标目录
- **🔍 智能分支处理**: 自动识别本地分支、远程分支或创建新分支
- **⚡ 自动补全**: 支持 Bash/Zsh Tab 键补全命令、选项和参数
- **🖥️ tmux 集成**: 在 tmux 中实现高效的 worktree 管理和切换
- **🌐 跨平台支持**: macOS、Linux、Windows 全平台支持

### 适用场景

Colyn 特别适合以下使用场景：

- **并行功能开发**: 同时开发多个功能，无需频繁切换分支
- **多版本测试**: 在不同分支上同时运行开发服务器进行对比测试
- **Bug 修复**: 保持当前开发状态，快速切换到 bugfix 分支
- **代码审查**: 在独立环境中审查他人的分支代码
- **AI 协作开发**: 使用 Claude Code 等 AI 工具实现"并行 Vibe Coding"

---

## 手册结构

本用户手册包含以下章节：

1. **[快速开始](01-quick-start.md)** - 5 分钟快速上手
2. **[安装指南](02-installation.md)** - 详细的安装说明
3. **[核心概念](03-core-concepts.md)** - 理解 Colyn 的工作原理
4. **[命令参考](04-command-reference.md)** - 所有命令的详细说明
5. **[高级用法](05-advanced-usage.md)** - 高级功能和技巧
6. **[tmux 集成](06-tmux-integration.md)** - tmux 环境下的高效工作流
7. **[最佳实践](07-best-practices.md)** - 推荐的工作流程和技巧
8. **[故障排除](08-troubleshooting.md)** - 常见问题和解决方案
9. **[术语表](09-glossary.md)** - 术语和概念速查

---

## 快速导航

### 新用户

如果你是第一次使用 Colyn：

1. 阅读 [快速开始](01-quick-start.md) 了解基本用法
2. 查看 [核心概念](03-core-concepts.md) 理解工作原理
3. 参考 [命令参考](04-command-reference.md) 学习具体命令

### 已有用户

如果你已经在使用 Colyn：

- 需要特定命令说明 → [命令参考](04-command-reference.md)
- 遇到问题 → [故障排除](08-troubleshooting.md)
- 查找术语 → [术语表](09-glossary.md)
- 学习高级技巧 → [高级用法](05-advanced-usage.md)

### tmux 用户

如果你使用 tmux：

- 完整的 tmux 集成指南 → [tmux 集成](06-tmux-integration.md)
- 快捷键和工作流 → [最佳实践](07-best-practices.md)

---

## 获取帮助

### 命令行帮助

在命令行中随时查看帮助：

```bash
# 查看所有命令
colyn --help

# 查看特定命令的帮助
colyn init --help
colyn add --help
```

### 项目信息

- **GitHub 仓库**: [github.com/colinhan/colyn](https://github.com/colinhan/colyn)
- **问题反馈**: [GitHub Issues](https://github.com/colinhan/colyn/issues)
- **版本历史**: [CHANGELOG.md](../CHANGELOG.md)

---

## 开始使用

准备好了吗？从 [快速开始](01-quick-start.md) 开始你的 Colyn 之旅！
