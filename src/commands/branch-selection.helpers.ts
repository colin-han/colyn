import simpleGit from 'simple-git';
import { discoverWorktrees } from '../core/discovery.js';

export interface ParsedLocalBranch {
  branch: string;
  type: string;
  name: string;
}

type WorktreeBranchScope = 'all' | 'others';

export interface SelectableLocalBranchOptions {
  gitDir: string;
  mainDir: string;
  worktreesDir: string;
  mainBranch: string;
  currentBranch?: string;
  currentWorktreeId?: number;
  worktreeBranchScope?: WorktreeBranchScope;
  excludeBranches?: Iterable<string>;
}

function parseBranch(branch: string): ParsedLocalBranch {
  const lastSlash = branch.lastIndexOf('/');
  if (lastSlash === -1) {
    return { branch, type: '', name: branch };
  }

  return {
    branch,
    type: branch.slice(0, lastSlash),
    name: branch.slice(lastSlash + 1) || branch,
  };
}

function resolveCurrentBranch(
  preferred: string | undefined,
  fallback: string | undefined,
): string {
  const branch = preferred?.trim() || fallback?.trim() || '';
  return branch;
}

export async function listSelectableLocalBranches(
  options: SelectableLocalBranchOptions,
): Promise<ParsedLocalBranch[]> {
  const scope = options.worktreeBranchScope ?? 'all';
  if (scope === 'others' && options.currentWorktreeId === undefined) {
    throw new Error('currentWorktreeId is required when worktreeBranchScope is "others"');
  }

  const worktrees = await discoverWorktrees(options.mainDir, options.worktreesDir);
  const worktreeBranchSet = new Set(
    worktrees
      .filter(worktree => scope !== 'others' || worktree.id !== options.currentWorktreeId)
      .map(worktree => worktree.branch)
      .filter(branch => branch.trim().length > 0),
  );

  const git = simpleGit(options.gitDir);
  const localSummary = await git.branchLocal();
  const currentBranch = resolveCurrentBranch(options.currentBranch, localSummary.current);

  const excluded = new Set<string>(['HEAD', options.mainBranch]);
  if (currentBranch) {
    excluded.add(currentBranch);
  }

  for (const branch of options.excludeBranches ?? []) {
    if (branch.trim().length > 0) {
      excluded.add(branch);
    }
  }

  return localSummary.all
    .map(branch => branch.trim())
    .filter(branch =>
      branch.length > 0
      && !excluded.has(branch)
      && !worktreeBranchSet.has(branch)
    )
    .sort((a, b) => a.localeCompare(b))
    .map(parseBranch);
}
