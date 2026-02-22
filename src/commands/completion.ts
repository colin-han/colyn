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
 * 获取补全脚本路径（仅用于 bash 静态脚本）
 */
function getCompletionScriptPath(shell: ShellType): string {
  // 从 dist/commands 向上两级到项目根目录，然后进入 shell 目录
  const projectRoot = join(__dirname, '..', '..');
  return join(projectRoot, 'shell', `completion.${shell}`);
}

/**
 * 读取 bash 补全脚本内容（bash 不显示描述，无需 i18n）
 */
function readBashCompletionScript(): string {
  try {
    const scriptPath = getCompletionScriptPath('bash');
    return readFileSync(scriptPath, 'utf-8');
  } catch {
    throw new ColynError(
      t('commands.completion.cannotReadScript', { shell: 'bash' }),
      t('commands.completion.cannotReadScriptHint', { shell: 'bash' })
    );
  }
}

/**
 * 转义 shell 单引号中的特殊字符
 */
function escapeShellSingleQuote(str: string): string {
  return str.replace(/'/g, "'\\''");
}

/**
 * 动态生成 zsh 补全脚本（使用 i18n 翻译）
 */
export function generateZshCompletionScript(): string {
  const e = escapeShellSingleQuote;

  return `#compdef colyn
# Zsh completion script for colyn
# Auto-generated with i18n support

_colyn() {
    local -a commands
    commands=(
        'init:${e(t('commands.init.description'))}'
        'add:${e(t('commands.add.description'))}'
        'list:${e(t('commands.list.description'))}'
        'list-project:${e(t('commands.listProject.description'))}'
        'lsp:${e(t('commands.listProject.description'))}'
        'merge:${e(t('commands.merge.description'))}'
        'update:${e(t('commands.update.description'))}'
        'remove:${e(t('commands.remove.description'))}'
        'checkout:${e(t('commands.checkout.description'))}'
        'co:${e(t('commands.checkout.coDescription'))}'
        'info:${e(t('commands.info.description'))}'
        'status:${e(t('commands.status.description'))}'
        'st:${e(t('commands.status.description'))}'
        'repair:${e(t('commands.repair.description'))}'
        'config:${e(t('commands.config.description'))}'
        'setup:${e(t('commands.systemIntegration.description'))}'
        'tmux:${e(t('commands.tmux.description'))}'
        'release:${e(t('commands.release.description'))}'
        'completion:${e(t('commands.completion.description'))}'
        'todo:${e(t('commands.todo.description'))}'
    )

    local curcontext="$curcontext" state line
    typeset -A opt_args

    _arguments -C \\
        '1: :->command' \\
        '*::arg:->args'

    case $state in
        command)
            _describe 'colyn commands' commands
            ;;
        args)
            case $line[1] in
                init)
                    # init: no positional args
                    ;;
                add)
                    # add <branch>
                    _colyn_branches
                    ;;
                list)
                    _arguments \\
                        '--json[${e(t('commands.list.jsonOption'))}]' \\
                        '(-p --paths)'{-p,--paths}'[${e(t('commands.list.pathsOption'))}]' \\
                        '--no-main[${e(t('commands.list.noMainOption'))}]'
                    ;;
                merge)
                    _arguments \\
                        '1: :_colyn_worktrees' \\
                        '--push[${e(t('commands.merge.pushOption'))}]' \\
                        '--no-push[${e(t('commands.merge.noPushOption'))}]'
                    ;;
                update)
                    _arguments \\
                        '1: :_colyn_worktrees' \\
                        '--all[${e(t('commands.update.allOption'))}]' \\
                        '--no-rebase[${e(t('commands.update.noRebaseOption'))}]'
                    ;;
                remove)
                    _arguments \\
                        '1: :_colyn_worktrees' \\
                        '(-y --yes)'{-y,--yes}'[${e(t('commands.remove.yesOption'))}]' \\
                        '(-f --force)'{-f,--force}'[${e(t('commands.remove.forceOption'))}]'
                    ;;
                checkout|co)
                    _arguments \\
                        '1: :_colyn_worktree_ids' \\
                        '2: :_colyn_branches'
                    ;;
                info)
                    _arguments \\
                        '(-f --field)'{-f,--field}'[${e(t('commands.info.fieldOption'))}]:field:_colyn_info_fields' \\
                        '--format[${e(t('commands.info.formatOption'))}]:template:' \\
                        '(-s --separator)'{-s,--separator}'[${e(t('commands.info.separatorOption'))}]:separator:'
                    ;;
                repair)
                    # repair: no args
                    ;;
                config)
                    _arguments \\
                        '--json[${e(t('commands.config.jsonOption'))}]'
                    ;;
                setup)
                    # setup: no args
                    ;;
                tmux)
                    _arguments \\
                        '1: :(start stop)' \\
                        '(-f --force)'{-f,--force}'[${e(t('commands.tmux.forceOption'))}]'
                    ;;
                release)
                    _arguments \\
                        '1: :('\\''patch'\\'' '\\''minor'\\'' '\\''major'\\'')'
                    ;;
                completion)
                    _arguments \\
                        '1: :(bash zsh)' \\
                        '--install[${e(t('commands.completion.installOption'))}]'
                    ;;
                list-project|lsp)
                    _arguments \\
                        '--json[${e(t('commands.listProject.jsonOption'))}]' \\
                        '(-p --paths)'{-p,--paths}'[${e(t('commands.listProject.pathsOption'))}]'
                    ;;
                todo)
                    local state
                    local -a subcommands
                    subcommands=(
                        'add:${e(t('commands.todo.add.description'))}'
                        'start:${e(t('commands.todo.start.description'))}'
                        'list:${e(t('commands.todo.list.description'))}'
                        'ls:${e(t('commands.todo.list.description'))}'
                        'remove:${e(t('commands.todo.remove.description'))}'
                        'archive:${e(t('commands.todo.archive.description'))}'
                        'uncomplete:${e(t('commands.todo.uncomplete.description'))}'
                    )

                    _arguments -C \\
                        '1: :->subcmd' \\
                        '*::arg:->subargs'

                    case $state in
                        subcmd)
                            _describe 'todo subcommands' subcommands
                            ;;
                        subargs)
                            case $line[1] in
                                add)
                                    # todoId 类型前缀补全
                                    local -a types
                                    types=('feature' 'bugfix' 'refactor' 'document')
                                    _describe 'todo types' types
                                    ;;
                                start)
                                    _arguments \\
                                        '1: :_colyn_todo_ids' \\
                                        '--no-clipboard[${e(t('commands.todo.start.noClipboardOption'))}]'
                                    ;;
                                list|ls)
                                    _arguments \\
                                        '--completed[${e(t('commands.todo.list.completedOption'))}]' \\
                                        '--archived[${e(t('commands.todo.list.archivedOption'))}]' \\
                                        '--id-only[${e(t('commands.todo.list.idOnlyOption'))}]'
                                    ;;
                                remove)
                                    _arguments \\
                                        '1: :_colyn_todo_ids' \\
                                        '(-y --yes)'{-y,--yes}'[${e(t('commands.todo.remove.yesOption'))}]'
                                    ;;
                                archive)
                                    _arguments \\
                                        '(-y --yes)'{-y,--yes}'[${e(t('commands.todo.archive.yesOption'))}]'
                                    ;;
                                uncomplete)
                                    _arguments \\
                                        '1: :_colyn_todo_completed_ids'
                                    ;;
                            esac
                            ;;
                    esac
                    ;;
            esac
            ;;
    esac
}

# Todo ID completion (pending todos)
_colyn_todo_ids() {
    local -a todos
    todos=(\${(f)"$(colyn todo list --id-only 2>/dev/null)"})
    _describe 'todo IDs' todos
}

# Todo completed ID completion
_colyn_todo_completed_ids() {
    local -a todos
    todos=(\${(f)"$(colyn todo list --completed --id-only 2>/dev/null)"})
    _describe 'completed todo IDs' todos
}

# Git branch completion
_colyn_branches() {
    local -a branches
    branches=(\${(f)"$(git branch -a 2>/dev/null | sed 's/^[* ]*//' | sed 's/remotes\\/origin\\///' | sort -u)"})
    _describe 'branches' branches
}

# Worktree ID and branch completion
_colyn_worktrees() {
    local -a worktrees
    local worktrees_json=$(colyn list --json --no-main 2>/dev/null)

    if [[ $? -eq 0 && -n "$worktrees_json" ]]; then
        local -a ids branches
        ids=(\${(f)"$(echo "$worktrees_json" | grep -o '"id":[0-9]*' | cut -d: -f2)"})
        branches=(\${(f)"$(echo "$worktrees_json" | grep -o '"branch":"[^"]*"' | cut -d'"' -f4)"})

        local i
        for i in {1..\${#ids[@]}}; do
            worktrees+=("\${ids[$i]}:\${branches[$i]}")
        done

        _describe 'worktrees' worktrees
    fi
}

# Worktree ID completion (numbers only)
_colyn_worktree_ids() {
    local -a ids
    local worktrees_json=$(colyn list --json --no-main 2>/dev/null)

    if [[ $? -eq 0 && -n "$worktrees_json" ]]; then
        ids=(\${(f)"$(echo "$worktrees_json" | grep -o '"id":[0-9]*' | cut -d: -f2)"})
        _describe 'worktree IDs' ids
    fi
}

# Info command field name completion
_colyn_info_fields() {
    local -a fields
    fields=(
        'project:${e(t('commands.completion.fieldProject'))}'
        'project-path:${e(t('commands.completion.fieldProjectPath'))}'
        'worktree-id:${e(t('commands.completion.fieldWorktreeId'))}'
        'worktree-dir:${e(t('commands.completion.fieldWorktreeDir'))}'
        'branch:${e(t('commands.completion.fieldBranch'))}'
    )
    _describe 'fields' fields
}

# Register completion function
compdef _colyn colyn
`;
}

/**
 * 获取补全脚本内容
 */
function getCompletionScript(shell: ShellType): string {
  if (shell === 'zsh') {
    return generateZshCompletionScript();
  }
  return readBashCompletionScript();
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

    // 生成并输出补全脚本
    const script = getCompletionScript(shell);
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
