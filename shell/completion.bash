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
    local commands="init add list merge update remove checkout info status repair config setup tmux release completion"

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
                # 获取所有本地和远程分支
                local branches=$(git branch -a 2>/dev/null | sed 's/^[* ]*//' | sed 's/remotes\/origin\///' | sort -u)
                COMPREPLY=($(compgen -W "$branches" -- "$cur"))
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
            # merge [id|branch] [--push|--no-push]
            if [[ $cur == -* ]]; then
                local merge_opts="--push --no-push"
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
                local branches=$(git branch -a 2>/dev/null | sed 's/^[* ]*//' | sed 's/remotes\/origin\///' | sort -u)
                COMPREPLY=($(compgen -W "$branches" -- "$cur"))
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

        *)
            # 未知命令，不提供补全
            return 0
            ;;
    esac
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

# 注册补全函数
complete -F _colyn_completion colyn
