import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import type { CommandResult } from '../types/index.js';

// 被测函数的 mock 依赖
vi.mock('../core/paths.js', () => ({
  getProjectPaths: vi.fn(),
}));
vi.mock('../core/discovery.js', () => ({
  discoverWorktrees: vi.fn(),
  getMainBranch: vi.fn(),
}));
vi.mock('../core/tmux.js', () => ({
  isInTmux: vi.fn(() => false),
  getCurrentSession: vi.fn(() => null),
  sessionExists: vi.fn(() => false),
  windowExists: vi.fn(() => false),
  switchWindow: vi.fn(),
}));
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return { ...actual, stat: vi.fn() };
});
// mock logger 以便测试中能捕获 outputResult 的 JSON 写入
vi.mock('../utils/logger.js', () => ({
  outputResult: vi.fn((result: CommandResult) => {
    process.stdout.write(JSON.stringify(result) + '\n');
  }),
  outputError: vi.fn((message: string) => {
    process.stderr.write(message + '\n');
  }),
}));

import { handleSwitch } from './switch.js';
import { getProjectPaths } from '../core/paths.js';
import { discoverWorktrees, getMainBranch } from '../core/discovery.js';
import * as fsp from 'fs/promises';
import {
  isInTmux,
  getCurrentSession,
  sessionExists,
  windowExists,
  switchWindow,
} from '../core/tmux.js';

const PATHS = {
  rootDir: '/proj',
  mainDirName: 'colyn',
  mainDir: '/proj/colyn',
  worktreesDir: '/proj/worktrees',
  configDir: '/proj/.colyn',
};

