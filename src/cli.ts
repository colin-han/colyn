import { Command } from 'commander';
import { initCommand } from './commands/init.js';

const program = new Command();

program
  .name('colyn')
  .description('Git worktree 管理工具')
  .version('0.1.0');

program
  .command('init')
  .description('初始化 worktree 管理结构')
  .option('-p, --port <port>', '主分支开发服务器端口')
  .action(async (options) => {
    await initCommand(options);
  });

export function run(): void {
  program.parse();
}
