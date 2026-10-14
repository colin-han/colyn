# Switch 命令设计文档

## 概述

`colyn <N>` 是用于快速切换 worktree 的命令。用户在终端中输入一个数字即可跳转到对应的 worktree 目录。

这个命令是 `colyn` 多 worktree 并行 Vibe Coding 工作流的"键位级"快捷入口：相比 `cd` 到长路径，统一为一个命令。

与其他命令的关系：
- `add`：创建新 worktree（创建后通常自动进入新目录）
- `list`：查看所有 worktree（提供导航信息）
- `switch`：本命令，**仅用于已存在 worktree 之间的快速切换**

## 命令语法

```bash
# 切换模式：跳转到目标 worktree 目录
colyn <number>

# 执行模式：在目标 worktree 目录下执行命令，执行完留在当前目录
colyn <number> <command...>
```

### 参数说明

| 参数 | 必需 | 说明 |
|------|------|------|
| `number` | 必需 | 目标 worktree ID；`0` 表示主目录，`N>=1` 表示 `worktrees/task-N` |
| `command...` | 可选 | 要在目标目录下执行的命令及其参数；不提供时为切换模式 |

### 用户视角

| 输入 | 行为 |
|------|------|
| `colyn 0` | 跳转到主目录（main worktree） |
| `colyn 1` | 跳转到 `worktrees/task-1` |
| `colyn N` | 跳转到 `worktrees/task-N` |
| `colyn 0 git push` | 在主目录下执行 `git push`，执行完留在当前目录 |
| `colyn 1 git rebase` | 在 `task-1` 目录下执行 `git rebase`，执行完留在当前目录 |
| `colyn 1 npm run build` | 在 `task-1` 目录下执行 `npm run build`，执行完留在当前目录 |
| `colyn 9`（不存在） | 报错并列出可用 worktree，exit 1 |
| `colyn` | 不变（走 commander 原有逻辑，显示 help） |
| `colyn add` / `colyn list` 等 | 不变 |

**没有显式的 `colyn switch <N>` 形式**。`switch` 仅作为内部 hidden subcommand 存在，不展示在 `--help` 中。

## 行为细节

### 切换模式：纯 `cd` 语义

`colyn <N>` 的切换模式只做一件事：把当前 shell 的工作目录切换到目标 worktree。Node 端负责计算目标路径并输出控制消息，shell 集成（`shell/colyn.sh`）负责执行 `cd`。

### 保留相对子路径

如果当前目录位于某个 worktree（主目录或 `worktrees/task-K`）的子目录中，切换时会尽量保留相同的相对子路径：

| 当前目录 | 命令 | 目标目录 |
|---------|------|---------|
| `my-app/my-app/src/api` | `colyn 2` | `my-app/worktrees/task-2/src/api` |
| `my-app/worktrees/task-1/src/api` | `colyn 0` | `my-app/my-app/src/api` |
| `my-app/worktrees/task-1`（worktree 根） | `colyn 2` | `my-app/worktrees/task-2` |
| `my-app/`（项目根，不属于任何 worktree） | `colyn 2` | `my-app/worktrees/task-2` |

相对子路径的计算规则（`computeRelativeSubpath()`）：
- cwd 在主目录下 → 相对于主目录
- cwd 在 `worktrees/task-K` 下 → 相对于该 `task-K`
- 其他位置（项目根、`worktrees/` 本身、无关目录）→ 空串，即切换到目标 worktree 根

### 子路径缺失时逐级上溯

目标 worktree 中可能没有对应的子目录（例如该分支尚未创建该目录）。此时从 `join(target, rel)` 起逐级取父目录，直到找到存在的目录为止，下界为目标 worktree 根（`resolveDeepestExisting()`）。

```
期望：worktrees/task-2/src/api/v2   （不存在）
      worktrees/task-2/src/api      （不存在）
      worktrees/task-2/src          （存在）← 切换到这里
```

发生回退时在 stderr 打印提示：

```
未找到子目录 ~/my-app/worktrees/task-2/src/api/v2，已切换到 ~/my-app/worktrees/task-2/src
```

若 `rel` 含 `..` 越出目标根，安全回退到目标 worktree 根，不会死循环。

### 不在项目中

如果当前目录不在任何 colyn 项目内，`colyn <N>` 报错退出，提示"当前目录不在 colyn 项目中"。

