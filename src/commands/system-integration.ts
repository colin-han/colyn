import type { Command } from 'commander';
import chalk from 'chalk';
import type { CommandResult } from '../types/index.js';
import { ColynError } from '../types/index.js';
import { formatError, output, outputResult, outputSuccess } from '../utils/logger.js';
import {
  detectShellConfig,
  getColynShellPath,
  getCompletionScriptPath,
  updateShellConfig,
  checkColynShellExists,
  checkCompletionScriptExists
} from './system-integration.helpers.js';

/**
 * System Integration 命令：配置 shell 集成
 *
 * 功能：
 * 1. 检测用户的 shell 类型和配置文件
 * 2. 定位 colyn.sh 文件
 * 3. 添加 source 命令到 shell 配置文件
 * 4. 支持更新已有配置
 */
async function systemIntegrationCommand(): Promise<void> {
  try {
    // 检查平台
    if (process.platform === 'win32') {
      output('');
      output(chalk.yellow('⚠ Windows 平台暂不支持自动配置'));
      output('');
      output('请参考文档手动配置 shell 集成：');
      output('  https://github.com/your-repo/colyn#windows-setup');
      output('');
      outputResult({ success: false });
      process.exit(1);
    }

    // 步骤 1: 检测系统环境
    output('');
    output('检测系统环境...');

    const shellConfig = await detectShellConfig();
    const colynShellPath = getColynShellPath();
    const completionPath = getCompletionScriptPath(shellConfig.shellType);

    output(chalk.green(`✓ Shell 类型: ${shellConfig.shellType}`));
    output(chalk.green(`✓ 配置文件: ${shellConfig.configPath}`));
    output(chalk.green(`✓ Colyn 安装路径: ${colynShellPath}`));

    // 步骤 2: 检查 colyn.sh 是否存在
    const shellExists = await checkColynShellExists(colynShellPath);
    if (!shellExists) {
      throw new ColynError(
        '找不到 shell 集成脚本',
        `路径: ${colynShellPath}\n` +
        '\n' +
        '可能原因：\n' +
        '  - colyn 安装不完整\n' +
        '\n' +
        '解决方法：\n' +
        '  重新安装：npm install -g colyn'
      );
    }

    // 步骤 3: 检查补全脚本是否存在
    const completionExists = await checkCompletionScriptExists(completionPath);
    if (!completionExists) {
      output(chalk.yellow(`⚠ 补全脚本未找到: ${completionPath}`));
      output(chalk.yellow('  将仅配置 shell 集成功能'));
    }

    // 步骤 4: 配置 shell 集成
    output('');
    output('配置 shell 集成...');

    const result = await updateShellConfig(
      shellConfig.configPath,
      colynShellPath,
      completionExists ? completionPath : undefined
    );

    const configFileName = shellConfig.configPath.replace(process.env.HOME || '', '~');

    if (result === 'added') {
      if (!shellConfig.configExists) {
        output(chalk.green(`✓ 已创建 ${configFileName}`));
      }
      output(chalk.green(`✓ 已添加 shell 集成到 ${configFileName}`));
      if (completionExists) {
        output(chalk.green(`✓ 已添加补全脚本到 ${configFileName}`));
      }
    } else {
      output(chalk.green(`✓ 已更新 ${configFileName} 中的 shell 集成配置`));
      if (completionExists) {
        output(chalk.green(`✓ 已更新补全脚本配置`));
      }
    }

    // 步骤 5: 显示完成信息
    output('');
    outputSuccess(result === 'added' ? '安装完成！' : '更新完成！');
    output('');

    // 生效配置指引
    output(chalk.cyan('生效配置：'));
    if (result === 'added') {
      output('  方式 1（推荐）：重新打开终端');
      output(`  方式 2：运行命令：${chalk.gray(`source ${shellConfig.configPath}`)}`);
    } else {
      output(`  运行命令：${chalk.gray(`source ${shellConfig.configPath}`)}`);
    }

    output('');

    // 功能说明
    if (result === 'added') {
      output(chalk.cyan('功能说明：'));
      output('  ✓ colyn 命令支持自动目录切换');
      if (completionExists) {
        output('  ✓ 使用 Tab 键可自动完成命令和参数');
      }
      output('');
    }

    // 输出 JSON 结果
    const jsonResult: CommandResult = {
      success: true
    };
    outputResult(jsonResult);

  } catch (error) {
    formatError(error);
    outputResult({ success: false });
    process.exit(1);
  }
}

/**
 * 注册 system-integration 命令
 */
export function register(program: Command): void {
  program
    .command('system-integration')
    .description('配置 shell 集成（支持自动目录切换和命令补全）')
    .action(async () => {
      await systemIntegrationCommand();
    });
}
