import type { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import simpleGit from 'simple-git';
import Enquirer from 'enquirer';
const { prompt } = Enquirer;
import chalk from 'chalk';
import ora from 'ora';
import type { CommandResult } from '../types/index.js';
import { ColynError } from '../types/index.js';
import {
  formatError,
  output,
  outputLine,
  outputResult,
  outputSuccess,
  outputInfo,
  outputBold
} from '../utils/logger.js';
import {
  getProjectPaths,
  validateProjectInitialized,
  getLocationInfo
} from '../core/paths.js';
import {
  getMainBranch,
  discoverWorktrees
} from '../core/discovery.js';
import {
  findWorktreeTarget,
  checkGitWorkingDirectory
} from './merge.helpers.js';
import { t } from '../i18n/index.js';
import { isValidBranchName } from './add.helpers.js';
import {
  copyToClipboard,
  findTodo,
  formatTodoIdLabel,
  parseTodoId,
  readTodoFile,
  saveTodoFile,
  selectWithPreview,
} from './todo.helpers.js';
import { listSelectableLocalBranches } from './branch-selection.helpers.js';
import {
  isTmuxAvailable,
  isInTmux,
  getCurrentSession,
  renameWindow,
  getWindowName,
  setIterm2Title
} from '../core/tmux.js';
import { setWorktreeStatus } from '../core/worktree-status.js';

/**
 * 检查分支是否已合并到主分支
 */
async function isBranchMerged(
  worktreePath: string,
  branch: string,
  mainBranch: string
): Promise<boolean> {
  try {
    const git = simpleGit(worktreePath);
    // 精确判断 branch 是否为 mainBranch 的祖先提交
    // exit code 0 = 已合并；非 0 = 未合并或检查失败
    await git.raw([
      'merge-base',
      '--is-ancestor',
      `refs/heads/${branch}`,
      `refs/heads/${mainBranch}`
    ]);
    return true;
  } catch {
    // 如果检查失败，假设未合并
    return false;
  }
}

/**
 * 检查分支是否被其他 worktree 使用
 */
async function isBranchUsedByOtherWorktree(
  mainDir: string,
  worktreesDir: string,
  targetBranch: string,
  currentWorktreeId: number
): Promise<{ used: boolean; worktreeId?: number; worktreePath?: string }> {
  const worktrees = await discoverWorktrees(mainDir, worktreesDir);

  for (const wt of worktrees) {
    if (wt.id !== currentWorktreeId && wt.branch === targetBranch) {
      return {
        used: true,
        worktreeId: wt.id,
        worktreePath: wt.path
      };
    }
  }

  return { used: false };
}

/**
 * 处理分支：检查本地、远程或创建新分支
 */
async function processBranch(
  worktreePath: string,
  targetBranch: string,
  skipFetch = false
): Promise<{ action: 'switch' | 'track' | 'create'; remoteBranch?: string; fetched: boolean }> {
  const git = simpleGit(worktreePath);

  // 检查本地分支是否存在
  const localBranches = await git.branchLocal();
  if (localBranches.all.includes(targetBranch)) {
    return { action: 'switch', fetched: false };
  }

  // 如果跳过 fetch，直接创建新分支
  if (skipFetch) {
    return { action: 'create', fetched: false };
  }

  // 检查远程分支是否存在
  const fetchSpinner = ora({
    text: t('commands.checkout.fetchingRemote'),
    stream: process.stderr
  }).start();

  try {
    await git.fetch(['--all']);
    fetchSpinner.succeed(t('commands.checkout.fetchedRemote'));

    const remoteBranches = await git.branch(['-r']);
    const remoteRef = remoteBranches.all.find(
      b => b.endsWith(`/${targetBranch}`) || b === `origin/${targetBranch}`
    );

    if (remoteRef) {
      return { action: 'track', remoteBranch: remoteRef, fetched: true };
    }
  } catch {
    fetchSpinner.fail(t('commands.checkout.fetchFailed'));
    // fetch 失败时继续，可能没有远程
    return { action: 'create', fetched: false };
  }

  // 分支不存在，需要创建
  return { action: 'create', fetched: true };
}

/**
 * 归档日志文件
 */
async function archiveLogs(
  worktreePath: string,
  oldBranch: string
): Promise<{ archived: boolean; count: number }> {
  const logsDir = path.join(worktreePath, '.claude', 'logs');
  const archivedDir = path.join(logsDir, 'archived');

  try {
    // 检查 logs 目录是否存在
    await fs.access(logsDir);
  } catch {
    // logs 目录不存在，不需要归档
    return { archived: false, count: 0 };
  }

  // 读取 logs 目录内容
  const entries = await fs.readdir(logsDir, { withFileTypes: true });

  // 过滤掉 archived 目录
  const toArchive = entries.filter(e => e.name !== 'archived');

  if (toArchive.length === 0) {
    return { archived: false, count: 0 };
  }

  // 创建归档目标目录
  // 将分支名中的 / 替换为 -，避免创建嵌套目录
  const safeBranchName = oldBranch.replace(/\//g, '-');
  const targetDir = path.join(archivedDir, safeBranchName);

  await fs.mkdir(targetDir, { recursive: true });

  // 移动文件和目录
  let count = 0;
  for (const entry of toArchive) {
    const srcPath = path.join(logsDir, entry.name);
    let destPath = path.join(targetDir, entry.name);

    // 如果目标已存在，添加时间戳后缀
    try {
      await fs.access(destPath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const ext = path.extname(entry.name);
      const base = path.basename(entry.name, ext);
      destPath = path.join(targetDir, `${base}-${timestamp}${ext}`);
    } catch {
      // 目标不存在，使用原名
    }

    await fs.rename(srcPath, destPath);
    count++;
  }

  return { archived: true, count };
}
/**
 * 更新主分支
 * 在 fetch 后检查主分支是否落后于远程，如果是则更新
 */
async function updateMainBranch(
  mainDir: string,
  mainBranch: string,
  skipPull = false
): Promise<{ updated: boolean; message?: string }> {
  if (skipPull) {
    return { updated: false };
  }

  const git = simpleGit(mainDir);

  try {
    // 检查主分支工作目录状态
    const status = await git.status();
    if (!status.isClean()) {
      // 主分支有未提交的更改，不自动更新
      return { updated: false };
    }

    // 检查当前是否在主分支上
    const currentBranch = status.current;
    if (currentBranch !== mainBranch) {
      // 不在主分支上，不更新
      return { updated: false };
    }

    // 检查是否有上游分支
    try {
      await git.raw(['rev-parse', '--abbrev-ref', mainBranch + '@{upstream}']);
    } catch {
      // 没有上游分支，跳过 pull
      return { updated: false };
    }

    // 检查是否落后于远程
    const remoteBranch = `origin/${mainBranch}`;
    const result = await git.raw(['rev-list', '--count', `${mainBranch}..${remoteBranch}`]);
    const behindCount = parseInt(result.trim());

    if (behindCount === 0) {
      // 已是最新
      return { updated: false };
    }

    // 主分支落后于远程，执行更新
    await git.pull('origin', mainBranch);

    return {
      updated: true,
      message: t('commands.checkout.mainBranchUpdateMsg', { count: behindCount })
    };
  } catch {
    // 更新失败，不影响主流程
    return { updated: false };
  }
}

/**
 * 交互式创建分支名（type/name）
 */
async function promptCreateBranchName(): Promise<string> {
  const typeResponse = await prompt<{ type: string }>({
    type: 'select',
    name: 'type',
    message: t('commands.todo.add.selectType'),
    choices: ['feature', 'bugfix', 'refactor', 'document'],
    stdout: process.stderr,
  });

  const nameResponse = await prompt<{ name: string }>({
    type: 'input',
    name: 'name',
    message: t('commands.todo.add.inputName'),
    stdout: process.stderr,
  });

  const name = nameResponse.name.trim();
  if (!name) {
    throw new ColynError(t('commands.todo.add.emptyName'));
  }

  const branch = `${typeResponse.type}/${name}`;
  if (!isValidBranchName(branch)) {
    throw new ColynError(
      t('commands.add.invalidBranchName'),
      t('commands.add.invalidBranchNameHint')
    );
  }

  return branch;
}

/**
 * 在未提供 branch 参数时，交互式选择目标分支
 * 顺序：新建分支 -> pending todo -> 本地分支
 */
async function selectBranchForCheckout(
  configDir: string,
  worktreePath: string,
  mainBranch: string,
  currentBranch: string,
  mainDir: string,
  worktreesDir: string,
  currentWorktreeId: number,
): Promise<{ branch: string; selectedTodo?: { todoId: string; message: string } }> {
  type Choice =
    | { type: 'branch'; branch: string }
    | { type: 'create' }
    | { type: 'todo'; branch: string; todoId: string; message: string };
  const options = new Map<string, Choice>();
  const items: Array<{
    value: string;
    label: string;
    labelDisplay?: string;
    summary: string;
    preview?: string;
  }> = [];
  let seq = 0;

  const pushChoice = (
    choice: Choice,
    label: string,
    summary: string,
    preview?: string,
  ): void => {
    const value = `opt-${seq++}`;
    options.set(value, choice);
    items.push({ value, label, summary, preview });
  };

  // 1) 新建分支（默认项）
  pushChoice(
    { type: 'create' },
    t('commands.checkout.selectCreateBranchLabel'),
    t('commands.checkout.selectCreateBranchSummary'),
    t('commands.checkout.selectCreateBranchPreview'),
  );

  // 2) pending todo
  const todoFile = await readTodoFile(configDir);
  const pendingTodos = todoFile.todos.filter(item => item.status === 'pending');
  const maxTodoTypeW = pendingTodos.length > 0
    ? Math.max(...pendingTodos.map(item => item.type.length))
    : 0;
  const pendingBranchSet = new Set<string>();
  for (const todo of pendingTodos) {
    const branch = `${todo.type}/${todo.name}`;
    const todoLabel = formatTodoIdLabel(todo.type, todo.name, maxTodoTypeW);
    pendingBranchSet.add(branch);
    pushChoice(
      { type: 'todo', branch, todoId: branch, message: todo.message },
      todoLabel.plain,
      `${t('commands.checkout.selectTodoSummaryPrefix')}: ${todo.message.split('\n')[0]}`,
      todo.message,
    );
    items[items.length - 1]!.labelDisplay = todoLabel.display;
  }

  // 3) 未删除本地分支（去重：和 pending todo 同名时保留 todo 条目）
  const parsedLocalBranches = await listSelectableLocalBranches({
    gitDir: worktreePath,
    mainDir,
    worktreesDir,
    mainBranch,
    currentBranch,
    currentWorktreeId,
    worktreeBranchScope: 'others',
    excludeBranches: pendingBranchSet,
  });

  const maxLocalTypeW = parsedLocalBranches.length > 0
    ? Math.max(...parsedLocalBranches.map(item => item.type.length))
    : 0;

  for (const local of parsedLocalBranches) {
    const { branch } = local;
    const branchLabel = formatTodoIdLabel(local.type, local.name, maxLocalTypeW);
    pushChoice(
      { type: 'branch', branch },
      branchLabel.plain,
      t('commands.checkout.selectLocalBranchSummary'),
      t('commands.checkout.selectLocalBranchPreview', { branch }),
    );
    items[items.length - 1]!.labelDisplay = branchLabel.display;
  }

  const selectedValue = await selectWithPreview(items, {
    selectMessage: t('commands.checkout.selectBranchPrompt'),
    previewLineCount: 4,
    initial: 0,
  });

  const selectedChoice = options.get(selectedValue);
  if (!selectedChoice) {
    throw new ColynError(t('commands.checkout.argError'));
  }

  if (selectedChoice.type === 'create') {
    return { branch: await promptCreateBranchName() };
  }

  if (selectedChoice.type === 'todo') {
    return {
      branch: selectedChoice.branch,
      selectedTodo: {
        todoId: selectedChoice.todoId,
        message: selectedChoice.message,
      },
    };
  }

  return { branch: selectedChoice.branch };
}
/**
 * Checkout 命令选项
 */
export interface CheckoutOptions {
  fetch?: boolean;
}

/**
 * Checkout 命令：在 worktree 中切换分支
 */
export async function checkoutCommand(
  target: string | undefined,
  branch: string | undefined,
  options: CheckoutOptions = {}
): Promise<void> {
  const skipFetch = options.fetch === false;
  try {
    // 步骤1: 获取项目路径并验证
    const paths = await getProjectPaths();
    await validateProjectInitialized(paths);

    // 步骤2: 确定目标 worktree
    let worktree;

    if (target === undefined) {
      // 没有指定 target，尝试使用当前目录
      try {
        const location = await getLocationInfo();
        if (location.isMainBranch) {
          throw new ColynError(
            t('commands.checkout.inMainBranch'),
            t('commands.checkout.inMainBranchHint')
          );
        }
        // 使用当前 worktree
        worktree = await findWorktreeTarget(
          String(location.worktreeId),
          paths.mainDir,
          paths.worktreesDir
        );
      } catch (error) {
        if (error instanceof ColynError) {
          throw error;
        }
        throw new ColynError(
          t('commands.checkout.cannotDetermineWorktree'),
          t('commands.checkout.cannotDetermineWorktreeHint')
        );
      }
    } else {
      // 指定了 target，查找 worktree
      worktree = await findWorktreeTarget(
        target,
        paths.mainDir,
        paths.worktreesDir
      );
    }

    const mainBranch = await getMainBranch(paths.mainDir);
    let selectedTodoMeta: { todoId: string; message: string } | undefined;

    if (!branch) {
      const selected = await selectBranchForCheckout(
        paths.configDir,
        worktree.path,
        mainBranch,
        worktree.branch,
        paths.mainDir,
        paths.worktreesDir,
        worktree.id,
      );
      branch = selected.branch;
      selectedTodoMeta = selected.selectedTodo;
    }

    const currentBranch = worktree.branch;

    // 如果已经在目标分支上
    if (currentBranch === branch) {
      output(chalk.yellow(t('commands.checkout.alreadyOnBranch', { branch })));
      outputResult({
        success: true,
        targetDir: worktree.path,
        displayPath: `worktrees/task-${worktree.id}`
      });
      return;
    }

    // 步骤3: 检查未提交更改
    const checkSpinner = ora({ text: t('commands.checkout.checkingStatus'), stream: process.stderr }).start();

    try {
      await checkGitWorkingDirectory(worktree.path, `task-${worktree.id}`);
      checkSpinner.succeed(t('commands.checkout.dirClean'));
    } catch (error) {
      checkSpinner.fail(t('commands.checkout.dirHasChanges'));
      throw error;
    }

    // 步骤4: 检查目标是否为主分支
    if (branch === mainBranch || branch === 'main' || branch === 'master') {
      throw new ColynError(
        t('commands.checkout.cannotSwitchToMain'),
        t('commands.checkout.cannotSwitchToMainHint', { path: paths.mainDir })
      );
    }

    // 步骤5: 检查分支是否被其他 worktree 使用
    const branchUsage = await isBranchUsedByOtherWorktree(
      paths.mainDir,
      paths.worktreesDir,
      branch,
      worktree.id
    );

    if (branchUsage.used) {
      throw new ColynError(
        t('commands.checkout.branchUsedByOther', { branch, id: branchUsage.worktreeId ?? 0 }),
        t('commands.checkout.branchUsedByOtherHint', { path: branchUsage.worktreePath ?? '' })
      );
    }

    // 步骤6: 检查当前分支是否已合并到主分支
    const merged = await isBranchMerged(worktree.path, currentBranch, mainBranch);

    if (!merged) {
      outputLine();
      output(chalk.yellow(t('commands.checkout.branchNotMerged', { branch: currentBranch })));
      outputLine();
      output(t('commands.checkout.branchNotMergedInfo'));
      outputLine();

      const response = await prompt<{ confirm: boolean }>({
        type: 'confirm',
        name: 'confirm',
        message: t('commands.checkout.confirmSwitch'),
        initial: false,
        stdout: process.stderr
      });

      if (!response.confirm) {
        output(chalk.gray(t('commands.checkout.switchCanceled')));
        outputResult({ success: false });
        process.exit(4);
      }
    }

    // 步骤7: 处理分支
    const branchInfo = await processBranch(worktree.path, branch, skipFetch);
    const git = simpleGit(worktree.path);

    // 步骤7.5: 如果执行了 fetch，尝试更新主分支
    if (branchInfo.fetched) {
      const updateResult = await updateMainBranch(paths.mainDir, mainBranch, skipFetch);
      if (updateResult.updated && updateResult.message) {
        outputLine();
        output(chalk.green(t('commands.checkout.mainBranchUpdated', { message: updateResult.message })));
      }
    }

    // 步骤8: 归档日志
    const archiveResult = await archiveLogs(worktree.path, currentBranch);

    // 步骤9: 执行切换
    const switchSpinner = ora({ text: t('commands.checkout.switchingTo', { branch }), stream: process.stderr }).start();

    try {
      if (branchInfo.action === 'switch') {
        await git.checkout(branch);
        switchSpinner.succeed(t('commands.checkout.switchedTo', { branch }));
      } else if (branchInfo.action === 'track') {
        await git.checkout(['-b', branch, '--track', branchInfo.remoteBranch!]);
        switchSpinner.succeed(t('commands.checkout.switchedToTrack', { branch, remote: branchInfo.remoteBranch ?? '' }));
      } else {
        // 基于最新的主分支创建新分支：fetch 成功时用 origin/{mainBranch}，否则用本地 mainBranch
        const base = branchInfo.fetched ? `origin/${mainBranch}` : mainBranch;
        await git.checkout(['-b', branch, base]);
        switchSpinner.succeed(t('commands.checkout.switchedToNew', { branch }));
      }
    } catch (error) {
      switchSpinner.fail(t('commands.checkout.switchFailed'));
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new ColynError(t('commands.checkout.gitCheckoutFailed'), errorMessage);
    }

    // 更新 worktree 状态为 idle
    try {
      await setWorktreeStatus(paths.configDir, `task-${worktree.id}`, paths.rootDir, 'idle');
    } catch { /* 状态更新失败不影响主流程 */ }

    // 步骤9.5: 更新 tmux window 名称（如果在 tmux 中）
    if (isTmuxAvailable() && isInTmux()) {
      const currentSession = getCurrentSession();
      if (currentSession) {
        const newWindowName = getWindowName(branch);
        renameWindow(currentSession, worktree.id, newWindowName);
        output(chalk.gray(t('commands.checkout.tmuxWindowRenamed', { windowName: newWindowName })));
      }
    }

    // 步骤9.6: 更新 iTerm2 tab title（无论是否在 tmux 中）
    const currentSession = getCurrentSession();
    setIterm2Title(
      currentSession || '', // 非 tmux 环境不使用此参数
      worktree.id,
      paths.mainDirName,
      branch
    );

    // 步骤10: 如果旧分支已合并，提示删除
    let oldBranchDeleted = false;
    if (merged) {
      outputLine();
      output(chalk.green(t('commands.checkout.branchMerged', { branch: currentBranch })));

      const deleteResponse = await prompt<{ deleteOldBranch: boolean }>({
        type: 'confirm',
        name: 'deleteOldBranch',
        message: t('commands.checkout.deleteOldBranch', { branch: currentBranch }),
        initial: true,
        stdout: process.stderr
      });

      if (deleteResponse.deleteOldBranch) {
        const deleteSpinner = ora({ text: t('commands.checkout.deletingBranch', { branch: currentBranch }), stream: process.stderr }).start();
        try {
          // 已通过 merged 检查确认可删，这里用 -D 避免 -d 受当前 HEAD 影响误判
          await git.branch(['-D', currentBranch]);
          deleteSpinner.succeed(t('commands.checkout.branchDeleted', { branch: currentBranch }));
          oldBranchDeleted = true;
        } catch (error) {
          deleteSpinner.fail(t('commands.checkout.branchDeleteFailed'));
          const errorMessage = error instanceof Error ? error.message : String(error);
          output(chalk.yellow(t('commands.checkout.branchDeleteHint', { error: errorMessage })));
          output(chalk.gray(t('commands.checkout.branchDeleteManual', { branch: currentBranch })));
        }
      }
    }

    // 步骤11: 显示结果
    outputLine();
    outputSuccess(t('commands.checkout.successTitle', { branch }));

    if (archiveResult.archived) {
      const safeBranchName = currentBranch.replace(/\//g, '-');
      output(chalk.gray(t('commands.checkout.logsArchived', { branch: safeBranchName, count: archiveResult.count })));
    }

    if (oldBranchDeleted) {
      output(chalk.gray(t('commands.checkout.oldBranchDeleted', { branch: currentBranch })));
    }

    // 由 Todo 入口切换分支时：同步标记完成，并输出 message + 复制剪贴板
    if (selectedTodoMeta) {
      const { type, name } = parseTodoId(selectedTodoMeta.todoId);
      const todoFile = await readTodoFile(paths.configDir);
      const todoItem = findTodo(todoFile.todos, type, name);
      if (todoItem && todoItem.status === 'pending') {
        todoItem.status = 'completed';
        todoItem.startedAt = new Date().toISOString();
        todoItem.branch = branch;
        await saveTodoFile(paths.configDir, todoFile);
        outputSuccess(t('commands.todo.start.success', { todoId: selectedTodoMeta.todoId }));
      }

      outputLine();
      output(chalk.bold(t('commands.todo.start.messageTitle')));
      output(selectedTodoMeta.message);
      outputLine();

      const copied = copyToClipboard(selectedTodoMeta.message);
      if (copied) {
        outputInfo(t('commands.todo.start.clipboardCopied'));
      } else {
        outputInfo(t('commands.todo.start.clipboardFailed'));
      }
    }

    outputLine();
    outputBold(t('commands.checkout.currentStatus'));
    output(`  ${t('commands.checkout.statusWorktree', { id: worktree.id })}`);
    output(`  ${t('commands.checkout.statusBranch', { branch })}`);
    output(`  ${t('commands.checkout.statusPath', { path: worktree.path })}`);
    outputLine();

    // 步骤12: 输出 JSON 结果
    const result: CommandResult = {
      success: true,
      targetDir: worktree.path,
      displayPath: `worktrees/task-${worktree.id}`
    };

    outputResult(result);

  } catch (error) {
    formatError(error);
    outputResult({ success: false });
    process.exit(1);
  }
}

/**
 * 注册 checkout 命令
 */
export function register(program: Command): void {
  // 主命令 - 使用 variadic 参数处理
  program
    .command('checkout [args...]')
    .usage('[branch] | <worktree-id> [branch]')
    .description(t('commands.checkout.description'))
    .option('--no-fetch', t('commands.checkout.noFetchOption'))
    .action(async (args: string[], options: CheckoutOptions) => {
      let target: string | undefined;
      let branch: string | undefined;

      if (args.length === 0) {
        branch = undefined;
      } else if (args.length === 1) {
        // 只有分支名
        branch = args[0];
      } else if (args.length === 2) {
        // worktree-id 和分支名
        target = args[0];
        branch = args[1];
      } else {
        throw new ColynError(
          t('commands.checkout.argError'),
          t('commands.checkout.argErrorHint')
        );
      }

      await checkoutCommand(target, branch, options);
    });

  // 别名 co
  program
    .command('co [args...]')
    .usage('[branch] | <worktree-id> [branch]')
    .description(t('commands.checkout.coDescription'))
    .option('--no-fetch', t('commands.checkout.noFetchOption'))
    .action(async (args: string[], options: CheckoutOptions) => {
      let target: string | undefined;
      let branch: string | undefined;

      if (args.length === 0) {
        branch = undefined;
      } else if (args.length === 1) {
        branch = args[0];
      } else if (args.length === 2) {
        target = args[0];
        branch = args[1];
      } else {
        throw new ColynError(
          t('commands.checkout.argError'),
          t('commands.checkout.argErrorHint')
        );
      }

      await checkoutCommand(target, branch, options);
    });
}
