import { describe, it, expect, vi, beforeEach } from 'vitest';

const { runGh, ensureGhRepo } = vi.hoisted(() => ({ runGh: vi.fn(), ensureGhRepo: vi.fn() }));
vi.mock('./gh.js', () => ({ runGh, ensureGhRepo }));

const { branchExistsAnywhere, getOriginUrl } = vi.hoisted(() => ({ branchExistsAnywhere: vi.fn(), getOriginUrl: vi.fn() }));
vi.mock('../core/git.js', () => ({ branchExistsAnywhere, getOriginUrl }));

import { GitHubIssuesBackend, githubProvider } from './github.js';

const cfg = { archivedLabel: null as string | null, typeLabels: {} as Record<string, string> };

describe('GitHubIssuesBackend.list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureGhRepo.mockReturnValue('owner/repo');
  });

  it('open issue 无分支 → pending；有分支 → in-progress', async () => {
    runGh.mockReturnValue(JSON.stringify([
      { number: 1, title: 'A', body: 'bodyA', labels: [{ name: 'feature' }] },
      { number: 2, title: 'B', body: 'bodyB', labels: [{ name: 'bug' }] },
    ]));
    branchExistsAnywhere.mockImplementation(async (b: string) => b === 'feature/1');

    const be = new GitHubIssuesBackend({ ...cfg });
    const pending = await be.list('pending');
    const inProgress = await be.list('in-progress');

    expect(pending.map((t) => t.name)).toEqual(['2']);
    expect(inProgress.map((t) => t.name)).toEqual(['1']);
    expect(inProgress[0].message).toBe('A\nbodyA');
    expect(inProgress[0].type).toBe('feature');
  });

  it('typeLabels 反向映射：label enhancement → type feature', async () => {
    runGh.mockReturnValue(JSON.stringify([
      { number: 3, title: 'C', body: '', labels: [{ name: 'enhancement' }] },
    ]));
    branchExistsAnywhere.mockResolvedValue(false);

    const be = new GitHubIssuesBackend({ archivedLabel: null, typeLabels: { feature: 'enhancement' } });
    const pending = await be.list('pending');
    expect(pending[0].type).toBe('feature');
  });

  it('archivedLabel 未配置：所有 closed 都是 archived，done 为空', async () => {
    runGh.mockReturnValue(JSON.stringify([
      { number: 4, title: 'D', body: '', labels: [] },
    ]));
    const be = new GitHubIssuesBackend({ ...cfg });
    expect(await be.list('archived')).toHaveLength(1);
    expect(await be.list('done')).toHaveLength(0);
  });

  it('archivedLabel 已配置：closed 无 label → done；有 label → archived', async () => {
    runGh.mockReturnValue(JSON.stringify([
      { number: 5, title: 'E', body: '', labels: [] },
      { number: 6, title: 'F', body: '', labels: [{ name: 'colyn-archived' }] },
    ]));
    const be = new GitHubIssuesBackend({ archivedLabel: 'colyn-archived', typeLabels: {} });
    expect((await be.list('done')).map((t) => t.name)).toEqual(['5']);
    expect((await be.list('archived')).map((t) => t.name)).toEqual(['6']);
  });

  it('list 过滤掉带 wontfix 的 issue', async () => {
    runGh.mockReturnValue(JSON.stringify([
      { number: 7, title: 'G', body: '', labels: [{ name: 'wontfix' }] },
    ]));
    branchExistsAnywhere.mockResolvedValue(false);
    const be = new GitHubIssuesBackend({ ...cfg });
    expect(await be.list('pending')).toHaveLength(0);
  });
});

