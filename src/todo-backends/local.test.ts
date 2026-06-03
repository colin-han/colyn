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

    const be = new LocalFileBackend('/cfg');
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

    const be = new LocalFileBackend('/cfg');
    expect(await be.list('done')).toHaveLength(1);
    expect(await be.list('in-progress')).toHaveLength(0);
  });

  it('旧 completed 无 branch 字段 → done', async () => {
    readTodoFile.mockResolvedValue({ todos: [mk({ status: 'completed', name: 'x' })] });
    const be = new LocalFileBackend('/cfg');
    expect(await be.list('done')).toHaveLength(1);
    expect(localBranchExists).not.toHaveBeenCalled();
  });

  it('归一化后写回 todo.json（一次性迁移）', async () => {
    readTodoFile.mockResolvedValue({ todos: [mk({ status: 'completed', name: 'x' })] });
    const be = new LocalFileBackend('/cfg');
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
    const be = new LocalFileBackend('/cfg');
    expect(await be.list('archived')).toHaveLength(1);
  });
});

describe('LocalFileBackend 写操作', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveTodoFile.mockResolvedValue(undefined);
    saveArchivedTodoFile.mockResolvedValue(undefined);
    readArchivedTodoFile.mockResolvedValue({ todos: [] });
  });

  it('add 新建 pending', async () => {
    readTodoFile.mockResolvedValue({ todos: [] });
    const be = new LocalFileBackend('/cfg');
    const item = await be.add({ type: 'feature', name: 'login', message: 'do login' });
    expect(item.status).toBe('pending');
    expect(item.name).toBe('login');
    expect(saveTodoFile).toHaveBeenCalledWith('/cfg',
      { todos: [expect.objectContaining({ type: 'feature', name: 'login', status: 'pending' })] });
  });

  it('markStarted → in-progress 并写 branch/startedAt', async () => {
    readTodoFile.mockResolvedValue({ todos: [mk({ status: 'pending', name: 'login' })] });
    const be = new LocalFileBackend('/cfg');
    await be.markStarted('feature', 'login', 'feature/login');
    expect(saveTodoFile).toHaveBeenCalledWith('/cfg', {
      todos: [expect.objectContaining({ status: 'in-progress', branch: 'feature/login' })],
    });
  });

  it('markDone → done，不归档', async () => {
    readTodoFile.mockResolvedValue({ todos: [mk({ status: 'in-progress', name: 'login' })] });
    const be = new LocalFileBackend('/cfg');
    await be.markDone('feature', 'login');
    expect(saveTodoFile).toHaveBeenCalledWith('/cfg', {
      todos: [expect.objectContaining({ status: 'done' })],
    });
    expect(saveArchivedTodoFile).not.toHaveBeenCalled();
  });

  it('reopen：done → in-progress', async () => {
    readTodoFile.mockResolvedValue({ todos: [mk({ status: 'done', name: 'login', branch: 'feature/login' })] });
    const be = new LocalFileBackend('/cfg');
    await be.reopen('feature', 'login');
    expect(saveTodoFile).toHaveBeenCalledWith('/cfg', {
      todos: [expect.objectContaining({ status: 'in-progress' })],
    });
  });

  it('reopen：从 archived 取回 → in-progress 并移出归档', async () => {
    readTodoFile.mockResolvedValue({ todos: [] });
    readArchivedTodoFile.mockResolvedValue({
      todos: [mk({ status: 'done', name: 'login', archivedAt: '2026-02-01T00:00:00Z' })],
    });
    const be = new LocalFileBackend('/cfg');
    await be.reopen('feature', 'login');
    expect(saveArchivedTodoFile).toHaveBeenCalledWith('/cfg', { todos: [] });
    expect(saveTodoFile).toHaveBeenCalledWith('/cfg', {
      todos: [expect.objectContaining({ status: 'in-progress', name: 'login' })],
    });
    // 确认写回 active 的项不含 archivedAt（objectContaining 会忽略多余字段，需单独验证）
    const savedTodos = saveTodoFile.mock.calls.at(-1)?.[1]?.todos;
    expect(savedTodos?.[0]).not.toHaveProperty('archivedAt');
  });

  it('edit 修改 message', async () => {
    readTodoFile.mockResolvedValue({ todos: [mk({ status: 'pending', name: 'login', message: 'old' })] });
    const be = new LocalFileBackend('/cfg');
    await be.edit('feature', 'login', 'new msg');
    expect(saveTodoFile).toHaveBeenCalledWith('/cfg', {
      todos: [expect.objectContaining({ message: 'new msg' })],
    });
  });

  it('remove 从 active 删除', async () => {
    readTodoFile.mockResolvedValue({ todos: [mk({ status: 'pending', name: 'login' })] });
    const be = new LocalFileBackend('/cfg');
    await be.remove('feature', 'login');
    expect(saveTodoFile).toHaveBeenCalledWith('/cfg', { todos: [] });
  });

  it('archive 把所有 done 移入归档', async () => {
    readTodoFile.mockResolvedValue({
      todos: [mk({ status: 'done', name: 'a' }), mk({ status: 'pending', name: 'b' })],
    });
    const be = new LocalFileBackend('/cfg');
    await be.archive();
    expect(saveTodoFile).toHaveBeenCalledWith('/cfg', {
      todos: [expect.objectContaining({ name: 'b', status: 'pending' })],
    });
    expect(saveArchivedTodoFile).toHaveBeenCalledWith('/cfg', {
      todos: [expect.objectContaining({ name: 'a', archivedAt: expect.any(String) })],
    });
  });
});
