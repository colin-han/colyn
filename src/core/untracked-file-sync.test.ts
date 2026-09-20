import { describe, it, expect, vi, beforeEach } from 'vitest';
import { filePatternToRegex, planUntrackedFileSync } from './untracked-file-sync.js';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as pathMod from 'path';
import simpleGit from 'simple-git';
import { resolveSyncFileCandidates } from './untracked-file-sync.js';

vi.mock('./config-loader.js', () => ({
  loadUserConfig: vi.fn().mockResolvedValue(null),
  loadProjectConfig: vi.fn(),
}));

vi.mock('./config-merger.js', () => ({
  mergeConfigs: vi.fn((_user: unknown, project: unknown) => project),
}));

vi.mock('../utils/logger.js', () => ({
  output: vi.fn(),
  outputSuccess: vi.fn(),
  outputWarning: vi.fn(),
  outputError: vi.fn(),
}));

import { loadProjectConfig } from './config-loader.js';
import { outputSuccess, outputError } from '../utils/logger.js';
import { syncUntrackedFiles } from './untracked-file-sync.js';

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

  it('? 被转义为字面量', () => {
    const re = filePatternToRegex('data/seed?.json');
    expect(re.test('data/seed?.json')).toBe(true);
    expect(re.test('data/see.json')).toBe(false);
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

describe('syncUntrackedFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function prepare(): Promise<{ mainDir: string; worktreeDir: string }> {
    const root = await fs.mkdtemp(pathMod.join(os.tmpdir(), 'colyn-syncfull-'));
    const mainDir = pathMod.join(root, 'main');
    const worktreeDir = pathMod.join(root, 'task-1');
    const git = simpleGit(root);
    await git.init();
    await git.addConfig('user.email', 'test@example.com');
    await git.addConfig('user.name', 'test');
    await fs.mkdir(mainDir, { recursive: true });
    await fs.mkdir(worktreeDir, { recursive: true });
    await fs.writeFile(pathMod.join(mainDir, 'README.md'), 'readme');
    await git.add('main/README.md');
    await git.commit('init');
    return { mainDir, worktreeDir };
  }

  it('目标缺失的文件被复制，内容不同的文件报冲突且不写入', async () => {
    const { mainDir, worktreeDir } = await prepare();
    try {
      // patterns：only.json 仅主分支有；both.json 两侧都有且不同
      (loadProjectConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        version: 4, syncFiles: ['only.json', 'both.json'],
      });
      await fs.writeFile(pathMod.join(mainDir, 'only.json'), 'A');
      await fs.writeFile(pathMod.join(mainDir, 'both.json'), 'main-version');
      await fs.writeFile(pathMod.join(worktreeDir, 'both.json'), 'worktree-version');

      await syncUntrackedFiles({
        rootDir: pathMod.dirname(mainDir),
        mainDir,
        worktreePath: worktreeDir,
        direction: 'main-to-worktree',
      });

      // 复制发生
      expect(await fs.readFile(pathMod.join(worktreeDir, 'only.json'), 'utf-8')).toBe('A');
      // 冲突文件未被覆盖
      expect(await fs.readFile(pathMod.join(worktreeDir, 'both.json'), 'utf-8')).toBe('worktree-version');
      // 输出包含复制与冲突提示
      expect(outputSuccess).toHaveBeenCalled();
      expect(outputError).toHaveBeenCalled();
    } finally {
      await fs.rm(pathMod.dirname(mainDir), { recursive: true, force: true });
    }
  });

  it('清单为空时零行为', async () => {
    const { mainDir, worktreeDir } = await prepare();
    try {
      (loadProjectConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        version: 4, syncFiles: [],
      });
      await fs.writeFile(pathMod.join(mainDir, 'only.json'), 'A');
      await syncUntrackedFiles({
        rootDir: pathMod.dirname(mainDir), mainDir, worktreePath: worktreeDir,
        direction: 'main-to-worktree',
      });
      expect(await fs.access(pathMod.join(worktreeDir, 'only.json')).then(() => true, () => false)).toBe(false);
      expect(outputSuccess).not.toHaveBeenCalled();
    } finally {
      await fs.rm(pathMod.dirname(mainDir), { recursive: true, force: true });
    }
  });

  it('worktree→main 方向：枚举源侧（worktree）文件并带回主分支', async () => {
    const { mainDir, worktreeDir } = await prepare();
    try {
      (loadProjectConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        version: 4, syncFiles: ['gen.json'],
      });
      await fs.writeFile(pathMod.join(worktreeDir, 'gen.json'), 'generated');

      await syncUntrackedFiles({
        rootDir: pathMod.dirname(mainDir), mainDir, worktreePath: worktreeDir,
        direction: 'worktree-to-main',
      });

      expect(await fs.readFile(pathMod.join(mainDir, 'gen.json'), 'utf-8')).toBe('generated');
    } finally {
      await fs.rm(pathMod.dirname(mainDir), { recursive: true, force: true });
    }
  });
});
