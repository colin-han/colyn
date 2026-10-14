/**
 * config 命令
 *
 * 管理 Colyn 配置（查看配置文件与读写配置项）
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { getProjectPaths } from '../core/paths.js';
import {
  getBranchCategories,
} from '../core/config.js';
import {
  loadUserConfig,
  loadProjectConfig,
  getUserConfigPath,
  getProjectConfigPath,
} from '../core/config-loader.js';
import { mergeConfigs, applyBranchOverrides } from '../core/config-merger.js';
import { CURRENT_CONFIG_VERSION, type Settings } from '../core/config-schema.js';
import { getCurrentBranch } from '../core/git.js';
import { output, outputBold, outputSuccess, formatError } from '../utils/logger.js';
import { ColynError } from '../types/index.js';
import { t } from '../i18n/index.js';
import * as fs from 'fs/promises';
import {
  SETTINGS_KEYS,
  isSettingsKey,
  getSettingsValueAtPath,
  setSettingsValueAtPath,
  unsetSettingsValueAtPath,
} from '../core/settings-mutator.js';

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
 * 打印生效的配置（用户级 + 项目级合并，并应用当前分支覆盖）
 */
function printEffectiveConfig(config: Settings): void {
  output('');
  outputBold(`${t('commands.config.effectiveConfig')}:`);
  output(
    `  ${chalk.dim(JSON.stringify(config, null, 2).split('\n').join('\n  '))}`
  );
}

/**
 * 计算当前分支生效的配置
 */
function buildEffectiveConfig(
  userSettings: Settings | null,
  projectSettings: Settings | null,
  branchName: string
): Settings {
  const configs = [userSettings, projectSettings].filter(
    (c): c is Settings => c !== null
  );
  if (configs.length === 0) {
    return { version: CURRENT_CONFIG_VERSION };
  }
  return applyBranchOverrides(mergeConfigs(...configs), branchName);
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
      loadUserConfig(),
      loadProjectConfig(paths.rootDir),
    ]);

    // 获取当前分支并计算生效配置
    const currentBranch = await getCurrentBranch(paths.rootDir);
    const effectiveConfig = buildEffectiveConfig(userSettings, projectSettings, currentBranch);

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
        effectiveConfig,
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

    // 生效的配置
    printEffectiveConfig(effectiveConfig);

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
 * 获取配置值
 */
async function getConfigValue(key: string, options: { user?: boolean }): Promise<void> {
  try {
    // branchCategories 特殊处理：返回合并后的完整列表（JSON 格式）
    if (key === 'branchCategories') {
      const configDir = options.user ? undefined : (await getProjectPaths()).configDir;
      const categories = await getBranchCategories(configDir);
      process.stdout.write(JSON.stringify(categories, null, 2) + '\n');
      return;
    }

    if (!isSettingsKey(key)) {
      throw new ColynError(
        t('commands.config.invalidKey', { key, validKeys: ['branchCategories', ...Object.keys(SETTINGS_KEYS)].join(', ') })
      );
    }

    const filePath = options.user
      ? getUserConfigPath()
      : getProjectConfigPath((await getProjectPaths()).rootDir);
    const value = await getSettingsValueAtPath(filePath, key);
    if (value === undefined) {
      process.exit(0);
    }
    process.stdout.write(String(value) + '\n');
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
    if (!isSettingsKey(key)) {
      throw new ColynError(
        t('commands.config.invalidKey', { key, validKeys: Object.keys(SETTINGS_KEYS).join(', ') })
      );
    }

    const filePath = options.user
      ? getUserConfigPath()
      : getProjectConfigPath((await getProjectPaths()).rootDir);
    try {
      await setSettingsValueAtPath(filePath, key, value);
    } catch (err) {
      throw new ColynError(
        t('commands.config.setFailed', {
          key,
          reason: err instanceof Error ? err.message : String(err),
        })
      );
    }
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
 * 删除配置值（仅支持新 key）
 */
async function unsetConfigValue(key: string, options: { user?: boolean }): Promise<void> {
  try {
    if (!isSettingsKey(key)) {
      throw new ColynError(
        t('commands.config.invalidUnsetKey', {
          key,
          validKeys: Object.keys(SETTINGS_KEYS).join(', '),
        })
      );
    }
    const filePath = options.user
      ? getUserConfigPath()
      : getProjectConfigPath((await getProjectPaths()).rootDir);
    const removed = await unsetSettingsValueAtPath(filePath, key);
    const scope = options.user
      ? t('commands.config.userScope')
      : t('commands.config.projectScope');
    if (removed) {
      outputSuccess(t('commands.config.unsetSuccess', { key, scope }));
    } else {
      output(t('commands.config.unsetNoop', { key, scope }));
    }
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

  // unset 子命令：删除配置值
  configCmd
    .command('unset <key>')
    .description(t('commands.config.unsetDescription'))
    .option('--user', t('commands.config.userOption'))
    .action(async (key: string, options: { user?: boolean }) => {
      await unsetConfigValue(key, options);
    });

  // 默认命令：显示配置文件与生效配置
  configCmd
    .option('--json', t('commands.config.jsonOption'))
    .action(async (options: ConfigOptions) => {
      await configCommand(options);
    });
}
