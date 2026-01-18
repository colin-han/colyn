#compdef colyn
# Zsh completion script for colyn
#
# Installation:
#   source /path/to/completion.zsh
# Or add to ~/.zshrc:
#   echo "source /path/to/completion.zsh" >> ~/.zshrc

_colyn() {
    local -a commands
    commands=(
        'init:初始化 worktree 管理结构'
        'add:创建新的 worktree'
        'list:列出所有 worktree'
        'merge:合并 worktree 到主分支'
        'remove:删除 worktree'
        'checkout:在 worktree 中切换分支'
        'info:显示当前目录的项目信息'
        'completion:生成 shell 自动补全脚本'
    )

    local curcontext="$curcontext" state line
    typeset -A opt_args

    _arguments -C \
        '1: :->command' \
        '*::arg:->args'

    case $state in
        command)
            _describe 'colyn commands' commands
            ;;
        args)
            case $line[1] in
                init)
                    # init 命令没有参数
                    ;;
                add)
                    # add <branch>
                    _colyn_branches
                    ;;
                list)
                    _arguments \
                        '--json[以 JSON 格式输出]' \
                        '(-p --paths)'{-p,--paths}'[只输出路径]' \
                        '--no-main[不显示主分支]'
                    ;;
                merge)
                    _arguments \
                        '1: :_colyn_worktrees' \
                        '--push[合并后自动推送]' \
                        '--no-push[合并后不推送]'
                    ;;
                remove)
                    _arguments \
                        '1: :_colyn_worktrees' \
                        '(-y --yes)'{-y,--yes}'[跳过确认]' \
                        '(-f --force)'{-f,--force}'[强制删除（忽略未提交更改）]' \
                        '(-d --delete-branch)'{-d,--delete-branch}'[同时删除本地分支]'
                    ;;
                checkout|co)
                    _arguments \
                        '1: :_colyn_worktree_ids' \
                        '2: :_colyn_branches'
                    ;;
                info)
                    _arguments \
                        '(-f --field)'{-f,--field}'[输出指定字段]:field:_colyn_info_fields' \
                        '--format[使用模板字符串格式化输出]:template:' \
                        '(-s --separator)'{-s,--separator}'[多字段时的分隔符]:separator:'
                    ;;
                completion)
                    _arguments \
                        '1: :(bash zsh)' \
                        '--install[显示安装说明]'
                    ;;
            esac
            ;;
    esac
}

# 补全 git 分支名
_colyn_branches() {
    local -a branches
    branches=(${(f)"$(git branch -a 2>/dev/null | sed 's/^[* ]*//' | sed 's/remotes\/origin\///' | sort -u)"})
    _describe 'branches' branches
}

# 补全 worktree ID 和分支名
_colyn_worktrees() {
    local -a worktrees
    local worktrees_json=$(colyn list --json --no-main 2>/dev/null)

    if [[ $? -eq 0 && -n "$worktrees_json" ]]; then
        # 提取 ID 和分支名
        local -a ids branches
        ids=(${(f)"$(echo "$worktrees_json" | grep -o '"id":[0-9]*' | cut -d: -f2)"})
        branches=(${(f)"$(echo "$worktrees_json" | grep -o '"branch":"[^"]*"' | cut -d'"' -f4)"})

        # 组合 ID 和分支名
        local i
        for i in {1..${#ids[@]}}; do
            worktrees+=("${ids[$i]}:${branches[$i]}")
        done

        _describe 'worktrees' worktrees
    fi
}

# 补全 worktree ID（仅数字）
_colyn_worktree_ids() {
    local -a ids
    local worktrees_json=$(colyn list --json --no-main 2>/dev/null)

    if [[ $? -eq 0 && -n "$worktrees_json" ]]; then
        ids=(${(f)"$(echo "$worktrees_json" | grep -o '"id":[0-9]*' | cut -d: -f2)"})
        _describe 'worktree IDs' ids
    fi
}

# 补全 info 命令的字段名
_colyn_info_fields() {
    local -a fields
    fields=(
        'project:项目名称'
        'project-path:项目路径'
        'worktree-id:Worktree ID'
        'worktree-dir:Worktree 目录名'
        'branch:分支名'
    )
    _describe 'fields' fields
}

# 注册补全函数
# #compdef 指令会自动调用 _colyn 函数，不需要手动执行
compdef _colyn colyn
