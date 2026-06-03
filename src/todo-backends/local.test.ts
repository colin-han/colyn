import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  readTodoFile, saveTodoFile, readArchivedTodoFile, saveArchivedTodoFile,
  localBranchExists,
} = vi.hoisted(() => ({
  readTodoFile: vi.fn(),
  saveTodoFile: vi.fn(),
  readArchivedTodoFile: vi.fn(),
  saveArchivedTodoFile: vi.fn(),
  localBranchExists: vi.fn(),
}));

vi.mock('../commands/todo.helpers.js', () => ({
  readTodoFile, saveTodoFile, readArchivedTodoFile, saveArchivedTodoFile,
}));

vi.mock('../core/git.js', () => ({ localBranchExists }));

import { LocalFileBackend } from './local.js';

const mk = (over: Record<string, unknown>) => ({
  type: 'feature', name: 'x', message: 'm', createdAt: '2026-01-01T00:00:00Z', ...over,
});

describe('LocalFileBackend.list 归一化', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveTodoFile.mockResolvedValue(undefined);
    readArchivedTodoFile.mockResolvedValue({ todos: [] });
  });

  it('旧 completed + 本地分支存在 → in-progress', async () => {
    readTodoFile.mockResolvedValue({
      todos: [mk({ status: 'completed', branch: 'feature/x', name: 'x' })],
    });
    localBranchExists.mockResolvedValue(true);

    const be = new LocalFileBackend('/cfg', false);
    const items = await be.list('in-progress');

    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('in-progress');
    expect(await be.list('done')).toHaveLength(0);
  });

  it('旧 completed + 本地分支不存在 → done', async () => {
    readTodoFile.mockResolvedValue({
      todos: [mk({ status: 'completed', branch: 'feature/x', name: 'x' })],
    });
    localBranchExists.mockResolvedValue(false);

    const be = new LocalFileBackend('/cfg', false);
    expect(await be.list('done')).toHaveLength(1);
    expect(await be.list('in-progress')).toHaveLength(0);
  });

  it('旧 completed 无 branch 字段 → done', async () => {
    readTodoFile.mockResolvedValue({ todos: [mk({ status: 'completed', name: 'x' })] });
    const be = new LocalFileBackend('/cfg', false);
    expect(await be.list('done')).toHaveLength(1);
    expect(localBranchExists).not.toHaveBeenCalled();
  });

  it('归一化后写回 todo.json（一次性迁移）', async () => {
    readTodoFile.mockResolvedValue({ todos: [mk({ status: 'completed', name: 'x' })] });
    const be = new LocalFileBackend('/cfg', false);
    await be.list('done');
    expect(saveTodoFile).toHaveBeenCalledWith('/cfg', {
      todos: [expect.objectContaining({ status: 'done' })],
    });
  });

  it('list(archived) 读 archived-todo.json', async () => {
    readTodoFile.mockResolvedValue({ todos: [] });
    readArchivedTodoFile.mockResolvedValue({
      todos: [mk({ status: 'done', archivedAt: '2026-02-01T00:00:00Z', name: 'a' })],
    });
    const be = new LocalFileBackend('/cfg', false);
    expect(await be.list('archived')).toHaveLength(1);
  });
});
