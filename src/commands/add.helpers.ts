import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import simpleGit from 'simple-git';
import type { WorktreeInfo } from '../types/index.js';
import { ColynError } from '../types/index.js';
import {
  output,
  outputLine,
  outputSuccess,
  outputBold,
  outputStep
} from '../utils/logger.js';
import { t } from '../i18n/index.js';

/**
 * 验证分支名称是否有效
 */
export function isValidBranchName(branchName: string): boolean {
  // Git 分支名称规则
  // 允许: 字母、数字、下划线、连字符、斜杠
  const branchNameRegex = /^[a-zA-Z0-9_\-/]+$/;

  if (!branchNameRegex.test(branchName)) {
    return false;
  }

  // 不能以 / 开头或结尾
  if (branchName.startsWith('/') || branchName.endsWith('/')) {
    return false;
  }

  // 不能包含连续的斜杠
  if (branchName.includes('//')) {
    return false;
  }

  return true;
}

/**
 * 检查是否已初始化（通过检查 .colyn 目录是否存在）
 */
export async function checkInitialized(rootDir: string): Promise<void> {
  const configDir = path.join(rootDir, '.colyn');

  try {
    await fs.access(configDir);
  } catch {
    throw new ColynError(
      t('commands.add.notInitialized'),
      t('commands.add.notInitializedHint')
    );
  }
}

/**
 * 检查是否为 git 仓库
 */
export async function checkIsGitRepo(): Promise<void> {
  const git = simpleGit();
  const isRepo = await git.checkIsRepo();

  if (!isRepo) {
    throw new ColynError(
      t('commands.add.notGitRepo'),
      t('commands.add.notGitRepoHint')
    );
  }
}

/**
 * 检查主分支 .env.local 是否存在
 */
export async function checkMainEnvFile(rootDir: string, mainDirName: string): Promise<void> {
  const mainDirPath = path.join(rootDir, mainDirName);
  const envFilePath = path.join(mainDirPath, '.env.local');

  try {
    await fs.access(envFilePath);
  } catch {
    throw new ColynError(
      t('commands.add.missingEnvFile'),
      t('commands.add.missingEnvFileHint')
    );
  }
}

/**
 * 处理分支（本地/远程/新建）
 * 注意：此函数会确保分支存在，但不会签出分支（最后会切换回主分支）
 */
export async function handleBranch(branchName: string, mainBranch: string): Promise<void> {
  const git = simpleGit();

  // 检查本地分支是否存在
  const branches = await git.branchLocal();
  const branchExists = branches.all.includes(branchName);

  if (branchExists) {
    // 本地分支存在，直接使用
    output(chalk.gray(t('commands.add.usingLocalBranch', { branch: branchName })));
    return;
  }

  // 本地分支不存在，检查远程
  const spinner = ora({ text: t('commands.add.checkingRemote'), stream: process.stderr }).start();

  try {
    // Fetch 最新的远程分支信息
    await git.fetch();

    // 检查远程分支是否存在
    const remoteBranches = await git.branch(['-r']);
    const remoteBranchName = `origin/${branchName}`;
    const remoteExists = remoteBranches.all.includes(remoteBranchName);

    if (remoteExists) {
      // 远程分支存在，创建跟踪分支（但不签出）
      spinner.text = t('commands.add.creatingFromRemote', { branch: branchName });
      // 使用 --track 创建分支，但不签出
      await git.raw(['branch', '--track', branchName, remoteBranchName]);
      spinner.succeed(t('commands.add.createdFromRemote', { branch: branchName }));
    } else {
      // 远程也不存在，基于主分支创建新分支
      spinner.text = t('commands.add.creatingNewBranch', { branch: branchName });

      // 确保当前在主分支
      const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
      if (currentBranch.trim() !== mainBranch) {
        await git.checkout(mainBranch);
      }

      // 创建新分支（但不签出）
      await git.raw(['branch', branchName]);

      spinner.succeed(t('commands.add.createdNewBranch', { branch: branchName }));
    }
  } catch (error) {
    spinner.fail(t('commands.add.branchHandleFailed'));
    throw error;
  }
}

/**
 * 创建 worktree
 * 注意：此函数应该在主分支目录（git 仓库所在地）中调用
 * @param rootDir 项目根目录（用于计算相对路径）
 * @param branchName 分支名称
 * @param id worktree ID
 * @param worktrees 已存在的 worktree 列表（用于查找冲突时提供信息）
 */
