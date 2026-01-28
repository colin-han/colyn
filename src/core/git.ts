import simpleGit from 'simple-git';
import { ColynError } from '../types/index.js';
import { t } from '../i18n/index.js';

/**
 * 检查是否为 git 仓库
 */
export async function checkIsRepo(): Promise<boolean> {
  const git = simpleGit();
  return await git.checkIsRepo();
}

/**
 * 检查工作目录是否干净
 */
export async function checkWorkingDirectoryClean(): Promise<void> {
  const git = simpleGit();
  const status = await git.status();

  if (!status.isClean()) {
    throw new ColynError(
      t('errors.workingDirNotClean'),
      t('errors.workingDirNotCleanHint')
    );
  }
}

/**
 * 检测主分支名称
 */
export async function detectMainBranch(): Promise<string> {
  const git = simpleGit();

  try {
    // 尝试获取当前分支名
    const branchSummary = await git.branch();
    return branchSummary.current;
  } catch (error) {
    // 如果获取失败或不是 git 仓库，默认使用 'main'
    return 'main';
  }
}
