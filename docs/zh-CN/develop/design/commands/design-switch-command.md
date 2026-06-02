# Switch 命令设计文档

## 概述

`colyn <N>` 是用于快速切换 worktree 的命令。用户在终端中输入一个数字即可跳转到对应的 worktree 目录；若处于 tmux session 内，则自动选中对应的 window。

这个命令是 `colyn` 多 worktree 并行 Vibe Coding 工作流的"键位级"快捷入口：相比 `cd` 到长路径，或在 tmux 中通过 `Ctrl-B + N` 切换 window，统一为一个命令。

与其他命令的关系：
- `add`：创建新 worktree（创建后通常自动进入新目录）
- `list`：查看所有 worktree（提供导航信息）
- `switch`：本命令，**仅用于已存在 worktree 之间的快速切换**

## 命令语法

```bash
# 完整命令
colyn <number>
```

### 参数说明

| 参数 | 必需 | 说明 |
|------|------|------|
| `number` | 必需 | 目标 worktree ID；`0` 表示主目录，`N>=1` 表示 `worktrees/task-N` |

### 用户视角

| 输入 | 行为 |
|------|------|
| `colyn 0` | 跳转到主目录（main worktree） |
| `colyn 1` | 跳转到 `worktrees/task-1` |
| `colyn N` | 跳转到 `worktrees/task-N` |
| `colyn 9`（不存在） | 报错并列出可用 worktree，exit 1 |
| `colyn` | 不变（走 commander 原有逻辑，显示 help） |
| `colyn add` / `colyn list` 等 | 不变 |

**没有显式的 `colyn switch <N>` 形式**。`switch` 仅作为内部 hidden subcommand 存在，不展示在 `--help` 中。

## 行为细节

### tmux 智能切换

`colyn <N>` 在不同 tmux 上下文中的行为：

| 当前环境 | 目标 session 是否存在 | 目标 window 是否存在 | 行为 |
|---------|---------------------|-------------------|------|
| tmux 外 | 否 | — | `cd` 到目标目录 |
| tmux 外 | 是 | 否 | `cd` 到目标目录（降级） |
| tmux 外 | 是 | 是 | `exec tmux attach-session -t <session>:<window>` |
| tmux 内（同 session） | — | 是 | Node 端调用 `switchWindow()`（含 iTerm2 title 更新） |
| tmux 内（同 session） | — | 否 | `cd` 到目标目录（降级） |
| tmux 内（其他 session） | 是 | 是 | `exec tmux attach-session -t <session>:<window>`（兜底实现） |

"tmux 内（同 session）+ window 存在"场景**不**经过 shell 协议——`switchWindow()` 是 Node 端的同步 IPC 调用，且内部已实现 iTerm2 title 同步，无需让 shell 执行 `tmux select-window`。

### Window index 约定

基于现有 `src/core/tmux.ts` 的实现：

- Session name = Project name
- 每个 worktree 对应一个 window
- Window index 与 Worktree ID 一致
  - 主目录（ID=0）对应 window 0
  - task-N 对应 window N

若现实中 window index 与 worktree ID 不一致（例如用户手动重排 window），定位失败时自动降级为 `cd`，保证命令不会"什么都不发生"。

### 不在项目中

如果当前目录不在任何 colyn 项目内，`colyn <N>` 报错退出，提示"当前目录不在 colyn 项目中"。

## 内部实现

### 整体分派机制

用户视角只有 `colyn <N>`，但内部通过 commander 的 hidden subcommand `switch <number>` 实现：

```
process.argv  --(预处理)-->  commander  --(分派)-->  switch handler  --(输出)-->  shell/colyn.sh
```

#### 第一步：argv 预处理（`src/cli-preprocess.ts`）

`preprocessArgv(argv)` 接收完整 argv（含 `argv[0]`/`argv[1]`），识别"恰好一个非选项参数且为纯数字"的情况，在数字参数**之后**插入 `'switch'`：

```ts
export function preprocessArgv(argv: string[]): string[] {
  const args = argv.slice(2);
  const nonOptionArgs = args.filter((a) => !a.startsWith('-'));

  if (nonOptionArgs.length !== 1) return [...argv];
  if (!/^\d+$/.test(nonOptionArgs[0])) return [...argv];

  const digitArg = nonOptionArgs[0];
  const digitIdx = args.indexOf(digitArg);

  // 防止 `colyn 1 --foo` 这类混合用法被误识别为快速切换
  const hasOptionAfterDigit = args.slice(digitIdx + 1).some((a) => a.startsWith('-'));
  if (hasOptionAfterDigit) return [...argv];

  // 注意：digitIdx 相对于 args（argv.slice(2)），在完整 argv 中需补偿 +2
  const result = [...argv];
  result.splice(digitIdx + 2, 0, 'switch');
  return result;
}
```

触发条件：
- 仅一个非选项参数（不含 `-x`、`--xxx`）
- 该参数是纯数字（`/^\d+$/`）

