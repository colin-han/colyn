# 运行时配置同步设计文档

**状态**：📋 设计中（待实现）
**创建时间**：2026-09-09
**相关命令**：`colyn add`、`colyn update`、`colyn merge`（`colyn release` 经复用间接受益）

---

## 1. 背景与目标

### 1.1 现状问题

Colyn 在创建 worktree 时会复制主分支的运行时配置（npm/pip 项目的 `.env.local`、maven/gradle 项目的 `application-local.properties`）并改写 `PORT` / `WORKTREE`。但在此之后，两侧的运行时配置**各自漂移、不再同步**：

- **主分支 → worktree**：用户在主分支修改了 `.env.local`（新增 API key、改配置值）后执行 `colyn update`，代码被 rebase/merge 更新，但配置文件仍是创建时的快照，worktree 缺少新配置导致功能异常。
- **worktree → 主分支**：在 worktree 中开发时（尤其是 AI 辅助开发）往 `.env.local` 添加了新变量，`colyn merge` 合并代码回主分支后，主分支缺少这些配置，dev server 起不来。

### 1.2 设计目标

在 worktree 生命周期的关键节点自动双向同步运行时配置：

- ✅ `add`：创建时复制（现有行为，即初始同步，保持不变）
- ✅ `update`（含 `merge` 后置 `--update` 环节、`release` 复用的 `executeUpdate`）：主分支 → worktree
- ✅ `merge`：合并成功后 worktree → 主分支，带回新增配置
- ✅ 覆盖所有工具链：走插件体系，`.env.local` 与 `application-local.properties` 一视同仁
- ✅ 保守安全：永不覆盖既有值、永不删除 key，冲突提示人工处理

### 1.3 术语

**运行时配置同步（Runtime Config Sync）**：在主分支目录与 worktree 目录之间同步运行时配置文件（由工具链插件定义，如 `.env.local`、`application-local.properties`）的机制。已录入 `docs/zh-CN/develop/glossary.md`。

---

## 2. 核心设计原则

> **同步只"补充缺失的 key"，永不覆盖既有值、永不删除 key；值冲突时跳过该 key 并提示人工处理。**

理由：

- 运行时配置不入 git，没有历史可做三方合并，任何"覆盖"都可能静默丢失用户数据
- 保守语义简单、可预测、易文档化："新增的 key 会传播，既有 key 的值由所属侧维护"
- 值冲突意味着两侧有意分歧（如 worktree 里临时指向 mock 服务），由人决定取舍

---

## 3. 同步算法

### 3.1 身份键（Identity Keys）

每个 worktree 的运行时配置中有两个 key 是其**身份标识**，两侧天然不同，**永远不参与同步、不算差异**：

| 身份键 | worktree 侧值 | 主分支侧值 |
|--------|--------------|-----------|
| `portKey` | `basePort + worktreeId` | `basePort` |
| `WORKTREE` | `worktreeId`（如 `1`） | `main` |

`portKey` 来自 `pluginManager.getPortConfig()`：npm/pip 为 `PORT`，maven/gradle 为 `server.port`（沿用 add 命令现有约定，见 `src/commands/add.ts` 的配置写入逻辑）。

### 3.2 diff 规则

**方向一：主分支 → worktree**（`update` 时，含 `merge` 后置 `--update` 环节）：

| 情况 | 动作 |
|------|------|
| 身份键 | 永远保留 worktree 侧的值 |
| 主分支有、worktree 无 | ✅ 新增到 worktree |
| 两边都有、值相同 | 不动 |
| 两边都有、**值不同** | ⚠️ 跳过，列入差异提示 |
| worktree 有、主分支无 | 保留不动（等 `merge` 时带回主分支） |

**方向二：worktree → 主分支**（`merge` 合并成功后）：

| 情况 | 动作 |
|------|------|
| 身份键 | 排除（主分支 `PORT` 是 base port、`WORKTREE=main`，同步它们没有意义） |
| worktree 有、主分支无 | ✅ 新增到主分支 |
| 两边都有、值相同 | 不动 |
| 两边都有、**值不同** | ⚠️ 跳过，列入差异提示（主分支是权威，由人决定） |
| 主分支有、worktree 无 | 不动 |

