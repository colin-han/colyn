# Claude 工作指南

本文档包含 Claude 在本项目中应遵循的工作流程和规范。

---

## 安装相关

### 更新 Claude Code
- 如果需要更新 Claude Code 时，使用 `volta install` 代替 `npm install -g` 命令

---

## 重要约束

* **禁止自动 git 提交**：除非我明确说"提交代码"或"commit"，否则不得自动执行 `git commit`

---

## 通用规范

### 语言
* 总是用中文和我交互

### 术语规范
* **必须使用统一的术语**：项目中的所有文档、代码注释、提示信息都应使用一致的术语
* **术语参考**：使用前请查阅 `docs/zh-CN/develop/glossary.md` 确认正确的术语和用法
* **常用术语**：
  - ✅ 使用 "Worktree"（不是 "work tree" 或 "working tree"）
  - ✅ 使用 "Main branch"（不是 "master branch" 或 "primary branch"）
  - ✅ 使用 "Base port"（不是 "initial port" 或 "starting port"）
  - ✅ 使用 "Worktree ID"（不是 "worktree number" 或 "worktree index"）
  - ✅ 使用 "Window name"（不是 "window title"）
  - ✅ 使用 "Session name"（不是 "session id"）
  - ✅ 使用 "Dev server"（不是 "development server" 或 "local server"）
  - ✅ 使用 "并行 Vibe Coding"（这是项目特有术语）
* **新术语引入**：如果需要引入新术语，必须先在 `docs/zh-CN/develop/glossary.md` 中定义后再使用

### 包管理
* node 包管理使用 `volta run yarn` 命令

### 日志记录
* 总是把你对当前过程的总结 markdown 文件保存在项目根目录下的 `.claude/logs` 目录下

### 代码清理
* 任务告一段落后，检查代码库中的所有修改，清理中间调试过程添加的代码，仅保留必要的日志代码

---

## 问题调查流程

当我让你调查代码问题时，永远遵守以下流程：

1. **重现问题** - 先尝试复现问题
2. **分析日志** - 查看相关日志输出
3. **查找根因** - 定位问题的根本原因
4. **解决问题** - 实施修复
5. **验证问题** - 确认问题已解决

⚠️ **重要**：在重现问题之前不要猜测问题的根源，必须通过重现问题来确定问题的根源。

---

## 配置设计原则

### 最小配置原则

**核心理念**：能够自动推断出来的配置，就不要在配置文件中保存。

**目标**：
- 降低配置复杂度
- 减少配置文件维护成本
- 避免配置与实际状态不一致
- 提升用户体验（零配置即可使用）

**实施规则**：

1. **优先自动推断**
   - 能从环境、项目结构、命名规则中推断的信息，不应存储
   - 示例：tmux session name 永远等于 project name，无需保存

2. **只存储必要信息**
   - 用户显式配置的选项
   - 无法通过其他信息推断的状态
   - 必须持久化的用户选择

3. **配置即文档**
   - 配置文件应该简洁明了
   - 每个配置项都应该有明确的必要性
   - 避免冗余信息

**示例**：

```typescript
// ❌ 错误 - 存储可推断的信息
{
  "project": "my-app",
  "mainBranch": "main",
  "basePort": 3000
}

// ✅ 正确 - 所有信息都从环境推断，无需配置文件
// 不需要配置文件！

// 推断逻辑
getProjectName() => path.basename(projectRoot)  // 从主目录名推断
getMainBranch() => execSync('git branch --show-current')  // 从主分支目录推断
getBasePort() => readEnvLocal('.env.local').PORT  // 从 .env.local 读取
```

**推断来源**：

| 信息 | 推断来源 | 说明 |
|------|---------|------|
| Project name | 主目录名称 | `my-task-app/` → `my-task-app` |
| Main branch | 主分支目录的当前分支 | `git branch --show-current` |
| Base port | 主分支的 .env.local | 已配置的 PORT 环境变量 |
| Session name | Project name | 等于项目名 |
| Window name | Branch name | 分支名的最后一段 |

**例外情况**：

如果将来有特殊需求（例如：session name 必须与 project name 不同），需要：
1. 与用户充分讨论必要性
2. 评估是否有其他解决方案
3. 确认后再添加配置选项

**应用场景**：
- 设计新功能时，优先考虑自动推断
- 评审配置文件时，检查是否有冗余项
- 重构代码时，移除不必要的配置存储

---

## 配置文件修改规范

### 兼容性检查（必须遵守）

**每次修改配置文件结构时，必须检查是否需要创建 Migration**。

#### 需要创建 Migration 的情况

以下任何一种情况都**必须**创建 Migration：

