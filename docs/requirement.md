# 需求文档 - Git Worktree 管理工具（Colyn）

**创建时间**：2026-01-14
**负责人**：kejinghan
**状态**：草稿

---

## 1. 需求概述

### 1.1 需求背景

在进行 Web 应用并行开发时，开发者经常需要同时处理多个功能分支。传统的 git 分支切换方式存在以下痛点：

1. **上下文丢失**：在不同任务间切换时，需要频繁 stash 或 commit，容易丢失工作状态
2. **服务器冲突**：只能启动一个开发服务器，无法同时测试多个功能分支
3. **效率低下**：切换分支需要等待依赖重新安装、编译等过程

虽然 git worktree 可以解决这些问题，但原生命令使用复杂，缺乏针对 Web 开发场景的便捷工具。

### 1.2 需求目标

开发一个命令行工具 `colyn`，用于：

1. 简化 git worktree 的创建和管理流程
2. 自动处理多个开发服务器的端口配置，避免端口冲突
3. 提供直观的命令接口，方便日常开发使用
4. 支持跨平台使用（macOS、Linux、Windows）

### 1.3 目标用户

- 需要同时开发和测试多个功能的前端/全栈开发者
- 使用 git 进行版本控制的 Web 应用开发团队
- 需要频繁在多个分支间切换的开发者

---

## 2. 功能需求

### 2.1 核心功能

1. **初始化（init）**
   - 描述：在现有项目中初始化 worktree 管理结构
   - 说明：
     - 在当前目录（根目录）下创建两个子目录：主分支目录（与根目录同名）和 `worktrees` 目录
     - 将当前目录的所有内容（包括 `.git` 目录）移动到主分支目录
     - 创建或更新 `.env.local` 文件，配置 `PORT` 和 `WORKTREE` 环境变量
     - 创建或更新 `.gitignore` 文件，添加 `.env.local` 忽略规则
     - 智能检测：如果已存在相关目录结构，则补全缺失的部分而不是报错

2. **创建 worktree（add/create）**
   - 描述：创建新的 worktree 目录并关联到指定的 git 分支
   - 说明：
     - 接受参数：git 分支名称
     - 自动生成 worktree 目录名：`task-{id}`（id 为递增序号）
     - 将 worktree 目录创建在 `worktrees` 目录下
     - 复制主分支的 `.env.local` 到新 worktree，并修改 `PORT=主分支PORT+id`、`WORKTREE=id`
     - 如果分支已存在对应的 worktree，则报错退出

3. **合并 worktree（merge）**
   - 描述：将 worktree 的更改合并回主分支
   - 说明：
     - 接受参数：git 分支名或 worktree id，可选参数 `--push` 决定是否推送到远程
     - 验证步骤：
       - 检查 worktree 目录是否干净（无未提交文件），如不干净则报错退出
       - 将 main 分支合并到 worktree，如失败则报错退出
     - 显示 worktree 信息（id、分支、相对主分支的变化）
     - 等待用户确认后，合并到主分支
     - 如果指定了 `--push` 参数，自动推送到远程仓库
     - 合并后保留 worktree 目录，不自动删除

4. **签出分支（checkout）**
   - 描述：在指定的 worktree 中切换或创建分支
   - 说明：
     - 接受参数：worktree id 和分支名
     - 检查当前分支是否已合并回主分支，如未合并则提示用户确认
     - 在 worktree 目录中创建或签出指定分支

### 2.2 次要功能

- **列表查看（list）**：显示所有 worktree 的信息（id、分支名、端口、路径）
- **查看状态（status）**：显示指定 worktree 相对于主分支的修改统计

### 2.3 功能范围

**包含：**
- Git worktree 的创建、合并、切换管理
- 环境变量自动配置（PORT、WORKTREE）
- 跨平台支持（macOS、Linux、Windows）
- 基本的状态查询和信息展示

**不包含：**
- 开发服务器的自动启动和管理
- 依赖安装和编译流程的自动化
- Git 操作之外的项目管理功能
- 远程协作和团队同步功能

---

## 3. 用户场景与流程

### 3.1 典型使用场景

**场景1：初次使用工具**
- 使用者：开发者
- 前置条件：已有一个 git 项目
- 操作步骤：
  1. 在项目根目录运行 `colyn init`
  2. 输入主分支的开发服务器端口（如 10000）
  3. 工具自动创建目录结构并配置环境变量
- 预期结果：项目结构重组完成，可以开始创建 worktree

**场景2：并行开发多个功能**
- 使用者：开发者
- 前置条件：已完成初始化
- 操作步骤：
  1. 运行 `colyn add feature-login` 创建登录功能分支的 worktree
  2. 运行 `colyn add feature-dashboard` 创建仪表板功能分支的 worktree
  3. 在各自的 worktree 目录中启动开发服务器（端口自动配置为 10001 和 10002）
  4. 同时在浏览器中测试两个功能
- 预期结果：两个功能可以独立开发和测试，互不干扰

