import { describe, it, expect, vi, beforeEach } from 'vitest';

const branchLocal = vi.fn();
const branch = vi.fn();
vi.mock('simple-git', () => ({
  default: () => ({ branchLocal, branch }),
}));

import { localBranchExists, branchExistsAnywhere } from './git.js';

describe('branch existence helpers', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('localBranchExists：命中本地分支返回 true', async () => {
    branchLocal.mockResolvedValue({ all: ['main', 'feature/login'] });
    expect(await localBranchExists('feature/login')).toBe(true);
    expect(await localBranchExists('feature/missing')).toBe(false);
  });

  it('localBranchExists：git 报错时返回 false', async () => {
    branchLocal.mockRejectedValue(new Error('not a repo'));
    expect(await localBranchExists('any')).toBe(false);
  });

  it('branchExistsAnywhere：命中远端分支也返回 true', async () => {
    branch.mockResolvedValue({ all: ['main', 'remotes/origin/feature/42'] });
    expect(await branchExistsAnywhere('feature/42')).toBe(true);
    expect(await branchExistsAnywhere('feature/none')).toBe(false);
  });
});
