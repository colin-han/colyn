# Colyn 多语言支持设计文档

## 概述

本文档描述 Colyn CLI 工具的多语言（i18n）支持实现方案。

## 技术方案

### 核心依赖

- **i18next**: 国际化框架，提供翻译功能和插值支持

### 支持的语言

| 语言代码 | 语言名称 | 状态 |
|---------|---------|------|
| `en` | English | 默认语言 |
| `zh-CN` | 简体中文 | 完整支持 |

### 语言检测优先级

1. `COLYN_LANG` 环境变量（用户显式设置）
2. 项目配置文件（`.colyn/settings.json` 中的 `lang` 字段）
3. 用户配置文件（`~/.config/colyn/settings.json` 中的 `lang` 字段）
4. 系统语言（`LANG`/`LC_ALL` 环境变量）
5. 默认英文（`en`）

### 配置文件支持

除了环境变量，用户还可以通过配置文件设置语言偏好：

**用户级配置** (`~/.config/colyn/settings.json`)：
```json
{
  "lang": "zh-CN"
}
```

**项目级配置** (`.colyn/settings.json`)：
```json
{
  "lang": "en"
}
```

使用 `colyn config` 命令管理语言设置：

```bash
# 设置用户级语言（影响所有项目）
colyn config set lang zh-CN --user

# 设置项目级语言（仅影响当前项目）
colyn config set lang en

# 查看当前语言设置
colyn config get lang
```

### 文件结构

```
src/
├── i18n/
│   ├── index.ts           # i18n 初始化和导出
│   └── locales/
│       ├── en.ts          # 英文翻译（默认）
│       └── zh-CN.ts       # 中文翻译
```

## 翻译 Key 结构

翻译资源采用分层命名结构：

```typescript
{
  // 通用文本
  common: {
    error: "Error",
    success: "Success",
    hint: "Hint",
    // ...
  },

  // CLI 相关
  cli: {
    description: "Git worktree management tool",
    noColorOption: "Disable color output",
  },

  // 命令相关
  commands: {
    add: {
      description: "Create a new worktree",
      branchNameEmpty: "Branch name cannot be empty",
      // ...
    },
    list: {
      description: "List all worktrees",
      // ...
    },
    // 其他命令...
  },

  // 错误消息
  errors: {
    notGitRepo: "Not a git repository",
    projectNotInitialized: "Project not initialized",
    // ...
  },

  // 输出标签
  output: {
    projectRoot: "Project root",
    // ...
  }
}
```

## 使用方法

### 基本用法

```typescript
import { t } from '../i18n/index.js';

// 简单翻译
const message = t('common.error');

// 带参数的翻译
const message = t('commands.add.branchExists', { branch: 'feature/x' });
```

### 设置语言

**方式 1：使用配置文件（推荐）**

```bash
# 设置用户级语言
colyn config set lang zh-CN --user

# 设置项目级语言
colyn config set lang en

# 查看当前语言
colyn config get lang
```

**方式 2：使用环境变量**

```bash
# 使用环境变量设置语言（临时）
COLYN_LANG=zh-CN colyn --help

# 或在 shell 配置中永久设置
export COLYN_LANG=zh-CN
colyn --help
```

**优先级说明**：环境变量 > 项目配置 > 用户配置 > 系统语言

### 调试模式

```bash
# 启用 i18n 调试输出
DEBUG=colyn:i18n colyn --help
```

## 添加新语言

1. 在 `src/i18n/locales/` 目录下创建新的语言文件（如 `ja.ts`）
2. 复制 `en.ts` 的结构并翻译所有文本
3. 在 `src/i18n/index.ts` 中注册新语言：

```typescript
import { ja } from './locales/ja.js';

// 在 SUPPORTED_LANGUAGES 中添加
const SUPPORTED_LANGUAGES = ['en', 'zh-CN', 'ja'] as const;

// 在 i18next.init 的 resources 中添加
resources: {
  en: { translation: en },
  'zh-CN': { translation: zhCN },
  ja: { translation: ja },
},
```

## 翻译 Key 命名规范

1. 使用小驼峰命名法（camelCase）
2. 按功能模块分组
3. 命令相关的 key 放在 `commands.{commandName}` 下
4. 通用文本放在 `common` 下
5. 错误消息放在 `errors` 下

## 插值语法

使用 `{{variableName}}` 语法进行变量插值：

```typescript
// 翻译文件
{
  branchExists: 'Branch "{{branch}}" already has a worktree'
}

// 使用
t('commands.add.branchExists', { branch: 'feature/x' })
// 输出: Branch "feature/x" already has a worktree
```

## 复数支持

i18next 支持复数形式，但当前实现中未使用。如需添加：

```typescript
// 翻译文件
{
  files: {
    count_one: "{{count}} file",
    count_other: "{{count}} files"
  }
}

// 使用
t('files.count', { count: 5 }) // "5 files"
```

## 注意事项

1. 所有用户可见的文本都应该使用 i18n
2. 技术性输出（如 JSON、路径）不需要翻译
3. 命令名称和参数名称保持英文
4. 确保翻译文件的结构与英文版本完全一致