- [ ] 添加了新的**必填**字段
- [ ] 删除了字段
- [ ] 重命名了字段
- [ ] 改变了字段类型（例如：`string` → `number`）
- [ ] 改变了字段的语义（例如：size 从百分比变为像素值）
- [ ] 改变了嵌套结构（例如：扁平结构变为嵌套对象）

#### 不需要 Migration 的情况

以下情况可以直接修改，无需 Migration：

- ✅ 添加新的**可选**字段（有默认值）
- ✅ 修改字段的默认值
- ✅ 添加新的配置选项（向后兼容）

#### 创建 Migration 的步骤

如果需要 Migration，请严格按照以下步骤执行：

1. **递增版本号**
   ```typescript
   // src/core/tmux-config.ts
   export const CURRENT_CONFIG_VERSION = 2;  // 从 1 改为 2
   ```

2. **添加迁移函数**
   ```typescript
   const MIGRATIONS: MigrationFunction[] = [
     // 现有的迁移...

     // 新增的迁移 (version → version+1)
     (settings: Settings): Settings => {
       // 迁移逻辑
       return { ...settings, version: 2 };
     },
   ];
   ```

3. **处理所有配置层级**
   - [ ] 用户级全局配置 (`settings.tmux`)
   - [ ] 项目级全局配置 (`settings.tmux`)
   - [ ] 用户级分支覆盖 (`settings.branchOverrides[*].tmux`)
   - [ ] 项目级分支覆盖 (`settings.branchOverrides[*].tmux`)

4. **测试 Migration**
   - [ ] 准备旧版本的配置文件
   - [ ] 加载配置，验证迁移成功
   - [ ] 检查迁移后的配置文件内容
   - [ ] 验证迁移后的配置可正常使用

5. **更新文档**
   - [ ] 在 `docs/zh-CN/develop/design/design-config-migration.md` 中添加迁移示例
   - [ ] 更新 CHANGELOG（如果有）
   - [ ] 如有必要，更新用户手册

#### Migration 编写原则

1. ✅ **保持幂等性**：多次执行结果相同
2. ✅ **保留用户数据**：不删除用户自定义配置
3. ✅ **提供默认值**：为新字段提供合理默认值
4. ✅ **处理边缘情况**：考虑字段不存在、类型错误等情况
5. ✅ **递归处理**：不要忘记 `branchOverrides` 中的嵌套配置

#### 示例

```typescript
// ❌ 错误：可能删除用户配置
(settings: Settings): Settings => {
  return { version: 2, tmux: { layout: 'three-pane' } };
}

// ✅ 正确：保留所有用户配置
(settings: Settings): Settings => {
  return {
    ...settings,
    tmux: {
      ...settings.tmux,
      layout: settings.tmux?.layout ?? 'three-pane',
    },
    version: 2,
  };
}
```

**参考文档**：`docs/zh-CN/develop/design/design-config-migration.md`

---

## TypeScript 规范

* 不要使用 `any` 类型
* 禁止使用 `--no-verify` 提交代码

---

## 国际化规范（i18n）

本项目使用 i18next 实现国际化，**所有用户可见的文本都必须本地化**。

### 基本要求

1. **禁止硬编码文本**
   - ❌ 不要在代码中直接使用中文或英文字符串
   - ✅ 所有用户提示、错误消息、命令描述都必须使用 `t()` 函数

2. **必须本地化的内容**
   - 命令描述（`.description()`）
   - 选项描述（`.option()`）
   - 所有用户提示信息
   - 错误消息和提示
   - 交互式 prompt 的 message
   - Spinner 加载动画的文本
   - 成功/警告/错误消息

### 实现步骤

**步骤 1：在翻译文件中添加文本**

中文翻译文件：`src/i18n/locales/zh-CN.ts`
英文翻译文件：`src/i18n/locales/en.ts`

```typescript
// 在 zh-CN.ts 的 commands 部分添加
myCommand: {
  description: '命令描述',
  confirmAction: '确认要执行操作吗？',
  actionSuccess: '操作成功',
  actionFailed: '操作失败：{{error}}',
}
```

**步骤 2：在代码中使用 t() 函数**

```typescript
import { t } from '../i18n/index.js';

// ✅ 正确 - 使用 t() 函数
program
  .command('myCommand')
  .description(t('commands.myCommand.description'))
  .action(async () => {
    const spinner = ora({
      text: t('commands.myCommand.processing'),
      stream: process.stderr
    }).start();

    spinner.succeed(t('commands.myCommand.actionSuccess'));
  });

// ❌ 错误 - 硬编码文本
program
  .command('myCommand')
  .description('我的命令')  // 不要这样做！
```

**步骤 3：使用变量插值**

```typescript
// 翻译文件
sessionNotExists: 'Session "{{sessionName}}" 不存在',

// 代码中使用
outputWarning(t('commands.tmux.sessionNotExists', { sessionName }));
```

