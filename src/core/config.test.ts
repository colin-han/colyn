import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTodoConfig } from './config.js';
import * as loader from './config-loader.js';

vi.mock('./config-loader.js', () => ({
  loadConfigFromDir: vi.fn(),
  loadUserConfig: vi.fn(),
}));

describe('getTodoConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('无任何配置时返回默认值（local / autoArchive=false）', async () => {
    vi.mocked(loader.loadConfigFromDir).mockResolvedValue(null);
    vi.mocked(loader.loadUserConfig).mockResolvedValue(null);

    const cfg = await getTodoConfig('/tmp/.colyn');

    expect(cfg.backend).toBe('local');
    expect(cfg.autoArchive).toBe(false);
    expect(cfg.github.archivedLabel).toBeNull();
    expect(cfg.github.typeLabels).toEqual({});
  });

  it('项目配置覆盖用户配置', async () => {
    vi.mocked(loader.loadConfigFromDir).mockResolvedValue({
      version: 4, todo: { backend: 'github' },
    } as never);
    vi.mocked(loader.loadUserConfig).mockResolvedValue({
      version: 4, todo: { backend: 'local', autoArchive: true },
    } as never);

    const cfg = await getTodoConfig('/tmp/.colyn');

    expect(cfg.backend).toBe('github');       // 项目优先
    expect(cfg.autoArchive).toBe(true);        // 用户提供，项目未覆盖
  });
});
