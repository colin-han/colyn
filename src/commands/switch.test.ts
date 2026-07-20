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

import { handleSwitch, computeRelativeSubpath, resolveDeepestExisting } from './switch.js';
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

describe('computeRelativeSubpath', () => {
  const P = { mainDir: '/proj/colyn', worktreesDir: '/proj/worktrees' };

  it('cwd 在 mainDir 子目录 → 返回相对子路径', () => {
    expect(computeRelativeSubpath('/proj/colyn/a/b', P)).toBe(path.join('a', 'b'));
  });

  it('cwd 就是 mainDir → 返回空串', () => {
    expect(computeRelativeSubpath('/proj/colyn', P)).toBe('');
  });

  it('cwd 在 task-K 子目录 → 返回相对子路径', () => {
    expect(computeRelativeSubpath('/proj/worktrees/task-1/a/b', P)).toBe(path.join('a', 'b'));
  });

  it('cwd 就是 task-K 根 → 返回空串', () => {
    expect(computeRelativeSubpath('/proj/worktrees/task-2', P)).toBe('');
  });

  it('cwd 在项目根/worktrees 本身/无关位置 → 返回空串', () => {
    expect(computeRelativeSubpath('/proj', P)).toBe('');
    expect(computeRelativeSubpath('/proj/worktrees', P)).toBe('');
    expect(computeRelativeSubpath('/elsewhere/x', P)).toBe('');
  });
});

describe('resolveDeepestExisting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('完整子路径存在 → 返回 join(root, rel)', async () => {
    vi.mocked(fsp.stat).mockResolvedValue({ isDirectory: () => true } as never);
    const r = await resolveDeepestExisting('/proj/worktrees/task-2', path.join('a', 'b'));
    expect(r).toBe(path.join('/proj/worktrees/task-2', 'a', 'b'));
  });

  it('最深层缺失 → 上溯到存在的祖先', async () => {
    // task-2/a/b 不存在，task-2/a 存在
    const existing = path.join('/proj/worktrees/task-2', 'a');
    vi.mocked(fsp.stat).mockImplementation(async (p) => {
      if (String(p) === existing) return { isDirectory: () => true } as never;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const r = await resolveDeepestExisting('/proj/worktrees/task-2', path.join('a', 'b'));
    expect(r).toBe(existing);
  });

  it('全部子层缺失 → 回退到 targetRoot', async () => {
    vi.mocked(fsp.stat).mockImplementation(async (p) => {
      if (String(p) === '/proj/worktrees/task-2') return { isDirectory: () => true } as never;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const r = await resolveDeepestExisting('/proj/worktrees/task-2', path.join('a', 'b'));
    expect(r).toBe('/proj/worktrees/task-2');
  });

  it('rel 为空 → 返回 targetRoot', async () => {
    vi.mocked(fsp.stat).mockResolvedValue({ isDirectory: () => true } as never);
    const r = await resolveDeepestExisting('/proj/worktrees/task-2', '');
    expect(r).toBe('/proj/worktrees/task-2');
  });

  it('rel 含 .. 越出 targetRoot → 安全返回 targetRoot（不死循环）', async () => {
    vi.mocked(fsp.stat).mockResolvedValue({ isDirectory: () => true } as never);
    const r = await resolveDeepestExisting('/proj/worktrees/task-2', path.join('..', '..', '..', 'x'));
    expect(r).toBe('/proj/worktrees/task-2');
  });
});

describe('handleSwitch — 相对子路径', () => {
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
  });

  it('cd 模式：cwd 在 task-1/a/b，colyn 2 且 task-2/a/b 存在 → targetDir 带子路径', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/proj/worktrees/task-1/a/b');
    // 所有 stat 都成功：target 存在 + 子路径存在
    vi.mocked(fsp.stat).mockResolvedValue({ isDirectory: () => true } as never);
    vi.mocked(isInTmux).mockReturnValue(false);
    vi.mocked(sessionExists).mockReturnValue(false);

    await handleSwitch('2', undefined);

    const parsed = JSON.parse(stdoutCalls.join('').trim().split('\n').pop()!);
    expect(parsed.targetDir).toBe(path.join('/proj/worktrees/task-2', 'a', 'b'));
  });

  it('cd 模式：子路径缺失 → 上溯到 task-2 根并打印回退提示', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/proj/worktrees/task-1/a/b');
    const targetRoot = '/proj/worktrees/task-2';
    // target 根存在，子路径均不存在
    vi.mocked(fsp.stat).mockImplementation(async (p) => {
      if (String(p) === targetRoot) return { isDirectory: () => true } as never;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    vi.mocked(isInTmux).mockReturnValue(false);
    vi.mocked(sessionExists).mockReturnValue(false);

    await handleSwitch('2', undefined);

    const parsed = JSON.parse(stdoutCalls.join('').trim().split('\n').pop()!);
    expect(parsed.targetDir).toBe(targetRoot);
    // 打印了回退提示到 stderr
    expect(stderrCalls.join('')).not.toBe('');
  });

  it('exec 模式：子目录不存在 → exit 1 且不 spawn', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/proj/worktrees/task-1/a/b');
    const targetRoot = '/proj/worktrees/task-2';
    // target 根存在，子路径 a/b 不存在
    vi.mocked(fsp.stat).mockImplementation(async (p) => {
      if (String(p) === targetRoot) return { isDirectory: () => true } as never;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    await expect(handleSwitch('2', ['pwd'])).rejects.toThrow('process.exit:1');
    // 未产生 stdout 控制消息
    expect(stdoutCalls.join('').trim()).toBe('');
  });

  it('cwd 在 worktree 根（rel 为空）：targetDir 等于目标根（回归）', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/proj/worktrees/task-1');
    vi.mocked(fsp.stat).mockResolvedValue({ isDirectory: () => true } as never);
    vi.mocked(isInTmux).mockReturnValue(false);
    vi.mocked(sessionExists).mockReturnValue(false);

    await handleSwitch('2', undefined);

    const parsed = JSON.parse(stdoutCalls.join('').trim().split('\n').pop()!);
    expect(parsed.targetDir).toBe('/proj/worktrees/task-2');
  });
});
