import { Command } from 'commander';
import { registerAllCommands } from './commands/index.js';

const program = new Command();

// 如果通过 bash 入口调用，使用环境变量中的用户目录
const userCwd = process.env.COLYN_USER_CWD;
if (userCwd) {
  process.chdir(userCwd);
}

program
  .name('colyn')
  .description('Git worktree 管理工具')
  .version('0.1.0');

// 注册所有命令
registerAllCommands(program);

export function run(): void {
  program.parse();
}
