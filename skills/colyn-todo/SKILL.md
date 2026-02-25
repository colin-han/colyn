---
name: colyn-todo
description: >
  Manage colyn project Todo tasks. Use this skill whenever the prompt contains "colyn todo".
---

# colyn-todo Skill

Use the `colyn todo` CLI to manage Todo tasks in the current project.

**CRITICAL: Always pass all arguments explicitly. Never run commands without full arguments — interactive prompts are for human users only and will block execution.**

## Key Commands

### View tasks
```bash
colyn todo list              # pending tasks (default)
colyn todo list --completed  # completed tasks
colyn todo list --json       # machine-readable output with ids
```

### Add a task
Always provide both `todoId` and `message`:
```bash
colyn todo add <todoId> "<message>"
```
- `todoId` format: `type/name` — type is one of `feature`, `bugfix`, `refactor`, `document`
- `name`: kebab-case, descriptive

```bash
colyn todo add feature/user-auth "Implement JWT authentication"
colyn todo add bugfix/login-error "Fix login error on empty password"
colyn todo add document/api-guide "Write API usage guide"
```

### Edit a task
Always provide both `todoId` and `message`:
```bash
colyn todo edit <todoId> "<new message>"
```

```bash
colyn todo edit feature/user-auth "Implement OAuth2 instead of JWT"
```

### Complete / uncomplete
```bash
colyn todo complete <todoId>
colyn todo uncomplete <todoId>
```

### Remove
```bash
colyn todo remove <todoId>
colyn todo archive              # archive all completed tasks
```

## Workflow Guidelines

1. **Before adding**: run `colyn todo list` to check for duplicates.
2. **When unsure of todoId**: run `colyn todo list --json` to get exact ids.
