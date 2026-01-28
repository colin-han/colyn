# Colyn Local Installation Guide

This document explains how to install Colyn to a local directory for testing.

---

## Method 1: Using Installation Script (Recommended)

### Step 1: Run Installation Script

```bash
# Execute in project root directory
volta run yarn install-to <target-directory>
```

**Examples**:

```bash
# Install to ~/my-tools/colyn
volta run yarn install-to ~/my-tools/colyn

# Install to /usr/local/lib/colyn
volta run yarn install-to /usr/local/lib/colyn

# Install to any directory
volta run yarn install-to /path/to/target/directory
```

### Step 2: Installation Process

The script will automatically perform the following steps:

1. Compile project (`volta run yarn build`)
2. Create target directory
3. Copy compiled results (`dist/`)
4. Copy `package.json` and `shell/colyn.sh`
5. Install dependencies in target directory (`npm install --production`)
6. Create startup scripts (`colyn` and `colyn.cmd`)
7. Configure shell integration (automatically calls `colyn system-integration`)

After installation, shell integration is automatically configured. Reopen terminal to use.

### Step 3: Using Colyn

After installation, there are three ways to use it:

#### Method A: Add to PATH (Recommended)

Add target directory to PATH environment variable:

**macOS/Linux** (add to `~/.zshrc` or `~/.bashrc`):
```bash
export PATH="$PATH:$HOME/my-tools/colyn"
```

Then run from anywhere:
```bash
colyn --version
colyn init
colyn add feature/test
```

#### Method B: Create Symbolic Link

Create symbolic link to system path:

```bash
# macOS/Linux
sudo ln -s ~/my-tools/colyn/colyn /usr/local/bin/colyn

# Then run from anywhere
colyn --version
```

#### Method C: Use Absolute Path

Use absolute path directly:

```bash
~/my-tools/colyn/colyn init
~/my-tools/colyn/colyn add feature/test
```

---

## Method 2: Using Yarn Link

### Step 1: Create Global Link

```bash
cd /path/to/colyn
volta run yarn link
```

### Step 2: Using Colyn

In any project directory:

```bash
colyn --version
colyn init
colyn add feature/test
```

### Notes

- After using `yarn link`, project code changes take effect immediately (requires recompilation)
- To unlink: `volta run yarn unlink`

---

## Method 3: Global Installation (After Publishing)

If published to npm:

```bash
npm install -g colyn

# Or use volta
volta install colyn
```

After installation, configure shell integration:

```bash
colyn system-integration
```

After configuration, reopen terminal or run `source ~/.zshrc` (or `~/.bashrc`) to use full functionality.

**What is Shell Integration?**

Shell integration provides the following features:
- **Automatic directory switching**: Commands like `colyn add` and `colyn remove` automatically switch to target directory after execution
- **Command auto-completion**: Use Tab key to auto-complete commands and parameters (future support)

**Manual Configuration**

If `system-integration` command fails, manually add to shell configuration file:

```bash
# Find colyn.sh path
which colyn
# Example output: /Users/username/.volta/bin/colyn

# Add to ~/.zshrc or ~/.bashrc
source /path/to/colyn/shell/colyn.sh
```

---

## Verify Installation

### Check Version

```bash
colyn --version
# Output: 0.1.0
```

### View Help

```bash
colyn --help
# Output:
# Usage: colyn [options] [command]
#
# Git worktree management tool
#
# Options:
#   -V, --version      output the version number
#   -h, --help         display help for command
#
# Commands:
#   init [options]     Initialize worktree management structure
#   add <branch>       Create new worktree
#   help [command]     display help for command
```

### Test init Command

```bash
# Create test directory
mkdir -p /tmp/test-project
cd /tmp/test-project

# Initialize git repository
git init

# Run colyn init
colyn init --port 3000
```

### Test add Command

