# Colyn 本地安装指南

本文档说明如何将 Colyn 安装到本地目录进行测试。

---

## 方式 1: 使用安装脚本（推荐）

### 步骤 1: 运行安装脚本

```bash
# 在项目根目录执行
volta run yarn install-to <目标目录>
```

**示例**：

```bash
# 安装到 ~/my-tools/colyn
volta run yarn install-to ~/my-tools/colyn

# 安装到 /usr/local/lib/colyn
volta run yarn install-to /usr/local/lib/colyn

# 安装到任意目录
volta run yarn install-to /path/to/target/directory
```

### 步骤 2: 安装过程

脚本会自动执行以下步骤：

1. ✅ 编译项目（`volta run yarn build`）
2. ✅ 创建目标目录
3. ✅ 复制编译结果（`dist/`）
4. ✅ 复制 `package.json` 和 `shell/colyn.sh`
5. ✅ 在目标目录安装依赖（`npm install --production`）
6. ✅ 创建启动脚本（`colyn` 和 `colyn.cmd`）
7. ✅ 配置 shell 集成（自动调用 `colyn setup`）

安装完成后，shell 集成已自动配置，重新打开终端即可使用。

### 步骤 3: 使用 Colyn

安装完成后，有三种使用方式：

#### 方式 A: 添加到 PATH（推荐）

将目标目录添加到 PATH 环境变量：

**macOS/Linux** (添加到 `~/.zshrc` 或 `~/.bashrc`)：
```bash
export PATH="$PATH:$HOME/my-tools/colyn"
```

然后在任意位置运行：
```bash
colyn --version
colyn init
colyn add feature/test
```

#### 方式 B: 创建符号链接

创建符号链接到系统路径：

```bash
# macOS/Linux
sudo ln -s ~/my-tools/colyn/colyn /usr/local/bin/colyn

# 然后在任意位置运行
colyn --version
```

#### 方式 C: 使用绝对路径

直接使用绝对路径：

```bash
~/my-tools/colyn/colyn init
~/my-tools/colyn/colyn add feature/test
```

---

## 方式 2: 使用 Yarn Link

### 步骤 1: 创建全局链接

```bash
cd /path/to/colyn
volta run yarn link
```

### 步骤 2: 使用 Colyn

在任意项目目录中：

```bash
colyn --version
colyn init
colyn add feature/test
```

### 注意事项

- 使用 `yarn link` 后，项目代码的修改会立即生效（需要重新编译）
- 取消链接：`volta run yarn unlink`

---

## 方式 3: 全局安装（发布后）

如果已发布到 npm：

```bash
npm install -g colyn

# 或使用 volta
volta install colyn
```

安装后需要配置 shell 集成：

```bash
colyn setup
```

配置完成后，重新打开终端或运行 `source ~/.zshrc`（或 `~/.bashrc`）即可使用完整功能。

**什么是 shell 集成？**

shell 集成提供以下功能：
- **自动目录切换**：`colyn add` 和 `colyn remove` 等命令执行后自动切换到目标目录
- **命令自动补全**：使用 Tab 键自动补全命令和参数（未来支持）

**手动配置**

如果 `setup` 命令失败，可以手动添加到 shell 配置文件：

```bash
# 找到 colyn.sh 的路径
which colyn
# 输出示例：/Users/username/.volta/bin/colyn

# 添加到 ~/.zshrc 或 ~/.bashrc
source /path/to/colyn/shell/colyn.sh
```

---

## 验证安装

### 检查版本

```bash
colyn --version
# 输出: 0.1.0
```

### 查看帮助

```bash
colyn --help
# 输出:
# Usage: colyn [options] [command]
#
# Git worktree 管理工具
#
# Options:
#   -V, --version      output the version number
#   -h, --help         display help for command
#
# Commands:
#   init [options]     初始化 worktree 管理结构
#   add <branch>       创建新的 worktree
#   help [command]     display help for command
```

### 测试 init 命令

```bash
# 创建测试目录
mkdir -p /tmp/test-project
cd /tmp/test-project

# 初始化 git 仓库
git init

# 运行 colyn init
colyn init --port 3000
```

### 测试 add 命令

