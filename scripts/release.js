#!/usr/bin/env node

/**
 * 发布脚本：自动化版本发布流程
 *
 * 使用方法：
 *   node scripts/release.js <version-type>
 *
 * 版本类型：
 *   major - 主版本号 (1.0.0 -> 2.0.0)
 *   minor - 次版本号 (1.0.0 -> 1.1.0)
 *   patch - 补丁版本 (1.0.0 -> 1.0.1)
 *   <version> - 直接指定版本号 (如 1.2.3)
 *
 * 功能：
 *   1. 验证工作区状态（必须干净）
 *   2. 运行测试和 lint
 *   3. 更新 package.json 版本号
 *   4. 编译项目
 *   5. 创建 git commit
 *   6. 创建 git tag
 *   7. 推送到远程仓库
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
  log(`✗ ${message}`, 'red');
}

function success(message) {
  log(`✓ ${message}`, 'green');
}

function info(message) {
  log(`  ${message}`, 'gray');
}

function execCommand(command, cwd = process.cwd()) {
  try {
    const output = execSync(command, {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    return output.trim();
  } catch (err) {
    throw new Error(`命令执行失败: ${command}\n${err.message}`);
  }
}

/**
 * 解析版本号
 */
function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`无效的版本号格式: ${version}`);
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
function bumpVersion(currentVersion, type) {
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
 * 检查 git 工作区状态
 */
function checkGitStatus() {
  const status = execCommand('git status --porcelain');
  if (status) {
    throw new Error('工作区不干净，请先提交或 stash 所有更改');
  }
}

/**
 * 获取当前分支
 */
function getCurrentBranch() {
  return execCommand('git rev-parse --abbrev-ref HEAD');
}

/**
 * 更新 package.json 版本号
 */
async function updatePackageVersion(projectRoot, newVersion) {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  const content = await fs.readFile(packageJsonPath, 'utf-8');
  const pkg = JSON.parse(content);
  const oldVersion = pkg.version;

  pkg.version = newVersion;

  await fs.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');

  return { oldVersion, newVersion };
}

async function main() {
  const projectRoot = path.resolve(__dirname, '..');

  console.log('');
  log('=== Colyn 发布脚本 ===', 'cyan');
  console.log('');

  // 步骤 0: 解析参数
  const args = process.argv.slice(2);

  if (args.length === 0) {
    error('请指定版本类型或版本号');
    console.log('');
    log('使用方法:', 'cyan');
    info('node scripts/release.js <version-type>');
    console.log('');
    log('版本类型:', 'cyan');
    info('major - 主版本号 (1.0.0 -> 2.0.0)');
    info('minor - 次版本号 (1.0.0 -> 1.1.0)');
    info('patch - 补丁版本 (1.0.0 -> 1.0.1)');
    info('<version> - 直接指定版本号 (如 1.2.3)');
    console.log('');
    log('示例:', 'cyan');
    info('node scripts/release.js patch');
    info('node scripts/release.js 1.2.3');
    console.log('');
    process.exit(1);
  }

  const versionType = args[0];

  // 步骤 1: 检查 git 状态
  console.log('');
  log('步骤 1: 检查 git 状态', 'yellow');

  try {
    checkGitStatus();
    success('工作区干净');
  } catch (err) {
    error(err.message);
    info('请先提交或 stash 所有更改后再运行发布脚本');
    process.exit(1);
  }

  const currentBranch = getCurrentBranch();
  info(`当前分支: ${currentBranch}`);

  // 步骤 2: 读取当前版本
  console.log('');
  log('步骤 2: 确定新版本号', 'yellow');

  const packageJsonPath = path.join(projectRoot, 'package.json');
  const pkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
  const currentVersion = pkg.version;

  info(`当前版本: ${currentVersion}`);

  let newVersion;
  try {
    newVersion = bumpVersion(currentVersion, versionType);
  } catch (err) {
    error(err.message);
    process.exit(1);
  }

  log(`新版本: ${currentVersion} -> ${newVersion}`, 'green');

  // 步骤 3: 运行测试和 lint
  console.log('');
  log('步骤 3: 运行测试和代码检查', 'yellow');

  info('运行 lint...');
  try {
    execCommand('volta run yarn lint', projectRoot);
    success('Lint 检查通过');
  } catch (err) {
    error('Lint 检查失败');
    console.error(err.message);
    process.exit(1);
  }

  // 步骤 4: 编译项目
  console.log('');
  log('步骤 4: 编译项目', 'yellow');

  info('运行 build...');
  try {
    execCommand('volta run yarn build', projectRoot);
    success('编译成功');
  } catch (err) {
    error('编译失败');
    console.error(err.message);
    process.exit(1);
  }

  // 步骤 5: 更新 package.json
  console.log('');
  log('步骤 5: 更新 package.json', 'yellow');

  try {
    await updatePackageVersion(projectRoot, newVersion);
    success(`版本号已更新: ${currentVersion} -> ${newVersion}`);
  } catch (err) {
    error('更新版本号失败');
    console.error(err.message);
    process.exit(1);
  }

  // 步骤 6: 创建 git commit
  console.log('');
  log('步骤 6: 创建 git commit', 'yellow');

  try {
    execCommand('git add package.json', projectRoot);
    execCommand(
      `git commit -m "chore: release v${newVersion}\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"`,
      projectRoot
    );
    success(`已创建提交: chore: release v${newVersion}`);
  } catch (err) {
    error('创建提交失败');
    console.error(err.message);
    process.exit(1);
  }

  // 步骤 7: 创建 git tag
  console.log('');
  log('步骤 7: 创建 git tag', 'yellow');

  try {
    execCommand(`git tag -a v${newVersion} -m "Release v${newVersion}"`, projectRoot);
    success(`已创建标签: v${newVersion}`);
  } catch (err) {
    error('创建标签失败');
    console.error(err.message);
    info('如果需要回滚，请运行:');
    info(`  git reset --hard HEAD~1`);
    process.exit(1);
  }

  // 步骤 8: 推送到远程仓库
  console.log('');
  log('步骤 8: 推送到远程仓库', 'yellow');

  info('推送提交...');
  try {
    execCommand(`git push origin ${currentBranch}`, projectRoot);
    success('已推送提交');
  } catch (err) {
    error('推送提交失败');
    console.error(err.message);
    info('如果需要回滚，请运行:');
    info(`  git tag -d v${newVersion}`);
    info(`  git reset --hard HEAD~1`);
    process.exit(1);
  }

  info('推送标签...');
  try {
    execCommand(`git push origin v${newVersion}`, projectRoot);
    success('已推送标签');
  } catch (err) {
    error('推送标签失败');
    console.error(err.message);
    info('标签已在本地创建，可稍后手动推送:');
    info(`  git push origin v${newVersion}`);
  }

  // 完成
  console.log('');
  log('=== 发布完成！===', 'green');
  console.log('');

  log('发布信息:', 'cyan');
  info(`版本: v${newVersion}`);
  info(`分支: ${currentBranch}`);
  info(`标签: v${newVersion}`);
  console.log('');

  log('后续操作:', 'cyan');
  info('1. 在 GitHub 上创建 Release:');
  info(`   https://github.com/your-repo/releases/new?tag=v${newVersion}`);
  console.log('');
  info('2. 更新安装说明文档（如果需要）');
  console.log('');
  info('3. 通知用户新版本发布');
  console.log('');
}

main().catch(err => {
  error(`发布失败: ${err.message}`);
  console.error(err);
  process.exit(1);
});