export async function createWorktree(
  rootDir: string,
  branchName: string,
  id: number,
  worktrees: WorktreeInfo[]
): Promise<string> {
  const spinner = ora({ text: t('commands.add.creatingWorktree'), stream: process.stderr }).start();

  try {
    // worktree 的绝对路径
    const worktreePath = path.join(rootDir, 'worktrees', `task-${id}`);

    // 计算相对于当前目录（主分支目录）的路径
    // 因为 git worktree add 使用的是相对路径
    const relativePath = path.relative(process.cwd(), worktreePath);

    const git = simpleGit();

    // 使用 git worktree add 命令（使用相对路径）
    await git.raw(['worktree', 'add', relativePath, branchName]);

    spinner.succeed(t('commands.add.worktreeCreated', { id: String(id) }));
    return worktreePath;
  } catch (error) {
    spinner.fail(t('commands.add.worktreeCreateFailed'));

    const errorMessage = error instanceof Error ? error.message : String(error);

    // 检查是否是分支已被其他 worktree 使用的错误
    if (errorMessage.includes('already used by worktree')) {
      // 尝试从错误信息中提取 worktree 路径
      const pathMatch = errorMessage.match(/already used by worktree at ['"]?([^'"]+)['"]?/);
      const existingPath = pathMatch ? pathMatch[1] : null;

      // 查找已存在的 worktree 中该分支对应的信息
      const existingWorktree = worktrees.find(w => w.branch === branchName);

      if (existingWorktree) {
        // 该分支在当前项目的配置中
        throw new ColynError(
          t('commands.add.branchAlreadyUsed', { branch: branchName }),
          t('commands.add.branchAlreadyUsedHint', {
            id: String(existingWorktree.id),
            path: existingWorktree.path,
            port: String(existingWorktree.port)
          })
        );
      } else if (existingPath) {
        // 分支被其他项目或手动创建的 worktree 使用
        throw new ColynError(
          t('commands.add.branchUsedByOther', { branch: branchName }),
          t('commands.add.branchUsedByOtherHint', { path: existingPath })
        );
      } else {
        // 无法提取路径信息，但确定是分支冲突
        throw new ColynError(
          t('commands.add.branchUsedUnknown', { branch: branchName }),
          t('commands.add.branchUsedUnknownHint')
        );
      }
    }

    // 其他错误
    throw new ColynError(
      t('commands.add.worktreeError'),
      t('commands.add.worktreeErrorHint', { error: errorMessage })
    );
  }
}

/**
 * 读取环境变量文件
 */
export async function readEnvFile(filePath: string): Promise<Record<string, string>> {
  const content = await fs.readFile(filePath, 'utf-8');
  const env: Record<string, string> = {};

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // 跳过注释和空行
    if (trimmed.startsWith('#') || trimmed === '') {
      continue;
    }

    // 解析环境变量
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      env[key] = value;
    }
  }

  return env;
}

/**
 * 写入环境变量文件
 */
export async function writeEnvFile(
  filePath: string,
  env: Record<string, string>
): Promise<void> {
  const lines: string[] = [];

  // 添加注释
  lines.push('# Environment variables for this worktree');
  lines.push('# Auto-generated by colyn');
  lines.push('');

  // 写入环境变量
  for (const [key, value] of Object.entries(env)) {
    lines.push(`${key}=${value}`);
  }

  lines.push(''); // 末尾空行

  await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
}

/**
 * 配置 worktree 环境变量
 */
export async function configureWorktreeEnv(
  mainDirPath: string,
  worktreePath: string,
  id: number,
  port: number
): Promise<void> {
  const spinner = ora({ text: t('commands.add.configuringEnv'), stream: process.stderr }).start();

  try {
    // 读取主分支的 .env.local
    const mainEnvPath = path.join(mainDirPath, '.env.local');
    const mainEnv = await readEnvFile(mainEnvPath);

    // 复制所有环境变量
    const worktreeEnv = { ...mainEnv };

    // 更新 PORT 和 WORKTREE
    worktreeEnv.PORT = port.toString();
    worktreeEnv.WORKTREE = id.toString();

    // 写入 worktree 的 .env.local
    const worktreeEnvPath = path.join(worktreePath, '.env.local');
    await writeEnvFile(worktreeEnvPath, worktreeEnv);

    spinner.succeed(t('commands.add.envConfigured'));
  } catch (error) {
    spinner.fail(t('commands.add.envConfigFailed'));
    throw error;
  }
}

/**
 * 显示成功信息（输出到 stderr）
 */
export function displayAddSuccess(
  id: number,
  branch: string,
  worktreePath: string,
  port: number,
  displayPath: string,
  runCommand: string = 'npm run'
): void {
  outputLine();
  outputSuccess(t('commands.add.successTitle') + '\n');

  outputBold(t('commands.add.worktreeInfo'));
  output(`  ${t('commands.add.infoId', { id: String(id) })}`);
  output(`  ${t('commands.add.infoBranch', { branch })}`);
  output(`  ${t('commands.add.infoPath', { path: displayPath })}`);
  output(`  ${t('commands.add.infoPort', { port: String(port) })}`);
  outputLine();

  outputBold(t('commands.add.nextSteps'));
  outputStep(`  ${t('commands.add.step1')}`);
  output(`     cd ${displayPath}`);
  outputLine();
  outputStep(`  ${t('commands.add.step2')}`);
  output(`     ${runCommand} dev`);
  outputLine();
  outputStep(`  ${t('commands.add.step3')}`);
  output('     colyn list');
  outputLine();
}
