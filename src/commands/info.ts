import type { Command } from 'commander';
import * as path from 'path';
import chalk from 'chalk';
import simpleGit from 'simple-git';
import { getLocationInfo, type LocationInfo } from '../core/paths.js';
import { ColynError } from '../types/index.js';
import { output, formatError } from '../utils/logger.js';

/**
 * 可用的字段名
 */
const VALID_FIELDS = ['project', 'project-path', 'worktree-id', 'worktree-dir', 'branch'] as const;
type FieldName = (typeof VALID_FIELDS)[number];

/**
 * 从 LocationInfo 获取字段值
 */
function getFieldValue(info: LocationInfo, field: FieldName): string {
  switch (field) {
    case 'project':
      return info.project;
    case 'project-path':
      return info.projectPath;
    case 'worktree-id':
      return String(info.worktreeId);
    case 'worktree-dir':
      return info.worktreeDir;
    case 'branch':
      return info.branch;
  }
}

/**
 * 验证字段名是否有效
 */
function validateField(field: string): field is FieldName {
  return (VALID_FIELDS as readonly string[]).includes(field);
}

/**
 * 渲染模板字符串
 */
function renderTemplate(template: string, info: LocationInfo): string {
  return template.replace(/\{([^}]+)\}/g, (match, fieldName) => {
    const trimmedField = fieldName.trim();
    if (!validateField(trimmedField)) {
      throw new ColynError(
        `无效的字段名: ${trimmedField}`,
        `有效字段: ${VALID_FIELDS.join(', ')}`
      );
    }
    return getFieldValue(info, trimmedField);
  });
}

/**
 * 输出带颜色的完整信息
 */
function printFullInfo(info: LocationInfo): void {
  const labelWidth = 14;

  const lines = [
    {
      icon: '📁',
      label: 'Project:',
      value: chalk.cyan(info.project)
    },
    {
      icon: '📂',
      label: 'Project Path:',
      value: chalk.gray(info.projectPath)
    },
    {
      icon: '🔢',
      label: 'Worktree ID:',
      value: info.worktreeId === 0 ? chalk.yellow('0 (main)') : chalk.green(String(info.worktreeId))
    },
    {
      icon: '📁',
      label: 'Worktree Dir:',
      value: chalk.cyan(info.worktreeDir)
    },
    {
      icon: '🌿',
      label: 'Branch:',
      value: chalk.magenta(info.branch)
    }
  ];

  for (const line of lines) {
    const paddedLabel = line.label.padEnd(labelWidth);
    output(`${line.icon} ${paddedLabel}${line.value}`);
  }
}

/**
 * 获取 git 仓库根目录
 */
async function getGitRoot(): Promise<string | null> {
  try {
    const git = simpleGit();
    const root = await git.revparse(['--show-toplevel']);
    return root.trim();
  } catch {
    return null;
  }
}

/**
 * 获取简短标识符（带降级策略）
 */
async function getShortId(): Promise<string> {
  try {
    // 1. 尝试获取 colyn 信息
    const info = await getLocationInfo();
    // 格式: project/worktreeDir (⎇ branch)
    // 颜色: cyan / gray / yellow ( gray ⎇ magenta )
    return (
      chalk.cyan(info.project) +
      chalk.gray('/') +
      chalk.yellow(info.worktreeDir) +
      ' ' +
      chalk.gray('(') +
      chalk.gray('⎇ ') +
      chalk.magenta(info.branch) +
      chalk.gray(')')
    );
  } catch {
    try {
      // 2. 尝试获取 git 仓库名和分支
      const gitRoot = await getGitRoot();
      if (gitRoot) {
        const git = simpleGit();
        const branch = await git.branchLocal();
        const repoName = path.basename(gitRoot);
        // 格式: repoName (⎇ branch)
        // 颜色: cyan ( gray ⎇ magenta )
        return (
          chalk.cyan(repoName) +
          ' ' +
          chalk.gray('(') +
          chalk.gray('⎇ ') +
          chalk.magenta(branch.current) +
          chalk.gray(')')
        );
      }
    } catch {
      // 忽略 git 错误，继续降级
    }

    // 3. 使用当前目录名
    return chalk.cyan(path.basename(process.cwd()));
  }
}

