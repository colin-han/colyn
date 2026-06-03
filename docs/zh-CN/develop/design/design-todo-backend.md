# Todo Backend 设计文档

**创建时间**：2026-06-02
**状态**：✅ 已实现

---

## 1. 概述

Colyn 的 Todo 功能原先将所有任务存储在本地 JSON 文件（`.colyn/todo.json` 与 `.colyn/archived-todo.json`）中。本设计将 Todo 的存储抽象为可插拔的 **Todo backend**，允许将任务数据存储到不同的后端系统（如 GitHub Issues）。

核心设计原则：

- **统一接口**：不存在"本地 vs IMS"的二元对立，本地存储被重构为内置的默认 backend（`local`），GitHub Issues 作为另一个实现（`github`）。
- **单一 active backend**：任意时刻只有一个 active backend，由 `.colyn/settings.json` 的 `todo.backend` 字段指定，默认为 `local`。
- **消费方透明**：`todo`、`checkout`、`add` 等命令只依赖 `TodoBackend` 接口，不感知具体实现。

---

## 2. 架构

```
                  ┌─────────────────────────────────────┐
  消费方           │  todo.ts   checkout.ts   add.ts      │
  (现有命令)       └──────────────────┬──────────────────┘
                                     │ 只依赖接口
                          ┌──────────▼───────────┐
                          │  TodoBackend (接口)   │
                          │  registry / 工厂      │
                          └──────────┬───────────┘
                       ┌─────────────┴──────────────┐
            ┌──────────▼─────────┐      ┌────────────▼───────────┐
            │ LocalFileBackend   │      │ GitHubIssuesBackend     │
            │ (默认, todo.json)   │      │ (gh CLI)                │
            └────────────────────┘      └─────────────────────────┘
```

### 2.1 文件结构

| 文件 | 职责 |
|------|------|
| `src/types/todo-backend.ts` | `TodoBackend` 接口与 `TodoBackendProvider` 接口定义 |
| `src/todo-backends/local.ts` | 本地默认实现（读写 `todo.json`，含读时归一化） |
| `src/todo-backends/github.ts` | GitHub Issues 实现（通过 gh CLI） |
| `src/todo-backends/registry.ts` | Provider 注册、工厂函数 `getActiveTodoBackend()` |

这套体系与现有 `ToolchainPlugin` 体系**完全独立**（职责不同），不复用 `PluginManager`。

---

## 3. 数据模型与状态机

### 3.1 TodoItem

```typescript
interface TodoItem {
  type: string;        // 对 github = label
  name: string;        // 对 github = issue 号（backend 回填）
  message: string;     // 首行 = title，其余 = body（markdown）
  status: TodoStatus;
  createdAt: string;
  startedAt?: string;
  branch?: string;
}

type TodoStatus = 'pending' | 'in-progress' | 'done';
// archived 项对 local 存于 archived-todo.json（ArchivedTodoItem 加 archivedAt 字段）
```

### 3.2 4 态状态机

```
  add        start/co/add      complete                 archive
∅ ──► pending ──────► in-progress ──────► done ──────────────────► archived
                          ▲                  │
                          └──────────────────┘
                              uncomplete
```

| 命令 | 状态转换 | 说明 |
|------|---------|------|
| `todo add` | ∅ → pending | 新建待办 |
| `todo start` / `co` 选中 / `add` 选中 | pending → in-progress | 建立对应分支 |
| `todo complete` | in-progress → done | 标记真正完成 |
| `todo uncomplete` | done → in-progress | 撤销完成 |
| `todo archive` | done → archived | 批量归档已完成项 |
| `todo remove` | 任意 → 删除 | |
| `todo edit` | — | 修改 message |

### 3.3 autoArchive

`todo.autoArchive`（布尔，默认 `false`）：开启后，`complete` 把 todo 标记为 done 时自动级联归档（done → archived 一步到位），无需手动 `todo archive`。

---

## 4. TodoBackend 接口

```typescript
interface TodoBackend {
  name: string;              // 'local' | 'github'
  displayName: string;
  assignsName: boolean;      // IMS=true（回填 issue 号），local=false

  list(filter: 'pending' | 'in-progress' | 'done' | 'archived'): Promise<TodoItem[]>;
  find(type: string, name: string): Promise<TodoItem | null>;

  add(input: { type: string; message: string; name?: string }): Promise<TodoItem>;
  markStarted(type: string, name: string, branch: string): Promise<void>; // → in-progress
  markDone(type: string, name: string): Promise<void>;                    // → done
  reopen(type: string, name: string): Promise<void>;                      // done → in-progress
  edit(type: string, name: string, message: string): Promise<void>;
  remove(type: string, name: string): Promise<void>;
  archive(): Promise<void>;                                               // done → archived（批量）
}
```

设计要点：

1. 接口对外暴露 **colyn 语义动作**（`markStarted`/`markDone`/`reopen`/`archive`），不暴露 open/closed/label 等 IMS 内部细节——映射差异封装在各 backend 内。
2. `assignsName` 控制 `colyn todo add` 的交互分叉（见第 6 节）。
3. `list`/`find` 在 github backend 中需要 git 分支信息来区分 pending/in-progress，由 backend 内部调用 git 获取。

