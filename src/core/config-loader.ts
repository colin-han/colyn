/**
 * 配置文件加载模块
 *
 * 支持从文件系统加载配置文件：
 * - JSON 格式（使用 JSON5 解析，支持注释）
 * - YAML 格式
 *
 * 配置文件位置：
 * - 用户级：~/.config/colyn/settings.{json|yaml|yml}
 * - 项目级：{projectRoot}/.colyn/settings.{json|yaml|yml}
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import JSON5 from 'json5';
import yaml from 'js-yaml';
import { z } from 'zod';
import { loadAndMigrateConfig } from './config-migration.js';
import type { Settings } from './config-schema.js';

/**
 * 配置文件名（按优先级排序）
 */
const CONFIG_FILENAMES = ['settings.json', 'settings.yaml', 'settings.yml'] as const;

/**
 * 配置文件目录
 */
const CONFIG_DIR = '.colyn';
const USER_CONFIG_DIR = '.config/colyn';

/**
 * 从文件加载并解析配置
 * @param filepath 配置文件路径
 * @returns 包含配置对象和是否发生迁移的信息
 * @throws Error 如果文件格式错误或验证失败
 */
async function loadConfigFile(filepath: string): Promise<{
  config: Settings;
  wasMigrated: boolean;
} | null> {
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    const ext = path.extname(filepath);

    let rawConfig: unknown;
    if (ext === '.json') {
      // 使用 JSON5 解析（支持注释和尾部逗号）
      rawConfig = JSON5.parse(content);
    } else if (ext === '.yaml' || ext === '.yml') {
      // 使用 js-yaml 解析
      rawConfig = yaml.load(content);
    } else {
      throw new Error(`不支持的配置文件格式: ${ext}`);
    }

    // 检查原始配置的版本号
    const oldVersion =
      (rawConfig as { version?: number }).version ?? 0;

    // 使用 Zod 验证和迁移配置
    let migratedConfig: Settings;
    try {
      migratedConfig = loadAndMigrateConfig(rawConfig);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors
          .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
          .join('\n');

        throw new Error(`配置文件验证失败 (${filepath}):\n${messages}`);
      }
      throw error;
    }

    // 检查是否发生了迁移
    const wasMigrated = oldVersion !== migratedConfig.version;

    return { config: migratedConfig, wasMigrated };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null; // 文件不存在
    }
    throw error;
  }
}

/**
 * 从目录加载配置（尝试多个文件名）
 * @param dir 配置目录路径
 * @returns 找到的第一个有效配置，如果都不存在则返回 null
 */
async function loadConfigFromDir(dir: string): Promise<Settings | null> {
  for (const filename of CONFIG_FILENAMES) {
    const filepath = path.join(dir, filename);
    try {
      const result = await loadConfigFile(filepath);
      if (result !== null) {
        // 如果配置发生了迁移，自动保存
        if (result.wasMigrated) {
          await saveConfigFile(filepath, result.config);
        }
        return result.config;
      }
    } catch (error) {
      // 如果是验证错误或格式错误，继续尝试下一个文件
      // 但如果是其他错误（如权限问题），应该抛出
      if (
        error instanceof Error &&
        (error.message.includes('配置文件验证失败') ||
          error.message.includes('不支持的配置文件格式'))
      ) {
        // 跳过格式错误的文件，继续尝试下一个
        continue;
      }
      // 其他错误直接抛出
      throw error;
    }
  }
  return null;
}

/**
 * 获取用户级配置目录
 * @returns 用户配置目录路径
 */
export function getUserConfigDir(): string {
  return path.join(os.homedir(), USER_CONFIG_DIR);
}

/**
 * 获取项目级配置目录
 * @param projectRoot 项目根目录
 * @returns 项目配置目录路径
 */
export function getProjectConfigDir(projectRoot: string): string {
  return path.join(projectRoot, CONFIG_DIR);
}

/**
 * 加载用户级配置
 * @returns 用户配置对象，如果不存在则返回 null
 */
export async function loadUserConfig(): Promise<Settings | null> {
  const configDir = getUserConfigDir();
  return loadConfigFromDir(configDir);
}

/**
 * 加载项目级配置
 * @param projectRoot 项目根目录
 * @returns 项目配置对象，如果不存在则返回 null
 */
export async function loadProjectConfig(projectRoot: string): Promise<Settings | null> {
  const configDir = getProjectConfigDir(projectRoot);
  return loadConfigFromDir(configDir);
}

/**
 * 保存配置到文件
 * @param filepath 配置文件路径
 * @param settings 配置对象
 */
export async function saveConfigFile(
  filepath: string,
  settings: Settings
): Promise<void> {
  const ext = path.extname(filepath);

  let content: string;
  if (ext === '.json') {
    // JSON 格式（格式化输出）
    content = JSON.stringify(settings, null, 2);
  } else if (ext === '.yaml' || ext === '.yml') {
    // YAML 格式
    content = yaml.dump(settings, {
      indent: 2,
      lineWidth: -1, // 不自动换行
    });
  } else {
    throw new Error(`不支持的配置文件格式: ${ext}`);
  }

  // 确保目录存在
  const dir = path.dirname(filepath);
  await fs.mkdir(dir, { recursive: true });

  // 写入文件
  await fs.writeFile(filepath, content, 'utf-8');
}

/**
 * 查找配置文件路径
 * @param dir 配置目录
 * @returns 找到的配置文件路径，如果不存在则返回 null
 */
export async function findConfigFilePath(dir: string): Promise<string | null> {
  for (const filename of CONFIG_FILENAMES) {
    const filepath = path.join(dir, filename);
    try {
      await fs.access(filepath);
      return filepath;
    } catch {
      continue;
    }
  }
  return null;
}
