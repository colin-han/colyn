import { Command } from 'commander';
import chalk from 'chalk';
import { registerAllCommands } from './commands/index.js';
import { t } from './i18n/index.js';

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

// 配置 commander.js 的帮助文本国际化
program.configureHelp({
  formatHelp: (cmd, helper) => {
    const termWidth = helper.padWidth(cmd, helper);
    const helpWidth = helper.helpWidth || 80;

    function formatItem(term: string, description: string) {
      if (description) {
        const fullText = `${term.padEnd(termWidth + 2)}${description}`;
        return helper.wrap(fullText, helpWidth - 2, termWidth + 2);
      }
      return term;
    }

    function formatList(textArray: string[]) {
      return textArray.join('\n').replace(/^/gm, '  ');
    }

    // Usage
    let output = [`${t('cli.usage')} ${helper.commandUsage(cmd)}`, ''];

    // Description
    const commandDescription = helper.commandDescription(cmd);
    if (commandDescription.length > 0) {
      output = output.concat([helper.wrap(commandDescription, helpWidth, 0), '']);
    }

    // Arguments
    const argumentList = helper.visibleArguments(cmd).map((argument) => {
      return formatItem(helper.argumentTerm(argument), helper.argumentDescription(argument));
    });
    if (argumentList.length > 0) {
      output = output.concat([t('cli.arguments'), formatList(argumentList), '']);
    }

    // Options
    const optionList = helper.visibleOptions(cmd).map((option) => {
      return formatItem(helper.optionTerm(option), helper.optionDescription(option));
    });
    if (optionList.length > 0) {
      output = output.concat([t('cli.options'), formatList(optionList), '']);
    }

    // Commands
    const commandList = helper.visibleCommands(cmd).map((subCmd) => {
      return formatItem(helper.subcommandTerm(subCmd), helper.subcommandDescription(subCmd));
    });
    if (commandList.length > 0) {
      output = output.concat([t('cli.commands'), formatList(commandList), '']);
    }

    return output.join('\n');
  }
});

program
  .name('colyn')
  .description(t('cli.description'))
  .version('0.1.0', '-V, --version', t('cli.versionDescription'))
  .helpOption('-h, --help', t('cli.helpDescription'))
  .addHelpCommand(t('cli.helpCommand'), t('cli.helpCommandDescription'))
  .option('-C, --no-color', t('cli.noColorOption'));

// 注册所有命令
registerAllCommands(program);

export function run(): void {
  program.parse();
}