describe('handleSwitch — cd 与错误处理', () => {
  let stderrCalls: string[];
  let stdoutCalls: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    stderrCalls = [];
    stdoutCalls = [];
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? 0}`);
    }) as never);
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrCalls.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutCalls.push(String(chunk));
      return true;
    });
    process.env.COLYN_OUTPUT_JSON = '1';
  });

  it('colyn 0：输出主目录 targetDir 控制消息', async () => {
    vi.mocked(getProjectPaths).mockResolvedValue(PATHS);
    vi.mocked(fsp.stat).mockResolvedValue({ isDirectory: () => true } as never);

    await handleSwitch('0', undefined);

    const writes = stdoutCalls.join('');
    const lastLine = writes.trim().split('\n').pop()!;
    const parsed = JSON.parse(lastLine);
    expect(parsed).toMatchObject({
      success: true,
      targetDir: PATHS.mainDir,
    });
  });

  it('colyn N（N>=1）：输出 task-N 目录 targetDir', async () => {
    vi.mocked(getProjectPaths).mockResolvedValue(PATHS);
    vi.mocked(fsp.stat).mockResolvedValue({ isDirectory: () => true } as never);

    await handleSwitch('3', undefined);

    const writes = stdoutCalls.join('');
    const parsed = JSON.parse(writes.trim().split('\n').pop()!);
    expect(parsed.targetDir).toBe(path.join(PATHS.worktreesDir, 'task-3'));
  });

  it('worktree 不存在：报错 + 列出可用 + exit 1，stdout 无控制消息', async () => {
    vi.mocked(getProjectPaths).mockResolvedValue(PATHS);
    vi.mocked(fsp.stat).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    );
    vi.mocked(discoverWorktrees).mockResolvedValue([
      { id: 1, branch: 'feature/foo', path: '/proj/worktrees/task-1', port: 3001, createdAt: '' },
      { id: 2, branch: 'feature/bar', path: '/proj/worktrees/task-2', port: 3002, createdAt: '' },
    ]);
    vi.mocked(getMainBranch).mockResolvedValue('main');

    await expect(handleSwitch('9', undefined)).rejects.toThrow('process.exit:1');

    const stderr = stderrCalls.join('');
    expect(stderr).toContain('task-9');
    expect(stderr).toMatch(/task-1.*feature\/foo/);
    expect(stderr).toMatch(/task-2.*feature\/bar/);
    expect(stderr).toMatch(/main/);

    const stdout = stdoutCalls.join('').trim();
    expect(stdout).toBe('');
  });

  it('不在 colyn 项目中：报错 + exit 1', async () => {
    vi.mocked(getProjectPaths).mockRejectedValue(new Error('not in project'));

    await expect(handleSwitch('1', undefined)).rejects.toThrow('process.exit:1');

    const stderr = stderrCalls.join('');
    expect(stderr).toContain('colyn');
    const stdout = stdoutCalls.join('').trim();
    expect(stdout).toBe('');
  });
});

describe('handleSwitch — tmux 智能切换', () => {
  let stderrCalls: string[];
  let stdoutCalls: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    stderrCalls = [];
    stdoutCalls = [];
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? 0}`);
    }) as never);
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrCalls.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutCalls.push(String(chunk));
      return true;
    });
    process.env.COLYN_OUTPUT_JSON = '1';

    vi.mocked(getProjectPaths).mockResolvedValue(PATHS);
    vi.mocked(fsp.stat).mockResolvedValue({ isDirectory: () => true } as never);
  });

  it('tmux 外、session 不存在 → 仅 targetDir（cd）', async () => {
    vi.mocked(isInTmux).mockReturnValue(false);
    vi.mocked(sessionExists).mockReturnValue(false);

    await handleSwitch('1', undefined);

    const stdout = stdoutCalls.join('');
    const parsed = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(parsed).toMatchObject({ success: true, targetDir: expect.stringContaining('task-1') });
    expect(parsed.attachSession).toBeUndefined();
    expect(vi.mocked(switchWindow)).not.toHaveBeenCalled();
  });

  it('tmux 外、session 存在但 window 不存在 → 降级 targetDir', async () => {
    vi.mocked(isInTmux).mockReturnValue(false);
    vi.mocked(sessionExists).mockReturnValue(true);
    vi.mocked(windowExists).mockReturnValue(false);

    await handleSwitch('1', undefined);

    const stdout = stdoutCalls.join('');
    const parsed = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(parsed.targetDir).toContain('task-1');
    expect(parsed.attachSession).toBeUndefined();
  });

  it('tmux 外、session+window 都存在 → attachSession + attachWindow', async () => {
    vi.mocked(isInTmux).mockReturnValue(false);
    vi.mocked(sessionExists).mockReturnValue(true);
    vi.mocked(windowExists).mockReturnValue(true);

    await handleSwitch('2', undefined);

    const stdout = stdoutCalls.join('');
    const parsed = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(parsed).toMatchObject({
      success: true,
      attachSession: 'colyn',
      attachWindow: 2,
    });
    expect(parsed.targetDir).toBeUndefined();
  });

  it('tmux 内同 session + window 存在 → 调用 switchWindow，stdout 无控制消息', async () => {
    vi.mocked(isInTmux).mockReturnValue(true);
    vi.mocked(getCurrentSession).mockReturnValue('colyn');
    vi.mocked(sessionExists).mockReturnValue(true);
    vi.mocked(windowExists).mockReturnValue(true);

    await handleSwitch('1', undefined);

    expect(vi.mocked(switchWindow)).toHaveBeenCalledWith('colyn', 1, expect.any(String), expect.any(String));
    const stdout = stdoutCalls.join('').trim();
    expect(stdout).toBe('');
  });

  it('tmux 内其他 session + window 存在 → attachSession + attachWindow', async () => {
    vi.mocked(isInTmux).mockReturnValue(true);
    vi.mocked(getCurrentSession).mockReturnValue('other');
    vi.mocked(sessionExists).mockReturnValue(true);
    vi.mocked(windowExists).mockReturnValue(true);

    await handleSwitch('1', undefined);

    const stdout = stdoutCalls.join('');
    const parsed = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(parsed.attachSession).toBe('colyn');
    expect(parsed.attachWindow).toBe(1);
  });
});
