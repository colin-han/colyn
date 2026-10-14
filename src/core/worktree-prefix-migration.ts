/**
 * Worktree 目录名前缀迁移
 *
 * 当用户修改 worktreePrefix 配置后，已有的 `{旧前缀}-{id}` 目录不再被识别。
 * 本模块由 repair 命令调用，把 git 已登记的旧前缀目录重命名为当前前缀，
 * 并同步迁移 status.json 中的状态键。
 *
 * 安全约束：只处理 `git worktree list` 中登记的目录，避免误改无关目录。
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import simpleGit from 'simple-git';
import { getWorktreeDirName, parseWorktreeId } from './worktree-naming.js';
import { renameWorktreeStatusKey } from './worktree-status.js';

export interface PrefixMigrationOptions {
  mainDir: string;
  worktreesDir: string;
  configDir: string;
  /** 当前配置的前缀 */
  prefix: string;
}

export interface PrefixMigrationResult {
  renamed: Array<{ from: string; to: string }>;
  failed: Array<{ from: string; to: string; error: string }>;
}

/** 任意 `{前缀}-{数字}` 形式的目录名 */
const ANY_PREFIXED_DIR = /^([A-Za-z][A-Za-z0-9_-]*)-(\d+)$/;

/**
 * 列出 git 已登记的、位于 worktreesDir 下的 worktree 目录名
 */
async function listRegisteredWorktreeDirs(mainDir: string, worktreesDir: string): Promise<Set<string>> {
  const registered = new Set<string>();
  // git 输出的是真实路径（已解析符号链接），统一用 realpath 比较
  const realWorktreesDir = await fs.realpath(worktreesDir).catch(() => worktreesDir);
  const output = await simpleGit(mainDir).raw(['worktree', 'list', '--porcelain']);
  for (const line of output.split('\n')) {
    if (!line.startsWith('worktree ')) continue;
    const wtPath = line.substring('worktree '.length).trim();
    if (path.dirname(wtPath) === realWorktreesDir) {
      registered.add(path.basename(wtPath));
    }
  }
  return registered;
}

/**
 * 把旧前缀的 worktree 目录重命名为当前前缀
 */
export async function migrateWorktreePrefix(
  options: PrefixMigrationOptions
): Promise<PrefixMigrationResult> {
  const { mainDir, worktreesDir, configDir, prefix } = options;
  const result: PrefixMigrationResult = { renamed: [], failed: [] };

  let entries: string[];
  try {
    entries = await fs.readdir(worktreesDir);
  } catch {
    return result;
  }

  const registered = await listRegisteredWorktreeDirs(mainDir, worktreesDir);
  const git = simpleGit(mainDir);

  for (const dirName of entries.sort()) {
    // 已是当前前缀，或不是 `{前缀}-{数字}` 形式，跳过
    if (parseWorktreeId(prefix, dirName) !== null) continue;
    const match = dirName.match(ANY_PREFIXED_DIR);
    if (!match) continue;
    // 只处理 git 登记过的目录
    if (!registered.has(dirName)) continue;

    const id = parseInt(match[2], 10);
    const newName = getWorktreeDirName(prefix, id);
    const from = path.join(worktreesDir, dirName);
    const to = path.join(worktreesDir, newName);

    try {
      await fs.access(to);
      result.failed.push({ from: dirName, to: newName, error: 'target exists' });
      continue;
    } catch {
      // 目标不存在，可以重命名
    }

    try {
      // 由 git 负责同步更新 .git/worktrees 元数据与 worktree 内的 .git 指针
      await git.raw(['worktree', 'move', from, to]);
      await renameWorktreeStatusKey(configDir, dirName, newName);
      result.renamed.push({ from: dirName, to: newName });
    } catch (error) {
      result.failed.push({
        from: dirName,
        to: newName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
