# 子命令参数的项目级默认值配置

**日期**：2026-05-22
**状态**：设计稿（待实施）

---

## 1. 背景与目标

colyn 当前所有子命令的开关型参数（如 `merge --skip-build`、`merge --no-rebase`）都只能在命令行上即时指定。对于团队/项目固定的工作流偏好（如"本项目合并前总是跳过构建"、"我们离线场景下永远不 fetch"），用户必须每次重复输入。

**目标**：

1. 让影响 git/构建工作流的开关型参数可以通过 `settings.json` 设置项目级（或用户级）默认值
2. 命令行上仍可临时覆盖，提供 `--no-xxx` 形式的反向开关
3. 利用现有 `branchOverrides` 递归合并机制，免费获得"按分支覆盖默认值"的能力
4. 命名与行为对所有命令保持一致

**非目标**：

- 不把安全确认类参数（`--yes`、`--force`）纳入配置——降低误操作风险
- 不把输出格式参数（`--json`、`--short`、`--format`）纳入配置——这些通常是脚本逐次指定
- 不把一次性/场景化参数（`init --port`、`completion --install`）纳入配置

---

## 2. 范围：可配置参数清单

### 2.1 顶层共享配置

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `verbose` | `boolean` | `false` | 所有支持 `-v/--verbose` 的命令共享。等价于在每次执行时加 `-v`。 |

### 2.2 `commands.*` 子命令配置

命名约定：**所有配置项默认对应"正向能力开启"**。CLI 用 `--xxx` 显式开启、`--no-xxx` 显式关闭，运行时按"CLI 显式 > 配置文件 > 内置默认"的顺序解析。

| 配置项 | 默认 | CLI 开 | CLI 关 |
|---|---|---|---|
| `commands.merge.build` | `true` | `--build` *(新增)* | `--no-build` *(替代旧的 `--skip-build`)* |
| `commands.merge.rebase` | `true` | `--rebase` *(新增)* | `--no-rebase` *(已存在)* |
| `commands.merge.update` | `true` | `--update` *(新增)* | `--no-update` *(已存在)* |
| `commands.merge.fetch` | `true` | `--fetch` *(新增)* | `--no-fetch` *(已存在)* |
| `commands.merge.all` | `true` | `--all` *(由 `--update-all` 改名)* | `--no-all` / `--current-only` *(新增)* |
| `commands.update.rebase` | `true` | `--rebase` *(新增)* | `--no-rebase` *(已存在)* |
| `commands.update.fetch` | `true` | `--fetch` *(新增)* | `--no-fetch` *(已存在)* |
| `commands.update.all` | `true` | `--all` *(已存在)* | `--no-all` / `--current-only` *(新增)* |
| `commands.release.update` | `true` | `--update` *(新增)* | `--no-update` *(已存在)* |
| `commands.checkout.fetch` | `true` | `--fetch` *(新增)* | `--no-fetch` *(已存在)* |

### 2.3 业务规则约束

- **`merge.all` 仅在 `merge.update === true` 时生效**。当 `--no-update` 时即使 `--all` 也不会更新任何 worktree。该规则在 `merge` 命令业务逻辑中显式短路，不在 schema 层表达。

### 2.4 破坏性变更

- `merge --skip-build` **移除**，由 `merge --no-build` 替代
- `merge --update-all` **移除**，由 `merge --all` 替代
- `update --all` 默认行为反转：之前需显式加 `--all`，现在默认即更新所有 worktree；要回到旧行为需 `update --current-only` 或 `update --no-all`

### 2.5 显式排除清单（永不纳入配置）

| 命令 | 参数 | 理由 |
|---|---|---|
| `remove`, `tmux` | `-f/--force` | 安全确认 |
| `remove`, `init`, `todo remove`, `todo archive` | `-y/--yes` | 安全确认 |
| `status`, `list`, `list-project`, `todo list`, `config` | `--json` | 脚本场景逐次指定 |
| `info` | `-S/--short`, `--format`, `-s/--separator` | 输出格式偏好（暂不配置化） |
| `list` | `-p/--paths`, `--no-main`, `-r/--refresh` | 同上 |
| `init` | `-p/--port` | 已从 `.env.local` 推断 |
| `completion` | `--install` | 一次性动作 |
| `config` | `--user` | meta 命令自身 |
| `todo start` | `--no-clipboard` | 微小交互细节 |

---

## 3. Schema 设计

### 3.1 修改 `src/core/config-schema.ts`

