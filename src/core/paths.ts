import * as fs from 'fs/promises';
import * as path from 'path';
import { ColynError } from '../types/index.js';

/**
 * 项目路径信息
 */
export interface ProjectPaths {
  /** 项目根目录（包含 .colyn 的目录） */
  rootDir: string;
  /** 主分支目录名称 */
  mainDirName: string;
  /** 主分支目录完整路径 */
  mainDir: string;
  /** worktrees 目录完整路径 */
  worktreesDir: string;
  /** .colyn 配置目录完整路径 */
  configDir: string;
  /** config.json 文件路径 */
  configFile: string;
}

/**
 * 当前 worktree 信息
 */
export interface CurrentWorktreeInfo {
  /** 是否在 worktree 目录中 */
  isWorktree: boolean;
  /** worktree ID（如果在 worktree 中） */
  worktreeId?: number;
  /** 当前目录路径 */
  currentDir: string;
  /** 相对于根目录的路径 */
  relativeToRoot?: string;
}

/**
 * 从当前目录向上查找项目根目录
 * 根目录的标志是包含 .colyn 目录
 */
export async function findProjectRoot(startDir: string = process.cwd()): Promise<string> {
  let currentDir = path.resolve(startDir);

  // 最多向上查找 20 层，避免无限循环
  for (let i = 0; i < 20; i++) {
    const colynDir = path.join(currentDir, '.colyn');

    try {
      const stats = await fs.stat(colynDir);
      if (stats.isDirectory()) {
        // 找到 .colyn 目录，这就是根目录
        return currentDir;
      }
    } catch (err) {
      // .colyn 不存在，继续向上查找
    }

    // 获取父目录
    const parentDir = path.dirname(currentDir);

    // 如果已经到达文件系统根目录，停止查找
    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  throw new ColynError(
    '未找到项目根目录',
    '当前目录不在 colyn 项目中，请先运行 colyn init 初始化项目'
  );
}

/**
 * 获取项目所有相关路径
 */
export async function getProjectPaths(startDir: string = process.cwd()): Promise<ProjectPaths> {
  const rootDir = await findProjectRoot(startDir);
  const mainDirName = path.basename(rootDir);

  return {
    rootDir,
    mainDirName,
    mainDir: path.join(rootDir, mainDirName),
    worktreesDir: path.join(rootDir, 'worktrees'),
    configDir: path.join(rootDir, '.colyn'),
    configFile: path.join(rootDir, '.colyn', 'config.json')
  };
}

/**
 * 获取当前 worktree 信息
 * 通过读取 .env.local 文件中的 WORKTREE 变量来判断
 */
export async function getCurrentWorktreeInfo(
  startDir: string = process.cwd()
): Promise<CurrentWorktreeInfo> {
  const currentDir = path.resolve(startDir);

  try {
    // 尝试查找项目根目录
    const rootDir = await findProjectRoot(currentDir);
    const relativeToRoot = path.relative(rootDir, currentDir);

    // 读取当前目录的 .env.local 文件
    const envFilePath = path.join(currentDir, '.env.local');

    try {
      const envContent = await fs.readFile(envFilePath, 'utf-8');

      // 解析 WORKTREE 变量
      const worktreeMatch = envContent.match(/^WORKTREE=(.+)$/m);

      if (worktreeMatch) {
        const worktreeValue = worktreeMatch[1].trim();

        // 如果 WORKTREE 是数字，说明在 worktree 中
        const worktreeId = parseInt(worktreeValue);
        if (!isNaN(worktreeId)) {
          return {
            isWorktree: true,
            worktreeId,
            currentDir,
            relativeToRoot
          };
        }

        // 如果 WORKTREE 是 "main"，说明在主分支中
        if (worktreeValue === 'main') {
          return {
            isWorktree: false,
            currentDir,
            relativeToRoot
          };
        }
      }
    } catch {
      // .env.local 不存在或读取失败，说明不在 worktree 或主分支目录中
    }

    // 默认认为不在 worktree 中
    return {
      isWorktree: false,
      currentDir,
      relativeToRoot
    };
  } catch {
    // 如果找不到项目根目录，返回基本信息
    return {
      isWorktree: false,
      currentDir
    };
  }
}

/**
 * 验证目录存在
 */
export async function validateDirectoryExists(dirPath: string, errorMessage: string): Promise<void> {
  try {
    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      throw new ColynError(errorMessage, `路径存在但不是目录: ${dirPath}`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ColynError(errorMessage, `目录不存在: ${dirPath}`);
    }
    throw err;
  }
}

/**
 * 验证项目已初始化
 */
export async function validateProjectInitialized(paths: ProjectPaths): Promise<void> {
  // 检查配置文件是否存在
  try {
    await fs.access(paths.configFile);
  } catch {
    throw new ColynError(
      '项目未初始化',
      '请先运行 colyn init 命令初始化项目'
    );
  }

  // 检查主分支目录是否存在
  await validateDirectoryExists(
    paths.mainDir,
    '主分支目录不存在'
  );

  // 检查 worktrees 目录是否存在
  await validateDirectoryExists(
    paths.worktreesDir,
    'worktrees 目录不存在'
  );
}

/**
 * 获取指定目录相对于根目录的简短描述
 */
export function getDirectoryDescription(
  currentDir: string,
  paths: ProjectPaths
): string {
  const relative = path.relative(paths.rootDir, currentDir);

  if (relative === '') {
    return '项目根目录';
  }

  if (currentDir === paths.mainDir) {
    return '主分支目录';
  }

  if (currentDir.startsWith(paths.worktreesDir)) {
    return 'worktree 目录';
  }

  if (currentDir === paths.configDir) {
    return '配置目录';
  }

  return `子目录 (${relative})`;
}

/**
 * 切换到指定目录执行操作
 * 执行完成后恢复原目录
 */
export async function executeInDirectory<T>(
  targetDir: string,
  operation: () => Promise<T>
): Promise<T> {
  const originalDir = process.cwd();

  try {
    process.chdir(targetDir);
    return await operation();
  } finally {
    process.chdir(originalDir);
  }
}
