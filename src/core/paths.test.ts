/**
 * paths.test.ts
 * ProjectPaths 中 worktreePrefix 的解析
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { getProjectPaths, buildProjectPaths } from './paths.js';

let rootDir: string;

beforeEach(() => {
  const base = mkdtempSync(path.join(tmpdir(), 'colyn-paths-'));
  rootDir = path.join(base, 'proj');
  mkdirSync(path.join(rootDir, 'proj'), { recursive: true });
  mkdirSync(path.join(rootDir, 'worktrees'));
  mkdirSync(path.join(rootDir, '.colyn'));
});

afterEach(() => {
  rmSync(path.dirname(rootDir), { recursive: true, force: true });
});

describe('buildProjectPaths', () => {
  it('未指定前缀时使用默认 task', () => {
    expect(buildProjectPaths(rootDir).worktreePrefix).toBe('task');
  });

  it('可显式指定前缀', () => {
    expect(buildProjectPaths(rootDir, 'edt').worktreePrefix).toBe('edt');
  });
});

describe('getProjectPaths', () => {
  it('无项目配置时前缀为 task', async () => {
    const paths = await getProjectPaths(rootDir);
    expect(paths.worktreePrefix).toBe('task');
  });

  it('项目配置 worktreePrefix=edt 时读取之', async () => {
    writeFileSync(
      path.join(rootDir, '.colyn', 'settings.json'),
      JSON.stringify({ version: 5, worktreePrefix: 'edt' })
    );
    const paths = await getProjectPaths(rootDir);
    expect(paths.worktreePrefix).toBe('edt');
  });
});
