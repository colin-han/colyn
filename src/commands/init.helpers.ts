import * as fs from 'fs/promises';
import * as path from 'path';
import ora from 'ora';
import Enquirer from 'enquirer';
const { prompt } = Enquirer;
import {
  DirectoryStatus,
  type DirectoryInfo,
  ColynError
} from '../types/index.js';
import { checkIsRepo } from '../core/git.js';
import { updateEnvFilePreserveComments } from '../core/env.js';
import { findProjectRoot } from '../core/paths.js';
import {
  output,
  outputLine,
  outputSuccess,
  outputBold,
  outputStep
} from '../utils/logger.js';
import { t } from '../i18n/index.js';

/**
 * 检测目录状态
 */
export async function detectDirectoryStatus(): Promise<DirectoryInfo> {
  const rootDir = process.cwd();
  const currentDirName = path.basename(rootDir);

  // 检查是否已经在一个 colyn 项目中（防止嵌套初始化）
  try {
    const existingRoot = await findProjectRoot(rootDir);
    if (existingRoot !== rootDir) {
      throw new ColynError(
        t('commands.init.alreadyInProject'),
        t('commands.init.alreadyInProjectHint', { root: existingRoot })
      );
    }
  } catch (error) {
    // 如果找不到项目根目录，说明不在项目中，可以继续
    if (!(error instanceof ColynError) || !error.message.includes(t('errors.projectRootNotFound'))) {
      throw error;
    }
  }

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
      throw new ColynError(t('commands.init.invalidPort'), t('commands.init.invalidPortHint'));
    }
    return port;
  }

  // 交互式询问（输出到 stderr，避免被 shell 脚本捕获）
  if (!process.stdin.isTTY) {
    throw new ColynError(
      t('commands.init.nonInteractivePort'),
      t('commands.init.nonInteractivePortHint')
    );
  }

  const { port } = await prompt<{ port: string }>({
    type: 'input',
    name: 'port',
    message: t('commands.init.enterPort'),
    initial: '10000',
    stdout: process.stderr,
    validate: (value) => {
      const num = parseInt(value);
      return num > 0 && num < 65536 ? true : t('commands.init.portValidation');
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
        t('commands.init.directoryConflict', { name: mainDirName }),
        t('commands.init.directoryConflictHint')
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
  const spinner = ora({ text: t('commands.init.movingFiles'), stream: process.stderr }).start();

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
      spinner.text = t('commands.init.moving', { file: entry });
    }

    spinner.succeed(t('commands.init.filesMoved'));
  } catch (error) {
    spinner.fail(t('commands.init.moveFilesFailed'));
    throw new ColynError(
      t('commands.init.moveFilesError'),
      t('commands.init.moveFilesErrorHint')
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
  const spinner = ora({ text: t('commands.init.configuringEnv'), stream: process.stderr }).start();

  try {
    const envFilePath = path.join(mainDirPath, '.env.local');

    // 需要添加的环境变量
    const requiredEnv = {
      PORT: port.toString(),
      WORKTREE: worktree
    };

    // 智能合并
    await updateEnvFilePreserveComments(envFilePath, requiredEnv);

    spinner.succeed(t('commands.init.envConfigured'));
  } catch (error) {
    spinner.fail(t('commands.init.envConfigFailed'));
    throw error;
  }
}

/**
 * 配置 .gitignore 文件
 */
export async function configureGitignore(mainDirPath: string): Promise<void> {
  const spinner = ora({ text: t('commands.init.configuringGitignore'), stream: process.stderr }).start();

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
      spinner.succeed(t('commands.init.gitignoreConfigured'));
    } else {
      spinner.succeed(t('commands.init.gitignoreSkipped'));
    }
  } catch (error) {
    spinner.fail(t('commands.init.gitignoreFailed'));
    throw error;
  }
}

/**
 * 显示成功信息（输出到 stderr）
 */
export function displaySuccessInfo(
  mainDirName: string,
  port: number,
  mainBranch: string
): void {
  outputLine();
  outputSuccess(t('commands.init.successTitle') + '\n');

  outputBold(t('commands.init.directoryStructure'));
  output('  .');
  output(`  \u251C\u2500\u2500 ${mainDirName}/          ${t('commands.init.mainDirComment')}`);
  output(`  \u251C\u2500\u2500 worktrees/             ${t('commands.init.worktreesDirComment')}`);
  output(`  \u2514\u2500\u2500 .colyn/                ${t('commands.init.configDirComment')}`);
  outputLine();

  outputBold(t('commands.init.configInfo'));
  output(`  ${t('commands.init.mainBranch', { branch: mainBranch })}`);
  output(`  ${t('commands.init.port', { port: String(port) })}`);
  outputLine();

  outputBold(t('commands.init.nextSteps'));
  outputStep(`  ${t('commands.init.step1CreateWorktree')}`);
  output('     colyn add <branch-name>');
  outputLine();
  outputStep(`  ${t('commands.init.step2ListWorktrees')}`);
  output('     colyn list');
  outputLine();
}

/**
 * 显示空目录成功信息（输出到 stderr）
 */
export function displayEmptyDirectorySuccess(
  mainDirName: string,
  _port: number,
  _mainBranch: string
): void {
  outputLine();
  outputSuccess(t('commands.init.successTitle') + '\n');

  outputBold(t('commands.init.directoryStructure'));
  output('  .');
  output(`  \u251C\u2500\u2500 ${mainDirName}/          ${t('commands.init.mainDirCommentEmpty')}`);
  output(`  \u251C\u2500\u2500 worktrees/             ${t('commands.init.worktreesDirComment')}`);
  output(`  \u2514\u2500\u2500 .colyn/                ${t('commands.init.configDirComment')}`);
  outputLine();

  outputBold(t('commands.init.nextSteps'));
  outputStep(`  ${t('commands.init.step1EnterDir')}`);
  output(`     cd ${mainDirName}`);
  outputLine();
  outputStep(`  ${t('commands.init.step2InitGit')}`);
  output('     git init');
  outputLine();
  outputStep(`  ${t('commands.init.step3InitProject')}`);
  outputLine();
  outputStep(`  ${t('commands.init.step4CreateWorktree')}`);
  output('     colyn add <branch-name>');
  outputLine();
}
