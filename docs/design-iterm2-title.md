# iTerm2 Tab Title 同步设计文档

## 版本信息
- 文档版本：1.1
- 创建日期：2026-02-21
- 更新日期：2026-02-21

---

## 1. 背景与目标

### 1.1 需求背景

Colyn 使用 Git worktree 实现并行 Vibe Coding。在多个 worktree 之间切换时，用户需要能够通过 iTerm2 的 tab 快速判断当前所在的项目和分支，而无需观察命令行提示符。

### 1.2 设计目标

- **仅设置 tab title**：不修改 window title，避免影响用户的 window 管理习惯
- **零配置**：无需用户任何配置，自动适配 tmux 和非 tmux 两种环境
- **时机准确**：在用户切换 worktree 的关键操作时及时更新

---

## 2. 触发时机

### 2.1 触发命令

| 命令 | 触发场景 | 说明 |
|------|---------|------|
| `colyn add` | 创建新 worktree 时 | `setupWindow()` 创建 window 后、`switchWindow()` 切换 window 后各触发一次 |
| `colyn checkout` | 切换到已有 worktree 时 | 切换完成后触发，无论是否在 tmux 中 |
| `colyn tmux repair` | 修复 tmux window 时 | 通过 `setupWindow()` 触发 |

### 2.2 触发条件

必须同时满足以下条件，才会执行 title 更新：

1. **在 iTerm2 中运行**：通过环境变量检测
   - `TERM_PROGRAM === 'iTerm.app'`，或
   - `LC_TERMINAL === 'iTerm2'`
2. **已知 projectName 和 branchName**：两者均为必要信息

不满足条件时静默跳过，不报错。

---

## 3. Title 格式

### 3.1 非 tmux 环境

```
🐶 {projectName} #{worktreeId} - {windowName}
```

| 变量 | 说明 | 示例 |
|------|------|------|
| `projectName` | 主目录名称（项目名） | `my-app` |
| `worktreeId` | Worktree ID（数字） | `2` |
| `windowName` | 分支名的最后一段（`/` 分隔） | `login-page`（来自 `feature/login-page`） |

**示例**：

| 项目名 | Worktree ID | 分支名 | Tab Title |
|--------|------------|--------|-----------|
| `my-app` | `2` | `feature/login-page` | `🐶 my-app #2 - login-page` |
| `my-app` | `3` | `fix/button-style` | `🐶 my-app #3 - button-style` |
| `my-app` | `1` | `main` | `🐶 my-app #1 - main` |

### 3.2 tmux 环境

```
🐶 {projectName} #tmux
```

| 变量 | 说明 | 示例 |
|------|------|------|
| `projectName` | 主目录名称（项目名） | `my-app` |

所有 worktree 的 tab title 统一显示为同一个值，因为在 tmux 环境下，worktree 的识别通过 tmux window 名称完成，无需在 iTerm2 tab title 中重复。

**示例**：`🐶 my-app #tmux`

### 3.3 设计决策：为何两种环境格式不同

- **非 tmux 环境**：每个 worktree 对应不同的 iTerm2 tab，tab title 需要包含完整信息（worktree ID + 分支名）方便识别
- **tmux 环境**：多个 worktree 共享同一个 iTerm2 tab（tmux 内部通过 window 切换），tab title 只需标识项目即可，详细信息看 tmux 状态栏

---

## 4. 技术实现

### 4.1 OSC 转义序列

Tab title 通过 iTerm2 标准的 OSC（Operating System Command）转义序列设置：

```
\033]1;{title}\007
```

- `\033]1;` — OSC 序列，序号 `1` 表示设置 "icon name"（即 tab title）
- `\007` — BEL 字符，序列结束符

注意：OSC `2` 设置 window title，OSC `1` 设置 tab title（icon name），本功能只使用 `1`。

**OSC 1 同时修改 session name**：iTerm2 中 OSC 1 设置 icon name 时，会同时更新 session 的 `autoNameFormat` 变量，即 "Edit Session > Session Name" 中看到的名称。因此 OSC 1 同时起到了设置 tab title 和 session name 的效果。

### 4.2 多 Pane 时的 Tab Title 行为

当一个 iTerm2 tab 中存在多个 pane 时，**tab title 显示的是当前活跃（焦点所在）pane 的 session name**。用户切换到哪个 pane，tab title 就跟着变成那个 pane 的 session name。

**对本功能的影响分析**：

| 场景 | iTerm2 视角 | 影响 |
|------|------------|------|
| **tmux 环境** | 整个 tmux 在 iTerm2 单个 pane 中运行，iTerm2 看不到 tmux 内部的 pane | **无影响**。OSC 序列从 tmux pane 透传至 iTerm2，修改的是唯一的 session name，行为稳定 |
| **非 tmux 环境** | Colyn 命令在单个 pane 中执行，通常不涉及 iTerm2 split panes | **无影响**。Colyn 自身不创建 iTerm2 split panes |

结论：在 Colyn 的使用场景下，多 pane tab title 问题不会影响当前实现。

### 4.3 发送方式

根据当前环境选择不同的发送方式：

**非 tmux 环境**：直接写入 `stderr`

```typescript
process.stderr.write(`\x1b]1;${tabTitle}\x07`);
```

**tmux 环境**：通过 `tmux send-keys` 发送到对应 pane，由 pane 内的 shell 执行

```bash
tmux send-keys -t "{sessionName}:{windowIndex}.0" "printf '\033]1;{title}\007'" Enter
```

发送到 pane 0（主 pane），由 shell 执行 `printf` 输出转义序列，iTerm2 捕获后更新 tab title。

### 4.4 windowName 计算

```typescript
function getWindowName(branch: string): string {
  return branch.split('/').pop() || branch;
}
```

取分支名中 `/` 最后一段。例如：
- `feature/login-page` → `login-page`
- `fix/button-style` → `button-style`
- `main` → `main`

---

## 5. 实现位置

| 函数 | 文件 | 职责 |
|------|------|------|
| `isInIterm2()` | `src/core/tmux.ts` | 检测 iTerm2 环境 |
| `setIterm2Title()` | `src/core/tmux.ts` | 核心实现，判断环境并发送转义序列 |
| `setupWindow()` | `src/core/tmux.ts` | 创建 window 后调用 `setIterm2Title()` |
| `switchWindow()` | `src/core/tmux.ts` | 切换 window 后调用 `setIterm2Title()` |
| checkout 命令 | `src/commands/checkout.ts` | 切换 worktree 后直接调用 `setIterm2Title()` |
