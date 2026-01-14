import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import Enquirer from 'enquirer';
const { prompt } = Enquirer;
import {
  DirectoryStatus,
  type DirectoryInfo,
  ColynError
} from '../types/index.js';
import { checkIsRepo, checkWorkingDirectoryClean, detectMainBranch } from '../core/git.js';
import { updateEnvFilePreserveComments } from '../core/env.js';
import { saveConfig, configExists, createDefaultConfig } from '../core/config.js';

/**
 * 检测目录状态
 */
export async function detectDirectoryStatus(): Promise<DirectoryInfo> {
  const rootDir = process.cwd();
  const currentDirName = path.basename(rootDir);

  // 检查关键目录是否存在
  const mainDirPath = path.join(rootDir, currentDirName);
  const worktreesDirPath = path.join(rootDir, 'worktrees');
  const configDirPath = path.join(rootDir, '.colyn');

  const [hasMainDir, hasWorktreesDir, hasConfigDir] = await Promise.all([
    fs.access(mainDirPath).then(() => true).catch(() => false),
    fs.access(worktreesDirPath).then(() => true).catch(() => false),
    fs.access(configDirPath).then(() => true).catch(() => false),
  ]);

  // 检查是否为 git 仓库
  const hasGitRepo = await checkIsRepo();

  // 统计目录中的文件数量（包括隐藏文件）
  const entries = await fs.readdir(rootDir);
  const fileCount = entries.length;

  // 判断是否为空目录（完全空，没有任何文件）
  const isEmpty = fileCount === 0;

  // 判断是否已初始化
  const isInitialized = hasMainDir || hasWorktreesDir || hasConfigDir;

  // 确定状态
  let status: DirectoryStatus;
  if (isEmpty) {
    status = DirectoryStatus.Empty;
  } else if (isInitialized) {
    status = DirectoryStatus.Initialized;
  } else {
    status = DirectoryStatus.ExistingProject;
  }

  return {
    status,
    isEmpty,
    hasMainDir,
    hasWorktreesDir,
    hasConfigDir,
    hasGitRepo,
    fileCount,
    currentDirName
  };
}

/**
 * 获取端口配置
 */
export async function getPortConfig(options: { port?: string }): Promise<number> {
  // 如果提供了 --port 参数
  if (options.port) {
    const port = parseInt(options.port);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new ColynError('无效的端口号', '端口必须在 1-65535 之间');
    }
    return port;
  }

  // 交互式询问
  const { port } = await prompt<{ port: string }>({
    type: 'input',
    name: 'port',
    message: '请输入主分支开发服务器端口',
    initial: '10000',
    validate: (value) => {
      const num = parseInt(value);
      return num > 0 && num < 65536 ? true : '端口必须在 1-65535 之间';
    }
  });

  return parseInt(port);
}

/**
 * 检查目录名冲突
 */
