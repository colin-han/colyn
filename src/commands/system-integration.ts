import type { Command } from 'commander';
import chalk from 'chalk';
import type { CommandResult } from '../types/index.js';
import { ColynError } from '../types/index.js';
import { formatError, output, outputResult, outputSuccess } from '../utils/logger.js';
import {
  detectShellConfig,
  getColynShellPath,
  getColynBinPath,
  updateShellConfig,
  updateClaudeHooks,
  checkColynShellExists,
  generateAndCacheCompletionScript
} from './system-integration.helpers.js';
import { t } from '../i18n/index.js';

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
      output(chalk.yellow(t('commands.systemIntegration.windowsNotSupported')));
      output('');
      output(t('commands.systemIntegration.windowsManualHint'));
      output('  https://github.com/your-repo/colyn#windows-setup');
      output('');
      outputResult({ success: false });
      process.exit(1);
    }

    // 步骤 1: 检测系统环境
    output('');
    output(t('commands.systemIntegration.detectingEnv'));

    const shellConfig = await detectShellConfig();
    const colynShellPath = getColynShellPath();

    output(chalk.green(t('commands.systemIntegration.shellType', { type: shellConfig.shellType })));
    output(chalk.green(t('commands.systemIntegration.configFile', { path: shellConfig.configPath })));
    output(chalk.green(t('commands.systemIntegration.installPath', { path: colynShellPath })));

    // 步骤 2: 检查 colyn.sh 是否存在
    const shellExists = await checkColynShellExists(colynShellPath);
    if (!shellExists) {
      throw new ColynError(
        t('commands.systemIntegration.shellScriptNotFound'),
        t('commands.systemIntegration.shellScriptNotFoundHint', { path: colynShellPath })
      );
    }

    // 步骤 3: 生成补全脚本（动态生成并缓存，支持 i18n）
    let completionPath: string | undefined;
    try {
      completionPath = await generateAndCacheCompletionScript(shellConfig.shellType);
    } catch {
      output(chalk.yellow(t('commands.systemIntegration.completionNotFound', { path: '' })));
      output(chalk.yellow(`  ${t('commands.systemIntegration.completionNotFoundHint')}`));
    }

    // 步骤 4: 配置 shell 集成
    output('');
    output(t('commands.systemIntegration.configuringShell'));

    const result = await updateShellConfig(
      shellConfig.configPath,
      colynShellPath,
      completionPath
    );

    const configFileName = shellConfig.configPath.replace(process.env.HOME || '', '~');

    if (result === 'added') {
      if (!shellConfig.configExists) {
        output(chalk.green(t('commands.systemIntegration.configCreated', { file: configFileName })));
      }
      output(chalk.green(t('commands.systemIntegration.configAdded', { file: configFileName })));
      if (completionPath) {
        output(chalk.green(t('commands.systemIntegration.completionAdded', { file: configFileName })));
      }
    } else {
      output(chalk.green(t('commands.systemIntegration.configUpdated', { file: configFileName })));
      if (completionPath) {
        output(chalk.green(t('commands.systemIntegration.completionUpdated')));
      }
    }

    // 步骤 5: 配置 Claude Code hooks
    output('');
    output(t('commands.systemIntegration.configuringClaudeHooks'));
    try {
      const colynBinPath = getColynBinPath();
      const claudeResult = await updateClaudeHooks(colynBinPath);
      if (claudeResult === 'added') {
        output(chalk.green(t('commands.systemIntegration.claudeHooksAdded')));
      } else {
        output(chalk.green(t('commands.systemIntegration.claudeHooksUpdated')));
      }
    } catch {
      output(chalk.yellow(t('commands.systemIntegration.claudeHooksFailed')));
    }

    // 步骤 6: 显示完成信息
    output('');
    outputSuccess(result === 'added' ? t('commands.systemIntegration.installComplete') : t('commands.systemIntegration.updateComplete'));
    output('');

    // 生效配置指引
    output(chalk.cyan(t('commands.systemIntegration.activateConfig')));
    if (result === 'added') {
      output(`  ${t('commands.systemIntegration.activateMethod1')}`);
      output(`  ${t('commands.systemIntegration.activateMethod2')} ${chalk.gray(`source ${shellConfig.configPath}`)}`);
    } else {
      output(`  ${t('commands.systemIntegration.activateMethod2')} ${chalk.gray(`source ${shellConfig.configPath}`)}`);
    }

    output('');

    // 功能说明
    if (result === 'added') {
      output(chalk.cyan(t('commands.systemIntegration.features')));
      output(`  ${t('commands.systemIntegration.featureAutoSwitch')}`);
      if (completionPath) {
        output(`  ${t('commands.systemIntegration.featureCompletion')}`);
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
 * 注册 setup 命令
 */
export function register(program: Command): void {
  program
    .command('setup')
    .description(t('commands.systemIntegration.description'))
    .action(async () => {
      await systemIntegrationCommand();
    });
}