## 执行模式

当 `colyn <N>` 后跟额外参数时，进入执行模式：在目标 worktree 目录下执行指定命令，执行完成后当前目录不变。

### 设计决策

**由 Node.js 执行命令，不经过 shell wrapper。**

Shell wrapper 仅负责需要当前进程参与的操作（`cd` 切换目录）。命令执行不需要修改当前 shell 状态，由 Node.js 通过 `child_process.spawn` 直接完成，输出转发到 stderr（遵循项目的双层架构：stdout 保留给 JSON 控制协议，stderr 用于用户可见输出）。

优势：
- 无论是否通过 shell wrapper 调用，命令都能正确执行
- 直接运行 `./bin/colyn 0 echo hello` 即可看到输出，无需依赖 shell wrapper
- stdin 透传、信号转发（Ctrl+C）、退出码透传由 spawn 原生支持

### 行为规则

- 命令在目标 worktree 的对应子目录下执行（`cwd: join(target, rel)`），当前 shell 的工作目录不变
- 执行模式**严格要求**对应子目录存在；不存在时报错退出（exit 1），不执行命令，不做上溯回退
- 命令的 stdin 直接透传（`stdio: 'inherit'`），支持交互式命令
- 命令的 stdout 和 stderr 转发到 Node.js 进程的 stderr，确保用户可见且不污染 stdout
- 命令的退出码直接透传（`process.exit(code)`）
- 目标 worktree 不存在时，报错退出，不执行命令

### 实现方式

```typescript
const child = spawn(commandArgs.join(' '), {
  cwd: execTarget,
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: true,
});

child.stdout.pipe(process.stderr);
child.stderr.pipe(process.stderr);

child.on('close', (code) => {
  process.exit(code ?? 1);
});
```

注意：使用 `shell: true` 以支持管道、重定向等 shell 特性。

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
- `colyn 1 --foo`（带选项时，避免与未来扩展冲突，保守不重写）
- `colyn 12abc`（非纯数字）

#### 第一步（扩展）：argv 预处理支持执行模式

当有 2+ 个非选项参数且第一个是纯数字时，进入执行模式：

```ts
const nonOptionArgs = args.filter(a => !a.startsWith('-'));

// 执行模式：colyn <N> <cmd...>
if (nonOptionArgs.length >= 2 && /^\d+$/.test(nonOptionArgs[0])) {
  const idx = args.indexOf(nonOptionArgs[0]);
  result.splice(idx + 2, 0, 'switch');
  return result;
}

// 切换模式：colyn <N>（原有逻辑）
if (nonOptionArgs.length === 1 && /^\d+$/.test(nonOptionArgs[0])) {
  // ... 保持原有 hasOptionAfterDigit 保护 ...
}
```

新增触发示例：
- `colyn 0 git push` → `colyn switch 0 git push`
- `colyn 1 npm run build` → `colyn switch 1 npm run build`
- `colyn 1 git push -f` → `colyn switch 1 git push -f`（`-f` 是命令参数）

#### 第二步：commander 注册（`src/commands/switch.ts`）

```ts
program
  .command('switch <number> [commandArgs...]', { hidden: true })
  .description(t('commands.switch.description'))
  .action(async (numberArg: string, commandArgs: string[] | undefined) => {
    await handleSwitch(numberArg, commandArgs);
  });
```

#### 第三步：handler 主流程

伪代码：

```
function handleSwitch(numberArg, commandArgs) {
  // 1. 解析数字 → worktreeId
  const id = parseInt(numberArg, 10);

  // 2. 校验项目状态
  const paths = await getProjectPaths();
  if (!paths) → 报错"当前目录不在 colyn 项目中"，exit 1

  // 3. 定位目标 worktree 根路径
  const target = id === 0 ? paths.mainDir : path.join(paths.worktreesDir, `task-${id}`);
  if (!exists(target)) → 报错 + 列出可用 worktree，exit 1

  // 4. 计算当前目录相对所在 worktree 根的子路径
  const rel = computeRelativeSubpath(process.cwd(), paths);

  // 5. 执行模式：Node.js 直接执行命令（子目录必须存在）
  if (commandArgs && commandArgs.length > 0) {
    const execTarget = path.join(target, rel);
    if (!exists(execTarget)) → 报错"子目录不存在"，exit 1
    spawn(commandArgs.join(' '), { cwd: execTarget, stdio: ['inherit', 'pipe', 'pipe'], shell: true });
    child.stdout.pipe(process.stderr);
    child.stderr.pipe(process.stderr);
    child.on('close', (code) => process.exit(code ?? 1));
    return;
  }

  // 6. 切换模式：保留相对子路径，缺失则上溯到最深存在的目录
  const resolved = await resolveDeepestExisting(target, rel);
  if (rel && resolved !== path.join(target, rel)) → stderr 打印回退提示
  outputResult({ success: true, targetDir: resolved, displayPath: toDisplayPath(resolved) });
}
```