```ts
// 新增子命令配置 Schema
export const MergeCommandConfigSchema = z.object({
  build: z.boolean().optional(),
  rebase: z.boolean().optional(),
  update: z.boolean().optional(),
  fetch: z.boolean().optional(),
  all: z.boolean().optional(),
}).strict();

export const UpdateCommandConfigSchema = z.object({
  rebase: z.boolean().optional(),
  fetch: z.boolean().optional(),
  all: z.boolean().optional(),
}).strict();

export const ReleaseCommandConfigSchema = z.object({
  update: z.boolean().optional(),
}).strict();

export const CheckoutCommandConfigSchema = z.object({
  fetch: z.boolean().optional(),
}).strict();

export const CommandsConfigSchema = z.object({
  merge: MergeCommandConfigSchema.optional(),
  update: UpdateCommandConfigSchema.optional(),
  release: ReleaseCommandConfigSchema.optional(),
  checkout: CheckoutCommandConfigSchema.optional(),
}).strict();

export type CommandsConfig = z.infer<typeof CommandsConfigSchema>;

// 在 SettingsSchemaBase 中追加两个可选字段
const SettingsSchemaBase = z.object({
  version: z.number(),
  lang: z.enum(['en', 'zh-CN']).optional(),
  verbose: z.boolean().optional(),               // 新增
  systemCommands: SystemCommandsSchema.optional(),
  tmux: TmuxConfigSchema.optional(),
  toolchain: z.union([ToolchainConfigSchema, z.null()]).optional(),
  projects: z.array(SubProjectSchema).optional(),
  branchCategories: z.array(BranchCategorySchema).optional(),
  commands: CommandsConfigSchema.optional(),     // 新增
});
```

### 3.2 设计要点

- **全字段 `optional`**：不在配置文件出现 = 走内置默认
- **`.strict()`**：拼错字段名（如 `commadns.merge`）立即报错，避免静默忽略
- **`branchOverrides` 兼容**：现有 `src/core/config-merger.ts` 使用 `deepmerge.all` 合并整个 Settings，新增字段自动参与递归合并——零额外代码
- **不升版本号**：依 `CLAUDE.md` 的"添加新的可选字段不需要 Migration"原则，`CURRENT_CONFIG_VERSION` 保持 `4`，无 migration

---

## 4. 运行时：三态解析工具函数

### 4.1 新建 `src/core/command-defaults.ts`

```ts
import type { Command } from 'commander';
import { loadMergedSettings } from './config-loader.js';

/**
 * 三态合并优先级：
 *   1. CLI 显式（commander 报告 source === 'cli'）
 *   2. 合并后的 settings.commands.<path>
 *   3. 调用方传入的内置默认值
 */
export function applyCommandDefaults<T extends Record<string, unknown>>(
  command: Command,
  cliOpts: T,
  configPath: readonly string[],
  defaults: Partial<T>,
): T {
  const settings = loadMergedSettings();
  const configNode = configPath.reduce<unknown>(
    (acc, key) => (acc as Record<string, unknown> | undefined)?.[key],
    settings,
  ) as Partial<T> | undefined;

  const result = { ...cliOpts };
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    if (command.getOptionValueSource(key as string) === 'cli') continue;
    if (configNode?.[key] !== undefined) {
      result[key] = configNode[key] as T[keyof T];
    } else if (result[key] === undefined) {
      result[key] = defaults[key] as T[keyof T];
    }
  }
  return result;
}

/** verbose 单独走顶层 settings.verbose */
export function resolveVerbose(
  command: Command,
  cliVerbose: boolean | undefined,
): boolean {
  if (command.getOptionValueSource('verbose') === 'cli') {
    return cliVerbose ?? false;
  }
  const settings = loadMergedSettings();
  return settings.verbose ?? false;
}
```

### 4.2 为什么用 `command.getOptionValueSource`

Commander 在 boolean 参数上的取值规则：

| 用户输入 | `opts.xxx` 值 | `getOptionValueSource('xxx')` |
|---|---|---|
| 未指定 | `undefined` | `'default'` 或 `undefined` |
| `--xxx` | `true` | `'cli'` |
| `--no-xxx` | `false` | `'cli'` |

如果只用 `opts.xxx ?? configValue ?? default`，"显式 `--no-xxx`"会被 `??` 当成 `false` 透传——刚好正确。但"未指定"也是 `undefined`，会落到配置或默认——这其实是我们想要的。问题在于：commander 注册了 `--no-xxx` 但未注册 `--xxx` 时，"未指定"会直接给 `true`（commander 把 `--no-xxx` 视为默认 `true`），与"配置中 `false`"无法区分。

`getOptionValueSource` 把"用户显式动作"与"默认值"在源头上区分开，是 commander 官方推荐的方案。

### 4.3 接入示例：`src/commands/merge.ts`

```ts
.option('--build', t('commands.merge.buildOption'))
.option('--no-build', t('commands.merge.noBuildOption'))
.option('--rebase', t('commands.merge.rebaseOption'))
.option('--no-rebase', t('commands.merge.noRebaseOption'))
.option('--update', t('commands.merge.updateOption'))
.option('--no-update', t('commands.merge.noUpdateOption'))
.option('--fetch', t('commands.merge.fetchOption'))
.option('--no-fetch', t('commands.merge.noFetchOption'))
.option('--all', t('commands.merge.allOption'))
.option('--no-all, --current-only', t('commands.merge.noAllOption'))
.option('-v, --verbose', t('common.verboseOption'))
.option('--no-verbose', t('common.noVerboseOption'))
.action(async (opts: MergeOptions, command: Command) => {
  const resolved = applyCommandDefaults(
    command,
    opts,
    ['commands', 'merge'] as const,
    { build: true, rebase: true, update: true, fetch: true, all: true },
  );
  const verbose = resolveVerbose(command, opts.verbose);

  // 业务规则：all 仅在 update 为 true 时生效
  if (!resolved.update) resolved.all = false;

  await runMerge({ ...resolved, verbose });
});
```

