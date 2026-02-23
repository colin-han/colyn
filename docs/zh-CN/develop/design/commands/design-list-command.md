# List 命令设计文档（用户交互视角）

**创建时间**：2026-01-15  
**最后更新**：2026-02-23  
**命令名称**：`colyn list`  
**状态**：✅ 已实现

---

## 1. 命令概述

### 1.1 用户目标

`colyn list` 用于快速查看当前项目的所有 worktree（包含主分支），支持人类可读表格和脚本可读输出。

核心价值：
- 一眼看到每个 worktree 的分支、端口、路径
- 同时看到 Git 工作区变更（`Git`）与工作流状态（`Status`）
- 支持 JSON / 路径输出，便于自动化脚本
- 支持文件监听自动刷新，用于实时监控

### 1.2 命令语法

```bash
colyn list [options]
colyn ls [options]   # 别名
```

### 1.3 选项

| 选项 | 短选项 | 说明 | 默认值 |
|------|--------|------|--------|
| `--json` | - | 以 JSON 格式输出 | 否 |
| `--paths` | `-p` | 只输出路径（每行一个） | 否 |
| `--no-main` | - | 不显示主分支 | 否（显示主分支） |
| `--refresh` | `-r` | 监听文件变化自动刷新（仅表格） | 否 |

互斥规则：
- `--json` 与 `--paths` 互斥
- `--refresh` 不能与 `--json` 或 `--paths` 同时使用

---

## 2. 输出格式

### 2.1 表格格式（默认）

默认模式会尽量显示以下列：
- `ID`
- `Branch`
- `Port`
- `Git`
- `Diff`
- `Path`
- `Status`

示例：

```text
ID      Branch            Port   Git       Diff    Path              Status
  0-main main             10000            -       my-app
  1      feature/login    10001  M:3 S:1   ↑2 ↓1   worktrees/task-1  running
→ 2      feature/ui       10002            ✓       worktrees/task-2
```

列语义：
- `Git`：工作区变更统计（`M` modified / `S` staged / `?` untracked）
- `Diff`：与主分支提交差异（`↑` ahead / `↓` behind / `✓` synced）
- `Status`：工作流状态（`idle` 为空，其余显示 `running` / `waiting-confirm` / `finish`）

颜色规则：
- 当前行：青色高亮
- 主分支行：灰色
- `Git` 有改动：黄色
- `Diff` 为 `✓`：绿色；其余差异：青色
- `Status`：`running` 青色、`waiting-confirm` 黄色、`finish` 绿色

### 2.2 响应式列模式

根据终端宽度自动降级，防止折行：

| 模式 | 显示列 |
|------|--------|
| `full` | ID, Branch, Port, Git, Diff, Path, Status |
| `no-port` | ID, Branch, Git, Diff, Path, Status |
| `no-path` | ID, Branch, Git, Diff, Status |
| `compress-wt` | ID, Branch, Git, Diff, st. |
| `simple-git` | ID, Branch, S, Diff, st. |
| `no-git` | ID, Branch, Diff, st. |
| `no-diff` | ID, Branch, st. |
| `minimal` | ID, Branch |

说明：
- `st.` 为工作流状态压缩列：`▶`（running）/ `?`（waiting-confirm）/ `✓`（finish）
- `S` 为 Git 简化列：有改动显示 `●`，无改动为空

### 2.3 JSON 格式（`--json`）

输出 `ListItem[]`：

```json
[
  {
    "id": null,
    "branch": "main",
    "port": 10000,
    "path": "my-app",
    "isMain": true,
    "isCurrent": false,
    "status": { "modified": 0, "staged": 0, "untracked": 0 },
    "diff": { "ahead": 0, "behind": 0 },
    "worktreeStatus": "idle"
  }
]
```

字段说明：
- `id`: `number | null`（主分支为 `null`）
- `branch`: 分支名
- `port`: 端口号
- `path`: 相对项目根目录路径
- `isMain`: 是否主分支
- `isCurrent`: 是否当前所在目录
- `status`: Git 工作区统计（`modified/staged/untracked`）
- `diff`: 与主分支差异（`ahead/behind`）
- `worktreeStatus`: 工作流状态（`idle/running/waiting-confirm/finish`）

### 2.4 路径格式（`--paths`）

每行输出一个相对路径，适合管道：

```bash
colyn list --paths
colyn list --paths --no-main
```

---

## 3. 自动刷新（`-r/--refresh`）

### 3.1 行为

`--refresh` 使用文件监听（chokidar），在检测到变化时自动重绘表格。

监听范围：
- 主分支 `.git`
- 各 worktree 的 `.git`
- `worktrees/` 目录（增删 worktree）
- 主分支与各 worktree 的 `.env.local`

### 3.2 防抖

为避免频繁刷屏，刷新采用防抖（当前实现约 1 秒）。

### 3.3 退出

按 `Ctrl+C` 退出监听模式，显示“已停止刷新”。

---

## 4. 数据来源

### 4.1 项目结构

- 通过 `getProjectPaths()` 定位项目根、主分支目录、worktrees 目录
- 通过 `discoverProjectInfo()` 收集所有 worktree

### 4.2 Git 与状态

- `Git` / `Diff`：来自 `src/commands/list.helpers.ts`
- `Status`：来自 `src/core/worktree-status.ts` 的 `getWorktreeStatus()`

---

## 5. 用户场景

### 5.1 查看所有 worktree

```bash
colyn list
```

### 5.2 脚本批处理

```bash
colyn list --paths | xargs -I {} sh -c 'cd {} && git status'
```

### 5.3 程序化读取

```bash
colyn list --json | jq '.[] | select(.isMain == false) | .path'
```

### 5.4 实时监控

```bash
colyn list -r
```

---

## 6. 错误处理

| 场景 | 报错 |
|------|------|
| `--json` 与 `--paths` 同时使用 | 选项冲突 |
| `--refresh` 与 `--json/--paths` 同时使用 | 选项冲突 |
| 非 colyn 项目目录 | 项目未初始化/找不到项目根 |

退出码：
- `0` 成功
- `1` 失败

---

## 7. 与其他命令关系

- `colyn add` 创建 worktree 后常用 `colyn list` 验证结果
- `colyn status` 改变工作流状态后，`colyn list` 的 `Status` 列可直接反映
- `colyn merge/remove/update/checkout` 后，`colyn list` 用于快速确认全局状态

---

## 8. 设计决策

1. 表头保持英文（ID/Branch/Port/Git/Diff/Path/Status）以贴合开发者习惯。  
2. `Git` 与 `Status` 分离：避免把工作区变更和工作流状态混为一谈。  
3. 使用响应式列降级而不是换行，保证终端可读性。  
4. 刷新采用 file watch + 防抖，避免固定轮询带来的资源浪费与视觉干扰。
