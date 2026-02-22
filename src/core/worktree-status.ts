import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

export type WorktreeStatus = 'idle' | 'running' | 'waiting-confirm' | 'finish';

export const VALID_STATUSES: WorktreeStatus[] = ['idle', 'running', 'waiting-confirm', 'finish'];

// ─── 项目级 status.json ────────────────────────────────────────────────────

interface WorktreeEntry {
  status: WorktreeStatus;
  updatedAt: string;
}

interface ProjectStatusFile {
  updatedAt: string;
  worktrees: Record<string, WorktreeEntry>;
}

async function readProjectStatusFile(configDir: string): Promise<ProjectStatusFile> {
  const filePath = path.join(configDir, 'status.json');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as ProjectStatusFile;
  } catch {
    return { updatedAt: new Date(0).toISOString(), worktrees: {} };
  }
}

async function writeProjectStatusFile(configDir: string, data: ProjectStatusFile): Promise<void> {
  await fs.mkdir(configDir, { recursive: true });
  const filePath = path.join(configDir, 'status.json');
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

// ─── 全局 ~/.colyn-status.json ─────────────────────────────────────────────

interface GlobalStatusFile {
  [projectPath: string]: { updatedAt: string };
}

async function readGlobalStatusFile(): Promise<GlobalStatusFile> {
  const filePath = path.join(os.homedir(), '.colyn-status.json');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as GlobalStatusFile;
  } catch {
    return {};
  }
}

async function writeGlobalStatusFile(data: GlobalStatusFile): Promise<void> {
  const filePath = path.join(os.homedir(), '.colyn-status.json');
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

// ─── 公开 API ──────────────────────────────────────────────────────────────

/**
 * 获取指定 worktree 的状态
 * @param configDir  .colyn 目录路径
 * @param worktreeDir  worktree 目录名（主分支用 "main"）
 */
export async function getWorktreeStatus(
  configDir: string,
  worktreeDir: string
): Promise<{ status: WorktreeStatus; updatedAt: string | null }> {
  const data = await readProjectStatusFile(configDir);
  const entry = data.worktrees[worktreeDir];
  if (!entry) {
    return { status: 'idle', updatedAt: null };
  }
  return { status: entry.status, updatedAt: entry.updatedAt };
}

/**
 * 设置指定 worktree 的状态，并同步更新全局索引
 * @param configDir    .colyn 目录路径
 * @param worktreeDir  worktree 目录名（主分支用 "main"）
 * @param projectPath  项目根目录绝对路径
 * @param status       要设置的状态值
 */
export async function setWorktreeStatus(
  configDir: string,
  worktreeDir: string,
  projectPath: string,
  status: WorktreeStatus
): Promise<void> {
  const now = new Date().toISOString();

  // 更新项目级 status.json
  const projectData = await readProjectStatusFile(configDir);
  projectData.worktrees[worktreeDir] = { status, updatedAt: now };
  projectData.updatedAt = now;
  await writeProjectStatusFile(configDir, projectData);

  // 更新全局 ~/.colyn-status.json
  const globalData = await readGlobalStatusFile();
  globalData[projectPath] = { updatedAt: now };
  await writeGlobalStatusFile(globalData);
}
