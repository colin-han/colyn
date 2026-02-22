import type { Command } from 'commander';
import * as path from 'path';
import chalk from 'chalk';
import simpleGit from 'simple-git';
import { getLocationInfo, type LocationInfo } from '../core/paths.js';
import { getWorktreeStatus } from '../core/worktree-status.js';
import type { WorktreeStatus } from '../core/worktree-status.js';
import { ColynError } from '../types/index.js';
import { output, formatError } from '../utils/logger.js';
import { t } from '../i18n/index.js';

/**
 * 可用的字段名
 */
const VALID_FIELDS = [
  'project',
  'project-path',
  'worktree-id',
  'worktree-dir',
  'worktree-path',
  'branch',
  'status',
  'last-updated-at',
] as const;
type FieldName = (typeof VALID_FIELDS)[number];

/**
 * 完整的 info 数据（位置信息 + 工作流状态）
 */
interface InfoData extends LocationInfo {
  worktreeStatus: WorktreeStatus;
  statusUpdatedAt: string | null;
}

/**
 * 格式化 ISO 时间为本地可读格式
 */
function formatDate(isoString: string): string {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/**
 * 从 InfoData 获取字段值
 */
function getFieldValue(info: InfoData, field: FieldName): string {
  switch (field) {
    case 'project':
      return info.project;
    case 'project-path':
      return info.projectPath;
    case 'worktree-id':
      return String(info.worktreeId);
    case 'worktree-dir':
      return info.worktreeDir;
    case 'worktree-path':
      return info.worktreePath;
    case 'branch':
      return info.branch;
    case 'status':
      return info.worktreeStatus;
    case 'last-updated-at':
      return info.statusUpdatedAt ?? '';
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
function renderTemplate(template: string, info: InfoData): string {
  return template.replace(/\{([^}]+)\}/g, (match, fieldName) => {
    const trimmedField = fieldName.trim();
    if (!validateField(trimmedField)) {
      throw new ColynError(
        t('commands.info.invalidField', { field: trimmedField }),
        t('commands.info.invalidFieldHint', { fields: VALID_FIELDS.join(', ') })
      );
    }
    return getFieldValue(info, trimmedField);
  });
}

/**
 * 输出带颜色的完整信息
 */
function printFullInfo(info: InfoData): void {
  const labelWidth = 14;

  const lines = [
    {
      icon: '📁',
      label: t('commands.info.labelProject'),
      value: chalk.cyan(info.project),
    },
    {
      icon: '📂',
      label: t('commands.info.labelProjectPath'),
      value: chalk.gray(info.projectPath),
    },
    {
      icon: '🔢',
      label: t('commands.info.labelWorktreeId'),
      value:
        info.worktreeId === 0
          ? chalk.yellow(t('commands.info.mainIndicator'))
          : chalk.green(String(info.worktreeId)),
    },
    {
      icon: '📁',
      label: t('commands.info.labelWorktreeDir'),
      value: chalk.cyan(info.worktreeDir),
    },
    {
      icon: '📂',
      label: t('commands.info.labelWorktreePath'),
      value: chalk.gray(info.worktreePath),
    },
    {
      icon: '🌿',
      label: t('commands.info.labelBranch'),
      value: chalk.magenta(info.branch),
    },
    {
      icon: '⚡',
      label: t('commands.info.labelStatus'),
      value: chalk.cyan(info.worktreeStatus),
    },
    {
      icon: '📅',
      label: t('commands.info.labelLastUpdatedAt'),
      value: info.statusUpdatedAt
        ? formatDate(info.statusUpdatedAt)
        : chalk.gray(t('commands.info.statusNeverSet')),
    },
  ];

  for (const line of lines) {
    const paddedLabel = line.label.padEnd(labelWidth);
    output(`${line.icon} ${paddedLabel}${line.value}`);
  }
}

/**
 * 输出降级后的基本信息（用于非 colyn 项目）
 */
async function printFallbackInfo(): Promise<void> {
  const labelWidth = 14;

  try {
    // 尝试获取 git 信息
    const gitRoot = await getGitRoot();
    if (gitRoot) {
      const git = simpleGit();
      const branch = await git.branchLocal();
      const repoName = path.basename(gitRoot);

      const lines = [
        {
          icon: '📁',
          label: t('commands.info.labelRepository'),
          value: chalk.cyan(repoName),
        },
        {
          icon: '📂',
          label: t('commands.info.labelRepositoryPath'),
          value: chalk.gray(gitRoot),
        },
        {
          icon: '🌿',
          label: t('commands.info.labelBranch'),
          value: chalk.magenta(branch.current ?? 'unknown'),
        },
      ];

      for (const line of lines) {
        const paddedLabel = line.label.padEnd(labelWidth);
        output(`${line.icon} ${paddedLabel}${line.value}`);
      }
      return;
    }
  } catch {
    // 忽略 git 错误，继续降级到目录信息
  }

  // 非 git 目录，显示当前目录信息
  const cwd = process.cwd();
  const dirName = path.basename(cwd);

  const lines = [
    {
      icon: '📁',
      label: t('commands.info.labelDirectory'),
      value: chalk.cyan(dirName),
    },
    {
      icon: '📂',
      label: t('commands.info.labelDirectoryPath'),
      value: chalk.gray(cwd),
    },
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

    // 尝试获取当前位置信息
    let locationInfo: LocationInfo | null = null;
    try {
      locationInfo = await getLocationInfo();
    } catch {
      // 如果获取失败，检查是否有需要 colyn 信息的选项
      if (options.format || options.field) {
        // --format 和 --field 需要 colyn 项目信息
        throw new ColynError(
          t('commands.info.notColynProject'),
          t('commands.info.notColynProjectHint')
        );
      }
      // 无参数时使用降级显示
      locationInfo = null;
    }

    // 如果是 colyn 项目，继续处理其他选项
    if (locationInfo) {
      // 获取工作流状态
      const configDir = path.join(locationInfo.projectPath, '.colyn');
      const effectiveDir = locationInfo.isMainBranch ? 'main' : locationInfo.worktreeDir;
      const statusResult = await getWorktreeStatus(configDir, effectiveDir);

      const info: InfoData = {
        ...locationInfo,
        worktreeStatus: statusResult.status,
        statusUpdatedAt: statusResult.updatedAt,
      };

      // 处理 --format 参数
      if (options.format) {
        const rendered = renderTemplate(options.format, info);
        // 直接输出到 stdout，用于脚本使用
        process.stdout.write(rendered + '\n');
        return;
      }

      // 处理 --field 参数
      if (options.field && options.field.length > 0) {
        // 验证所有字段
        for (const field of options.field) {
          if (!validateField(field)) {
            throw new ColynError(
              t('commands.info.invalidField', { field }),
              t('commands.info.invalidFieldHint', { fields: VALID_FIELDS.join(', ') })
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
    } else {
      // 非 colyn 项目，显示降级信息
      await printFallbackInfo();
    }
  } catch (error) {
    if (error instanceof ColynError) {
      formatError(error);
      process.exit(1);
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
    .description(t('commands.info.description'))
    .option('-S, --short', t('commands.info.shortOption'))
    .option(
      '-f, --field <name>',
      t('commands.info.fieldOption'),
      (value, previous: string[]) => {
        return previous.concat([value]);
      },
      []
    )
    .option('--format <template>', t('commands.info.formatOption'))
    .option('-s, --separator <char>', t('commands.info.separatorOption'))
    .action(async (options) => {
      await infoCommand(options);
    });

  // 添加详细的帮助信息
  cmd.addHelpText(
    'after',
    `

可用字段：
  project         项目名称
  project-path    项目根目录路径
  worktree-id     Worktree ID（主分支为 0）
  worktree-dir    Worktree 目录名
  worktree-path   Worktree 目录完整路径
  branch          当前分支名
  status          工作流状态（idle/running/waiting-confirm/finish）
  last-updated-at 状态最后更新时间（ISO 8601 格式，未设置时为空）

使用示例：
  # 在 colyn 项目中显示完整信息（默认）
  $ colyn info
  📁 Project:       my-project
  📂 Project Path:  /path/to/my-project
  🔢 Worktree ID:   1
  📁 Worktree Dir:  task-1
  🌿 Branch:        feature/login
  ⚡ Status:        running
  📅 Last Updated:  2026-02-22 13:22:04

  # 输出简短标识符（带分支信息）
  $ colyn info --short
  my-project/task-1 (⎇ feature/login)

  # 获取状态字段
  $ colyn info -f status
  running

  # 获取多个字段
  $ colyn info -f worktree-id -f status
  1	running

  # 使用模板格式化输出
  $ colyn info --format "Worktree {worktree-id}: {branch} [{status}]"
  Worktree 1: feature/login [running]
`
  );
}
