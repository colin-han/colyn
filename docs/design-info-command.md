# Info 命令设计文档

## 概述

`colyn info` 命令用于查询当前目录在 colyn 项目中的状态信息，支持多种输出格式以适应不同的使用场景。

## 命令语法

```bash
colyn info [选项]
```

## 选项

| 选项 | 短选项 | 说明 |
|------|--------|------|
| `--short` | `-S` | 输出简短标识符（带分支信息），支持降级 |
| `--field=<name>` | `-f <name>` | 输出指定字段（可多次使用） |
| `--format=<template>` | | 使用模板字符串格式化输出 |
| `--separator=<char>` | `-s <char>` | 多字段时的分隔符（默认 tab） |

## 可用字段

| 字段名 | 说明 | 示例值 |
|--------|------|--------|
| `project` | 主目录名称 | `myapp` |
| `project-path` | 主目录完整路径 | `/Users/me/work/myapp/myapp` |
| `worktree-id` | worktree ID（主分支为 0） | `1` |
| `worktree-dir` | worktree 目录名 | `task-1` |
| `branch` | 当前分支名称 | `feature/login` |

## 使用场景

### 1. 输出简短标识符（推荐用于 shell 提示符）

输出格式：`{project}/{worktree-dir} (⎇ {branch})`，支持智能降级。

```bash
# 在 colyn 项目中
$ colyn info --short
myapp/task-1 (⎇ feature/login)

# 在 git 仓库中（未初始化 colyn）
$ colyn info --short
my-repo (⎇ main)

# 在非 git 目录中
$ colyn info --short
my-folder
```

**降级策略**：
1. **Colyn 项目**：显示 `{project}/{worktree-dir} (⎇ {branch})`
2. **Git 仓库**：显示 `{repo-name} (⎇ {branch})`
3. **普通目录**：显示 `{dir-name}`

**使用场景**：
- Shell 提示符：`PS1='[$(colyn info -S)] $ '`
- 终端标题：`echo -ne "\033]0;$(colyn info -S)\007"`
- 日志前缀：`echo "[$(colyn info -S)] Starting build..."`

### 2. 人工查看状态（无参数）

显示所有信息，带颜色和标签，便于阅读。

```bash
$ colyn info
📁 Project:      myapp
📂 Project Path: /Users/me/work/myapp/myapp
🔢 Worktree ID:  1
📁 Worktree Dir: task-1
🌿 Branch:       feature/login
```

### 3. 获取单个字段

输出纯文本，适合在脚本中使用。

```bash
$ colyn info -f branch
feature/login

$ colyn info --field=project-path
/Users/me/work/myapp/myapp
```

### 3. 获取单个字段

输出纯文本，适合在脚本中使用。

```bash
$ colyn info -f branch
feature/login

$ colyn info --field=project-path
/Users/me/work/myapp/myapp
```

### 4. 获取多个字段

默认用 tab 分隔，可自定义分隔符。

```bash
$ colyn info -f project -f branch
myapp	feature/login

$ colyn info -f project -f branch -s "/"
myapp/feature/login

$ colyn info -f project -f worktree-id -s ":"
myapp:1
```

### 5. 模板字符串格式化

使用 `{field-name}` 占位符。

```bash
$ colyn info --format="{project}/{worktree-dir}"
myapp/task-1

$ colyn info --format="当前在 {branch} 分支工作"
当前在 feature/login 分支工作

$ colyn info --format="{project}:{worktree-id}:{branch}"
myapp:1:feature/login
```

## 位置要求

### 使用 --short 选项

`--short` 选项支持在任何位置运行，会自动降级：
- 在 colyn 项目中：显示完整信息
- 在 git 仓库中：显示仓库名和分支
- 在普通目录中：显示目录名

### 使用其他选项

命令必须在以下位置之一执行：

1. **主分支目录**（或其子目录）
   - `worktree-id` 为 `0`
   - `worktree-dir` 为主分支目录名（与 `project` 相同）

2. **worktree 目录**（或其子目录）
   - `worktree-id` 为实际的 worktree ID
   - `worktree-dir` 为 `task-{id}` 格式

在其他位置（如项目根目录、`.colyn` 目录）执行会报错：

```bash
$ cd /path/to/project
$ colyn info
错误: 当前目录不在 worktree 或主分支中
提示: 请切换到主分支目录或某个 worktree 目录
```

## 实现细节

### 检测当前位置

1. 调用 `findProjectRoot()` 找到项目根目录
2. 判断当前目录是否在 `{root}/{mainDirName}` 下（主分支）
3. 判断当前目录是否在 `{root}/worktrees/task-*` 下（worktree）
4. 如果都不是，报错退出

### 获取分支信息

- 使用 simple-git 的 `branch()` 方法获取当前分支名称

### 输出格式选择

```
有 --short 参数？  → 输出简短标识符（支持降级）
有 --format 参数？ → 使用模板字符串渲染
有 --field 参数？  → 输出指定字段（用分隔符连接）
都没有？          → 输出带颜色标签的完整信息
```

### --short 选项的降级逻辑

```typescript
async function getShortId(): Promise<string> {
  try {
    // 1. 尝试获取 colyn 信息
    const info = await getLocationInfo();
    return `${info.project}/${info.worktreeDir} (⎇ ${info.branch})`;
  } catch {
    try {
      // 2. 尝试获取 git 仓库名和分支
      const gitRoot = await getGitRoot();
      if (gitRoot) {
        const git = simpleGit();
        const branch = await git.branchLocal();
        const repoName = path.basename(gitRoot);
        return `${repoName} (⎇ ${branch.current})`;
      }
    } catch {
      // 忽略 git 错误，继续降级
    }

    // 3. 使用当前目录名
    return path.basename(process.cwd());
  }
}
```

## 退出码

| 退出码 | 说明 |
|--------|------|
| 0 | 成功 |
| 1 | 未找到项目根目录 |
| 2 | 不在 worktree 或主分支目录中 |
| 3 | 无效的字段名 |
