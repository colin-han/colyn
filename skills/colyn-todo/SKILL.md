---
name: colyn-todo
description: >
  Manage colyn project Todo tasks. Use this skill whenever the prompt contains "colyn todo".
---

# colyn-todo Skill

Use the `colyn todo` CLI to manage Todo tasks in the current project.

**CRITICAL: Always pass all arguments explicitly. Interactive prompts are for human users only and will block execution.**

## Commands

```bash
# View
colyn todo list              # pending tasks
colyn todo list --completed  # completed tasks
colyn todo list --json       # machine-readable (get exact ids)

# Add — todoId and message are required
colyn todo add <type/name> "<message>"

# Edit — todoId and message are required
colyn todo edit <type/name> "<new message>"

# Status
colyn todo complete <type/name>
colyn todo uncomplete <type/name>

# Remove
colyn todo remove <type/name>
colyn todo archive           # archive all completed tasks
```

## todoId format

`type/name` — type is one of `feature`, `bugfix`, `refactor`, `document` (or user-configured via `branchCategories` in settings.json); name is kebab-case.

Run `colyn config get branchCategories` to see the full list of available types.

```bash
colyn todo add feature/user-auth "Implement JWT authentication"
colyn todo add bugfix/login-error "Fix login error on empty password"
colyn todo edit feature/user-auth "Implement OAuth2 instead of JWT"
```

## Guidelines

1. Run `colyn todo list` before adding to avoid duplicates.
2. Run `colyn todo list --json` when unsure of exact todoId.
