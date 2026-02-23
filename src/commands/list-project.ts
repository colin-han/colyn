/**
 * list-project 命令
 *
 * 通过全局状态索引列出所有项目
 */

import type { Command } from 'commander';
import Table from 'cli-table3';
import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';
import { t } from '../i18n/index.js';
import {
  output,
  outputWarning,
  formatError,
  outputResult
} from '../utils/logger.js';
import { ColynError } from '../types/index.js';
import { discoverProjectInfo, getMainBranch, getMainPort } from '../core/discovery.js';
import { listGlobalStatusProjects } from '../core/worktree-status.js';
import {
  getGitStatus,
  getGitDiff,
  formatStatus,
  formatDiff,
  type GitStatus,
  type GitDiff
} from './list.helpers.js';

/**
 * 列表项信息（复用 list 命令的数据结构）
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
 * 项目信息
 */
interface ProjectInfo {
  /** 项目路径 */
  projectPath: string;
  /** 项目名称 */
  projectName: string;
  /** 主分支路径 */
  mainBranchPath: string;
  /** 最近状态更新时间（来自 ~/.colyn-status.json） */
  updatedAt: string;
  /** worktrees 列表（使用 list 命令的数据结构）*/
  worktrees: ListItem[];
}

/**
 * list-project 命令选项
 */
interface ListProjectOptions {
  json?: boolean;
  paths?: boolean;
}

/**
 * 检测当前工作目录是否在指定路径下（复用 list 命令的逻辑）
 */
function isCurrentDirectory(targetPath: string): boolean {
  const cwd = process.cwd();
  const normalizedCwd = path.resolve(cwd);
  const normalizedTarget = path.resolve(targetPath);
  return normalizedCwd === normalizedTarget || normalizedCwd.startsWith(normalizedTarget + path.sep);
}

/**
 * 获取项目的所有 worktree 列表（复用 list 命令的逻辑）
 */
async function getProjectWorktrees(projectPath: string, mainBranchPath: string): Promise<ListItem[]> {
  const items: ListItem[] = [];

  // 获取主分支信息
  const mainBranch = await getMainBranch(mainBranchPath);
  const mainPort = await getMainPort(mainBranchPath);

  // 添加主分支
  items.push({
    id: null,
    branch: mainBranch,
    port: mainPort,
    path: path.relative(projectPath, mainBranchPath) || '.',
    isMain: true,
    isCurrent: isCurrentDirectory(mainBranchPath),
    status: getGitStatus(mainBranchPath),
    diff: { ahead: 0, behind: 0 }  // 主分支没有差异
  });

  // 获取所有任务 worktree
  const worktreesDir = path.join(projectPath, 'worktrees');
  const projectInfo = await discoverProjectInfo(mainBranchPath, worktreesDir);

  for (const wt of projectInfo.worktrees) {
    items.push({
      id: wt.id,
      branch: wt.branch,
      port: wt.port,
      path: path.relative(projectPath, wt.path),
      isMain: false,
      isCurrent: isCurrentDirectory(wt.path),
      status: getGitStatus(wt.path),
      diff: getGitDiff(wt.path, mainBranch)
    });
  }

  return items;
}

/**
 * 检查路径是否存在且为目录
 */
async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * 根据 projectPath 推导主分支路径，并验证是否是有效的 colyn 项目目录结构
 */
async function resolveProjectLayout(projectPath: string): Promise<{
  projectName: string;
  mainBranchPath: string;
} | null> {
  const projectName = path.basename(projectPath);
  const mainBranchPath = path.join(projectPath, projectName);
  const worktreesPath = path.join(projectPath, 'worktrees');
  const configPath = path.join(projectPath, '.colyn');

  const [mainExists, worktreesExists, configExists] = await Promise.all([
    isDirectory(mainBranchPath),
    isDirectory(worktreesPath),
    isDirectory(configPath)
  ]);

  if (!mainExists || !worktreesExists || !configExists) {
    return null;
  }

  return { projectName, mainBranchPath };
}

/**
 * 格式化更新时间
 */
function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

/**
 * 获取所有项目信息（来自 ~/.colyn-status.json）
 */
async function getAllProjects(): Promise<ProjectInfo[]> {
  const globalProjects = await listGlobalStatusProjects();
  const projects: ProjectInfo[] = [];
  const seenPaths = new Set<string>();

  for (const entry of globalProjects) {
    const projectPath = path.resolve(entry.projectPath);
    if (seenPaths.has(projectPath)) {
      continue;
    }
    seenPaths.add(projectPath);

    try {
      const layout = await resolveProjectLayout(projectPath);
      if (!layout) {
        continue;
      }

      // 获取项目的 worktree 信息（复用 list 命令的逻辑）
      const worktrees = await getProjectWorktrees(projectPath, layout.mainBranchPath);

      projects.push({
        projectPath,
        projectName: layout.projectName,
        mainBranchPath: layout.mainBranchPath,
        updatedAt: entry.updatedAt,
        worktrees
      });
    } catch {
      // 路径失效或不是 colyn 项目，跳过
      continue;
    }
  }

  return projects;
}

