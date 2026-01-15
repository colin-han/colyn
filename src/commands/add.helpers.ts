import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import simpleGit from 'simple-git';
import type { ColynConfig, WorktreeInfo } from '../types/index.js';
import { ColynError } from '../types/index.js';
import { saveConfig } from '../core/config.js';

/**
 * 验证分支名称是否有效
 */
export function isValidBranchName(branchName: string): boolean {
  // Git 分支名称规则
  // 允许: 字母、数字、下划线、连字符、斜杠
  const branchNameRegex = /^[a-zA-Z0-9_\-\/]+$/;

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
 * 分配 worktree ID 和端口
 */
export function assignWorktreeIdAndPort(config: ColynConfig): { id: number; port: number } {
  const id = config.nextWorktreeId;
  const port = config.mainPort + id;

  return { id, port };
}

/**
 * 检查是否已初始化
 */
export async function checkInitialized(rootDir: string): Promise<void> {
  const configPath = path.join(rootDir, '.colyn', 'config.json');

  try {
    await fs.access(configPath);
  } catch {
    throw new ColynError(
      '当前目录未初始化',
      '请先运行 colyn init 命令初始化项目'
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
      '当前目录不是 git 仓库',
      '请在 git 仓库中运行此命令'
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
      '主分支目录缺少 .env.local 文件',
      '请先在主分支目录配置环境变量'
    );
  }
}

/**
 * 检查分支是否已有 worktree
 */
export async function checkBranchWorktreeConflict(
  config: ColynConfig,
  branch: string
): Promise<void> {
  const existingWorktree = config.worktrees.find(w => w.branch === branch);

  if (existingWorktree) {
    throw new ColynError(
      `分支 "${branch}" 已存在 worktree`,
      `ID: ${existingWorktree.id}, 路径: ${existingWorktree.path}`
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
    console.log(chalk.gray(`使用本地分支: ${branchName}`));
    return;
  }

  // 本地分支不存在，检查远程
  const spinner = ora('检查远程分支...').start();

  try {
    // Fetch 最新的远程分支信息
    await git.fetch();

    // 检查远程分支是否存在
    const remoteBranches = await git.branch(['-r']);
    const remoteBranchName = `origin/${branchName}`;
    const remoteExists = remoteBranches.all.includes(remoteBranchName);

    if (remoteExists) {
      // 远程分支存在，创建跟踪分支（但不签出）
      spinner.text = `从远程创建分支: ${branchName}`;
      // 使用 --track 创建分支，但不签出
      await git.raw(['branch', '--track', branchName, remoteBranchName]);
      spinner.succeed(`已从远程创建分支: ${branchName}`);
    } else {
      // 远程也不存在，基于主分支创建新分支
      spinner.text = `基于主分支创建新分支: ${branchName}`;

      // 确保当前在主分支
      const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
      if (currentBranch.trim() !== mainBranch) {
        await git.checkout(mainBranch);
      }

      // 创建新分支（但不签出）
      await git.raw(['branch', branchName]);

      spinner.succeed(`已创建新分支: ${branchName}`);
    }
  } catch (error) {
    spinner.fail('分支处理失败');
    throw error;
  }
}

/**
 * 创建 worktree
 * 注意：此函数应该在主分支目录（git 仓库所在地）中调用
 * @param rootDir 项目根目录（用于计算相对路径）
 * @param branchName 分支名称
 * @param id worktree ID
 */
export async function createWorktree(
  rootDir: string,
  branchName: string,
  id: number
): Promise<string> {
  const spinner = ora('创建 worktree...').start();

  try {
    // worktree 的绝对路径
    const worktreePath = path.join(rootDir, 'worktrees', `task-${id}`);

    // 计算相对于当前目录（主分支目录）的路径
    // 因为 git worktree add 使用的是相对路径
    const relativePath = path.relative(process.cwd(), worktreePath);

    const git = simpleGit();

    // 使用 git worktree add 命令（使用相对路径）
    await git.raw(['worktree', 'add', relativePath, branchName]);

    spinner.succeed(`Worktree 创建完成: task-${id}`);
    return worktreePath;
  } catch (error) {
    spinner.fail('创建 worktree 失败');
    throw new ColynError(
      '创建 worktree 时发生错误',
      '请检查分支是否存在或 worktree 目录是否可写'
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
  const spinner = ora('配置环境变量...').start();

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

    spinner.succeed('环境变量配置完成');
  } catch (error) {
    spinner.fail('配置环境变量失败');
    throw error;
  }
}

/**
 * 更新配置文件，添加 worktree 信息
 */
export async function updateConfigWithWorktree(
  rootDir: string,
  config: ColynConfig,
  worktreeInfo: WorktreeInfo
): Promise<void> {
  const spinner = ora('更新配置文件...').start();

  try {
    // 添加 worktree 信息
    config.worktrees.push(worktreeInfo);

    // 递增 nextWorktreeId
    config.nextWorktreeId += 1;

    // 保存配置
    await saveConfig(rootDir, config);

    spinner.succeed('配置文件更新完成');
  } catch (error) {
    spinner.fail('更新配置文件失败');
    throw error;
  }
}

/**
 * 显示成功信息
 */
export function displayAddSuccess(
  id: number,
  branch: string,
  worktreePath: string,
  port: number
): void {
  console.log('');
  console.log(chalk.green(`✓ Worktree 创建成功！\n`));

  console.log(chalk.bold('Worktree 信息：'));
  console.log(`  ID: ${id}`);
  console.log(`  分支: ${branch}`);
  console.log(`  路径: ${worktreePath}`);
  console.log(`  端口: ${port}`);
  console.log('');

  console.log(chalk.bold('后续操作：'));
  console.log(chalk.cyan('  1. 进入 worktree 目录：'));
  console.log(`     cd ${worktreePath}`);
  console.log('');
  console.log(chalk.cyan('  2. 启动开发服务器（端口已自动配置）：'));
  console.log('     npm run dev');
  console.log('');
  console.log(chalk.cyan('  3. 查看所有 worktree：'));
  console.log('     colyn list');
  console.log('');
}
