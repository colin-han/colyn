/**
 * 运行时配置同步方向
 * - main-to-worktree：主分支 → worktree（update 时）
 * - worktree-to-main：worktree → 主分支（merge 合并成功后）
 */
export type SyncDirection = 'main-to-worktree' | 'worktree-to-main';

/** 值冲突项：key 与两侧值，供提示输出 */
export interface ConfigConflict {
  key: string;
  mainValue: string;
  worktreeValue: string;
}

/** 同步 diff 结果 */
export interface RuntimeConfigDiff {
  /** 需要新增到目标侧的 key-value */
  toAdd: Record<string, string>;
  /** 值不同被跳过的 key */
  conflicts: ConfigConflict[];
}

/**
 * 纯函数：计算两个配置 map 的同步 diff（不触碰文件系统）
 *
 * 规则（见 docs/zh-CN/develop/design/design-runtime-config-sync.md §3）：
 * - 同步只"补充缺失的 key"，永不覆盖既有值、永不删除 key
 * - 同名 key 两侧值不同 → 记入 conflicts，不进入 toAdd
 * - 身份键（如 PORT / WORKTREE）在两个方向上都被排除
 */
export function diffRuntimeConfig(
  mainConfig: Record<string, string>,
  worktreeConfig: Record<string, string>,
  direction: SyncDirection,
  identityKeys: string[]
): RuntimeConfigDiff {
  const identity = new Set(identityKeys);
  const source = direction === 'main-to-worktree' ? mainConfig : worktreeConfig;
  const target = direction === 'main-to-worktree' ? worktreeConfig : mainConfig;

  const toAdd: Record<string, string> = {};
  const conflicts: ConfigConflict[] = [];

  for (const [key, value] of Object.entries(source)) {
    if (identity.has(key)) continue;
    if (!(key in target)) {
      toAdd[key] = value;
    } else if (target[key] !== value) {
      conflicts.push({ key, mainValue: mainConfig[key], worktreeValue: worktreeConfig[key] });
    }
  }

  return { toAdd, conflicts };
}