/**
 * 输出表格格式
 */
function outputTable(projects: ProjectInfo[]): void {
  if (projects.length === 0) {
    console.error(chalk.yellow(`\n${t('commands.listProject.noProjects')}\n`));
    console.error(chalk.dim(t('commands.listProject.noProjectsHint')));
    return;
  }

  // 主表格：项目概览
  const mainTable = new Table({
    head: [
      chalk.bold(t('commands.listProject.tableProject')),
      chalk.bold(t('commands.listProject.tablePath')),
      chalk.bold(t('commands.listProject.tableWorktrees')),
      chalk.bold(t('commands.listProject.tableUpdatedAt'))
    ],
    style: {
      head: [],
      border: []
    }
  });

  for (const project of projects) {
    mainTable.push([
      project.projectName,
      project.projectPath,
      String(project.worktrees.length),
      formatUpdatedAt(project.updatedAt)
    ]);
  }

  console.error(mainTable.toString());

  // 详细的 worktree 信息
  for (const project of projects) {
    if (project.worktrees.length === 0) {
      continue;
    }

    console.error('');
    console.error(chalk.cyan(`${t('commands.listProject.projectWorktrees', { project: project.projectName })}:`));

    const worktreeTable = new Table({
      head: [
        chalk.bold(t('commands.list.tableId')),
        chalk.bold(t('commands.list.tableBranch')),
        chalk.bold(t('commands.list.tablePort')),
        chalk.bold(t('commands.list.tableGit')),
        chalk.bold(t('commands.list.tableDiff')),
        chalk.bold(t('commands.list.tablePath'))
      ],
      style: {
        head: [],
        border: []
      }
    });

    for (const item of project.worktrees) {
      // 主分支显示 "0-main"，worktree 显示数字 ID
      const idStr = item.isMain ? '0-main' : String(item.id);
      const idDisplay = item.isCurrent ? `→ ${idStr}` : `  ${idStr}`;

      const statusStr = formatStatus(item.status);
      const coloredStatus = statusStr ? chalk.yellow(statusStr) : '';
      const diffStr = formatDiff(item.diff, item.isMain);
      const coloredDiff = item.isMain ? chalk.dim(diffStr) :
        (diffStr === '✓' ? chalk.green(diffStr) : chalk.cyan(diffStr));

      const row = [idDisplay, item.branch, String(item.port), coloredStatus, coloredDiff, item.path];

      // 应用行样式
      if (item.isCurrent) {
        // 当前行用青色高亮显示
        worktreeTable.push(row.map((cell, index) => {
          if (index === 3 || index === 4) {  // 保留 status 和 diff 列的颜色
            return cell;
          }
          return chalk.cyan(cell);
        }));
      } else if (item.isMain) {
        // 主分支用灰色显示
        worktreeTable.push(row.map((cell, index) => {
          if (index === 3 || index === 4) {  // 保留 status 和 diff 列的颜色
            return cell;
          }
          return chalk.dim(cell);
        }));
      } else {
        worktreeTable.push(row);
      }
    }

    console.error(worktreeTable.toString());
  }
}

/**
 * 输出 JSON 格式
 */
function outputJson(projects: ProjectInfo[]): void {
  console.log(JSON.stringify(projects, null, 2));
}

/**
 * 输出路径格式
 */
function outputPaths(projects: ProjectInfo[]): void {
  for (const project of projects) {
    // 输出所有 worktree 的绝对路径
    for (const item of project.worktrees) {
      const absolutePath = path.resolve(project.projectPath, item.path);
      console.log(absolutePath);
    }
  }
}

/**
 * list-project 命令主函数
 */
async function listProjectCommand(options: ListProjectOptions): Promise<void> {
  try {
    // 检查选项冲突
    if (options.json && options.paths) {
      throw new ColynError(
        t('commands.listProject.optionConflict'),
        t('commands.listProject.optionConflictHint')
      );
    }

    // 获取所有项目
    const projects = await getAllProjects();

    // 根据选项输出
    if (options.json) {
      outputJson(projects);
    } else if (options.paths) {
      outputPaths(projects);
    } else {
      outputTable(projects);
    }

    // 如果没有项目，给出提示
    if (projects.length === 0 && !options.json && !options.paths) {
      output('');
      outputWarning(t('commands.listProject.noProjectsFound'));
    }

    outputResult({ success: true });
  } catch (error) {
    formatError(error);
    outputResult({ success: false });
    process.exit(1);
  }
}

/**
 * 注册 list-project 命令
 */
export function register(program: Command): void {
  program
    .command('list-project')
    .alias('lsp')
    .description(t('commands.listProject.description'))
    .option('--json', t('commands.listProject.jsonOption'))
    .option('-p, --paths', t('commands.listProject.pathsOption'))
    .action(async (options) => {
      await listProjectCommand(options);
    });
}
