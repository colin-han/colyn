import type { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ColynError } from '../types/index.js';
import { output, formatError } from '../utils/logger.js';

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
  } catch (error) {
    throw new ColynError(
      `无法读取 ${shell} 补全脚本`,
      `请确保项目完整安装，脚本路径: shell/completion.${shell}`
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
  output('📝 手动安装说明:');
  output('');
  output(`1. 将以下内容添加到 ${configFile}:`);
  output('');
  output(`   source ${scriptPath}`);
  output('');
  output('2. 重新加载配置:');
  output('');
  output(`   source ${configFile}`);
  output('');
  output('或者直接运行以下命令自动安装:');
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
      output('用法: colyn completion <shell>');
      output('');
      output('支持的 shell:');
      output('  bash    生成 Bash 补全脚本');
      output('  zsh     生成 Zsh 补全脚本');
      output('');
      output('选项:');
      output('  --install    显示安装说明');
      output('');
      output('示例:');
      output('  colyn completion bash           # 输出 bash 补全脚本');
      output('  colyn completion zsh --install  # 显示 zsh 安装说明');
      return;
    }

    // 验证 shell 类型
    if (!validateShell(shell)) {
      throw new ColynError(
        `不支持的 shell: ${shell}`,
        `支持的 shell: ${SUPPORTED_SHELLS.join(', ')}`
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
    .description('生成 shell 自动补全脚本')
    .option('--install', '显示安装说明')
    .action(async (shell, options) => {
      await completionCommand(shell, options);
    });
}
