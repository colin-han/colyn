import { spawnSync } from 'child_process';
import { ColynError } from '../types/index.js';
import { t } from '../i18n/index.js';

export const GH_ERR = {
  NOT_INSTALLED: 'GH_NOT_INSTALLED',
  NOT_AUTHED: 'GH_NOT_AUTHED',
  FAILED: 'GH_FAILED',
  NOT_REPO: 'GH_NOT_REPO',
} as const;

/**
 * 返回当前操作系统下安装 GitHub CLI 的建议命令；
 * Linux 各发行版命令各异，回退到官方安装页。
 */
export function ghInstallHint(): string {
  switch (process.platform) {
    case 'darwin':
      return 'brew install gh';
    case 'win32':
      return 'winget install --id GitHub.cli';
    default:
      return 'https://cli.github.com';
  }
}

/**
 * 执行 gh 命令，返回 stdout（trim）。失败时抛 ColynError。
 */
export function runGh(args: string[]): string {
  const result = spawnSync('gh', args, { encoding: 'utf-8' });
  if (result.error) {
    const errCode = (result.error as NodeJS.ErrnoException).code;
    if (errCode === 'ENOENT') {
      throw new ColynError(
        t('commands.todo.backend.ghNotInstalled', { install: ghInstallHint() }),
        undefined,
        GH_ERR.NOT_INSTALLED
      );
    }
    throw new ColynError(
      t('commands.todo.backend.ghFailed', { detail: result.error.message }),
      undefined,
      GH_ERR.FAILED
    );
  }
  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').toString();
    if (/gh auth login|not logged in|authentication required|requires authentication|to authenticate/i.test(stderr)) {
      throw new ColynError(t('commands.todo.backend.ghNotAuthed'), undefined, GH_ERR.NOT_AUTHED);
    }
    throw new ColynError(
      t('commands.todo.backend.ghFailed', { detail: stderr.trim() }),
      undefined,
      GH_ERR.FAILED
    );
  }
  return (result.stdout ?? '').toString().trim();
}

/** gh 是否已安装 */
export function isGhInstalled(): boolean {
  const result = spawnSync('which', ['gh'], { encoding: 'utf-8' });
  return !result.error && result.status === 0;
}

/** gh 是否已登录 */
export function isGhAuthed(): boolean {
  const result = spawnSync('gh', ['auth', 'status'], { encoding: 'utf-8' });
  return !result.error && result.status === 0;
}

/**
 * 解析当前仓库 nameWithOwner；非 GitHub repo 抛错。
 */
export function ensureGhRepo(): string {
  let out: string;
  try {
    out = runGh(['repo', 'view', '--json', 'nameWithOwner']);
  } catch (err) {
    // gh 未安装 / 未登录：原样抛出（让用户去安装或登录），不要误判为"非 GitHub 仓库"
    if (
      err instanceof ColynError &&
      (err.code === GH_ERR.NOT_INSTALLED || err.code === GH_ERR.NOT_AUTHED)
    ) {
      throw err;
    }
    throw new ColynError(t('commands.todo.backend.notGithubRepo'), undefined, GH_ERR.NOT_REPO);
  }
  let parsed: { nameWithOwner?: string };
  try {
    parsed = JSON.parse(out) as { nameWithOwner?: string };
  } catch {
    throw new ColynError(t('commands.todo.backend.notGithubRepo'), undefined, GH_ERR.NOT_REPO);
  }
  if (!parsed.nameWithOwner) {
    throw new ColynError(t('commands.todo.backend.notGithubRepo'), undefined, GH_ERR.NOT_REPO);
  }
  return parsed.nameWithOwner;
}
