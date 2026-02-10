import * as path from 'path';
import type { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
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
  type GitStatus,
  type GitDiff
} from './list.helpers.js';
import { isInTmux, isTmuxAvailable } from '../core/tmux.js';

/**
 * List 命令选项
 */
export interface ListOptions {
  json?: boolean;
  paths?: boolean;
  main?: boolean;  // --no-main 会设置为 false
  refresh?: boolean | string; // -r 或 -r [interval]
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
 */
type DisplayMode = 'full' | 'no-port' | 'no-path' | 'simple-status' | 'no-status' | 'minimal';

/**
 * 计算列的最大宽度
 */
function getColumnWidths(items: ListItem[]): {
  id: number;
  branch: number;
  port: number;
  status: number;
  statusSimple: number;
  diff: number;
  path: number;
} {
  let maxId = 6; // "0-main" 或 "→ 1"
  let maxBranch = 6; // "Branch"
  let maxPort = 5; // "Port" + 1
  let maxStatus = 6; // "Status"
  const maxStatusSimple = 1; // "●"
  let maxDiff = 4; // "Diff"
  let maxPath = 4; // "Path"

  for (const item of items) {
    // 主分支显示 "0-main"，worktree 显示数字 ID
    const idStr = item.isMain ? '0-main' : String(item.id);
    const idDisplay = item.isCurrent ? `→ ${idStr}` : `  ${idStr}`;
    maxId = Math.max(maxId, idDisplay.length);
    maxBranch = Math.max(maxBranch, item.branch.length);
    maxPort = Math.max(maxPort, String(item.port).length);
    maxStatus = Math.max(maxStatus, formatStatus(item.status).length);
    maxDiff = Math.max(maxDiff, formatDiff(item.diff, item.isMain).length);
    maxPath = Math.max(maxPath, item.path.length);
  }

  return {
    id: maxId,
    branch: maxBranch,
    port: maxPort,
    status: maxStatus,
    statusSimple: maxStatusSimple,
    diff: maxDiff,
    path: maxPath
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
      totalWidth += widths.status + borderOverhead;
      totalWidth += widths.diff + borderOverhead;
      totalWidth += widths.path + borderOverhead;
      break;
    case 'no-port':
      totalWidth += widths.status + borderOverhead;
      totalWidth += widths.diff + borderOverhead;
      totalWidth += widths.path + borderOverhead;
      break;
    case 'no-path':
      totalWidth += widths.status + borderOverhead;
      totalWidth += widths.diff + borderOverhead;
      break;
    case 'simple-status':
      totalWidth += widths.statusSimple + borderOverhead;
      totalWidth += widths.diff + borderOverhead;
      break;
    case 'no-status':
      totalWidth += widths.diff + borderOverhead;
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
  const modes: DisplayMode[] = ['full', 'no-port', 'no-path', 'simple-status', 'no-status', 'minimal'];

  for (const mode of modes) {
    if (calculateTableWidth(widths, mode) <= terminalWidth) {
      return mode;
    }
  }

  return 'minimal';
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
  if (mode === 'full') {
    headers.push(chalk.bold(t('commands.list.tablePort')), chalk.bold(t('commands.list.tableStatus')), chalk.bold(t('commands.list.tableDiff')), chalk.bold(t('commands.list.tablePath')));
  } else if (mode === 'no-port') {
    headers.push(chalk.bold(t('commands.list.tableStatus')), chalk.bold(t('commands.list.tableDiff')), chalk.bold(t('commands.list.tablePath')));
  } else if (mode === 'no-path') {
    headers.push(chalk.bold(t('commands.list.tableStatus')), chalk.bold(t('commands.list.tableDiff')));
  } else if (mode === 'simple-status') {
    headers.push(chalk.bold('S'), chalk.bold(t('commands.list.tableDiff')));
  } else if (mode === 'no-status') {
    headers.push(chalk.bold(t('commands.list.tableDiff')));
  }
  // minimal 模式只有 ID 和 Branch

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

    // 根据模式添加列
    if (mode === 'full') {
      const statusStr = formatStatus(item.status);
      const coloredStatus = statusStr ? chalk.yellow(statusStr) : '';
      const diffStr = formatDiff(item.diff, item.isMain);
      const coloredDiff = item.isMain ? chalk.dim(diffStr) :
        (diffStr === '✓' ? chalk.green(diffStr) : chalk.cyan(diffStr));
      row.push(String(item.port), coloredStatus, coloredDiff, item.path);
    } else if (mode === 'no-port') {
      const statusStr = formatStatus(item.status);
      const coloredStatus = statusStr ? chalk.yellow(statusStr) : '';
      const diffStr = formatDiff(item.diff, item.isMain);
      const coloredDiff = item.isMain ? chalk.dim(diffStr) :
        (diffStr === '✓' ? chalk.green(diffStr) : chalk.cyan(diffStr));
      row.push(coloredStatus, coloredDiff, item.path);
    } else if (mode === 'no-path') {
      const statusStr = formatStatus(item.status);
      const coloredStatus = statusStr ? chalk.yellow(statusStr) : '';
      const diffStr = formatDiff(item.diff, item.isMain);
      const coloredDiff = item.isMain ? chalk.dim(diffStr) :
        (diffStr === '✓' ? chalk.green(diffStr) : chalk.cyan(diffStr));
      row.push(coloredStatus, coloredDiff);
    } else if (mode === 'simple-status') {
      const statusStr = formatStatusSimple(item.status);
      const coloredStatus = statusStr ? chalk.yellow(statusStr) : '';
      const diffStr = formatDiff(item.diff, item.isMain);
      const coloredDiff = item.isMain ? chalk.dim(diffStr) :
        (diffStr === '✓' ? chalk.green(diffStr) : chalk.cyan(diffStr));
      row.push(coloredStatus, coloredDiff);
    } else if (mode === 'no-status') {
      const diffStr = formatDiff(item.diff, item.isMain);
      const coloredDiff = item.isMain ? chalk.dim(diffStr) :
        (diffStr === '✓' ? chalk.green(diffStr) : chalk.cyan(diffStr));
      row.push(coloredDiff);
    }
    // minimal 模式只有 ID 和 Branch

    // 应用行样式
    if (item.isCurrent) {
      // 当前行用青色高亮显示
      table.push(row.map((cell, index) => {
        // 保留状态和差异列的颜色（索引根据模式不同而变化）
        const statusIndex = mode === 'full' ? 3 : (mode === 'no-port' ? 2 : 2);
        const diffIndex = mode === 'full' ? 4 : (mode === 'no-port' ? 3 : 3);
        if (mode !== 'minimal' && mode !== 'no-status' && (index === statusIndex || index === diffIndex)) {
          return cell;
        }
        if (mode === 'no-status' && index === 2) {
          return cell; // diff 列
        }
        return chalk.cyan(cell);
      }));
    } else if (item.isMain) {
      // 主分支用灰色显示
      table.push(row.map((cell, index) => {
        const statusIndex = mode === 'full' ? 3 : (mode === 'no-port' ? 2 : 2);
        const diffIndex = mode === 'full' ? 4 : (mode === 'no-port' ? 3 : 3);
        if (mode !== 'minimal' && mode !== 'no-status' && (index === statusIndex || index === diffIndex)) {
          return cell;
        }
        if (mode === 'no-status' && index === 2) {
          return cell;
        }
        return chalk.dim(cell);
      }));
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
      output(chalk.cyan('💡 使用 Ctrl-b 0-9 切换到对应 Window'));
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
    items.push({
      id: null,
      branch: mainBranch,
      port: mainPort,
      path: path.relative(paths.rootDir, paths.mainDir) || '.',
      isMain: true,
      isCurrent: isCurrentDirectory(paths.mainDir),
      status: getGitStatus(paths.mainDir),
      diff: { ahead: 0, behind: 0 }  // 主分支没有差异
    });
  }

  // 添加任务 worktree
  for (const wt of projectInfo.worktrees) {
    items.push({
      id: wt.id,
      branch: wt.branch,
      port: wt.port,
      path: path.relative(paths.rootDir, wt.path),
      isMain: false,
      isCurrent: isCurrentDirectory(wt.path),
      status: getGitStatus(wt.path),
      diff: getGitDiff(wt.path, mainBranch)
    });
  }

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
      // 解析刷新间隔
      let interval = 2000; // 默认 2 秒
      if (typeof options.refresh === 'string') {
        const parsed = parseInt(options.refresh, 10);
        if (isNaN(parsed) || parsed < 1) {
          throw new ColynError(
            t('commands.list.invalidInterval'),
            t('commands.list.invalidIntervalHint')
          );
        }
        interval = parsed * 1000;
      }

      // 渲染函数：先获取数据，再清屏并立即显示（减少闪烁）
      const render = async () => {
        try {
          // 显示加载动画（在底部）
          const spinner = ora({
            text: t('commands.list.refreshingData'),
            stream: process.stderr,
            // 使用简单的 spinner 样式
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
          output(chalk.dim(t('commands.list.refreshing', { interval: interval / 1000 })));
        } catch (error) {
          // 刷新过程中出错，显示错误但不退出
          clearScreen();
          formatError(error);
          output('');
          output(chalk.dim(t('commands.list.refreshing', { interval: interval / 1000 })));
        }
      };

      // 首次渲染
      await render();

      // 设置定时刷新
      const timer = setInterval(render, interval);

      // 处理 Ctrl+C 优雅退出
      process.on('SIGINT', () => {
        clearInterval(timer);
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
      items.push({
        id: null,
        branch: mainBranch,
        port: mainPort,
        path: path.relative(paths.rootDir, paths.mainDir) || '.',
        isMain: true,
        isCurrent: isCurrentDirectory(paths.mainDir),
        status: getGitStatus(paths.mainDir),
        diff: { ahead: 0, behind: 0 }  // 主分支没有差异
      });
    }

    // 添加任务 worktree
    for (const wt of projectInfo.worktrees) {
      items.push({
        id: wt.id,
        branch: wt.branch,
        port: wt.port,
        path: path.relative(paths.rootDir, wt.path),
        isMain: false,
        isCurrent: isCurrentDirectory(wt.path),
        status: getGitStatus(wt.path),
        diff: getGitDiff(wt.path, mainBranch)
      });
    }

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
    .description(t('commands.list.description'))
    .option('--json', t('commands.list.jsonOption'))
    .option('-p, --paths', t('commands.list.pathsOption'))
    .option('--no-main', t('commands.list.noMainOption'))
    .option('-r, --refresh [interval]', t('commands.list.refreshOption'))
    .action(async (options) => {
      await listCommand(options);
    });
}
