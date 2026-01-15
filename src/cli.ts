import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { addCommand } from './commands/add.js';
import { listCommand } from './commands/list.js';
import { mergeCommand } from './commands/merge.js';

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

program
  .command('init')
  .description('初始化 worktree 管理结构')
  .option('-p, --port <port>', '主分支开发服务器端口')
  .action(async (options) => {
    await initCommand(options);
  });

program
  .command('add <branch>')
  .description('创建新的 worktree')
  .action(async (branch: string) => {
    await addCommand(branch);
  });

program
  .command('list')
  .description('列出所有 worktree')
  .option('--json', '以 JSON 格式输出')
  .option('-p, --paths', '只输出路径（每行一个）')
  .option('--no-main', '不显示主分支')
  .action(async (options) => {
    await listCommand(options);
  });

program
  .command('merge [target]')
  .description('将 worktree 分支合并回主分支')
  .option('--push', '合并后自动推送到远程')
  .option('--no-push', '合并后不推送')
  .action(async (target: string | undefined, options: { push?: boolean }) => {
    await mergeCommand(target, options);
  });

export function run(): void {
  program.parse();
}
