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

import * as fs from 'fs/promises';
import * as path from 'path';
import simpleGit from 'simple-git';
import { pluginManager } from '../plugins/index.js';

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

/** 枚举目录下全部文件（跳过 .git / node_modules），返回 POSIX 风格相对路径 */
async function collectFiles(dir: string): Promise<string[]> {
  const SKIP_DIRS = new Set(['.git', 'node_modules']);
  const results: string[] = [];

  async function walk(current: string, rel: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(path.join(current, entry.name), childRel);
      } else if (entry.isFile()) {
        results.push(childRel);
      }
    }
  }

  await walk(dir, '');
  return results;
}

/**
 * 解析同步清单：通配符展开 + 排除规则
 *
 * - 枚举 sourceDir（按 direction 的源侧目录，见设计澄清 1）
 * - 已跟踪文件（git ls-files，在 gitDir 执行，两目录属同一仓库）→ 跳过 + 警告
 * - 运行时配置文件（basename 命中任一插件声明）→ 跳过 + 警告
 * - 返回按路径排序的候选清单与被排除项
 */
export async function resolveSyncFileCandidates(
  sourceDir: string,
  patterns: string[],
  gitDir: string
): Promise<{ candidates: string[]; skipped: SkippedUntrackedFile[] }> {
  if (patterns.length === 0) return { candidates: [], skipped: [] };

  const regexes = patterns.map((p) => filePatternToRegex(p));
  const matched = new Set<string>();
  for (const rel of await collectFiles(sourceDir)) {
    if (regexes.some((re) => re.test(rel))) matched.add(rel);
  }
  if (matched.size === 0) return { candidates: [], skipped: [] };

  // tracked 检查：git ls-files 输出即已跟踪文件
  const lsOutput = await simpleGit(gitDir).raw(['ls-files', '--', ...matched]);
  const tracked = new Set(
    lsOutput.split('\n').map((line) => line.trim()).filter(Boolean)
  );

  const runtimeConfigNames = new Set(pluginManager.getAllRuntimeConfigFileNames());

  const candidates: string[] = [];
  const skipped: SkippedUntrackedFile[] = [];
  for (const rel of [...matched].sort()) {
    if (tracked.has(rel)) {
      skipped.push({ path: rel, reason: 'tracked' });
    } else if (runtimeConfigNames.has(path.posix.basename(rel))) {
      skipped.push({ path: rel, reason: 'runtime-config' });
    } else {
      candidates.push(rel);
    }
  }
  return { candidates, skipped };
}
