# iTerm2 Tab Title 同步设计文档

## 版本信息
- 文档版本：2.0
- 创建日期：2026-02-21
- 更新日期：2026-10-14

---

## 1. 背景与目标

### 1.1 需求背景

Colyn 使用 Git worktree 实现并行 Vibe Coding。在多个 worktree 之间切换时，用户需要能够通过 iTerm2 的 tab 快速判断当前所在的项目和分支，而无需观察命令行提示符。

### 1.2 设计目标

- **仅设置 tab title**：不修改 window title，避免影响用户的 window 管理习惯
- **零配置**：无需用户任何配置，在 iTerm2 中自动生效，非 iTerm2 环境静默跳过
- **时机准确**：在用户切换 worktree 的关键操作时及时更新

---

## 2. 触发时机

### 2.1 触发命令

| 命令 | 触发场景 | 说明 |
|------|---------|------|
| `colyn add` | 创建新 worktree 后 | worktree 创建完成、输出结果之前触发一次 |
| `colyn checkout` | 切换到目标分支后 | 分支切换完成、worktree 状态更新为 idle 后触发一次 |

### 2.2 触发条件

必须同时满足以下条件，才会执行 title 更新：

1. **在 iTerm2 中运行**：通过环境变量检测
   - `TERM_PROGRAM === 'iTerm.app'`，或
   - `LC_TERMINAL === 'iTerm2'`
2. **已知 worktreeId、projectName 和 branchName**：三者均为必要信息

不满足条件时静默跳过，不报错。

---

## 3. Title 格式

```
🐶 {projectName} #{worktreeId} - {branchShortName}
```

| 变量 | 说明 | 示例 |
|------|------|------|
| `projectName` | 主目录名称（项目名） | `my-app` |
| `worktreeId` | Worktree ID（数字） | `2` |
| `branchShortName` | 分支短名：分支名以 `/` 分隔的最后一段 | `login-page`（来自 `feature/login-page`） |

**示例**：

| 项目名 | Worktree ID | 分支名 | Tab Title |
|--------|------------|--------|-----------|
| `my-app` | `2` | `feature/login-page` | `🐶 my-app #2 - login-page` |
| `my-app` | `3` | `fix/button-style` | `🐶 my-app #3 - button-style` |
| `my-app` | `1` | `main` | `🐶 my-app #1 - main` |

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

Colyn 命令在单个 pane 中执行，自身不创建 iTerm2 split panes，因此该行为不影响当前实现。

### 4.3 发送方式

转义序列直接写入 `stderr`（遵循项目双层架构：stdout 保留给 JSON 结果）：

```typescript
process.stderr.write(`\x1b]1;${tabTitle}\x07`);
```

### 4.4 branchShortName 计算

```typescript
export function getBranchShortName(branch: string): string {
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
| `isInIterm2()` | `src/core/iterm2.ts` | 检测 iTerm2 环境（模块内部函数） |
| `getBranchShortName()` | `src/core/iterm2.ts` | 计算分支短名 |
| `setIterm2Title(worktreeId, projectName, branchName)` | `src/core/iterm2.ts` | 核心实现，判断环境并发送转义序列；返回是否执行了设置 |
| add 命令 | `src/commands/add.ts` | 创建 worktree 后调用 `setIterm2Title()` |
| checkout 命令 | `src/commands/checkout.ts` | 切换分支后调用 `setIterm2Title()` |