**场景3：完成功能后合并**
- 使用者：开发者
- 前置条件：已在 worktree 中完成功能开发
- 操作步骤：
  1. 在 worktree 中提交所有更改
  2. 运行 `colyn merge feature-login` 或 `colyn merge 1`
  3. 查看合并预览信息
  4. 确认合并
  5. 运行 `colyn merge feature-login --push` 同时推送到远程
- 预期结果：功能分支合并到主分支，worktree 保留供后续使用

**场景4：在 worktree 中切换分支**
- 使用者：开发者
- 前置条件：已有 worktree
- 操作步骤：
  1. 运行 `colyn checkout 1 bugfix-issue-123`
  2. 如果当前分支未合并，确认是否继续
  3. 工具在 worktree 中签出新分支
- 预期结果：可以在同一个 worktree 中切换到新任务

### 3.2 主要工作流程

```
1. 初始化项目
   └─> colyn init
       └─> 设置主分支端口
           └─> 创建目录结构

2. 创建并行开发环境
   └─> colyn add <branch-name>
       └─> 自动分配端口
           └─> 创建 worktree
               └─> 在新目录中开发

3. 合并功能
   └─> 提交所有更改
       └─> colyn merge <id|branch> [--push]
           └─> 检查状态
               └─> 预览变化
                   └─> 确认合并
                       └─> (可选) 推送到远程

4. 查看状态
   └─> colyn list (查看所有 worktree)
   └─> colyn status <id> (查看具体变化)
```

---

## 4. 数据需求

### 4.1 数据输入

| 数据项 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 分支名 | string | 是 | 创建 worktree 或签出时使用的 git 分支名 |
| 主端口 | number | 是（仅初始化） | 主分支开发服务器的端口号，默认 10000 |
| worktree id | number | 否 | 用于标识特定 worktree 的序号 |
| --push 标志 | boolean | 否 | 合并后是否推送到远程仓库 |

### 4.2 数据输出

| 数据项 | 类型 | 说明 |
|--------|------|------|
| worktree 列表 | array | 包含 id、分支名、端口、路径的列表 |
| 变化统计 | object | 文件变化数、新增/删除行数等 git diff 统计 |
| 操作结果 | string | 命令执行的成功/失败消息 |

### 4.3 数据来源与存储

- **数据来源**：
  - Git 仓库信息（通过 git 命令获取）
  - `.env.local` 文件中的环境变量配置
  - 文件系统中的目录结构

- **数据存储**：
  - 环境变量存储在各 worktree 的 `.env.local` 文件中
  - Worktree 元数据存储在 git 仓库的 `.git/worktrees` 中
  - 可能需要工具自己的配置文件（如 `.colyn/config.json`）来存储 worktree id 映射

- **数据量级**：
  - 预计单个项目的 worktree 数量：2-10 个
  - 配置文件大小：< 10KB

---

## 5. 用户体验要求

### 5.1 交互方式

- **触发方式**：通过命令行子命令触发，如 `colyn init`、`colyn add <branch>`
- **主要交互**：
  - 命令行参数输入
  - 关键操作（如合并）需要用户确认
  - 清晰的进度提示和结果反馈
- **反馈机制**：
  - 成功操作显示绿色 ✓ 标记和简洁消息
  - 错误操作显示红色 ✗ 标记和详细错误信息
  - 警告操作显示黄色 ⚠ 标记和提示信息

### 5.2 界面要求

- **命令行输出格式**：
  - 使用表格展示列表信息（使用 cli-table3 等库）
  - 使用颜色区分不同类型的信息（chalk 库）
  - 进度操作使用 spinner 或进度条

- **关键元素**：
  - 清晰的命令使用说明（--help）
  - 直观的错误提示
  - 信息层次分明

### 5.3 可访问性

- 支持 `--no-color` 选项，禁用颜色输出
- 支持 `--verbose` 选项，显示详细日志
- 支持 `--quiet` 选项，减少输出信息

---

## 6. 非功能性需求

### 6.1 性能要求

- **响应时间**：常规命令（如 list、status）应在 1 秒内完成
- **并发处理**：不涉及并发，单用户单进程使用
- **数据量**：支持管理至少 20 个 worktree

### 6.2 安全要求

- **认证**：不涉及
- **授权**：依赖系统文件权限
- **数据保护**：
  - 不自动提交或推送代码
  - 关键操作（如合并）需要用户确认
  - 操作失败时不删除用户数据

### 6.3 可靠性要求

- **可用性**：工具崩溃不应影响 git 仓库完整性
- **容错性**：
  - 检测到不一致状态时应提示修复方案
  - 操作失败应提供回滚或恢复指引
- **数据一致性**：
  - `.env.local` 文件的端口配置应与 worktree id 保持一致
  - Worktree 列表应与 git worktree 实际状态同步

---

## 7. 验收标准

### 7.1 功能验收