### 3.3 写入方式

- 读出目标侧完整 key-value map → 合入新增 key → 调用 `writeRuntimeConfig` 整体写回
- npm 插件的 `writeRuntimeConfig` 本身逐行保留注释，注释不丢失
- 因"永不删除"，目标侧原有 key 全部保留

### 3.4 文件缺失的处理

| 场景 | 行为 |
|------|------|
| worktree 侧配置文件不存在（主→worktree 方向） | 退化为**重建**：复制主分支全部 key + 重算身份键（`PORT = basePort + id`、`WORKTREE = id`；`basePort` 取自主分支配置的 `portKey` 值）——与 `add`、`repair` 的现有行为一致 |
| 主分支侧配置文件不存在（worktree→主方向） | 跳过反向同步并提示（不替主分支创建文件） |

---

## 4. 触发点与命令集成

### 4.1 触发点总览

| 命令 | 挂点 | 方向 |
|------|------|------|
| `colyn add` | **现状即初始同步**（创建时复制主分支配置），行为不变，无需改动 | 主→worktree |
| `colyn update`（单个/批量） | rebase/merge 成功后（`updateSingleWorktree` / `updateAllWorktrees` 内） | 主→worktree |
| `colyn merge` | `mergeWorktreeIntoMain` 成功后**先**做 worktree→主；`--update` 环节（默认开）**随后**执行，其他 worktree 顺带拿到刚带回主分支的新 key | worktree→主，再主→其他 |
| `colyn release` | 复用 `executeUpdate`，自动获得同步能力，无需单独处理 | 主→worktree |

时序说明（merge）：

```
merge 合并成功
  → ① 反向同步：worktree → 主（带回新增 key）
  → ② --update 环节（默认开）：主 → 其他 worktree（新 key 立即传播）
```

### 4.2 多工具链与 Mono Repo

- 同步在 `resolveToolchains` 返回的每个 `ToolchainContext` 上独立执行，两侧路径拼接方式与 `add` 一致（`ctx.subPath` 非 `.` 时拼接子目录）
- **无工具链回退**：`resolveToolchains` 返回空、但主分支存在 `.env.local` 时，复用 `src/core/env.ts` 的读写函数做同样 diff（身份键按 `PORT` / `WORKTREE`），与 `add` 的回退路径（`configureWorktreeEnv`）对齐

### 4.3 失败语义

- git rebase/merge 失败或冲突 → **不执行同步**（同步只挂在成功路径上）
- 同步自身读写异常 → 输出警告、**不改变命令退出状态**（git 操作已完成，不可回滚），批量模式继续处理下一个 worktree

---

## 5. 架构设计

### 5.1 模块结构（方案 A：核心模块 + 薄命令层）

```
src/core/runtime-config-sync.ts    # 新增：diff 纯函数 + 同步编排
src/commands/update.helpers.ts     # 挂点：更新成功后调用
src/commands/merge.ts              # 挂点：合并成功后调用（反向）
```

### 5.2 接口定义

