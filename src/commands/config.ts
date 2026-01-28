/**
 * config 命令
 *
 * 显示 tmux 配置的合并结果，帮助用户调试配置文件
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { getProjectPaths } from '../core/paths.js';
import {
  loadTmuxConfig,
  loadSettingsFromFile,
  getUserConfigPath,
  getProjectConfigPath,
  BUILTIN_COMMANDS,
  type TmuxConfig,
  type PaneConfig,
  type Settings,
} from '../core/tmux-config.js';
import { output, outputBold, formatError } from '../utils/logger.js';
import { ColynError } from '../types/index.js';
import { t } from '../i18n/index.js';
import * as fs from 'fs/promises';

/**
 * 默认配置（用于显示）
 */
const DEFAULT_CONFIG = {
  autoRun: true,
  leftPane: {
    command: BUILTIN_COMMANDS.AUTO_CLAUDE,
    size: '60%',
  },
  rightTopPane: {
    command: BUILTIN_COMMANDS.AUTO_DEV_SERVER,
    size: '30%',
  },
  rightBottomPane: {
    command: null as string | null,
    size: '70%',
  },
};

/**
 * 检查文件是否存在
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 格式化命令值显示
 */
function formatCommandValue(
  command: string | null | undefined,
  isDefault: boolean
): string {
  const suffix = isDefault ? chalk.dim(` ${t('commands.config.default')}`) : '';

  if (command === null) {
    return chalk.gray('null') + chalk.dim(` ${t('commands.config.noCommand')}`) + suffix;
  }
  if (command === undefined) {
    return chalk.gray('undefined');
  }

  // 检查是否是内置命令
  if (command === BUILTIN_COMMANDS.AUTO_CLAUDE) {
    return chalk.cyan(`"${command}"`) + chalk.dim(` ${t('commands.config.builtin')}`) + suffix;
  }
  if (command === BUILTIN_COMMANDS.AUTO_CLAUDE_DANGEROUSLY) {
    return chalk.yellow(`"${command}"`) + chalk.dim(` ${t('commands.config.builtin')}`) + suffix;
  }
  if (command === BUILTIN_COMMANDS.AUTO_DEV_SERVER) {
    return chalk.cyan(`"${command}"`) + chalk.dim(` ${t('commands.config.builtin')}`) + suffix;
  }

  return chalk.green(`"${command}"`) + suffix;
}

/**
 * 格式化大小值显示
 */
function formatSizeValue(size: string | undefined, isDefault: boolean): string {
  const suffix = isDefault ? chalk.dim(` ${t('commands.config.default')}`) : '';
  if (size === undefined) {
    return chalk.gray('undefined');
  }
  return chalk.magenta(`"${size}"`) + suffix;
}

/**
 * 打印单个配置文件信息
 */
function printConfigFile(
  label: string,
  filePath: string,
  exists: boolean,
  settings: Settings | null
): void {
  output('');
  outputBold(`${label}:`);
  output(`  ${t('commands.config.path')}: ${chalk.gray(filePath)}`);
  output(`  ${t('commands.config.status')}: ${exists ? chalk.green(t('commands.config.exists')) : chalk.gray(t('commands.config.notExists'))}`);

  if (settings) {
    output(`  ${t('commands.config.content')}:`);
    output(
      `    ${chalk.dim(JSON.stringify(settings, null, 2).split('\n').join('\n    '))}`
    );
  }
}

/**
 * 获取生效的 pane 配置
 */
function getEffectivePaneConfig(
  config: PaneConfig | undefined,
  defaultConfig: { command: string | null; size: string }
): {
  command: string | null;
  commandIsDefault: boolean;
  size: string;
  sizeIsDefault: boolean;
} {
  const command = config?.command ?? defaultConfig.command;
  const size = config?.size ?? defaultConfig.size;
  return {
    command,
    commandIsDefault: config?.command === undefined,
    size,
    sizeIsDefault: config?.size === undefined,
  };
}

/**
 * 打印生效的配置
 */
