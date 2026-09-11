import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('simple-git', () => ({
  default: vi.fn(() => ({
    status: vi.fn().mockResolvedValue({ files: [], conflicted: [] }),
    rebase: vi.fn().mockResolvedValue(undefined),
    merge: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../core/git.js', () => ({
  getRelevantStatusFiles: vi.fn().mockReturnValue([]),
}));

vi.mock('../core/runtime-config-sync.js', () => ({
  syncWorktreeRuntimeConfigs: vi.fn().mockResolvedValue(undefined),
}));

import { updateAllWorktrees } from './update.helpers.js';
import { syncWorktreeRuntimeConfigs } from '../core/runtime-config-sync.js';

const worktree = {
  id: 1,
  branch: 'feature/demo',
  path: '/p/worktrees/task-1',
  port: 3001,
  createdAt: '2026-01-01',
};

describe('updateAllWorktrees 运行时配置同步接线', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('更新成功的 worktree 触发主→worktree 同步', async () => {
    const result = await updateAllWorktrees(
      [worktree], 'main', true,
      { rootDir: '/p', mainDir: '/p/main' }
    );

    expect(result.succeeded).toBe(1);
    expect(syncWorktreeRuntimeConfigs).toHaveBeenCalledTimes(1);
    expect(syncWorktreeRuntimeConfigs).toHaveBeenCalledWith(
      '/p', '/p/main', '/p/worktrees/task-1', 1, 'main-to-worktree'
    );
  });

  it('不传 syncOptions 时不触发同步（向后兼容）', async () => {
    const result = await updateAllWorktrees([worktree], 'main', true);

    expect(result.succeeded).toBe(1);
    expect(syncWorktreeRuntimeConfigs).not.toHaveBeenCalled();
  });

  it('更新失败的 worktree 不触发同步', async () => {
    const { default: simpleGit } = await import('simple-git');
    // 第 1 次 simpleGit() 调用来自 checkGitWorkingDirectory（status 需干净），
    // 第 2 次来自 rebaseWorktree（rebase 冲突失败）
    const cleanGit = () => ({
      status: vi.fn().mockResolvedValue({ files: [], conflicted: [] }),
      rebase: vi.fn().mockResolvedValue(undefined),
      merge: vi.fn().mockResolvedValue(undefined),
    });
    const conflictGit = () => ({
      status: vi.fn().mockResolvedValue({ files: [], conflicted: [] }),
      rebase: vi.fn().mockRejectedValue(new Error('CONFLICT in file.ts')),
      merge: vi.fn(),
    });
    (simpleGit as unknown as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(cleanGit)
      .mockImplementationOnce(conflictGit);

    const result = await updateAllWorktrees(
      [worktree], 'main', true,
      { rootDir: '/p', mainDir: '/p/main' }
    );

    expect(result.failed).toBe(1);
    expect(syncWorktreeRuntimeConfigs).not.toHaveBeenCalled();
  });
});
