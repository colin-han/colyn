/**
 * 未跟踪文件同步
 *
 * 在主分支目录与 worktree 目录之间，按 settings.syncFiles 清单同步
 * git 未跟踪的本地文件。规则（见 docs/zh-CN/develop/design/design-untracked-file-sync.md §3）：
 * - 目标侧缺失 → 从源侧复制（保留权限位）
 * - 两侧内容相同 → 不动
 * - 两侧内容不同（冲突）→ 不覆盖、不合并，报错提示由人工处理
 * - 源侧缺失 → 不动目标（永不传播删除）
 *
 * 与 runtime-config-sync 的关系：本模块操作普通文件（非 key-value），
 * 不经过工具链插件体系；运行时配置文件（.env.local 等）被排除，
 * 由 runtime-config-sync 以 key-value 语义处理。
 */

/** 同步方向：main-to-worktree（update/add/repair）、worktree-to-main（merge） */
export type UntrackedFileSyncDirection = 'main-to-worktree' | 'worktree-to-main';

/** 冲突项：文件与两侧修改时间，供提示输出 */
export interface UntrackedFileConflict {
  path: string;
  sourceMtime: Date;
  targetMtime: Date;
}

/** 跳过项：文件与原因 */
export interface SkippedUntrackedFile {
  path: string;
  reason: 'tracked' | 'runtime-config' | 'source-missing';
}

/** 同步结果：供输出提示 */
export interface UntrackedFileSyncResult {
  /** 本次复制到目标侧的文件（相对源侧目录的路径，按清单顺序） */
  copied: string[];
  /** 两侧内容不同被跳过的文件 */
  conflicts: UntrackedFileConflict[];
  /** 因排除规则或源缺失被跳过的文件 */
  skipped: SkippedUntrackedFile[];
}

/**
 * 通配符模式 → 正则（纯函数）
 *
 * 语义与 branchOverrides 的通配符风格一致：`*` 匹配单段（不含 /），
 * `**` 作为独立段跨目录。仅用于匹配文件相对路径。
 */
export function filePatternToRegex(pattern: string): RegExp {
  const segments = pattern.split('/').map((segment) => {
    if (segment === '**') return '(?:[^/]+/)*[^/]*';
    return segment
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[^/]*');
  });
  return new RegExp(`^${segments.join('/')}$`);
}

/** 单文件的两侧状态（由 fs 层收集，供纯函数决策） */
export interface UntrackedFileStatus {
  path: string;
  sourceExists: boolean;
  targetExists: boolean;
  contentEqual: boolean;
}

/**
 * 纯函数：根据两侧文件状态决策同步动作（不触碰文件系统）
 *
 * 决策表（设计文档 §3.2）：
 * - 源缺失 → sourceMissing（不动目标）
 * - 目标缺失 → toCopy（复制）
 * - 两侧都有且内容相同 → 不产生任何动作
 * - 两侧都有且内容不同 → conflicts（报错，不写入）
 */
export function planUntrackedFileSync(
  files: UntrackedFileStatus[]
): { toCopy: string[]; conflicts: string[]; sourceMissing: string[] } {
  const toCopy: string[] = [];
  const conflicts: string[] = [];
  const sourceMissing: string[] = [];
  for (const file of files) {
    if (!file.sourceExists) {
      sourceMissing.push(file.path);
    } else if (!file.targetExists) {
      toCopy.push(file.path);
    } else if (!file.contentEqual) {
      conflicts.push(file.path);
    }
  }
  return { toCopy, conflicts, sourceMissing };
}
