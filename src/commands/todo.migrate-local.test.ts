import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TodoItem } from '../types/index.js';

// ── hoisted mocks（必须在任何 import 之前声明）──────────────────────────────
const {
  getTodoConfig,
  getActiveTodoBackend,
  mockLocalList,
  mockLocalRemove,
  mockPrompt,
  outputInfo,
  outputSuccess,
  outputError,
} = vi.hoisted(() => {
  const mockLocalList = vi.fn();
  const mockLocalRemove = vi.fn();

  return {
    getTodoConfig: vi.fn(),
    getActiveTodoBackend: vi.fn(),
    mockLocalList,
    mockLocalRemove,
    mockPrompt: vi.fn(),
    outputInfo: vi.fn(),
    outputSuccess: vi.fn(),
    outputError: vi.fn(),
  };
});

vi.mock('../core/config.js', () => ({ getTodoConfig }));
vi.mock('../todo-backends/registry.js', () => ({ getActiveTodoBackend }));
vi.mock('../todo-backends/local.js', () => ({
  LocalFileBackend: vi.fn().mockImplementation(() => ({
    list: mockLocalList,
    remove: mockLocalRemove,
  })),
}));
// todo.ts 顶层执行 `const { prompt } = Enquirer`，所以需要让 default export 的 prompt 属性
// 指向 mockPrompt，且是同一个引用（不能直接解构，否则后续 mockReturnValueOnce 不生效）。
// 用一个代理对象，确保 .prompt 始终是 mockPrompt。
vi.mock('enquirer', () => {
  const mockDefault = { prompt: mockPrompt };
  return { default: mockDefault, prompt: mockPrompt };
});
vi.mock('../utils/logger.js', () => ({
  output: vi.fn(),
  outputLine: vi.fn(),
  outputSuccess,
  outputError,
  outputInfo,
  outputWarning: vi.fn(),
  formatError: vi.fn(),
}));

// ── 被测函数 ────────────────────────────────────────────────────────────────
import { migrateLocalTodos } from './todo.js';

// ── 测试数据 ────────────────────────────────────────────────────────────────
const PATHS = {
  rootDir: '/proj',
  mainDirName: 'colyn',
  mainDir: '/proj/colyn',
  worktreesDir: '/proj/worktrees',
  configDir: '/proj/.colyn',
};

const mkTodo = (over: Partial<TodoItem>): TodoItem => ({
  type: 'feature',
  name: 'foo',
  message: 'do foo',
  status: 'pending',
  createdAt: '2026-01-01T00:00:00Z',
  ...over,
});

