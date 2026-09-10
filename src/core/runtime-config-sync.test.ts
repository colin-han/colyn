import { describe, it, expect } from 'vitest';
import { diffRuntimeConfig } from './runtime-config-sync.js';

describe('diffRuntimeConfig', () => {
  const identity = ['PORT', 'WORKTREE'];

  it('主→worktree：worktree 缺失的 key 进入 toAdd', () => {
    const diff = diffRuntimeConfig(
      { PORT: '3000', WORKTREE: 'main', API_KEY: 'v1', NEW_KEY: 'y' },
      { PORT: '3001', WORKTREE: '1', API_KEY: 'v1' },
      'main-to-worktree',
      identity
    );
    expect(diff.toAdd).toEqual({ NEW_KEY: 'y' });
    expect(diff.conflicts).toEqual([]);
  });

  it('主→worktree：两侧值不同的 key 记为冲突，不进入 toAdd', () => {
    const diff = diffRuntimeConfig(
      { PORT: '3000', DATABASE_URL: 'main-db' },
      { PORT: '3001', DATABASE_URL: 'wt-db' },
      'main-to-worktree',
      identity
    );
    expect(diff.toAdd).toEqual({});
    expect(diff.conflicts).toEqual([
      { key: 'DATABASE_URL', mainValue: 'main-db', worktreeValue: 'wt-db' },
    ]);
  });

  it('身份键永不参与同步、永不产生冲突', () => {
    const diff = diffRuntimeConfig(
      { PORT: '3000', WORKTREE: 'main', EXTRA: 'x' },
      { PORT: '3001', WORKTREE: '1' },
      'main-to-worktree',
      identity
    );
    expect(diff.toAdd).toEqual({ EXTRA: 'x' });
    expect(diff.conflicts).toEqual([]);
  });

  it('worktree→主：worktree 独有的 key 进入 toAdd', () => {
    const diff = diffRuntimeConfig(
      { PORT: '3000', WORKTREE: 'main' },
      { PORT: '3001', WORKTREE: '1', OPENAI_KEY: 'sk-x' },
      'worktree-to-main',
      identity
    );
    expect(diff.toAdd).toEqual({ OPENAI_KEY: 'sk-x' });
    expect(diff.conflicts).toEqual([]);
  });

  it('worktree→主：值不同记冲突，不覆盖主分支值', () => {
    const diff = diffRuntimeConfig(
      { API_URL: 'https://main' },
      { API_URL: 'https://mock' },
      'worktree-to-main',
      []
    );
    expect(diff.toAdd).toEqual({});
    expect(diff.conflicts).toEqual([
      { key: 'API_URL', mainValue: 'https://main', worktreeValue: 'https://mock' },
    ]);
  });

  it('目标侧独有的 key 被忽略（永不删除）', () => {
    const diff = diffRuntimeConfig(
      { A: '1' },
      { A: '1', WT_ONLY: 'keep' },
      'main-to-worktree',
      []
    );
    expect(diff.toAdd).toEqual({});
    expect(diff.conflicts).toEqual([]);
  });

  it('空 map 安全处理', () => {
    const diff = diffRuntimeConfig({}, { A: '1' }, 'main-to-worktree', []);
    expect(diff.toAdd).toEqual({});
    expect(diff.conflicts).toEqual([]);
  });
});
