import simpleGit from 'simple-git';
import { ColynError } from '../types/index.js';
import {
  outputLine,
  outputSuccess,
  outputBold,
  outputStep,
  outputInfo
} from '../utils/logger.js';
import { t } from '../i18n/index.js';
import { pluginManager } from '../plugins/index.js';
import { resolveToolchains } from '../core/toolchain-resolver.js';

/**
 * 解析后的版本号
 */
interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

/**
 * 版本类型
 */
export type VersionType = 'major' | 'minor' | 'patch';

/**
 * 验证版本号格式
 */
export function parseVersion(version: string): ParsedVersion {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new ColynError(
      t('commands.release.invalidVersion', { version }),
      t('commands.release.invalidVersionHint')
    );
  }
  return {
    major: parseInt(match[1]),
    minor: parseInt(match[2]),
    patch: parseInt(match[3])
  };
}

/**
 * 增加版本号
 * @param currentVersion 当前版本，explicit version 时可为 null
 */
export function bumpVersion(
  currentVersion: string | null,
  type: VersionType | string
): string {
  if (type === 'major' || type === 'minor' || type === 'patch') {
    if (!currentVersion) {
      return '1.0.0';
    }
    const ver = parseVersion(currentVersion);
    if (type === 'major') return `${ver.major + 1}.0.0`;
    if (type === 'minor') return `${ver.major}.${ver.minor + 1}.0`;
    return `${ver.major}.${ver.minor}.${ver.patch + 1}`;
  }
  // 直接指定版本号
  parseVersion(type); // 验证格式
  return type;
}

/**
 * 检查 git 工作区状态是否干净
 */
export async function checkGitStatus(dir: string): Promise<boolean> {
  const git = simpleGit(dir);
  const status = await git.status();

  // 检查是否有任何变更（除了 .env.local）
  const hasChanges = status.files.length > 0;
  return !hasChanges;
}

/**
 * 获取当前分支
 */
export async function getCurrentBranch(dir: string): Promise<string> {
  const git = simpleGit(dir);
  const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
  return branch.trim();
}

/**
 * 创建 git commit
 * 暂存所有已修改文件（由 bumpVersion 写入），如无变更则跳过
 * @returns true 表示已创建提交，false 表示无变更跳过
 */
export async function createCommit(
  dir: string,
  message: string
): Promise<boolean> {
  const git = simpleGit(dir);

  try {
    await git.add('.');
    const status = await git.status();
    if (status.staged.length === 0) {
      return false;
    }
    await git.commit(message);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new ColynError(
      t('commands.release.commitFailed'),
      t('commands.release.commitFailedHint', { error: errorMessage })
    );
  }
}

/**
 * 创建 git tag
 */