- [ ] 初始化功能已实现，能正确重组项目结构并配置环境变量
- [ ] 创建 worktree 功能已实现，能自动分配 id 和端口
- [ ] 合并 worktree 功能已实现，能检查状态、预览变化并正确合并
- [ ] 签出分支功能已实现，能在 worktree 中切换分支
- [ ] 列表和状态查询功能已实现，能展示准确信息
- [ ] 支持 macOS、Linux、Windows 三大平台

### 7.2 质量验收

- [ ] 所有命令都有 `--help` 说明
- [ ] 错误处理完善，不会出现未捕获的异常
- [ ] 关键操作有确认机制，避免误操作
- [ ] 代码通过 TypeScript 类型检查（无 `any` 类型）
- [ ] 遵循项目的 git commit 规范（不使用 `--no-verify`）

### 7.3 测试场景

1. **场景**：在全新的 git 项目中初始化
   - **预期**：成功创建目录结构，配置正确
   - **验证方式**：检查目录结构和 `.env.local` 内容

2. **场景**：创建多个 worktree 并同时启动开发服务器
   - **预期**：端口不冲突，各 worktree 独立运行
   - **验证方式**：检查各 worktree 的 PORT 环境变量，手动启动服务器验证

3. **场景**：合并 worktree，但存在未提交的文件
   - **预期**：报错退出，提示用户先提交
   - **验证方式**：在 worktree 中创建未提交文件，运行合并命令

4. **场景**：初始化时已存在部分目录结构
   - **预期**：智能补全缺失部分，不破坏现有结构
   - **验证方式**：手动创建主分支目录，再运行初始化

5. **场景**：创建已存在分支的 worktree
   - **预期**：报错退出，提示分支已有对应的 worktree
   - **验证方式**：创建两个相同分支的 worktree

---

## 8. 依赖与约束

### 8.1 依赖项

- **技术依赖**：
  - Node.js >= 18（使用 volta 管理）
  - Git >= 2.15（支持 worktree 功能）
  - Yarn 作为包管理器

- **数据依赖**：
  - 项目必须是 git 仓库
  - 需要有 `.env.local` 文件支持的项目结构

- **团队依赖**：无

### 8.2 技术约束

- **技术栈**：
  - TypeScript（不使用 `any` 类型）
  - Node.js 命令行工具
  - 使用 Commander.js 或类似库处理命令行

- **兼容性**：
  - 跨平台支持（macOS、Linux、Windows）
  - 路径处理需考虑不同操作系统的差异

- **限制条件**：
  - 只支持 git 版本控制系统
  - 环境变量配置依赖 `.env.local` 文件格式

### 8.3 前置条件

- 用户已安装 Node.js 和 Git
- 用户对 git 和命令行工具有基本了解
- 项目使用 git 进行版本控制

---

## 9. 补充说明

### 9.1 参考资料

- [Git Worktree 官方文档](https://git-scm.com/docs/git-worktree)
- [Commander.js](https://github.com/tj/commander.js) - Node.js 命令行框架
- [Enquirer](https://github.com/enquirer/enquirer) - 用户交互提示库

### 9.2 未决问题

1. 工具的配置文件格式和存储位置（建议使用 `.colyn/config.json`）
2. 是否需要支持 worktree 的删除命令（`colyn remove <id>`）
3. 是否需要支持自定义 worktree 目录名（而不是固定的 `task-{id}`）
4. 环境变量模板是否需要支持更多的占位符（如 `{{BRANCH_NAME}}`）

### 9.3 更新记录

| 日期 | 修改人 | 修改内容 |
|------|--------|----------|
| 2026-01-14 | Claude | 初始版本，基于需求澄清生成 |

---

## 附录

### A. 目录结构示例

初始化前：
```
my-project/
├── .git/
├── src/
├── package.json
└── ...
```

初始化后：
```
my-project/                    # 根目录
├── my-project/                # 主分支目录
│   ├── .git/
│   ├── src/
│   ├── .env.local            # PORT=10000, WORKTREE=main
│   └── ...
└── worktrees/                 # worktrees 目录
    ├── task-1/               # worktree 1
    │   ├── src/
    │   ├── .env.local        # PORT=10001, WORKTREE=1
    │   └── ...
    └── task-2/               # worktree 2
        ├── src/
        ├── .env.local        # PORT=10002, WORKTREE=2
        └── ...
```

### B. 命令示例

```bash
# 初始化
colyn init

# 创建 worktree
colyn add feature-login       # 创建 task-1
colyn add feature-dashboard   # 创建 task-2

# 列表查看
colyn list
# 输出示例：
# ID  Branch            Port   Path
# 1   feature-login     10001  /path/to/worktrees/task-1
# 2   feature-dashboard 10002  /path/to/worktrees/task-2

# 查看状态
colyn status 1
# 输出示例：
# Branch: feature-login
# Changed files: 5 (+120, -30)
# Commits ahead: 3

# 合并
colyn merge 1                 # 仅合并到本地
colyn merge feature-login     # 使用分支名
colyn merge 1 --push          # 合并并推送

# 签出分支
colyn checkout 1 bugfix-issue-123
```
