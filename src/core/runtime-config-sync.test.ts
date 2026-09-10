import { describe, it, expect } from 'vitest';
import { diffRuntimeConfig } from './runtime-config-sync.js';
import { vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as pathMod from 'path';

vi.mock('../plugins/index.js', () => ({
  pluginManager: {
    readRuntimeConfig: vi.fn(),
    writeRuntimeConfig: vi.fn(),
    getPortConfig: vi.fn(),
  },
}));

vi.mock('./toolchain-resolver.js', () => ({
  resolveToolchains: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
  output: vi.fn(),
  outputSuccess: vi.fn(),
  outputWarning: vi.fn(),
  outputError: vi.fn(),
  outputLine: vi.fn(),
  outputBold: vi.fn(),
  outputStep: vi.fn(),
}));

import { pluginManager } from '../plugins/index.js';
import { syncRuntimeConfig } from './runtime-config-sync.js';
import { resolveToolchains } from './toolchain-resolver.js';
import { output, outputSuccess, outputWarning } from '../utils/logger.js';
import { syncWorktreeRuntimeConfigs } from './runtime-config-sync.js';

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

describe('syncRuntimeConfig', () => {
  const ctx = {
    absolutePath: '/p/main',
    subPath: '.',
    toolchainName: 'npm',
    toolchainSettings: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ctx 路径：主分支新增 key 合并写入 worktree，身份键保留 worktree 值', async () => {
    vi.mocked(pluginManager.readRuntimeConfig)
      .mockResolvedValueOnce({ PORT: '3000', WORKTREE: 'main', API_KEY: 'v1', NEW: '1' })
      .mockResolvedValueOnce({ PORT: '3001', WORKTREE: '1', API_KEY: 'v1' });

    const result = await syncRuntimeConfig({
      mainDir: '/p/main', worktreePath: '/p/wt/task-1',
      direction: 'main-to-worktree', worktreeId: 1,
      identityKeys: ['PORT', 'WORKTREE'], portKey: 'PORT', ctx,
    });

    expect(result?.addedKeys).toEqual(['NEW']);
    expect(result?.conflicts).toEqual([]);
    expect(result?.rebuilt).toBe(false);
    expect(pluginManager.writeRuntimeConfig).toHaveBeenCalledWith(
      '/p/wt/task-1',
      { PORT: '3001', WORKTREE: '1', API_KEY: 'v1', NEW: '1' },
      ['npm']
    );
  });

  it('ctx 路径：主分支配置缺失返回 null', async () => {
    vi.mocked(pluginManager.readRuntimeConfig).mockResolvedValue(null);

    const result = await syncRuntimeConfig({
      mainDir: '/p/main', worktreePath: '/p/wt/task-1',
      direction: 'main-to-worktree', worktreeId: 1,
      identityKeys: ['PORT', 'WORKTREE'], ctx,
    });

    expect(result).toBeNull();
    expect(pluginManager.writeRuntimeConfig).not.toHaveBeenCalled();
  });

  it('ctx 路径：worktree 文件缺失时重建并重算身份键', async () => {
    vi.mocked(pluginManager.readRuntimeConfig)
      .mockResolvedValueOnce({ PORT: '3000', WORKTREE: 'main', API_KEY: 'v1' })
      .mockResolvedValueOnce(null);

    const result = await syncRuntimeConfig({
      mainDir: '/p/main', worktreePath: '/p/wt/task-2',
      direction: 'main-to-worktree', worktreeId: 2,
      identityKeys: ['PORT', 'WORKTREE'], portKey: 'PORT', ctx,
    });

    expect(result?.rebuilt).toBe(true);
    expect(pluginManager.writeRuntimeConfig).toHaveBeenCalledWith(
      '/p/wt/task-2',
      { PORT: '3002', WORKTREE: '2', API_KEY: 'v1' },
      ['npm']
    );
  });

  it('ctx 路径：worktree→主方向把新增 key 写到主分支侧', async () => {
    vi.mocked(pluginManager.readRuntimeConfig)
      .mockResolvedValueOnce({ PORT: '3000', WORKTREE: 'main' })
      .mockResolvedValueOnce({ PORT: '3001', WORKTREE: '1', OPENAI_KEY: 'sk-x' });

    const result = await syncRuntimeConfig({
      mainDir: '/p/main', worktreePath: '/p/wt/task-1',
      direction: 'worktree-to-main', worktreeId: 1,
      identityKeys: ['PORT', 'WORKTREE'], portKey: 'PORT', ctx,
    });

    expect(result?.addedKeys).toEqual(['OPENAI_KEY']);
    expect(pluginManager.writeRuntimeConfig).toHaveBeenCalledWith(
      '/p/main',
      { PORT: '3000', WORKTREE: 'main', OPENAI_KEY: 'sk-x' },
      ['npm']
    );
  });

  it('ctx 路径：worktree→主方向且 worktree 文件缺失 → 无操作', async () => {
    vi.mocked(pluginManager.readRuntimeConfig)
      .mockResolvedValueOnce({ PORT: '3000', WORKTREE: 'main' })
      .mockResolvedValueOnce(null);

    const result = await syncRuntimeConfig({
      mainDir: '/p/main', worktreePath: '/p/wt/task-1',
      direction: 'worktree-to-main', worktreeId: 1,
      identityKeys: ['PORT', 'WORKTREE'], portKey: 'PORT', ctx,
    });

    expect(result).toEqual({ addedKeys: [], conflicts: [], rebuilt: false });
    expect(pluginManager.writeRuntimeConfig).not.toHaveBeenCalled();
  });

  it('回退路径：无 ctx 时直接操作 .env.local，追加新 key 且保留注释', async () => {
    const dir = await fs.mkdtemp(pathMod.join(os.tmpdir(), 'colyn-sync-'));
    const mainDir = pathMod.join(dir, 'main');
    const wtDir = pathMod.join(dir, 'task-1');
    await fs.mkdir(mainDir); await fs.mkdir(wtDir);
    await fs.writeFile(
      pathMod.join(mainDir, '.env.local'),
      '# main comment\nPORT=3000\nWORKTREE=main\nAPI_KEY=v1\nNEW_KEY=v9\n'
    );
    await fs.writeFile(
      pathMod.join(wtDir, '.env.local'),
      '# wt comment\nPORT=3001\nWORKTREE=1\nAPI_KEY=v1\n'
    );

    const result = await syncRuntimeConfig({
      mainDir, worktreePath: wtDir,
      direction: 'main-to-worktree', worktreeId: 1,
      identityKeys: ['PORT', 'WORKTREE'],
    });

    expect(result?.addedKeys).toEqual(['NEW_KEY']);
    const wtContent = await fs.readFile(pathMod.join(wtDir, '.env.local'), 'utf-8');
    expect(wtContent).toContain('# wt comment');
    expect(wtContent).toContain('NEW_KEY=v9');
    expect(wtContent).toContain('PORT=3001');
    expect(pluginManager.writeRuntimeConfig).not.toHaveBeenCalled();
  });

  it('回退路径：主分支 .env.local 缺失返回 null', async () => {
    const dir = await fs.mkdtemp(pathMod.join(os.tmpdir(), 'colyn-sync-'));
    const wtDir = pathMod.join(dir, 'task-1');
    await fs.mkdir(wtDir);
    await fs.writeFile(pathMod.join(wtDir, '.env.local'), 'PORT=3001\nWORKTREE=1\n');

    const result = await syncRuntimeConfig({
      mainDir: pathMod.join(dir, 'main'), worktreePath: wtDir,
      direction: 'main-to-worktree', worktreeId: 1,
      identityKeys: ['PORT', 'WORKTREE'],
    });

    expect(result).toBeNull();
  });
});