### Shell 控制协议（`shell/colyn.sh`）

Shell wrapper 仅负责需要当前进程参与的操作：`cd` 切换目录。执行模式由 Node.js 直接处理，不经过 shell wrapper。

#### 字段

| 字段 | 类型 | 含义 |
|------|------|------|
| `success` | boolean | 控制消息合法标志 |
| `targetDir` | string | 切换目录的绝对路径 |
| `displayPath` | string | 用户友好显示路径（家目录替换为 `~`） |

#### 处理逻辑

Shell wrapper 截留 stdout 的最后一行作为控制消息（其余 stdout 原样透传），`success === true` 且 `targetDir` 为存在的目录时执行 `cd`：

```bash
if [[ -n "$target_dir" && -d "$target_dir" ]]; then
  cd "$target_dir" || return
  echo "📂 已切换到: $display_path"
fi
```

### 控制消息示例

**场景 A：执行模式（`colyn 1 git push`）**

不输出控制消息。Node.js 直接执行命令，命令输出转发到 stderr。

**场景 B：切换模式（`colyn 1`）**

```json
{
  "success": true,
  "targetDir": "/Users/x/proj/worktrees/task-1/src",
  "displayPath": "~/proj/worktrees/task-1/src"
}
```

## 错误处理

所有错误信息走 stderr。错误时 **不** 输出 JSON 控制消息（shell 检测到 stdout 末行非有效 JSON 控制行，不触发 cd）。

| 场景 | 退出码 | stderr 输出 |
|------|------|------|
| 不在 colyn 项目中 | 1 | `当前目录不在 colyn 项目中，无法切换 worktree` |
| `colyn 0` 但主目录定位失败 | 1 | `无法定位主目录` |
| `colyn N` 但 task-N 不存在 | 1 | 错误 + 可用 worktree 列表 |
| 执行模式下目标子目录不存在 | 1 | `子目录 {sub} 在目标 worktree 中不存在` |

### 可用 worktree 列表格式

```
Worktree task-9 不存在
可用 worktree：
  0  main         main  (主目录)
  1  task-1       feature/foo
  2  task-2       feature/quick-switch
```

复用 `src/core/discovery.ts` 中已有的 worktree 发现逻辑，避免重复实现。

### 无效输入

argv 预处理保证只有"纯数字"才进入 switch handler，因此 handler 内部不需要处理 `-1`、`abc` 等输入——它们走 commander 正常流程，被识别为未知命令。

唯一仍可能出现的边界：`colyn 99999`（超大数字）。按"worktree 不存在"统一处理，不设硬上限。

## i18n

在 `src/i18n/locales/zh-CN.ts` 和 `src/i18n/locales/en.ts` 的 `commands` 部分：

```ts
switch: {
  description: '快速切换到指定 worktree（内部 hidden 子命令）',
  notInProject: '当前目录不在 colyn 项目中，无法切换 worktree',
  mainDirNotFound: '无法定位主目录',
  worktreeNotExists: 'Worktree task-{{n}} 不存在',
  availableWorktrees: '可用 worktree：',
  mainDirLabel: '主目录',
  subdirNotFound: '子目录 {{sub}} 在目标 worktree 中不存在',
  subdirFallback: '未找到子目录 {{expected}}，已切换到 {{actual}}',
}
```

英文版同步更新，遵循现有翻译文件风格。

## 输出流分工

遵循项目"双层架构"规范：

- 所有提示与错误：**stderr**（使用 `output*` 工具函数）
- JSON 控制消息：**stdout**，仅在 `COLYN_OUTPUT_JSON=1` 时输出（使用 `outputResult()`）
- 错误场景不输出 JSON 控制消息

## 文件改动清单

### 相关文件

