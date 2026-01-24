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
    item: '主分支 .env.local',
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
      result.details!.push(`添加 PORT=${mainPort}`);
    }

    // 检查 WORKTREE
    if (!env.WORKTREE || env.WORKTREE !== 'main') {
      updates.WORKTREE = 'main';
      needsFix = true;
      if (env.WORKTREE) {
        result.details!.push(`WORKTREE: ${env.WORKTREE} → main`);
      } else {
        result.details!.push('添加 WORKTREE=main');
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
        result.details!.push(`PORT: ${env.PORT} → ${expectedPort}`);
      } else {
        result.details!.push(`添加 PORT=${expectedPort}`);
      }
    }

    // 检查 WORKTREE
    if (env.WORKTREE !== expectedWorktree) {
      updates.WORKTREE = expectedWorktree;
      needsFix = true;
      if (env.WORKTREE) {
        result.details!.push(`WORKTREE: ${env.WORKTREE} → ${expectedWorktree}`);
      } else {
        result.details!.push(`添加 WORKTREE=${expectedWorktree}`);
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
    item: 'Git worktree 连接',
    success: true,
    fixed: false,
    details: []
  };

  try {
    const git = simpleGit(mainDir);
    await git.raw(['worktree', 'repair']);
    result.fixed = true;
    result.details!.push('Git worktree 连接已修复');
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
  outputSuccess('修复完成！\n');

  // 统计
  const fixedCount = results.filter(r => r.fixed).length;
  const errorCount = results.filter(r => !r.success).length;
  const totalOrphans = orphanResult.repairedOrphans.length +
                       orphanResult.trueOrphans.length +
                       orphanResult.repairFailed.length;

  outputBold('修复摘要：');

  // 显示修复的项
  const totalFixed = fixedCount + orphanResult.repairedOrphans.length;
  if (totalFixed > 0) {
    output(`  ✓ 修复了 ${totalFixed} 个配置项`);
  } else {
    output('  ✓ 所有配置正确，无需修复');
  }

  // 显示错误
  if (errorCount > 0 || orphanResult.repairFailed.length > 0) {
    const totalErrors = errorCount + orphanResult.repairFailed.length;
    outputWarning(`  ⚠ ${totalErrors} 个项修复失败（见下方详情）`);
  }

  // 显示孤儿目录
  if (orphanResult.repairedOrphans.length > 0) {
    output(`  ✓ 修复了 ${orphanResult.repairedOrphans.length} 个路径失效的 worktree`);
  }

  if (orphanResult.trueOrphans.length > 0) {
    outputWarning(`  ⚠ 发现 ${orphanResult.trueOrphans.length} 个孤儿 worktree 目录`);
  }

  if (totalOrphans === 0) {
    output('  ✓ 未发现孤儿 worktree 目录');
  }

  outputLine();

  // 详细信息
  outputBold('详细信息：');

  for (const result of results) {
    if (result.success && !result.fixed) {
      output(`  ${result.item}:`);
      output('    ✓ 配置正确');
    } else if (result.success && result.fixed) {
      output(`  ${result.item}:`);
      for (const detail of result.details || []) {
        output(`    ✗ ${detail}`);
      }
    } else {
      output(`  ${result.item}:`);
      outputError(`    ✗ 修复失败: ${result.error}`);
    }
  }

  // 显示已修复的路径失效 worktree
  if (orphanResult.repairedOrphans.length > 0) {
    outputLine();
    output('已修复路径失效的 worktree：');
    for (const dir of orphanResult.repairedOrphans) {
      output(`  ✓ ${dir} (git 路径已更新)`);
    }
  }

  // 显示修复失败的
  if (orphanResult.repairFailed.length > 0) {
    outputLine();
    outputWarning('修复失败的 worktree：');
    for (const item of orphanResult.repairFailed) {
      output(`  ✗ ${item.dir}: ${item.error}`);
    }
  }

  // 显示真孤儿目录详情
  if (orphanResult.trueOrphans.length > 0) {
    outputLine();
    outputWarning('孤儿 worktree 目录：');
    for (const orphan of orphanResult.trueOrphans) {
      output(`  - ${orphan} (目录存在但 git 不识别)`);
    }
    outputLine();
    output('建议操作：');
    output('  运行 colyn remove 命令清理，或手动删除目录');
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
      '主分支目录不是 git 仓库',
      '请确保在 git 项目中运行 repair 命令'
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
    text: '检查主分支 .env.local...',
    stream: process.stderr
  }).start();

  const mainEnvResult = await checkMainEnv(paths.mainDir, mainPort);
  results.push(mainEnvResult);

  if (mainEnvResult.success && !mainEnvResult.fixed) {
    spinner.succeed('主分支 .env.local 配置正确');
  } else if (mainEnvResult.success && mainEnvResult.fixed) {
    spinner.warn('已修复主分支 .env.local');
  } else {
    spinner.fail('修复主分支 .env.local 失败');
  }

  // 5. 获取所有 worktree 并检查
  const worktrees = await discoverWorktrees(paths.mainDir, paths.worktreesDir);

  for (const wt of worktrees) {
    const wtSpinner = ora({
      text: `检查 worktree task-${wt.id} .env.local...`,
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
      wtSpinner.succeed(`Worktree task-${wt.id} .env.local 配置正确`);
    } else if (wtResult.success && wtResult.fixed) {
      wtSpinner.warn(`已修复 worktree task-${wt.id} .env.local`);
    } else {
      wtSpinner.fail(`修复 worktree task-${wt.id} .env.local 失败`);
    }
  }

  // 6. 修复 git worktree 连接
  const gitSpinner = ora({
    text: '修复 git worktree 连接...',
    stream: process.stderr
  }).start();

  const gitResult = await repairGitWorktree(paths.mainDir);
  results.push(gitResult);

  if (gitResult.success) {
    gitSpinner.succeed('Git worktree 连接已修复');
  } else {
    gitSpinner.fail('Git worktree 修复失败');
  }

  // 7. 检测并修复孤儿 worktree 目录
  const orphanSpinner = ora({
    text: '检测并修复孤儿 worktree 目录...',
    stream: process.stderr
  }).start();

  const orphanResult = await detectAndRepairOrphans(paths.mainDir, paths.worktreesDir);

  const totalOrphans = orphanResult.repairedOrphans.length +
                       orphanResult.trueOrphans.length +
                       orphanResult.repairFailed.length;

  if (totalOrphans === 0) {
    orphanSpinner.succeed('未发现孤儿 worktree 目录');
  } else if (orphanResult.repairedOrphans.length > 0) {
    orphanSpinner.succeed(`已修复 ${orphanResult.repairedOrphans.length} 个路径失效的 worktree`);
  } else {
    orphanSpinner.warn(`发现 ${totalOrphans} 个孤儿 worktree 目录`);
  }

  // 8. 显示修复摘要
  displayRepairSummary(results, orphanResult);
}
