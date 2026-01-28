/**
 * Dev Server 检测模块
 *
 * 检测项目的开发服务器配置并提供启动命令
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Dev Server 信息
 */
export interface DevServerInfo {
  /** 是否检测到 dev 命令 */
  hasDevCommand: boolean;
  /** 启动命令（如果检测到） */
  command?: string;
  /** 包管理器 */
  packageManager: 'npm' | 'yarn' | 'pnpm';
}

/**
 * 检测包管理器
 * @param projectDir 项目目录
 */
async function detectPackageManager(
  projectDir: string
): Promise<'npm' | 'yarn' | 'pnpm'> {
  // 检查 lock 文件来判断包管理器
  const checks = [
    { file: 'pnpm-lock.yaml', manager: 'pnpm' as const },
    { file: 'yarn.lock', manager: 'yarn' as const },
    { file: 'package-lock.json', manager: 'npm' as const },
  ];

  for (const check of checks) {
    try {
      await fs.access(path.join(projectDir, check.file));
      return check.manager;
    } catch {
      // 文件不存在，继续检查
    }
  }

  // 默认使用 npm
  return 'npm';
}

/**
 * 检测 dev server 信息
 * @param projectDir 项目目录
 * @returns Dev server 信息
 */
export async function detectDevServer(
  projectDir: string
): Promise<DevServerInfo> {
  const packageManager = await detectPackageManager(projectDir);

  try {
    // 读取 package.json
    const packageJsonPath = path.join(projectDir, 'package.json');
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content);

    // 检查是否有 dev 脚本
    const devScript = packageJson.scripts?.dev;

    if (devScript) {
      // 根据包管理器生成启动命令
      const runCommand =
        packageManager === 'npm' ? 'npm run' : `${packageManager}`;
      const command = `${runCommand} dev`;

      return {
        hasDevCommand: true,
        command,
        packageManager,
      };
    }

    // 没有 dev 脚本
    return {
      hasDevCommand: false,
      packageManager,
    };
  } catch {
    // package.json 不存在或无法解析
    return {
      hasDevCommand: false,
      packageManager,
    };
  }
}

/**
 * 获取 dev server 启动命令
 * @param projectDir 项目目录
 * @returns 启动命令，如果没有 dev 脚本返回 undefined
 */
export async function getDevServerCommand(
  projectDir: string
): Promise<string | undefined> {
  const info = await detectDevServer(projectDir);
  return info.command;
}
