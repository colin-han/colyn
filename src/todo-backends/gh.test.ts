import { describe, it, expect, vi, beforeEach } from 'vitest';

const { spawnSync } = vi.hoisted(() => ({ spawnSync: vi.fn() }));
vi.mock('child_process', () => ({ spawnSync }));

import { runGh, ensureGhRepo, isGhInstalled, isGhAuthed } from './gh.js';

describe('gh wrapper', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('runGh 成功返回 stdout', () => {
    spawnSync.mockReturnValue({ status: 0, stdout: 'ok', stderr: '' });
    expect(runGh(['issue', 'list'])).toBe('ok');
    expect(spawnSync).toHaveBeenCalledWith('gh', ['issue', 'list'], expect.objectContaining({ encoding: 'utf-8' }));
  });

  it('runGh：gh 未安装（ENOENT）抛错', () => {
    spawnSync.mockReturnValue({ error: Object.assign(new Error('x'), { code: 'ENOENT' }) });
    expect(() => runGh(['issue', 'list'])).toThrow();
  });

  it('runGh：非零退出抛错', () => {
    spawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'boom' });
    expect(() => runGh(['issue', 'list'])).toThrow();
  });

  it('ensureGhRepo：成功返回 nameWithOwner', () => {
    spawnSync.mockReturnValue({ status: 0, stdout: JSON.stringify({ nameWithOwner: 'a/b' }), stderr: '' });
    expect(ensureGhRepo()).toBe('a/b');
  });
});

describe('gh availability', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('isGhInstalled：which gh 成功 → true', () => {
    spawnSync.mockReturnValue({ status: 0, stdout: '/usr/bin/gh', stderr: '' });
    expect(isGhInstalled()).toBe(true);
  });

  it('isGhInstalled：which gh 失败 → false', () => {
    spawnSync.mockReturnValue({ status: 1, stdout: '', stderr: '' });
    expect(isGhInstalled()).toBe(false);
  });

  it('isGhAuthed：gh auth status 退出 0 → true', () => {
    spawnSync.mockReturnValue({ status: 0, stdout: '', stderr: 'Logged in' });
    expect(isGhAuthed()).toBe(true);
  });

  it('isGhAuthed：非零 → false', () => {
    spawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'not logged in' });
    expect(isGhAuthed()).toBe(false);
  });
});
