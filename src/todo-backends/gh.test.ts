import { describe, it, expect, vi, beforeEach } from 'vitest';

const { spawnSync } = vi.hoisted(() => ({ spawnSync: vi.fn() }));
vi.mock('child_process', () => ({ spawnSync }));

import { runGh, ensureGhRepo } from './gh.js';

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
