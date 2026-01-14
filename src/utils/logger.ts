import chalk from 'chalk';
import { ColynError } from '../types/index.js';

/**
 * 格式化并显示错误
 */
export function formatError(error: unknown): void {
  if (error instanceof ColynError) {
    console.error(chalk.red(`\n✗ ${error.message}`));
    if (error.hint) {
      console.error(chalk.yellow(`  提示: ${error.hint}\n`));
    }
  } else if (error instanceof Error) {
    console.error(chalk.red(`\n✗ 错误: ${error.message}\n`));
  } else {
    console.error(chalk.red('\n✗ 未知错误\n'));
  }
}