```typescript
// src/core/runtime-config-sync.ts

export type SyncDirection = 'main-to-worktree' | 'worktree-to-main';

/** 冲突项：key 与两侧值，供提示输出 */
export interface ConfigConflict {
  key: string;
  mainValue: string;
  worktreeValue: string;
}

/** 同步结果：供命令层输出提示 */
export interface SyncResult {
  /** 本次新增到目标侧的 key（按插入顺序） */
  addedKeys: string[];
  /** 值不同被跳过的 key */
  conflicts: ConfigConflict[];
  /** worktree 侧文件原本不存在，本次为重建 */
  rebuilt: boolean;
}

/**
 * 纯函数：计算两个配置 map 的同步 diff（不触碰文件系统）
 *
 * 身份键（identityKeys）在两个方向上都被排除，不进入 toAdd / conflicts。
 */
export function diffRuntimeConfig(
  mainConfig: Record<string, string>,
  worktreeConfig: Record<string, string>,
  direction: SyncDirection,
  identityKeys: string[]
): { toAdd: Record<string, string>; conflicts: ConfigConflict[] };

/**
 * 编排：读 → diff → 写，返回结果供命令层提示。
 * 返回 null 表示跳过（如主分支侧配置文件不存在）。
 *
 * 有 ctx（工具链上下文）时走 pluginManager 的 read/writeRuntimeConfig；
 * 无 ctx 时走 .env.local 回退（src/core/env.ts）。
 * 重建场景（worktree 侧文件缺失）按 basePort + worktreeId 重算身份键。
 */
export async function syncRuntimeConfig(params: {
  mainDir: string;          // 主分支侧目录（Mono Repo 时已含 subPath）
  worktreePath: string;     // worktree 侧目录（Mono Repo 时已含 subPath）
  direction: SyncDirection;
  worktreeId: number;       // 重建时重算身份键用
  identityKeys: string[];   // 如 ['PORT', 'WORKTREE']
  ctx?: ToolchainContext;   // 工具链上下文；缺省走 .env.local 回退
}): Promise<SyncResult | null>;
```

设计原则：

1. **diff 是纯函数**：冲突语义可被充分单测，不 mock 文件系统
2. **PluginManager 不动**：保持"插件转发层"定位（`runInstall`/`runLint` 均为纯转发），diff 策略是 colyn 核心业务逻辑
3. **命令层薄**：三处挂点各传参数、拿结果、输出提示

---

## 6. CLI 选项与配置

### 6.1 命令选项

| 命令 | 新增选项 | 默认 |
|------|---------|------|
| `colyn update` | `--sync-config` / `--no-sync-config` | 开启 |
| `colyn merge` | `--sync-config` / `--no-sync-config` | 开启 |
| `colyn add` | 不加（创建时复制是既有行为） | — |

选项含义：是否在命令执行时同步运行时配置（含 merge 的反向同步与其后 `--update` 环节中的同步）。

### 6.2 settings.json 默认值

```jsonc
{
  "commands": {
    "update": { "syncConfig": true },
    "merge": { "syncConfig": true }
  }
}
```

- 走现有三态解析（`applyCommandDefaults`）：CLI 显式 > settings（含 `branchOverrides`）> 内置默认（true）
- **Migration 判断**：`CommandsConfigSchema` 仅添加可选 boolean 字段（有默认值），按项目规范属于"不需要 Migration"的情况，`CURRENT_CONFIG_VERSION` 保持 4

---

## 7. 输出与 i18n

### 7.1 输出策略

**有实际操作（新增/冲突/重建）才输出，无变化时静默**——避免 `colyn update`（默认全量）刷屏；`-v` / `--verbose` 可查看详情。

**update（主→worktree）示例**：

```
✔ 运行时配置已同步：新增 2 项 (API_KEY, BASE_URL)
⚠ 1 项配置与主分支不同，已跳过：DATABASE_URL
```

**merge（worktree→主）示例**：

```
✔ 已带回 1 项新配置到主分支：OPENAI_API_KEY
⚠ 1 项配置与主分支不同，已跳过：DATABASE_URL
```

**批量模式**：每个 worktree 一行结果，冲突 key 列入各自的警告行；不逐条展开。

### 7.2 i18n key

`src/i18n/locales/zh-CN.ts` 与 `en.ts` 同步添加（key 结构 `commands.<cmd>.<name>`）：

```typescript
// commands.update / commands.merge 共用结构，按命令分组
syncConfigOption: '更新时同步运行时配置（默认开启）',
syncConfigAdded: '运行时配置已同步：新增 {{count}} 项 ({{keys}})',
syncConfigBroughtBack: '已带回 {{count}} 项新配置到主分支：{{keys}}',
syncConfigConflict: '{{count}} 项配置两侧值不同，已跳过：{{keys}}',
syncConfigRebuilt: 'worktree 运行时配置缺失，已从主分支重建',
syncConfigMainMissing: '主分支运行时配置文件不存在，跳过同步',
syncConfigError: '运行时配置同步失败：{{error}}',
```