// ── describe ────────────────────────────────────────────────────────────────
describe('migrateLocalTodos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalRemove.mockResolvedValue(undefined);
  });

  // ── 分支 1：backend 已是 local，提前返回 ──────────────────────────────────
  it('backend === local → 提前返回，不读本地也不调用 getActiveTodoBackend', async () => {
    getTodoConfig.mockResolvedValue({ backend: 'local' });

    await migrateLocalTodos(PATHS);

    expect(outputInfo).toHaveBeenCalledTimes(1);
    expect(mockLocalList).not.toHaveBeenCalled();
    expect(getActiveTodoBackend).not.toHaveBeenCalled();
  });

  // ── 分支 2：无未完成项，提前返回 ─────────────────────────────────────────
  it('无未完成项 → 提前返回，不调用 getActiveTodoBackend', async () => {
    getTodoConfig.mockResolvedValue({ backend: 'github' });
    // list('pending') → []，list('in-progress') → []
    mockLocalList
      .mockResolvedValueOnce([])  // pending
      .mockResolvedValueOnce([]); // in-progress

    await migrateLocalTodos(PATHS);

    expect(outputInfo).toHaveBeenCalledTimes(1);
    expect(getActiveTodoBackend).not.toHaveBeenCalled();
  });

  // ── 分支 3：逐项 confirm，确认的项调用 backend.add，跳过的项不 add ────────
  it('有未完成项：确认的项 add，跳过的项不 add', async () => {
    getTodoConfig.mockResolvedValue({ backend: 'github' });
    const todo1 = mkTodo({ name: 'foo', message: 'do foo', status: 'pending' });
    const todo2 = mkTodo({ name: 'bar', message: 'do bar', status: 'in-progress' });
    // list('pending') 返回 [todo1]，list('in-progress') 返回 [todo2]
    mockLocalList
      .mockResolvedValueOnce([todo1])   // pending
      .mockResolvedValueOnce([todo2]);  // in-progress

    const mockBackendAdd = vi.fn().mockResolvedValue({ type: 'feature', name: 'ISSUE-1', message: 'do foo' });
    getActiveTodoBackend.mockResolvedValue({ add: mockBackendAdd });

    // todo1 确认，todo2 跳过；最终删除确认拒绝
    mockPrompt
      .mockResolvedValueOnce({ confirm: true })   // todo1 confirm
      .mockResolvedValueOnce({ confirm: false })  // todo2 skip
      .mockResolvedValueOnce({ confirm: false }); // 最终删除确认：拒绝

    await migrateLocalTodos(PATHS);

    expect(mockBackendAdd).toHaveBeenCalledTimes(1);
    expect(mockBackendAdd).toHaveBeenCalledWith({ type: 'feature', message: 'do foo' });
  });

  // ── 分支 4：单项 add 抛错 → 不中断，继续处理后续项，failed 计数，不删除该项 ─
  it('单项 add 抛错 → 继续处理后续项，失败项不进入 migrated（不被 remove）', async () => {
    getTodoConfig.mockResolvedValue({ backend: 'github' });
    const todo1 = mkTodo({ name: 'fail-me', message: 'will fail', status: 'pending' });
    const todo2 = mkTodo({ name: 'ok', message: 'will succeed', status: 'pending' });
    mockLocalList
      .mockResolvedValueOnce([todo1, todo2])  // pending
      .mockResolvedValueOnce([]);             // in-progress

    const mockBackendAdd = vi.fn()
      .mockRejectedValueOnce(new Error('API error'))   // todo1 失败
      .mockResolvedValueOnce({ type: 'feature', name: 'ISSUE-2', message: 'will succeed' }); // todo2 成功
    getActiveTodoBackend.mockResolvedValue({ add: mockBackendAdd });

    // 两项都 confirm；最终删除确认：同意删除已迁移项
    mockPrompt
      .mockResolvedValueOnce({ confirm: true })   // todo1
      .mockResolvedValueOnce({ confirm: true })   // todo2
      .mockResolvedValueOnce({ confirm: true });  // 最终删除确认

    await migrateLocalTodos(PATHS);

    // outputError 应被调用（todo1 失败报告）
    expect(outputError).toHaveBeenCalledTimes(1);
    // 只有 todo2 成功迁移，所以 remove 只调用一次（针对 todo2）
    expect(mockLocalRemove).toHaveBeenCalledTimes(1);
    expect(mockLocalRemove).toHaveBeenCalledWith('feature', 'ok');
    // 确保 todo1 没有被删除
    expect(mockLocalRemove).not.toHaveBeenCalledWith('feature', 'fail-me');
  });

  // ── 分支 5：migrated.length>0 且确认删除 → remove 每个已迁移项 ──────────
  it('migrated > 0 且最终确认删除 → 对每个迁移项调用 local.remove', async () => {
    getTodoConfig.mockResolvedValue({ backend: 'github' });
    const todo1 = mkTodo({ name: 'alpha', message: 'alpha msg', status: 'pending' });
    const todo2 = mkTodo({ name: 'beta', message: 'beta msg', status: 'pending' });
    mockLocalList
      .mockResolvedValueOnce([todo1, todo2])  // pending
      .mockResolvedValueOnce([]);             // in-progress

    const mockBackendAdd = vi.fn()
      .mockResolvedValueOnce({ type: 'feature', name: 'ISSUE-1', message: 'alpha msg' })
      .mockResolvedValueOnce({ type: 'feature', name: 'ISSUE-2', message: 'beta msg' });
    getActiveTodoBackend.mockResolvedValue({ add: mockBackendAdd });

    // 两项都 confirm；最终删除确认：同意
    mockPrompt
      .mockResolvedValueOnce({ confirm: true })
      .mockResolvedValueOnce({ confirm: true })
      .mockResolvedValueOnce({ confirm: true }); // 最终删除

    await migrateLocalTodos(PATHS);

    expect(mockLocalRemove).toHaveBeenCalledTimes(2);
    expect(mockLocalRemove).toHaveBeenCalledWith('feature', 'alpha');
    expect(mockLocalRemove).toHaveBeenCalledWith('feature', 'beta');
  });

  // ── 分支 6：migrated.length>0 但拒绝最终删除 → 不调用 local.remove ───────
  it('migrated > 0 但拒绝最终确认 → 不调用 local.remove', async () => {
    getTodoConfig.mockResolvedValue({ backend: 'github' });
    const todo1 = mkTodo({ name: 'gamma', message: 'gamma msg', status: 'pending' });
    mockLocalList
      .mockResolvedValueOnce([todo1])  // pending
      .mockResolvedValueOnce([]);      // in-progress

    const mockBackendAdd = vi.fn()
      .mockResolvedValueOnce({ type: 'feature', name: 'ISSUE-3', message: 'gamma msg' });
    getActiveTodoBackend.mockResolvedValue({ add: mockBackendAdd });

    mockPrompt
      .mockResolvedValueOnce({ confirm: true })   // item confirm
      .mockResolvedValueOnce({ confirm: false });  // 最终删除拒绝

    await migrateLocalTodos(PATHS);

    expect(mockLocalRemove).not.toHaveBeenCalled();
  });
});
