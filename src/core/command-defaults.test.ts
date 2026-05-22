import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import type { Settings } from './config-schema.js';

vi.mock('./config-loader.js', () => ({
  loadUserConfig: vi.fn(),
  loadProjectConfig: vi.fn(),
}));
vi.mock('./paths.js', () => ({
  getProjectPaths: vi.fn(async () => ({
    projectRoot: '/fake/project',
    mainDir: '/fake/project',
    worktreesDir: '/fake/project/worktrees',
  })),
}));
vi.mock('./git.js', () => ({
  getCurrentBranch: vi.fn(async () => 'feature/test'),
}));

import { loadUserConfig, loadProjectConfig } from './config-loader.js';
import { applyCommandDefaults, resolveVerbose } from './command-defaults.js';

function makeCommand(setup: (cmd: Command) => void): {
  cmd: Command;
  parse: (argv: string[]) => Record<string, unknown>;
} {
  const cmd = new Command();
  cmd.exitOverride();
  setup(cmd);
  return {
    cmd,
    parse: (argv) => {
      cmd.parse(argv, { from: 'user' });
      return cmd.opts();
    },
  };
}

function makeSettings(partial: Partial<Settings>): Settings {
  return { version: 4, ...partial } as Settings;
}

beforeEach(() => {
  vi.mocked(loadUserConfig).mockReset();
  vi.mocked(loadProjectConfig).mockReset();
});

describe('applyCommandDefaults', () => {
  it('CLI 显式 --no-build 覆盖配置中的 build=true', async () => {
    vi.mocked(loadUserConfig).mockResolvedValue(null);
    vi.mocked(loadProjectConfig).mockResolvedValue(
      makeSettings({ commands: { merge: { build: true } } })
    );

    const { cmd, parse } = makeCommand((c) => {
      c.option('--build');
      c.option('--no-build');
    });
    const opts = parse(['--no-build']);

    const resolved = await applyCommandDefaults(cmd, opts, ['commands', 'merge'] as const, {
      build: true,
    });
    expect(resolved.build).toBe(false);
  });

  it('CLI 未指定时使用配置文件的值', async () => {
    vi.mocked(loadUserConfig).mockResolvedValue(null);
    vi.mocked(loadProjectConfig).mockResolvedValue(
      makeSettings({ commands: { merge: { build: false } } })
    );

    const { cmd, parse } = makeCommand((c) => {
      c.option('--build');
      c.option('--no-build');
    });
    const opts = parse([]);

    const resolved = await applyCommandDefaults(cmd, opts, ['commands', 'merge'] as const, {
      build: true,
    });
    expect(resolved.build).toBe(false);
  });

  it('CLI 和配置都未指定时使用内置默认', async () => {
    vi.mocked(loadUserConfig).mockResolvedValue(null);
    vi.mocked(loadProjectConfig).mockResolvedValue(null);

    const { cmd, parse } = makeCommand((c) => {
      c.option('--build');
      c.option('--no-build');
    });
    const opts = parse([]);

    const resolved = await applyCommandDefaults(cmd, opts, ['commands', 'merge'] as const, {
      build: true,
    });
    expect(resolved.build).toBe(true);
  });

  it('branchOverrides 中的命令配置覆盖顶层 commands 配置', async () => {
    vi.mocked(loadUserConfig).mockResolvedValue(null);
    vi.mocked(loadProjectConfig).mockResolvedValue(
      makeSettings({
        commands: { merge: { build: false } },
        branchOverrides: {
          'feature/test': { commands: { merge: { build: true } } },
        },
      })
    );

    const { cmd, parse } = makeCommand((c) => {
      c.option('--build');
      c.option('--no-build');
    });
    const opts = parse([]);

    const resolved = await applyCommandDefaults(cmd, opts, ['commands', 'merge'] as const, {
      build: false,
    });
    expect(resolved.build).toBe(true);
  });

  it('保留未在 defaults 中声明的字段（如位置参数）', async () => {
    vi.mocked(loadUserConfig).mockResolvedValue(null);
    vi.mocked(loadProjectConfig).mockResolvedValue(null);

    const { cmd, parse } = makeCommand((c) => {
      c.option('--build');
      c.option('--unrelated <v>');
    });
    const opts = parse(['--unrelated', 'xyz']);

    const resolved = await applyCommandDefaults(cmd, opts, ['commands', 'merge'] as const, {
      build: true,
    });
    expect(resolved.unrelated).toBe('xyz');
    expect(resolved.build).toBe(true);
  });
});

describe('resolveVerbose', () => {
  it('CLI -v 优先于配置', async () => {
    vi.mocked(loadUserConfig).mockResolvedValue(makeSettings({ verbose: false }));
    vi.mocked(loadProjectConfig).mockResolvedValue(null);

    const { cmd, parse } = makeCommand((c) => {
      c.option('-v, --verbose');
      c.option('--no-verbose');
    });
    parse(['-v']);
    expect(await resolveVerbose(cmd, cmd.opts().verbose as boolean | undefined)).toBe(true);
  });

  it('CLI --no-verbose 覆盖配置 verbose=true', async () => {
    vi.mocked(loadUserConfig).mockResolvedValue(makeSettings({ verbose: true }));
    vi.mocked(loadProjectConfig).mockResolvedValue(null);

    const { cmd, parse } = makeCommand((c) => {
      c.option('-v, --verbose');
      c.option('--no-verbose');
    });
    parse(['--no-verbose']);
    expect(await resolveVerbose(cmd, cmd.opts().verbose as boolean | undefined)).toBe(false);
  });

  it('CLI 未指定时使用配置 verbose=true', async () => {
    vi.mocked(loadUserConfig).mockResolvedValue(makeSettings({ verbose: true }));
    vi.mocked(loadProjectConfig).mockResolvedValue(null);

    const { cmd, parse } = makeCommand((c) => {
      c.option('-v, --verbose');
      c.option('--no-verbose');
    });
    parse([]);
    expect(await resolveVerbose(cmd, cmd.opts().verbose as boolean | undefined)).toBe(true);
  });

  it('CLI 和配置都未指定时默认 false', async () => {
    vi.mocked(loadUserConfig).mockResolvedValue(null);
    vi.mocked(loadProjectConfig).mockResolvedValue(null);

    const { cmd, parse } = makeCommand((c) => {
      c.option('-v, --verbose');
      c.option('--no-verbose');
    });
    parse([]);
    expect(await resolveVerbose(cmd, cmd.opts().verbose as boolean | undefined)).toBe(false);
  });
});
