# 子命令参数项目级默认值配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 允许用户在 `settings.json` 中为 `merge` / `update` / `release` / `checkout` 的开关型参数与全局 `verbose` 设置默认值，并在 CLI 上通过 `--xxx` / `--no-xxx` 临时覆盖。

**Architecture:** 在 `config-schema.ts` 中扩展可选字段；新增 `src/core/command-defaults.ts` 提供三态解析工具函数（CLI 显式 > 配置文件 > 内置默认），核心机制是利用 commander 的 `command.getOptionValueSource()` 区分"用户显式"与"未指定"。所有命令的 `action` 入口处调用该工具，并对正向/反向 CLI 选项做对称改造。

**Tech Stack:** TypeScript / commander@12 / zod / deepmerge / vitest / i18next

**Spec:** `docs/superpowers/specs/2026-05-22-command-defaults-design.md`

---

## 文件结构

| 文件 | 角色 |
|---|---|
| Modify `src/core/config-schema.ts` | 新增 `verbose` 顶层字段、`CommandsConfigSchema` 及其子 Schema |
| Create `src/core/command-defaults.ts` | `applyCommandDefaults()` + `resolveVerbose()` 工具函数 |
| Create `src/core/command-defaults.test.ts` | 工具函数的单元测试 |
| Modify `src/i18n/locales/zh-CN.ts` | 新增 / 删除翻译 key（中文） |
| Modify `src/i18n/locales/en.ts` | 同步英文翻译 |
| Modify `src/commands/merge.ts` | 改造 CLI 选项 + action 接入工具函数；删除 `--skip-build` / `--update-all`；删除 `merge.verboseOption` |
| Modify `src/commands/merge.helpers.ts` | 字段名跟随 options 改变（`updateAll` → `all`） |
| Modify `src/commands/update.ts` | 同上模式；`all` 默认值反转 |
| Modify `src/commands/release.ts` | 同上模式；删除 `release.verboseOption` |
| Modify `src/commands/checkout.ts` | 同上模式 |
| Create `docs/zh-CN/develop/design/design-command-defaults.md` | 设计文档（中文） |
| Create `docs/en/develop/design/design-command-defaults.md` | 设计文档（英文） |
| Modify `docs/zh-CN/develop/glossary.md` | 新增术语 |
| Modify `docs/zh-CN/manual/*.md` 与 `docs/en/manual/*.md` | 新增"命令默认值配置"章节 |
| Modify `CHANGELOG.md`（如存在）/ `README.md` | 破坏性变更说明 |

---

### Task 1: 扩展配置 Schema

**Files:**
- Modify: `src/core/config-schema.ts`

- [ ] **Step 1: 在 schema 文件追加新 Schema 定义**

在 `src/core/config-schema.ts` 中 `BranchCategorySchema` 之后、`SettingsSchemaBase` 之前插入：

```ts
/**
 * Merge 命令默认值配置
 * 所有字段都是"正向能力开关"，默认值由命令实现兜底
 */
export const MergeCommandConfigSchema = z
  .object({
    build: z.boolean().optional(),
    rebase: z.boolean().optional(),
    update: z.boolean().optional(),
    fetch: z.boolean().optional(),
    all: z.boolean().optional(),
  })
  .strict();

export type MergeCommandConfig = z.infer<typeof MergeCommandConfigSchema>;

/**
 * Update 命令默认值配置
 */
export const UpdateCommandConfigSchema = z
  .object({
    rebase: z.boolean().optional(),
    fetch: z.boolean().optional(),
    all: z.boolean().optional(),
  })
  .strict();

export type UpdateCommandConfig = z.infer<typeof UpdateCommandConfigSchema>;

/**
 * Release 命令默认值配置
 */
export const ReleaseCommandConfigSchema = z
  .object({
    update: z.boolean().optional(),
  })
  .strict();

export type ReleaseCommandConfig = z.infer<typeof ReleaseCommandConfigSchema>;

/**
 * Checkout 命令默认值配置
 */
export const CheckoutCommandConfigSchema = z
  .object({
    fetch: z.boolean().optional(),
  })
  .strict();

export type CheckoutCommandConfig = z.infer<typeof CheckoutCommandConfigSchema>;

/**
 * commands 配置容器
 */
export const CommandsConfigSchema = z
  .object({
    merge: MergeCommandConfigSchema.optional(),
    update: UpdateCommandConfigSchema.optional(),
    release: ReleaseCommandConfigSchema.optional(),
    checkout: CheckoutCommandConfigSchema.optional(),
  })
  .strict();

export type CommandsConfig = z.infer<typeof CommandsConfigSchema>;
```

