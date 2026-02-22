# 安装指南

本章详细介绍 Colyn 的各种安装方式和配置方法。

---

## 系统要求

### 必需

- **Node.js**: 18.0.0 或更高版本
- **Git**: 2.15.0 或更高版本（支持 git worktree 功能）
- **操作系统**: macOS、Linux 或 Windows

### 推荐

- **Volta**: Node.js 版本管理工具（推荐）
- **tmux**: 终端复用器（可选，用于 tmux 集成功能）

---

## 安装方式

### 方式 1: npm 全局安装（推荐）

这是最简单的安装方式，适合大多数用户。

```bash
# 使用 npm
npm install -g colyn

# 或使用 volta（推荐）
volta install colyn
```

**优点**：
- ✅ 安装简单，一条命令完成
- ✅ 自动添加到系统 PATH
- ✅ 便于版本管理和更新

**验证安装**：

```bash
colyn --version
# 输出: 2.5.5
```

---

### 方式 2: 使用安装脚本

适合开发者或需要自定义安装位置的用户。

#### 步骤 1: 克隆仓库

```bash
git clone https://github.com/colinhan/colyn.git
cd colyn
```

#### 步骤 2: 运行安装脚本

```bash
volta run yarn install-to <目标目录>
```

**示例**：

```bash
# 安装到 ~/my-tools/colyn
volta run yarn install-to ~/my-tools/colyn

# 安装到 /usr/local/lib/colyn
volta run yarn install-to /usr/local/lib/colyn
```

#### 步骤 3: 添加到 PATH

**macOS/Linux**（添加到 `~/.zshrc` 或 `~/.bashrc`）：

```bash
export PATH="$PATH:$HOME/my-tools/colyn"
```

**Windows**：
- 打开系统环境变量设置
- 将目标目录添加到 PATH

#### 安装脚本功能

安装脚本会自动：
1. 编译项目（`volta run yarn build`）
2. 创建目标目录
3. 复制必要文件（dist/、package.json、shell/）
4. 安装生产依赖
5. 创建启动脚本（colyn 或 colyn.cmd）
6. **配置 shell 集成**（调用 `colyn system-integration`）

安装完成后，shell 集成已自动配置，重新打开终端即可使用。

---

### 方式 3: 使用 Yarn Link（开发者）

适合需要频繁修改代码的开发者。

```bash
# 在项目根目录
cd /path/to/colyn
volta run yarn link

# 在任意位置使用
colyn --version
```

**特点**：
- ✅ 代码修改后重新编译即可生效
- ✅ 便于调试和开发
- ⚠️ 取消链接：`volta run yarn unlink`

---

## Shell 集成配置

Shell 集成是 Colyn 的重要功能，提供：
- **自动目录切换**: 命令执行后自动切换到目标目录
- **命令自动补全**: Tab 键补全命令和参数

### 自动配置（推荐）

```bash
colyn system-integration
```

该命令会：
1. 自动检测 shell 类型（bash 或 zsh）
2. 检测配置文件位置（~/.bashrc 或 ~/.zshrc）
3. 添加必要的配置代码
4. 显示配置结果

**输出示例**：

```bash
✓ 检测到 shell: zsh
✓ 配置文件: /Users/username/.zshrc
✓ Shell 集成已配置

请运行以下命令使配置生效：
  source ~/.zshrc

或重新打开终端。
```

### 手动配置

如果自动配置失败，可以手动添加到 shell 配置文件。

**对于 Zsh**（编辑 `~/.zshrc`）：

```bash
# Colyn shell integration
if command -v colyn &> /dev/null; then
  # 路径按实际安装位置调整
  source /path/to/colyn.d/shell/colyn.sh
  source /path/to/colyn.d/shell/completion.zsh
fi
```

**对于 Bash**（编辑 `~/.bashrc`）：

```bash
# Colyn shell integration
if command -v colyn &> /dev/null; then
  # 路径按实际安装位置调整
  source /path/to/colyn.d/shell/colyn.sh
  source /path/to/colyn.d/shell/completion.bash
fi
```

### 验证 Shell 集成

```bash
# 在测试项目中
cd /tmp/test-project
colyn init -p 3000
colyn add test-branch

# 如果配置成功，应该自动切换到 worktrees/task-1/
pwd
# 输出: /tmp/test-project/worktrees/task-1
```

---

## 自动补全配置

Colyn 支持 Bash 和 Zsh 的命令自动补全。

### 查看安装说明

```bash
# Bash
colyn completion bash --install

# Zsh
colyn completion zsh --install
```

### 手动安装补全

**Bash**：

```bash
# 生成补全脚本
colyn completion bash > ~/.colyn-completion.bash

# 添加到 ~/.bashrc
echo "source ~/.colyn-completion.bash" >> ~/.bashrc

# 重新加载
source ~/.bashrc
```

