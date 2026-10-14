/**
 * iTerm2 tab title 同步模块
 *
 * 在切换 worktree 时更新 iTerm2 的 tab title，便于识别当前项目与分支。
 * 不在 iTerm2 中运行时静默跳过。
 */

/**
 * 检测是否在 iTerm2 中运行
 */
function isInIterm2(): boolean {
  return (
    process.env.TERM_PROGRAM === 'iTerm.app' ||
    process.env.LC_TERMINAL === 'iTerm2'
  );
}

/**
 * 取分支名的最后一段（以 / 分隔），用于 tab title 显示
 * 例如：feature/login-page → login-page
 */
export function getBranchShortName(branch: string): string {
  return branch.split('/').pop() || branch;
}

/**
 * 设置 iTerm2 tab title
 * 格式：🐶 {projectName} #{worktreeId} - {branchShortName}
 * @param worktreeId Worktree ID
 * @param projectName 项目名
 * @param branchName 分支名
 * @returns 是否执行了设置（不在 iTerm2 中返回 false）
 */
export function setIterm2Title(
  worktreeId: number,
  projectName: string,
  branchName: string
): boolean {
  if (!isInIterm2()) {
    return false;
  }

  const tabTitle = `🐶 ${projectName} #${worktreeId} - ${getBranchShortName(branchName)}`;

  try {
    // OSC 1 仅设置 tab title（icon name），不影响 window title
    process.stderr.write(`\x1b]1;${tabTitle}\x07`);
    return true;
  } catch {
    return false;
  }
}