- [ ] **Step 2: 在 SettingsSchemaBase 中加入两个字段**

修改 `SettingsSchemaBase`：在 `lang` 之后加 `verbose`，在 `branchCategories` 之后加 `commands`：

```ts
const SettingsSchemaBase = z.object({
  version: z.number(),
  lang: z.enum(['en', 'zh-CN']).optional(),
  /** 全局详细输出（影响所有支持 --verbose 的命令） */
  verbose: z.boolean().optional(),
  systemCommands: SystemCommandsSchema.optional(),
  tmux: TmuxConfigSchema.optional(),
  toolchain: z.union([ToolchainConfigSchema, z.null()]).optional(),
  projects: z.array(SubProjectSchema).optional(),
  branchCategories: z.array(BranchCategorySchema).optional(),
  /** 子命令的默认值配置 */
  commands: CommandsConfigSchema.optional(),
});
```

注意：**不修改** `CURRENT_CONFIG_VERSION`，因为全部新字段都是可选。

- [ ] **Step 3: 运行类型检查**

```
volta run yarn build
```

期望：编译通过，无新错误。

- [ ] **Step 4: 运行 lint**

```
volta run yarn lint
```

期望：0 errors。

- [ ] **Step 5: 提交**

```
git add src/core/config-schema.ts
git commit -m "feat(config): 新增 verbose 顶层字段与 commands.* schema"
```

---

### Task 2: 工具函数 `command-defaults` —— 测试先行

**Files:**
- Create: `src/core/command-defaults.test.ts`
- Create: `src/core/command-defaults.ts`

- [ ] **Step 1: 写失败的测试**