```bash
# In initialized project
cd /tmp/test-project/test-project

# Initialize a simple project
echo '{"name":"test"}' > package.json
git add . && git commit -m "init"

# Return to parent directory
cd ..

# Create worktree
colyn add feature/test
```

---

## Uninstall

### Installed with Installation Script

Delete target directory directly:

```bash
rm -rf ~/my-tools/colyn
```

If symbolic link was created:

```bash
sudo rm /usr/local/bin/colyn
```

### Using yarn link

```bash
cd /path/to/colyn
volta run yarn unlink
```

### Global Installation

```bash
npm uninstall -g colyn

# Or use volta
volta uninstall colyn
```

---

## FAQ

### Q: Installation script execution failed

**A:** Check the following:
1. Ensure executing in project root directory
2. Ensure Node.js 18+ is installed
3. Ensure Volta is installed
4. Check target directory permissions

### Q: Startup script has no execute permission

**A:** Manually add execute permission:

```bash
chmod +x ~/my-tools/colyn/colyn
```

### Q: "command not found" error

**A:** Check the following:
1. Confirm target directory is added to PATH
2. Reload shell configuration: `source ~/.zshrc` or `source ~/.bashrc`
3. Or use absolute path to execute

### Q: Dependency installation failed

**A:** May be network issue, try:

```bash
cd ~/my-tools/colyn
npm install --production --registry=https://registry.npmmirror.com
```

### Q: How to update after modifying code

**A:** Re-run installation script:

```bash
cd /path/to/colyn
volta run yarn install-to ~/my-tools/colyn
```

Script will overwrite previous installation.

---

## Development Workflow

Recommended development testing workflow:

1. **Development Phase**: Test directly in project
   ```bash
   volta run yarn build
   volta run yarn colyn init
   ```

2. **Local Testing**: Use installation script to install to test directory
   ```bash
   volta run yarn install-to ~/test/colyn
   ~/test/colyn/colyn init
   ```

3. **Frequent Changes**: Use yarn link
   ```bash
   volta run yarn link
   # Recompile after code changes
   volta run yarn build
   # Takes effect immediately
   colyn init
   ```

4. **Pre-release Testing**: Use installation script to install, fully test all features

---

## Installation Script Details

### Script Location

```
scripts/install.js
```

### Script Features

1. **Compile Project**: Execute `volta run yarn build`
2. **Copy Files**:
   - `dist/` directory (compiled code)
   - `package.json` (package configuration)
   - `shell/colyn.sh` (shell integration script)
   - `README.md` (optional)
3. **Install Dependencies**: Execute `npm install --production` in target directory
4. **Create Startup Scripts** (platform-specific):
   - **macOS/Linux**: Create `colyn` (executable script)
   - **Windows**: Create `colyn.cmd` (batch script)
5. **Configure Shell Integration** (macOS/Linux only):
   - Automatically call `colyn system-integration` command
   - Detect shell type and configuration file
   - Add `source` command to shell configuration file

**Platform Detection**: Script automatically detects operating system and only creates startup scripts for the corresponding platform, avoiding unnecessary files.

### Target Directory Structure

**macOS/Linux**:
```
<target-directory>/
├── colyn.d/           # Program files directory
│   ├── dist/          # Compiled code
│   ├── node_modules/  # Production dependencies
│   ├── colyn.sh       # Shell integration script
│   └── package.json   # Package configuration
└── colyn              # Unix startup script
```

**Windows**:
```
<target-directory>/
├── colyn.d/           # Program files directory
│   ├── dist/          # Compiled code
│   ├── node_modules/  # Production dependencies
│   ├── colyn.sh       # Shell integration script (for reference only)
│   └── package.json   # Package configuration
└── colyn.cmd          # Windows startup script
```

---

## Next Steps

After installation, you can:

1. Read user documentation to learn how to use Colyn
2. Check [README.md](../README.md) for project details
3. Check [docs/](../docs/) directory for design documents
4. Start using Colyn to manage your git worktrees!
