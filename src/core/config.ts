import * as fs from 'fs/promises';
import * as path from 'path';
import type { ColynConfig } from '../types/index.js';

const CONFIG_DIR = '.colyn';
const CONFIG_FILE = 'config.json';

/**
 * 加载配置文件
 */
export async function loadConfig(rootDir: string): Promise<ColynConfig> {
  const configPath = path.join(rootDir, CONFIG_DIR, CONFIG_FILE);
  const content = await fs.readFile(configPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * 保存配置文件
 */
export async function saveConfig(rootDir: string, config: ColynConfig): Promise<void> {
  const configDir = path.join(rootDir, CONFIG_DIR);
  await fs.mkdir(configDir, { recursive: true });

  const configPath = path.join(configDir, CONFIG_FILE);
  await fs.writeFile(
    configPath,
    JSON.stringify(config, null, 2),
    'utf-8'
  );
}

/**
 * 检查配置文件是否存在
 */
export async function configExists(rootDir: string): Promise<boolean> {
  const configPath = path.join(rootDir, CONFIG_DIR, CONFIG_FILE);
  try {
    await fs.access(configPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 创建默认配置
 */
export function createDefaultConfig(
  mainBranch: string,
  mainPort: number
): ColynConfig {
  return {
    version: '1.0.0',
    mainBranch,
    mainPort,
    nextWorktreeId: 1,
    worktrees: []
  };
}
