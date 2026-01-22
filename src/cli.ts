import { Command } from 'commander';
import chalk from 'chalk';
import { registerAllCommands } from './commands/index.js';

// 检查是否禁用颜色输出
const noColor = process.argv.includes('--no-color') || process.argv.includes('-C');

if (noColor) {
  // 禁用颜色输出
  chalk.level = 0;
} else {
  // 强制启用颜色输出
  // 即使通过 alias 或管道调用，也保持彩色输出
  chalk.level = 3; // 启用 TrueColor (24-bit) 支持
}

const program = new Command();

// 如果通过 bash 入口调用，使用环境变量中的用户目录
const userCwd = process.env.COLYN_USER_CWD;
if (userCwd) {
  process.chdir(userCwd);
}

program
  .name('colyn')
  .description('Git worktree 管理工具')
  .version('0.1.0')
  .option('-C, --no-color', '禁用颜色输出');

// 注册所有命令
registerAllCommands(program);

export function run(): void {
  program.parse();
}