```bash
# 在已初始化的项目中
cd /tmp/test-project/test-project

# 初始化一个简单项目
echo '{"name":"test"}' > package.json
git add . && git commit -m "init"

# 返回上层目录
cd ..

# 创建 worktree
colyn add feature/test
```

---

## 卸载

### 使用安装脚本安装的

直接删除目标目录：

```bash
rm -rf ~/my-tools/colyn
```

如果创建了符号链接：

```bash
sudo rm /usr/local/bin/colyn
```

### 使用 yarn link 的

```bash
cd /path/to/colyn
volta run yarn unlink
```

### 全局安装的

```bash
npm uninstall -g colyn

# 或使用 volta
volta uninstall colyn
```

---

## 常见问题

### Q: 安装脚本执行失败

**A:** 检查以下几点：
1. 确保在项目根目录执行
2. 确保已安装 Node.js 18+
3. 确保已安装 Volta
4. 检查目标目录权限

### Q: 启动脚本没有执行权限

**A:** 手动添加执行权限：

```bash
chmod +x ~/my-tools/colyn/colyn
```

### Q: 提示 "command not found"

**A:** 检查以下几点：
1. 确认目标目录已添加到 PATH
2. 重新加载 shell 配置：`source ~/.zshrc` 或 `source ~/.bashrc`
3. 或使用绝对路径执行

### Q: 依赖安装失败

**A:** 可能是网络问题，尝试：

```bash
cd ~/my-tools/colyn
npm install --production --registry=https://registry.npmmirror.com
```

### Q: 修改代码后如何更新

**A:** 重新运行安装脚本：

```bash
cd /path/to/colyn
volta run yarn install-to ~/my-tools/colyn
```

脚本会覆盖之前的安装。

---

## 开发工作流

推荐的开发测试流程：

1. **开发阶段**：在项目内直接测试
   ```bash
   volta run yarn build
   volta run yarn colyn init
   ```

2. **本地测试**：使用安装脚本安装到测试目录
   ```bash
   volta run yarn install-to ~/test/colyn
   ~/test/colyn/colyn init
   ```

3. **频繁修改**：使用 yarn link
   ```bash
   volta run yarn link
   # 修改代码后重新编译
   volta run yarn build
   # 立即生效
   colyn init
   ```

4. **发布前测试**：使用安装脚本安装，完整测试所有功能

---

## 安装脚本说明

### 脚本位置

```
scripts/install.js
```

### 脚本功能

1. **编译项目**：执行 `volta run yarn build`
2. **复制文件**：
   - `dist/` 目录（编译后的代码）
   - `package.json`（包配置）
   - `shell/colyn.sh`（shell 集成脚本）
   - `README.md`（可选）
3. **安装依赖**：在目标目录执行 `npm install --production`
4. **创建启动脚本**（根据平台）：
   - **macOS/Linux**：创建 `colyn`（可执行脚本）
   - **Windows**：创建 `colyn.cmd`（批处理脚本）
5. **配置 shell 集成**（仅 macOS/Linux）：
   - 自动调用 `colyn setup` 命令
   - 检测 shell 类型和配置文件
   - 添加 `source` 命令到 shell 配置文件

**平台检测**：脚本会自动检测运行的操作系统，只创建对应平台的启动脚本，避免不必要的文件。

### 目标目录结构

**macOS/Linux**：
```
<目标目录>/
├── colyn.d/           # 程序文件目录
│   ├── dist/          # 编译后的代码
│   ├── node_modules/  # 生产依赖
│   ├── colyn.sh       # Shell 集成脚本
│   └── package.json   # 包配置
└── colyn              # Unix 启动脚本
```

**Windows**：
```
<目标目录>/
├── colyn.d/           # 程序文件目录
│   ├── dist/          # 编译后的代码
│   ├── node_modules/  # 生产依赖
│   ├── colyn.sh       # Shell 集成脚本（仅供参考）
│   └── package.json   # 包配置
└── colyn.cmd          # Windows 启动脚本
```

---

## 下一步

安装完成后，你可以：

1. 阅读用户文档了解如何使用 Colyn
2. 查看 [README.md](../README.md) 了解项目详情
3. 查看 [docs/](../docs/) 目录查看设计文档
4. 开始使用 Colyn 管理你的 git worktree！
