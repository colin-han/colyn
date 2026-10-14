/**
 * discovery.test.ts
 * worktree 发现逻辑对可配置前缀的支持
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { getNextWorktreeId, getCurrentWorktreeId, discoverWorktrees } from './discovery.js';

let base: string;
let worktreesDir: string;
const originalCwd = process.cwd();

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), 'colyn-disc-'));
  worktreesDir = path.join(base, 'worktrees');
  mkdirSync(worktreesDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(base, { recursive: true, force: true });
});

describe('getNextWorktreeId', () => {
  it('只统计当前前缀的目录', async () => {
    mkdirSync(path.join(worktreesDir, 'task-5'));
    mkdirSync(path.join(worktreesDir, 'edt-2'));
    expect(await getNextWorktreeId(worktreesDir, 'edt')).toBe(3);
    expect(await getNextWorktreeId(worktreesDir, 'task')).toBe(6);
  });
});

describe('getCurrentWorktreeId', () => {
  it('目录名前缀与配置一致时返回 ID', async () => {
    const wt = path.join(worktreesDir, 'edt-2');
    mkdirSync(wt);
    writeFileSync(path.join(wt, '.env.local'), 'WORKTREE=2\n');
    process.chdir(wt);
    expect(await getCurrentWorktreeId('edt')).toBe(2);
  });

  it('目录名前缀与配置不一致时视为不在 worktree 中', async () => {
    const wt = path.join(worktreesDir, 'task-2');
    mkdirSync(wt);
    writeFileSync(path.join(wt, '.env.local'), 'WORKTREE=2\n');
    process.chdir(wt);
    expect(await getCurrentWorktreeId('edt')).toBeNull();
  });
});

describe('discoverWorktrees（非 git 目录回退扫描）', () => {
  it('只发现当前前缀的目录', async () => {
    mkdirSync(path.join(worktreesDir, 'edt-1'));
    mkdirSync(path.join(worktreesDir, 'task-1'));
    const mainDir = path.join(base, 'main');
    mkdirSync(mainDir);
    const found = await discoverWorktrees(mainDir, worktreesDir, 'edt');
    expect(found.map(w => path.basename(w.path))).toEqual(['edt-1']);
  });
});