不触发的反例：
- `colyn add`（非数字）
- `colyn 1 2`（多个非选项参数）
- `colyn 1 --foo`（带选项时，避免与未来扩展冲突，保守不重写）
- `colyn 12abc`（非纯数字）

#### 第二步：commander 注册（`src/commands/switch.ts`）

```ts
program
  .command('switch <number>', { hidden: true })
  .description(t('commands.switch.description'))
  .action(async (numberArg: string) => {
    await handleSwitch(numberArg);
  });
```

#### 第三步：handler 主流程

伪代码：

```
function handleSwitch(numberArg) {
  // 1. 解析数字 → worktreeId
  const id = parseInt(numberArg, 10);

  // 2. 校验项目状态
  const paths = await getProjectPaths();
  if (!paths) → 报错"当前目录不在 colyn 项目中"，exit 1

  // 3. 定位目标 worktree 路径
  const target = id === 0 ? paths.mainDir : path.join(paths.worktreesDir, `task-${id}`);
  if (!exists(target)) → 报错 + 列出可用 worktree，exit 1

  // 4. 计算显示路径
  const displayPath = relativeTo(home, target);

  // 5. tmux 状态检测（复用 src/core/tmux.ts 已有工具）
  const sessionName = projectName;
  const inTmux = isInTmux();
  const currentSession = inTmux ? getCurrentSession() : null;
  const hasSession = sessionExists(sessionName);
  const hasWindow = hasSession && windowExists(sessionName, id);

  // 6. 决策
  if (!hasWindow) {
    // 降级为 cd：session 或 window 不存在
    outputResult({ success: true, targetDir: target, displayPath });
    return;
  }

  if (inTmux && currentSession === sessionName) {
    // 同 session 内：直接 Node 调用，不走 shell 协议
    switchWindow(sessionName, id, projectName, branchName);
    return;
  }

  // tmux 外，或在其他 session 中：让 shell 执行 attach
  outputResult({ success: true, attachSession: sessionName, attachWindow: id });
}
```

### Shell 控制协议扩展（`shell/colyn.sh`）

#### 现有字段

| 字段 | 类型 | 含义 |
|------|------|------|
| `success` | boolean | 控制消息合法标志 |
| `targetDir` | string | 切换目录的绝对路径 |
| `displayPath` | string | 用户友好显示路径 |
| `attachSession` | string | tmux session 名 |

#### 新增字段

| 字段 | 类型 | 含义 |
|------|------|------|
| `attachWindow` | number | 与 `attachSession` 搭配，attach 后选中的 window index |

仅一个新增字段。"在 tmux 内同 session 切 window"由 Node 端直接调用 `switchWindow()` 完成，不通过 shell 协议。

#### 处理优先级

```bash
if [[ -n "$attach_session" ]]; then
  if [[ -n "$attach_window" ]]; then
    exec tmux attach-session -t "${attach_session}:${attach_window}"
  else
    exec tmux attach-session -t "$attach_session"
  fi
elif [[ -n "$target_dir" && -d "$target_dir" ]]; then
  cd "$target_dir"
  echo "📂 已切换到: $display_path"
fi
```

### 控制消息示例

**场景 A：tmux 外，session 不存在**

```json
{
  "success": true,
  "targetDir": "/Users/x/proj/worktrees/task-1",
  "displayPath": "~/proj/worktrees/task-1"
}
```

**场景 B：tmux 内（同 session），切换 window**

不输出控制消息——Node 端调用 `switchWindow()` 已完成切换。

**场景 C：tmux 外，session+window 都存在**

```json
{
  "success": true,
  "attachSession": "colyn",
  "attachWindow": 1
}
```

## 错误处理

所有错误信息走 stderr。错误时 **不** 输出 JSON 控制消息（shell 检测到 stdout 末行非有效 JSON 控制行，不触发 cd/attach）。

| 场景 | 退出码 | stderr 输出 |
|------|------|------|
| 不在 colyn 项目中 | 1 | `当前目录不在 colyn 项目中，无法切换 worktree` |
| `colyn 0` 但主目录定位失败 | 1 | `无法定位主目录` |
| `colyn N` 但 task-N 不存在 | 1 | 错误 + 可用 worktree 列表 |

### 可用 worktree 列表格式

```
Worktree task-9 不存在
可用 worktree：
  0  main         main  (主目录)
  1  task-1       feature/foo
  2  task-2       feature/quick-switch
```

复用 `src/core/discovery.ts` 或 `src/commands/list.ts` 中已有的 worktree 发现逻辑，避免重复实现。

### 无效输入

argv 预处理保证只有"纯数字单参数"才进入 switch handler，因此 handler 内部不需要处理 `-1`、`abc` 等输入——它们走 commander 正常流程，被识别为未知命令。

唯一仍可能出现的边界：`colyn 99999`（超大数字）。按"worktree 不存在"统一处理，不设硬上限。

## i18n

在 `src/i18n/locales/zh-CN.ts` 和 `src/i18n/locales/en.ts` 的 `commands` 部分新增：

