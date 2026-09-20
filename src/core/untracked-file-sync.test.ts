import { describe, it, expect } from 'vitest';
import { filePatternToRegex, planUntrackedFileSync } from './untracked-file-sync.js';

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
