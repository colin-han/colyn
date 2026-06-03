import simpleGit from 'simple-git';
import * as path from 'path';
import { ColynError } from '../types/index.js';
import { t } from '../i18n/index.js';

interface GitStatusLike {
  modified: string[];
  created: string[];
  deleted: string[];
  renamed: Array<{ to: string }>;
  not_added: string[];
}

const IGNORED_STATUS_BASENAMES = new Set(['.env.local']);

export function getRelevantStatusFiles(status: GitStatusLike): string[] {
  const changedFiles = [
    ...status.modified,
    ...status.created,
    ...status.deleted,
    ...status.renamed.map(r => r.to),
    ...status.not_added
  ];

  return changedFiles.filter((file) => !IGNORED_STATUS_BASENAMES.has(path.basename(file)));
}

/**
 * 检查是否为 git 仓库
 * @param dir 要检查的目录，默认为当前目录
 */
export async function checkIsRepo(dir?: string): Promise<boolean> {
  const git = simpleGit(dir);
  return await git.checkIsRepo();
}

/**
 * 检查工作目录是否干净
 */
export async function checkWorkingDirectoryClean(): Promise<void> {
  const git = simpleGit();
  const status = await git.status();

  if (getRelevantStatusFiles(status).length > 0) {
    throw new ColynError(
      t('errors.workingDirNotClean'),
      t('errors.workingDirNotCleanHint')
    );
  }
}

/**
 * 获取当前分支名称
 * @param dir 工作目录，默认为当前目录
 * @returns 当前分支名称
 */
export async function getCurrentBranch(dir?: string): Promise<string> {
  const git = simpleGit(dir);

  try {
    const branchSummary = await git.branch();
    return branchSummary.current;
  } catch (error) {
    // 如果获取失败，默认返回 'main'
    return 'main';
  }
}

/**
 * 检测主分支名称
 */
export async function detectMainBranch(): Promise<string> {
  return await getCurrentBranch();
}

/**
 * 判断本地分支是否存在
 * @param branch 分支名
 * @param dir 工作目录，默认当前目录
 */
export async function localBranchExists(branch: string, dir?: string): Promise<boolean> {
  const git = simpleGit(dir);
  try {
    const summary = await git.branchLocal();
    return summary.all.includes(branch);
  } catch {
    return false;
  }
}

/**
 * 判断分支是否存在（本地或远端）
 * @param branch 分支名（不含 remotes/<remote>/ 前缀）
 * @param dir 工作目录，默认当前目录
 */
export async function branchExistsAnywhere(branch: string, dir?: string): Promise<boolean> {
  const git = simpleGit(dir);
  try {
    const summary = await git.branch(['-a']);
    return summary.all.some(
      (b) => b === branch || b.endsWith(`/${branch}`)
    );
  } catch {
    return false;
  }
}

/**
 * 获取 origin 远端的 fetch URL；无 origin 返回 null。
 */
export async function getOriginUrl(dir?: string): Promise<string | null> {
  const git = simpleGit(dir);
  try {
    const remotes = await git.getRemotes(true);
    const origin = remotes.find((r) => r.name === 'origin');
    return origin?.refs?.fetch ?? null;
  } catch {
    return null;
  }
}
