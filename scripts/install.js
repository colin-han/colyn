#!/usr/bin/env node

/**
 * 安装脚本：将 colyn 安装到指定目录
 *
 * 使用方法：
 *   node scripts/install.js <target-directory>
 *
 * 功能：
 *   1. 编译项目
 *   2. 复制编译结果到目标目录
 *   3. 在目标目录安装依赖
 *   4. 创建启动脚本
 *   5. 复制 shell 集成脚本
 *   6. 添加到 shell 自启动配置
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
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

async function copyDirectory(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function copyFile(src, dest) {
  try {
    await fs.copyFile(src, dest);
    return true;
  } catch (err) {
    return false;
  }
}

function execCommand(command, cwd) {
  try {
    execSync(command, {
      cwd,
      stdio: 'inherit',
      env: process.env
    });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * 检测用户的 shell 配置文件
 */
async function detectShellConfig() {
  const homeDir = os.homedir();
  const shell = process.env.SHELL || '';

  // 按优先级检测配置文件
  const candidates = [];

  if (shell.includes('zsh')) {
    candidates.push(path.join(homeDir, '.zshrc'));
  }
  if (shell.includes('bash')) {
    candidates.push(path.join(homeDir, '.bashrc'));
    candidates.push(path.join(homeDir, '.bash_profile'));
  }
  // 默认候选
  candidates.push(path.join(homeDir, '.zshrc'));
  candidates.push(path.join(homeDir, '.bashrc'));

  for (const configPath of candidates) {
    try {
      await fs.access(configPath);
      return configPath;
    } catch {
      // 文件不存在，继续检查下一个
    }
  }

  // 如果都不存在，返回默认的 .bashrc
  return path.join(homeDir, '.bashrc');
}

