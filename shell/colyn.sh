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

  # 调用 bin/colyn，捕获 stdout（JSON），stderr 直接显示
  local result
  result=$("$COLYN_BIN" "$@")
  local exit_code=$?

  # 处理输出
  if [[ -n "$result" ]]; then
    # 尝试解析 JSON
    local target_dir display_path
    target_dir=$(node -e "try{const r=JSON.parse(process.argv[1]);if(r.success&&r.targetDir)console.log(r.targetDir)}catch(e){process.exit(1)}" "$result" 2>/dev/null)

    if [[ $? -eq 0 && -n "$target_dir" && -d "$target_dir" ]]; then
      # 是 JSON 且有目标目录
      display_path=$(node -e "try{const r=JSON.parse(process.argv[1]);console.log(r.displayPath||r.targetDir)}catch(e){}" "$result" 2>/dev/null)
      cd "$target_dir" || return
      echo "📂 已切换到: $display_path"
    else
      # 不是 JSON，原样输出（如 --help）
      echo "$result"
    fi
  fi

  return $exit_code
}