export async function checkDirectoryConflict(
  rootDir: string,
  mainDirName: string
): Promise<void> {
  const mainDirPath = path.join(rootDir, mainDirName);

  try {
    const stats = await fs.stat(mainDirPath);

    // 如果已存在且是文件（不是目录），则报错
    if (stats.isFile()) {
      throw new ColynError(
        `主分支目录名 "${mainDirName}" 与现有文件冲突`,
        '请重命名该文件后再运行 init 命令'
      );
    }

    // 如果是目录，可能是已初始化的情况，不报错
  } catch (error) {
    // 文件/目录不存在，没有冲突
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * 创建目录结构
 */
export async function createDirectoryStructure(
  rootDir: string,
  mainDirName: string,
  dirInfo: DirectoryInfo
): Promise<void> {
  const mainDirPath = path.join(rootDir, mainDirName);
  const worktreesDirPath = path.join(rootDir, 'worktrees');
  const configDirPath = path.join(rootDir, '.colyn');

  // 创建主分支目录
  if (!dirInfo.hasMainDir) {
    await fs.mkdir(mainDirPath, { recursive: true });
  }

  // 创建 worktrees 目录
  if (!dirInfo.hasWorktreesDir) {
    await fs.mkdir(worktreesDirPath, { recursive: true });
  }

  // 创建 .colyn 目录
  await fs.mkdir(configDirPath, { recursive: true });
}

/**
 * 移动文件到主分支目录
 */
export async function moveFilesToMainDir(
  rootDir: string,
  mainDirName: string
): Promise<void> {
  const spinner = ora('移动项目文件...').start();

  try {
    const mainDirPath = path.join(rootDir, mainDirName);
    const entries = await fs.readdir(rootDir);

    // 需要排除的目录（不移动）
    const excludeDirs = new Set([mainDirName, 'worktrees', '.colyn']);

    for (const entry of entries) {
      // 跳过新创建的目录
      if (excludeDirs.has(entry)) {
        continue;
      }

      const sourcePath = path.join(rootDir, entry);
      const targetPath = path.join(mainDirPath, entry);

      // 移动文件或目录
      await fs.rename(sourcePath, targetPath);
      spinner.text = `移动: ${entry}`;
    }

    spinner.succeed('项目文件移动完成');
  } catch (error) {
    spinner.fail('移动文件失败');
    throw new ColynError(
      '移动文件时发生错误',
      '请检查文件权限或手动恢复目录结构'
    );
  }
}

/**
 * 配置 .env.local 文件
 */
export async function configureEnvFile(
  mainDirPath: string,
  port: number,
  worktree: string
): Promise<void> {
  const spinner = ora('配置环境变量文件...').start();

  try {
    const envFilePath = path.join(mainDirPath, '.env.local');

    // 需要添加的环境变量
    const requiredEnv = {
      PORT: port.toString(),
      WORKTREE: worktree
    };

    // 智能合并
    await updateEnvFilePreserveComments(envFilePath, requiredEnv);

    spinner.succeed('环境变量配置完成');
  } catch (error) {
    spinner.fail('配置环境变量失败');
    throw error;
  }
}

/**
 * 配置 .gitignore 文件
 */
export async function configureGitignore(mainDirPath: string): Promise<void> {
  const spinner = ora('配置 .gitignore...').start();

  try {
    const gitignorePath = path.join(mainDirPath, '.gitignore');

    // 读取现有 .gitignore
    let content = '';
    try {
      content = await fs.readFile(gitignorePath, 'utf-8');
    } catch {
      // 文件不存在，创建新的
    }

    // 检查是否已有忽略规则
    const hasEnvLocalRule = content.includes('.env.local');
    const hasLocalRule = content.includes('*.local');

    // 如果都没有，添加 .env.local 规则
    if (!hasEnvLocalRule && !hasLocalRule) {
      const newContent = content.trim()
        ? `${content}\n\n# Environment files\n.env.local\n`
        : '# Environment files\n.env.local\n';

      await fs.writeFile(gitignorePath, newContent, 'utf-8');
      spinner.succeed('.gitignore 配置完成（已添加 .env.local）');
    } else {
      spinner.succeed('.gitignore 已有忽略规则，跳过');
    }
  } catch (error) {
    spinner.fail('配置 .gitignore 失败');
    throw error;
  }
}

/**
 * 显示成功信息
 */
export function displaySuccessInfo(
  mainDirName: string,
  port: number,
  mainBranch: string
): void {
  console.log('\n');
  console.log(chalk.green('✓ 初始化成功！\n'));

  console.log(chalk.bold('目录结构：'));
  console.log(`  .`);
  console.log(`  ├── ${mainDirName}/          # 主分支目录`);
  console.log(`  ├── worktrees/             # Worktree 目录`);
  console.log(`  └── .colyn/                # 配置目录`);
  console.log('');

  console.log(chalk.bold('配置信息：'));
  console.log(`  主分支: ${mainBranch}`);
  console.log(`  端口: ${port}`);
  console.log('');

  console.log(chalk.bold('后续操作：'));
  console.log(chalk.cyan('  1. 创建 worktree:'));
  console.log('     colyn add <branch-name>');
  console.log('');
  console.log(chalk.cyan('  2. 查看 worktree 列表:'));
  console.log('     colyn list');
  console.log('');
}

/**
 * 显示空目录成功信息
 */
export function displayEmptyDirectorySuccess(
  mainDirName: string,
  port: number,
  mainBranch: string
): void {
  console.log('\n');
  console.log(chalk.green('✓ 初始化成功！\n'));

  console.log(chalk.bold('目录结构：'));
  console.log(`  .`);
  console.log(`  ├── ${mainDirName}/          # 主分支目录（请在此目录中初始化项目）`);
  console.log(`  ├── worktrees/             # Worktree 目录`);
  console.log(`  └── .colyn/                # 配置目录`);
  console.log('');

  console.log(chalk.bold('后续操作：'));
  console.log(chalk.cyan(`  1. 进入主分支目录：`));
  console.log(`     cd ${mainDirName}`);
  console.log('');
  console.log(chalk.cyan('  2. 初始化 git 仓库（如果还没有）：'));
  console.log('     git init');
  console.log('');
  console.log(chalk.cyan('  3. 初始化你的项目（例如 npm/yarn init）'));
  console.log('');
  console.log(chalk.cyan('  4. 创建 worktree：'));
  console.log('     colyn add <branch-name>');
  console.log('');
}