其他命令（`update`, `release`, `checkout`）按相同模式接入：补正向 flag、调 `applyCommandDefaults`、调 `resolveVerbose`。

### 4.4 别名实现（`--current-only`）

Commander 原生不支持给 `--no-xxx` 加别名。采用语法 `--no-all, --current-only` 在同一个 `.option()` 调用中注册——commander 把第二个 `--current-only` 作为 `--no-all` 的等价开关，二者都把 `opts.all` 设为 `false`。

---

## 5. 文档与 i18n

### 5.1 i18n 翻译键变更

**新增**（中英同步）：

- `common.verboseOption` / `common.noVerboseOption`（提升为通用键）
- 每个 `--xxx` / `--no-xxx` / `--all` / `--no-all` 的描述键

**删除**：

- `commands.merge.skipBuildOption`
- `commands.merge.updateAllOption`
- `commands.merge.verboseOption`
- `commands.release.verboseOption`

`commands.release` 等仍有 `verbose` 选项的命令，描述键改用 `common.verboseOption`。

### 5.2 文档更新清单

| 文档 | 改动 |
|---|---|
| `docs/zh-CN/manual/` 用户手册 | 新增章节"命令默认值配置"，列出 `settings.json` 示例与全部可配置项 |
| `docs/en/manual/` 用户手册 | 同上（英文版） |
| `docs/zh-CN/develop/design/design-command-defaults.md` | 新建：本设计的中文版 |
| `docs/en/develop/design/design-command-defaults.md` | 新建：英文版 |
| `docs/zh-CN/develop/glossary.md` | 新增术语："命令默认值配置 (Command defaults config)"、"三态判断 (Three-source resolution)" |
| `README.md` | 列出破坏性变更链接到迁移说明 |
| `CHANGELOG`（如有） | 记录 `--skip-build` / `--update-all` 移除与 `update --all` 默认反转 |

### 5.3 用户配置示例（写入用户手册）

```jsonc
{
  "version": 4,
  "verbose": true,
  "commands": {
    "merge": {
      "build": false,
      "rebase": false
    },
    "update": {
      "all": false
    }
  },
  "branchOverrides": {
    "release/*": {
      "commands": {
        "merge": { "build": true }
      }
    }
  }
}
```

含义：
- 全局打开详细输出
- `merge` 默认跳过构建、跳过 rebase
- `update` 默认只更新当前 worktree
- 但在 `release/*` 分支上 `merge` 仍执行构建

---

## 6. 测试策略

1. **Schema 验证**：错拼字段名（如 `commadns`）应被 `.strict()` 拒绝
2. **三态解析单元测试**：覆盖三种来源组合
   - CLI `--no-build`、配置 `build: true`、默认 `true` → 结果 `false`
   - CLI 未指定、配置 `build: false`、默认 `true` → 结果 `false`
   - CLI 未指定、配置无、默认 `true` → 结果 `true`
3. **`branchOverrides` 合并测试**：分支匹配时 `commands.merge.build` 正确覆盖
4. **`--current-only` 别名**：与 `--no-all` 等价
5. **业务规则**：`merge --no-update --all` 实际行为应等同 `--no-update`（all 被强制 false）
6. **集成测试**：每个命令完整跑通 CLI → 配置 → 默认 的三态路径

---

## 7. 实施顺序建议

1. Schema 扩展（`config-schema.ts`）+ 单测
2. `applyCommandDefaults` + `resolveVerbose` 工具函数 + 单测
3. 改造 `merge` 命令（最大、含 `--skip-build` 破坏性变更）+ 集成测试
4. 改造 `update` 命令（含 `--all` 默认反转的破坏性变更）
5. 改造 `release`、`checkout`
6. i18n 键迁移（中英同步）
7. 用户手册 + 设计文档 + glossary（中英同步）
8. CHANGELOG / README 破坏性变更说明

---

## 8. 风险与权衡

| 风险 | 缓解 |
|---|---|
| `update --all` 默认反转可能让老用户误以为"为什么 update 突然变慢了" | CHANGELOG 显著说明；命令首次执行多 worktree 时在 stderr 输出一行提示（可选，待评估） |
| `--skip-build` / `--update-all` 移除后老脚本失效 | 直接硬移除，在 CHANGELOG 中显著说明；老用户首次使用旧 flag 会得到 commander 的 "unknown option" 报错——天然提示 |
| `update --all` 默认反转可能让老用户误以为"update 突然变慢了" | 仅在 CHANGELOG 中说明，不增加运行时提示（避免噪音） |
| `getOptionValueSource` 行为依赖 commander 版本 | 在工具函数单测中显式锁定该 API；升 commander 时跑测试即可 |
