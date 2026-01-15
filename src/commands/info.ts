import chalk from 'chalk';
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
 * info 命令选项
 */
export interface InfoOptions {
  field?: string[];
  format?: string;
  separator?: string;
}

/**
 * info 命令主函数
 */
export async function infoCommand(options: InfoOptions): Promise<void> {
  try {
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
