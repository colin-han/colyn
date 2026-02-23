# Installation Guide

This chapter provides detailed information on the various ways to install and configure Colyn.

---

## System Requirements

### Required

- **Node.js**: 18.0.0 or higher
- **Git**: 2.15.0 or higher (with git worktree support)
- **Operating System**: macOS, Linux, or Windows

### Recommended

- **Volta**: Node.js version manager (recommended)
- **tmux**: Terminal multiplexer (optional, for tmux integration features)

---

## Installation Methods

### Method 1: Global npm Installation (Recommended)

This is the simplest installation method, suitable for most users.

```bash
# Using npm
npm install -g colyn-cli

# Or using volta (recommended)
volta install colyn-cli
```

**Advantages**:
- Simple installation, done with a single command
- Automatically added to the system PATH
- Easy version management and updates

**Verify Installation**:

```bash
colyn --version
# Output: 2.5.5
```

---

### Method 2: Using the Installation Script

Suitable for developers or users who need a custom installation location.

#### Step 1: Clone the Repository

```bash
git clone https://github.com/colinhan/colyn.git
cd colyn
```

#### Step 2: Run the Installation Script

```bash
volta run yarn install-to <target-directory>
```

**Examples**:

```bash
# Install to ~/my-tools/colyn
volta run yarn install-to ~/my-tools/colyn

# Install to /usr/local/lib/colyn
volta run yarn install-to /usr/local/lib/colyn
```

#### Step 3: Add to PATH

**macOS/Linux** (add to `~/.zshrc` or `~/.bashrc`):

```bash
export PATH="$PATH:$HOME/my-tools/colyn"
```

**Windows**:
- Open the system environment variable settings
- Add the target directory to PATH

#### What the Installation Script Does

The installation script automatically:
1. Builds the project (`volta run yarn build`)
2. Creates the target directory
3. Copies the necessary files (dist/, package.json, shell/)
4. Installs production dependencies
5. Creates a startup script (colyn or colyn.cmd)
6. **Configures shell integration** (calls `colyn setup`)

After installation, shell integration is already configured. Simply reopen your terminal to start using Colyn.

---

### Method 3: Using Yarn Link (For Developers)

Suitable for developers who need to modify the code frequently.

```bash
# In the project root directory
cd /path/to/colyn
volta run yarn link

# Use from anywhere
colyn --version
```

**Characteristics**:
- Changes take effect after recompiling
- Convenient for debugging and development
- To unlink: `volta run yarn unlink`

---

## Shell Integration Configuration

Shell integration is an important Colyn feature that provides:
- **Automatic Directory Switching**: Automatically switches to the target directory after command execution
- **Command Auto-completion**: Tab key completion for commands and arguments

### Automatic Configuration (Recommended)

```bash
colyn setup
```

This command will:
1. Automatically detect the shell type (bash or zsh)
2. Detect the configuration file location (~/.bashrc or ~/.zshrc)
3. Add the necessary configuration code
4. Display the configuration result

**Example output**:

```bash
✓ Detected shell: zsh
✓ Configuration file: /Users/username/.zshrc
✓ Shell integration configured

Please run the following command to apply the configuration:
  source ~/.zshrc

Or reopen your terminal.
```

### Manual Configuration

If automatic configuration fails, you can manually add the configuration to your shell config file.

**For Zsh** (edit `~/.zshrc`):

```bash
# Colyn shell integration
if command -v colyn &> /dev/null; then
  # Adjust path to match your actual installation location
  source /path/to/colyn.d/shell/colyn.sh
  source /path/to/colyn.d/shell/completion.zsh
fi
```

**For Bash** (edit `~/.bashrc`):

```bash
# Colyn shell integration
if command -v colyn &> /dev/null; then
  # Adjust path to match your actual installation location
  source /path/to/colyn.d/shell/colyn.sh
  source /path/to/colyn.d/shell/completion.bash
fi
```

### Verify Shell Integration

```bash
# In a test project
cd /tmp/test-project
colyn init -p 3000
colyn add test-branch

# If configured successfully, should automatically switch to worktrees/task-1/
pwd
# Output: /tmp/test-project/worktrees/task-1
```

---

## Auto-completion Configuration

Colyn supports command auto-completion for both Bash and Zsh.

### View Installation Instructions

```bash
# Bash
colyn completion bash --install

# Zsh
colyn completion zsh --install
```

### Manual Completion Installation

**Bash**:

```bash
# Generate the completion script
colyn completion bash > ~/.colyn-completion.bash

# Add to ~/.bashrc
echo "source ~/.colyn-completion.bash" >> ~/.bashrc

# Reload
source ~/.bashrc
```

