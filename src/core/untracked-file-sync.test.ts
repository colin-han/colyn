import { describe, it, expect } from 'vitest';
import { filePatternToRegex, planUntrackedFileSync } from './untracked-file-sync.js';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as pathMod from 'path';
import simpleGit from 'simple-git';
import { resolveSyncFileCandidates } from './untracked-file-sync.js';

describe('filePatternToRegex', () => {
  it('精确路径只匹配自身', () => {
    const re = filePatternToRegex('data/seed.json');
    expect(re.test('data/seed.json')).toBe(true);
    expect(re.test('data/other.json')).toBe(false);
    expect(re.test('sub/data/seed.json')).toBe(false);
  });

  it('* 匹配单段（不跨 /）', () => {
    const re = filePatternToRegex('data/*.json');
    expect(re.test('data/seed.json')).toBe(true);
    expect(re.test('data/a/b.json')).toBe(false);
    expect(re.test('data/seed.txt')).toBe(false);
  });

  it('.env.* 匹配 .env.local / .env.staging', () => {
    const re = filePatternToRegex('.env.*');
    expect(re.test('.env.local')).toBe(true);
    expect(re.test('.env.staging')).toBe(true);
    expect(re.test('sub/.env.local')).toBe(false);
  });

  it('** 跨目录段匹配', () => {
    const re = filePatternToRegex('certs/**');
    expect(re.test('certs/local.pem')).toBe(true);
    expect(re.test('certs/sub/local.pem')).toBe(true);
    expect(re.test('certs')).toBe(false);
    expect(re.test('other/local.pem')).toBe(false);
  });

  it('特殊字符被转义', () => {
    const re = filePatternToRegex('a.b+c.txt');
    expect(re.test('a.b+c.txt')).toBe(true);
    expect(re.test('aXbYc.txt')).toBe(false);
  });
});

describe('planUntrackedFileSync', () => {
  const files = [
    { path: 'a.json', sourceExists: true, targetExists: false, contentEqual: false },
    { path: 'b.json', sourceExists: true, targetExists: true, contentEqual: true },
    { path: 'c.json', sourceExists: true, targetExists: true, contentEqual: false },
    { path: 'd.json', sourceExists: false, targetExists: true, contentEqual: false },
  ];

  it('决策表：缺失复制 / 相同不动 / 不同冲突 / 源缺失不动', () => {
    expect(planUntrackedFileSync(files)).toEqual({
      toCopy: ['a.json'],
      conflicts: ['c.json'],
      sourceMissing: ['d.json'],
    });
  });

  it('空输入返回空结果', () => {
    expect(planUntrackedFileSync([])).toEqual({ toCopy: [], conflicts: [], sourceMissing: [] });
  });
});

describe('resolveSyncFileCandidates', () => {
  it('通配符匹配源侧文件，排除已跟踪与运行时配置文件', async () => {
    const dir = await fs.mkdtemp(pathMod.join(os.tmpdir(), 'colyn-sync-'));
    try {
      // 准备：git 仓库 + 各类文件
      const git = simpleGit(dir);
      await git.init();
      await git.addConfig('user.email', 'test@example.com');
      await git.addConfig('user.name', 'test');
      await fs.writeFile(pathMod.join(dir, 'README.md'), 'readme');
      await fs.writeFile(pathMod.join(dir, 'tracked.json'), '{}');
      await fs.writeFile(pathMod.join(dir, '.env.local'), 'PORT=3000');
      await fs.writeFile(pathMod.join(dir, '.env.staging'), 'PORT=4000');
      await fs.mkdir(pathMod.join(dir, 'data'), { recursive: true });
      await fs.writeFile(pathMod.join(dir, 'data', 'seed.json'), '{}');
      await fs.mkdir(pathMod.join(dir, 'certs', 'sub'), { recursive: true });
      await fs.writeFile(pathMod.join(dir, 'certs', 'sub', 'local.pem'), 'pem');
      // 不参与匹配的目录
      await fs.mkdir(pathMod.join(dir, 'node_modules', 'pkg'), { recursive: true });
      await fs.writeFile(pathMod.join(dir, 'node_modules', 'pkg', 'x.json'), '{}');
      await git.add(['README.md', 'tracked.json']);
      await git.commit('init');

      const { candidates, skipped } = await resolveSyncFileCandidates(
        dir,
        ['.env.*', 'data/*.json', 'certs/**', 'tracked.json'],
        dir
      );

      expect(candidates.sort()).toEqual(['.env.staging', 'certs/sub/local.pem', 'data/seed.json']);
      expect(skipped).toContainEqual({ path: 'tracked.json', reason: 'tracked' });
      expect(skipped).toContainEqual({ path: '.env.local', reason: 'runtime-config' });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('空清单返回空结果', async () => {
    const { candidates, skipped } = await resolveSyncFileCandidates('/tmp', [], '/tmp');
    expect(candidates).toEqual([]);
    expect(skipped).toEqual([]);
  });
});
