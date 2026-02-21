/**
 * Xcode 内置工具链插件
 *
 * 支持 Apple 平台原生应用（iOS / macOS / tvOS / watchOS）项目。
 * 通过检测 .xcworkspace / .xcodeproj / Package.swift 识别项目类型。
 *
 * 特殊机制：通过 repairSettings 在 colyn init / colyn repair 时交互式
 * 询问 scheme 和 destination，保存到 pluginSettings.xcode，供 build 命令使用。
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import Enquirer from 'enquirer';
const { prompt } = Enquirer;
import {
  type ToolchainPlugin,
  type RepairSettingsContext,
  PluginCommandError,
} from '../../types/plugin.js';
import { extractOutput } from '../utils.js';
import { loadProjectConfig } from '../../core/config-loader.js';
import { findProjectRoot } from '../../core/paths.js';
import { outputInfo } from '../../utils/logger.js';
import { t } from '../../i18n/index.js';

// ════════════════════════════════════════════
// 内部类型
// ════════════════════════════════════════════

interface XcodeProject {
  /** real .xcworkspace 文件名（如 'MyApp.xcworkspace'），排除 project.xcworkspace */
  workspace: string | undefined;
  /** .xcodeproj 文件名（如 'MyApp.xcodeproj'） */
  project: string | undefined;
  /** 是否有 Package.swift */
  hasSPM: boolean;
}

// ════════════════════════════════════════════
// 辅助函数
// ════════════════════════════════════════════

/**
 * 扫描目录，找到 xcworkspace / xcodeproj / Package.swift
 */
async function findXcodeProject(worktreePath: string): Promise<XcodeProject> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(worktreePath);
  } catch {
    return { workspace: undefined, project: undefined, hasSPM: false };
  }

  // 真实的 xcworkspace（排除 xcodeproj 内部自动生成的 project.xcworkspace）
  const workspace = entries.find(
    e => e.endsWith('.xcworkspace') && e !== 'project.xcworkspace'
  );

  // xcodeproj
  const project = entries.find(e => e.endsWith('.xcodeproj'));

  // Package.swift
  const hasSPM = entries.includes('Package.swift');

  return { workspace, project, hasSPM };
}

/**
 * 从 xcodeproj 中找到所有 shared scheme 名称
 */
async function findSharedSchemes(worktreePath: string, projectFile: string): Promise<string[]> {
  const schemesDir = path.join(worktreePath, projectFile, 'xcshareddata', 'xcschemes');
  try {
    const entries = await fs.readdir(schemesDir);
    return entries
      .filter(e => e.endsWith('.xcscheme'))
      .map(e => e.replace(/\.xcscheme$/, ''))
      .sort();
  } catch {
    return [];
  }
}

/**
 * 从 project.pbxproj 推断目标平台（通过 SDKROOT）
 * 返回 xcodebuild -destination 参数字符串，或 null（无法推断）
 */
async function inferDestination(worktreePath: string, projectFile: string): Promise<string | null> {
  const pbxprojPath = path.join(worktreePath, projectFile, 'project.pbxproj');
  try {
    const content = await fs.readFile(pbxprojPath, 'utf-8');

    // 统计 SDKROOT 各取值的出现次数
    const counts: Record<string, number> = {};
    const matches = content.matchAll(/SDKROOT\s*=\s*([^;]+);/g);
    for (const match of matches) {
      const sdk = match[1].trim().toLowerCase();
      counts[sdk] = (counts[sdk] ?? 0) + 1;
    }

    // 找出出现次数最多的 SDKROOT
    let maxCount = 0;
    let dominantSDK = '';
    for (const [sdk, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        dominantSDK = sdk;
      }
    }

    if (!dominantSDK) return null;

    if (dominantSDK.includes('iphoneos')) return 'generic/platform=iOS Simulator';
    if (dominantSDK.includes('macosx')) return 'platform=macOS';
    if (dominantSDK.includes('appletvos')) return 'generic/platform=tvOS Simulator';
    if (dominantSDK.includes('watchos')) return 'generic/platform=watchOS Simulator';

    return null;
  } catch {
    return null;
  }
}

/**
 * 从 xcworkspace 名称派生对应的 xcodeproj 名称
 * 例如：'MyApp.xcworkspace' → 'MyApp.xcodeproj'
 */
function deriveProjectFromWorkspace(workspace: string): string {
  return workspace.replace(/\.xcworkspace$/, '.xcodeproj');
}

// ════════════════════════════════════════════
// 插件定义
// ════════════════════════════════════════════

