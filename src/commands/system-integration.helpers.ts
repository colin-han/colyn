/**
 * Install 命令辅助函数
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { generateZshCompletionScript } from './completion.js';

/**
 * Claude Code settings.json 中 hooks 的类型定义
 */
interface ClaudeHookEntry {
  type: 'command';
  command: string;
}

interface ClaudeHookConfig {
  matcher?: string;
  hooks: ClaudeHookEntry[];
}

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

/**
 * 获取 colyn 二进制文件的绝对路径
 */
export function getColynBinPath(): string {
  const currentModulePath = fileURLToPath(import.meta.url);
  const distDir = path.dirname(path.dirname(currentModulePath));
  const rootDir = path.dirname(distDir);
  return path.join(rootDir, 'bin', 'colyn');
}

/**
 * 在 hooks 数组中查找并更新包含 marker 的命令，返回是否找到
 */
function findAndUpdateHook(
  configs: ClaudeHookConfig[],
  marker: string,
  newCommand: string
): boolean {
  for (const config of configs) {
    const hook = config.hooks.find(h => h.command.includes(marker));
    if (hook) {
      hook.command = newCommand;
      return true;
    }
  }
  return false;
}

/**
 * 在指定事件下添加或更新 hook（无 matcher）
 * 返回 true 表示新增，false 表示更新
 */
function addOrUpdateSimpleHook(
  hooksRecord: Record<string, ClaudeHookConfig[]>,
  event: string,
  command: string,
  marker: string
): boolean {
  if (!hooksRecord[event]) {
    hooksRecord[event] = [];
  }
  const configs = hooksRecord[event];

  if (findAndUpdateHook(configs, marker, command)) {
    return false;
  }

  const configWithoutMatcher = configs.find(c => !c.matcher);
  if (configWithoutMatcher) {
    configWithoutMatcher.hooks.push({ type: 'command', command });
  } else {
    configs.push({ hooks: [{ type: 'command', command }] });
  }
  return true;
}

/**
 * 在 PreToolUse 事件的 AskUserQuestion matcher 下添加或更新 hook
 * 返回 true 表示新增，false 表示更新
 */
function addOrUpdatePreToolUseHook(
  hooksRecord: Record<string, ClaudeHookConfig[]>,
  command: string,
  marker: string
): boolean {
  if (!hooksRecord['PreToolUse']) {
    hooksRecord['PreToolUse'] = [];
  }
  const configs = hooksRecord['PreToolUse'];

  if (findAndUpdateHook(configs, marker, command)) {
    return false;
  }

  const matcherConfig = configs.find(c => c.matcher === 'AskUserQuestion');
  if (matcherConfig) {
    matcherConfig.hooks.push({ type: 'command', command });
  } else {
    configs.push({ matcher: 'AskUserQuestion', hooks: [{ type: 'command', command }] });
  }
  return true;
}

/**
 * 在 ~/.claude/settings.json 中添加或更新 colyn status hooks
 *
 * 配置三个 hooks：
 * - UserPromptSubmit: colyn status set running
 * - PreToolUse (AskUserQuestion): colyn status set waiting-confirm
 * - Stop: colyn status set finish
 *
 * @param colynBinPath - colyn 二进制文件的绝对路径
 * @returns 'added' | 'updated'
 */
export async function updateClaudeHooks(colynBinPath: string): Promise<'added' | 'updated'> {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

  let rawSettings: Record<string, unknown> = {};
  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      rawSettings = parsed as Record<string, unknown>;
    }
  } catch {
    // 文件不存在或 JSON 无效，从空配置开始
  }

  const rawHooks = rawSettings['hooks'];
  const hooksRecord: Record<string, ClaudeHookConfig[]> =
    rawHooks && typeof rawHooks === 'object' && !Array.isArray(rawHooks)
      ? (rawHooks as Record<string, ClaudeHookConfig[]>)
      : {};

  const makeCommand = (status: string): string =>
    `${colynBinPath} status set ${status} 2>/dev/null || true`;

  const runningAdded = addOrUpdateSimpleHook(
    hooksRecord,
    'UserPromptSubmit',
    makeCommand('running'),
    'status set running'
  );
  const waitingAdded = addOrUpdatePreToolUseHook(
    hooksRecord,
    makeCommand('waiting-confirm'),
    'status set waiting-confirm'
  );
  const finishAdded = addOrUpdateSimpleHook(
    hooksRecord,
    'Stop',
    makeCommand('finish'),
    'status set finish'
  );

  const newSettings: Record<string, unknown> = { ...rawSettings, hooks: hooksRecord };

  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(newSettings, null, 2) + '\n', 'utf-8');

  return runningAdded || waitingAdded || finishAdded ? 'added' : 'updated';
}

/**
 * 获取补全脚本的缓存路径
 */
export function getCachedCompletionPath(shellType: string): string {
  const homeDir = os.homedir();
  const ext = shellType === 'zsh' ? 'zsh' : 'bash';
  return path.join(homeDir, '.config', 'colyn', `completion.${ext}`);
}

/**
 * 为 zsh 生成动态补全脚本并缓存到 ~/.config/colyn/completion.zsh
 * 为 bash 返回静态脚本路径
 *
 * @returns 缓存文件路径（供 shell config source）
 */
export async function generateAndCacheCompletionScript(shellType: string): Promise<string> {
  const cachedPath = getCachedCompletionPath(shellType);

  if (shellType === 'zsh') {
    // zsh: 动态生成带 i18n 的补全脚本并缓存
    const script = generateZshCompletionScript();
    const cacheDir = path.dirname(cachedPath);
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(cachedPath, script, 'utf-8');
    return cachedPath;
  }

  // bash: 使用静态文件
  const staticPath = getCompletionScriptPath(shellType);
  return staticPath;
}
