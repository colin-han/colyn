import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { registerAllCommands } from './commands/index.js';
import { t, initI18n } from './i18n/index.js';
import { getProjectPaths } from './core/paths.js';

// 获取 package.json 中的版本号
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
) as { version: string };
const version = packageJson.version;

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

// 配置 Commander 输出（本地化错误消息）
program.configureOutput({
  writeErr: (str) => {
    // 本地化 Commander.js 错误消息
    let localizedStr = str;

    // 替换 "error:" 为本地化版本
    localizedStr = localizedStr.replace(/^error:/i, chalk.red(`${t('common.error')}:`));

    // 替换 "missing required argument" 消息
    const missingArgMatch = localizedStr.match(/missing required argument '(.+?)'/);
    if (missingArgMatch) {
      const argName = missingArgMatch[1];
      localizedStr = localizedStr.replace(
        /missing required argument '.+?'/,
        t('cli.missingArgument', { arg: argName })
      );
    }

    process.stderr.write(localizedStr);
  }
});

program
  .name('colyn')
  .description(t('cli.description'))
  .version(version, '-V, --version', t('cli.versionDescription'))
  .helpOption('-h, --help', t('cli.helpDescription'))
  .addHelpCommand(t('cli.helpCommand'), t('cli.helpCommandDescription'))
  .option('-C, --no-color', t('cli.noColorOption'))
  .showHelpAfterError(t('cli.showHelpHint'));

// 注册所有命令
registerAllCommands(program);

export async function run(): Promise<void> {
  // 初始化 i18n（尝试读取项目配置）
  let projectPaths: Awaited<ReturnType<typeof getProjectPaths>> | null = null;
  try {
    projectPaths = await getProjectPaths();
    await initI18n(projectPaths.configDir);
  } catch {
    // 不在项目目录中，只使用环境变量和用户配置
    await initI18n();
  }

  program.parse();
}
