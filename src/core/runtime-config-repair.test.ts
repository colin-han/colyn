import { describe, it, expect, vi, beforeEach } from 'vitest';
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

import { pluginManager } from '../plugins/index.js';
import {
  computeIdentityUpdates,
  buildRuntimeTargets,
  readRuntimeTarget,
  writeRuntimeTarget,
  readBasePort,
  type RuntimeTarget,
} from './runtime-config-repair.js';
import type { ToolchainContext } from './toolchain-resolver.js';

describe('computeIdentityUpdates', () => {
  it('端口与 WORKTREE 都正确时不产生任何修改', () => {
    const result = computeIdentityUpdates(
      { PORT: '3001', WORKTREE: '1', API_KEY: 'x' },
      { portKey: 'PORT', expectedPort: 3001, expectedWorktree: '1' }
    );

    expect(result.updates).toEqual({});
    expect(result.changes).toEqual([]);
  });

  it('端口不符时校正端口', () => {
    const result = computeIdentityUpdates(
      { PORT: '9999', WORKTREE: '1' },
      { portKey: 'PORT', expectedPort: 3001, expectedWorktree: '1' }
    );

    expect(result.updates).toEqual({ PORT: '3001' });
    expect(result.changes).toEqual([{ key: 'PORT', from: '9999', to: '3001' }]);
  });

  it('端口缺失时补齐，changes 中 from 为 undefined', () => {
    const result = computeIdentityUpdates(
      { WORKTREE: '1' },
      { portKey: 'PORT', expectedPort: 3001, expectedWorktree: '1' }
    );

    expect(result.updates).toEqual({ PORT: '3001' });
    expect(result.changes[0]).toEqual({ key: 'PORT', from: undefined, to: '3001' });
  });

  it('expectedPort 为 null 时保持端口现状', () => {
    const result = computeIdentityUpdates(
      { PORT: '8123', WORKTREE: 'x' },
      { portKey: 'PORT', expectedPort: null, expectedWorktree: 'main' }
    );

    expect(result.updates).toEqual({ WORKTREE: 'main' });
    expect(result.changes).toEqual([{ key: 'WORKTREE', from: 'x', to: 'main' }]);
  });

  it('使用插件声明的端口 key（如 Spring 的 server.port）', () => {
    const result = computeIdentityUpdates(
      { 'server.port': '8080', WORKTREE: 'main' },
      { portKey: 'server.port', expectedPort: 8081, expectedWorktree: '1' }
    );

    expect(result.updates).toEqual({ 'server.port': '8081', WORKTREE: '1' });
  });

  it('配置完全为空时补齐端口与 WORKTREE', () => {
    const result = computeIdentityUpdates(
      {},
      { portKey: 'server.port', expectedPort: 8081, expectedWorktree: '1' }
    );

    expect(result.updates).toEqual({ 'server.port': '8081', WORKTREE: '1' });
    expect(result.changes).toHaveLength(2);
  });
});

describe('buildRuntimeTargets', () => {
  beforeEach(() => {
    vi.mocked(pluginManager.getPortConfig).mockReset();
  });

  it('无工具链时回退为单个 .env.local target', async () => {
    const targets = await buildRuntimeTargets([], '/proj/main');

    expect(targets).toEqual([
      { ctx: null, dir: '/proj/main', subPath: '.', portKey: 'PORT', defaultPort: 10000 },
    ]);
  });

  it('单项目模式使用插件的 portConfig', async () => {
    vi.mocked(pluginManager.getPortConfig).mockReturnValue({ key: 'server.port', defaultPort: 8080 });
    const ctx: ToolchainContext = {
      absolutePath: '/proj/main',
      subPath: '.',
      toolchainName: 'maven',
      toolchainSettings: {},
    };

    const targets = await buildRuntimeTargets([ctx], '/proj/worktrees/task-1');

    expect(targets).toHaveLength(1);
    expect(targets[0].dir).toBe('/proj/worktrees/task-1');
    expect(targets[0].portKey).toBe('server.port');
    expect(targets[0].defaultPort).toBe(8080);
  });

  it('Mono Repo 模式下跳过 worktree 中不存在的子目录', async () => {
    vi.mocked(pluginManager.getPortConfig).mockReturnValue({ key: 'PORT', defaultPort: 3000 });

    const tmp = await fs.mkdtemp(pathMod.join(os.tmpdir(), 'colyn-repair-'));
    await fs.mkdir(pathMod.join(tmp, 'frontend'));

    const contexts: ToolchainContext[] = [
      { absolutePath: '/main/frontend', subPath: 'frontend', toolchainName: 'npm', toolchainSettings: {} },
      { absolutePath: '/main/backend', subPath: 'backend', toolchainName: 'npm', toolchainSettings: {} },
    ];

    const targets = await buildRuntimeTargets(contexts, tmp);

    expect(targets.map((t) => t.subPath)).toEqual(['frontend']);
    expect(targets[0].dir).toBe(pathMod.join(tmp, 'frontend'));

    await fs.rm(tmp, { recursive: true, force: true });
  });
});

