/**
 * 目录状态枚举
 */
export enum DirectoryStatus {
  Empty = 'empty',              // 空目录
  Initialized = 'initialized',  // 已初始化
  ExistingProject = 'existing'  // 已有项目
}

/**
 * 目录信息接口
 */
export interface DirectoryInfo {
  status: DirectoryStatus;
  isEmpty: boolean;
  hasMainDir: boolean;
  hasWorktreesDir: boolean;
  hasConfigDir: boolean;
  hasGitRepo: boolean;
  fileCount: number;
  currentDirName: string;
}

/**
 * Colyn 配置接口
 */
export interface ColynConfig {
  version: string;
  mainBranch: string;
  mainPort: number;
  nextWorktreeId: number;
  worktrees: WorktreeInfo[];
}

/**
 * Worktree 信息接口
 */
export interface WorktreeInfo {
  id: number;
  branch: string;
  path: string;
  port: number;
  createdAt: string;
}

/**
 * 自定义错误类
 */
export class ColynError extends Error {
  constructor(
    message: string,
    public hint?: string
  ) {
    super(message);
    this.name = 'ColynError';
  }
}