describe('syncWorktreeRuntimeConfigs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('contexts 非空：逐 context 走插件路径并输出新增提示', async () => {
    vi.mocked(resolveToolchains).mockResolvedValue([
      { absolutePath: '/p/main', subPath: '.', toolchainName: 'npm', toolchainSettings: {} },
    ]);
    vi.mocked(pluginManager.getPortConfig).mockReturnValue({ key: 'PORT', defaultPort: 3000 });
    vi.mocked(pluginManager.readRuntimeConfig)
      .mockResolvedValueOnce({ PORT: '3000', WORKTREE: 'main', NEW: '1' })
      .mockResolvedValueOnce({ PORT: '3001', WORKTREE: '1' });

    await syncWorktreeRuntimeConfigs('/p', '/p/main', '/p/wt/task-1', 1, 'main-to-worktree');

    expect(pluginManager.readRuntimeConfig).toHaveBeenCalledWith('/p/main', ['npm']);
    expect(outputSuccess).toHaveBeenCalledWith(expect.stringContaining('NEW'));
  });

  it('contexts 为空：回退直接操作 .env.local', async () => {
    vi.mocked(resolveToolchains).mockResolvedValue([]);
    const dir = await fs.mkdtemp(pathMod.join(os.tmpdir(), 'colyn-sync-'));
    const wtDir = pathMod.join(dir, 'task-1');
    await fs.mkdir(wtDir);
    await fs.writeFile(pathMod.join(dir, 'main.env'), ''); // 占位，避免目录不存在
    await fs.mkdir(pathMod.join(dir, 'main'));
    await fs.writeFile(pathMod.join(dir, 'main', '.env.local'), 'PORT=3000\nWORKTREE=main\nNEW=v9\n');
    await fs.writeFile(pathMod.join(wtDir, '.env.local'), 'PORT=3001\nWORKTREE=1\n');

    await syncWorktreeRuntimeConfigs(dir, pathMod.join(dir, 'main'), wtDir, 1, 'main-to-worktree');

    const content = await fs.readFile(pathMod.join(wtDir, '.env.local'), 'utf-8');
    expect(content).toContain('NEW=v9');
  });

  it('主分支配置缺失：仅 verbose 时提示，非 verbose 静默不抛出', async () => {
    vi.mocked(resolveToolchains).mockResolvedValue([
      { absolutePath: '/p/main', subPath: '.', toolchainName: 'npm', toolchainSettings: {} },
    ]);
    vi.mocked(pluginManager.getPortConfig).mockReturnValue(null);
    vi.mocked(pluginManager.readRuntimeConfig).mockResolvedValue(null);

    // 非 verbose：静默（项目不使用运行时配置是正常态，不告警）
    await expect(
      syncWorktreeRuntimeConfigs('/p', '/p/main', '/p/wt/task-1', 1, 'main-to-worktree')
    ).resolves.toBeUndefined();
    expect(outputWarning).not.toHaveBeenCalled();
    expect(output).not.toHaveBeenCalled();

    // verbose：仅输出普通提示（非警告）
    await syncWorktreeRuntimeConfigs('/p', '/p/main', '/p/wt/task-1', 1, 'main-to-worktree', true);
    expect(output).toHaveBeenCalledWith(expect.stringContaining('Main branch'));
  });

  it('同步抛异常：输出警告不抛出', async () => {
    vi.mocked(resolveToolchains).mockRejectedValue(new Error('boom'));

    await expect(
      syncWorktreeRuntimeConfigs('/p', '/p/main', '/p/wt/task-1', 1, 'main-to-worktree')
    ).resolves.toBeUndefined();
    expect(outputWarning).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('无变化且非 verbose：不输出', async () => {
    vi.mocked(resolveToolchains).mockResolvedValue([
      { absolutePath: '/p/main', subPath: '.', toolchainName: 'npm', toolchainSettings: {} },
    ]);
    vi.mocked(pluginManager.getPortConfig).mockReturnValue({ key: 'PORT', defaultPort: 3000 });
    vi.mocked(pluginManager.readRuntimeConfig)
      .mockResolvedValueOnce({ PORT: '3000', WORKTREE: 'main' })
      .mockResolvedValueOnce({ PORT: '3001', WORKTREE: '1' });

    await syncWorktreeRuntimeConfigs('/p', '/p/main', '/p/wt/task-1', 1, 'main-to-worktree');

    expect(outputSuccess).not.toHaveBeenCalled();
    expect(outputWarning).not.toHaveBeenCalled();
  });
});
