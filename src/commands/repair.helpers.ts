import * as fs from 'fs/promises';
import * as path from 'path';
import ora from 'ora';
import simpleGit from 'simple-git';
import { getProjectPaths, validateProjectInitialized } from '../core/paths.js';
import { getMainPort, discoverWorktrees, getMainBranch } from '../core/discovery.js';
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
import {
  isTmuxAvailable,
  isInTmux,
  getCurrentSession,
  sessionExists,
  createSession,
  windowExists,
  setupWindow,
  getWindowName,
  getWindowCurrentName,
  renameWindow
} from '../core/tmux.js';
import { loadTmuxConfig, resolvePaneCommands, type TmuxConfig } from '../core/tmux-config.js';

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
 * tmux 修复结果
 */
interface TmuxRepairResult {
  /** 是否可用 */
  available: boolean;
  /** session 名称 */
  sessionName?: string;
  /** 是否在 tmux 中 */
  inTmux: boolean;
  /** 是否创建了 session */
  createdSession: boolean;
  /** 创建的 window 列表 */
  createdWindows: Array<{ id: number; name: string }>;
  /** 已存在的 window 列表（跳过） */
  existingWindows: Array<{ id: number; name: string }>;
  /** 重命名的 window 列表 */
  renamedWindows: Array<{ id: number; oldName: string; newName: string }>;
  /** 修复失败的 */
  failedWindows: Array<{ id: number; error: string }>;
}

/**
 * 修复 tmux windows
 * - 如果 session 不存在，创建 session
 * - 如果 window 不存在，创建并设置三分布局
 * - 如果 window 已存在，不修改已有布局
 */
async function repairTmuxWindows(
  projectName: string,
  projectRoot: string,
  mainDir: string,
  mainBranch: string,
  worktrees: Array<{ id: number; branch: string; path: string }>
): Promise<TmuxRepairResult> {
  const result: TmuxRepairResult = {
    available: false,
    inTmux: false,
    createdSession: false,
    createdWindows: [],
    existingWindows: [],
    renamedWindows: [],
    failedWindows: []
  };

  // 检查 tmux 是否可用
  if (!isTmuxAvailable()) {
    return result;
  }
  result.available = true;

  // 确定 session 名称
  const inTmux = isInTmux();
  result.inTmux = inTmux;

  let sessionName: string;
  if (inTmux) {
    const currentSession = getCurrentSession();
    if (!currentSession) {
      return result;
    }
    sessionName = currentSession;
  } else {
    // 不在 tmux 中，检查项目 session 是否存在
    if (!sessionExists(projectName)) {
      // Session 不存在，创建它
      const created = createSession(projectName, mainDir);
      if (!created) {
        return result;
      }
      result.createdSession = true;
    }
    sessionName = projectName;
  }
  result.sessionName = sessionName;

  // 加载 tmux 配置
  const tmuxConfig = await loadTmuxConfig(projectRoot);

  // 修复 Window 0 (main)
  await repairSingleWindow(
    result,
    sessionName,
    0,
    mainBranch,
    mainDir,
    tmuxConfig,
    projectRoot
  );

  // 修复所有 worktree windows
  for (const wt of worktrees) {
    await repairSingleWindow(
      result,
      sessionName,
      wt.id,
      wt.branch,
      wt.path,
      tmuxConfig,
      projectRoot
    );
  }

  return result;
}

/**
 * 修复单个 tmux window
 */