新建 `src/core/command-defaults.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import type { Settings } from './config-schema.js';

vi.mock('./config-loader.js', () => ({
  loadUserConfig: vi.fn(),
  loadProjectConfig: vi.fn(),
}));
vi.mock('./paths.js', () => ({
  getProjectPaths: vi.fn(async () => ({
    projectRoot: '/fake/project',
    mainDir: '/fake/project',
    worktreesDir: '/fake/project/worktrees',
  })),
}));
vi.mock('./git.js', () => ({
  getCurrentBranch: vi.fn(async () => 'feature/test'),
}));

import { loadUserConfig, loadProjectConfig } from './config-loader.js';
import { applyCommandDefaults, resolveVerbose } from './command-defaults.js';

function makeCommand(setup: (cmd: Command) => void): {
  cmd: Command;
  parse: (argv: string[]) => Record<string, unknown>;
} {
  const cmd = new Command();
  cmd.exitOverride();
  setup(cmd);
  return {
    cmd,
    parse: (argv) => {
      cmd.parse(argv, { from: 'user' });
      return cmd.opts();
    },
  };
}

function makeSettings(partial: Partial<Settings>): Settings {
  return { version: 4, ...partial } as Settings;
}

beforeEach(() => {
  vi.mocked(loadUserConfig).mockReset();
  vi.mocked(loadProjectConfig).mockReset();
});

describe('applyCommandDefaults', () => {
  it('CLI 显式 --no-build 覆盖配置中的 build=true', async () => {
    vi.mocked(loadUserConfig).mockResolvedValue(null);
    vi.mocked(loadProjectConfig).mockResolvedValue(
      makeSettings({ commands: { merge: { build: true } } })
    );

    const { cmd, parse } = makeCommand((c) => {
      c.option('--build');
      c.option('--no-build');
    });
    const opts = parse(['--no-build']);

    const resolved = await applyCommandDefaults(cmd, opts, ['commands', 'merge'] as const, {
      build: true,
    });
    expect(resolved.build).toBe(false);
  });

  it('CLI 未指定时使用配置文件的值', async () => {
    vi.mocked(loadUserConfig).mockResolvedValue(null);
    vi.mocked(loadProjectConfig).mockResolvedValue(
      makeSettings({ commands: { merge: { build: false } } })
    );

    const { cmd, parse } = makeCommand((c) => {
      c.option('--build');
      c.option('--no-build');
    });
    const opts = parse([]);

    const resolved = await applyCommandDefaults(cmd, opts, ['commands', 'merge'] as const, {
      build: true,
    });
    expect(resolved.build).toBe(false);
  });

  it('CLI 和配置都未指定时使用内置默认', async () => {
    vi.mocked(loadUserConfig).mockResolvedValue(null);
    vi.mocked(loadProjectConfig).mockResolvedValue(null);

    const { cmd, parse } = makeCommand((c) => {
      c.option('--build');
      c.option('--no-build');
    });
    const opts = parse([]);

    const resolved = await applyCommandDefaults(cmd, opts, ['commands', 'merge'] as const, {
      build: true,
    });
    expect(resolved.build).toBe(true);
  });

  it('branchOverrides 中的命令配置覆盖顶层 commands 配置', async () => {
    vi.mocked(loadUserConfig).mockResolvedValue(null);
    vi.mocked(loadProjectConfig).mockResolvedValue(
      makeSettings({
        commands: { merge: { build: false } },
        branchOverrides: {
          'feature/test': { commands: { merge: { build: true } } },
        },
      })
    );

    const { cmd, parse } = makeCommand((c) => {
      c.option('--build');
      c.option('--no-build');
    });
    const opts = parse([]);

    const resolved = await applyCommandDefaults(cmd, opts, ['commands', 'merge'] as const, {
      build: false,
    });
    expect(resolved.build).toBe(true);
  });

  it('保留未在 defaults 中声明的字段（如位置参数）', async () => {
    vi.mocked(loadUserConfig).mockResolvedValue(null);
    vi.mocked(loadProjectConfig).mockResolvedValue(null);

    const { cmd, parse } = makeCommand((c) => {
      c.option('--build');
      c.option('--unrelated <v>');
    });
    const opts = parse(['--unrelated', 'xyz']);

    const resolved = await applyCommandDefaults(cmd, opts, ['commands', 'merge'] as const, {
      build: true,
    });
    expect(resolved.unrelated).toBe('xyz');
    expect(resolved.build).toBe(true);
  });
});

describe('resolveVerbose', () => {
  it('CLI -v 优先于配置', async () => {
    vi.mocked(loadUserConfig).mockResolvedValue(makeSettings({ verbose: false }));
    vi.mocked(loadProjectConfig).mockResolvedValue(null);

    const { cmd, parse } = makeCommand((c) => {
      c.option('-v, --verbose');
      c.option('--no-verbose');
    });
    parse(['-v']);
    expect(await resolveVerbose(cmd, cmd.opts().verbose as boolean | undefined)).toBe(true);
  });

  it('CLI --no-verbose 覆盖配置 verbose=true', async () => {
    vi.mocked(loadUserConfig).mockResolvedValue(makeSettings({ verbose: true }));
    vi.mocked(loadProjectConfig).mockResolvedValue(null);

    const { cmd, parse } = makeCommand((c) => {
      c.option('-v, --verbose');
      c.option('--no-verbose');
    });
    parse(['--no-verbose']);
    expect(await resolveVerbose(cmd, cmd.opts().verbose as boolean | undefined)).toBe(false);
  });

  it('CLI 未指定时使用配置 verbose=true', async () => {
    vi.mocked(loadUserConfig).mockResolvedValue(makeSettings({ verbose: true }));
    vi.mocked(loadProjectConfig).mockResolvedValue(null);

    const { cmd, parse } = makeCommand((c) => {
      c.option('-v, --verbose');
      c.option('--no-verbose');
    });
    parse([]);
    expect(await resolveVerbose(cmd, cmd.opts().verbose as boolean | undefined)).toBe(true);
  });

  it('CLI 和配置都未指定时默认 false', async () => {
    vi.mocked(loadUserConfig).mockResolvedValue(null);
    vi.mocked(loadProjectConfig).mockResolvedValue(null);

    const { cmd, parse } = makeCommand((c) => {
      c.option('-v, --verbose');
      c.option('--no-verbose');
    });
    parse([]);
    expect(await resolveVerbose(cmd, cmd.opts().verbose as boolean | undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```
volta run yarn test src/core/command-defaults.test.ts
```

期望：FAIL（`command-defaults.js` 不存在）。

- [ ] **Step 3: 实现工具函数**

新建 `src/core/command-defaults.ts`：

```ts
/**
 * 命令默认值三态解析
 *
 * 优先级：CLI 显式 > 合并后的 settings 节点 > 调用方传入的内置默认
 *
 * 使用 commander 的 `getOptionValueSource(key) === 'cli'` 区分用户显式与默认。
 */
import type { Command } from 'commander';
import {
  loadUserConfig,
  loadProjectConfig,
} from './config-loader.js';
import { mergeConfigs, applyBranchOverrides } from './config-merger.js';
import { getProjectPaths } from './paths.js';
import { getCurrentBranch } from './git.js';
import type { Settings } from './config-schema.js';