- `src/commands/switch.ts`：命令模块，注册 hidden subcommand，包含目标解析、相对子路径计算、上溯回退、执行模式、控制消息输出
- `src/cli-preprocess.ts`：`preprocessArgv()` argv 预处理逻辑（独立模块，便于单元测试）
- `src/cli.ts`：在 `program.parse()` 前调用 `process.argv = preprocessArgv(process.argv)`
- `src/commands/index.ts`：`registerSwitch(program)`（项目既有模式）
- `shell/colyn.sh`：解析 `targetDir` / `displayPath` 字段并执行 `cd`
- `src/i18n/locales/zh-CN.ts`、`src/i18n/locales/en.ts`：`commands.switch.*` 键
- `docs/zh-CN/develop/design/commands/design-switch-command.md`：本文档
- `docs/en/develop/design/commands/design-switch-command.md`：英文版
- `docs/zh-CN/manual/*.md`、`docs/en/manual/*.md`：用户手册中的 `colyn <N>` 用法

### 不改动

- `shell/completion.bash`、`shell/completion.zsh`：数字补全意义不大，保持默认 shell fallback
- 配置文件结构：无变化，不涉及 migration

## 测试策略

`src/commands/switch.test.ts` 用 mock 处理文件系统，覆盖：

| # | 场景 | 期望输出 |
|---|------|------|
| 1 | `colyn 0`，主目录存在 | 控制消息含 `targetDir` 为主目录 |
| 2 | `colyn N`，task-N 存在 | 控制消息含 `targetDir` 为 task-N 目录 |
| 3 | `colyn 9`，task-9 不存在 | stderr 含错误+列表，stdout 无控制消息，exit 1 |
| 4 | 不在 colyn 项目中 | stderr 错误，exit 1 |
| 5 | cwd 在 `task-1/a/b`，`colyn 2` 且 `task-2/a/b` 存在 | `targetDir` 带子路径 `a/b` |
| 6 | cwd 在 `task-1/a/b`，`task-2/a/b` 不存在 | 上溯到最深存在目录并打印回退提示 |
| 7 | cwd 在 worktree 根（rel 为空） | `targetDir` 等于目标根 |
| 8 | 执行模式，目标子目录不存在 | exit 1 且不 spawn |

`computeRelativeSubpath()` 与 `resolveDeepestExisting()` 另有独立的单元测试（含 `..` 越界安全回退）。

argv 预处理逻辑单独测试：

输入为完整 argv（含 `argv[0]`/`argv[1]`，如 `["node", "colyn", ...]`）：

| # | 输入 argv | 期望结果 |
|---|----------|------|
| 1 | `["node", "colyn", "1"]` | 重写为 `["node", "colyn", "switch", "1"]` |
| 2 | `["node", "colyn", "add"]` | 不重写 |
| 3 | `["node", "colyn", "1", "git", "push"]` | 重写为 `["node", "colyn", "switch", "1", "git", "push"]`（执行模式） |
| 4 | `["node", "colyn", "1", "--foo"]` | 不重写（选项保护） |
| 5 | `["node", "colyn", "--help"]` | 不重写 |
| 6 | `["node", "colyn", "12abc"]` | 不重写 |
| 7 | `["node", "colyn", "1", "git", "push", "-f"]` | 重写为 `["node", "colyn", "switch", "1", "git", "push", "-f"]`（`-f` 作为命令参数） |
| 8 | `["node", "colyn", "0", "npm", "run", "build"]` | 重写为 `["node", "colyn", "switch", "0", "npm", "run", "build"]`（执行模式） |

## 兼容性

- 纯加法，不影响任何现有命令
- 配置文件结构无变化，不涉及 migration（参考"配置文件修改规范"）

## 与其他命令的关系

| 命令 | 用途 | 与 switch 的关系 |
|------|------|---------------|
| `colyn add` | 创建新 worktree | 创建后通常自动 cd，是 switch 的"创建路径" |
| `colyn list` | 列出 worktree | 提供 ID 信息，方便用户知道该输入哪个数字 |
| `colyn info` | 查看当前 worktree 详情 | 不重叠 |
| `colyn checkout` | 复用 worktree 切换分支 | 操作"分支"维度，switch 操作"位置"维度 |
| `colyn remove` | 删除 worktree | switch 后不应再切到已删除的 ID |
