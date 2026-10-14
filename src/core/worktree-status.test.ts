/**
 * worktree-status.test.ts
 * status.json 键重命名
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { renameWorktreeStatusKey } from './worktree-status.js';

let configDir: string;

beforeEach(() => {
  configDir = mkdtempSync(path.join(tmpdir(), 'colyn-status-'));
});

afterEach(() => {
  rmSync(configDir, { recursive: true, force: true });
});

describe('renameWorktreeStatusKey', () => {
  it('把旧键的状态搬到新键并删除旧键', async () => {
    writeFileSync(
      path.join(configDir, 'status.json'),
      JSON.stringify({
        updatedAt: '2026-01-01T00:00:00.000Z',
        worktrees: {
          'task-1': { status: 'running', updatedAt: '2026-01-01T00:00:00.000Z' },
          'task-2': { status: 'idle', updatedAt: '2026-01-01T00:00:00.000Z' },
        },
      })
    );
    await renameWorktreeStatusKey(configDir, 'task-1', 'edt-1');
    const data = JSON.parse(readFileSync(path.join(configDir, 'status.json'), 'utf-8'));
    expect(data.worktrees['edt-1']).toEqual({ status: 'running', updatedAt: '2026-01-01T00:00:00.000Z' });
    expect(data.worktrees['task-1']).toBeUndefined();
    expect(data.worktrees['task-2'].status).toBe('idle');
  });

  it('旧键不存在时不创建文件', async () => {
    await renameWorktreeStatusKey(configDir, 'task-9', 'edt-9');
    expect(existsSync(path.join(configDir, 'status.json'))).toBe(false);
  });
});
