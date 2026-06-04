import { describe, it, expect, vi, beforeEach } from 'vitest';

const { spawnSync } = vi.hoisted(() => ({ spawnSync: vi.fn() }));
vi.mock('child_process', () => ({ spawnSync }));

import { runGh, ensureGhRepo, isGhInstalled, isGhAuthed, ghInstallHint, GH_ERR } from './gh.js';
import { ColynError } from '../types/index.js';
import { t } from '../i18n/index.js';

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

  it('runGh：gh 未安装（ENOENT）→ code === GH_NOT_INSTALLED', () => {
    spawnSync.mockReturnValue({ error: Object.assign(new Error('x'), { code: 'ENOENT' }) });
    try {
      runGh(['issue', 'list']);
      expect.fail('runGh 应抛出异常');
    } catch (e) {
      expect(e).toBeInstanceOf(ColynError);
      expect((e as ColynError).code).toBe(GH_ERR.NOT_INSTALLED);
    }
  });

  it('runGh：非零退出抛错', () => {
    spawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'boom' });
    expect(() => runGh(['issue', 'list'])).toThrow();
  });

  it('runGh：非零退出（普通错误）→ code === GH_FAILED', () => {
    spawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'boom' });
    try {
      runGh(['issue', 'list']);
      expect.fail('runGh 应抛出异常');
    } catch (e) {
      expect(e).toBeInstanceOf(ColynError);
      expect((e as ColynError).code).toBe(GH_ERR.FAILED);
    }
  });

  it('runGh：未登录（stderr 含 "gh auth login"）→ code === GH_NOT_AUTHED', () => {
    spawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'To get started, run: gh auth login' });
    try {
      runGh(['repo', 'view']);
      expect.fail('runGh 应抛出异常');
    } catch (e) {
      expect(e).toBeInstanceOf(ColynError);
      expect((e as ColynError).code).toBe(GH_ERR.NOT_AUTHED);
    }
  });

  it('runGh：未登录（stderr 含 "not logged in"）→ code === GH_NOT_AUTHED', () => {
    spawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'You are not logged in' });
    try {
      runGh(['repo', 'view']);
      expect.fail('runGh 应抛出异常');
    } catch (e) {
      expect(e).toBeInstanceOf(ColynError);
      expect((e as ColynError).code).toBe(GH_ERR.NOT_AUTHED);
    }
  });

  it('runGh：result.error 非 ENOENT → code === GH_FAILED', () => {
    spawnSync.mockReturnValue({ error: Object.assign(new Error('spawn error'), { code: 'EACCES' }) });
    try {
      runGh(['issue', 'list']);
      expect.fail('runGh 应抛出异常');
    } catch (e) {
      expect(e).toBeInstanceOf(ColynError);
      expect((e as ColynError).code).toBe(GH_ERR.FAILED);
    }
  });

  it('ensureGhRepo：成功返回 nameWithOwner', () => {
    spawnSync.mockReturnValue({ status: 0, stdout: JSON.stringify({ nameWithOwner: 'a/b' }), stderr: '' });
    expect(ensureGhRepo()).toBe('a/b');
  });

  it('ensureGhRepo：gh 未登录 → 抛"未登录"提示（而非"不是 GitHub 仓库"），code === GH_NOT_AUTHED', () => {
    // gh repo view 在未登录时非零退出且 stderr 含 auth 提示
    spawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'To get started, run: gh auth login' });
    try {
      ensureGhRepo();
      expect.fail('应该抛出异常');
    } catch (e) {
      expect(e).toBeInstanceOf(ColynError);
      expect((e as ColynError).code).toBe(GH_ERR.NOT_AUTHED);
      // 消息应包含未登录提示，不是"不是 GitHub 仓库"
      expect((e as ColynError).message).toBe(t('commands.todo.backend.ghNotAuthed'));
    }
  });

  it('ensureGhRepo：gh 未安装 → 抛"未安装"提示（含平台安装命令），code === GH_NOT_INSTALLED', () => {
    spawnSync.mockReturnValue({ error: Object.assign(new Error('x'), { code: 'ENOENT' }) });
    try {
      ensureGhRepo();
      expect.fail('应该抛出异常');
    } catch (e) {
      expect(e).toBeInstanceOf(ColynError);
      expect((e as ColynError).code).toBe(GH_ERR.NOT_INSTALLED);
      expect((e as ColynError).message).toContain(ghInstallHint());
      expect((e as ColynError).message).toBe(
        t('commands.todo.backend.ghNotInstalled', { install: ghInstallHint() })
      );
    }
  });

  it('ensureGhRepo：通用失败（非 auth）→ 抛"不是 GitHub 仓库"，code === GH_NOT_REPO', () => {
    spawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'no git remotes found' });
    try {
      ensureGhRepo();
      expect.fail('应该抛出异常');
    } catch (e) {
      expect(e).toBeInstanceOf(ColynError);
      expect((e as ColynError).code).toBe(GH_ERR.NOT_REPO);
      expect((e as ColynError).message).toBe(t('commands.todo.backend.notGithubRepo'));
    }
  });

  it('ensureGhRepo：repo view 成功但返回非法 JSON → code === GH_NOT_REPO', () => {
    spawnSync.mockReturnValue({ status: 0, stdout: 'not json', stderr: '' });
    try {
      ensureGhRepo();
      expect.fail('应该抛出异常');
    } catch (e) {
      expect(e).toBeInstanceOf(ColynError);
      expect((e as ColynError).code).toBe(GH_ERR.NOT_REPO);
    }
  });

  it('ensureGhRepo：repo view 成功但 nameWithOwner 缺失 → code === GH_NOT_REPO', () => {
    spawnSync.mockReturnValue({ status: 0, stdout: JSON.stringify({}), stderr: '' });
    try {
      ensureGhRepo();
      expect.fail('应该抛出异常');
    } catch (e) {
      expect(e).toBeInstanceOf(ColynError);
      expect((e as ColynError).code).toBe(GH_ERR.NOT_REPO);
    }
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
