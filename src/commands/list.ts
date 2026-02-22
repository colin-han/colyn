import * as path from 'path';
import type { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import chokidar from 'chokidar';
import { getProjectPaths, validateProjectInitialized } from '../core/paths.js';
import {
  discoverProjectInfo,
  getMainBranch,
  getMainPort
} from '../core/discovery.js';
import { ColynError } from '../types/index.js';
import { formatError, output } from '../utils/logger.js';
import { t } from '../i18n/index.js';
import {
  getGitStatus,
  getGitDiff,
  formatStatus,
  formatStatusSimple,
  formatDiff,
  formatWorktreeStatus,
  formatWorktreeStatusEmoji,
  type GitStatus,
  type GitDiff
} from './list.helpers.js';
import { getWorktreeStatus, type WorktreeStatus } from '../core/worktree-status.js';
import { isInTmux, isTmuxAvailable } from '../core/tmux.js';

/**
 * List 命令选项
 */
export interface ListOptions {
  json?: boolean;
  paths?: boolean;
  main?: boolean;  // --no-main 会设置为 false
  refresh?: boolean; // -r 开启 file watch 模式
}

/**
 * 列表项信息（用于输出）
 */
interface ListItem {
  id: number | null;
  branch: string;
  port: number;
  path: string;
  isMain: boolean;
  isCurrent: boolean;
  status: GitStatus;
  diff: GitDiff;
  worktreeStatus: WorktreeStatus;
}

/**
 * 检测当前工作目录是否在指定路径下
 */
function isCurrentDirectory(targetPath: string): boolean {
  const cwd = process.cwd();
  // 规范化路径后比较
  const normalizedCwd = path.resolve(cwd);
  const normalizedTarget = path.resolve(targetPath);
  return normalizedCwd === normalizedTarget || normalizedCwd.startsWith(normalizedTarget + path.sep);
}

/**
 * 显示模式
 * 列优先级（从高到低，即空间不足时从后向前移除/压缩）：
 * ID/Branch > WTStatus(emoji) > Diff > Git(simple) > Git(full) > Path > Port > WTStatus(full→emoji)
 */
type DisplayMode = 'full' | 'no-port' | 'no-path' | 'compress-wt' | 'simple-git' | 'no-git' | 'no-diff' | 'minimal';

/**
 * 计算列的最大宽度
 */
function getColumnWidths(items: ListItem[]): {
  id: number;
  branch: number;
  port: number;
  gitStatus: number;
  gitStatusSimple: number;
  diff: number;
  path: number;
  wtStatus: number;
  wtStatusEmoji: number;
} {
  let maxId = 6; // "0-main" 或 "→ 1"
  let maxBranch = 6; // "Branch"
  let maxPort = 5; // "Port" + 1
  let maxGitStatus = 3; // "Git"
  const maxGitStatusSimple = 1; // "●"
  let maxDiff = 4; // "Diff"
  let maxPath = 4; // "Path"
  let maxWtStatus = 6; // "Status"
  const maxWtStatusEmoji = 3; // "st."

  for (const item of items) {
    // 主分支显示 "0-main"，worktree 显示数字 ID
    const idStr = item.isMain ? '0-main' : String(item.id);
    const idDisplay = item.isCurrent ? `→ ${idStr}` : `  ${idStr}`;
    maxId = Math.max(maxId, idDisplay.length);
    maxBranch = Math.max(maxBranch, item.branch.length);
    maxPort = Math.max(maxPort, String(item.port).length);
    maxGitStatus = Math.max(maxGitStatus, formatStatus(item.status).length);
    maxDiff = Math.max(maxDiff, formatDiff(item.diff, item.isMain).length);
    maxPath = Math.max(maxPath, item.path.length);
    maxWtStatus = Math.max(maxWtStatus, formatWorktreeStatus(item.worktreeStatus).length);
  }

  return {
    id: maxId,
    branch: maxBranch,
    port: maxPort,
    gitStatus: maxGitStatus,
    gitStatusSimple: maxGitStatusSimple,
    diff: maxDiff,
    path: maxPath,
    wtStatus: maxWtStatus,
    wtStatusEmoji: maxWtStatusEmoji
  };
}

/**
 * 计算指定模式下的表格宽度
 * 表格边框和分隔符大约占用: 列数 * 3 + 1
 */
function calculateTableWidth(widths: ReturnType<typeof getColumnWidths>, mode: DisplayMode): number {
  const borderOverhead = 3; // 每列的边框开销 "│ " + " "
  let totalWidth = 1; // 左边框

  // ID 和 Branch 始终显示
  totalWidth += widths.id + borderOverhead;
  totalWidth += widths.branch + borderOverhead;

  switch (mode) {
    case 'full':
      totalWidth += widths.port + borderOverhead;
      totalWidth += widths.gitStatus + borderOverhead;
      totalWidth += widths.diff + borderOverhead;
      totalWidth += widths.path + borderOverhead;
      totalWidth += widths.wtStatus + borderOverhead;
      break;
    case 'no-port':
      totalWidth += widths.gitStatus + borderOverhead;
      totalWidth += widths.diff + borderOverhead;
      totalWidth += widths.path + borderOverhead;
      totalWidth += widths.wtStatus + borderOverhead;
      break;
    case 'no-path':
      totalWidth += widths.gitStatus + borderOverhead;
      totalWidth += widths.diff + borderOverhead;
      totalWidth += widths.wtStatus + borderOverhead;
      break;
    case 'compress-wt':
      totalWidth += widths.gitStatus + borderOverhead;
      totalWidth += widths.diff + borderOverhead;
      totalWidth += widths.wtStatusEmoji + borderOverhead;
      break;
    case 'simple-git':
      totalWidth += widths.gitStatusSimple + borderOverhead;
      totalWidth += widths.diff + borderOverhead;
      totalWidth += widths.wtStatusEmoji + borderOverhead;
      break;
    case 'no-git':
      totalWidth += widths.diff + borderOverhead;
      totalWidth += widths.wtStatusEmoji + borderOverhead;
      break;
    case 'no-diff':
      totalWidth += widths.wtStatusEmoji + borderOverhead;
      break;
    case 'minimal':
      // 只有 ID 和 Branch
      break;
  }

  return totalWidth;
}

/**
 * 选择最佳显示模式
 */
function selectDisplayMode(widths: ReturnType<typeof getColumnWidths>, terminalWidth: number): DisplayMode {
  const modes: DisplayMode[] = ['full', 'no-port', 'no-path', 'compress-wt', 'simple-git', 'no-git', 'no-diff', 'minimal'];

  for (const mode of modes) {
    if (calculateTableWidth(widths, mode) <= terminalWidth) {
      return mode;
    }
  }

  return 'minimal';
}

/**
 * 返回指定模式下有自身颜色（不被行色覆盖）的列索引集合
 */
function getColoredCellIndices(mode: DisplayMode): number[] {
  switch (mode) {
    case 'full':        return [3, 4, 6]; // git, diff, wtStatus
    case 'no-port':     return [2, 3, 5]; // git, diff, wtStatus
    case 'no-path':     return [2, 3, 4]; // git, diff, wtStatus
    case 'compress-wt': return [2, 3, 4]; // git, diff, wtEmoji
    case 'simple-git':  return [2, 3, 4]; // gitSimple, diff, wtEmoji
    case 'no-git':      return [2, 3];    // diff, wtEmoji
    case 'no-diff':     return [2];       // wtEmoji
    case 'minimal':     return [];
  }
}

/**
 * 根据 worktree 状态返回带颜色的字符串
 */
function coloredWtStatus(status: WorktreeStatus, isEmoji: boolean): string {
  const str = isEmoji ? formatWorktreeStatusEmoji(status) : formatWorktreeStatus(status);
  if (!str) return '';
  switch (status) {
    case 'running':         return chalk.cyan(str);
    case 'waiting-confirm': return chalk.yellow(str);
    case 'finish':          return chalk.green(str);
    default:                return str;
  }
}

/**
 * 输出表格格式
 */
function outputTable(items: ListItem[]): void {
  if (items.length === 0) {
    console.error(chalk.yellow(`\n${t('commands.list.noWorktrees')}\n`));
    console.error(chalk.dim(t('commands.list.noWorktreesHint')));
    return;
  }

  // 获取终端宽度
  const terminalWidth = process.stdout.columns || 80;

  // 计算列宽度
  const widths = getColumnWidths(items);

  // 选择显示模式
  const mode = selectDisplayMode(widths, terminalWidth);

  // 构建表头
  const headers: string[] = [chalk.bold(t('commands.list.tableId')), chalk.bold(t('commands.list.tableBranch'))];
  switch (mode) {
    case 'full':
      headers.push(
        chalk.bold(t('commands.list.tablePort')),
        chalk.bold(t('commands.list.tableGit')),
        chalk.bold(t('commands.list.tableDiff')),
        chalk.bold(t('commands.list.tablePath')),
        chalk.bold(t('commands.list.tableWtStatus'))
      );
      break;
    case 'no-port':
      headers.push(
        chalk.bold(t('commands.list.tableGit')),
        chalk.bold(t('commands.list.tableDiff')),
        chalk.bold(t('commands.list.tablePath')),
        chalk.bold(t('commands.list.tableWtStatus'))
      );
      break;
    case 'no-path':
      headers.push(
        chalk.bold(t('commands.list.tableGit')),
        chalk.bold(t('commands.list.tableDiff')),
        chalk.bold(t('commands.list.tableWtStatus'))
      );
      break;
    case 'compress-wt':
      headers.push(
        chalk.bold(t('commands.list.tableGit')),
        chalk.bold(t('commands.list.tableDiff')),
        chalk.bold(t('commands.list.tableWtStatusShort'))
      );
      break;
    case 'simple-git':
      headers.push(
        chalk.bold('S'),
        chalk.bold(t('commands.list.tableDiff')),
        chalk.bold(t('commands.list.tableWtStatusShort'))
      );
      break;
    case 'no-git':
      headers.push(
        chalk.bold(t('commands.list.tableDiff')),
        chalk.bold(t('commands.list.tableWtStatusShort'))
      );
      break;
    case 'no-diff':
      headers.push(chalk.bold(t('commands.list.tableWtStatusShort')));
      break;
    case 'minimal':
      // 只有 ID 和 Branch
      break;
  }

  const table = new Table({
    head: headers,
    style: {
      head: [],
      border: []
    }
  });

  for (const item of items) {
    // 主分支显示 "0-main"，worktree 显示数字 ID
    const idStr = item.isMain ? '0-main' : String(item.id);
    const idDisplay = item.isCurrent ? `→ ${idStr}` : `  ${idStr}`;

    // 构建行数据
    const row: string[] = [idDisplay, item.branch];

    // 构建各列数据的辅助值
    const gitStr = formatStatus(item.status);
    const coloredGit = gitStr ? chalk.yellow(gitStr) : '';
    const gitSimpleStr = formatStatusSimple(item.status);
    const coloredGitSimple = gitSimpleStr ? chalk.yellow(gitSimpleStr) : '';
    const diffStr = formatDiff(item.diff, item.isMain);
    const coloredDiff = item.isMain
      ? chalk.dim(diffStr)
      : (diffStr === '✓' ? chalk.green(diffStr) : chalk.cyan(diffStr));

    // 根据模式追加列
    switch (mode) {
      case 'full':
        row.push(String(item.port), coloredGit, coloredDiff, item.path, coloredWtStatus(item.worktreeStatus, false));
        break;
      case 'no-port':
        row.push(coloredGit, coloredDiff, item.path, coloredWtStatus(item.worktreeStatus, false));
        break;
      case 'no-path':
        row.push(coloredGit, coloredDiff, coloredWtStatus(item.worktreeStatus, false));
        break;
      case 'compress-wt':
        row.push(coloredGit, coloredDiff, coloredWtStatus(item.worktreeStatus, true));
        break;
      case 'simple-git':
        row.push(coloredGitSimple, coloredDiff, coloredWtStatus(item.worktreeStatus, true));
        break;
      case 'no-git':
        row.push(coloredDiff, coloredWtStatus(item.worktreeStatus, true));
        break;
      case 'no-diff':
        row.push(coloredWtStatus(item.worktreeStatus, true));
        break;
      case 'minimal':
        // 只有 ID 和 Branch
        break;
    }

    // 应用行样式（当前行青色，主分支灰色）
    const coloredIndices = new Set(getColoredCellIndices(mode));
    if (item.isCurrent) {
      table.push(row.map((cell, index) =>
        coloredIndices.has(index) ? cell : chalk.cyan(cell)
      ));
    } else if (item.isMain) {
      table.push(row.map((cell, index) =>
        coloredIndices.has(index) ? cell : chalk.dim(cell)
      ));
    } else {
      table.push(row);
    }
  }

  console.error(table.toString());

  // 如果在 tmux 中，显示切换提示
  if (isTmuxAvailable() && isInTmux()) {
    const hasWorktrees = items.some(item => !item.isMain);
    if (hasWorktrees) {
      output('');
      output(chalk.cyan(`💡 ${t('commands.list.tmuxSwitchHint')}`));
    }
  }

  // 如果只有主分支，给出提示
  const hasWorktrees = items.some(item => !item.isMain);
  if (!hasWorktrees) {
    console.error(chalk.dim(`\n${t('commands.list.noWorktreesHint')}`));
  }
}

/**
 * 输出 JSON 格式
 */
function outputJson(items: ListItem[]): void {
  console.log(JSON.stringify(items, null, 2));
}

/**
 * 输出路径格式
 */
function outputPaths(items: ListItem[]): void {
  for (const item of items) {
    console.log(item.path);
  }
}

/**
 * 清屏并将光标移到左上角
 */
function clearScreen(): void {
  // 使用 ANSI 转义码清屏
  process.stdout.write('\x1b[2J\x1b[0;0H');
}

/**
 * 获取列表数据（用于刷新模式）
 * 返回 ListItem 数组而不是直接输出
 */
async function fetchListData(options: ListOptions): Promise<ListItem[]> {
  // 获取项目路径并验证
  const paths = await getProjectPaths();
  await validateProjectInitialized(paths);

  // 获取项目信息
  const projectInfo = await discoverProjectInfo(paths.mainDir, paths.worktreesDir);

  // 获取主分支信息
  const mainBranch = await getMainBranch(paths.mainDir);
  const mainPort = await getMainPort(paths.mainDir);

  // 构建列表项
  const items: ListItem[] = [];

  // 添加主分支（如果不排除）
  if (options.main !== false) {
    const { status: mainWtStatus } = await getWorktreeStatus(paths.configDir, 'main');
    items.push({
      id: null,
      branch: mainBranch,
      port: mainPort,
      path: path.relative(paths.rootDir, paths.mainDir) || '.',
      isMain: true,
      isCurrent: isCurrentDirectory(paths.mainDir),
      status: getGitStatus(paths.mainDir),
      diff: { ahead: 0, behind: 0 },  // 主分支没有差异
      worktreeStatus: mainWtStatus
    });
  }

  // 添加任务 worktree（并行获取 worktree 状态）
  const wtItems = await Promise.all(projectInfo.worktrees.map(async (wt) => {
    const { status: wtStatus } = await getWorktreeStatus(paths.configDir, `task-${wt.id}`);
    return {
      id: wt.id,
      branch: wt.branch,
      port: wt.port,
      path: path.relative(paths.rootDir, wt.path),
      isMain: false,
      isCurrent: isCurrentDirectory(wt.path),
      status: getGitStatus(wt.path),
      diff: getGitDiff(wt.path, mainBranch),
      worktreeStatus: wtStatus
    };
  }));
  items.push(...wtItems);

  return items;
}

/**
 * List 命令：列出所有 worktree
 */
async function listCommand(options: ListOptions): Promise<void> {
  try {
    // 检查选项冲突
    if (options.json && options.paths) {
      throw new ColynError(
        t('commands.list.optionConflict'),
        t('commands.list.optionConflictHint')
      );
    }

    // 检查刷新模式与其他输出格式的冲突
    if (options.refresh && (options.json || options.paths)) {
      throw new ColynError(
        t('commands.list.refreshConflict'),
        t('commands.list.refreshConflictHint')
      );
    }

    // 刷新模式
    if (options.refresh) {
      // 获取项目路径
      const paths = await getProjectPaths();
      await validateProjectInitialized(paths);

      // 防抖：避免短时间内多次刷新
      let debounceTimer: NodeJS.Timeout | null = null;
      const DEBOUNCE_DELAY = 1000; // 1秒防抖延迟

      // 渲染函数：先获取数据，再清屏并立即显示（减少闪烁）
      const render = async () => {
        try {
          // 显示加载动画（在底部）
          const spinner = ora({
            text: t('commands.list.refreshingData'),
            stream: process.stderr,
            spinner: 'dots'
          }).start();

          // 1. 先获取数据（耗时操作）
          const items = await fetchListData(options);

          // 停止 spinner
          spinner.stop();

          // 2. 清屏
          clearScreen();

          // 3. 立即显示数据（无延迟）
          outputTable(items);
          output('');
          output(chalk.dim(t('commands.list.watchMode')));
        } catch (error) {
          // 刷新过程中出错，显示错误但不退出
          clearScreen();
          formatError(error);
          output('');
          output(chalk.dim(t('commands.list.watchMode')));
        }
      };

      // 带防抖的渲染函数
      const debouncedRender = () => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
          render();
          debounceTimer = null;
        }, DEBOUNCE_DELAY);
      };

      // 首次渲染
      await render();

      // 需要监听的路径
      const watchPaths: string[] = [];

      // 1. 主分支目录的 .git 目录
      watchPaths.push(path.join(paths.mainDir, '.git'));

      // 2. 所有 worktree 的 .git 文件（worktree 的 .git 是个文件，不是目录）
      const projectInfo = await discoverProjectInfo(paths.mainDir, paths.worktreesDir);
      for (const wt of projectInfo.worktrees) {
        watchPaths.push(path.join(wt.path, '.git'));
      }

      // 3. worktrees 目录本身（检测新增/删除 worktree）
      watchPaths.push(paths.worktreesDir);

      // 4. 监听所有 worktree 目录下的 .env.local 文件（端口变化）
      watchPaths.push(path.join(paths.mainDir, '.env.local'));
      for (const wt of projectInfo.worktrees) {
        watchPaths.push(path.join(wt.path, '.env.local'));
      }

      // 创建文件监听器
      const watcher = chokidar.watch(watchPaths, {
        persistent: true,
        ignoreInitial: true,
        // 忽略 .git 目录中的一些临时文件
        ignored: /(\.git\/index\.lock$|\.git\/.*\.tmp$)/,
        // 监听深度：.git 目录需要递归监听
        depth: 5,
        // 稳定延迟：文件修改后等待一段时间再触发（避免重复事件）
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50
        }
      });

      // 监听文件变化
      watcher.on('all', (_event, _changedPath) => {
        // 调试日志（可选）
        // console.error(`File ${_event}: ${_changedPath}`);
        debouncedRender();
      });

      // 监听器错误处理
      watcher.on('error', (err: unknown) => {
        output('');
        const errorMessage = err instanceof Error ? err.message : String(err);
        output(chalk.red(t('commands.list.watchError', { error: errorMessage })));
      });

      // 处理 Ctrl+C 优雅退出
      process.on('SIGINT', async () => {
        await watcher.close();
        output('');
        output(t('commands.list.refreshStopped'));
        process.exit(0);
      });

      // 保持进程运行
      return;
    }

    // 普通模式（不刷新）
    // 获取项目路径并验证
    const paths = await getProjectPaths();
    await validateProjectInitialized(paths);

    // 获取项目信息
    const projectInfo = await discoverProjectInfo(paths.mainDir, paths.worktreesDir);

    // 获取主分支信息
    const mainBranch = await getMainBranch(paths.mainDir);
    const mainPort = await getMainPort(paths.mainDir);

    // 构建列表项
    const items: ListItem[] = [];

    // 添加主分支（如果不排除）
    if (options.main !== false) {
      const { status: mainWtStatus } = await getWorktreeStatus(paths.configDir, 'main');
      items.push({
        id: null,
        branch: mainBranch,
        port: mainPort,
        path: path.relative(paths.rootDir, paths.mainDir) || '.',
        isMain: true,
        isCurrent: isCurrentDirectory(paths.mainDir),
        status: getGitStatus(paths.mainDir),
        diff: { ahead: 0, behind: 0 },  // 主分支没有差异
        worktreeStatus: mainWtStatus
      });
    }

    // 添加任务 worktree（并行获取 worktree 状态）
    const wtItems = await Promise.all(projectInfo.worktrees.map(async (wt) => {
      const { status: wtStatus } = await getWorktreeStatus(paths.configDir, `task-${wt.id}`);
      return {
        id: wt.id,
        branch: wt.branch,
        port: wt.port,
        path: path.relative(paths.rootDir, wt.path),
        isMain: false,
        isCurrent: isCurrentDirectory(wt.path),
        status: getGitStatus(wt.path),
        diff: getGitDiff(wt.path, mainBranch),
        worktreeStatus: wtStatus
      };
    }));
    items.push(...wtItems);

    // 根据选项输出
    if (options.json) {
      outputJson(items);
    } else if (options.paths) {
      outputPaths(items);
    } else {
      outputTable(items);
    }

  } catch (error) {
    formatError(error);
    process.exit(1);
  }
}

/**
 * 注册 list 命令
 */
export function register(program: Command): void {
  program
    .command('list')
    .alias('ls')
    .description(t('commands.list.description'))
    .option('--json', t('commands.list.jsonOption'))
    .option('-p, --paths', t('commands.list.pathsOption'))
    .option('--no-main', t('commands.list.noMainOption'))
    .option('-r, --refresh', t('commands.list.refreshOption'))
    .addHelpText('after', `\n${t('commands.list.gitColumnHelp')}`)
    .action(async (options) => {
      await listCommand(options);
    });
}
