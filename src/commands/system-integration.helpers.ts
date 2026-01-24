/**
 * Install 命令辅助函数
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

/**
 * Shell 配置信息
 */
export interface ShellConfig {
  shellType: string;      // shell 类型（bash/zsh）
  configPath: string;     // 配置文件路径
  configExists: boolean;  // 配置文件是否存在
}

/**
 * 检测用户的 shell 类型和配置文件
 */
export async function detectShellConfig(): Promise<ShellConfig> {
  const homeDir = os.homedir();
  const shell = process.env.SHELL || '';

  let shellType = 'bash';
  const candidates: string[] = [];

  // 根据 SHELL 环境变量确定类型和候选文件
  if (shell.includes('zsh')) {
    shellType = 'zsh';
    candidates.push(path.join(homeDir, '.zshrc'));
  } else if (shell.includes('bash')) {
    shellType = 'bash';
    candidates.push(path.join(homeDir, '.bashrc'));
    candidates.push(path.join(homeDir, '.bash_profile'));
  }

  // 添加默认候选文件
  if (!candidates.includes(path.join(homeDir, '.zshrc'))) {
    candidates.push(path.join(homeDir, '.zshrc'));
  }
  if (!candidates.includes(path.join(homeDir, '.bashrc'))) {
    candidates.push(path.join(homeDir, '.bashrc'));
  }

  // 检测第一个存在的配置文件
  for (const configPath of candidates) {
    try {
      await fs.access(configPath);
      return {
        shellType,
        configPath,
        configExists: true
      };
    } catch {
      // 文件不存在，继续检查下一个
    }
  }

  // 如果都不存在，返回第一个候选文件（稍后会创建）
  return {
    shellType,
    configPath: candidates[0],
    configExists: false
  };
}

/**
 * 获取 colyn.sh 的绝对路径
 */
export function getColynShellPath(): string {
  // 获取当前模块的路径
  const currentModulePath = fileURLToPath(import.meta.url);

  // 从 dist/commands/install.helpers.js 向上找到项目根目录
  // dist/commands/install.helpers.js -> dist/commands -> dist -> root
  const distDir = path.dirname(path.dirname(currentModulePath));
  const rootDir = path.dirname(distDir);

  // colyn.sh 位于 shell/colyn.sh
  const colynShellPath = path.join(rootDir, 'shell', 'colyn.sh');

  return colynShellPath;
}

/**
 * 配置标记
 */
const CONFIG_MARKER = '# Colyn shell integration';

/**
 * 添加或更新 shell 配置文件中的 colyn 集成
 *
 * @param configPath - shell 配置文件路径
 * @param colynShellPath - colyn.sh 文件路径
 * @returns 'added' | 'updated' - 添加还是更新
 */
export async function updateShellConfig(
  configPath: string,
  colynShellPath: string
): Promise<'added' | 'updated'> {
  const sourceLine = `source "${colynShellPath}"`;

  let content = '';
  let fileExists = true;

  try {
    content = await fs.readFile(configPath, 'utf-8');
  } catch {
    // 文件不存在，创建新文件
    fileExists = false;
  }

  // 检查是否已经添加过配置
  if (content.includes(CONFIG_MARKER)) {
    // 已存在，更新路径
    const lines = content.split('\n');
    const newLines = lines.map(line => {
      // 查找以 source 开头且包含 colyn 的行
      if (line.trim().startsWith('source') && line.includes('colyn.sh')) {
        return sourceLine;
      }
      return line;
    });

    await fs.writeFile(configPath, newLines.join('\n'), 'utf-8');
    return 'updated';
  }

  // 添加新配置
  const configBlock = fileExists
    ? `\n\n${CONFIG_MARKER}\n${sourceLine}\n`
    : `${CONFIG_MARKER}\n${sourceLine}\n`;

  const newContent = content.trimEnd() + configBlock;
  await fs.writeFile(configPath, newContent, 'utf-8');

  return 'added';
}

/**
 * 检查 colyn.sh 文件是否存在
 */
export async function checkColynShellExists(colynShellPath: string): Promise<boolean> {
  try {
    await fs.access(colynShellPath);
    return true;
  } catch {
    return false;
  }
}
