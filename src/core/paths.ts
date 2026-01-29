import * as fs from 'fs/promises';
import * as path from 'path';
import { ColynError } from '../types/index.js';
import { t } from '../i18n/index.js';

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
 * 验证是否是有效的 colyn 项目
 * 避免误判 home 目录等其他包含 .colyn 目录的位置
 */
async function isValidColynProject(rootDir: string): Promise<boolean> {
  try {
    // 1. 检查主分支目录是否存在
    const mainDirName = path.basename(rootDir);
    const mainDir = path.join(rootDir, mainDirName);
    const mainDirStats = await fs.stat(mainDir);
    if (!mainDirStats.isDirectory()) {
      return false;
    }

    // 2. 检查 worktrees 目录是否存在
    const worktreesDir = path.join(rootDir, 'worktrees');
    const worktreesDirStats = await fs.stat(worktreesDir);
    if (!worktreesDirStats.isDirectory()) {
      return false;
    }

    // 注意：config.json 不是必需的，所以不验证它
    return true;
  } catch {
    // 任何验证失败都返回 false
    return false;
  }
}

/**
 * 从当前目录向上查找项目根目录
 * 根目录的标志是包含 .colyn 目录，并且通过多重验证确保是有效的 colyn 项目
 */
export async function findProjectRoot(startDir: string = process.cwd()): Promise<string> {
  let currentDir = path.resolve(startDir);

  // 最多向上查找 20 层，避免无限循环
  for (let i = 0; i < 20; i++) {
    const colynDir = path.join(currentDir, '.colyn');

    try {
      const stats = await fs.stat(colynDir);
      if (stats.isDirectory()) {
        // 找到 .colyn 目录，验证这是一个有效的 colyn 项目
        if (await isValidColynProject(currentDir)) {
          return currentDir;
        }
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
    t('errors.projectRootNotFound'),
    t('errors.projectRootNotFoundHint')
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
    configDir: path.join(rootDir, '.colyn')
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
 * 完整的当前位置信息
 */
export interface LocationInfo {
  /** 项目名（主目录名） */
  project: string;
  /** 主目录完整路径 */
  projectPath: string;
  /** worktree ID（主分支为 0） */
  worktreeId: number;
  /** worktree 目录名 */
  worktreeDir: string;
  /** worktree 完整路径 */
  worktreePath: string;
  /** 当前分支 */
  branch: string;
  /** 是否在主分支目录 */
  isMainBranch: boolean;
}

/**
 * 获取当前位置的完整信息
 * 用于 info 命令
 */
export async function getLocationInfo(
  startDir: string = process.cwd()
): Promise<LocationInfo> {
  const currentDir = path.resolve(startDir);

  // 查找项目根目录
  const rootDir = await findProjectRoot(currentDir);
  const mainDirName = path.basename(rootDir);
  const mainDir = path.join(rootDir, mainDirName);
  const worktreesDir = path.join(rootDir, 'worktrees');

  // 检查当前目录是否在主分支目录下
  if (currentDir === mainDir || currentDir.startsWith(mainDir + path.sep)) {
    // 在主分支目录中
    const simpleGit = (await import('simple-git')).default;
    const git = simpleGit(mainDir);
    const branchSummary = await git.branch();

    return {
      project: mainDirName,
      projectPath: mainDir,
      worktreeId: 0,
      worktreeDir: mainDirName,
      worktreePath: mainDir,
      branch: branchSummary.current,
      isMainBranch: true
    };
  }

  // 检查当前目录是否在 worktrees 目录下
  if (currentDir === worktreesDir || currentDir.startsWith(worktreesDir + path.sep)) {
    // 在 worktrees 目录下，找出是哪个 worktree
    const relativePath = path.relative(worktreesDir, currentDir);
    const worktreeDirName = relativePath.split(path.sep)[0];

    // 检查是否是 task-N 格式
    const idMatch = worktreeDirName.match(/^task-(\d+)$/);
    if (idMatch) {
      const worktreeId = parseInt(idMatch[1]);
      const worktreePath = path.join(worktreesDir, worktreeDirName);

      // 获取当前分支
      const simpleGit = (await import('simple-git')).default;
      const git = simpleGit(worktreePath);
      const branchSummary = await git.branch();

      return {
        project: mainDirName,
        projectPath: mainDir,
        worktreeId,
        worktreeDir: worktreeDirName,
        worktreePath,
        branch: branchSummary.current,
        isMainBranch: false
      };
    }
  }

  // 不在有效位置
  throw new ColynError(
    t('commands.info.notInWorktree'),
    t('commands.info.notInWorktreeHint')
  );
}

/**
 * 验证目录存在
 */
export async function validateDirectoryExists(dirPath: string, errorMessage: string): Promise<void> {
  try {
    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      throw new ColynError(errorMessage, t('errors.pathExistsNotDir', { path: dirPath }));
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ColynError(errorMessage, t('errors.pathNotFound', { path: dirPath }));
    }
    throw err;
  }
}

/**
 * 验证项目已初始化
 */
export async function validateProjectInitialized(paths: ProjectPaths): Promise<void> {
  // 检查 .colyn 配置目录是否存在（不再需要 config.json）
  try {
    await fs.access(paths.configDir);
  } catch {
    throw new ColynError(
      t('errors.projectNotInitialized'),
      t('errors.projectNotInitializedHint')
    );
  }

  // 检查主分支目录是否存在
  await validateDirectoryExists(
    paths.mainDir,
    t('errors.mainDirNotFound')
  );

  // 检查 worktrees 目录是否存在
  await validateDirectoryExists(
    paths.worktreesDir,
    t('errors.worktreesDirNotFound')
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
    return t('output.projectRoot');
  }

  if (currentDir === paths.mainDir) {
    return t('output.mainBranchDir');
  }

  if (currentDir.startsWith(paths.worktreesDir)) {
    return t('output.worktreeDir');
  }

  if (currentDir === paths.configDir) {
    return t('output.configDir');
  }

  return t('output.subDir', { path: relative });
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