describe('readRuntimeTarget / writeRuntimeTarget', () => {
  const ctx: ToolchainContext = {
    absolutePath: '/main',
    subPath: '.',
    toolchainName: 'maven',
    toolchainSettings: {},
  };

  beforeEach(() => {
    vi.mocked(pluginManager.readRuntimeConfig).mockReset();
    vi.mocked(pluginManager.writeRuntimeConfig).mockReset();
  });

  it('有工具链时经由插件读取（而非硬编码 .env.local）', async () => {
    vi.mocked(pluginManager.readRuntimeConfig).mockResolvedValue({ 'server.port': '8080' });
    const target: RuntimeTarget = { ctx, dir: '/wt', subPath: '.', portKey: 'server.port', defaultPort: 8080 };

    const config = await readRuntimeTarget(target);

    expect(config).toEqual({ 'server.port': '8080' });
    expect(pluginManager.readRuntimeConfig).toHaveBeenCalledWith('/wt', ['maven']);
  });

  it('写入时合并既有配置，避免插件全量覆盖丢失其他 key', async () => {
    const target: RuntimeTarget = { ctx, dir: '/wt', subPath: '.', portKey: 'server.port', defaultPort: 8080 };

    await writeRuntimeTarget(target, { 'server.port': '8080', 'spring.foo': 'bar' }, { 'server.port': '8081' });

    expect(pluginManager.writeRuntimeConfig).toHaveBeenCalledWith(
      '/wt',
      { 'server.port': '8081', 'spring.foo': 'bar' },
      ['maven']
    );
  });

  it('无工具链时读写 .env.local', async () => {
    const tmp = await fs.mkdtemp(pathMod.join(os.tmpdir(), 'colyn-repair-'));
    await fs.writeFile(pathMod.join(tmp, '.env.local'), '# comment\nPORT=3000\n', 'utf-8');

    const target: RuntimeTarget = { ctx: null, dir: tmp, subPath: '.', portKey: 'PORT', defaultPort: 3000 };

    expect(await readRuntimeTarget(target)).toEqual({ PORT: '3000' });

    await writeRuntimeTarget(target, { PORT: '3000' }, { WORKTREE: 'main' });
    const content = await fs.readFile(pathMod.join(tmp, '.env.local'), 'utf-8');

    // 注释被保留
    expect(content).toContain('# comment');
    expect(content).toContain('WORKTREE=main');

    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('配置文件不存在时 readRuntimeTarget 返回 null', async () => {
    const tmp = await fs.mkdtemp(pathMod.join(os.tmpdir(), 'colyn-repair-'));
    const target: RuntimeTarget = { ctx: null, dir: tmp, subPath: '.', portKey: 'PORT', defaultPort: 3000 };

    expect(await readRuntimeTarget(target)).toBeNull();

    await fs.rm(tmp, { recursive: true, force: true });
  });
});

describe('readBasePort', () => {
  const ctx: ToolchainContext = {
    absolutePath: '/main',
    subPath: '.',
    toolchainName: 'maven',
    toolchainSettings: {},
  };
  const target: RuntimeTarget = { ctx, dir: '/main', subPath: '.', portKey: 'server.port', defaultPort: 8080 };

  beforeEach(() => {
    vi.mocked(pluginManager.readRuntimeConfig).mockReset();
  });

  it('读取插件声明的端口 key', async () => {
    vi.mocked(pluginManager.readRuntimeConfig).mockResolvedValue({ 'server.port': '8080' });
    expect(await readBasePort(target)).toBe(8080);
  });

  it('配置缺失时返回 null', async () => {
    vi.mocked(pluginManager.readRuntimeConfig).mockResolvedValue(null);
    expect(await readBasePort(target)).toBeNull();
  });

  it('端口 key 不存在时返回 null（不臆造默认值）', async () => {
    vi.mocked(pluginManager.readRuntimeConfig).mockResolvedValue({ 'spring.foo': 'bar' });
    expect(await readBasePort(target)).toBeNull();
  });
});
