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

/**
 * 命令执行结果
 * 用于 bash 入口脚本解析，实现自动目录切换
 */
export interface CommandResult {
  /** 是否成功 */
  success: boolean;
  /** 需要切换到的目录（绝对路径，bash 用于 cd） */
  targetDir?: string;
  /** 相对于项目根目录的路径（显示给用户） */
  displayPath?: string;
}
