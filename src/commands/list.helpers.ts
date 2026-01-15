import { execSync } from 'child_process';

/**
 * Git 工作目录状态
 */
export interface GitStatus {
  modified: number;   // 已修改但未暂存的文件数
  staged: number;     // 已暂存的文件数
  untracked: number;  // 未跟踪的文件数
}

/**
 * 与主分支的差异
 */
export interface GitDiff {
  ahead: number;   // 领先主分支的提交数
  behind: number;  // 落后主分支的提交数
}

/**
 * 获取工作目录的 git 状态
 */
export function getGitStatus(worktreePath: string): GitStatus {
  try {
    // 使用 git status --porcelain 获取简洁的状态输出
    const output = execSync('git status --porcelain', {
      cwd: worktreePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let modified = 0;
    let staged = 0;
    let untracked = 0;

    const lines = output.trim().split('\n').filter(line => line.length > 0);

    for (const line of lines) {
      const indexStatus = line[0];  // 暂存区状态
      const workTreeStatus = line[1];  // 工作区状态

      // 未跟踪文件
      if (indexStatus === '?' && workTreeStatus === '?') {
        untracked++;
        continue;
      }

      // 已暂存的修改（index 有状态且不是 ?）
      if (indexStatus !== ' ' && indexStatus !== '?') {
        staged++;
      }

      // 工作区有修改（worktree 有状态且不是 ?）
      if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
        modified++;
      }
    }

    return { modified, staged, untracked };
  } catch {
    // 如果获取失败，返回空状态
    return { modified: 0, staged: 0, untracked: 0 };
  }
}

/**
 * 获取分支与主分支的差异
 */
export function getGitDiff(worktreePath: string, mainBranch: string): GitDiff {
  try {
    // 获取当前分支
    const currentBranch = execSync('git branch --show-current', {
      cwd: worktreePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    // 如果是主分支本身，没有差异
    if (currentBranch === mainBranch) {
      return { ahead: 0, behind: 0 };
    }

    // 使用 git rev-list 获取差异
    // ahead: 当前分支有但主分支没有的提交数
    // behind: 主分支有但当前分支没有的提交数
    const output = execSync(`git rev-list --left-right --count ${mainBranch}...HEAD`, {
      cwd: worktreePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    const [behind, ahead] = output.split('\t').map(Number);

    return { ahead: ahead || 0, behind: behind || 0 };
  } catch {
    // 如果获取失败，返回空差异
    return { ahead: 0, behind: 0 };
  }
}

/**
 * 格式化状态显示
 * 返回类似 "M:3" 的格式，如果没有修改则返回空字符串
 */
export function formatStatus(status: GitStatus): string {
  const parts: string[] = [];

  const total = status.modified + status.staged + status.untracked;
  if (total === 0) {
    return '';
  }

  // 显示总修改数
  if (status.modified > 0) {
    parts.push(`M:${status.modified}`);
  }
  if (status.staged > 0) {
    parts.push(`S:${status.staged}`);
  }
  if (status.untracked > 0) {
    parts.push(`?:${status.untracked}`);
  }

  return parts.join(' ');
}

/**
 * 格式化状态显示（简化版，仅显示图标）
 * 有修改显示 ●，无修改显示空
 */
export function formatStatusSimple(status: GitStatus): string {
  const total = status.modified + status.staged + status.untracked;
  return total > 0 ? '●' : '';
}

/**
 * 格式化差异显示
 * 返回类似 "↑2 ↓1" 的格式
 */
export function formatDiff(diff: GitDiff, isMain: boolean): string {
  if (isMain) {
    return '-';
  }

  const parts: string[] = [];

  if (diff.ahead > 0) {
    parts.push(`↑${diff.ahead}`);
  }
  if (diff.behind > 0) {
    parts.push(`↓${diff.behind}`);
  }

  if (parts.length === 0) {
    return '✓';  // 已同步
  }

  return parts.join(' ');
}