async function loadMergedSettings(): Promise<Settings | null> {
  const paths = await getProjectPaths().catch(() => null);
  const [userCfg, projectCfg] = await Promise.all([
    loadUserConfig(),
    paths ? loadProjectConfig(paths.mainDir) : Promise.resolve(null),
  ]);
  if (!userCfg && !projectCfg) return null;

  const merged = mergeConfigs(userCfg, projectCfg);

  // 应用 branchOverrides（按当前 cwd 的分支名）
  try {
    const branch = await getCurrentBranch();
    return applyBranchOverrides(merged, branch);
  } catch {
    return merged;
  }
}

/**
 * 三态合并 CLI 选项与配置默认值。
 *
 * @param command commander Command 实例（action 第二参数）
 * @param cliOpts cmd.opts() 的返回值
 * @param configPath settings 中的节点路径，如 ['commands', 'merge']
 * @param defaults 调用方提供的内置默认值（仅作用于这些 key）
 */
export async function applyCommandDefaults<T extends Record<string, unknown>>(
  command: Command,
  cliOpts: T,
  configPath: readonly string[],
  defaults: Partial<T>
): Promise<T> {
  const settings = await loadMergedSettings();
  const configNode = configPath.reduce<unknown>(
    (acc, key) => (acc as Record<string, unknown> | undefined)?.[key],
    settings ?? undefined
  ) as Partial<T> | undefined;

  const result = { ...cliOpts };
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    const source = command.getOptionValueSource(key as string);
    if (source === 'cli') continue;
    if (configNode?.[key] !== undefined) {
      result[key] = configNode[key] as T[keyof T];
    } else if (result[key] === undefined) {
      result[key] = defaults[key] as T[keyof T];
    }
  }
  return result;
}

/**
 * 解析全局共享的 verbose（顶层 settings.verbose）。
 */
export async function resolveVerbose(
  command: Command,
  cliVerbose: boolean | undefined
): Promise<boolean> {
  if (command.getOptionValueSource('verbose') === 'cli') {
    return cliVerbose ?? false;
  }
  const settings = await loadMergedSettings();
  return settings?.verbose ?? false;
}
```

- [ ] **Step 4: 运行测试，确认通过**

```
volta run yarn test src/core/command-defaults.test.ts
```

期望：所有用例 PASS。

- [ ] **Step 5: 跑全量测试 + lint**

```
volta run yarn test
volta run yarn lint
```

期望：全部通过，0 errors。

- [ ] **Step 6: 提交**

```
git add src/core/command-defaults.ts src/core/command-defaults.test.ts
git commit -m "feat(config): applyCommandDefaults / resolveVerbose 工具函数"
```

---

### Task 3: i18n 翻译 key 调整

**Files:**
- Modify: `src/i18n/locales/zh-CN.ts`
- Modify: `src/i18n/locales/en.ts`

- [ ] **Step 1: 查看现状**

```
grep -n "skipBuildOption\|updateAllOption\|noRebaseOption\|noFetchOption\|noUpdateOption\|verboseOption\|allOption" src/i18n/locales/zh-CN.ts src/i18n/locales/en.ts
```

- [ ] **Step 2: 修改 zh-CN.ts**

在 `commands.merge` 中：
- 删除：`skipBuildOption`、`updateAllOption`、`verboseOption`
- 新增（保持原有的 `noRebaseOption`、`noUpdateOption`、`noFetchOption`）：
  ```ts
  buildOption: '执行构建检查（默认行为，等价 commands.merge.build=true）',
  noBuildOption: '跳过 lint 和 build 检查（覆盖配置中的 build=true）',
  rebaseOption: '合并前 rebase 当前分支（默认行为）',
  updateOption: '合并后自动更新 main 分支（默认行为）',
  fetchOption: '操作前 fetch 远端（默认行为）',
  allOption: '更新所有 worktrees（默认行为，需 update=true 才生效）',
  noAllOption: '仅更新当前 worktree（覆盖配置中的 all=true）',
  ```

在 `commands.update` 中：
- 修改/新增：
  ```ts
  rebaseOption: '更新时 rebase（默认行为）',
  fetchOption: '操作前 fetch 远端（默认行为）',
  noAllOption: '仅更新当前 worktree（覆盖配置中的 all=true）',
  ```
  保留原有的 `noRebaseOption`、`noFetchOption`、`allOption`；语义按"默认 all=true"调整 `allOption` 描述。

在 `commands.release` 中：
- 删除：`verboseOption`
- 新增：
  ```ts
  updateOption: '发布前更新 worktree（默认行为）',
  ```

在 `commands.checkout` 中：
- 新增：
  ```ts
  fetchOption: '操作前 fetch 远端（默认行为）',
  ```

在顶层 `common` 节点（若不存在则新建）追加：
```ts
common: {
  verboseOption: '显示详细的步骤信息',
  noVerboseOption: '关闭详细输出（覆盖配置中的 verbose=true）',
},
```

- [ ] **Step 3: 同步修改 en.ts**

按相同 key 结构填入英文翻译：

```ts
// commands.merge
buildOption: 'Run build check (default behavior)',
noBuildOption: 'Skip lint and build checks (overrides commands.merge.build=true)',
rebaseOption: 'Rebase current branch before merge (default)',
updateOption: 'Update main branch after merge (default)',
fetchOption: 'Fetch remote before operation (default)',
allOption: 'Update all worktrees (default, requires update=true)',
noAllOption: 'Update only current worktree (overrides commands.merge.all=true)',

