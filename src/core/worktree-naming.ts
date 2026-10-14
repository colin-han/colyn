/**
 * Worktree 目录命名规则
 *
 * 目录名格式：`{prefix}-{id}`，prefix 由配置项 worktreePrefix 决定，默认 `task`。
 * 所有需要生成或解析 worktree 目录名的地方都必须经由本模块，禁止硬编码。
 */

/** 默认 worktree 目录名前缀 */
export const DEFAULT_WORKTREE_PREFIX = 'task';

/** 合法前缀：字母开头，仅含字母、数字、下划线、连字符 */
const PREFIX_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

/**
 * 校验前缀是否合法
 */
export function isValidWorktreePrefix(prefix: string): boolean {
  return PREFIX_PATTERN.test(prefix);
}

/**
 * 由前缀和 Worktree ID 生成目录名
 */
export function getWorktreeDirName(prefix: string, id: number): string {
  return `${prefix}-${id}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 解析目录名，匹配 `{prefix}-{数字}` 时返回 Worktree ID，否则返回 null
 */
export function parseWorktreeId(prefix: string, dirName: string): number | null {
  const match = dirName.match(new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`));
  return match ? parseInt(match[1], 10) : null;
}
