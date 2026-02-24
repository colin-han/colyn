# Colyn Shell 集成（支持目录切换）
# 使用方法：将以下内容添加到 ~/.bashrc 或 ~/.zshrc
#   source /path/to/colyn/shell/colyn.sh

colyn() {
  # 定位 colyn 安装目录（兼容 bash 和 zsh）
  local COLYN_SHELL_DIR
  if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
    # bash
    COLYN_SHELL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  elif [[ -n "${ZSH_VERSION:-}" ]]; then
    # zsh
    COLYN_SHELL_DIR="$(cd "$(dirname "${(%):-%x}")" && pwd)"
  else
    # fallback
    COLYN_SHELL_DIR="$(cd "$(dirname "$0")" && pwd)"
  fi

  local COLYN_BIN="${COLYN_SHELL_DIR}/../../colyn"

  if [[ ! -f "$COLYN_BIN" ]]; then
    echo "错误: 找不到 colyn" >&2
    return 1
  fi

  # 调用 bin/colyn，捕获 stdout（业务输出 + 机器结果），stderr 直接显示
  local result
  result=$(COLYN_OUTPUT_JSON=1 "$COLYN_BIN" "$@")
  local exit_code=$?

  # 处理输出
  if [[ -n "$result" ]]; then
    # 截留 stdout 最后一条 JSON 行（控制消息），其余 stdout 原样透传
    local control_line body_output has_control_result
    control_line=$(printf '%s\n' "$result" | awk 'NF{line=$0} END{print line}')
    has_control_result=1

    if node -e "try{JSON.parse(process.argv[1]);process.exit(0)}catch(e){process.exit(1)}" "$control_line" 2>/dev/null; then
      has_control_result=0
      body_output=$(printf '%s\n' "$result" | awk '{lines[NR]=$0} NF{last=NR} END{for(i=1;i<=NR;i++){if(i==last)continue; print lines[i]}}')
    else
      body_output="$result"
    fi

    if [[ -n "$body_output" ]]; then
      printf '%s\n' "$body_output"
    fi

    if [[ $has_control_result -eq 0 ]]; then
      local target_dir display_path attach_session result_success
      result_success=$(node -e "try{const r=JSON.parse(process.argv[1]);process.stdout.write((r&&typeof r==='object'&&r.success===true)?'1':'0')}catch(e){process.stdout.write('0')}" "$control_line" 2>/dev/null)

      if [[ "$result_success" == "1" ]]; then
        attach_session=$(node -e "try{const r=JSON.parse(process.argv[1]);if(r&&typeof r==='object'&&typeof r.attachSession==='string')process.stdout.write(r.attachSession)}catch(e){}" "$control_line" 2>/dev/null)
        target_dir=$(node -e "try{const r=JSON.parse(process.argv[1]);if(r&&typeof r==='object'&&typeof r.targetDir==='string')process.stdout.write(r.targetDir)}catch(e){}" "$control_line" 2>/dev/null)

        if [[ -n "$attach_session" ]]; then
          # 需要连接到 tmux session
          exec tmux attach-session -t "$attach_session"
        elif [[ -n "$target_dir" && -d "$target_dir" ]]; then
          display_path=$(node -e "try{const r=JSON.parse(process.argv[1]);if(r&&typeof r==='object'){process.stdout.write(typeof r.displayPath==='string'&&r.displayPath?r.displayPath:(typeof r.targetDir==='string'?r.targetDir:''))}}catch(e){}" "$control_line" 2>/dev/null)
          cd "$target_dir" || return
          echo "📂 已切换到: $display_path"
        fi
      fi
    fi
  fi

  return $exit_code
}