### 特殊情况处理

**交互式 prompt**

```typescript
// ✅ 正确 - message 使用 t()
const { confirmed } = await enquirer.prompt<{ confirmed: boolean }>({
  type: 'confirm',
  name: 'confirmed',
  message: t('commands.myCommand.confirmAction'),
  initial: false,
  stdout: process.stderr
});
```

**命令选项**

```typescript
// ✅ 正确 - 描述使用 t()
.option('-f, --force', t('commands.myCommand.forceOption'))
```

### 翻译文件组织

在 `commands` 部分按命令名组织：

```typescript
commands: {
  add: { ... },
  remove: { ... },
  merge: { ... },
  tmux: { ... },  // 新命令的翻译放在这里
}
```

### 检查清单

在提交代码前，确保：

- [ ] 所有硬编码文本都已移到翻译文件
- [ ] 中文和英文翻译文件都已更新
- [ ] 使用 `LANG=zh_CN.UTF-8` 测试中文输出
- [ ] 使用 `LANG=en_US.UTF-8` 测试英文输出
- [ ] 变量插值格式正确（使用 `{{variableName}}`）

---

## 命令输出规范（双层架构）

本项目使用 Bash + Node.js 双层架构，**必须严格区分 stdout 和 stderr**：

### 输出流规则

| 输出流 | 用途 | 使用场景 |
|--------|------|----------|
| **stderr** | 给用户看的信息 | 进度提示、成功/错误信息、表格输出、交互提示 |
| **stdout** | 给 bash 脚本解析的 JSON | 命令执行结果（`outputResult()`） |

### 实现要求

1. **所有用户提示信息必须输出到 stderr**
   - 使用 `src/utils/logger.ts` 中的函数：`output()`, `outputSuccess()`, `outputError()` 等
   - 这些函数已封装为输出到 stderr

2. **交互式 prompt 必须配置 `stdout: process.stderr`**
   ```typescript
   // ✅ 正确
   await enquirer.prompt({
     type: 'confirm',
     message: '确认操作？',
     stdout: process.stderr  // 必须添加这一行
   });

   // ❌ 错误 - 会输出到 stdout，用户看不见
   await enquirer.prompt({
     type: 'confirm',
     message: '确认操作？'
   });
   ```

3. **Spinner 加载动画必须配置 `stream: process.stderr`**
   ```typescript
   // ✅ 正确
   const spinner = ora({
     text: '处理中...',
     stream: process.stderr  // 必须添加这一行
   }).start();

   // ❌ 错误 - 会输出到 stdout，用户看不见
   const spinner = ora('处理中...').start();
   ```

4. **JSON 结果仅在 `COLYN_OUTPUT_JSON=1` 时输出到 stdout**
   - 使用 `outputResult()` 函数
   - `outputResult()` 内部检测 `COLYN_OUTPUT_JSON` 环境变量，**仅当该变量存在时**才向 stdout 输出 JSON
   - 直接运行 colyn 命令时（无该环境变量），JSON 结果不会输出，避免干扰终端

### 原因

shell/colyn.sh 调用 colyn 时会设置 `COLYN_OUTPUT_JSON=1` 并捕获 stdout 用于解析 JSON：
```bash
result=$(COLYN_OUTPUT_JSON=1 "$COLYN_BIN" "$@")  # 设置环境变量，捕获 stdout
```
直接在终端运行 `colyn` 时不设置该变量，所以 JSON 不会输出到终端，用户体验更干净。

---

## 需求变更工作流程 🔄

### 1. 收到修改需求时

#### 第一步：检查现有文档 📋
在开始实现之前，必须先检查：

- [ ] 设计文档（`docs/zh-CN/develop/design/*.md`）
- [ ] 需求文档（`docs/zh-CN/develop/requirement/*.md`）
- [ ] 已有的实现代码
- [ ] 相关的日志记录（`.claude/logs/*.md`）

#### 第二步：对比分析 🔍
分析新需求与现有设计的关系：

- [ ] 新需求是否与现有设计冲突？
- [ ] 是否修改了已明确的设计决策？
- [ ] 是否影响其他相关功能？
- [ ] 是否需要修改多个文档？

#### 第三步：提醒用户（如有冲突）⚠️

如果检测到冲突，**必须先提醒用户**，格式如下：

```
⚠️ 检测到需求冲突

现有文档：docs/xxx.md 第 X 节
当前设计：[描述现有设计]

您的新需求：[描述新需求]

冲突点：
1. [列出具体冲突]
2. [列出影响范围]

可选方案：
A. [保持现有设计]
B. [修改为新需求]
C. [折中方案]

请确认如何处理？
```

#### 第四步：等待用户确认 ⏸️

