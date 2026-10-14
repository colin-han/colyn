import { describe, it, expect } from 'vitest';
import { loadAndMigrateConfig } from './config-migration.js';
import { CURRENT_CONFIG_VERSION } from './config-schema.js';

describe('config migration — V4 -> V5（移除 tmux 集成）', () => {
  it('丢弃 tmux 字段与 systemCommands.claude，保留其他字段', () => {
    const result = loadAndMigrateConfig({
      version: 4,
      lang: 'zh-CN',
      systemCommands: { npm: 'pnpm', claude: 'claude --foo' },
      tmux: { layout: 'three-pane', autoRun: true },
      syncFiles: ['.env.local'],
      commands: { merge: { build: false } },
    });

    expect(result).toEqual({
      version: CURRENT_CONFIG_VERSION,
      lang: 'zh-CN',
      systemCommands: { npm: 'pnpm' },
      syncFiles: ['.env.local'],
      commands: { merge: { build: false } },
    });
    expect(result).not.toHaveProperty('tmux');
  });

  it('systemCommands 仅含 claude 时整个 systemCommands 被移除', () => {
    const result = loadAndMigrateConfig({
      version: 4,
      systemCommands: { claude: 'claude' },
    });
    expect(result).toEqual({ version: CURRENT_CONFIG_VERSION });
  });

  it('递归处理 branchOverrides 中的 tmux 与 claude', () => {
    const result = loadAndMigrateConfig({
      version: 4,
      tmux: { layout: 'single-pane' },
      branchOverrides: {
        main: {
          tmux: { autoRun: false },
          systemCommands: { npm: 'yarn', claude: 'claude' },
          commands: { update: { rebase: true } },
        },
      },
    });

    expect(result.branchOverrides?.main).toEqual({
      version: CURRENT_CONFIG_VERSION,
      systemCommands: { npm: 'yarn' },
      commands: { update: { rebase: true } },
    });
  });

  it('幂等：已是当前版本的配置原样通过', () => {
    const current = {
      version: CURRENT_CONFIG_VERSION,
      lang: 'en' as const,
      systemCommands: { npm: 'npm' },
    };
    expect(loadAndMigrateConfig(current)).toEqual(current);
  });
});

describe('config migration — 旧版本（V0–V3）迁移链', () => {
  it('V0（无版本号）→ 当前版本，tmux 被剥离', () => {
    const result = loadAndMigrateConfig({ lang: 'zh-CN', npm: 'yarn', tmux: {} });
    expect(result).toEqual({
      version: CURRENT_CONFIG_VERSION,
      lang: 'zh-CN',
      systemCommands: { npm: 'yarn' },
    });
  });

  it('V1：npm 迁移到 systemCommands，claudeCommand 与 tmux 被丢弃', () => {
    const result = loadAndMigrateConfig({
      version: 1,
      npm: 'pnpm',
      claudeCommand: 'claude',
      tmux: { leftPane: { command: 'auto continues claude session' } },
    });
    expect(result).toEqual({
      version: CURRENT_CONFIG_VERSION,
      systemCommands: { npm: 'pnpm' },
    });
  });

  it('V3：plugins/pluginSettings 与 tmux 被丢弃', () => {
    const result = loadAndMigrateConfig({
      version: 3,
      lang: 'en',
      systemCommands: { npm: 'yarn', claude: 'claude' },
      tmux: { autoRun: false },
      plugins: ['npm'],
      pluginSettings: { npm: {} },
    });
    expect(result).toEqual({
      version: CURRENT_CONFIG_VERSION,
      lang: 'en',
      systemCommands: { npm: 'yarn' },
    });
  });
});
