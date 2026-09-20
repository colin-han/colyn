# 未跟踪文件同步设计文档

**状态**：✅ 已实现
**创建时间**：2026-09-18
**相关命令**：`colyn add`、`colyn update`、`colyn merge`、`colyn repair`
**前置设计**：[运行时配置同步](design-runtime-config-sync.md)（本文档承接其 §9 中"同步任意自定义文件列表"的范围扩展）

---

## 1. 背景与目标

### 1.1 现状问题

运行时配置同步（v3.5）解决了 `.env.local` / `application-local.properties` 这类 key-value 文件的双向同步。但实际项目中还有**其他不入 git 的本地文件**同样存在两侧漂移问题：

- 种子数据（`data/seed.json`）、本地证书（`certs/local.pem`）、本地化的 mock 数据等
- 主分支新增了这类文件后 `colyn update`，worktree 拿不到
- worktree 中生成的本地文件 `colyn merge` 后，主分支缺失

这些文件不是 key-value 格式，无法走运行时配置的 diff 算法，需要一套独立的同步机制。

### 1.2 设计目标

- ✅ 用户可通过配置清单**显式选择**哪些文件参与同步（支持通配符）
- ✅ 同步时机与运行时配置同步**完全一致**（add / update / merge / repair），用户心智模型统一
- ✅ 每次同步的输出包含**同步的文件列表**（复制 / 冲突 / 跳过分组）
- ✅ 冲突处理**保守且零学习成本**：内容不同即报错提示，不覆盖、不合并，由人工处理

### 1.3 术语

**未跟踪文件同步（Untracked File Sync）**：在主分支目录与 worktree 目录之间，按用户配置的 `syncFiles` 清单同步被 git 忽略/未跟踪的本地文件的机制。已录入 `docs/zh-CN/develop/glossary.md`。

---

## 2. 核心设计原则

> **同步只"复制缺失的文件"，永不覆盖既有内容、永不删除文件；两侧内容不同（冲突）时报错提示，由人工处理。**

与运行时配置同步的"只补缺失 key、永不覆盖"哲学同构，只是粒度从 key 变为整文件：

- 未跟踪文件不入 git，没有历史可做三方合并，任何"覆盖"都可能静默丢失用户数据
- 保守语义简单、可预测："缺失的文件会复制过来，两侧都有且不同时 colyn 停手并告诉你"
- 冲突意味着两侧有意分歧，由人决定取舍（手动 `diff` 对比后 `cp`）

---

## 3. 同步算法

### 3.1 文件清单解析

同步开始前，先解析 `syncFiles` 配置得到**候选文件集合**：

1. **通配符展开**：清单中的模式与**源侧目录**下的文件做匹配（按方向确定，见 §3.2：`update` / `repair` 方向枚举主分支目录，`merge` 反向枚举 worktree 目录；已跟踪检查固定在主分支目录执行，两目录属同一 git 仓库），风格与 `branchOverrides` 一致（`*` 匹配单段、`**` 跨目录段）。模式仅匹配文件，不匹配目录本身。
2. **排除规则**（命中的文件被跳过并警告）：

| 排除条件 | 判断方式 | 理由 |
|----------|---------|------|
| 已跟踪文件 | `git ls-files --error-unmatch <path>` 成功 | git 已管理的文件由 git 同步，colyn 不掺和 |
| 运行时配置文件 | 文件名匹配任一激活插件的 `getRuntimeConfigFileName()` 返回值 | 已由运行时配置同步以 key-value 语义处理；若走本机制，`PORT` / `WORKTREE` 身份键会被整文件覆盖破坏 |

3. 解析结果为相对路径列表（相对主分支目录），并记录每个被排除文件的警告信息。

### 3.2 diff 规则

**方向一：主分支 → worktree**（`update` / `repair`，含 `merge` 后置 `--update` 环节）：

| 情况 | 动作 |
|------|------|
| 主分支有、worktree 无 | ✅ 复制到 worktree（保留文件权限位），列入「复制」清单 |
| 两边都有、内容相同（字节级比较） | 不动，静默 |
| 两边都有、**内容不同** | ⚠️ **冲突：报错提示**（不覆盖、不合并），列出两侧路径与最后修改时间 |
| 主分支无、worktree 有 | 不动（等 `merge` 时带回主分支） |

**方向二：worktree → 主分支**（`merge` 合并成功后）：

| 情况 | 动作 |
|------|------|
| worktree 有、主分支无 | ✅ 复制到主分支，列入「复制」清单 |
| 两边都有、内容相同 | 不动，静默 |
| 两边都有、**内容不同** | ⚠️ **冲突：报错提示**，主分支是权威，由人决定取舍 |
| 主分支有、worktree 无 | 不动（**永不传播删除**） |

