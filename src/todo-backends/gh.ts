import { spawnSync } from 'child_process';
import { ColynError } from '../types/index.js';
import { t } from '../i18n/index.js';

/**
 * 执行 gh 命令，返回 stdout（trim）。失败时抛 ColynError。
 */
export function runGh(args: string[]): string {
  const result = spawnSync('gh', args, { encoding: 'utf-8' });
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new ColynError(t('commands.todo.backend.ghNotInstalled'));
    }
    throw new ColynError(t('commands.todo.backend.ghFailed', { detail: result.error.message }));
  }
  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').toString();
    if (/auth|login|authentication/i.test(stderr)) {
      throw new ColynError(t('commands.todo.backend.ghNotAuthed'));
    }
    throw new ColynError(t('commands.todo.backend.ghFailed', { detail: stderr.trim() }));
  }
  return (result.stdout ?? '').toString().trim();
}

/**
 * 解析当前仓库 nameWithOwner；非 GitHub repo 抛错。
 */
export function ensureGhRepo(): string {
  let out: string;
  try {
    out = runGh(['repo', 'view', '--json', 'nameWithOwner']);
  } catch (err) {
    if (err instanceof ColynError && err.message === t('commands.todo.backend.ghNotInstalled')) {
      throw err;
    }
    throw new ColynError(t('commands.todo.backend.notGithubRepo'));
  }
  const parsed = JSON.parse(out) as { nameWithOwner?: string };
  if (!parsed.nameWithOwner) {
    throw new ColynError(t('commands.todo.backend.notGithubRepo'));
  }
  return parsed.nameWithOwner;
}
