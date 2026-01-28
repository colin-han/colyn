/**
 * Dev Server 检测模块
 *
 * 检测项目的开发服务器配置并提供启动命令
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getRunCommand } from './config.js';

/**
 * Dev Server 信息
 */
export interface DevServerInfo {
  /** 是否检测到 dev 命令 */
  hasDevCommand: boolean;
  /** 启动命令（如果检测到） */
  command?: string;
}

/**
 * 检测 dev server 信息
 * @param projectDir 项目目录
 * @param configDir .colyn 配置目录（可选，用于读取 npm 命令配置）
 * @returns Dev server 信息
 */
export async function detectDevServer(
  projectDir: string,
  configDir?: string
): Promise<DevServerInfo> {
  try {
    // 读取 package.json
    const packageJsonPath = path.join(projectDir, 'package.json');
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content);

    // 检查是否有 dev 脚本
    const devScript = packageJson.scripts?.dev;

    if (devScript) {
      // 获取运行命令
      const runCommand = await getRunCommand(configDir);
      const command = `${runCommand} dev`;

      return {
        hasDevCommand: true,
        command
      };
    }

    // 没有 dev 脚本
    return {
      hasDevCommand: false
    };
  } catch {
    // package.json 不存在或无法解析
    return {
      hasDevCommand: false
    };
  }
}

/**
 * 获取 dev server 启动命令
 * @param projectDir 项目目录
 * @param configDir .colyn 配置目录（可选）
 * @returns 启动命令，如果没有 dev 脚本返回 undefined
 */
export async function getDevServerCommand(
  projectDir: string,
  configDir?: string
): Promise<string | undefined> {
  const info = await detectDevServer(projectDir, configDir);
  return info.command;
}
