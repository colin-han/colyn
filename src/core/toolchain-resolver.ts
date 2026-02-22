/**
 * 工具链解析器
 *
 * 实现「按需发现」策略：
 * - 所有命令遇到未配置的目录时，就地触发自动识别 + 用户选择流程
 * - 支持单项目模式（根目录被某工具链匹配）
 * - 支持 Mono Repo 模式（根目录无匹配，扫描一级子目录）
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import Enquirer from 'enquirer';
const { prompt } = Enquirer;
import { pluginManager } from '../plugins/index.js';
import { loadProjectConfig, saveConfigFile, findConfigFilePath } from './config-loader.js';
import { CURRENT_CONFIG_VERSION, type ToolchainConfig, type SubProject } from './config-schema.js';
import { outputInfo } from '../utils/logger.js';
import { t } from '../i18n/index.js';

/**
 * 工具链上下文 — 表示「当前应该操作的某个子项目」
 */
export type ToolchainContext = {
  /** 子项目在当前 worktree 中的绝对路径（供 PluginManager 使用） */
  absolutePath: string;
  /** 相对于 worktree 根目录的相对路径（'.' 表示根目录） */
  subPath: string;
  /** 工具链名称（插件标识符），如 'npm'、'maven'、'xcode' */
  toolchainName: string;
  /** 工具链专属配置（来自 settings.toolchain.settings 或 projects[i].toolchain.settings） */
  toolchainSettings: Record<string, unknown>;
};

/**
 * 扫描子目录时跳过的目录名（不可能包含子项目）
 */
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'target',
  'vendor',
  'coverage',
  '.git',
  '.colyn',
  'worktrees',
]);

/**
 * 获取目录下的一级子目录（非隐藏、非跳过）
 */
async function getSubdirectories(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const subdirs: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      subdirs.push(entry.name);
    }
    return subdirs;
  } catch {
    return [];
  }
}

/**
 * 检查目录是否存在
 */
async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * 交互式选择工具链（或无工具链）
 * @param subPath 子目录路径（用于展示）
 * @param nonInteractive 非交互模式下直接返回 null
 */
async function promptForToolchain(
  subPath: string,
  nonInteractive = false
): Promise<string | null> {
  if (nonInteractive) {
    return null;
  }

  const allPlugins = pluginManager.getAllPlugins();
  const choices = [
    { name: '__none__', message: t('toolchain.noToolchain') },
    ...allPlugins.map((p) => ({ name: p.name, message: p.displayName })),
  ];

  outputInfo(t('toolchain.unrecognizedDirectory', { path: subPath }));

  const response = await prompt<{ toolchain: string }>({
    type: 'select',
    name: 'toolchain',
    message: t('toolchain.selectForDirectory', { path: subPath }),
    choices,
    stdout: process.stderr,
  });

  if (response.toolchain === '__none__') {
    return null;
  }
  return response.toolchain;
}

/**
 * 保存工具链配置到 settings 文件
 */
async function saveToolchainToSettings(
  projectRoot: string,
  toolchain: ToolchainConfig | null
): Promise<void> {
  const existing = await loadProjectConfig(projectRoot);
  const settings = existing ?? { version: CURRENT_CONFIG_VERSION };
  settings.toolchain = toolchain;
  delete settings.projects;

  const configDir = path.join(projectRoot, '.colyn');
  const settingsFilePath =
    (await findConfigFilePath(configDir)) ?? path.join(configDir, 'settings.json');
  await saveConfigFile(settingsFilePath, settings);
}

/**
 * 保存 Mono Repo 子项目列表到 settings 文件
 */
async function saveProjectsToSettings(
  projectRoot: string,
  projects: SubProject[]
): Promise<void> {
  const existing = await loadProjectConfig(projectRoot);
  const settings = existing ?? { version: CURRENT_CONFIG_VERSION };
  settings.projects = projects;
  delete settings.toolchain;

  const configDir = path.join(projectRoot, '.colyn');
  const settingsFilePath =
    (await findConfigFilePath(configDir)) ?? path.join(configDir, 'settings.json');
  await saveConfigFile(settingsFilePath, settings);
}

/**
 * 检测目录下的工具链（尝试所有已注册插件）
 * @returns 第一个匹配的插件名，或 null
 */
async function detectSingleToolchain(dirPath: string): Promise<string | null> {
  const detected = await pluginManager.detectPlugins(dirPath);
  return detected.length > 0 ? detected[0] : null;
}