---

## 5. TodoBackendProvider 接口（检测 + 初始化生命周期）

detect/setup 在「尚未配置、尚无实例」时就要运行（init/repair 阶段），因此将**发现与初始化**与**运行时操作**分为两层，对齐 toolchain 的 `detect`/`repairSettings` 模式。

```typescript
export interface TodoBackendDetectContext {
  projectRoot: string;
  mainDirPath: string;       // 主分支目录（git repo，含 origin）
  nonInteractive: boolean;
}

export interface TodoBackendProvider {
  name: string;              // 'local' | 'github'
  displayName: string;
  /** 当前项目是否可用此 backend */
  detect(ctx: TodoBackendDetectContext): Promise<boolean>;
  /** 前置检查 + 安装帮助 + 登录提示；幂等；可交互；失败抛错 */
  setup(ctx: TodoBackendDetectContext): Promise<void>;
  /** 用配置 + 路径创建运行时 backend 实例 */
  create(paths: ProjectPaths, config: TodoConfig): TodoBackend;
}
```

### 5.1 Provider 行为对比

| | local provider | github provider |
|---|---|---|
| detect | 永远返回 true | `mainDirPath` 的 git `origin` URL 含 `github.com` |
| setup | no-op | 见下节 |
| create | `LocalFileBackend` | `GitHubIssuesBackend(config.github)` |

### 5.2 github provider setup 语义

唯一**硬失败**条件是 **gh 未安装**；**未登录不算失败**（仅打印提示）。

**交互式**：

1. `which gh`：已装则继续；未装时在 macOS 上检测到 `brew` 则询问是否 `brew install gh`（同意则执行安装）；其他平台或无 brew 则打印安装指引 URL；复检仍缺 → **抛错（setup 失败）**。
2. `gh auth status`：已登录则继续；未登录则打印提示「请运行 `gh auth login`」，**不算失败**。

**非交互式（快速失败）**：`which gh` 未装 → **抛错**；未登录**不抛错**（仅校验可执行文件存在性）。

### 5.3 Registry

`registry.ts` 持有所有 provider，并暴露：

- `getProvider(name)` — 按名称获取 provider
- `detectProviders(ctx)` — 返回 `detect()` 为 true 的 provider 列表
- `getActiveTodoBackend(paths)` — 按 `config.backend` 找 provider，调用 `provider.create()`，并包裹 autoArchive 装饰

---

## 6. 配置

```jsonc
// .colyn/settings.json
{
  "todo": {
    "backend": "local",         // 'local' | 'github'，默认 'local'
    "autoArchive": false,       // 默认 false
    "github": {
      "archivedLabel": null,    // 可选；未配置时 done 即 archived（见第 7.3 节）
      "typeLabels": {}          // 可选；colyn type ↔ GitHub label 映射（见第 7.5 节）
    }
  }
}
```

所有字段均为可选并有默认值，向后兼容。repo 信息不存入配置，从 `gh repo view --json nameWithOwner` 推断（符合最小配置原则）。

---

## 7. GitHub Backend

### 7.1 状态映射

| colyn 语义态 | 默认（无 archivedLabel） | 配置了 archivedLabel |
|------------|------------------------|---------------------|
| pending | open，无对应分支 | open，无对应分支 |
| in-progress | open，有对应分支（git 推断）| open，有对应分支 |
| done | closed（与 archived 折叠）| closed，无该 label |
| archived | closed（与 done 折叠）| closed + 该 label |

pending 与 in-progress 的区分：open issue 是否存在对应分支（本地或远端，git 推断）。无分支 = pending，有分支 = in-progress。

### 7.2 gh 命令映射

| 操作 | gh 命令 |
|------|---------|
| list pending/in-progress | `gh issue list --state open --json number,title,body,labels` + 读 git 分支区分 |
| list done/archived | `gh issue list --state closed --json number,title,body,labels`（按 archivedLabel 过滤；排除 wontfix 标签）|
| add | `gh issue create --title <line1> --body <rest> --label <mappedLabel>` → 解析返回 issue 号回填 name |
| markStarted | IMS 侧近乎 no-op（in-progress 靠分支推断）|
| markDone | `gh issue close <n>` |
| reopen | `gh issue reopen <n>` |
| archive | 给 closed issue 加 archivedLabel（未配置则 no-op）|
| edit | `gh issue edit <n> --title/--body/--add-label` |
| remove | `gh issue close <n>` + 加 `wontfix` label（非破坏性；list 时过滤掉带 wontfix 的 issue）|
| repo 推断 | `gh repo view --json nameWithOwner` |

### 7.3 archivedLabel 折叠模式

`todo.github.archivedLabel` 未配置（默认）时：不引入任何管理 label，**所有 closed issue 即视为 archived**，即 done 与 archived 折叠为同一态：