export const xcodePlugin: ToolchainPlugin = {
  name: 'xcode',
  displayName: 'Xcode (Apple platforms)',

  // ────────────────────────────────────────
  // 检测
  // ────────────────────────────────────────

  async detect(worktreePath: string): Promise<boolean> {
    const xcProject = await findXcodeProject(worktreePath);
    return !!(xcProject.workspace ?? xcProject.project ?? xcProject.hasSPM);
  },

  // ────────────────────────────────────────
  // 端口配置（原生 App 无需端口）
  // ────────────────────────────────────────

  portConfig(): null {
    return null;
  },

  // ────────────────────────────────────────
  // 运行时配置文件名（Xcode 无标准运行时配置文件）
  // ────────────────────────────────────────

  getRuntimeConfigFileName(): null {
    return null;
  },

  // ────────────────────────────────────────
  // 插件专属配置修复（核心功能：交互式收集 scheme/destination）
  // ────────────────────────────────────────

  async repairSettings(context: RepairSettingsContext): Promise<Record<string, unknown>> {
    const { worktreePath, currentSettings, nonInteractive } = context;

    // 以当前已保存配置为基础（幂等）
    const result: Record<string, unknown> = { ...currentSettings };

    // 扫描项目文件
    const xcProject = await findXcodeProject(worktreePath);

    if (!xcProject.workspace && !xcProject.project && !xcProject.hasSPM) {
      // 没有找到任何 Xcode 项目文件，不修改配置
      return result;
    }

    // 更新 workspace / project 引用（保持与项目实际状态一致）
    if (xcProject.workspace) {
      result.workspace = xcProject.workspace;
    } else {
      delete result.workspace;
    }
    if (xcProject.project) {
      result.project = xcProject.project;
    } else if (!xcProject.workspace) {
      delete result.project;
    }

    // 纯 SPM 项目（无 xcodeproj），不需要 scheme 配置
    if (!xcProject.project && !xcProject.workspace) {
      return result;
    }

    // 确定用于查找 scheme 的 xcodeproj 路径
    const projectFile =
      xcProject.project ??
      (xcProject.workspace ? deriveProjectFromWorkspace(xcProject.workspace) : undefined);

    if (!projectFile) return result;

    // ── 处理 scheme ──────────────────────────────────

    const schemes = await findSharedSchemes(worktreePath, projectFile);

    // 检查当前 scheme 是否仍然有效
    const currentScheme = typeof result.scheme === 'string' ? result.scheme : undefined;
    const schemeStillValid =
      currentScheme !== undefined &&
      (schemes.length === 0 || schemes.includes(currentScheme));

    if (!schemeStillValid) {
      if (schemes.length === 1) {
        // 只有一个 scheme，自动选择
        result.scheme = schemes[0];
        if (!nonInteractive) {
          outputInfo(t('plugins.xcode.autoSelectedScheme', { scheme: schemes[0] }));
        }
      } else if (schemes.length > 1) {
        // 多个 scheme，让用户选择
        if (nonInteractive) {
          result.scheme = schemes[0];
        } else {
          const response = await prompt<{ scheme: string }>({
            type: 'select',
            name: 'scheme',
            message: t('plugins.xcode.selectScheme'),
            choices: schemes,
            stdout: process.stderr,
          });
          result.scheme = response.scheme;
        }
      } else {
        // 没有 shared scheme，让用户手动输入
        if (nonInteractive) {
          delete result.scheme;
        } else {
          outputInfo(t('plugins.xcode.noSharedSchemes'));
          const response = await prompt<{ scheme: string }>({
            type: 'input',
            name: 'scheme',
            message: t('plugins.xcode.inputScheme'),
            stdout: process.stderr,
          });
          const schemeInput = response.scheme.trim();
          if (schemeInput) {
            result.scheme = schemeInput;
          } else {
            delete result.scheme;
          }
        }
      }
    }

    // ── 处理 destination ─────────────────────────────

    if (!result.destination) {
      const inferred = await inferDestination(worktreePath, projectFile);
      if (inferred) {
        result.destination = inferred;
        if (!nonInteractive) {
          outputInfo(t('plugins.xcode.inferredDestination', { destination: inferred }));
        }
      } else if (!nonInteractive) {
        // 无法推断，让用户选择
        const destChoices = [
          'generic/platform=iOS Simulator',
          'generic/platform=iOS',
          'platform=macOS',
          'generic/platform=tvOS Simulator',
          'generic/platform=watchOS Simulator',
        ];
        const response = await prompt<{ destination: string }>({
          type: 'select',
          name: 'destination',
          message: t('plugins.xcode.selectDestination'),
          choices: destChoices,
          stdout: process.stderr,
        });
        result.destination = response.destination;
      }
    }

    return result;
  },

  // ────────────────────────────────────────
  // 安装依赖
  // ────────────────────────────────────────

  async install(worktreePath: string): Promise<void> {
    const hasPodfile = fsSync.existsSync(path.join(worktreePath, 'Podfile'));
    const hasPackageSwift = fsSync.existsSync(path.join(worktreePath, 'Package.swift'));

    if (hasPodfile) {
      try {
        execSync('pod install', {
          cwd: worktreePath,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        const output = extractOutput(error);
        throw new PluginCommandError('pod install failed', output);
      }
    } else if (hasPackageSwift) {
      try {
        execSync('swift package resolve', {
          cwd: worktreePath,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        const output = extractOutput(error);
        throw new PluginCommandError('swift package resolve failed', output);
      }
    }
    // 两者都没有：静默跳过
  },

  // ────────────────────────────────────────
  // 代码质量检查（SwiftLint）
  // ────────────────────────────────────────

  async lint(worktreePath: string): Promise<void> {
    const hasLintConfig =
      fsSync.existsSync(path.join(worktreePath, '.swiftlint.yml')) ||
      fsSync.existsSync(path.join(worktreePath, '.swiftlint.yaml'));

    if (!hasLintConfig) return; // 无 swiftlint 配置，静默跳过

    // 检查 swiftlint 是否已安装
    try {
      execSync('which swiftlint', { stdio: 'ignore' });
    } catch {
      return; // swiftlint 未安装，静默跳过
    }

    try {
      execSync('swiftlint lint', {
        cwd: worktreePath,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const output = extractOutput(error);
      throw new PluginCommandError('swiftlint lint failed', output);
    }
  },

  // ────────────────────────────────────────
  // 构建（从 pluginSettings.xcode 读取参数）
  // ────────────────────────────────────────

  async build(worktreePath: string): Promise<void> {
    // 从 settings.json 读取插件配置
    let projectRoot: string;
    try {
      projectRoot = await findProjectRoot(worktreePath);
    } catch {
      return; // 找不到项目根目录，静默跳过
    }

    const settings = await loadProjectConfig(projectRoot);
    const xcodeSettings = (settings?.pluginSettings?.['xcode'] ?? {}) as Record<string, string>;

    const scheme = xcodeSettings.scheme;
    const destination = xcodeSettings.destination ?? 'generic/platform=iOS Simulator';
    const workspace = xcodeSettings.workspace;
    const project = xcodeSettings.project;

    if (!scheme) {
      // 没有配置 scheme：如果是纯 SPM 则使用 swift build，否则静默跳过
      const xcProject = await findXcodeProject(worktreePath);
      if (xcProject.hasSPM && !xcProject.project && !xcProject.workspace) {
        // 纯 SPM 项目
        try {
          execSync('swift build', {
            cwd: worktreePath,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
        } catch (error) {
          const output = extractOutput(error);
          throw new PluginCommandError('swift build failed', output);
        }
      }
      // 有 xcodeproj 但未配置 scheme：静默跳过
      return;
    }

    // 使用 xcodebuild
    let cmd: string;
    if (workspace) {
      cmd = `xcodebuild -workspace "${workspace}" -scheme "${scheme}" -destination "${destination}" build`;
    } else if (project) {
      cmd = `xcodebuild -project "${project}" -scheme "${scheme}" -destination "${destination}" build`;
    } else {
      // scheme 已配置但找不到 workspace/project 文件，静默跳过
      return;
    }

    try {
      execSync(cmd, {
        cwd: worktreePath,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const output = extractOutput(error);
      throw new PluginCommandError('xcodebuild failed', output);
    }
  },

  // ────────────────────────────────────────
  // 更新版本号（agvtool 优先，fallback 修改 project.pbxproj）
  // ────────────────────────────────────────

  async bumpVersion(worktreePath: string, version: string): Promise<void> {
    // 优先使用 agvtool（Apple 官方工具，需要 VERSIONING_SYSTEM = apple-generic）
    try {
      execSync(`agvtool new-marketing-version ${version}`, {
        cwd: worktreePath,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return; // 成功
    } catch {
      // agvtool 失败（未安装或项目未配置 VERSIONING_SYSTEM），尝试 fallback
    }

    // Fallback：直接修改 project.pbxproj 中的 MARKETING_VERSION
    const xcProject = await findXcodeProject(worktreePath);
    const projectFile = xcProject.project;

    if (!projectFile) {
      throw new PluginCommandError(
        'Cannot bump Xcode version: no .xcodeproj found',
        'No .xcodeproj directory found. Please ensure the project has a .xcodeproj file.'
      );
    }

    const pbxprojPath = path.join(worktreePath, projectFile, 'project.pbxproj');

    let content: string;
    try {
      content = await fs.readFile(pbxprojPath, 'utf-8');
    } catch (error) {
      const output = extractOutput(error);
      throw new PluginCommandError('Cannot read project.pbxproj', output);
    }

    const updated = content.replace(
      /MARKETING_VERSION\s*=\s*[^;]+;/g,
      `MARKETING_VERSION = ${version};`
    );

    if (updated === content) {
      throw new PluginCommandError(
        'Cannot bump Xcode version: MARKETING_VERSION not found in project.pbxproj',
        `${pbxprojPath} does not contain MARKETING_VERSION.\n` +
          'Please set VERSIONING_SYSTEM = apple-generic in Xcode Build Settings, or use agvtool.'
      );
    }

    try {
      await fs.writeFile(pbxprojPath, updated, 'utf-8');
    } catch (error) {
      const output = extractOutput(error);
      throw new PluginCommandError('Failed to write project.pbxproj', output);
    }
  },
};
