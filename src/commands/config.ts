/**
 * config 命令
 *
 * 管理 Colyn 配置（tmux 配置和全局配置）
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { getProjectPaths } from '../core/paths.js';
import {
  getConfig,
  saveConfig,
  getGlobalConfigDir,
  type ColynConfig,
} from '../core/config.js';
import {
  loadTmuxConfigForBranch,
  loadSettingsFromFile,
  getUserConfigPath,
  getProjectConfigPath,
  BUILTIN_COMMANDS,
  type TmuxConfig,
  type PaneConfig,
  type Settings,
} from '../core/tmux-config.js';
import { getCurrentBranch } from '../core/git.js';
import { output, outputBold, outputSuccess, formatError } from '../utils/logger.js';
import { ColynError } from '../types/index.js';
import { t } from '../i18n/index.js';
import * as fs from 'fs/promises';

/**
 * 默认配置（用于显示）
 */
const DEFAULT_CONFIG = {
  autoRun: true,
  layout: 'three-pane' as const,
  leftPane: {
    command: BUILTIN_COMMANDS.AUTO_CLAUDE,
    size: '60%',
  },
  topRightPane: {
    command: BUILTIN_COMMANDS.AUTO_DEV_SERVER,
    size: '30%',
  },
  bottomRightPane: {
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
  // 注意：必须区分 null（明确设置为不执行）和 undefined（未设置，使用默认值）
  const command = config?.command !== undefined ? config.command : defaultConfig.command;
  const size = config?.size !== undefined ? config.size : defaultConfig.size;
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

  // topRightPane
  const topRightPane = getEffectivePaneConfig(
    config.topRightPane,
    DEFAULT_CONFIG.topRightPane
  );
  output('');
  output(`  topRightPane:`);
  output(
    `    command: ${formatCommandValue(topRightPane.command, topRightPane.commandIsDefault)}`
  );
  output(
    `    size:    ${formatSizeValue(topRightPane.size, topRightPane.sizeIsDefault)}`
  );

  // bottomRightPane
  const bottomRightPane = getEffectivePaneConfig(
    config.bottomRightPane,
    DEFAULT_CONFIG.bottomRightPane
  );
  output('');
  output(`  bottomRightPane:`);
  output(
    `    command: ${formatCommandValue(bottomRightPane.command, bottomRightPane.commandIsDefault)}`
  );
  output(
    `    size:    ${formatSizeValue(bottomRightPane.size, bottomRightPane.sizeIsDefault)}`
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
    autoRun: config.autoRun !== undefined ? config.autoRun : DEFAULT_CONFIG.autoRun,
    leftPane: {
      command: config.leftPane?.command !== undefined
        ? config.leftPane.command
        : DEFAULT_CONFIG.leftPane.command,
      size: config.leftPane?.size !== undefined
        ? config.leftPane.size
        : DEFAULT_CONFIG.leftPane.size,
    },
    topRightPane: {
      command: config.topRightPane?.command !== undefined
        ? config.topRightPane.command
        : DEFAULT_CONFIG.topRightPane.command,
      size: config.topRightPane?.size !== undefined
        ? config.topRightPane.size
        : DEFAULT_CONFIG.topRightPane.size,
    },
    bottomRightPane: {
      command: config.bottomRightPane?.command !== undefined
        ? config.bottomRightPane.command
        : DEFAULT_CONFIG.bottomRightPane.command,
      size: config.bottomRightPane?.size !== undefined
        ? config.bottomRightPane.size
        : DEFAULT_CONFIG.bottomRightPane.size,
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

    // 获取当前分支并加载对应的配置
    const currentBranch = await getCurrentBranch(paths.rootDir);
    const mergedConfig = await loadTmuxConfigForBranch(paths.rootDir, currentBranch);

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
 * 获取配置目录
 */
async function getConfigDirectory(isUser: boolean): Promise<string> {
  if (isUser) {
    const userDir = getGlobalConfigDir();
    // 确保用户配置目录存在
    await fs.mkdir(userDir, { recursive: true });
    return userDir;
  } else {
    const paths = await getProjectPaths();
    return paths.configDir;
  }
}

/**
 * 获取配置值
 */
async function getConfigValue(key: string, options: { user?: boolean }): Promise<void> {
  try {
    const validKeys: Array<keyof ColynConfig> = ['npm', 'lang'];

    if (!validKeys.includes(key as keyof ColynConfig)) {
      throw new ColynError(
        t('commands.config.invalidKey', { key, validKeys: validKeys.join(', ') })
      );
    }

    const configDir = options.user ? undefined : (await getProjectPaths()).configDir;
    const config = await getConfig(configDir);
    const value = config[key as keyof ColynConfig];

    // 输出到 stdout 供脚本解析
    process.stdout.write(value + '\n');
  } catch (error) {
    if (error instanceof ColynError) {
      formatError(error);
      process.exit(1);
    }
    throw error;
  }
}

/**
 * 设置配置值
 */
async function setConfigValue(
  key: string,
  value: string,
  options: { user?: boolean }
): Promise<void> {
  try {
    const validKeys: Array<keyof ColynConfig> = ['npm', 'lang'];

    if (!validKeys.includes(key as keyof ColynConfig)) {
      throw new ColynError(
        t('commands.config.invalidKey', { key, validKeys: validKeys.join(', ') })
      );
    }

    // 验证 lang 值
    if (key === 'lang') {
      const validLangs = ['en', 'zh-CN'];
      if (!validLangs.includes(value)) {
        throw new ColynError(
          t('commands.config.invalidLang', { value, validLangs: validLangs.join(', ') })
        );
      }
    }

    const configDir = await getConfigDirectory(!!options.user);
    const updates: Partial<ColynConfig> = { [key]: value };

    await saveConfig(configDir, updates);

    const scope = options.user
      ? t('commands.config.userScope')
      : t('commands.config.projectScope');

    outputSuccess(t('commands.config.setSuccess', { key, value, scope }));
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
  const configCmd = program
    .command('config')
    .description(t('commands.config.description'));

  // get 子命令：获取配置值
  configCmd
    .command('get <key>')
    .description(t('commands.config.getDescription'))
    .option('--user', t('commands.config.userOption'))
    .action(async (key: string, options: { user?: boolean }) => {
      await getConfigValue(key, options);
    });

  // set 子命令：设置配置值
  configCmd
    .command('set <key> <value>')
    .description(t('commands.config.setDescription'))
    .option('--user', t('commands.config.userOption'))
    .action(async (key: string, value: string, options: { user?: boolean }) => {
      await setConfigValue(key, value, options);
    });

  // 默认命令：显示 tmux 配置（保持向后兼容）
  configCmd
    .option('--json', t('commands.config.jsonOption'))
    .action(async (options: ConfigOptions) => {
      await configCommand(options);
    });
}
