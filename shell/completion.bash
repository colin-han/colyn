#!/usr/bin/env bash
# Bash completion script for colyn
#
# Installation:
#   source /path/to/completion.bash
# Or add to ~/.bashrc:
#   echo "source /path/to/completion.bash" >> ~/.bashrc

_colyn_completion() {
    local cur prev words cword
    _init_completion || return

    # 所有可用命令
    local commands="init add list list-project lsp merge update remove checkout info status repair config setup tmux release completion todo"

    # 当前命令（第一个参数）
    local command="${words[1]}"

    # 如果还没有输入命令，补全命令列表
    if [[ $cword -eq 1 ]]; then
        COMPREPLY=($(compgen -W "$commands" -- "$cur"))
        return 0
    fi

    # 根据不同命令提供补全
    case "$command" in
        init)
            # init 命令没有参数
            return 0
            ;;

        add)
            # add <branch> - 补全 git 分支名
            if [[ $cword -eq 2 ]]; then
                _colyn_complete_available_branches
            fi
            return 0
            ;;

        list)
            # list 命令选项
            local list_opts="--json --paths --no-main"
            if [[ $cur == -* ]]; then
                COMPREPLY=($(compgen -W "$list_opts" -- "$cur"))
            fi
            return 0
            ;;

        merge)
            # merge [id|branch] [options]
            if [[ $cur == -* ]]; then
                local merge_opts="--no-rebase --no-update --update-all --no-fetch --skip-build -v --verbose"
                COMPREPLY=($(compgen -W "$merge_opts" -- "$cur"))
            elif [[ $cword -eq 2 ]]; then
                # 补全 worktree ID 和分支名
                _colyn_complete_worktrees
            fi
            return 0
            ;;

        update)
            # update [target] [--all] [--no-rebase]
            if [[ $cur == -* ]]; then
                local update_opts="--all --no-rebase"
                COMPREPLY=($(compgen -W "$update_opts" -- "$cur"))
            elif [[ $cword -eq 2 ]]; then
                _colyn_complete_worktrees
            fi
            return 0
            ;;

        remove)
            # remove [id|branch] [-y|--yes] [-f|--force] [-d|--delete-branch]
            if [[ $cur == -* ]]; then
                local remove_opts="-y --yes -f --force -d --delete-branch"
                COMPREPLY=($(compgen -W "$remove_opts" -- "$cur"))
            elif [[ $cword -eq 2 ]]; then
                # 补全 worktree ID 和分支名
                _colyn_complete_worktrees
            fi
            return 0
            ;;

        checkout|co)
            # checkout [id] <branch>
            if [[ $cword -eq 2 ]]; then
                # 第一个参数可以是 worktree ID
                _colyn_complete_worktree_ids
            elif [[ $cword -eq 3 ]]; then
                # 第二个参数是分支名
                _colyn_complete_available_branches
            fi
            return 0
            ;;

        info)
            # info 命令选项
            if [[ $cur == -* ]]; then
                local info_opts="-f --field --format -s --separator"
                COMPREPLY=($(compgen -W "$info_opts" -- "$cur"))
            elif [[ $prev == "-f" || $prev == "--field" ]]; then
                # 补全字段名
                local fields="project project-path worktree-id worktree-dir branch"
                COMPREPLY=($(compgen -W "$fields" -- "$cur"))
            fi
            return 0
            ;;

        status|st)
            # status 命令无参数
            return 0
            ;;

        repair)
            # repair 命令无参数
            return 0
            ;;

        config)
            # config 命令选项
            if [[ $cur == -* ]]; then
                COMPREPLY=($(compgen -W "--json" -- "$cur"))
            fi
            return 0
            ;;

        setup)
            # setup 命令无参数
            return 0
            ;;

        tmux)
            # tmux [start|stop] [-f|--force]
            if [[ $cur == -* ]]; then
                local tmux_opts="-f --force"
                COMPREPLY=($(compgen -W "$tmux_opts" -- "$cur"))
            elif [[ $cword -eq 2 ]]; then
                COMPREPLY=($(compgen -W "start stop" -- "$cur"))
            fi
            return 0
            ;;

        release)
            # release <version-type>
            if [[ $cword -eq 2 ]]; then
                COMPREPLY=($(compgen -W "patch minor major" -- "$cur"))
            fi
            return 0
            ;;

        completion)
            # completion [shell] [--install]
            if [[ $cur == -* ]]; then
                COMPREPLY=($(compgen -W "--install" -- "$cur"))
            elif [[ $cword -eq 2 ]]; then
                COMPREPLY=($(compgen -W "bash zsh" -- "$cur"))
            fi
            return 0
            ;;

        list-project|lsp)
            # list-project [--json] [-p|--paths]
            if [[ $cur == -* ]]; then
                local lsp_opts="--json -p --paths"
                COMPREPLY=($(compgen -W "$lsp_opts" -- "$cur"))
            fi
            return 0
            ;;

        todo)
            local subcommand="${words[2]}"
            # 第一级：补全子命令
            if [[ $cword -eq 2 ]]; then
                COMPREPLY=($(compgen -W "add start list ls remove archive complete uncomplete edit" -- "$cur"))
                return 0
            fi
            # 第二级：根据子命令补全参数
            case "$subcommand" in
                add)
                    if [[ $cword -eq 3 && $cur != -* ]]; then
                        # 补全 todoId 类型前缀
                        COMPREPLY=($(compgen -W "feature/ bugfix/ refactor/ document/" -- "$cur"))
                    fi
                    ;;
                start)
                    if [[ $cur == -* ]]; then
                        COMPREPLY=($(compgen -W "--no-clipboard" -- "$cur"))
                    elif [[ $cword -eq 3 ]]; then
                        _colyn_todo_ids
                    fi
                    ;;
                list|ls)
                    if [[ $cur == -* ]]; then
                        COMPREPLY=($(compgen -W "--completed --archived --id-only" -- "$cur"))
                    fi
                    ;;
                remove)
                    if [[ $cur == -* ]]; then
                        COMPREPLY=($(compgen -W "-y --yes" -- "$cur"))
                    elif [[ $cword -eq 3 ]]; then
                        _colyn_todo_ids
                    fi
                    ;;
                archive)
                    if [[ $cur == -* ]]; then
                        COMPREPLY=($(compgen -W "-y --yes" -- "$cur"))
                    fi
                    ;;
                complete)
                    if [[ $cword -eq 3 ]]; then
                        _colyn_todo_ids
                    fi
                    ;;
                uncomplete)
                    if [[ $cword -eq 3 ]]; then
                        _colyn_todo_completed_ids
                    fi
                    ;;
            esac
            return 0
            ;;

        *)
            # 未知命令，不提供补全
            return 0
            ;;
    esac
}