### 3.3 冲突的呈现

冲突文件**不会被写入任何内容**，以 `outputError` 级别输出：

```
✗ 2 个文件两侧内容不同，已跳过，请人工处理：
  data/seed.json：主分支(2026-09-18 10:02) / task-1(2026-09-17 18:30)
  certs/local.pem：主分支(2026-09-10 09:00) / task-1(2026-09-16 14:12)
```

冲突报错不影响 git 主流程（同步只挂在 git 操作成功之后），也不改变命令退出状态（与现有同步失败语义一致：只警告不阻断，批量模式继续处理下一个 worktree）；但冲突文件会醒目呈现，且本次同步结果中明确标记存在未解决冲突。

---

## 4. 触发点与命令集成

### 4.1 触发点总览

| 命令 | 挂点 | 方向 |
|------|------|------|
| `colyn add` | 创建 worktree 时复制清单内文件（worktree 尚不存在，无冲突可能），复制后输出文件清单 | 主→worktree |
| `colyn update`（单个/批量） | rebase/merge 成功后，与 `syncWorktreeRuntimeConfigs` 并列 | 主→worktree |
| `colyn merge` | 合并成功后**先**做 worktree→主；`--update` 环节（默认开）**随后**执行，其他 worktree 顺带拿到刚带回主分支的新文件 | worktree→主，再主→其他 |
| `colyn repair` | 逐 worktree 重建缺失文件（主→worktree），与运行时配置同步并列 | 主→worktree |

时序说明（merge）：

```
merge 合并成功
  → ① 反向同步：worktree → 主（带回新文件）
  → ② --update 环节（默认开）：主 → 其他 worktree（新文件立即传播）
```

### 4.2 失败语义

- git rebase/merge 失败或冲突 → **不执行同步**（同步只挂在成功路径上）
- 同步自身读写异常 → 输出警告、**不改变命令退出状态**，批量模式继续处理下一个 worktree
- `syncFiles` 清单为空 → 功能整体不启用，零开销

---

## 5. 架构设计

### 5.1 模块结构

```
src/core/untracked-file-sync.ts    # 新增：清单解析 + diff 决策 + 同步编排
src/commands/add.helpers.ts        # 挂点：创建时复制
src/commands/update.helpers.ts     # 挂点：更新成功后调用
src/commands/merge.ts              # 挂点：合并成功后调用（反向）
src/commands/repair.helpers.ts     # 挂点：重建缺失文件
```

### 5.2 接口定义

```typescript
// src/core/untracked-file-sync.ts

export type UntrackedFileSyncDirection = 'main-to-worktree' | 'worktree-to-main';

/** 冲突项：文件与两侧修改时间，供提示输出 */
export interface UntrackedFileConflict {
  path: string;          // 相对路径
  sourceMtime: Date;
  targetMtime: Date;
}

/** 跳过项：文件与原因 */
export interface SkippedUntrackedFile {
  path: string;
  reason: 'tracked' | 'runtime-config' | 'source-missing';
}

/** 同步结果：供命令层输出提示 */
export interface UntrackedFileSyncResult {
  /** 本次复制到目标侧的文件（相对路径，按清单顺序） */
  copied: string[];
  /** 两侧内容不同被跳过的文件 */
  conflicts: UntrackedFileConflict[];
  /** 因排除规则或源缺失被跳过的文件 */
  skipped: SkippedUntrackedFile[];
}

/** 纯函数：根据两侧文件状态决策同步动作（不触碰文件系统） */
export function planUntrackedFileSync(
  files: Array<{ path: string; sourceExists: boolean; targetExists: boolean; contentEqual: boolean }>
): { toCopy: string[]; conflicts: string[]; sourceMissing: string[] };

/**
 * 编排：解析清单 → 读两侧状态 → 决策 → 复制，返回结果供命令层提示。
 * 返回 null 表示功能未启用（syncFiles 为空或解析后无候选文件）。
 */
export async function syncUntrackedFiles(params: {
  mainDir: string;
  worktreePath: string;
  direction: UntrackedFileSyncDirection;
  verbose: boolean;
}): Promise<UntrackedFileSyncResult | null>;
```

设计原则：