**⚠️ 重要**：
- ❌ 不要直接开始实现
- ✅ 让用户明确选择方案
- ✅ 获得确认后再继续

---

### 2. 实现完成后

#### 必须更新的文档清单 📝

每次实现完成后，必须检查并更新以下文档：

- [ ] **设计文档** (`docs/zh-CN/develop/design/`)
  - 修改了哪些设计决策？
  - 新增了哪些功能？
  - 改变了哪些行为？

- [ ] **需求文档** (`docs/zh-CN/develop/requirement/`)
  - 是否需要更新需求说明？
  - 是否需要添加新的用例？

- [ ] **用户手册** (`docs/zh-CN/manual/` 和 `docs/en/manual/`)
  - 是否新增或修改了用户可见的功能？
  - 是否改变了命令的使用方式或参数？
  - 中英文手册必须同步更新

- [ ] **README.md**（如果影响用户使用）
  - 是否改变了使用方式？
  - 是否新增了功能？

- [ ] **示例代码**
  - 文档中的代码示例是否需要更新？
  - 是否与实际实现一致？

- [ ] **多语言文档同步** ⚠️ **重要规则**
  - **任何对参数或交互方式的修改，都需要检查并更新相关文档**
  - `docs/zh-CN/develop/design/` - 中文设计文档（非命令相关）
  - `docs/zh-CN/develop/design/commands/` - 中文命令设计文档
  - `docs/zh-CN/develop/requirement/` - 中文需求文档
  - `docs/en/develop/design/` - 英文设计文档（非命令相关）
  - `docs/en/develop/design/commands/` - 英文命令设计文档
  - `docs/zh-CN/manual/` - 中文用户手册
  - `docs/en/manual/` - 英文用户手册
  - 确保所有语言版本的文档内容一致

  **文档创建和删除规则**：
  - ✅ **创建新设计文档**时，必须同时创建对应的英文版本
    - 中文（命令）：`docs/zh-CN/develop/design/commands/design-xxx-command.md`
    - 英文（命令）：`docs/en/develop/design/commands/design-xxx-command.md`
    - 中文（非命令）：`docs/zh-CN/develop/design/design-xxx.md`
    - 英文（非命令）：`docs/en/develop/design/design-xxx.md`
  - ✅ **删除设计文档**时，必须同时删除对应的英文版本
  - ✅ **合并文档**时，同步处理两种语言的文档
    - 中文文档合并后，英文文档也要进行相同的合并操作
  - ⚠️ **实施日志**（`.claude/logs/*.md`）仅中文，无需创建英文版

#### 提供更新清单 ✅

实现完成后，必须明确告知用户：

```
## 文档更新清单

✅ 已更新：
- docs/design-xxx.md - 第 X 节：[更新内容]
- .claude/logs/xxx-20260115.md - 完整实现记录

📝 建议检查：
- docs/README.md - 可能需要更新使用说明

⚠️ 相关影响：
- 命令 Y 可能受到影响，建议检查
```

---

### 3. 文档一致性检查 🔍

在完成实现和文档更新后，进行最终检查：

- [ ] 设计文档中的代码示例与实际实现一致
- [ ] 需求文档中的描述与实现功能一致
- [ ] 所有相关文档都已更新
- [ ] 没有留下过时或冲突的信息

---

## 示例场景

### ❌ 错误的处理方式

用户："add命令执行后应该自动进入worktree目录"

Claude：直接开始解释技术限制和提供方案...

**问题**：
1. 没有检查设计文档
2. 不知道是否已有相关设计
3. 可能推翻之前的决策

---

### ✅ 正确的处理方式

用户："add命令执行后应该自动进入worktree目录"

Claude：
```
让我先检查一下现有的设计文档...

⚠️ 检测到设计变更

现有设计（docs/design-add-command.md 第 8 节）：
✓ 成功后显示 `cd worktreePath` 命令
✓ 用户手动复制执行

您的新需求：
✓ add 命令执行后自动进入 worktree 目录

设计变更分析：
1. 技术限制：Node.js 子进程无法修改父 shell 的工作目录
2. 现有设计是有意为之（输出命令供用户执行）
3. 需要额外的 shell 函数封装才能实现自动切换

可选方案：
A. 保持现有设计（输出 cd 命令）
B. 添加 shell 函数封装方案到文档
C. 添加 --print-path 选项配合 shell 函数
D. 改进输出格式，让 cd 命令更易复制

请选择方案？
```

[等待用户确认后再继续实现]

---

## 承诺 🤝

遵循此工作流程可以确保：

- ✅ 文档和代码始终保持一致
- ✅ 设计决策有迹可循
- ✅ 避免无意中推翻之前的设计
- ✅ 给用户充分的决策权
- ✅ 项目维护更加清晰可靠

**每次收到需求变更时，我都会严格执行这个流程。**
