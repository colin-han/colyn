import * as fs from 'fs/promises';
import * as path from 'path';
import ora from 'ora';
import simpleGit from 'simple-git';
import { getProjectPaths, validateProjectInitialized } from '../core/paths.js';
import { getMainPort, discoverWorktrees } from '../core/discovery.js';
import { updateEnvFilePreserveComments, readEnvFile } from '../core/env.js';
import { checkIsRepo } from '../core/git.js';
import {
  output,
  outputLine,
  outputSuccess,
  outputError,
  outputWarning,
  outputBold
} from '../utils/logger.js';
import { ColynError } from '../types/index.js';
import { t } from '../i18n/index.js';

/**
 * 修复结果接口
 */
interface RepairResult {
  /** 检查项名称 */
  item: string;
  /** 是否成功 */
  success: boolean;
  /** 是否有修复 */
  fixed: boolean;
  /** 修复详情 */
  details?: string[];
  /** 错误信息 */
  error?: string;
}

/**
 * 检查并修复主分支 .env.local
 */
async function checkMainEnv(
  mainDir: string,
  mainPort: number
): Promise<RepairResult> {
  const envPath = path.join(mainDir, '.env.local');
  const result: RepairResult = {
    item: t('commands.repair.checkingMainEnv').replace('...', ''),
    success: true,
    fixed: false,
    details: []
  };

  try {
    const env = await readEnvFile(envPath);
    const updates: Record<string, string> = {};
    let needsFix = false;

    // 检查 PORT（保持现有值，不修改）
    if (!env.PORT) {
      updates.PORT = mainPort.toString();
      needsFix = true;
      result.details!.push(t('commands.repair.addPort', { port: mainPort }));
    }

    // 检查 WORKTREE
    if (!env.WORKTREE || env.WORKTREE !== 'main') {
      updates.WORKTREE = 'main';
      needsFix = true;
      if (env.WORKTREE) {
        result.details!.push(t('commands.repair.updateWorktree', { old: env.WORKTREE, new: 'main' }));
      } else {
        result.details!.push(t('commands.repair.addWorktree', { value: 'main' }));
      }
    }

    // 如果需要修复，更新文件
    if (needsFix) {
      await updateEnvFilePreserveComments(envPath, updates);
      result.fixed = true;
    }
  } catch (error) {
    result.success = false;
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

/**
 * 检查并修复 worktree .env.local
 */
async function checkWorktreeEnv(
  wtPath: string,
  wtId: number,
  mainPort: number,
  mainDir: string
): Promise<RepairResult> {
  const wtName = path.basename(wtPath);
  const envPath = path.join(wtPath, '.env.local');
  const result: RepairResult = {
    item: `Worktree ${wtName} .env.local`,
    success: true,
    fixed: false,
    details: []
  };

  try {
    const env = await readEnvFile(envPath);
    const updates: Record<string, string> = {};
    let needsFix = false;

    const expectedPort = mainPort + wtId;
    const expectedWorktree = wtId.toString();

    // 检查 PORT
    const currentPort = env.PORT ? parseInt(env.PORT) : 0;
    if (currentPort !== expectedPort) {
      updates.PORT = expectedPort.toString();
      needsFix = true;
      if (env.PORT) {
        result.details!.push(t('commands.repair.updatePort', { old: env.PORT, new: expectedPort }));
      } else {
        result.details!.push(t('commands.repair.addPort', { port: expectedPort }));
      }
    }

    // 检查 WORKTREE
    if (env.WORKTREE !== expectedWorktree) {
      updates.WORKTREE = expectedWorktree;
      needsFix = true;
      if (env.WORKTREE) {
        result.details!.push(t('commands.repair.updateWorktree', { old: env.WORKTREE, new: expectedWorktree }));
      } else {
        result.details!.push(t('commands.repair.addWorktree', { value: expectedWorktree }));
      }
    }

    // 如果需要修复
    if (needsFix) {
      // 如果文件不存在，从主分支复制
      try {
        await fs.access(envPath);
      } catch {
        // 文件不存在，从主分支复制
        const mainEnvPath = path.join(mainDir, '.env.local');
        try {
          const mainEnvContent = await fs.readFile(mainEnvPath, 'utf-8');
          await fs.writeFile(envPath, mainEnvContent, 'utf-8');
        } catch {
          // 主分支文件也不存在，创建新文件
        }
      }

      await updateEnvFilePreserveComments(envPath, updates);
      result.fixed = true;
    }
  } catch (error) {
    result.success = false;
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

/**
 * 修复 git worktree 连接
 */
async function repairGitWorktree(mainDir: string): Promise<RepairResult> {
  const result: RepairResult = {
    item: t('commands.repair.repairingGit').replace('...', ''),
    success: true,
    fixed: false,
    details: []
  };

  try {
    const git = simpleGit(mainDir);
    await git.raw(['worktree', 'repair']);
    result.fixed = true;
    result.details!.push(t('commands.repair.gitRepairDetail'));
  } catch (error) {
    result.success = false;
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

/**
 * Git worktree 信息（来自 porcelain 输出）
 */
interface GitWorktreeInfo {
  path: string;
  branch: string;
  head: string;
}

/**
 * 孤儿检测结果
 */
interface OrphanDetectionResult {
  /** 已修复的孤儿（路径失效型） */
  repairedOrphans: string[];
  /** 真正的孤儿（git 完全不识别） */
  trueOrphans: string[];
  /** 修复失败的 */
  repairFailed: Array<{ dir: string; error: string }>;
}

/**
 * 从目录读取分支名
 */
async function getBranchFromWorktreeDir(worktreePath: string): Promise<string | null> {
  try {
    // 方法 1: 从 .git 文件读取
    const gitFilePath = path.join(worktreePath, '.git');
    try {
      const gitContent = await fs.readFile(gitFilePath, 'utf-8');
      // .git 文件格式: gitdir: /path/to/.git/worktrees/task-1
      const match = gitContent.match(/gitdir:\s*(.+)/);
      if (match) {
        const gitDir = match[1].trim();
        const headPath = path.join(gitDir, 'HEAD');
        const headContent = await fs.readFile(headPath, 'utf-8');
        const branchMatch = headContent.match(/ref:\s*refs\/heads\/(.+)/);
        if (branchMatch) {
          return branchMatch[1].trim();
        }
      }
    } catch {
      // 忽略，尝试其他方法
    }

    // 方法 2: 使用 simple-git
    try {
      const git = simpleGit(worktreePath);
      const branch = await git.branchLocal();
      return branch.current;
    } catch {
      // 忽略
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * 获取所有 git worktree（包括路径失效的）
 */
async function getAllGitWorktrees(mainDir: string): Promise<GitWorktreeInfo[]> {
  const worktrees: GitWorktreeInfo[] = [];

  try {
    const git = simpleGit(mainDir);
    const output = await git.raw(['worktree', 'list', '--porcelain']);

    // 解析 porcelain 输出
    const blocks = output.trim().split('\n\n');
    for (const block of blocks) {
      const lines = block.split('\n');
      let wtPath = '';
      let wtBranch = '';
      let wtHead = '';

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          wtPath = line.substring(9);
        } else if (line.startsWith('HEAD ')) {
          wtHead = line.substring(5);
        } else if (line.startsWith('branch ')) {
          wtBranch = line.substring(7).replace('refs/heads/', '');
        }
      }

      if (wtPath && wtBranch) {
        worktrees.push({
          path: wtPath,
          branch: wtBranch,
          head: wtHead
        });
      }
    }
  } catch {
    // 忽略错误
  }

  return worktrees;
}

/**
 * 检测并修复孤儿 worktree 目录
 */
async function detectAndRepairOrphans(
  mainDir: string,
  worktreesDir: string
): Promise<OrphanDetectionResult> {
  const result: OrphanDetectionResult = {
    repairedOrphans: [],
    trueOrphans: [],
    repairFailed: []
  };

  try {
    // 1. 获取所有 git worktree（包括路径失效的）
    const gitWorktrees = await getAllGitWorktrees(mainDir);

    // 2. 获取实际目录
    const entries = await fs.readdir(worktreesDir);
    const actualDirs = entries.filter(e => e.startsWith('task-'));

    // 3. 检查每个实际目录
    for (const dirName of actualDirs) {
      const fullPath = path.join(worktreesDir, dirName);

      try {
        const stats = await fs.stat(fullPath);
        if (!stats.isDirectory()) {
          continue;
        }
      } catch {
        continue;
      }

      // 检查这个目录是否在 git worktree list 中（路径匹配）
      const existsInGit = gitWorktrees.some(wt => wt.path === fullPath);

      if (existsInGit) {
        // 路径匹配，跳过
        continue;
      }

      // 路径不匹配，尝试通过分支名匹配
      const branch = await getBranchFromWorktreeDir(fullPath);

      if (branch) {
        // 在 git worktree list 中查找相同分支但路径不同的
        const matchedGitWt = gitWorktrees.find(
          wt => wt.branch === branch && wt.path !== fullPath
        );

        if (matchedGitWt) {
          // 找到匹配！这是路径失效型，尝试修复
          try {
            const git = simpleGit(mainDir);
            await git.raw(['worktree', 'repair', fullPath]);
            result.repairedOrphans.push(dirName);
          } catch (error) {
            result.repairFailed.push({
              dir: dirName,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        } else {
          // 没有匹配的分支，可能是真孤儿
          result.trueOrphans.push(dirName);
        }
      } else {
        // 无法读取分支名，可能是真孤儿
        result.trueOrphans.push(dirName);
      }
    }
  } catch {
    // 忽略错误
  }

  return result;
}

/**
 * 显示修复摘要
 */
function displayRepairSummary(
  results: RepairResult[],
  orphanResult: OrphanDetectionResult
): void {
  outputLine();
  outputSuccess(t('commands.repair.repairComplete') + '\n');

  // 统计
  const fixedCount = results.filter(r => r.fixed).length;
  const errorCount = results.filter(r => !r.success).length;
  const totalOrphans = orphanResult.repairedOrphans.length +
                       orphanResult.trueOrphans.length +
                       orphanResult.repairFailed.length;

  outputBold(t('commands.repair.repairSummary'));

  // 显示修复的项
  const totalFixed = fixedCount + orphanResult.repairedOrphans.length;
  if (totalFixed > 0) {
    output(`  ${t('commands.repair.fixedItems', { count: totalFixed })}`);
  } else {
    output(`  ${t('commands.repair.allCorrect')}`);
  }

  // 显示错误
  if (errorCount > 0 || orphanResult.repairFailed.length > 0) {
    const totalErrors = errorCount + orphanResult.repairFailed.length;
    outputWarning(`  ${t('commands.repair.failedItems', { count: totalErrors })}`);
  }

  // 显示孤儿目录
  if (orphanResult.repairedOrphans.length > 0) {
    output(`  ${t('commands.repair.repairedOrphans', { count: orphanResult.repairedOrphans.length })}`);
  }

  if (orphanResult.trueOrphans.length > 0) {
    outputWarning(`  ${t('commands.repair.trueOrphans', { count: orphanResult.trueOrphans.length })}`);
  }

  if (totalOrphans === 0) {
    output(`  ${t('commands.repair.noOrphansFound')}`);
  }

  outputLine();

  // 详细信息
  outputBold(t('commands.repair.detailsTitle'));

  for (const result of results) {
    if (result.success && !result.fixed) {
      output(`  ${result.item}:`);
      output(`    ${t('commands.repair.configCorrect')}`);
    } else if (result.success && result.fixed) {
      output(`  ${result.item}:`);
      for (const detail of result.details || []) {
        output(`    ✗ ${detail}`);
      }
    } else {
      output(`  ${result.item}:`);
      outputError(`    ${t('commands.repair.repairFailed', { error: result.error ?? '' })}`);
    }
  }

  // 显示已修复的路径失效 worktree
  if (orphanResult.repairedOrphans.length > 0) {
    outputLine();
    output(t('commands.repair.repairedOrphansTitle'));
    for (const dir of orphanResult.repairedOrphans) {
      output(`  ${t('commands.repair.orphanRepaired', { dir })}`);
    }
  }

  // 显示修复失败的
  if (orphanResult.repairFailed.length > 0) {
    outputLine();
    outputWarning(t('commands.repair.repairFailedTitle'));
    for (const item of orphanResult.repairFailed) {
      output(`  ${t('commands.repair.orphanFailed', { dir: item.dir, error: item.error })}`);
    }
  }

  // 显示真孤儿目录详情
  if (orphanResult.trueOrphans.length > 0) {
    outputLine();
    outputWarning(t('commands.repair.trueOrphansTitle'));
    for (const orphan of orphanResult.trueOrphans) {
      output(`  ${t('commands.repair.orphanDir', { dir: orphan })}`);
    }
    outputLine();
    output(t('commands.repair.orphanSuggestion'));
    output(`  ${t('commands.repair.orphanSuggestionHint')}`);
  }

  outputLine();
}

/**
 * 修复项目配置
 */
export async function repairProject(): Promise<void> {
  const results: RepairResult[] = [];

  // 1. 获取项目路径
  const paths = await getProjectPaths();
  await validateProjectInitialized(paths);

  // 2. 检查是否是 git 仓库
  if (!(await checkIsRepo())) {
    throw new ColynError(
      t('commands.repair.notGitRepo'),
      t('commands.repair.notGitRepoHint')
    );
  }

  // 3. 获取主端口
  let mainPort: number;
  try {
    mainPort = await getMainPort(paths.mainDir);
  } catch {
    // 如果无法获取主端口，使用默认值
    mainPort = 10000;
  }

  // 4. 检查主分支 .env.local
  const spinner = ora({
    text: t('commands.repair.checkingMainEnv'),
    stream: process.stderr
  }).start();

  const mainEnvResult = await checkMainEnv(paths.mainDir, mainPort);
  results.push(mainEnvResult);

  if (mainEnvResult.success && !mainEnvResult.fixed) {
    spinner.succeed(t('commands.repair.mainEnvCorrect'));
  } else if (mainEnvResult.success && mainEnvResult.fixed) {
    spinner.warn(t('commands.repair.mainEnvFixed'));
  } else {
    spinner.fail(t('commands.repair.mainEnvFailed'));
  }

  // 5. 获取所有 worktree 并检查
  const worktrees = await discoverWorktrees(paths.mainDir, paths.worktreesDir);

  for (const wt of worktrees) {
    const wtSpinner = ora({
      text: t('commands.repair.checkingWorktreeEnv', { id: wt.id }),
      stream: process.stderr
    }).start();

    const wtResult = await checkWorktreeEnv(
      wt.path,
      wt.id,
      mainPort,
      paths.mainDir
    );
    results.push(wtResult);

    if (wtResult.success && !wtResult.fixed) {
      wtSpinner.succeed(t('commands.repair.worktreeEnvCorrect', { id: wt.id }));
    } else if (wtResult.success && wtResult.fixed) {
      wtSpinner.warn(t('commands.repair.worktreeEnvFixed', { id: wt.id }));
    } else {
      wtSpinner.fail(t('commands.repair.worktreeEnvFailed', { id: wt.id }));
    }
  }

  // 6. 修复 git worktree 连接
  const gitSpinner = ora({
    text: t('commands.repair.repairingGit'),
    stream: process.stderr
  }).start();

  const gitResult = await repairGitWorktree(paths.mainDir);
  results.push(gitResult);

  if (gitResult.success) {
    gitSpinner.succeed(t('commands.repair.gitRepaired'));
  } else {
    gitSpinner.fail(t('commands.repair.gitRepairFailed'));
  }

  // 7. 检测并修复孤儿 worktree 目录
  const orphanSpinner = ora({
    text: t('commands.repair.detectingOrphans'),
    stream: process.stderr
  }).start();

  const orphanResult = await detectAndRepairOrphans(paths.mainDir, paths.worktreesDir);

  const totalOrphans = orphanResult.repairedOrphans.length +
                       orphanResult.trueOrphans.length +
                       orphanResult.repairFailed.length;

  if (totalOrphans === 0) {
    orphanSpinner.succeed(t('commands.repair.noOrphans'));
  } else if (orphanResult.repairedOrphans.length > 0) {
    orphanSpinner.succeed(t('commands.repair.orphansRepaired', { count: orphanResult.repairedOrphans.length }));
  } else {
    orphanSpinner.warn(t('commands.repair.orphansFound', { count: totalOrphans }));
  }

  // 8. 显示修复摘要
  displayRepairSummary(results, orphanResult);
}