// commands.update
rebaseOption: 'Rebase on update (default)',
fetchOption: 'Fetch remote before operation (default)',
noAllOption: 'Update only current worktree (overrides commands.update.all=true)',

// commands.release
updateOption: 'Update worktrees before release (default)',

// commands.checkout
fetchOption: 'Fetch remote before operation (default)',

// common
verboseOption: 'Show detailed step information',
noVerboseOption: 'Disable verbose output (overrides verbose=true)',
```

- [ ] **Step 4: 编译验证**

```
volta run yarn build
```

期望：编译通过（注意此时 commands 文件中老 key 引用尚未替换，TypeScript 不会报错，因为 i18n key 在运行时解析）。

- [ ] **Step 5: 提交**

```
git add src/i18n/locales/zh-CN.ts src/i18n/locales/en.ts
git commit -m "feat(i18n): 命令默认值配置相关 key 调整（中英同步）"
```

---

### Task 4: 改造 `merge` 命令

**Files:**
- Modify: `src/commands/merge.ts`
- Modify: `src/commands/merge.helpers.ts`

- [ ] **Step 1: 更新 MergeOptions 接口（merge.ts 顶部）**

把：

```ts
interface MergeOptions {
  noRebase?: boolean;
  noUpdate?: boolean;
  updateAll?: boolean;
  verbose?: boolean;
  noFetch?: boolean;
  skipBuild?: boolean;
}
```

改为：

```ts
interface MergeOptions {
  build?: boolean;
  rebase?: boolean;
  update?: boolean;
  fetch?: boolean;
  all?: boolean;
  verbose?: boolean;
}
```

- [ ] **Step 2: 替换 action 入口处的选项读取**

定位 `register(program)` 中的 action（约 src/commands/merge.ts:307）。改为：

```ts
.action(async (target: string | undefined, options: MergeOptions, command: Command) => {
  const resolved = await applyCommandDefaults(
    command,
    options,
    ['commands', 'merge'] as const,
    { build: true, rebase: true, update: true, fetch: true, all: true }
  );
  const verbose = await resolveVerbose(command, options.verbose);

  // 业务规则：all 仅在 update=true 时生效
  if (!resolved.update) resolved.all = false;

  await mergeCommand(target, { ...resolved, verbose });
});
```

文件顶部追加 import：

```ts
import { applyCommandDefaults, resolveVerbose } from '../core/command-defaults.js';
import type { Command } from 'commander';
```

- [ ] **Step 3: 替换 `.option()` 注册**

把现有的 6 行 option 改为：

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
```

注意：不再有 `--skip-build`、`--update-all`、`commands.merge.verboseOption`。

- [ ] **Step 4: 改写 `mergeCommand` 内部的字段读取**

修改 `src/commands/merge.ts` 中 `mergeCommand` 函数。按现有代码语义把字段读取做以下替换（保持业务逻辑不变）：

| 原代码 | 新代码 |
|---|---|
| `if (options.skipBuild)` | `if (!options.build)` |
| `if (options.verbose)` | `if (options.verbose)` *(不变，verbose 已被外层解析)* |
| `const useRebase = !options.noRebase;` | `const useRebase = options.rebase ?? true;` |
| `if (!options.noUpdate) {` | `if (options.update) {` |
| `if (options.updateAll) {` | `if (options.all) {` |
| `!options.noFetch` *(若存在)* | `options.fetch ?? true` |

逐处搜索定位（merge.ts: 76, 91, 103, 131, 134, 175, 220, 224, 234），保持周围逻辑完整。

- [ ] **Step 5: 检查 merge.helpers.ts 字段名**

```
grep -n "skipBuild\|updateAll\|noRebase\|noUpdate\|noFetch" src/commands/merge.helpers.ts
```

