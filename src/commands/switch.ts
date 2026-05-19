import { Command } from 'commander';
import path from 'path';
import * as fsp from 'fs/promises';
import os from 'os';
import { t } from '../i18n/index.js';
import { getProjectPaths } from '../core/paths.js';
import { discoverWorktrees, getMainBranch } from '../core/discovery.js';
import { outputResult, outputError } from '../utils/logger.js';

/**
 * 解析数字字符串到 worktree ID。
 * 调用方已确保入参是纯数字（来自 cli-preprocess 或 commander 校验）。
 */
function parseWorktreeId(numberArg: string): number {
  return parseInt(numberArg, 10);
}

/**
 * 计算给定 worktree ID 的绝对路径。0 → mainDir，否则 → worktreesDir/task-N
 */
function resolveTargetDir(
  id: number,
  paths: { mainDir: string; worktreesDir: string }
): string {
  if (id === 0) return paths.mainDir;
  return path.join(paths.worktreesDir, `task-${id}`);
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const s = await fsp.stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

/**
 * 计算用于显示的相对路径（家目录替换为 ~）。
 */
function toDisplayPath(absPath: string): string {
  const home = os.homedir();
  if (absPath === home) return '~';
  if (absPath.startsWith(home + path.sep)) {
    return '~' + absPath.slice(home.length);
  }
  return absPath;
}

/**
 * 输出可用 worktree 列表到 stderr。
 */
async function printAvailableWorktrees(paths: {
  mainDir: string;
  worktreesDir: string;
}): Promise<void> {
  const [worktrees, mainBranch] = await Promise.all([
    discoverWorktrees(paths.mainDir, paths.worktreesDir),
    getMainBranch(paths.mainDir).catch(() => 'main'),
  ]);

  process.stderr.write(t('commands.switch.availableWorktrees') + '\n');
  const mainLabel = t('commands.switch.mainDirLabel');
  process.stderr.write(`   0  main         ${mainBranch}  (${mainLabel})\n`);
  for (const w of worktrees.sort((a, b) => a.id - b.id)) {
    const idStr = String(w.id).padStart(2);
    const dirName = `task-${w.id}`.padEnd(12);
    process.stderr.write(`  ${idStr}  ${dirName} ${w.branch}\n`);
  }
}

export async function handleSwitch(numberArg: string): Promise<void> {
  let paths: Awaited<ReturnType<typeof getProjectPaths>>;
  try {
    paths = await getProjectPaths();
  } catch {
    outputError(t('commands.switch.notInProject'));
    process.exit(1);
  }

  const id = parseWorktreeId(numberArg);
  const target = resolveTargetDir(id, paths);

  if (!(await dirExists(target))) {
    if (id === 0) {
      outputError(t('commands.switch.mainDirNotFound'));
    } else {
      outputError(t('commands.switch.worktreeNotExists', { n: id }));
    }
    await printAvailableWorktrees(paths);
    process.exit(1);
  }

  const displayPath = toDisplayPath(target);

  // cd 模式（tmux 决策在下一个 Task 引入）
  outputResult({
    success: true,
    targetDir: target,
    displayPath,
  });
}

export function register(program: Command): void {
  program
    .command('switch <number>', { hidden: true })
    .description(t('commands.switch.description'))
    .action(async (numberArg: string) => {
      await handleSwitch(numberArg);
    });
}
