/**
 * worktree-naming.test.ts
 * Worktree 目录名的生成与解析（前缀可配置）
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WORKTREE_PREFIX,
  getWorktreeDirName,
  parseWorktreeId,
  isValidWorktreePrefix,
} from './worktree-naming.js';

describe('DEFAULT_WORKTREE_PREFIX', () => {
  it('默认前缀为 task', () => {
    expect(DEFAULT_WORKTREE_PREFIX).toBe('task');
  });
});

describe('getWorktreeDirName', () => {
  it('默认前缀 → task-1', () => {
    expect(getWorktreeDirName('task', 1)).toBe('task-1');
  });

  it('自定义前缀 edt → edt-12', () => {
    expect(getWorktreeDirName('edt', 12)).toBe('edt-12');
  });
});

describe('parseWorktreeId', () => {
  it('匹配当前前缀时返回数字 ID', () => {
    expect(parseWorktreeId('edt', 'edt-3')).toBe(3);
  });

  it('前缀不同时返回 null', () => {
    expect(parseWorktreeId('edt', 'task-3')).toBeNull();
  });

  it('前缀只是另一个前缀的开头时不误匹配', () => {
    expect(parseWorktreeId('task', 'task-abc-1')).toBeNull();
    expect(parseWorktreeId('task', 'tasks-1')).toBeNull();
  });

  it('ID 部分不是纯数字时返回 null', () => {
    expect(parseWorktreeId('task', 'task-')).toBeNull();
    expect(parseWorktreeId('task', 'task-1a')).toBeNull();
  });

  it('前缀含正则特殊字符时按字面匹配', () => {
    expect(parseWorktreeId('a.b', 'a.b-2')).toBe(2);
    expect(parseWorktreeId('a.b', 'axb-2')).toBeNull();
  });
});

describe('isValidWorktreePrefix', () => {
  it('字母开头、仅含字母数字下划线连字符 → 合法', () => {
    for (const p of ['task', 'edt', 'wt_1', 'my-wt', 'A9']) {
      expect(isValidWorktreePrefix(p)).toBe(true);
    }
  });

  it('空串、数字开头、含空格或斜杠 → 非法', () => {
    for (const p of ['', '1task', 'my wt', 'a/b', '-x', '_x', 'tas.k']) {
      expect(isValidWorktreePrefix(p)).toBe(false);
    }
  });
});
