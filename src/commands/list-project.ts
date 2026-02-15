/**
 * list-project 命令
 *
 * 通过 tmux sessions 列出所有项目
 */

import type { Command } from 'commander';
import Table from 'cli-table3';
import chalk from 'chalk';
import { t } from '../i18n/index.js';
import {
  isTmuxAvailable,
  listSessions,
  getPaneCurrentPath
} from '../core/tmux.js';
import {
  output,
  outputWarning,
  formatError,
  outputResult
} from '../utils/logger.js';
import { ColynError } from '../types/index.js';
import { getLocationInfo } from '../core/paths.js';

/**
 * 项目信息
 */
interface ProjectInfo {
  /** session 名称 */
  sessionName: string;
  /** 项目路径 */
  projectPath: string;
  /** 项目名称 */
  projectName: string;
}

/**
 * list-project 命令选项
 */
interface ListProjectOptions {
  json?: boolean;
  paths?: boolean;
}

/**
 * 获取所有项目信息
 */
async function getAllProjects(): Promise<ProjectInfo[]> {
  const sessions = listSessions();
  const projects: ProjectInfo[] = [];
  const seenPaths = new Set<string>();

  for (const sessionName of sessions) {
    // 获取 window 0 pane 0 的当前目录
    const panePath = getPaneCurrentPath(sessionName, 0, 0);

    if (!panePath) {
      continue;
    }

    // 尝试获取该目录的项目信息（复用 info 命令的逻辑）
    try {
      const locationInfo = await getLocationInfo(panePath);

      // 使用 projectPath（与 info -f project-path 一致）
      const projectPath = locationInfo.projectPath;

      // 避免重复添加相同的项目
      if (seenPaths.has(projectPath)) {
        continue;
      }

      seenPaths.add(projectPath);

      projects.push({
        sessionName,
        projectPath,
        projectName: locationInfo.project  // 与 info -f project 一致
      });
    } catch {
      // 不是 colyn 项目，跳过
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

  const table = new Table({
    head: [
      chalk.bold(t('commands.listProject.tableSession')),
      chalk.bold(t('commands.listProject.tableProject')),
      chalk.bold(t('commands.listProject.tablePath'))
    ],
    style: {
      head: [],
      border: []
    }
  });

  for (const project of projects) {
    table.push([
      project.sessionName,
      project.projectName,
      project.projectPath
    ]);
  }

  console.error(table.toString());
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
    console.log(project.projectPath);
  }
}

/**
 * list-project 命令主函数
 */
async function listProjectCommand(options: ListProjectOptions): Promise<void> {
  try {
    // 检查 tmux 是否可用
    if (!isTmuxAvailable()) {
      throw new ColynError(
        t('commands.listProject.tmuxNotInstalled'),
        t('commands.listProject.tmuxInstallHint')
      );
    }

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