- `list('done')` 返回空
- `list('archived')` = 全部 closed issue（排除 wontfix）

配置了 archivedLabel 后才区分：

- `done` = closed 且无该 label
- `archived` = closed + 该 label

### 7.4 错误处理

gh 未安装、未登录、当前目录非 GitHub repo 时，`GitHubIssuesBackend` 抛 `ColynError`，并通过 i18n 给出友好提示（引导安装/登录 gh 或检查 remote）。

### 7.5 type ↔ label 映射

`todo.github.typeLabels` 配置 colyn `type` 与 GitHub label 名的对应关系：

```jsonc
"typeLabels": {
  "feature": "enhancement",
  "bug": "bug",
  "chore": "maintenance"
}
```

- **未配置时**：按同名处理（type 名即 label 名），保持零配置可用。
- **写方向（add/edit）**：colyn `type` → 经映射得到 `mappedLabel`，作为 `--label` 的值；映射表无此 type 时回退用 type 原名。
- **读方向（list/find）**：从映射表构建反向表 `label → type`；issue 可能带多个 label，取第一个命中映射表的 label 还原为 `type`；都不命中时用 label 原名作为 type。
- 状态管理 label（archivedLabel、wontfix）不参与 type 还原。

---

## 8. 消费方改造

### 8.1 通用

`checkout.ts`、`add.ts`、`todo.ts` 中所有对 `readTodoFile`/`saveTodoFile`/`readArchivedTodoFile`/`saveArchivedTodoFile`/`findTodo` 的直接调用，替换为通过 `getActiveTodoBackend()` 拿到的接口调用。业务流程与交互保持不变。

### 8.2 `colyn todo add` 按 assignsName 分叉

- `assignsName=false`（local）：维持现状——用户选 type、输入 name、写 message。
- `assignsName=true`（github）：用户只选 type（label）、写 message（首行 = title，其余 = body）；`add()` 内部 `gh issue create` 后回填 `name` = issue 号，Todo ID 形如 `feature/42`。

### 8.3 `colyn todo list` 过滤标志

- 默认：显示 pending。
- `--in-progress`、`--done`、`--archived`、`--all`。
- `--completed` 改名为 `--done`（不保留别名）。

### 8.4 remove 语义差异

- local：从存储中真正删除该 todo。
- github：`gh issue close` + 加 `wontfix` label，从所有 colyn 列表中过滤掉（非破坏性、可在 GitHub 侧恢复）。

---

## 9. init / repair 接入

### 9.1 init

新增 `detectAndConfigureTodoBackend(projectRoot, mainDirPath, nonInteractive)`：

1. 对所有 provider 运行 `detect()` → 可用列表（local 必在内）。
2. 可用列表 **> 1** → Enquirer select 让用户选择一个；否则默认 local，不打扰用户。
3. **先** `provider.setup(ctx)` 成功，**再写** `settings.todo.backend`。
4. setup 抛错（交互式：gh 装不上）→ 提示错误、**不写** backend（保留默认 local）、init 其余步骤正常完成。

### 9.2 repair

读取 `config.backend` → `getProvider(name).setup(ctx)`。setup 抛错 → 捕获并 warn（不崩溃）。**不自动回退 local**（目标是帮助修好环境）。

### 9.3 命令运行时

`todo`/`co`/`add` 等运行时**不主动 setup**，遇到 gh 未安装/未登录/非 github repo 时抛 `ColynError` 给出友好提示。

---

## 10. Migration 策略

### 10.1 settings.json

新增 `todo.*` 字段全为可选且有默认值，向后兼容，**无需 settings.json migration**。

### 10.2 todo.json 数据（读时归一化）

`todo.json` 无独立版本机制，不走 settings migration，改为在 `LocalFileBackend` **读取时**做一次性值映射，并在保存时落盘修正。

旧 `status: 'completed'` 的映射规则：

| 条件 | 映射结果 |
|------|---------|
| 旧 `status === 'completed'` 且本地分支仍存在 | `'in-progress'` |
| 旧 `status === 'completed'` 且本地分支不存在（已合并/删除）| `'done'` |
| 缺失 `branch` 字段 | `'done'` |

特点：幂等（再次读取已是 in-progress/done，不再变更）；`archived-todo.json` 不受影响；逻辑集中在 `LocalFileBackend` 反序列化处，避免散落。

---

## 11. 边界与非目标

- **非目标**：本地与 IMS 双向同步、离线写 IMS、多 backend 同时激活、GitHub 之外的 IMS（如 Jira/GitLab，留待后续 backend）。
- **边界**：github backend 每次读取走 gh（网络）；本版不做缓存。
- **边界**：in-progress 依赖 git 分支存在；跨设备或远端分支被清理后判定可能不准（已知取舍，符合最小配置原则）。

---

## 12. 相关文档

- [术语表](../glossary.md)
- [配置迁移设计](design-config-migration.md)
- [Plugin Toolchain 设计](design-plugin-toolchain.md)
- [用户手册：Todo 命令](../../manual/04-command-reference/todo.md)