/**
 * 强制重新检测并配置工具链（用于 init 命令）
 *
 * 流程：
 * 1. 检测 mainDirPath 根目录是否有工具链
 * 2. 有 → 单项目模式，保存并返回
 * 3. 无 → 扫描一级子目录，对每个子目录检测或提示用户选择
 * 4. 有子目录工具链 → Mono Repo 模式，保存并返回
 * 5. 全无 → 保存 toolchain=null，返回空数组
 */
export async function detectAndConfigureToolchains(
  projectRoot: string,
  mainDirPath: string,
  nonInteractive = false
): Promise<ToolchainContext[]> {
  // 1. 检测根目录工具链
  const rootToolchain = await detectSingleToolchain(mainDirPath);

  if (rootToolchain !== null) {
    // 单项目模式
    const toolchainConfig: ToolchainConfig = { type: rootToolchain, settings: {} };
    await saveToolchainToSettings(projectRoot, toolchainConfig);
    outputInfo(t('toolchain.singleProjectDetected', { toolchain: rootToolchain }));
    return [
      {
        absolutePath: mainDirPath,
        subPath: '.',
        toolchainName: rootToolchain,
        toolchainSettings: {},
      },
    ];
  }

  // 2. 检测一级子目录
  const subdirs = await getSubdirectories(mainDirPath);
  const projects: SubProject[] = [];
  const contexts: ToolchainContext[] = [];
  let hasAnyToolchain = false;

  for (const subDir of subdirs) {
    const subDirPath = path.join(mainDirPath, subDir);
    const detected = await detectSingleToolchain(subDirPath);

    let selectedToolchain: string | null = detected;
    if (detected === null) {
      selectedToolchain = await promptForToolchain(subDir, nonInteractive);
    }

    if (selectedToolchain !== null) {
      hasAnyToolchain = true;
      projects.push({ path: subDir, toolchain: { type: selectedToolchain, settings: {} } });
      contexts.push({
        absolutePath: subDirPath,
        subPath: subDir,
        toolchainName: selectedToolchain,
        toolchainSettings: {},
      });
    } else {
      projects.push({ path: subDir, toolchain: null });
    }
  }

  if (hasAnyToolchain) {
    // Mono Repo 模式
    await saveProjectsToSettings(projectRoot, projects);
    outputInfo(t('toolchain.monoRepoDetected', { count: contexts.length }));
    return contexts;
  }

  if (subdirs.length > 0 && !nonInteractive) {
    // 有子目录但都没有选择工具链，保存空项目列表（避免重复提示）
    await saveProjectsToSettings(projectRoot, projects);
    return [];
  }

  // 完全无工具链
  await saveToolchainToSettings(projectRoot, null);
  return [];
}

/**
 * 解析工具链上下文（用于 add/merge/release/repair 命令）
 *
 * 读取已配置的工具链，处理新发现的子目录，返回所有要操作的子项目。
 *
 * @param projectRoot 项目根目录（.colyn 的父目录）
 * @param worktreePath 当前操作的 worktree 路径（mainDir 或某个 worktree 目录）
 * @param nonInteractive 非交互模式（默认 false）
 */