---

## 8. 测试策略

| 层级 | 内容 |
|------|------|
| `diffRuntimeConfig` 单测 | 双向新增传播、身份键排除（不进 toAdd 也不进 conflicts）、值冲突跳过、空 map、一侧为空对象、key 顺序 |
| `syncRuntimeConfig` 编排测试 | mock `pluginManager`：正常同步、重建路径（worktree 文件缺失 + 身份键重算）、返回 null（主分支文件缺失）、回退路径（无 ctx 走 `.env.local`） |
| `update` 命令层 | 同步在 git 成功后触发、git 失败不同步、`--no-sync-config` 生效、批量部分失败不阻断其他 worktree 的同步 |
| `merge` 命令层 | 反向同步在 `mergeWorktreeIntoMain` 成功后触发、先反向后 `--update` 的时序 |
| 手动验证 | `LANG=zh_CN.UTF-8` / `LANG=en_US.UTF-8` 双语言输出 |

---

## 9. 范围外

以下明确不在本期范围内：

- ❌ 值冲突的交互式解决（弹选择界面决定取哪侧）
- ❌ 快照式三方合并（记录上次同步状态以区分"谁改的"）
- ❌ 同步任意自定义文件列表（如 `settings.syncFiles` 配置）
- ❌ `remove` / `checkout` / `switch` 命令的同步（无同步语义或已有相应行为）
- ❌ key 删除的传播（主分支删除 key 不会传播到 worktree）

---

## 10. 验收标准

### 10.1 功能

- [ ] `colyn update` 后：主分支新增 key 出现在 worktree；身份键（`PORT`/`WORKTREE` 或 `server.port`/`WORKTREE`）保持 worktree 侧原值
- [ ] 值不同的 key 被跳过，输出差异提示
- [ ] `colyn merge` 后：worktree 新增 key 出现在主分支运行时配置
- [ ] `merge --update` 环节：其他 worktree 拿到刚带回主分支的新 key
- [ ] worktree 侧配置文件缺失时按主分支重建并重算身份键
- [ ] maven/gradle 项目（`application-local.properties`）与 npm/pip 项目（`.env.local`）行为一致
- [ ] Mono Repo 各子项目独立同步

### 10.2 开关与安全

- [ ] `--no-sync-config` 完全关闭同步；settings 默认值经三态解析生效
- [ ] 同步永不覆盖既有值、永不删除 key
- [ ] 同步失败不改变命令退出状态，批量继续
- [ ] `.env.local` 仍被 git 脏检查排除（现有 `IGNORED_STATUS_BASENAMES` 机制不被破坏）

### 10.3 质量

- [ ] 双语文案（zh-CN / en）齐全，无硬编码文本
- [ ] `volta run yarn lint` 0 errors
- [ ] 不使用 `any` 类型

---

## 11. 关键设计决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 冲突语义 | 补充缺失、永不覆盖、永不删除 | 运行时配置无 git 历史，覆盖即可能丢数据；保守语义可预测 |
| 值冲突处理 | 跳过 + 输出差异提示 | 用户选择；不丢数据也不误覆盖 |
| 同步方向 | 双向（update 主→worktree；merge worktree→主） | 覆盖两类真实漂移场景 |
| 功能范围 | 运行时配置同步（插件体系）而非仅 `.env.local` | 插件已把格式抽象为 key-value，diff 格式无关，Java 项目零成本受益 |
| 架构放置 | 新建 `src/core/runtime-config-sync.ts`（纯函数 + 编排） | 符合 core 服务层 + 薄命令层分层；PluginManager 保持纯转发定位；diff 纯函数易测 |
| merge 时序 | 反向同步先于 `--update` 环节 | 刚带回主分支的新 key 能立即传播到其他 worktree |
| 无变化输出 | 静默 | `update` 默认全量，避免刷屏 |
| 配置 Migration | 不需要（仅添加可选字段） | 按项目规范，可选字段向后兼容 |
| add 命令 | 不改动 | 创建时复制即初始同步，worktree 尚不存在无冲突可能 |