**Zsh**：

```bash
# 生成补全脚本
colyn completion zsh > ~/.colyn-completion.zsh

# 添加到 ~/.zshrc
echo "source ~/.colyn-completion.zsh" >> ~/.zshrc

# 重新加载
source ~/.zshrc
```

### 验证自动补全

```bash
# 输入 colyn 后按 Tab
colyn <Tab>

# 应该显示可用命令
add       checkout  info      list      merge     remove    repair    ...

# 输入部分命令后按 Tab
colyn ad<Tab>
# 自动补全为: colyn add
```

---

## 平台特定说明

### macOS

推荐使用 Homebrew 安装依赖：

```bash
# 安装 Node.js（使用 Volta）
curl https://get.volta.sh | bash
volta install node

# 安装 tmux（可选）
brew install tmux
```

### Linux

**Ubuntu/Debian**：

```bash
# 安装 Node.js（使用 Volta）
curl https://get.volta.sh | bash
volta install node

# 安装 tmux（可选）
sudo apt-get install tmux
```

**CentOS/RHEL**：

```bash
# 安装 Node.js（使用 Volta）
curl https://get.volta.sh | bash
volta install node

# 安装 tmux（可选）
sudo yum install tmux
```

### Windows

**使用 PowerShell**：

```powershell
# 安装 Node.js（使用 Volta）
# 访问 https://volta.sh/ 下载 Windows 安装程序

# 全局安装 Colyn
npm install -g colyn
```

**注意**：
- Windows 上部分 shell 集成功能可能受限
- 推荐使用 WSL2（Windows Subsystem for Linux）以获得最佳体验
- tmux 集成需要在 WSL2 或 Git Bash 中使用

---

## 更新 Colyn

### npm 安装的更新

```bash
# 检查最新版本
npm outdated -g colyn

# 更新到最新版本
npm update -g colyn

# 或使用 volta
volta install colyn
```

### 安装脚本安装的更新

```bash
# 拉取最新代码
cd /path/to/colyn
git pull

# 重新运行安装脚本
volta run yarn install-to ~/my-tools/colyn
```

更新后需要重新配置 shell 集成：

```bash
colyn system-integration
source ~/.zshrc  # 或 ~/.bashrc
```

---

## 卸载 Colyn

### npm 安装的卸载

```bash
npm uninstall -g colyn

# 或使用 volta
volta uninstall colyn
```

### 安装脚本安装的卸载

```bash
# 删除安装目录
rm -rf ~/my-tools/colyn

# 如果创建了符号链接
sudo rm /usr/local/bin/colyn
```

### 清理配置文件

手动从 shell 配置文件中删除相关行：

```bash
# 编辑 ~/.zshrc 或 ~/.bashrc
# 删除以下行：
# source ~/my-tools/colyn/colyn.d/colyn.sh
# source ~/.colyn-completion.zsh
```

---

## 验证安装

安装完成后，运行以下命令验证：

```bash
# 1. 检查版本
colyn --version

# 2. 查看帮助
colyn --help

# 3. 测试 init 命令
mkdir -p /tmp/test-colyn
cd /tmp/test-colyn
git init
colyn init -p 3000

# 4. 测试 add 命令
colyn add test-branch

# 5. 验证自动切换
pwd
# 应该输出: /tmp/test-colyn/worktrees/task-1

# 6. 清理测试
cd /tmp
rm -rf /tmp/test-colyn
```

---

## 常见问题

### Q: "command not found: colyn"

**A**: 检查以下几点：
1. 确认已添加到 PATH：`echo $PATH`
2. 重新加载 shell 配置：`source ~/.zshrc`
3. 或使用绝对路径：`~/my-tools/colyn/colyn`

### Q: Shell 集成不工作

**A**: 确保：
1. 已运行 `colyn system-integration`
2. 重新打开终端或运行 `source ~/.zshrc`
3. 检查配置文件中是否有相关代码

### Q: npm 安装权限错误

**A**: 使用 volta 或修复 npm 权限：
```bash
# 使用 volta（推荐）
curl https://get.volta.sh | bash
volta install colyn

# 或修复 npm 权限
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
source ~/.zshrc
```

### Q: Windows 上无法运行

**A**: 推荐使用 WSL2：
```powershell
# 启用 WSL2
wsl --install

# 在 WSL2 中安装
wsl
curl https://get.volta.sh | bash
volta install colyn
```

---

## 下一步

安装完成后，继续阅读：
- [快速开始](01-quick-start.md) - 5 分钟快速上手
- [核心概念](03-core-concepts.md) - 理解 Colyn 的工作原理