```ts
switch: {
  description: '快速切换到指定 worktree（内部 hidden 子命令）',
  notInProject: '当前目录不在 colyn 项目中，无法切换 worktree',
  mainDirNotFound: '无法定位主目录',
  worktreeNotExists: 'Worktree task-{{n}} 不存在',
  availableWorktrees: '可用 worktree：',
  mainDirLabel: '主目录',
}
```

英文版同步更新，遵循现有翻译文件风格。

## 输出流分工

遵循项目"双层架构"规范：

- 所有提示与错误：**stderr**（使用 `output*` 工具函数）
- JSON 控制消息：**stdout**，仅在 `COLYN_OUTPUT_JSON=1` 时输出（使用 `outputResult()`）
- 错误场景不输出 JSON 控制消息

## 文件改动清单

### 新增

- `src/commands/switch.ts`：命令模块，注册 hidden subcommand，包含目标解析、tmux 状态检测、控制消息输出
- `src/cli-preprocess.ts`：`preprocessArgv()` argv 预处理逻辑（独立模块，便于单元测试）
- `docs/zh-CN/develop/design/commands/design-switch-command.md`：本文档
- `docs/en/develop/design/commands/design-switch-command.md`：英文版

### 修改

- `src/cli.ts`：在 `program.parse()` 前调用 `process.argv = preprocessArgv(process.argv)`
- `src/commands/index.ts`：增加 `registerSwitch(program)`（项目既有模式）
- `shell/colyn.sh`：解析 `attachWindow` 字段，扩展现有 attachSession 分支
- `src/i18n/locales/zh-CN.ts`：新增 `commands.switch.*` 键
- `src/i18n/locales/en.ts`：同上（英文）
- `docs/zh-CN/manual/*.md`、`docs/en/manual/*.md`：用户手册加入 `colyn <N>` 用法

### 不改动

- `shell/completion.bash`、`shell/completion.zsh`：数字补全意义不大，保持默认 shell fallback
- 配置文件结构：无变化，不涉及 migration

## 测试策略

在项目既有测试组织方式下新增 `src/commands/switch.test.ts`，用 mock 处理 tmux 与文件系统，覆盖：

| # | 场景 | 期望输出 |
|---|------|------|
| 1 | `colyn 0`，主目录存在 | 控制消息含 `targetDir` 为主目录 |
| 2 | `colyn N`，task-N 存在，session 不存在 | 控制消息仅含 `targetDir` |
| 3 | `colyn N`，session+window 存在，当前在同 session | Node 调用 `switchWindow()`，stdout 无控制消息 |
| 4 | `colyn N`，session+window 存在，当前在 tmux 外 | 控制消息 `attachSession + attachWindow: N` |
| 5 | `colyn 9`，task-9 不存在 | stderr 含错误+列表，stdout 无控制消息，exit 1 |
| 6 | `colyn 99999` | 同 #5 |
| 7 | 不在 colyn 项目中 | stderr 错误，exit 1 |

argv 预处理逻辑单独测试：

输入为完整 argv（含 `argv[0]`/`argv[1]`，如 `["node", "colyn", ...]`）：

| # | 输入 argv | 期望结果 |
|---|----------|------|
| 1 | `["node", "colyn", "1"]` | 重写为 `["node", "colyn", "switch", "1"]` |
| 2 | `["node", "colyn", "add"]` | 不重写 |
| 3 | `["node", "colyn", "1", "2"]` | 不重写 |
| 4 | `["node", "colyn", "1", "--foo"]` | 不重写 |
| 5 | `["node", "colyn", "--help"]` | 不重写 |
| 6 | `["node", "colyn", "12abc"]` | 不重写 |

## 兼容性

- 纯加法，不影响任何现有命令
- 配置文件结构无变化，不涉及 migration（参考"配置文件修改规范"）

## 风险与降级

- **window index 与 worktree ID 不一致**：自动降级为 `cd`
- **跨 session 切换**：用 `attach-session -t s:w` 统一处理，规避 `switch-client` 在不同平台的行为差异
- **shell/colyn.sh 旧版本**：用户升级二进制但未重新 source shell 脚本时——
  - "tmux 外 + session/window 存在"场景：旧 shell 仅识别 `attachSession`，会 `attach` 到 session 默认 window（非用户指定的 task-N window），结果是 attach 成功但选中了"上次活跃 window"。**实施阶段需在 upgrade notes 中提示用户重新 `source shell/colyn.sh`。**
  - 其他场景：旧 shell 字段足够，行为正确。

## 与其他命令的关系

| 命令 | 用途 | 与 switch 的关系 |
|------|------|---------------|
| `colyn add` | 创建新 worktree | 创建后通常自动 cd，是 switch 的"创建路径" |
| `colyn list` | 列出 worktree | 提供 ID 信息，方便用户知道该输入哪个数字 |
| `colyn info` | 查看当前 worktree 详情 | 不重叠 |
| `colyn checkout` | 复用 worktree 切换分支 | 操作"分支"维度，switch 操作"位置"维度 |
| `colyn remove` | 删除 worktree | switch 后不应再切到已删除的 ID |
