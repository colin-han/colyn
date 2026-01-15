import chalk from 'chalk';
import { ColynError, CommandResult } from '../types/index.js';

/**
 * 输出到 stderr（彩色，给用户看）
 */
export function output(message: string): void {
  process.stderr.write(message + '\n');
}

/**
 * 输出空行到 stderr
 */
export function outputLine(): void {
  process.stderr.write('\n');
}

/**
 * 输出成功信息到 stderr
 */
export function outputSuccess(message: string): void {
  output(chalk.green(`✓ ${message}`));
}

/**
 * 输出错误信息到 stderr
 */
export function outputError(message: string): void {
  output(chalk.red(`✗ ${message}`));
}

/**
 * 输出警告信息到 stderr
 */
export function outputWarning(message: string): void {
  output(chalk.yellow(`⚠ ${message}`));
}

/**
 * 输出普通信息到 stderr
 */
export function outputInfo(message: string): void {
  output(chalk.gray(message));
}

/**
 * 输出高亮信息到 stderr
 */
export function outputBold(message: string): void {
  output(chalk.bold(message));
}

/**
 * 输出提示步骤到 stderr
 */
export function outputStep(message: string): void {
  output(chalk.cyan(message));
}

/**
 * 输出命令结果到 stdout（JSON 格式，给 bash 解析）
 */
export function outputResult(result: CommandResult): void {
  console.log(JSON.stringify(result));
}

/**
 * 格式化并显示错误到 stderr
 */
export function formatError(error: unknown): void {
  if (error instanceof ColynError) {
    output(chalk.red(`\n✗ ${error.message}`));
    if (error.hint) {
      output(chalk.yellow(`  提示: ${error.hint}\n`));
    }
  } else if (error instanceof Error) {
    output(chalk.red(`\n✗ 错误: ${error.message}\n`));
  } else {
    output(chalk.red('\n✗ 未知错误\n'));
  }
}