如果有引用，按上表同步替换。

- [ ] **Step 6: 编译 + 类型检查**

```
volta run yarn build
```

期望：编译通过。

- [ ] **Step 7: 运行测试 + lint**

```
volta run yarn test
volta run yarn lint
```

期望：全部通过。

- [ ] **Step 8: 手动冒烟（可选但推荐）**

```
node dist/index.js merge --help
```

期望：选项列表中出现 `--no-build`、`--all`、`--no-all` / `--current-only`，不再出现 `--skip-build`、`--update-all`。

- [ ] **Step 9: 提交**

```
git add src/commands/merge.ts src/commands/merge.helpers.ts
git commit -m "feat(merge): 支持项目级默认值配置，--skip-build 改为 --no-build，--update-all 改为 --all"
```

---

### Task 5: 改造 `update` 命令

**Files:**
- Modify: `src/commands/update.ts`

- [ ] **Step 1: 更新 UpdateOptions 接口**

把：

```ts
interface UpdateOptions {
  noRebase?: boolean;
  all?: boolean;
  noFetch?: boolean;
}
```

改为：

```ts
interface UpdateOptions {
  rebase?: boolean;
  fetch?: boolean;
  all?: boolean;
}
```

- [ ] **Step 2: 替换 action 入口**

```ts
.action(async (target: string | undefined, options: UpdateOptions, command: Command) => {
  const resolved = await applyCommandDefaults(
    command,
    options,
    ['commands', 'update'] as const,
    { rebase: true, fetch: true, all: true }
  );
  await updateCommand(target, resolved);
});
```

import：

```ts
import { applyCommandDefaults } from '../core/command-defaults.js';
import type { Command } from 'commander';
```

- [ ] **Step 3: 替换 `.option()` 注册**

```ts
.option('--rebase', t('commands.update.rebaseOption'))
.option('--no-rebase', t('commands.update.noRebaseOption'))
.option('--fetch', t('commands.update.fetchOption'))
.option('--no-fetch', t('commands.update.noFetchOption'))
.option('--all', t('commands.update.allOption'))
.option('--no-all, --current-only', t('commands.update.noAllOption'))
```

- [ ] **Step 4: 替换 updateCommand 内部字段读取**

| 原代码 | 新代码 |
|---|---|
| `const useRebase = !options.noRebase;` | `const useRebase = options.rebase ?? true;` |
| `if (options.all)` | `if (options.all)` *(语义反转：默认 true)* |
| `!options.noFetch` | `options.fetch ?? true` |

⚠️ 注意 `options.all` 的判断本身不变（仍是布尔为 true 时走全量分支），但**默认值** 已经反转——所以原代码里"未指定 → false → 单 worktree"的隐含路径现在变成"未指定 → true → 全量"。仔细阅读 update.ts 的现有 if/else，确认这与新语义一致。

- [ ] **Step 5: 编译 + 测试 + lint**

```
volta run yarn build && volta run yarn test && volta run yarn lint
```

- [ ] **Step 6: 手动冒烟**

```
node dist/index.js update --help
```

期望：`--all`、`--no-all` / `--current-only` 均出现。

- [ ] **Step 7: 提交**

```
git add src/commands/update.ts
git commit -m "feat(update): 支持项目级默认值配置，--all 默认开启，新增 --current-only 别名"
```

---

### Task 6: 改造 `release` 命令

**Files:**
- Modify: `src/commands/release.ts`

- [ ] **Step 1: 更新 ReleaseOptions 接口**

把：

```ts
interface ReleaseOptions {
  noUpdate?: boolean;
  verbose?: boolean;
}
```

改为：

```ts
interface ReleaseOptions {
  update?: boolean;
  verbose?: boolean;
}
```

- [ ] **Step 2: 替换 action 入口**

```ts
.action(async (version: string | undefined, options: ReleaseOptions, command: Command) => {
  const resolved = await applyCommandDefaults(
    command,
    options,
    ['commands', 'release'] as const,
    { update: true }
  );
  const verbose = await resolveVerbose(command, options.verbose);
  await releaseCommand(version, { ...resolved, verbose });
});
```

import：

```ts
import { applyCommandDefaults, resolveVerbose } from '../core/command-defaults.js';
import type { Command } from 'commander';
```

- [ ] **Step 3: 替换 `.option()` 注册**

```ts
.option('--update', t('commands.release.updateOption'))
.option('--no-update', t('commands.release.noUpdateOption'))
.option('-v, --verbose', t('common.verboseOption'))
.option('--no-verbose', t('common.noVerboseOption'))
```