1. **决策是纯函数**：状态（存在性、内容是否相同）由 fs 层收集，决策表可被充分单测，不 mock 文件系统
2. **不经过插件体系**：本机制操作的是普通文件（非 key-value），格式无关，无工具链差异，直接放 core 层
3. **命令层薄**：四处挂点各传参数、拿结果、输出提示
4. **通配符转换复用现有风格**：与 `branchOverrides` 的模式转正则做法一致，不引入新依赖

---

## 6. CLI 选项与配置

### 6.1 settings.json

```jsonc
{
  // 顶层：同步文件清单（支持通配符，默认 []，即功能关闭）
  "syncFiles": [".env.*", "data/*.json", "certs/**"],

  // commands 节：开关型默认值（boolean，三态解析）
  "commands": {
    "update": { "syncFiles": true },
    "merge": { "syncFiles": true }
  }
}
```

命名说明：顶层 `syncFiles` 是**文件清单**（`string[]`），`commands.<cmd>.syncFiles` 是**开关**（`boolean`）——两者层级不同、类型不同，与 `syncConfig` 的开关命名风格对称。

### 6.2 命令选项

| 命令 | 新增选项 | 默认 |
|------|---------|------|
| `colyn update` | `--sync-files` / `--no-sync-files` | 开启 |
| `colyn merge` | `--sync-files` / `--no-sync-files` | 开启 |
| `colyn add` / `colyn repair` | 不加（创建/重建即本意） | — |

- 走现有三态解析（`applyCommandDefaults`）：CLI 显式 > settings（含 `branchOverrides`）> 内置默认（true）
- 开关仅在 `syncFiles` 清单非空时有实际行为
- **Migration 判断**：顶层与 commands 均仅添加可选字段（有默认值），按项目规范属于"不需要 Migration"的情况，`CURRENT_CONFIG_VERSION` 保持不变

---

## 7. 输出与 i18n

### 7.1 输出策略

**有实际操作（复制/冲突/跳过）才输出，无变化时静默**——与运行时配置同步一致；`-v` / `--verbose` 可查看详情。

**update（主→worktree）示例**：

```
✓ 未跟踪文件已同步：复制 2 个文件 (data/seed.json, .env.staging)
✗ 1 个文件两侧内容不同，已跳过，请人工处理：
  certs/local.pem：主分支(2026-09-10 09:00) / task-1(2026-09-16 14:12)
⚠ 跳过文件：.env.local（运行时配置文件，由运行时配置同步处理）
```

**merge（worktree→主）示例**：

```
✓ 已带回 2 个未跟踪文件到主分支：data/seed.json, .env.staging
```

`colyn add` 的初始复制与 `update` 复用同一 `copied` 文案（worktree 刚创建，清单内文件必然为复制，无冲突可能）。

**批量模式**：每个 worktree 输出各自的结果组。

### 7.2 i18n key

`src/i18n/locales/zh-CN.ts` 与 `en.ts` 同步添加，沿用运行时配置同步的组织方式（顶层节 + 各命令节的选项描述）：

```typescript
// 顶层 untrackedFileSync 节：同步提示文案（add / update / merge / repair 共用）
untrackedFileSync: {
  copied: '未跟踪文件已同步：复制 {{count}} 个文件 ({{files}})',
  broughtBack: '已带回 {{count}} 个未跟踪文件到主分支：{{files}}',
  conflict: '{{count}} 个文件两侧内容不同，已跳过，请人工处理：',
  conflictDetail: '{{file}}：{{sourceLabel}}({{sourceMtime}}) / {{targetLabel}}({{targetMtime}})',
  skipped: '跳过文件：{{file}}（{{reason}}）',
  skippedReasonTracked: '已被 git 跟踪，由 git 同步',
  skippedReasonRuntimeConfig: '运行时配置文件，由运行时配置同步处理',
  skippedReasonSourceMissing: '源侧不存在',
  error: '未跟踪文件同步失败：{{error}}',
  noChange: '未跟踪文件无变化',
  mainLabel: '主分支',
},

// 选项描述文案位于各命令节
commands.update.syncFilesOption: '同步主分支未跟踪文件（默认开启）',
commands.update.noSyncFilesOption: '跳过未跟踪文件同步',
commands.merge.syncFilesOption: '合并时同步未跟踪文件（默认开启）',
commands.merge.noSyncFilesOption: '跳过未跟踪文件同步',
```

---

## 8. 测试策略