function printEffectiveConfig(config: TmuxConfig): void {
  output('');
  outputBold(`${t('commands.config.effectiveConfig')}:`);
  output('');

  // autoRun
  const autoRunValue = config.autoRun ?? DEFAULT_CONFIG.autoRun;
  const autoRunIsDefault = config.autoRun === undefined;
  output(
    `  autoRun: ${autoRunValue ? chalk.green('true') : chalk.red('false')}${autoRunIsDefault ? chalk.dim(` ${t('commands.config.default')}`) : ''}`
  );

  // leftPane
  const leftPane = getEffectivePaneConfig(
    config.leftPane,
    DEFAULT_CONFIG.leftPane
  );
  output('');
  output(`  leftPane:`);
  output(
    `    command: ${formatCommandValue(leftPane.command, leftPane.commandIsDefault)}`
  );
  output(`    size:    ${formatSizeValue(leftPane.size, leftPane.sizeIsDefault)}`);

  // rightTopPane
  const rightTopPane = getEffectivePaneConfig(
    config.rightTopPane,
    DEFAULT_CONFIG.rightTopPane
  );
  output('');
  output(`  rightTopPane:`);
  output(
    `    command: ${formatCommandValue(rightTopPane.command, rightTopPane.commandIsDefault)}`
  );
  output(
    `    size:    ${formatSizeValue(rightTopPane.size, rightTopPane.sizeIsDefault)}`
  );

  // rightBottomPane
  const rightBottomPane = getEffectivePaneConfig(
    config.rightBottomPane,
    DEFAULT_CONFIG.rightBottomPane
  );
  output('');
  output(`  rightBottomPane:`);
  output(
    `    command: ${formatCommandValue(rightBottomPane.command, rightBottomPane.commandIsDefault)}`
  );
  output(
    `    size:    ${formatSizeValue(rightBottomPane.size, rightBottomPane.sizeIsDefault)}`
  );
}

/**
 * 打印内置命令列表
 */
function printBuiltinCommands(): void {
  output('');
  outputBold(`${t('commands.config.availableBuiltinCommands')}:`);
  output(`  ${chalk.cyan(BUILTIN_COMMANDS.AUTO_CLAUDE)}`);
  output(`    ${t('commands.config.autoClaudeDesc')}`);
  output('');
  output(`  ${chalk.yellow(BUILTIN_COMMANDS.AUTO_CLAUDE_DANGEROUSLY)}`);
  output(`    ${t('commands.config.autoClaudeDangerouslyDesc')}`);
  output('');
  output(`  ${chalk.cyan(BUILTIN_COMMANDS.AUTO_DEV_SERVER)}`);
  output(`    ${t('commands.config.autoDevServerDesc')}`);
}

/**
 * 构建生效的配置（用于 JSON 输出）
 */
function buildEffectiveConfig(config: TmuxConfig): TmuxConfig {
  return {
    autoRun: config.autoRun ?? DEFAULT_CONFIG.autoRun,
    leftPane: {
      command: config.leftPane?.command ?? DEFAULT_CONFIG.leftPane.command,
      size: config.leftPane?.size ?? DEFAULT_CONFIG.leftPane.size,
    },
    rightTopPane: {
      command:
        config.rightTopPane?.command ?? DEFAULT_CONFIG.rightTopPane.command,
      size: config.rightTopPane?.size ?? DEFAULT_CONFIG.rightTopPane.size,
    },
    rightBottomPane: {
      command:
        config.rightBottomPane?.command ??
        DEFAULT_CONFIG.rightBottomPane.command,
      size:
        config.rightBottomPane?.size ?? DEFAULT_CONFIG.rightBottomPane.size,
    },
  };
}

/**
 * config 命令选项
 */
interface ConfigOptions {
  json?: boolean;
}

/**
 * config 命令主函数
 */
async function configCommand(options: ConfigOptions): Promise<void> {
  try {
    // 获取项目路径
    const paths = await getProjectPaths();

    // 获取配置文件路径
    const userConfigPath = getUserConfigPath();
    const projectConfigPath = getProjectConfigPath(paths.rootDir);

    // 检查文件是否存在并读取内容
    const [userExists, projectExists] = await Promise.all([
      fileExists(userConfigPath),
      fileExists(projectConfigPath),
    ]);

    const [userSettings, projectSettings] = await Promise.all([
      userExists ? loadSettingsFromFile(userConfigPath) : Promise.resolve(null),
      projectExists ? loadSettingsFromFile(projectConfigPath) : Promise.resolve(null),
    ]);

    // 加载合并后的配置
    const mergedConfig = await loadTmuxConfig(paths.rootDir);

    // JSON 输出模式
    if (options.json) {
      const result = {
        userConfig: {
          path: userConfigPath,
          exists: userExists,
          content: userSettings,
        },
        projectConfig: {
          path: projectConfigPath,
          exists: projectExists,
          content: projectSettings,
        },
        mergedConfig,
        effectiveConfig: buildEffectiveConfig(mergedConfig),
      };
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }

    // 人类可读格式
    outputBold(t('commands.config.title'));

    // 用户级配置
    printConfigFile(t('commands.config.userConfig'), userConfigPath, userExists, userSettings);

    // 项目级配置
    printConfigFile(t('commands.config.projectConfig'), projectConfigPath, projectExists, projectSettings);

    // 生效的配置（包含默认值）
    printEffectiveConfig(mergedConfig);

    // 内置命令列表
    printBuiltinCommands();

    output('');
  } catch (error) {
    if (error instanceof ColynError) {
      formatError(error);
      process.exit(1);
    }
    throw error;
  }
}

/**
 * 注册 config 命令
 */
export function register(program: Command): void {
  program
    .command('config')
    .description(t('commands.config.description'))
    .option('--json', t('commands.config.jsonOption'))
    .action(async (options) => {
      await configCommand(options);
    });
}
