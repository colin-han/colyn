/**
 * Colyn 全局配置管理模块
 *
 * 配置优先级（从高到低）：
 * 1. 环境变量
 * 2. 项目配置文件 (.colyn/config.json)
 * 3. 用户配置文件 (~/.colyn/config.json)
 * 4. 默认值
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Colyn 配置接口
 */
export interface ColynConfig {
  /** 包管理器命令，默认为 'npm' */
  npm: string;
  /** 界面语言，默认为 'en' */
  lang: string;
}

/**
 * 系统命令配置
 */
interface SystemCommands {
  npm?: string;
  claude?: string;
}

/**
 * 配置文件结构
 */
interface ConfigFile {
  npm?: string;
  lang?: string;
  systemCommands?: SystemCommands;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: ColynConfig = {
  npm: 'npm',
  lang: 'en'
};

/**
 * 配置缓存
 */
let cachedConfig: ColynConfig | null = null;
let cachedConfigDir: string | null = null;

/**
 * 从配置文件读取配置
 * @param configDir .colyn 目录路径
 */
async function readConfigFile(configDir: string): Promise<ConfigFile> {
  const configPath = path.join(configDir, 'settings.json');

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content) as ConfigFile;
  } catch {
    // 配置文件不存在或解析失败，返回空对象
    return {};
  }
}

/**
 * 获取用户配置目录路径
 */
function getUserConfigDir(): string {
  return path.join(os.homedir(), '.config', 'colyn');
}

/**
 * 导出用户配置目录路径（供其他模块使用）
 */
export function getGlobalConfigDir(): string {
  return getUserConfigDir();
}

/**
 * 读取用户配置文件
 */
async function readUserConfigFile(): Promise<ConfigFile> {
  const userConfigDir = getUserConfigDir();
  return readConfigFile(userConfigDir);
}

/**
 * 获取配置（带缓存）
 * @param configDir .colyn 目录路径（可选，如果不提供则只使用环境变量、用户配置和默认值）
 */
export async function getConfig(configDir?: string): Promise<ColynConfig> {
  // 如果缓存有效，直接返回
  if (cachedConfig && cachedConfigDir === configDir) {
    return cachedConfig;
  }

  // 读取项目配置文件
  const projectConfig = configDir ? await readConfigFile(configDir) : {};

  // 读取用户配置文件
  const userConfig = await readUserConfigFile();

  // 合并配置（环境变量 > 项目配置 > 用户配置 > 默认值）
  // 支持新的 systemCommands 结构，同时向后兼容旧的扁平结构
  const config: ColynConfig = {
    npm: process.env.COLYN_NPM ||
         projectConfig.systemCommands?.npm ||
         projectConfig.npm ||
         userConfig.systemCommands?.npm ||
         userConfig.npm ||
         DEFAULT_CONFIG.npm,
    lang: process.env.COLYN_LANG || projectConfig.lang || userConfig.lang || DEFAULT_CONFIG.lang
  };

  // 缓存配置
  cachedConfig = config;
  cachedConfigDir = configDir ?? null;

  return config;
}

/**
 * 获取包管理器命令
 * @param configDir .colyn 目录路径（可选）
 */
export async function getNpmCommand(configDir?: string): Promise<string> {
  const config = await getConfig(configDir);
  return config.npm;
}

/**
 * 获取语言配置
 * @param configDir .colyn 目录路径（可选）
 */
export async function getLang(configDir?: string): Promise<string> {
  const config = await getConfig(configDir);
  return config.lang;
}

/**
 * 获取运行脚本的命令
 * 例如：如果 npm='yarn'，返回 'yarn'；如果 npm='npm'，返回 'npm run'
 * @param configDir .colyn 目录路径（可选）
 */
export async function getRunCommand(configDir?: string): Promise<string> {
  const npm = await getNpmCommand(configDir);

  // npm 需要加 'run'，yarn 和 pnpm 不需要
  if (npm === 'npm') {
    return 'npm run';
  }

  return npm;
}

/**
 * 清除配置缓存
 * 用于测试或配置更新后
 */
export function clearConfigCache(): void {
  cachedConfig = null;
  cachedConfigDir = null;
}

/**
 * 保存配置到文件
 * @param configDir .colyn 目录路径
 * @param updates 要更新的配置项
 */
export async function saveConfig(
  configDir: string,
  updates: Partial<ColynConfig>
): Promise<void> {
  const configPath = path.join(configDir, 'settings.json');

  // 读取现有配置
  const existingConfig = await readConfigFile(configDir);

  // 合并配置
  const newConfig: ConfigFile = {
    ...existingConfig,
    ...updates
  };

  // 写入文件
  await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2) + '\n', 'utf-8');

  // 清除缓存
  clearConfigCache();
}
