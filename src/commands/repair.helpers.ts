import * as fs from 'fs/promises';
import * as path from 'path';
import ora from 'ora';
import simpleGit from 'simple-git';
import {
  buildProjectPaths,
  findProjectRootLoose,
  type ProjectPaths
} from '../core/paths.js';
import { discoverWorktrees } from '../core/discovery.js';
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
import { pluginManager } from '../plugins/index.js';
import {
  resolveToolchains,
  saveRepairSettingsResult,
  type ToolchainContext
} from '../core/toolchain-resolver.js';
import {
  buildRuntimeTargets,
  computeIdentityUpdates,
  readBasePort,
  readRuntimeTarget,
  writeRuntimeTarget,
  type RuntimeTarget
} from '../core/runtime-config-repair.js';
import { syncWorktreeRuntimeConfigs } from '../core/runtime-config-sync.js';
import { syncUntrackedFiles } from '../core/untracked-file-sync.js';
import { getTodoConfig } from '../core/config.js';
import { getProvider } from '../todo-backends/registry.js';

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
  /** 跳过检查的说明（如 worktree 目录已丢失） */
  skippedNote?: string;
}

/**
 * repair 选项
 *
 * init 命令的补全模式会复用 repairProject，并跳过自己已经完成的步骤。
 */
export interface RepairOptions {
  /** 跳过工具链 .gitignore 与 repairSettings 处理（调用方已完成） */
  skipToolchainSetup?: boolean;
  /** 跳过 todo backend setup（调用方已完成） */
  skipTodoSetup?: boolean;
  /** 非交互模式 */
  nonInteractive?: boolean;
  /** 复用调用方已解析的工具链上下文，避免重复解析 */
  contexts?: ToolchainContext[];
}

/**
 * 将身份键变更转换为展示文案
 */
function describeChanges(
  changes: Array<{ key: string; from?: string; to: string }>
): string[] {
  return changes.map((change) =>
    change.from === undefined
      ? t('commands.repair.addKey', { key: change.key, value: change.to })
      : t('commands.repair.updateKey', { key: change.key, old: change.from, new: change.to })
  );
}

/**
 * 生成运行时配置检查项的展示名称（Mono Repo 时带上子项目路径）
 */
function runtimeItemLabel(target: RuntimeTarget, prefix: string): string {
  return target.subPath === '.' ? prefix : `${prefix} [${target.subPath}]`;
}

/**
 * 补全项目目录结构
 *
 * 主分支目录丢失无法自动修复（内含 git 仓库），直接报错；
 * worktrees 目录缺失则创建。
 */
async function repairProjectStructure(paths: ProjectPaths): Promise<RepairResult> {
  const result: RepairResult = {
    item: t('commands.repair.itemStructure'),
    success: true,
    fixed: false,
    details: []
  };

  // 主分支目录必须存在
  try {
    const stats = await fs.stat(paths.mainDir);
    if (!stats.isDirectory()) {
      throw new Error('not a directory');
    }
  } catch {
    throw new ColynError(
      t('commands.repair.mainDirMissing', { name: paths.mainDirName }),
      t('commands.repair.mainDirMissingHint', { path: paths.mainDir })
    );
  }

  // worktrees 目录缺失时创建
  try {
    await fs.access(paths.worktreesDir);
  } catch {
    await fs.mkdir(paths.worktreesDir, { recursive: true });
    result.fixed = true;
    result.details!.push(t('commands.repair.createdWorktreesDir'));
  }

  return result;
}

/**
 * 检查并修复主分支运行时配置
 *
 * 端口保持用户已有配置（仅在缺失时补默认值），WORKTREE 固定为 main。
 */