| 层级 | 内容 |
|------|------|
| 清单解析单测 | 通配符展开（`*` / `**` / 精确路径）、排除已跟踪文件、排除运行时配置文件、清单为空返回 null |
| `planUntrackedFileSync` 单测 | 决策表全分支：目标缺失复制、内容相同不动、内容不同冲突、源缺失不动 |
| `syncUntrackedFiles` 编排测试 | 临时目录：复制保留权限位、冲突不写入、结果结构正确 |
| 命令层 | 同步在 git 成功后触发、git 失败不同步、`--no-sync-files` 生效、清单为空零行为 |
| 手动验证 | `COLYN_LANG=zh-CN` / `COLYN_LANG=en` 双语言输出 |

---

## 9. 范围外

以下明确不在本期范围内：

- ❌ 冲突的自动合并（三方合并 / `git merge-file` / 快照基线）
- ❌ 冲突的交互式解决（弹选择界面决定取哪侧）
- ❌ 按 mtime 自动裁决（新者胜）
- ❌ 同步历史的记录与追查（快照 git 仓库）
- ❌ 文件删除的传播（一侧删除不会传播到另一侧）
- ❌ `remove` / `checkout` / `switch` 命令的同步
- ❌ Mono Repo 子项目独立清单（清单按项目根相对路径统一匹配）

> 设计过程中曾评估"三方合并 + `.colyn` 内 git 历史仓库"方案（自动合并、可追查历史），因生命周期管理复杂度高、与保守哲学冲突而放弃，详见第 11 节决策记录。

---

## 10. 验收标准

### 10.1 功能

- [x] `syncFiles` 清单为空时功能完全关闭，无任何输出与开销
- [x] `colyn update` 后：主分支新增的清单内文件出现在 worktree
- [x] `colyn merge` 后：worktree 新增的清单内文件出现在主分支；`--update` 环节其他 worktree 拿到新文件
- [x] 两侧内容不同的文件不被覆盖，输出冲突提示（含两侧路径与修改时间）
- [x] 已跟踪文件与运行时配置文件被排除，输出警告
- [x] 复制保留文件权限位
- [x] `colyn repair` 重建 worktree 缺失的清单内文件

### 10.2 开关与安全

- [x] `--no-sync-files` 完全关闭同步；settings 默认值经三态解析生效
- [x] 同步永不覆盖既有内容、永不删除文件
- [x] 同步失败不改变命令退出状态，批量继续

### 10.3 质量

- [x] 双语文案（zh-CN / en）齐全，无硬编码文本
- [x] `volta run yarn lint` 0 errors
- [x] 不使用 `any` 类型

> 验收依据：单元测试（`untracked-file-sync.test.ts` 12 例、`update.helpers.test.ts` 挂点 2 例、`config.test.ts` schema 1 例，全量 16 文件 217 用例通过）+ 手动端到端验证 8/8 PASS（add 初始复制、update 正向复制、update 冲突不覆盖、merge 反向带回与 `--update` 联动、运行时配置文件排除、`--no-sync-files` 开关、双语切换、repair 重建）。

---

## 11. 关键设计决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 文件来源 | 显式配置清单（`syncFiles`）而非自动检测 | 用户要求可控可选；自动检测忽略文件容易误同步日志、构建产物、本地数据库 |
| 清单匹配 | 支持通配符（与 `branchOverrides` 风格一致） | 用户要求；复用现有模式转换实现，零新依赖 |
| 同步时机 | 与运行时配置同步完全同位（add / update / merge / repair） | 用户要求参考 .env.local 的时机；心智模型统一，实现上并列调用 |
| 冲突语义 | 内容不同即报错提示，不覆盖、不合并 | 用户选择（与 .env.local key 冲突"跳过+提示"同构）；未跟踪文件无 git 历史，覆盖即可能丢数据 |
| 曾评估：三方合并 + git 历史仓库 | 放弃 | 生命周期管理（损坏修复、并发锁）复杂度高；冲突标记虽符合 git 习惯但会写入文件，违背"永不写入"的保守原则；学习成本与配置成本不符合"非必要功能"的定位 |
| 排除运行时配置文件 | 文件名匹配插件 `getRuntimeConfigFileName` | 避免两套机制双重处理 `.env.local`，防止身份键（`PORT`/`WORKTREE`）被整文件复制破坏 |
| 排除已跟踪文件 | `git ls-files` 判断 | git 已管的文件由 git 同步；colyn 覆盖会与 git 状态打架 |
| 架构放置 | 新建 `src/core/untracked-file-sync.ts`，不经过插件体系 | 操作普通文件、格式无关、无工具链差异；core 层纯函数 + 薄命令层符合现有分层 |
| 配置 Migration | 不需要（仅添加可选字段） | 按项目规范，可选字段向后兼容 |
| 删除传播 | 永不传播 | 与运行时配置同步哲学一致；删除可能是无意丢失，保守不动 |
