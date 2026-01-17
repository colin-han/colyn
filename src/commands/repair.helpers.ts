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
 * 查找孤儿 worktree 目录
 */
async function findOrphanWorktrees(
  worktreesDir: string,
  gitWorktrees: string[]
): Promise<string[]> {
  const orphans: string[] = [];

  try {
    const entries = await fs.readdir(worktreesDir);

    for (const entry of entries) {
      if (entry.startsWith('task-')) {
        const fullPath = path.join(worktreesDir, entry);
        const stats = await fs.stat(fullPath);

        if (stats.isDirectory()) {
          // 检查这个目录是否在 git worktree list 中
          const isInGit = gitWorktrees.some(wt => wt === fullPath);
          if (!isInGit) {
            orphans.push(entry);
          }
        }
      }
    }
  } catch {
    // 忽略错误
  }

  return orphans;
}

/**
 * 显示修复摘要
 */
function displayRepairSummary(
  results: RepairResult[],
  orphans: string[]
): void {
  outputLine();
  outputSuccess('修复完成！\n');

  // 统计
  const fixedCount = results.filter(r => r.fixed).length;
  const errorCount = results.filter(r => !r.success).length;

  outputBold('修复摘要：');

  // 显示修复的项
  if (fixedCount > 0) {
    output(`  ✓ 修复了 ${fixedCount} 个配置项`);
  } else {
    output('  ✓ 所有配置正确，无需修复');
  }

  // 显示错误
  if (errorCount > 0) {
    outputWarning(`  ⚠ ${errorCount} 个项修复失败（见下方详情）`);
  }

  // 显示孤儿目录
  if (orphans.length > 0) {
    outputWarning(`  ⚠ 发现 ${orphans.length} 个孤儿 worktree 目录`);
  } else {
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

  // 显示孤儿目录详情
  if (orphans.length > 0) {
    outputLine();
    outputWarning('孤儿 worktree 目录：');
    for (const orphan of orphans) {
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

  // 7. 检查孤儿 worktree 目录
  const orphanSpinner = ora({
    text: '检查孤儿 worktree 目录...',
    stream: process.stderr
  }).start();

  const gitWorktreePaths = worktrees.map(wt => wt.path);
  const orphans = await findOrphanWorktrees(paths.worktreesDir, gitWorktreePaths);

  if (orphans.length === 0) {
    orphanSpinner.succeed('未发现孤儿 worktree 目录');
  } else {
    orphanSpinner.warn(`发现 ${orphans.length} 个孤儿 worktree 目录`);
  }

  // 8. 显示修复摘要
  displayRepairSummary(results, orphans);
}
