import * as path from 'path';
import type { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { getProjectPaths, validateProjectInitialized } from '../core/paths.js';
import {
  discoverProjectInfo,
  getMainBranch,
  getMainPort
} from '../core/discovery.js';
import { ColynError } from '../types/index.js';
import { formatError } from '../utils/logger.js';

/**
 * List 命令选项
 */
export interface ListOptions {
  json?: boolean;
  paths?: boolean;
  main?: boolean;  // --no-main 会设置为 false
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
 * 输出表格格式
 */
function outputTable(items: ListItem[]): void {
  if (items.length === 0) {
    console.error(chalk.yellow('\n暂无 worktree\n'));
    console.error(chalk.dim('提示：使用 colyn add <branch> 创建新的 worktree'));
    return;
  }

  const table = new Table({
    head: [
      chalk.bold('ID'),
      chalk.bold('Branch'),
      chalk.bold('Port'),
      chalk.bold('Path')
    ],
    style: {
      head: [],
      border: []
    }
  });

  for (const item of items) {
    const idStr = item.isMain ? '-' : String(item.id);
    const row = [idStr, item.branch, String(item.port), item.path];

    if (item.isCurrent) {
      // 当前行用青色显示，末尾加标记
      table.push(row.map((cell, index) => {
        if (index === row.length - 1) {
          return chalk.cyan(cell) + chalk.yellow('  ← 当前位置');
        }
        return chalk.cyan(cell);
      }));
    } else if (item.isMain) {
      // 主分支用灰色显示
      table.push(row.map(cell => chalk.dim(cell)));
    } else {
      table.push(row);
    }
  }

  console.log(table.toString());

  // 如果只有主分支，给出提示
  const hasWorktrees = items.some(item => !item.isMain);
  if (!hasWorktrees) {
    console.error(chalk.dim('\n提示：使用 colyn add <branch> 创建新的 worktree'));
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
 * List 命令：列出所有 worktree
 */
async function listCommand(options: ListOptions): Promise<void> {
  try {
    // 检查选项冲突
    if (options.json && options.paths) {
      throw new ColynError(
        '选项冲突：--json 和 --paths 不能同时使用',
        '请选择其中一种输出格式'
      );
    }

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
        path: paths.mainDir,
        isMain: true,
        isCurrent: isCurrentDirectory(paths.mainDir)
      });
    }

    // 添加任务 worktree
    for (const wt of projectInfo.worktrees) {
      items.push({
        id: wt.id,
        branch: wt.branch,
        port: wt.port,
        path: wt.path,
        isMain: false,
        isCurrent: isCurrentDirectory(wt.path)
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
    .description('列出所有 worktree')
    .option('--json', '以 JSON 格式输出')
    .option('-p, --paths', '只输出路径（每行一个）')
    .option('--no-main', '不显示主分支')
    .action(async (options) => {
      await listCommand(options);
    });
}