export async function resolveToolchains(
  projectRoot: string,
  worktreePath: string,
  nonInteractive = false
): Promise<ToolchainContext[]> {
  const settings = await loadProjectConfig(projectRoot);

  // 情况 1：settings 中 toolchain 已明确定义（含 null）
  if (settings && settings.toolchain !== undefined) {
    if (settings.toolchain === null) {
      // 明确无工具链
      return [];
    }
    // 单项目模式
    return [
      {
        absolutePath: worktreePath,
        subPath: '.',
        toolchainName: settings.toolchain.type,
        toolchainSettings: (settings.toolchain.settings as Record<string, unknown>) ?? {},
      },
    ];
  }

  // 情况 2：settings 中 projects 已定义（Mono Repo 模式）
  if (settings && settings.projects !== undefined) {
    const contexts: ToolchainContext[] = [];
    const updatedProjects: SubProject[] = [...settings.projects];

    // 已配置的子项目
    const configuredPaths = new Set(settings.projects.map((p) => p.path));

    for (const project of settings.projects) {
      if (project.toolchain === null) continue; // 明确无工具链

      const subDirAbsPath = path.join(worktreePath, project.path);
      if (!(await directoryExists(subDirAbsPath))) {
        outputInfo(t('toolchain.subProjectSkipped', { path: project.path }));
        continue;
      }

      contexts.push({
        absolutePath: subDirAbsPath,
        subPath: project.path,
        toolchainName: project.toolchain.type,
        toolchainSettings: (project.toolchain.settings as Record<string, unknown>) ?? {},
      });
    }

    // 扫描 worktreePath 中新增的子目录（settings 中未记录）
    const subdirs = await getSubdirectories(worktreePath);
    let hasNewDiscoveries = false;

    for (const subDir of subdirs) {
      if (configuredPaths.has(subDir)) continue;

      const subDirPath = path.join(worktreePath, subDir);
      const detected = await detectSingleToolchain(subDirPath);
      let selectedToolchain: string | null = detected;

      if (detected === null) {
        selectedToolchain = await promptForToolchain(subDir, nonInteractive);
      }

      updatedProjects.push({ path: subDir, toolchain: selectedToolchain !== null ? { type: selectedToolchain, settings: {} } : null });
      hasNewDiscoveries = true;

      if (selectedToolchain !== null) {
        contexts.push({
          absolutePath: subDirPath,
          subPath: subDir,
          toolchainName: selectedToolchain,
          toolchainSettings: {},
        });
      }
    }

    if (hasNewDiscoveries) {
      await saveProjectsToSettings(projectRoot, updatedProjects);
    }

    return contexts;
  }

  // 情况 3：settings 中两者都未定义（尚未检测）→ 触发按需发现
  // 检测根目录
  const rootToolchain = await detectSingleToolchain(worktreePath);

  if (rootToolchain !== null) {
    // 单项目模式
    const toolchainConfig: ToolchainConfig = { type: rootToolchain, settings: {} };
    await saveToolchainToSettings(projectRoot, toolchainConfig);
    return [
      {
        absolutePath: worktreePath,
        subPath: '.',
        toolchainName: rootToolchain,
        toolchainSettings: {},
      },
    ];
  }

  // 扫描子目录
  const subdirs = await getSubdirectories(worktreePath);
  const projects: SubProject[] = [];
  const contexts: ToolchainContext[] = [];
  let hasAnyToolchain = false;

  for (const subDir of subdirs) {
    const subDirPath = path.join(worktreePath, subDir);
    const detected = await detectSingleToolchain(subDirPath);

    let selectedToolchain: string | null = detected;
    if (detected === null) {
      selectedToolchain = await promptForToolchain(subDir, nonInteractive);
    }

    if (selectedToolchain !== null) {
      hasAnyToolchain = true;
      projects.push({ path: subDir, toolchain: { type: selectedToolchain, settings: {} } });
      contexts.push({
        absolutePath: subDirPath,
        subPath: subDir,
        toolchainName: selectedToolchain,
        toolchainSettings: {},
      });
    } else {
      projects.push({ path: subDir, toolchain: null });
    }
  }

  if (hasAnyToolchain) {
    await saveProjectsToSettings(projectRoot, projects);
    return contexts;
  }

  if (subdirs.length > 0 && !nonInteractive) {
    await saveProjectsToSettings(projectRoot, projects);
    return [];
  }

  // 完全无工具链
  await saveToolchainToSettings(projectRoot, null);
  return [];
}

/**
 * 保存 repairSettings 的结果回 settings 文件
 *
 * @param projectRoot 项目根目录
 * @param subPath 子项目路径（'.' 表示单项目根目录）
 * @param updatedToolchainSettings 更新后的工具链专属配置
 */
export async function saveRepairSettingsResult(
  projectRoot: string,
  subPath: string,
  updatedToolchainSettings: Record<string, unknown>
): Promise<void> {
  const settings = await loadProjectConfig(projectRoot);
  if (!settings) return;

  if (subPath === '.') {
    // 单项目模式：更新 settings.toolchain.settings
    if (settings.toolchain && settings.toolchain !== null) {
      settings.toolchain = {
        ...settings.toolchain,
        settings: updatedToolchainSettings,
      };
    }
  } else {
    // Mono Repo 模式：找到对应子项目并更新其 toolchain.settings
    if (settings.projects) {
      settings.projects = settings.projects.map((p) => {
        if (p.path === subPath && p.toolchain !== null) {
          return {
            ...p,
            toolchain: {
              ...p.toolchain,
              settings: updatedToolchainSettings,
            },
          };
        }
        return p;
      });
    }
  }

  const configDir = path.join(projectRoot, '.colyn');
  const settingsFilePath =
    (await findConfigFilePath(configDir)) ?? path.join(configDir, 'settings.json');
  await saveConfigFile(settingsFilePath, settings);
}

