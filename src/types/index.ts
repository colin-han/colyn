import type { Command } from 'commander';

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
  /** 需要连接的 tmux session 名称 */
  attachSession?: string;
}

/**
 * 命令模块接口
 * 每个命令文件应导出一个 register 函数
 */
export interface CommandModule {
  /** 注册命令到 program */
  register: (program: Command) => void;
}

/**
 * Todo 状态
 */
export type TodoStatus = 'pending' | 'completed';

/**
 * Todo 条目
 */
export interface TodoItem {
  /** 类型，例如 "feature", "bug", "chore" */
  type: string;
  /** 名称，例如 "login", "fix-auth" */
  name: string;
  /** 任务描述 */
  message: string;
  /** 状态 */
  status: TodoStatus;
  /** 创建时间（ISO 时间戳） */
  createdAt: string;
  /** 开始时间（todo start 执行时间） */
  startedAt?: string;
  /** 创建的分支名 */
  branch?: string;
}

/**
 * Todo 文件结构
 */
export interface TodoFile {
  todos: TodoItem[];
}

/**
 * 归档的 Todo 条目
 */
export interface ArchivedTodoItem extends TodoItem {
  /** 归档时间（ISO 时间戳） */
  archivedAt: string;
}

/**
 * 归档 Todo 文件结构
 */
export interface ArchivedTodoFile {
  todos: ArchivedTodoItem[];
}
