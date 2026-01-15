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

### 1. 人工查看状态（无参数）

显示所有信息，带颜色和标签，便于阅读。

```bash
$ colyn info
📁 Project:      myapp
📂 Project Path: /Users/me/work/myapp/myapp
🔢 Worktree ID:  1
📁 Worktree Dir: task-1
🌿 Branch:       feature/login
```

### 2. 获取单个字段

输出纯文本，适合在脚本中使用。

```bash
$ colyn info -f branch
feature/login

$ colyn info --field=project-path
/Users/me/work/myapp/myapp
```

### 3. 获取多个字段

默认用 tab 分隔，可自定义分隔符。

```bash
$ colyn info -f project -f branch
myapp	feature/login

$ colyn info -f project -f branch -s "/"
myapp/feature/login

$ colyn info -f project -f worktree-id -s ":"
myapp:1
```

### 4. 模板字符串格式化

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
有 --format 参数？ → 使用模板字符串渲染
有 --field 参数？ → 输出指定字段（用分隔符连接）
都没有？         → 输出带颜色标签的完整信息
```

## 退出码

| 退出码 | 说明 |
|--------|------|
| 0 | 成功 |
| 1 | 未找到项目根目录 |
| 2 | 不在 worktree 或主分支目录中 |
| 3 | 无效的字段名 |