- [ ] **Step 4: 替换 releaseCommand 内部字段读取**

| 原代码 | 新代码 |
|---|---|
| `if (!options.noUpdate)` | `if (options.update)` |

- [ ] **Step 5: 编译 + 测试 + lint**

```
volta run yarn build && volta run yarn test && volta run yarn lint
```

- [ ] **Step 6: 提交**

```
git add src/commands/release.ts
git commit -m "feat(release): 支持项目级默认值配置，verbose 复用顶层配置"
```

---

### Task 7: 改造 `checkout` 命令

**Files:**
- Modify: `src/commands/checkout.ts`

- [ ] **Step 1: 更新 CheckoutOptions 接口**

把：

```ts
interface CheckoutOptions {
  noFetch?: boolean;
}
```

改为：

```ts
interface CheckoutOptions {
  fetch?: boolean;
}
```

- [ ] **Step 2: 替换 action 入口**

定位 `checkout.ts:745` 附近的 action：

```ts
.action(async (args: string[], options: CheckoutOptions, command: Command) => {
  const resolved = await applyCommandDefaults(
    command,
    options,
    ['commands', 'checkout'] as const,
    { fetch: true }
  );
  // ... 保留原有的 args 解析逻辑（target / branch）
  await checkoutCommand(target, branch, resolved);
});
```

import：

```ts
import { applyCommandDefaults } from '../core/command-defaults.js';
import type { Command } from 'commander';
```

- [ ] **Step 3: 替换 `.option()` 注册**

```ts
.option('--fetch', t('commands.checkout.fetchOption'))
.option('--no-fetch', t('commands.checkout.noFetchOption'))
```

- [ ] **Step 4: 替换 checkoutCommand 内部字段读取**

| 原代码 | 新代码 |
|---|---|
| `!options.noFetch` | `options.fetch ?? true` |

- [ ] **Step 5: 编译 + 测试 + lint**

```
volta run yarn build && volta run yarn test && volta run yarn lint
```

- [ ] **Step 6: 提交**

```
git add src/commands/checkout.ts
git commit -m "feat(checkout): 支持项目级默认值配置"
```

---

### Task 8: 用户手册与设计文档（中英双语）

**Files:**
- Create: `docs/zh-CN/develop/design/design-command-defaults.md`
- Create: `docs/en/develop/design/design-command-defaults.md`
- Modify: `docs/zh-CN/develop/glossary.md`
- Modify: `docs/zh-CN/manual/` 下的对应章节
- Modify: `docs/en/manual/` 下的对应章节

- [ ] **Step 1: 创建中文设计文档**

写入 `docs/zh-CN/develop/design/design-command-defaults.md`，内容是 spec 的精简版（约 200 行）：

- 背景与目标
- 可配置参数清单（表格）
- 业务规则约束（`merge.all` 需 `update=true`）
- 三态解析机制（CLI > 配置 > 默认）
- 破坏性变更说明

可直接引用 `docs/superpowers/specs/2026-05-22-command-defaults-design.md` 中对应章节的内容。

- [ ] **Step 2: 创建英文设计文档**

`docs/en/develop/design/design-command-defaults.md`，按上一步内容翻译为英文。

- [ ] **Step 3: 更新中文 glossary**

在 `docs/zh-CN/develop/glossary.md` 适当位置追加：

```markdown
### 命令默认值配置（Command defaults config）

指 `settings.json` 中 `commands.*` 节点，存放各子命令的开关型参数的项目级或用户级默认值。运行时按"CLI 显式 > 配置 > 内置默认"三态合并。

### 三态解析（Three-source resolution）

针对开关型 CLI 参数的优先级链：
1. 用户在命令行显式指定（`--xxx` 或 `--no-xxx`，commander 的 `getOptionValueSource() === 'cli'`）
2. 合并后的 `settings.json` 节点
3. 命令实现中传入的内置默认值
```

并将 "命令默认值配置"、"三态解析" 添加到常用术语列表（如有）。

- [ ] **Step 4: 更新中文用户手册**

先找到合适位置：

```
ls docs/zh-CN/manual/
```

在用户手册的"配置"章节中追加一节"命令默认值配置"，内容：
- 一段说明（指向设计文档）
- 全部可配置项清单（沿用 spec §2 的表格）
- `settings.json` 示例（包含 `verbose`、`commands.merge`、`commands.update` 与 `branchOverrides`）
- 覆盖语法说明（`--xxx` / `--no-xxx` / `--current-only`）
- 破坏性变更提醒

示例配置：

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

- [ ] **Step 5: 同步更新英文用户手册**

