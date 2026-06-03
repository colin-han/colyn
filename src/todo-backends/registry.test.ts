import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getTodoConfig } = vi.hoisted(() => ({ getTodoConfig: vi.fn() }));
vi.mock('../core/config.js', () => ({ getTodoConfig }));

const { readTodoFile, saveTodoFile, readArchivedTodoFile, saveArchivedTodoFile } = vi.hoisted(() => ({
  readTodoFile: vi.fn().mockResolvedValue({ todos: [] }),
  saveTodoFile: vi.fn().mockResolvedValue(undefined),
  readArchivedTodoFile: vi.fn().mockResolvedValue({ todos: [] }),
  saveArchivedTodoFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../commands/todo.helpers.js', () => ({ readTodoFile, saveTodoFile, readArchivedTodoFile, saveArchivedTodoFile }));

const { localBranchExists, branchExistsAnywhere, getOriginUrl } = vi.hoisted(() => ({ localBranchExists: vi.fn(), branchExistsAnywhere: vi.fn(), getOriginUrl: vi.fn().mockResolvedValue(null) }));
vi.mock('../core/git.js', () => ({ localBranchExists, branchExistsAnywhere, getOriginUrl }));

const { runGh, ensureGhRepo } = vi.hoisted(() => ({ runGh: vi.fn(), ensureGhRepo: vi.fn() }));
vi.mock('./gh.js', () => ({ runGh, ensureGhRepo }));

import { getActiveTodoBackend, getProvider, detectProviders } from './registry.js';
import { LocalFileBackend } from './local.js';
import { GitHubIssuesBackend } from './github.js';

const paths = { configDir: '/cfg' } as never;
const ctx = { projectRoot: '/p', mainDirPath: '/p/main', nonInteractive: false };

describe('registry', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('默认返回 LocalFileBackend', async () => {
    getTodoConfig.mockResolvedValue({ backend: 'local', autoArchive: false, github: { archivedLabel: null, typeLabels: {} } });
    const be = await getActiveTodoBackend(paths);
    expect(be).toBeInstanceOf(LocalFileBackend);
    expect(be.name).toBe('local');
  });

  it('未知 backend 名抛 ColynError', async () => {
    getTodoConfig.mockResolvedValue({ backend: 'jira', autoArchive: false, github: { archivedLabel: null, typeLabels: {} } });
    await expect(getActiveTodoBackend(paths)).rejects.toThrow();
  });

  it('getProvider 返回对应 provider', () => {
    expect(getProvider('local')?.name).toBe('local');
    expect(getProvider('nope')).toBeUndefined();
  });

  it('detectProviders：仅 local 时返回 [local]', async () => {
    const detected = await detectProviders(ctx);
    expect(detected.map((p) => p.name)).toContain('local');
  });

  it('autoArchive=true 时 markDone 后自动 archive', async () => {
    getTodoConfig.mockResolvedValue({ backend: 'local', autoArchive: true, github: { archivedLabel: null, typeLabels: {} } });
    const be = await getActiveTodoBackend(paths);
    const archiveSpy = vi.spyOn(be, 'archive').mockResolvedValue(undefined);
    await be.markDone('feature', 'x'); // 底层 todos 为空 → 提前返回（安全 no-op）
    expect(archiveSpy).toHaveBeenCalled();
  });

  it('autoArchive=false 时 markDone 不触发 archive', async () => {
    getTodoConfig.mockResolvedValue({ backend: 'local', autoArchive: false, github: { archivedLabel: null, typeLabels: {} } });
    const be = await getActiveTodoBackend(paths);
    const archiveSpy = vi.spyOn(be, 'archive').mockResolvedValue(undefined);
    await be.markDone('feature', 'x');
    expect(archiveSpy).not.toHaveBeenCalled();
  });

  it('backend=github 返回 GitHubIssuesBackend', async () => {
    getTodoConfig.mockResolvedValue({ backend: 'github', autoArchive: false, github: { archivedLabel: null, typeLabels: {} } });
    const be = await getActiveTodoBackend(paths);
    expect(be).toBeInstanceOf(GitHubIssuesBackend);
    expect(be.name).toBe('github');
  });
});