export async function createTag(
  dir: string,
  tag: string,
  message: string
): Promise<void> {
  const git = simpleGit(dir);

  try {
    await git.tag(['-a', tag, '-m', message]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new ColynError(
      t('commands.release.tagFailed'),
      t('commands.release.tagFailedHint', { error: errorMessage })
    );
  }
}

/**
 * 推送到远程仓库
 */
export async function pushToRemote(
  dir: string,
  branch: string,
  tag?: string
): Promise<void> {
  const git = simpleGit(dir);

  try {
    // 推送分支
    await git.push('origin', branch);
    outputInfo(t('commands.release.pushedBranch', { branch }));

    // 如果有 tag，推送 tag
    if (tag) {
      await git.push('origin', tag);
      outputInfo(t('commands.release.pushedTag', { tag }));
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new ColynError(
      t('commands.release.pushFailed'),
      t('commands.release.pushFailedHint', { error: errorMessage })
    );
  }
}

/**
 * 执行发布流程
 * @param projectRoot 项目根目录（.colyn 的父目录）
 * @param dir 主分支目录路径
 * @param versionType 版本类型或版本号
 * @param verbose 是否输出详细信息
 */
export async function executeRelease(
  projectRoot: string,
  dir: string,
  versionType: VersionType | string,
  verbose: boolean = false
): Promise<string> {
  // 步骤 1: 检查 git 状态
  outputLine();
  outputBold(t('commands.release.step1'));
  const isClean = await checkGitStatus(dir);
  if (!isClean) {
    throw new ColynError(
      t('commands.release.workingDirNotClean'),
      t('commands.release.workingDirNotCleanHint')
    );
  }
  outputSuccess(t('commands.release.workingDirClean'));
  const currentBranch = await getCurrentBranch(dir);
  outputInfo(t('commands.release.currentBranch', { branch: currentBranch }));

  // 解析工具链上下文
  const contexts = await resolveToolchains(projectRoot, dir);

  // 步骤 2: 确定新版本号（通过插件读取当前版本）
  outputLine();
  outputBold(t('commands.release.step2'));
  const currentVersion = contexts.length > 0
    ? await pluginManager.runReadVersion(contexts[0].absolutePath, [contexts[0].toolchainName])
    : null;
  const newVersion = bumpVersion(currentVersion, versionType);
  if (currentVersion !== null) {
    outputInfo(t('commands.release.currentVersion', { version: currentVersion }));
    outputSuccess(t('commands.release.newVersion', { old: currentVersion, new: newVersion }));
  } else {
    outputSuccess(t('commands.release.targetVersion', { version: newVersion }));
  }

  // 步骤 3: 安装依赖（通过工具链插件）
  if (contexts.length > 0) {
    outputLine();
    outputBold(t('commands.release.step3'));
    outputInfo(t('commands.release.runningInstall'));
    for (const ctx of contexts) {
      await pluginManager.runInstall(ctx.absolutePath, [ctx.toolchainName], verbose);
    }
    outputSuccess(t('commands.release.installSucceeded'));
  }

  // 步骤 4: 运行 lint（通过工具链插件）
  if (contexts.length > 0) {
    outputLine();
    outputBold(t('commands.release.step4'));
    outputInfo(t('commands.release.runningLint'));
    for (const ctx of contexts) {
      await pluginManager.runLint(ctx.absolutePath, [ctx.toolchainName], verbose);
    }
    outputSuccess(t('commands.release.lintPassed'));
  }

  // 步骤 5: 运行 build（通过工具链插件）
  if (contexts.length > 0) {
    outputLine();
    outputBold(t('commands.release.step5'));
    outputInfo(t('commands.release.runningBuild'));
    for (const ctx of contexts) {
      await pluginManager.runBuild(ctx.absolutePath, [ctx.toolchainName], verbose);
    }
    outputSuccess(t('commands.release.buildSucceeded'));
  }

  // 步骤 6: 更新版本号（通过工具链插件）
  if (contexts.length > 0) {
    outputLine();
    outputBold(t('commands.release.step6'));
    for (const ctx of contexts) {
      await pluginManager.runBumpVersion(ctx.absolutePath, newVersion, [ctx.toolchainName]);
    }
    outputSuccess(t('commands.release.versionUpdated', {
      old: currentVersion ?? newVersion,
      new: newVersion
    }));
  }

  // 步骤 7: 创建 commit（如有版本文件变更）
  outputLine();
  outputBold(t('commands.release.step7'));
  const commitMessage = `chore: release v${newVersion}`;
  const committed = await createCommit(dir, commitMessage);
  if (committed) {
    outputSuccess(t('commands.release.commitCreated', { message: commitMessage }));
  } else {
    outputInfo(t('commands.release.commitSkipped'));
  }

  // 步骤 8: 创建 tag
  outputLine();
  outputBold(t('commands.release.step8'));
  const tagName = `v${newVersion}`;
  const tagMessage = `Release v${newVersion}`;
  await createTag(dir, tagName, tagMessage);
  outputSuccess(t('commands.release.tagCreated', { tag: tagName }));

  // 步骤 9: 推送到远程
  outputLine();
  outputBold(t('commands.release.step9'));
  outputInfo(t('commands.release.pushing'));
  await pushToRemote(dir, currentBranch, tagName);
  outputSuccess(t('commands.release.pushSucceeded'));

  return newVersion;
}

/**
 * 显示发布成功信息
 */
export function displayReleaseSuccess(
  version: string,
  branch: string
): void {
  outputLine();
  outputBold(t('commands.release.releaseComplete'));
  outputLine();

  outputBold(t('commands.release.releaseInfo'));
  outputInfo(t('commands.release.releaseVersion', { version }));
  outputInfo(t('commands.release.releaseBranch', { branch }));
  outputInfo(t('commands.release.releaseTag', { tag: `v${version}` }));
  outputLine();

  outputBold(t('commands.release.nextSteps'));
  outputStep(`  ${t('commands.release.nextStep1')}`);
  outputLine();
  outputStep(`  ${t('commands.release.nextStep2')}`);
  outputLine();
  outputStep(`  ${t('commands.release.nextStep3')}`);
  outputLine();
}

/**
 * 显示回滚命令
 */
export function displayRollbackCommands(version: string): void {
  outputLine();
  outputBold(t('commands.release.rollbackHint'));
  outputLine();
  outputStep(`  git tag -d v${version}`);
  outputStep(`  git reset --hard HEAD~1`);
  outputLine();
}
