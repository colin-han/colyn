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
 * 获取补全脚本的绝对路径
 *
 * @param shellType - shell 类型（bash/zsh）
 */
export function getCompletionScriptPath(shellType: string): string {
  // 获取当前模块的路径
  const currentModulePath = fileURLToPath(import.meta.url);

  // 从 dist/commands/install.helpers.js 向上找到项目根目录
  const distDir = path.dirname(path.dirname(currentModulePath));
  const rootDir = path.dirname(distDir);

  // 补全脚本位于 shell/completion.bash 或 shell/completion.zsh
  const scriptName = shellType === 'zsh' ? 'completion.zsh' : 'completion.bash';
  const completionPath = path.join(rootDir, 'shell', scriptName);

  return completionPath;
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
 * @param completionPath - 补全脚本文件路径（可选）
 * @returns 'added' | 'updated' - 添加还是更新
 */
export async function updateShellConfig(
  configPath: string,
  colynShellPath: string,
  completionPath?: string
): Promise<'added' | 'updated'> {
  const sourceLine = `source "${colynShellPath}"`;
  const completionLine = completionPath ? `source "${completionPath}"` : null;

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
    const newLines: string[] = [];
    let inColynSection = false;

    for (const line of lines) {
      if (line.includes(CONFIG_MARKER)) {
        inColynSection = true;
        newLines.push(line);
        continue;
      }

      if (inColynSection) {
        // 跳过旧的 source 行
        if (line.trim().startsWith('source') && line.includes('colyn')) {
          continue;
        }
        // 遇到空行或新的注释，结束 colyn 区域
        if (line.trim() === '' || (line.startsWith('#') && !line.includes('colyn'))) {
          inColynSection = false;
          // 插入新的配置
          newLines.push(sourceLine);
          if (completionLine) {
            newLines.push(completionLine);
          }
        }
      }

      newLines.push(line);
    }

    // 如果还在 colyn 区域（文件末尾），添加配置
    if (inColynSection) {
      newLines.push(sourceLine);
      if (completionLine) {
        newLines.push(completionLine);
      }
    }

    await fs.writeFile(configPath, newLines.join('\n'), 'utf-8');
    return 'updated';
  }

  // 添加新配置
  const configLines = [CONFIG_MARKER, sourceLine];
  if (completionLine) {
    configLines.push(completionLine);
  }

  const configBlock = fileExists
    ? `\n\n${configLines.join('\n')}\n`
    : `${configLines.join('\n')}\n`;

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

/**
 * 检查补全脚本文件是否存在
 */
export async function checkCompletionScriptExists(completionPath: string): Promise<boolean> {
  try {
    await fs.access(completionPath);
    return true;
  } catch {
    return false;
  }
}
