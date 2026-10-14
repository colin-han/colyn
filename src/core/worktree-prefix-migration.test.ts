/**
 * worktree-prefix-migration.test.ts
 * repair：把旧前缀的 worktree 目录重命名为当前前缀
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import simpleGit from 'simple-git';
import { migrateWorktreePrefix } from './worktree-prefix-migration.js';

let rootDir: string;
let mainDir: string;
let worktreesDir: string;
let configDir: string;

beforeEach(async () => {
  rootDir = mkdtempSync(path.join(tmpdir(), 'colyn-mig-'));
  mainDir = path.join(rootDir, 'main');
  worktreesDir = path.join(rootDir, 'worktrees');
  configDir = path.join(rootDir, '.colyn');
  mkdirSync(mainDir);
  mkdirSync(worktreesDir);
  mkdirSync(configDir);

  const git = simpleGit(mainDir);
  await git.init();
  await git.addConfig('user.email', 'test@example.com');
  await git.addConfig('user.name', 'test');
  writeFileSync(path.join(mainDir, 'README.md'), 'x');
  await git.add('.');
  await git.commit('init');
  await git.raw(['worktree', 'add', '-b', 'feat/a', path.join(worktreesDir, 'task-1')]);
  writeFileSync(path.join(worktreesDir, 'task-1', '.env.local'), 'WORKTREE=1\n');
  writeFileSync(
    path.join(configDir, 'status.json'),
    JSON.stringify({
      updatedAt: '2026-01-01T00:00:00.000Z',
      worktrees: { 'task-1': { status: 'running', updatedAt: '2026-01-01T00:00:00.000Z' } },
    })
  );
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

describe('migrateWorktreePrefix', () => {
  it('当前前缀为 task 时无事可做', async () => {
    const result = await migrateWorktreePrefix({ mainDir, worktreesDir, configDir, prefix: 'task' });
    expect(result.renamed).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(existsSync(path.join(worktreesDir, 'task-1'))).toBe(true);
  });

  it('把 git 已登记的 task-1 重命名为 edt-1，并迁移 git 元数据与状态键', async () => {
    const result = await migrateWorktreePrefix({ mainDir, worktreesDir, configDir, prefix: 'edt' });

    expect(result.renamed).toEqual([{ from: 'task-1', to: 'edt-1' }]);
    expect(result.failed).toEqual([]);
    expect(existsSync(path.join(worktreesDir, 'edt-1'))).toBe(true);
    expect(existsSync(path.join(worktreesDir, 'task-1'))).toBe(false);

    // git 仍能识别该 worktree 且分支不变
    const list = await simpleGit(mainDir).raw(['worktree', 'list', '--porcelain']);
    expect(list).toContain(path.join(worktreesDir, 'edt-1'));
    expect(list).toContain('refs/heads/feat/a');
    expect((await simpleGit(path.join(worktreesDir, 'edt-1')).branchLocal()).current).toBe('feat/a');

    // 状态键同步迁移
    const status = JSON.parse(readFileSync(path.join(configDir, 'status.json'), 'utf-8'));
    expect(status.worktrees['edt-1'].status).toBe('running');
    expect(status.worktrees['task-1']).toBeUndefined();
  });

  it('未登记在 git 中的目录不重命名', async () => {
    mkdirSync(path.join(worktreesDir, 'foo-7'));
    const result = await migrateWorktreePrefix({ mainDir, worktreesDir, configDir, prefix: 'edt' });
    expect(result.renamed).toEqual([{ from: 'task-1', to: 'edt-1' }]);
    expect(existsSync(path.join(worktreesDir, 'foo-7'))).toBe(true);
  });

  it('目标目录已存在时记录失败并跳过', async () => {
    mkdirSync(path.join(worktreesDir, 'edt-1'));
    const result = await migrateWorktreePrefix({ mainDir, worktreesDir, configDir, prefix: 'edt' });
    expect(result.renamed).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].from).toBe('task-1');
    expect(existsSync(path.join(worktreesDir, 'task-1'))).toBe(true);
  });
});
