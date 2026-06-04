import { describe, it, expect } from 'vitest';
import { strWidth, parseTodoId, resolveTodoId } from './todo.helpers.js';
import { ColynError } from '../types/index.js';
import type { TodoItem } from '../types/index.js';
import type { TodoBackend } from '../types/todo-backend.js';

const mkTodo = (type: string, name: string): TodoItem => ({
  type,
  name,
  message: `${type}/${name}`,
  status: 'pending',
  createdAt: '2026-01-01T00:00:00Z',
});

/** 构造一个仅实现 list 的最小 backend，list 返回所有 todos 中匹配 filter 的项 */
const fakeBackend = (todos: TodoItem[]): TodoBackend =>
  ({
    list: async (filter: string) => todos.filter(t => t.status === filter),
  }) as unknown as TodoBackend;

describe('strWidth', () => {
  it('计算纯 ASCII 字符串宽度', () => {
    expect(strWidth('feat')).toBe(4);
    expect(strWidth('Type')).toBe(4);
    expect(strWidth('')).toBe(0);
  });

  it('计算 CJK 宽字符宽度为 2', () => {
    expect(strWidth('中文')).toBe(4);
    expect(strWidth('中a')).toBe(3);
  });

  describe('emoji abbr 宽度（修复折行问题）', () => {
    // 默认分支分类的 abbr，真实终端显示宽度
    it('✨feat：emoji 计 2 列，总宽 6', () => {
      expect(strWidth('✨feat')).toBe(6);
    });

    it('🐛fix：补充平面 emoji 计 2 列，总宽 5', () => {
      expect(strWidth('🐛fix')).toBe(5);
    });

    it('📝doc：补充平面 emoji 计 2 列，总宽 5', () => {
      expect(strWidth('📝doc')).toBe(5);
    });

    it('♻️ref：文本默认符号 + 变体选择符按 emoji 宽度渲染，总宽 5', () => {
      // ♻ (U+267B) 为文本默认符号，计 1；U+FE0F 计 1（补足升级宽度）；ref 计 3
      expect(strWidth('♻️ref')).toBe(5);
    });
  });

  it('裸 emoji 计 2 列', () => {
    expect(strWidth('🐛')).toBe(2);
    expect(strWidth('✨')).toBe(2);
    expect(strWidth('📝')).toBe(2);
  });
});

describe('parseTodoId', () => {
  it('type/name → 拆分 type 与 name', () => {
    expect(parseTodoId('feature/login')).toEqual({ type: 'feature', name: 'login' });
  });

  it('仅 name → type 为 undefined', () => {
    expect(parseTodoId('login')).toEqual({ name: 'login' });
  });

  it('name 含连字符仍按整体识别', () => {
    expect(parseTodoId('fix-crash')).toEqual({ name: 'fix-crash' });
  });

  it('空串或仅空白 → 抛错', () => {
    expect(() => parseTodoId('')).toThrow();
    expect(() => parseTodoId('   ')).toThrow();
  });

  it('type 或 name 缺失（如 "feature/" 或 "/login"）→ 抛错', () => {
    expect(() => parseTodoId('feature/')).toThrow();
    expect(() => parseTodoId('/login')).toThrow();
  });
});

describe('resolveTodoId', () => {
  it('含 "/" → 直接拆分，不查后端', async () => {
    const backend = fakeBackend([]);
    await expect(resolveTodoId(backend, 'bugfix/login')).resolves.toEqual({
      type: 'bugfix',
      name: 'login',
    });
  });

  it('仅 name 且唯一匹配 → 补全 type', async () => {
    const backend = fakeBackend([mkTodo('bugfix', 'login')]);
    await expect(resolveTodoId(backend, 'login')).resolves.toEqual({
      type: 'bugfix',
      name: 'login',
    });
  });

  it('仅 name 且无匹配 → type 为空串（交由调用方报 notFound）', async () => {
    const backend = fakeBackend([mkTodo('feature', 'other')]);
    await expect(resolveTodoId(backend, 'login')).resolves.toEqual({
      type: '',
      name: 'login',
    });
  });

  it('仅 name 且多 type 同名 → 抛 ColynError（歧义）', async () => {
    const backend = fakeBackend([mkTodo('feature', 'login'), mkTodo('bugfix', 'login')]);
    await expect(resolveTodoId(backend, 'login')).rejects.toBeInstanceOf(ColynError);
  });
});