async function checkMainRuntimeConfig(target: RuntimeTarget): Promise<RepairResult> {
  const result: RepairResult = {
    item: runtimeItemLabel(target, t('commands.repair.itemMainRuntime')),
    success: true,
    fixed: false,
    details: []
  };

  try {
    const existing = await readRuntimeTarget(target);
    const config = existing ?? {};

    // 端口已配置时保持原值，避免覆盖用户设置
    const hasPort = config[target.portKey] !== undefined;
    const { updates, changes } = computeIdentityUpdates(config, {
      portKey: target.portKey,
      expectedPort: hasPort ? null : target.defaultPort,
      expectedWorktree: 'main'
    });

    if (Object.keys(updates).length > 0) {
      await writeRuntimeTarget(target, config, updates);
      result.fixed = true;
      if (existing === null) {
        result.details!.push(t('commands.repair.createdRuntimeConfig'));
      }
      result.details!.push(...describeChanges(changes));
    }
  } catch (error) {
    result.success = false;
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

/**
 * 检查并修复单个 worktree 的运行时配置
 *
 * 端口基准取自主分支对应子项目的实际配置：worktree 端口 = 主分支端口 + worktree ID。
 */
async function checkWorktreeRuntimeConfig(
  target: RuntimeTarget,
  mainTarget: RuntimeTarget | undefined,
  worktreeId: number
): Promise<RepairResult> {
  const result: RepairResult = {
    item: runtimeItemLabel(
      target,
      t('commands.repair.itemWorktreeRuntime', { id: worktreeId })
    ),
    success: true,
    fixed: false,
    details: []
  };

  try {
    const basePort = mainTarget ? await readBasePort(mainTarget) : null;
    const existing = await readRuntimeTarget(target);
    const config = existing ?? {};

    const { updates, changes } = computeIdentityUpdates(config, {
      portKey: target.portKey,
      expectedPort: (basePort ?? target.defaultPort) + worktreeId,
      expectedWorktree: worktreeId.toString()
    });

    if (Object.keys(updates).length > 0) {
      await writeRuntimeTarget(target, config, updates);
      result.fixed = true;
      if (existing === null) {
        result.details!.push(t('commands.repair.createdRuntimeConfig'));
      }
      result.details!.push(...describeChanges(changes));
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
    // git worktree repair 仅在实际修正了路径时才有输出
    const gitOutput = await git.raw(['worktree', 'repair']);
    if (gitOutput.trim()) {
      result.fixed = true;
      result.details!.push(t('commands.repair.gitRepairDetail'));
    }
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
    if (result.skippedNote) {
      output(`  ${result.item}:`);
      outputWarning(`    ${result.skippedNote}`);
    } else if (result.success && !result.fixed) {
      output(`  ${result.item}:`);
      output(`    ${t('commands.repair.configCorrect')}`);
    } else if (result.success && result.fixed) {
      output(`  ${result.item}:`);
      for (const detail of result.details || []) {
        output(`    ✓ ${detail}`);
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
 * 汇总一组检查结果的 spinner 状态
 */
function reportResults(
  spinner: ReturnType<typeof ora>,
  results: RepairResult[],
  messages: { correct: string; fixed: string; failed: string }
): void {
  if (results.some(r => !r.success)) {
    spinner.fail(messages.failed);
  } else if (results.some(r => r.fixed)) {
    spinner.warn(messages.fixed);
  } else {
    spinner.succeed(messages.correct);
  }
}

/**
 * 修复项目配置
 */
export async function repairProject(options: RepairOptions = {}): Promise<void> {
  const results: RepairResult[] = [];

  // 1. 定位项目根目录（宽松查找，允许目录结构残缺）并补全结构
  const rootDir = await findProjectRootLoose();
  const paths = buildProjectPaths(rootDir);

  const structureSpinner = ora({
    text: t('commands.repair.checkingStructure'),
    stream: process.stderr
  }).start();

  const structureResult = await repairProjectStructure(paths);
  results.push(structureResult);
  reportResults(structureSpinner, [structureResult], {
    correct: t('commands.repair.structureCorrect'),
    fixed: t('commands.repair.structureFixed'),
    failed: t('commands.repair.structureFailed')
  });

  // 2. 检查是否是 git 仓库
  if (!(await checkIsRepo(paths.mainDir))) {
    throw new ColynError(
      t('commands.repair.notGitRepo'),
      t('commands.repair.notGitRepoHint')
    );
  }

  // 3. 解析工具链上下文（决定运行时配置文件与端口 key）
  const contexts = options.contexts
    ?? await resolveToolchains(paths.rootDir, paths.mainDir, options.nonInteractive);

  // 4. 检查主分支运行时配置
  const mainSpinner = ora({
    text: t('commands.repair.checkingMainRuntime'),
    stream: process.stderr
  }).start();

  const mainTargets = await buildRuntimeTargets(contexts, paths.mainDir);
  const mainResults: RepairResult[] = [];
  for (const target of mainTargets) {
    const result = await checkMainRuntimeConfig(target);
    mainResults.push(result);
    results.push(result);
  }

  reportResults(mainSpinner, mainResults, {
    correct: t('commands.repair.mainRuntimeCorrect'),
    fixed: t('commands.repair.mainRuntimeFixed'),
    failed: t('commands.repair.mainRuntimeFailed')
  });

  // 5. 检查所有 worktree 的运行时配置
  const worktrees = await discoverWorktrees(paths.mainDir, paths.worktreesDir);

  for (const wt of worktrees) {
    // git 仍记录但目录已丢失：跳过配置修复，提示用户清理
    try {
      await fs.access(wt.path);
    } catch {
      results.push({
        item: t('commands.repair.itemWorktreeRuntime', { id: wt.id }),
        success: true,
        fixed: false,
        skippedNote: t('commands.repair.worktreeDirMissing', { path: wt.path })
      });
      outputWarning(t('commands.repair.worktreeDirMissing', { path: wt.path }));
      continue;
    }

    // 5.1 先同步：重建缺失的配置文件、补齐主分支新增的 key
    await syncWorktreeRuntimeConfigs(
      paths.rootDir,
      paths.mainDir,
      wt.path,
      wt.id,
      'main-to-worktree'
    );

    // 5.1.1 重建缺失的未跟踪文件清单内文件（主分支 → worktree）
    await syncUntrackedFiles({
      rootDir: paths.rootDir,
      mainDir: paths.mainDir,
      worktreePath: wt.path,
      direction: 'main-to-worktree',
    });

    // 5.2 再校正身份键（端口、WORKTREE）
    const wtSpinner = ora({
      text: t('commands.repair.checkingWorktreeRuntime', { id: wt.id }),
      stream: process.stderr
    }).start();

    const wtTargets = await buildRuntimeTargets(contexts, wt.path);
    const wtResults: RepairResult[] = [];
    for (const target of wtTargets) {
      const mainTarget = mainTargets.find(m => m.subPath === target.subPath);
      const result = await checkWorktreeRuntimeConfig(target, mainTarget, wt.id);
      wtResults.push(result);
      results.push(result);
    }

    reportResults(wtSpinner, wtResults, {
      correct: t('commands.repair.worktreeRuntimeCorrect', { id: wt.id }),
      fixed: t('commands.repair.worktreeRuntimeFixed', { id: wt.id }),
      failed: t('commands.repair.worktreeRuntimeFailed', { id: wt.id })
    });
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

  // 7. 工具链初始化（.gitignore 忽略规则 + 工具链配置修复）
  if (!options.skipToolchainSetup && contexts.length > 0) {
    const pluginSpinner = ora({
      text: t('commands.repair.initializingPlugins'),
      stream: process.stderr
    }).start();

    try {
      for (const ctx of contexts) {
        await pluginManager.ensureRuntimeConfigIgnored(ctx.absolutePath, [ctx.toolchainName]);
      }
      pluginSpinner.succeed(t('commands.repair.pluginsInitialized'));
    } catch {
      // 初始化失败不阻断 repair 流程
      pluginSpinner.warn(t('commands.repair.pluginsInitFailed'));
    }

    // 运行工具链配置修复（可能有交互提问，不使用 spinner）
    for (const ctx of contexts) {
      try {
        const newSettings = await pluginManager.runRepairSettings(
          ctx.absolutePath,
          ctx.toolchainName,
          ctx.toolchainSettings,
          options.nonInteractive
        );
        if (newSettings !== null) {
          await saveRepairSettingsResult(paths.rootDir, ctx.subPath, newSettings);
        }
      } catch {
        // 非致命，不阻断 repair 流程
      }
    }
  }

  // 8. 对当前激活的 todo backend 运行 setup（例如帮助安装 gh）
  if (!options.skipTodoSetup) {
    const todoCfg = await getTodoConfig(paths.configDir);
    try {
      const provider = getProvider(todoCfg.backend);
      if (provider) {
        await provider.setup({
          projectRoot: paths.rootDir,
          mainDirPath: paths.mainDir,
          nonInteractive: options.nonInteractive ?? false,
        });
      }
    } catch (err) {
      outputWarning(t('commands.todo.backend.setupFailed', {
        backend: todoCfg.backend,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  // 9. 检测并修复孤儿 worktree 目录
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

  // 10. 显示修复摘要
  displayRepairSummary(results, orphanResult);
}
