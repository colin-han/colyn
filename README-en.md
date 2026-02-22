# Colyn

[中文](README.md) | **English**

Let multiple AIs write code for you simultaneously. Colyn is a Git Worktree management tool built for **Parallel Vibe Coding**.

---

## Why Colyn?

AI coding assistants can now build complex features independently — but you're still doing **one thing at a time**: wait for Claude to finish, review it, hand off the next task. Your attention bandwidth has become the bottleneck.

Colyn lets you command multiple AIs developing different features in parallel — each worktree has its own branch, dev port, and runtime environment. One command to create, `Ctrl-b 1/2/3` to switch between them in tmux.

**[→ See it in action: User Story](docs/en/manual/00-user-story.md)**

---

## Core Capabilities

- **Parallel Worktree Management**: `colyn add feature/auth` creates a worktree in one step — port assigned, dependencies installed, directory switched automatically
- **Task Queue (Todo)**: Capture ideas anytime with `colyn todo add`; `colyn todo start` picks the next task and copies context to clipboard — paste into Claude and go
- **Deep tmux Integration**: Each worktree automatically maps to a tmux window with a fixed three-pane layout (Claude Code / Dev Server / Bash), started automatically
- **Merge Quality Gate**: `colyn merge` runs lint and build before merging — failing checks block the merge
- **Worktree Reuse**: `colyn checkout` switches tasks within the same worktree, preserving Claude's project context for higher efficiency on related features
- **Multi-toolchain Support**: npm, Maven, Gradle, pip, and Xcode projects work out of the box

---

## Installation

```bash
npm install -g colyn

# Configure shell integration (enables auto directory switching)
colyn setup
```

---

## Quick Start

```bash
# Initialize project
colyn init -p 3000

# Create a parallel worktree (auto-switches to new directory, port 3001)
colyn add feature/auth

# View global status
colyn list
```

**[→ Full Quick Start Guide](docs/en/manual/01-quick-start.md)**

---

## Documentation

| Document | Description |
|----------|-------------|
| [User Story](docs/en/manual/00-user-story.md) | See how Colyn works through a complete real-world scenario |
| [Quick Start](docs/en/manual/01-quick-start.md) | Get up and running in 5 minutes |
| [Core Concepts](docs/en/manual/03-core-concepts.md) | Understand worktrees, ports, and the dual-layer architecture |
| [tmux Integration](docs/en/manual/06-tmux-integration.md) | Manage all worktrees from one window |
| [Best Practices](docs/en/manual/07-best-practices.md) | Recommended workflows |
| [Command Reference](docs/en/manual/04-command-reference/README.md) | Detailed documentation for all commands |
| [Plugin System](docs/en/manual/11-plugin-system.md) | Multi-language toolchain support |
| [Troubleshooting](docs/en/manual/08-troubleshooting.md) | Common issues and solutions |

---

## Development

```bash
volta run yarn install   # Install dependencies
volta run yarn build     # Build
volta run yarn test      # Run tests
```

---

## License

MIT