`docs/en/manual/` 下对应位置，结构与内容与中文版一致。

- [ ] **Step 6: 提交**

```
git add docs/
git commit -m "docs: 命令默认值配置（中英双语：设计文档 / glossary / 用户手册）"
```

---

### Task 9: CHANGELOG 与 README 破坏性变更说明

**Files:**
- Modify: `CHANGELOG.md`（如不存在则跳过此文件）
- Modify: `README.md` 与 `README-en.md`（如存在）

- [ ] **Step 1: 检查 CHANGELOG.md 是否存在**

```
ls CHANGELOG.md 2>/dev/null && echo "exists" || echo "missing"
```

- [ ] **Step 2a: 若 CHANGELOG.md 存在，追加变更条目**

在文件顶部新增"未发布"区块（仿照已有格式），列出：

```markdown
### Breaking Changes

- `merge --skip-build` 已移除，改用 `merge --no-build`
- `merge --update-all` 已移除，改用 `merge --all`
- `update --all` 默认行为反转：现在默认更新所有 worktree。要回到旧行为请使用 `update --current-only` 或 `update --no-all`
- 各命令的 `-v/--verbose` 现在读取顶层 `verbose` 配置（之前各命令独立）

### Features

- 新增项目级 / 用户级配置 `commands.*` 与顶层 `verbose`，允许为开关型参数设置默认值
- 各开关型参数补全 `--xxx` / `--no-xxx` 对称形式
- `--no-all` 新增别名 `--current-only`
```

- [ ] **Step 2b: 若 CHANGELOG.md 不存在则跳过**

- [ ] **Step 3: 更新 README.md / README-en.md**

如果 README 中存在命令示例引用 `--skip-build` 或 `--update-all`，更新为新写法。在配置文档段落（若有）链接到新增的"命令默认值配置"章节。

- [ ] **Step 4: 提交**

```
git add CHANGELOG.md README.md README-en.md 2>/dev/null; git commit -m "docs: CHANGELOG 与 README 同步命令默认值配置变更"
```

---

### Task 10: 最终验证

**Files:** 无新增

- [ ] **Step 1: 跑全量测试**

```
volta run yarn test
```

期望：全部 PASS。

- [ ] **Step 2: lint**

```
volta run yarn lint
```

期望：0 errors（warnings 可保留）。

- [ ] **Step 3: 类型检查 + 完整 build**

```
volta run yarn build
```

期望：编译通过，无新错误。

- [ ] **Step 4: 手动验证三态解析**

```
# 1. 内置默认
node dist/index.js merge --help
# 期望：选项列表完整

# 2. CLI 覆盖（无需真实环境，--help 已足以验证 commander 注册）
node dist/index.js update --help
# 期望：同时出现 --all、--no-all、--current-only

# 3. 配置生效冒烟（可选）：在测试项目里写入 settings.json
# 设置 commands.merge.build=false 后执行 merge，确认跳过构建
```

- [ ] **Step 5: 检查所有破坏性 flag 已移除**

```
grep -rn "skip-build\|update-all\|skipBuild\|updateAll" src/ docs/
```

期望：只剩 docs 中"已移除"的破坏性变更说明，无任何 src/ 引用。

- [ ] **Step 6: 检查无残留旧 i18n key**

```
grep -rn "skipBuildOption\|updateAllOption" src/
```

期望：0 结果。

- [ ] **Step 7: 摘要提交（如有零散修复）**

```
git status
# 若有未提交修复，集中一次提交
```

---

## Self-Review 检查清单

- ✅ Spec §2.1 顶层 verbose → Task 1 Step 2 / Task 2 `resolveVerbose`
- ✅ Spec §2.2 commands.* schema → Task 1
- ✅ Spec §2.3 业务规则（all 需 update=true）→ Task 4 Step 2
- ✅ Spec §2.4 破坏性变更 → Task 4（--skip-build、--update-all）+ Task 5（--all 默认反转）
- ✅ Spec §2.5 显式排除清单 → 通过"只改这四个命令"自然实现
- ✅ Spec §3 Schema 设计 → Task 1（含 .strict()、不升版本号）
- ✅ Spec §4 工具函数 → Task 2
- ✅ Spec §5 文档与 i18n → Task 3 + Task 8 + Task 9
- ✅ Spec §6 测试策略 → Task 2 单测覆盖 5 项中的 1-4 项；merge 业务规则在 Task 4 Step 4 通过代码层确保；现有 vitest 套件作为回归保障
- ✅ Spec §7 实施顺序 → Task 编号与 spec §7 顺序一致

