import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getTodoConfig } = vi.hoisted(() => ({ getTodoConfig: vi.fn() }));
vi.mock('../core/config.js', () => ({ getTodoConfig }));

import { getActiveTodoBackend, getProvider, detectProviders } from './registry.js';
import { LocalFileBackend } from './local.js';

const paths = { configDir: '/cfg' } as never;
const ctx = { projectRoot: '/p', mainDirPath: '/p/main', nonInteractive: false };

describe('registry', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('默认返回 LocalFileBackend', async () => {
    getTodoConfig.mockResolvedValue({ backend: 'local', autoArchive: false, github: { archivedLabel: null, typeLabels: {} } });
    const be = await getActiveTodoBackend(paths);
    expect(be).toBeInstanceOf(LocalFileBackend);
    expect(be.name).toBe('local');
  });

  it('未知 backend 名抛 ColynError', async () => {
    getTodoConfig.mockResolvedValue({ backend: 'jira', autoArchive: false, github: { archivedLabel: null, typeLabels: {} } });
    await expect(getActiveTodoBackend(paths)).rejects.toThrow();
  });

  it('getProvider 返回对应 provider', () => {
    expect(getProvider('local')?.name).toBe('local');
    expect(getProvider('nope')).toBeUndefined();
  });

  it('detectProviders：仅 local 时返回 [local]', async () => {
    const detected = await detectProviders(ctx);
    expect(detected.map((p) => p.name)).toContain('local');
  });
});
