import type { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ColynError } from '../types/index.js';
import { output, formatError } from '../utils/logger.js';
import { t } from '../i18n/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 支持的 shell 类型
 */
const SUPPORTED_SHELLS = ['bash', 'zsh'] as const;
type ShellType = (typeof SUPPORTED_SHELLS)[number];

/**
 * 验证 shell 类型
 */
function validateShell(shell: string): shell is ShellType {
  return (SUPPORTED_SHELLS as readonly string[]).includes(shell as ShellType);
}

/**
 * 获取补全脚本路径
 */
function getCompletionScriptPath(shell: ShellType): string {
  // 从 dist/commands 向上两级到项目根目录，然后进入 shell 目录
  const projectRoot = join(__dirname, '..', '..');
  return join(projectRoot, 'shell', `completion.${shell}`);
}

/**
 * 读取补全脚本内容
 */
function readCompletionScript(shell: ShellType): string {
  try {
    const scriptPath = getCompletionScriptPath(shell);
    return readFileSync(scriptPath, 'utf-8');
  } catch {
    throw new ColynError(
      t('commands.completion.cannotReadScript', { shell }),
      t('commands.completion.cannotReadScriptHint', { shell })
    );
  }
}

/**
 * 显示安装说明
 */
function showInstallInstructions(shell: ShellType): void {
  const configFile = shell === 'bash' ? '~/.bashrc' : '~/.zshrc';
  const scriptPath = getCompletionScriptPath(shell);

  output('');
  output(t('commands.completion.installTitle'));
  output('');
  output(t('commands.completion.installStep1', { config: configFile }));
  output('');
  output(`   source ${scriptPath}`);
  output('');
  output(t('commands.completion.installStep2'));
  output('');
  output(`   source ${configFile}`);
  output('');
  output(t('commands.completion.installAuto'));
  output('');
  output(`   echo "source ${scriptPath}" >> ${configFile}`);
  output(`   source ${configFile}`);
  output('');
}

/**
 * completion 命令选项
 */
interface CompletionOptions {
  install?: boolean;
}

/**
 * completion 命令主函数
 */
async function completionCommand(shell: string | undefined, options: CompletionOptions): Promise<void> {
  try {
    // 如果没有指定 shell，显示帮助信息
    if (!shell) {
      output(t('commands.completion.usage'));
      output('');
      output(t('commands.completion.supportedShells'));
      output(`  bash    ${t('commands.completion.bashDesc')}`);
      output(`  zsh     ${t('commands.completion.zshDesc')}`);
      output('');
      output(t('commands.completion.options'));
      output(`  --install    ${t('commands.completion.installDesc')}`);
      output('');
      output(t('commands.completion.examples'));
      output('  colyn completion bash           # output bash completion script');
      output('  colyn completion zsh --install  # show zsh installation instructions');
      return;
    }

    // 验证 shell 类型
    if (!validateShell(shell)) {
      throw new ColynError(
        t('commands.completion.unsupportedShell', { shell }),
        t('commands.completion.unsupportedShellHint', { shells: SUPPORTED_SHELLS.join(', ') })
      );
    }

    // 如果指定了 --install，显示安装说明
    if (options.install) {
      showInstallInstructions(shell);
      return;
    }

    // 读取并输出补全脚本
    const script = readCompletionScript(shell);
    process.stdout.write(script);
  } catch (error) {
    if (error instanceof ColynError) {
      formatError(error);
      process.exit(1);
    }
    throw error;
  }
}

/**
 * 注册 completion 命令
 */
export function register(program: Command): void {
  program
    .command('completion [shell]')
    .description(t('commands.completion.description'))
    .option('--install', t('commands.completion.installOption'))
    .action(async (shell, options) => {
      await completionCommand(shell, options);
    });
}
