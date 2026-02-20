import * as fs from 'fs/promises';
import * as path from 'path';
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
 */
export function bumpVersion(
  currentVersion: string,
  type: VersionType | string
): string {
  const ver = parseVersion(currentVersion);

  switch (type) {
    case 'major':
      return `${ver.major + 1}.0.0`;
    case 'minor':
      return `${ver.major}.${ver.minor + 1}.0`;
    case 'patch':
      return `${ver.major}.${ver.minor}.${ver.patch + 1}`;
    default:
      // 直接指定版本号
      parseVersion(type); // 验证格式
      return type;
  }
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
 * 读取 package.json 版本号
 */
export async function readPackageVersion(dir: string): Promise<string> {
  const packageJsonPath = path.join(dir, 'package.json');
  const content = await fs.readFile(packageJsonPath, 'utf-8');
  const pkg = JSON.parse(content);
  return pkg.version;
}

/**
 * 更新 package.json 版本号
 */
export async function updatePackageVersion(
  dir: string,
  newVersion: string
): Promise<{ oldVersion: string; newVersion: string }> {
  const packageJsonPath = path.join(dir, 'package.json');
  const content = await fs.readFile(packageJsonPath, 'utf-8');
  const pkg = JSON.parse(content);
  const oldVersion = pkg.version;

  pkg.version = newVersion;

  await fs.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');

  return { oldVersion, newVersion };
}

/**
 * 运行 lint
 */
export async function runLint(dir: string): Promise<void> {
  const git = simpleGit(dir);

  try {
    await git.raw(['exec', 'volta', 'run', 'yarn', 'lint']);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new ColynError(
      t('commands.release.lintFailed'),
      t('commands.release.lintFailedHint', { error: errorMessage })
    );
  }
}

/**
 * 运行 build
 */
export async function runBuild(dir: string): Promise<void> {
  const git = simpleGit(dir);

  try {
    await git.raw(['exec', 'volta', 'run', 'yarn', 'build']);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new ColynError(
      t('commands.release.buildFailed'),
      t('commands.release.buildFailedHint', { error: errorMessage })
    );
  }
}

/**
 * 创建 git commit
 */
export async function createCommit(
  dir: string,
  message: string
): Promise<void> {
  const git = simpleGit(dir);

  try {
    await git.add('package.json');
    await git.commit(message);
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
 */
export async function executeRelease(
  dir: string,
  versionType: VersionType | string
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

  // 步骤 2: 确定新版本号
  outputLine();
  outputBold(t('commands.release.step2'));
  const currentVersion = await readPackageVersion(dir);
  outputInfo(t('commands.release.currentVersion', { version: currentVersion }));
  const newVersion = bumpVersion(currentVersion, versionType);
  outputSuccess(t('commands.release.newVersion', {
    old: currentVersion,
    new: newVersion
  }));

  // 步骤 3: 运行 lint
  outputLine();
  outputBold(t('commands.release.step3'));
  outputInfo(t('commands.release.runningLint'));
  await runLint(dir);
  outputSuccess(t('commands.release.lintPassed'));

  // 步骤 4: 运行 build
  outputLine();
  outputBold(t('commands.release.step4'));
  outputInfo(t('commands.release.runningBuild'));
  await runBuild(dir);
  outputSuccess(t('commands.release.buildSucceeded'));

  // 步骤 5: 更新 package.json
  outputLine();
  outputBold(t('commands.release.step5'));
  const versionInfo = await updatePackageVersion(dir, newVersion);
  outputSuccess(t('commands.release.versionUpdated', {
    old: versionInfo.oldVersion,
    new: versionInfo.newVersion
  }));

  // 步骤 6: 创建 commit
  outputLine();
  outputBold(t('commands.release.step6'));
  const commitMessage = `chore: release v${newVersion}`;
  await createCommit(dir, commitMessage);
  outputSuccess(t('commands.release.commitCreated', { message: commitMessage }));

  // 步骤 7: 创建 tag
  outputLine();
  outputBold(t('commands.release.step7'));
  const tagName = `v${newVersion}`;
  const tagMessage = `Release v${newVersion}`;
  await createTag(dir, tagName, tagMessage);
  outputSuccess(t('commands.release.tagCreated', { tag: tagName }));

  // 步骤 8: 推送到远程
  outputLine();
  outputBold(t('commands.release.step8'));
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

/**
 * 检查依赖是否已安装（检查 .pnp.cjs 或 node_modules 是否存在）
 */
export async function checkDependenciesInstalled(dir: string): Promise<void> {
  const pnpFile = path.join(dir, '.pnp.cjs');
  const pnpMjsFile = path.join(dir, '.pnp.mjs');
  const nodeModulesDir = path.join(dir, 'node_modules');

  try {
    const pnpExists = await fs.access(pnpFile).then(() => true).catch(() => false);
    const pnpMjsExists = await fs.access(pnpMjsFile).then(() => true).catch(() => false);
    const nodeModulesExists = await fs.access(nodeModulesDir).then(() => true).catch(() => false);

    if (!pnpExists && !pnpMjsExists && !nodeModulesExists) {
      throw new ColynError(
        t('commands.release.depsNotInstalled'),
        t('commands.release.depsNotInstalledHint', { path: dir })
      );
    }
  } catch (error) {
    if (error instanceof ColynError) {
      throw error;
    }
    throw new ColynError(
      t('commands.release.depsNotInstalled'),
      t('commands.release.depsNotInstalledHint', { path: dir })
    );
  }
}