# 补全可用分支（排除已被任何 worktree 关联的分支）
_colyn_complete_available_branches() {
    local branches worktree_branches filtered
    branches=$(git branch -a 2>/dev/null | sed 's/^[* ]*//' | sed 's/remotes\/origin\///' | sort -u)
    worktree_branches=$(colyn list --json --no-main 2>/dev/null | grep -o '"branch":"[^"]*"' | cut -d'"' -f4)

    if [[ -n "$worktree_branches" ]]; then
        filtered=$(printf '%s\n' "$branches" | grep -vxF -f <(printf '%s\n' "$worktree_branches"))
    else
        filtered="$branches"
    fi

    COMPREPLY=($(compgen -W "$filtered" -- "$cur"))
}

# 补全 worktree ID 和分支名
_colyn_complete_worktrees() {
    # 尝试获取 worktree 列表（JSON 格式）
    local worktrees_json=$(colyn list --json --no-main 2>/dev/null)
    if [[ $? -eq 0 && -n "$worktrees_json" ]]; then
        # 提取 ID 和分支名
        local ids=$(echo "$worktrees_json" | grep -o '"id":[0-9]*' | cut -d: -f2)
        local branches=$(echo "$worktrees_json" | grep -o '"branch":"[^"]*"' | cut -d'"' -f4)
        COMPREPLY=($(compgen -W "$ids $branches" -- "$cur"))
    fi
}

# 补全 worktree ID（仅数字）
_colyn_complete_worktree_ids() {
    # 尝试获取 worktree 列表（JSON 格式）
    local worktrees_json=$(colyn list --json --no-main 2>/dev/null)
    if [[ $? -eq 0 && -n "$worktrees_json" ]]; then
        # 提取 ID
        local ids=$(echo "$worktrees_json" | grep -o '"id":[0-9]*' | cut -d: -f2)
        COMPREPLY=($(compgen -W "$ids" -- "$cur"))
    fi
}

# 补全待办 todo ID
_colyn_todo_ids() {
    local output
    output=$(colyn todo list --id-only 2>/dev/null)
    if [[ -n "$output" ]]; then
        COMPREPLY=($(compgen -W "$output" -- "$cur"))
    fi
}

# 补全已完成 todo ID
_colyn_todo_completed_ids() {
    local output
    output=$(colyn todo list --completed --id-only 2>/dev/null)
    if [[ -n "$output" ]]; then
        COMPREPLY=($(compgen -W "$output" -- "$cur"))
    fi
}

# 注册补全函数
complete -F _colyn_completion colyn
