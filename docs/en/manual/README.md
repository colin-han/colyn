# Colyn User Manual

**Version**: 2.5.5
**Last Updated**: 2026-02-10

---

## Welcome to Colyn

Colyn is a powerful Git Worktree management tool designed for developers who need to work on multiple features in parallel. It simplifies the creation and management of Git worktrees, handles port allocation automatically, supports tmux integration, and makes multi-branch parallel development effortless.

### Core Features

- **Simplified Worktree Management**: Create and manage git worktrees with a single command, no complex commands required
- **Automatic Port Allocation**: Intelligently assigns dev server ports to avoid conflicts
- **Automatic Directory Switching**: Automatically switches to the target directory after command execution
- **Smart Branch Handling**: Automatically identifies local branches, remote branches, or creates new ones
- **Auto-completion**: Supports Bash/Zsh Tab key completion for commands, options, and arguments
- **tmux Integration**: Efficient worktree management and switching within tmux
- **Cross-platform Support**: Full support for macOS, Linux, and Windows

### Use Cases

Colyn is especially well-suited for the following scenarios:

- **Parallel Feature Development**: Develop multiple features simultaneously without frequently switching branches
- **Multi-version Testing**: Run dev servers on different branches simultaneously for comparison testing
- **Bug Fixes**: Maintain your current development state while quickly switching to a bugfix branch
- **Code Review**: Review others' branch code in an isolated environment
- **AI-assisted Development**: Use AI tools like Claude Code to achieve "Parallel Vibe Coding"

---

## Manual Structure

This user manual contains the following chapters:

0. **[User Story: From Solo Developer to an AI Team](00-user-story.md)** - See what Colyn can do through a complete real-world scenario
1. **[Quick Start](01-quick-start.md)** - Get up and running in 5 minutes
2. **[Installation Guide](02-installation.md)** - Detailed installation instructions
3. **[Core Concepts](03-core-concepts.md)** - Understanding how Colyn works
4. **[Command Reference](04-command-reference/README.md)** - Detailed documentation for all commands (organized by category)
5. **[Advanced Usage](05-advanced-usage.md)** - Advanced features and techniques
6. **[tmux Integration](06-tmux-integration.md)** - Efficient workflows in a tmux environment
7. **[Best Practices](07-best-practices.md)** - Recommended workflows and tips
8. **[Troubleshooting](08-troubleshooting.md)** - Common issues and solutions
9. **[Glossary](09-glossary.md)** - Quick reference for terms and concepts
10. **[Configuration System](10-configuration.md)** - Complete configuration file guide
11. **[Plugin System](11-plugin-system.md)** - Multi-language toolchain support (npm / Maven / Gradle / pip)

---

## Quick Navigation

### New Users

If this is your first time using Colyn:

1. Read [User Story](00-user-story.md) to quickly understand what problem Colyn solves
2. Read [Quick Start](01-quick-start.md) to learn the basics
3. Check [Core Concepts](03-core-concepts.md) to understand how it works
4. Refer to [Command Reference](04-command-reference/README.md) to learn specific commands

### Existing Users

If you are already using Colyn:

- Need help with a specific command → [Command Reference](04-command-reference/README.md)
- Configuration file setup → [Configuration System](10-configuration.md)
- Having an issue → [Troubleshooting](08-troubleshooting.md)
- Looking up a term → [Glossary](09-glossary.md)
- Learning advanced techniques → [Advanced Usage](05-advanced-usage.md)

### tmux Users

If you use tmux:

- Complete tmux integration guide → [tmux Integration](06-tmux-integration.md)
- Shortcuts and workflows → [Best Practices](07-best-practices.md)

---

## Getting Help

### Command-line Help

View help at any time from the command line:

```bash
# View all commands
colyn --help

# View help for a specific command
colyn init --help
colyn add --help
```

### Project Information

- **GitHub Repository**: [github.com/colinhan/colyn](https://github.com/colinhan/colyn)
- **Issue Tracker**: [GitHub Issues](https://github.com/colinhan/colyn/issues)
- **Version History**: [CHANGELOG.md](../CHANGELOG.md)

---

## Get Started

Ready? Begin your Colyn journey with [Quick Start](01-quick-start.md)!