**Zsh**:

```bash
# Generate the completion script
colyn completion zsh > ~/.colyn-completion.zsh

# Add to ~/.zshrc
echo "source ~/.colyn-completion.zsh" >> ~/.zshrc

# Reload
source ~/.zshrc
```

### Verify Auto-completion

```bash
# Type colyn then press Tab
colyn <Tab>

# Should display available commands
add       checkout  info      list      merge     remove    repair    ...

# Type a partial command then press Tab
colyn ad<Tab>
# Auto-completes to: colyn add
```

---

## Platform-Specific Notes

### macOS

It is recommended to use Homebrew to install dependencies:

```bash
# Install Node.js (using Volta)
curl https://get.volta.sh | bash
volta install node

# Install tmux (optional)
brew install tmux
```

### Linux

**Ubuntu/Debian**:

```bash
# Install Node.js (using Volta)
curl https://get.volta.sh | bash
volta install node

# Install tmux (optional)
sudo apt-get install tmux
```

**CentOS/RHEL**:

```bash
# Install Node.js (using Volta)
curl https://get.volta.sh | bash
volta install node

# Install tmux (optional)
sudo yum install tmux
```

### Windows

**Using PowerShell**:

```powershell
# Install Node.js (using Volta)
# Visit https://volta.sh/ to download the Windows installer

# Global installation of Colyn
npm install -g colyn-cli
```

**Notes**:
- Some shell integration features may be limited on Windows
- WSL2 (Windows Subsystem for Linux) is recommended for the best experience
- tmux integration requires WSL2 or Git Bash

---

## Updating Colyn

### Updating an npm Installation

```bash
# Check for the latest version
npm outdated -g colyn-cli

# Update to the latest version
npm update -g colyn-cli

# Or use volta
volta install colyn-cli
```

### Updating a Script Installation

```bash
# Pull the latest code
cd /path/to/colyn
git pull

# Re-run the installation script
volta run yarn install-to ~/my-tools/colyn
```

After updating, you need to reconfigure shell integration:

```bash
colyn setup
source ~/.zshrc  # or ~/.bashrc
```

---

## Uninstalling Colyn

### Uninstalling an npm Installation

```bash
npm uninstall -g colyn-cli

# Or use volta
volta uninstall colyn-cli
```

### Uninstalling a Script Installation

```bash
# Remove the installation directory
rm -rf ~/my-tools/colyn

# If a symbolic link was created
sudo rm /usr/local/bin/colyn
```

### Cleaning Up Configuration Files

Manually remove the relevant lines from your shell configuration file:

```bash
# Edit ~/.zshrc or ~/.bashrc
# Remove the following lines:
# source ~/my-tools/colyn/colyn.d/colyn.sh
# source ~/.colyn-completion.zsh
```

---

## Verifying Installation

After installation, run the following commands to verify:

```bash
# 1. Check the version
colyn --version

# 2. View help
colyn --help

# 3. Test the init command
mkdir -p /tmp/test-colyn
cd /tmp/test-colyn
git init
colyn init -p 3000

# 4. Test the add command
colyn add test-branch

# 5. Verify automatic switching
pwd
# Should output: /tmp/test-colyn/worktrees/task-1

# 6. Clean up the test
cd /tmp
rm -rf /tmp/test-colyn
```

---

## Frequently Asked Questions

### Q: "command not found: colyn"

**A**: Check the following:
1. Confirm it has been added to PATH: `echo $PATH`
2. Reload the shell configuration: `source ~/.zshrc`
3. Or use the absolute path: `~/my-tools/colyn/colyn`

### Q: Shell integration is not working

**A**: Make sure:
1. You have run `colyn setup`
2. You have reopened the terminal or run `source ~/.zshrc`
3. The relevant code exists in the configuration file

### Q: npm installation permission error

**A**: Use volta or fix npm permissions:
```bash
# Use volta (recommended)
curl https://get.volta.sh | bash
volta install colyn-cli

# Or fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
source ~/.zshrc
```

### Q: Cannot run on Windows

**A**: WSL2 is recommended:
```powershell
# Enable WSL2
wsl --install

# Install inside WSL2
wsl
curl https://get.volta.sh | bash
volta install colyn-cli
```

---

## Next Steps

After installation is complete, continue reading:
- [Quick Start](01-quick-start.md) - Get up and running in 5 minutes
- [Core Concepts](03-core-concepts.md) - Understanding how Colyn works