async function repairSingleWindow(
  result: TmuxRepairResult,
  sessionName: string,
  windowIndex: number,
  branch: string,
  workingDir: string,
  tmuxConfig: TmuxConfig,
  _projectRoot: string
): Promise<void> {
  const expectedName = getWindowName(branch);

  // 检查 window 是否存在
  if (windowExists(sessionName, windowIndex)) {
    // Window 已存在，检查名称是否一致
    const currentName = getWindowCurrentName(sessionName, windowIndex);

    if (currentName && currentName !== expectedName) {
      // 名称不一致，需要重命名
      const renamed = renameWindow(sessionName, windowIndex, expectedName);
      if (renamed) {
        result.renamedWindows.push({
          id: windowIndex,
          oldName: currentName,
          newName: expectedName
        });
      } else {
        result.failedWindows.push({
          id: windowIndex,
          error: `重命名失败: ${currentName} → ${expectedName}`
        });
      }
    } else {
      // 名称一致，跳过
      result.existingWindows.push({ id: windowIndex, name: expectedName });
    }
    return;
  }

  // Window 不存在，创建并设置布局
  try {
    // 解析 pane 命令
    const paneCommands = await resolvePaneCommands(tmuxConfig, workingDir);
    const paneLayout = resolvePaneLayout(tmuxConfig);

    const success = setupWindow({
      sessionName,
      windowIndex,
      windowName: expectedName,
      workingDir,
      paneCommands,
      paneLayout,
      skipWindowCreation: windowIndex === 0 // Window 0 需要特殊处理
    });

    if (success) {
      result.createdWindows.push({ id: windowIndex, name: expectedName });
    } else {
      result.failedWindows.push({
        id: windowIndex,
        error: '创建 window 失败'
      });
    }
  } catch (error) {
    result.failedWindows.push({
      id: windowIndex,
      error: error instanceof Error ? error.message : String(error)
    });
  }
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
  orphanResult: OrphanDetectionResult,
  tmuxResult?: TmuxRepairResult
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

  // 显示 tmux 修复结果
  if (tmuxResult) {
    if (!tmuxResult.available) {
      output('  - tmux 未安装，跳过 window 修复');
    } else if (!tmuxResult.sessionName) {
      output('  - tmux session 创建失败');
    } else {
      if (tmuxResult.createdSession) {
        output(`  ✓ 创建了 tmux session: ${tmuxResult.sessionName}`);
      }
      if (tmuxResult.createdWindows.length > 0) {
        output(`  ✓ 创建了 ${tmuxResult.createdWindows.length} 个 tmux window`);
      }
      if (tmuxResult.renamedWindows.length > 0) {
        output(`  ✓ 重命名了 ${tmuxResult.renamedWindows.length} 个 tmux window`);
      }
      if (tmuxResult.existingWindows.length > 0) {
        output(`  ✓ ${tmuxResult.existingWindows.length} 个 tmux window 已存在（保持原布局）`);
      }
      if (tmuxResult.failedWindows.length > 0) {
        outputWarning(`  ⚠ ${tmuxResult.failedWindows.length} 个 tmux window 修复失败`);
      }
    }
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

  // 显示 tmux window 详细信息
  if (tmuxResult && tmuxResult.sessionName) {
    if (tmuxResult.createdWindows.length > 0) {
      outputLine();
      output('已创建的 tmux window：');
      for (const win of tmuxResult.createdWindows) {
        output(`  ✓ Window ${win.id}: ${win.name}`);
      }
    }

    if (tmuxResult.existingWindows.length > 0) {
      outputLine();
      output('已存在的 tmux window（保持原布局）：');
      for (const win of tmuxResult.existingWindows) {
        output(`  - Window ${win.id}: ${win.name}`);
      }
    }

    if (tmuxResult.renamedWindows.length > 0) {
      outputLine();
      output('已重命名的 tmux window：');
      for (const win of tmuxResult.renamedWindows) {
        output(`  ✓ Window ${win.id}: ${win.oldName} → ${win.newName}`);
      }
    }

    if (tmuxResult.failedWindows.length > 0) {
      outputLine();
      outputWarning('创建失败的 tmux window：');
      for (const win of tmuxResult.failedWindows) {
        output(`  ✗ Window ${win.id}: ${win.error}`);
      }
    }
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
  if (!(await checkIsRepo(paths.mainDir))) {
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

  // 8. 修复 tmux windows
  const tmuxSpinner = ora({
    text: '检查并修复 tmux windows...',
    stream: process.stderr
  }).start();

  let mainBranch = 'main';
  try {
    mainBranch = await getMainBranch(paths.mainDir);
  } catch {
    // 使用默认值
  }

  const tmuxResult = await repairTmuxWindows(
    paths.mainDirName,
    paths.rootDir,
    paths.mainDir,
    mainBranch,
    worktrees.map(wt => ({ id: wt.id, branch: wt.branch, path: wt.path }))
  );

  if (!tmuxResult.available) {
    tmuxSpinner.info('tmux 未安装，跳过 window 修复');
  } else if (!tmuxResult.sessionName) {
    tmuxSpinner.fail('tmux session 创建失败');
  } else if (tmuxResult.createdSession) {
    if (tmuxResult.createdWindows.length > 0) {
      tmuxSpinner.succeed(`创建了 session "${tmuxResult.sessionName}" 和 ${tmuxResult.createdWindows.length} 个 window`);
    } else {
      tmuxSpinner.succeed(`创建了 session "${tmuxResult.sessionName}"`);
    }
  } else if (tmuxResult.createdWindows.length > 0) {
    tmuxSpinner.succeed(`创建了 ${tmuxResult.createdWindows.length} 个 tmux window`);
  } else if (tmuxResult.failedWindows.length > 0) {
    tmuxSpinner.warn(`${tmuxResult.failedWindows.length} 个 tmux window 创建失败`);
  } else {
    tmuxSpinner.succeed('所有 tmux window 已存在');
  }

  // 9. 显示修复摘要
  displayRepairSummary(results, orphanResult, tmuxResult);
}