async function main() {
  // 步骤 0: 解析参数
  const args = process.argv.slice(2);

  if (args.length === 0) {
    error('请提供目标安装目录');
    console.log('');
    log('使用方法:', 'cyan');
    info('node scripts/install.js <target-directory>');
    console.log('');
    log('示例:', 'cyan');
    info('node scripts/install.js /usr/local/lib/colyn');
    info('node scripts/install.js ~/my-tools/colyn');
    console.log('');
    process.exit(1);
  }

  const targetDir = path.resolve(args[0]);
  const projectRoot = path.resolve(__dirname, '..');
  const colynDir = path.join(targetDir, 'colyn.d');

  console.log('');
  log('=== Colyn 安装脚本 ===', 'cyan');
  console.log('');
  info(`项目目录: ${projectRoot}`);
  info(`目标目录: ${targetDir}`);
  console.log('');

  // 步骤 1: 检查目标目录
  log('步骤 1: 检查目标目录', 'yellow');

  try {
    const stat = await fs.stat(targetDir);
    if (stat.isDirectory()) {
      log('  目标目录已存在，将覆盖安装', 'yellow');
    }
  } catch (err) {
    info('目标目录不存在，将创建');
  }

  // 步骤 2: 编译项目
  console.log('');
  log('步骤 2: 编译项目', 'yellow');

  info('执行: yarn build');
  const buildSuccess = execCommand('yarn build', projectRoot);

  if (!buildSuccess) {
    error('编译失败');
    process.exit(1);
  }

  success('项目编译完成');

  // 步骤 3: 创建目标目录
  console.log('');
  log('步骤 3: 创建目录结构', 'yellow');

  try {
    await fs.mkdir(targetDir, { recursive: true });
    await fs.mkdir(colynDir, { recursive: true });
    success('目录结构创建完成');
  } catch (err) {
    error(`创建目录失败: ${err.message}`);
    process.exit(1);
  }

  // 步骤 4: 复制文件到 colyn.d 目录
  console.log('');
  log('步骤 4: 复制文件到 colyn.d/', 'yellow');

  // 复制 dist 目录
  info('复制 dist/ 到 colyn.d/');
  const distSrc = path.join(projectRoot, 'dist');
  const distDest = path.join(colynDir, 'dist');

  try {
    await copyDirectory(distSrc, distDest);
    success('dist/ 复制完成');
  } catch (err) {
    error(`复制 dist/ 失败: ${err.message}`);
    process.exit(1);
  }

  // 复制 package.json
  info('复制 package.json 到 colyn.d/');
  const packageJsonSrc = path.join(projectRoot, 'package.json');
  const packageJsonDest = path.join(colynDir, 'package.json');

  const packageCopied = await copyFile(packageJsonSrc, packageJsonDest);
  if (!packageCopied) {
    error('复制 package.json 失败');
    process.exit(1);
  }
  success('package.json 复制完成');

  // 复制 shell 目录
  info('复制 shell/ 目录到 colyn.d/');
  const shellDirSrc = path.join(projectRoot, 'shell');
  const shellDirDest = path.join(colynDir, 'shell');

  try {
    await copyDirectory(shellDirSrc, shellDirDest);
    success('shell/ 目录复制完成');
  } catch (err) {
    error(`复制 shell/ 目录失败: ${err.message}`);
    process.exit(1);
  }

  // 复制 README.md（可选）
  const readmeSrc = path.join(projectRoot, 'README.md');
  const readmeDest = path.join(colynDir, 'README.md');
  await copyFile(readmeSrc, readmeDest);

  // 步骤 5: 安装依赖到 colyn.d 目录
  console.log('');
  log('步骤 5: 在 colyn.d/ 安装依赖', 'yellow');

  info('执行: npm install --production');
  const installSuccess = execCommand('npm install --production', colynDir);

  if (!installSuccess) {
    error('安装依赖失败');
    process.exit(1);
  }

  success('依赖安装完成');

  // 步骤 6: 创建启动脚本（根据平台）
  console.log('');
  log('步骤 6: 创建启动脚本', 'yellow');

  const platform = process.platform;
  info(`检测到系统平台: ${platform}`);

  if (platform === 'win32') {
    // Windows 脚本
    const windowsScriptContent = `@echo off
REM Colyn CLI 启动脚本 (Windows)
REM 自动生成 - 请勿手动修改

set "USER_CWD=%CD%"
set "COLYN_USER_CWD=%USER_CWD%"
node "%~dp0colyn.d\\dist\\index.js" %*
`;

    const windowsScriptPath = path.join(targetDir, 'colyn.cmd');

    try {
      await fs.writeFile(windowsScriptPath, windowsScriptContent, 'utf-8');
      success('启动脚本创建完成: colyn.cmd (Windows)');
    } catch (err) {
      error(`创建启动脚本失败: ${err.message}`);
      process.exit(1);
    }
  } else {
    // Unix/Linux/macOS bash 脚本
    const unixScriptContent = `#!/bin/bash

# Colyn CLI 启动脚本
# 自动生成 - 请勿手动修改
# 如需目录切换功能，请 source colyn.d/colyn.sh

USER_CWD="$(pwd)"
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
COLYN_CORE="\${SCRIPT_DIR}/colyn.d/dist/index.js"

if [[ ! -f "\${COLYN_CORE}" ]]; then
  echo "错误: 找不到 colyn 核心文件" >&2
  exit 1
fi

COLYN_USER_CWD="$USER_CWD" node "\${COLYN_CORE}" "$@"
`;

    const unixScriptPath = path.join(targetDir, 'colyn');

    try {
      await fs.writeFile(unixScriptPath, unixScriptContent, 'utf-8');
      await fs.chmod(unixScriptPath, 0o755); // 添加执行权限

      const platformName = platform === 'darwin' ? 'macOS' : platform === 'linux' ? 'Linux' : 'Unix';
      success(`启动脚本创建完成: colyn (${platformName})`);
    } catch (err) {
      error(`创建启动脚本失败: ${err.message}`);
      process.exit(1);
    }
  }

  // 步骤 7: 配置 shell 集成
  if (platform !== 'win32') {
    console.log('');
    log('步骤 7: 配置 shell 集成', 'yellow');

    try {
      // 调用 colyn setup 命令
      const colynCore = path.join(colynDir, 'dist', 'index.js');
      info('运行: colyn setup');

      // 捕获 stderr（用户可见输出）并显示给用户
      const result = execSync(`node "${colynCore}" setup`, {
        cwd: colynDir,
        env: process.env,
        stdio: ['inherit', 'pipe', 'inherit'], // stdin: inherit, stdout: pipe, stderr: inherit
        encoding: 'utf-8'
      });

      success('Shell 集成配置完成');
    } catch (err) {
      error(`配置 shell 集成失败: ${err.message}`);
      console.log('');
      info('你可以稍后手动运行以下命令配置：');

      const shellConfigPath = await detectShellConfig();
      info(`  node "${path.join(colynDir, 'dist', 'index.js')}" setup`);
      info('');
      info('或手动添加以下内容到 shell 配置文件：');
      info(`  source "${path.join(colynDir, 'shell', 'colyn.sh')}"`);

      const completionPath = shellConfigPath.includes('.zshrc')
        ? path.join(colynDir, 'shell', 'completion.zsh')
        : path.join(colynDir, 'shell', 'completion.bash');
      info(`  source "${completionPath}"`);
    }
  }

  // 步骤 8: 完成
  console.log('');
  log('=== 安装完成！===', 'green');
  console.log('');

  log('目标目录结构:', 'cyan');
  info(targetDir);
  info('├── colyn.d/           # 程序文件');
  info('│   ├── dist/          # 编译后的代码');
  info('│   ├── node_modules/  # 依赖包');
  info('│   ├── shell/         # Shell 集成脚本');
  info('│   │   ├── colyn.sh   # Shell 集成脚本');
  info('│   │   ├── completion.bash # Bash 补全脚本');
  info('│   │   └── completion.zsh  # Zsh 补全脚本');
  info('│   └── package.json   # 包配置');

  if (platform === 'win32') {
    info('└── colyn.cmd          # Windows 启动脚本');
  } else {
    info('└── colyn              # Unix/Linux/macOS 启动脚本');
  }
  console.log('');

  log('使用方法:', 'cyan');
  console.log('');

  if (platform === 'win32') {
    log('方式 1: 添加到 PATH 环境变量', 'yellow');
    info('将目标目录添加到 PATH，然后在任意位置运行：');
    info('  colyn init');
    info('  colyn add <branch>');
    console.log('');

    log('方式 2: 使用绝对路径', 'yellow');
    info('直接使用绝对路径运行：');
    info(`  ${path.join(targetDir, 'colyn.cmd')} init`);
    console.log('');

    log('测试安装:', 'cyan');
    info(`cd %TEMP% && ${path.join(targetDir, 'colyn.cmd')} --version`);
  } else {
    log('目录切换功能已自动配置！', 'green');
    info('重新打开终端或运行 source 命令后，colyn 命令将支持自动目录切换。');
    console.log('');

    log('测试安装:', 'cyan');
    info(`cd /tmp && colyn --version`);
    console.log('');

    log('如需手动配置:', 'yellow');
    info('添加以下内容到 ~/.bashrc 或 ~/.zshrc：');
    info(`  source "${path.join(colynDir, 'shell', 'colyn.sh')}"`);
  }
  console.log('');
}

main().catch(err => {
  error(`安装失败: ${err.message}`);
  console.error(err);
  process.exit(1);
});