/**
 * info 命令选项
 */
interface InfoOptions {
  field?: string[];
  format?: string;
  separator?: string;
  short?: boolean;
}

/**
 * info 命令主函数
 */
async function infoCommand(options: InfoOptions): Promise<void> {
  try {
    // 处理 --short 参数（优先级最高）
    if (options.short) {
      const shortId = await getShortId();
      process.stdout.write(shortId + '\n');
      return;
    }

    // 获取当前位置信息
    const info = await getLocationInfo();

    // 处理 --format 参数
    if (options.format) {
      const output = renderTemplate(options.format, info);
      // 直接输出到 stdout，用于脚本使用
      process.stdout.write(output + '\n');
      return;
    }

    // 处理 --field 参数
    if (options.field && options.field.length > 0) {
      // 验证所有字段
      for (const field of options.field) {
        if (!validateField(field)) {
          throw new ColynError(
            `无效的字段名: ${field}`,
            `有效字段: ${VALID_FIELDS.join(', ')}`
          );
        }
      }

      // 获取字段值
      const values = options.field.map((field) => getFieldValue(info, field as FieldName));

      // 使用分隔符连接输出
      const separator = options.separator ?? '\t';
      process.stdout.write(values.join(separator) + '\n');
      return;
    }

    // 无参数，显示完整信息
    printFullInfo(info);
  } catch (error) {
    if (error instanceof ColynError) {
      formatError(error);
      process.exit(error.message.includes('未找到项目根目录') ? 1 : 2);
    }
    throw error;
  }
}

/**
 * 注册 info 命令
 */
export function register(program: Command): void {
  const cmd = program
    .command('info')
    .description('显示当前目录的 colyn 项目信息')
    .option('-S, --short', '输出简短标识符（带分支信息）')
    .option('-f, --field <name>', '输出指定字段（可多次使用）', (value, previous: string[]) => {
      return previous.concat([value]);
    }, [])
    .option('--format <template>', '使用模板字符串格式化输出')
    .option('-s, --separator <char>', '多字段时的分隔符（默认 tab）')
    .action(async (options) => {
      await infoCommand(options);
    });

  // 添加详细的帮助信息
  cmd.addHelpText('after', `

可用字段：
  project         项目名称
  project-path    项目路径（主分支目录）
  worktree-id     Worktree ID（主分支为 0）
  worktree-dir    Worktree 目录名
  branch          当前分支名

使用示例：
  # 显示完整信息（默认）
  $ colyn info
  📁 Project:       my-project
  📂 Project Path:  /path/to/my-project
  🔢 Worktree ID:   1
  📁 Worktree Dir:  task-1
  🌿 Branch:        feature/login

  # 输出简短标识符（带分支信息）
  $ colyn info --short
  my-project/task-1 (⎇ feature/login)

  # 使用缩写
  $ colyn info -S
  my-project/task-1 (⎇ feature/login)

  # 在非 colyn 项目的 git 仓库中
  $ colyn info --short
  my-repo (⎇ main)

  # 在非 git 目录中
  $ colyn info --short
  my-folder

  # 输出单个字段
  $ colyn info -f branch
  feature/login

  # 输出多个字段（tab 分隔）
  $ colyn info -f worktree-id -f branch
  1	feature/login

  # 使用自定义分隔符
  $ colyn info -f worktree-id -f branch -s ","
  1,feature/login

  # 使用模板格式化输出
  $ colyn info --format "Worktree {worktree-id}: {branch}"
  Worktree 1: feature/login

  # 在脚本中使用
  $ BRANCH=$(colyn info -f branch)
  $ echo "Current branch: $BRANCH"
  Current branch: feature/login

  # 在 shell 提示符中使用
  $ PS1='[$(colyn info -S)] $ '
  [my-project/task-1 (⎇ feature/login)] $
`);
}