describe('GitHubIssuesBackend 写操作', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureGhRepo.mockReturnValue('owner/repo');
  });

  it('add：create 并回填 issue 号', async () => {
    runGh.mockReturnValue('https://github.com/owner/repo/issues/42');
    const be = new GitHubIssuesBackend({ archivedLabel: null, typeLabels: { feature: 'enhancement' } });
    const item = await be.add({ type: 'feature', message: 'Title line\nbody text' });
    expect(item.name).toBe('42');
    expect(item.type).toBe('feature');
    const call = runGh.mock.calls[0][0] as string[];
    expect(call).toEqual(expect.arrayContaining(['issue', 'create', '--title', 'Title line', '--body', 'body text', '--label', 'enhancement']));
  });

  it('markDone：gh issue close', async () => {
    runGh.mockReturnValue('');
    const be = new GitHubIssuesBackend({ archivedLabel: null, typeLabels: {} });
    await be.markDone('feature', '42');
    expect(runGh).toHaveBeenCalledWith(['issue', 'close', '42']);
  });

  it('reopen：gh issue reopen', async () => {
    runGh.mockReturnValue('');
    const be = new GitHubIssuesBackend({ archivedLabel: null, typeLabels: {} });
    await be.reopen('feature', '42');
    expect(runGh).toHaveBeenCalledWith(['issue', 'reopen', '42']);
  });

  it('edit：更新 title/body', async () => {
    runGh.mockReturnValue('');
    const be = new GitHubIssuesBackend({ archivedLabel: null, typeLabels: {} });
    await be.edit('feature', '42', 'New title\nnew body');
    const call = runGh.mock.calls[0][0] as string[];
    expect(call).toEqual(expect.arrayContaining(['issue', 'edit', '42', '--title', 'New title', '--body', 'new body']));
  });

  it('remove：close + 加 wontfix label', async () => {
    runGh.mockReturnValue('');
    const be = new GitHubIssuesBackend({ archivedLabel: null, typeLabels: {} });
    await be.remove('feature', '42');
    expect(runGh).toHaveBeenCalledWith(['issue', 'edit', '42', '--add-label', 'wontfix']);
    expect(runGh).toHaveBeenCalledWith(['issue', 'close', '42']);
  });

  it('markStarted：IMS 侧 no-op（不调用 gh 写操作）', async () => {
    const be = new GitHubIssuesBackend({ archivedLabel: null, typeLabels: {} });
    await be.markStarted('feature', '42', 'feature/42');
    expect(runGh).not.toHaveBeenCalled();
  });

  it('archive(已配置 label)：给所有无 label 的 closed 加 archivedLabel', async () => {
    runGh
      .mockReturnValueOnce(JSON.stringify([{ number: 8, title: 'H', body: '', labels: [] }]))
      .mockReturnValue('');
    const be = new GitHubIssuesBackend({ archivedLabel: 'colyn-archived', typeLabels: {} });
    await be.archive();
    expect(runGh).toHaveBeenCalledWith(['issue', 'edit', '8', '--add-label', 'colyn-archived']);
  });

  it('archive(未配置 label)：no-op', async () => {
    const be = new GitHubIssuesBackend({ archivedLabel: null, typeLabels: {} });
    await be.archive();
    expect(runGh).not.toHaveBeenCalled();
  });
});

describe('GitHubIssuesBackend.find', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureGhRepo.mockReturnValue('owner/repo');
  });

  it('open issue 有分支 → in-progress', async () => {
    runGh.mockReturnValue(JSON.stringify({ number: 10, title: 'T', body: 'B', labels: [{ name: 'feature' }], state: 'open' }));
    branchExistsAnywhere.mockResolvedValue(true);
    const be = new GitHubIssuesBackend({ archivedLabel: null, typeLabels: {} });
    const item = await be.find('feature', '10');
    expect(item?.status).toBe('in-progress');
    expect(item?.name).toBe('10');
    expect(item?.message).toBe('T\nB');
  });

  it('open issue 无分支 → pending', async () => {
    runGh.mockReturnValue(JSON.stringify({ number: 11, title: 'T', body: '', labels: [], state: 'open' }));
    branchExistsAnywhere.mockResolvedValue(false);
    const be = new GitHubIssuesBackend({ archivedLabel: null, typeLabels: {} });
    const item = await be.find('feature', '11');
    expect(item?.status).toBe('pending');
  });

  it('closed issue → done', async () => {
    runGh.mockReturnValue(JSON.stringify({ number: 12, title: 'T', body: '', labels: [], state: 'CLOSED' }));
    const be = new GitHubIssuesBackend({ archivedLabel: null, typeLabels: {} });
    const item = await be.find('feature', '12');
    expect(item?.status).toBe('done');
  });

  it('带 wontfix label → null', async () => {
    runGh.mockReturnValue(JSON.stringify({ number: 13, title: 'T', body: '', labels: [{ name: 'wontfix' }], state: 'open' }));
    const be = new GitHubIssuesBackend({ archivedLabel: null, typeLabels: {} });
    expect(await be.find('feature', '13')).toBeNull();
  });

  it('runGh 抛错（issue 不存在）→ null', async () => {
    runGh.mockImplementation(() => { throw new Error('not found'); });
    const be = new GitHubIssuesBackend({ archivedLabel: null, typeLabels: {} });
    expect(await be.find('feature', '999')).toBeNull();
  });
});

describe('githubProvider.detect', () => {
  const ctx = { projectRoot: '/p', mainDirPath: '/p/main', nonInteractive: false };
  beforeEach(() => { vi.clearAllMocks(); });

  it('origin 含 github.com → true（ssh）', async () => {
    getOriginUrl.mockResolvedValue('git@github.com:owner/repo.git');
    expect(await githubProvider.detect(ctx)).toBe(true);
  });
  it('origin 含 github.com → true（https）', async () => {
    getOriginUrl.mockResolvedValue('https://github.com/owner/repo.git');
    expect(await githubProvider.detect(ctx)).toBe(true);
  });
  it('非 github origin → false', async () => {
    getOriginUrl.mockResolvedValue('git@gitlab.com:owner/repo.git');
    expect(await githubProvider.detect(ctx)).toBe(false);
  });
  it('无 origin → false', async () => {
    getOriginUrl.mockResolvedValue(null);
    expect(await githubProvider.detect(ctx)).toBe(false);
  });
});
