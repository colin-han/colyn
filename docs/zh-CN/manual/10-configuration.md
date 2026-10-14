# 配置系统

本章详细介绍 Colyn 的配置系统,包括配置文件的位置、结构、加载顺序以及所有可用的配置项。

---

## 目录

1. [配置文件位置](#配置文件位置)
2. [配置加载顺序](#配置加载顺序)
3. [配置文件结构](#配置文件结构)
4. [全局配置项](#全局配置项)（含 [plugins](#plugins)、[lang](#lang)、[systemCommands](#systemcommands)、[branchCategories](#branchcategories)）
5. [分支特定配置](#分支特定配置)
6. [配置管理命令](#配置管理命令)
7. [配置示例](#配置示例)
8. [配置版本与迁移](#配置版本与迁移)
9. [Todo 配置项](#todo-配置项)
10. [命令默认值配置](#命令默认值配置)

---

## 配置文件位置

Colyn 支持多种配置文件格式，并按优先级加载：

**支持的格式**：
- **JSON5** (推荐) - `settings.json` - 支持注释和尾部逗号
- **YAML** - `settings.yaml` 或 `settings.yml` - 更简洁的语法

**格式优先级**：当多个格式的配置文件同时存在时：
```
settings.json > settings.yaml > settings.yml
```

配置文件支持两个层级：

### 1. 用户级配置（全局配置）

**路径**:
- `~/.config/colyn/settings.json` (JSON5 格式，推荐)
- `~/.config/colyn/settings.yaml` (YAML 格式)
- `~/.config/colyn/settings.yml` (YAML 格式)

**作用范围**: 影响所有项目

**适用场景**:
- 个人偏好设置(语言、包管理器等)
- 跨项目通用的命令默认值
- 针对特定分支模式的全局规则(如所有 `main` 分支)

**示例路径**:
```
/Users/username/.config/colyn/settings.json  # macOS/Linux (JSON5)
/Users/username/.config/colyn/settings.yaml  # macOS/Linux (YAML)
C:\Users\username\.config\colyn\settings.json  # Windows
```

### 2. 项目级配置

**路径**:
- `{项目根目录}/.colyn/settings.json` (JSON5 格式，推荐)
- `{项目根目录}/.colyn/settings.yaml` (YAML 格式)
- `{项目根目录}/.colyn/settings.yml` (YAML 格式)

**作用范围**: 仅影响当前项目

**适用场景**:
- 项目特定的系统命令配置
- 项目特定的命令默认值
- 团队共享的配置(可提交到版本控制)

**示例路径**:
```
/Users/username/projects/my-app/.colyn/settings.json (JSON5)
/Users/username/projects/my-app/.colyn/settings.yaml (YAML)
```

### 配置文件创建

配置文件不会自动创建,你需要根据需要手动创建:

```bash
# 创建用户级配置目录
mkdir -p ~/.config/colyn

# 创建用户级配置文件 (JSON5 格式)
cat > ~/.config/colyn/settings.json << 'EOF'
{
  "version": 5,
  "lang": "zh-CN",
  "systemCommands": {
    "npm": "yarn"
  }
}
EOF

# 或使用 YAML 格式
cat > ~/.config/colyn/settings.yaml << 'EOF'
version: 5
lang: zh-CN
systemCommands:
  npm: yarn
EOF

# 创建项目级配置文件(在项目根目录执行)
mkdir -p .colyn
cat > .colyn/settings.json << 'EOF'
{
  "version": 5,
  "systemCommands": {
    "npm": "pnpm"
  }
}
EOF
```

---

## 配置加载顺序

Colyn 使用多层配置系统,所有配置项（`lang`、`systemCommands`、`commands` 等）都遵循统一的优先级规则。

**⚠️ 重要说明**: 以下列表按**优先级从高到低**排序,**序号越小优先级越高**。

### 统一配置优先级

适用于所有配置项（`lang`、`verbose`、`systemCommands.npm`、`commands.*`、`syncFiles`、`todo.*` 等）:

```
1. Project override（项目级分支覆盖）← 最高优先级
   └── .colyn/settings.json 的 branchOverrides[branch]
        ↓
2. User override（用户级分支覆盖）
   └── ~/.config/colyn/settings.json 的 branchOverrides[branch]
        ↓
3. Project default（项目级全局配置）
   └── .colyn/settings.json
        ↓
4. User default（用户级全局配置）
   └── ~/.config/colyn/settings.json
        ↓
5. System builtin（系统内置）← 最低优先级
   └── 内置默认值
```

**说明**:
- **所有配置项**都支持分支覆盖（`branchOverrides`）
- 你可以在 `branchOverrides` 中覆写 `lang`、`systemCommands`、`commands` 等任意配置
- System builtin 指各配置项的内置默认值（如 `lang` 默认 `en`、`systemCommands.npm` 默认 `npm`）

### 环境变量（特殊情况）

`COLYN_LANG` 环境变量支持临时覆盖界面语言,但**不支持分支覆盖**:

```
环境变量 COLYN_LANG（最高优先级）
  ↓
项目级配置
  ↓
用户级配置
  ↓
默认值
```

**使用示例**:

```bash
# 临时使用中文界面
COLYN_LANG=zh-CN colyn --help

# 临时使用英文界面
COLYN_LANG=en colyn list
```

**⚠️ 注意**: 环境变量优先级最高,但只在某些命令中生效,且不支持分支特定配置。大多数情况下推荐使用配置文件而非环境变量。

### 配置合并规则

**字段级覆盖（Field-level Override）**:
- 配置按**字段**合并,而非整体替换
- 只有明确设置的字段才会覆盖低优先级的值
- 未设置的字段会保留低优先级配置或使用默认值

**示例**:

```json
// 用户级配置
{
  "commands": {
    "merge": {
      "build": false,
      "rebase": false
    }
  }
}

// 项目级配置（只修改 build）
{
  "commands": {
    "merge": {
      "build": true
    }
  }
}

// 最终生效的配置
{
  "commands": {
    "merge": {
      "build": true,    // ← 来自项目级配置
      "rebase": false   // ← 来自用户级配置（保留）
    }
  }
}
```

---

## 配置文件结构

完整的配置文件结构如下:

```typescript
{
  // 配置文件版本号（用于自动迁移）
  "version": 5,

  // 界面语言
  "lang": "zh-CN" | "en",

  // 全局详细输出
  "verbose": true | false,

  // 工具链插件（由 colyn init 自动检测并写入，也可手动编辑）
  // 可选值: "npm" | "maven" | "gradle" | "pip"
  // 详细说明参考: manual/11-plugin-system.md
  "plugins": ["npm"],

  // 系统命令配置
  "systemCommands": {
    "npm": "npm" | "yarn" | "pnpm"   // 包管理器命令
  },

  // 自定义分支类型（用于 add/checkout/todo add 的 type 选择）
  "branchCategories": [
    { "name": "feature", "abbr": "✨feat" },
    { "name": "bugfix",  "abbr": "🐛fix"  }
  ],

  // 未跟踪文件同步清单
  "syncFiles": ["data/*.json"],

  // 各命令开关的默认值
  "commands": {
    "merge":    { /* MergeCommandConfig */ },
    "update":   { /* UpdateCommandConfig */ },
    "release":  { /* ReleaseCommandConfig */ },
    "checkout": { /* CheckoutCommandConfig */ }
  },

  // Todo 配置
  "todo": { /* TodoConfig */ },

  // 分支特定配置覆盖
  "branchOverrides": {
    "main": { /* Settings */ },
    "feature/*": { /* Settings */ }
  }
}
```

**注意**:
- 所有字段都是**可选的**
- 未配置的字段会使用默认值
- 配置文件中只需包含你想要自定义的字段

---

## 全局配置项

### version

**类型**: `number`
**默认值**: `5`（当前版本）
**说明**: 配置文件版本号,用于自动迁移

**⚠️ 重要**: 不要手动修改此字段,系统会自动管理

### lang

**类型**: `"en" | "zh-CN"`
**默认值**: `"en"`
**说明**: 界面语言

**支持的语言**:
- `en` - 英语
- `zh-CN` - 简体中文

**示例**:

```json
{
  "lang": "zh-CN"
}
```

**命令行设置**:

```bash
# 设置用户级默认语言
colyn config set lang zh-CN --user

# 设置项目级语言
colyn config set lang en

# 临时切换语言(不修改配置)
COLYN_LANG=zh-CN colyn --help
```

### plugins

**类型**: `string[]`
**默认值**: 由 `colyn init` 自动检测
**说明**: 启用的工具链插件列表

**可选值**:
- `"npm"` - Node.js / npm 项目
- `"maven"` - Java Maven 项目
- `"gradle"` - Java / Kotlin Gradle 项目
- `"pip"` - Python / pip 项目

**自动检测规则**:
- 存在 `package.json` → 启用 `npm`
- 存在 `pom.xml` → 启用 `maven`
- 存在 `build.gradle` 或 `build.gradle.kts` → 启用 `gradle`
- 存在 `requirements.txt` 或 `pyproject.toml` → 启用 `pip`

**示例**:

```json
{
  "plugins": ["npm"]
}
```

**修改方式**:

```bash
# 查看当前配置
cat .colyn/settings.json

# 手动编辑配置文件修改插件列表
# 例如，Java + Node.js 混合项目可以启用多个插件：
# "plugins": ["npm", "maven"]
```

> **说明**: 通常无需手动修改。`colyn init` 会自动检测并写入正确的值。旧项目首次运行任意命令时也会自动检测并迁移。

---

### systemCommands

**类型**: `object`
**说明**: 系统命令配置

#### systemCommands.npm

**类型**: `string`
**默认值**: `"npm"`
**说明**: 包管理器命令

**支持的值**:
- `"npm"` - 使用 npm
- `"yarn"` - 使用 Yarn
- `"pnpm"` - 使用 pnpm
- 其他任意包管理器命令

**示例**:

```json
{
  "systemCommands": {
    "npm": "yarn"
  }
}
```

**命令行设置**:

```bash
# 设置用户级默认包管理器
colyn config set systemCommands.npm yarn --user

# 设置项目级包管理器
colyn config set systemCommands.npm pnpm
```

---

### branchCategories

**类型**: `Array<{ name: string; abbr?: string }>`
**默认值**: `[ { name: "feature", abbr: "✨feat" }, { name: "bugfix", abbr: "🐛fix" }, { name: "refactor", abbr: "♻️ref" }, { name: "document", abbr: "📝doc" } ]`
**说明**: 自定义分支类型列表，用于 `add`、`checkout`、`todo add` 等操作时的 type 选择。

**字段说明**:
- `name` - 分支类型名称，用于实际分支名（如 `feature/user-auth`）
- `abbr` - 显示缩写，可含 emoji（如 `✨feat`）；未设置时截取 `name` 前 4 个字母

**合并策略**:
- 项目配置中的列表 + 用户配置中的列表 + 默认列表，按 `name` 去重（保留第一次出现的）
- 自定义类型会显示在默认类型前面

**示例**:

```json
{
  "branchCategories": [
    { "name": "hotfix", "abbr": "🔥fix" },
    { "name": "chore",  "abbr": "🔧chr" }
  ]
}
```

**效果**: 在 `add`、`checkout`、`todo add` 时，类型选择列表变为：

```
🔥fix  (hotfix)
🔧chr  (chore)
✨feat (feature)
🐛fix  (bugfix)
♻️ref  (refactor)
📝doc  (document)
```

**查看当前生效的类型列表**:

```bash
colyn config get branchCategories
```

输出格式（JSON 数组）：
```json
[
  { "name": "hotfix", "abbr": "🔥fix" },
  { "name": "chore",  "abbr": "🔧chr" },
  { "name": "feature", "abbr": "✨feat" },
  { "name": "bugfix",  "abbr": "🐛fix" },
  { "name": "refactor", "abbr": "♻️ref" },
  { "name": "document", "abbr": "📝doc" }
]
```

---

## 分支特定配置

通过 `branchOverrides` 可以为特定分支或分支模式定制配置。

**⚠️ 重要**: `branchOverrides` 中可以覆写**任意配置项**,包括:
- `lang` - 针对特定分支使用不同语言
- `systemCommands` - 针对特定分支使用不同的包管理器
- `commands` - 针对特定分支使用不同的命令默认值
- `syncFiles`、`todo` 等其他配置项

### 配置语法

```json
{
  "branchOverrides": {
    "分支名或模式": {
      // 任意 Settings 配置
      "lang": "...",
      "systemCommands": { ... },
      "commands": { ... }
    }
  }
}
```

### 匹配规则

**1. 精确匹配**（优先级最高）

```json
{
  "branchOverrides": {
    "main": {
      "commands": {
        "merge": { "update": false }
      }
    }
  }
}
```

**2. 通配符匹配**

支持 `*` 通配符:

```json
{
  "branchOverrides": {
    "feature/*": {
      "systemCommands": { "npm": "yarn" }
    },
    "bugfix/*": {
      "commands": {
        "merge": { "build": false }
      }
    }
  }
}
```

**匹配示例**:
- `"feature/*"` 匹配: `feature/auth`, `feature/ui/dashboard`
- `"bugfix/*"` 匹配: `bugfix/login`, `bugfix/user/profile`
- `"*/test"` 匹配: `feature/test`, `bugfix/test`

### 配置覆盖示例

**示例 1**: Release 分支合并前强制构建,其他分支跳过构建

```json
{
  "version": 5,
  "commands": {
    "merge": { "build": false }
  },
  "branchOverrides": {
    "release/*": {
      "commands": {
        "merge": { "build": true }
      }
    }
  }
}
```

**示例 2**: 为不同分支使用不同的包管理器和语言

```json
{
  "version": 5,
  "lang": "en",
  "systemCommands": {
    "npm": "npm"
  },
  "branchOverrides": {
    "main": {
      "systemCommands": {
        "npm": "pnpm"
      }
    },
    "feature/china-*": {
      "lang": "zh-CN",
      "systemCommands": {
        "npm": "yarn"
      }
    }
  }
}
```

**说明**:
- Main 分支使用 pnpm
- `feature/china-*` 分支使用中文界面和 yarn
- 其他分支使用英文界面和 npm

---

## 配置管理命令

Colyn 提供 `config` 命令来管理配置。

### 查看配置

```bash
# 查看完整配置（包括用户级、项目级和合并后的生效配置）
colyn config

# 以 JSON 格式输出（适合脚本解析）
colyn config --json
```

`colyn config` 依次显示三部分内容:

1. **用户级配置文件** - 路径、是否存在、文件内容
2. **项目级配置文件** - 路径、是否存在、文件内容
3. **生效的配置** - 用户级与项目级合并,并应用当前分支的 `branchOverrides` 后得到的完整配置

**输出示例**:

```
Colyn Configuration

User-level Config:
  Path: /Users/username/.config/colyn/settings.json
  Status: Exists
  Content:
    {
      "version": 5,
      "lang": "zh-CN"
    }

Project-level Config:
  Path: /Users/username/projects/my-app/.colyn/settings.json
  Status: Exists
  Content:
    {
      "version": 5,
      "systemCommands": {
        "npm": "yarn"
      }
    }

Effective Config:
  {
    "version": 5,
    "lang": "zh-CN",
    "systemCommands": {
      "npm": "yarn"
    }
  }
```

`--json` 模式输出的结构为:

```json
{
  "userConfig":    { "path": "...", "exists": true,  "content": { ... } },
  "projectConfig": { "path": "...", "exists": false, "content": null },
  "effectiveConfig": { ... }
}
```

### 获取配置值

```bash
# 获取项目级配置值
colyn config get <key>

# 获取用户级配置值
colyn config get <key> --user
```

**支持的 key**:
- `lang` - 界面语言
- `verbose` - 是否默认显示详细输出
- `systemCommands.npm` - 包管理器命令
- `commands.merge.*` / `commands.update.*` / `commands.release.*` / `commands.checkout.fetch` - 各命令开关的默认值
- `branchCategories` - 分支类型列表（仅 `get`，返回合并后的完整列表，JSON 格式）

> 完整的配置键说明见[命令参考 · config](04-command-reference/03-system-config.md)。

**示例**:

```bash
# 查看当前项目的包管理器
colyn config get systemCommands.npm

# 查看用户级语言设置
colyn config get lang --user

# 查看当前生效的分支类型列表（含默认值）
colyn config get branchCategories
```

### 设置配置值

```bash
# 设置项目级配置
colyn config set <key> <value>

# 设置用户级配置
colyn config set <key> <value> --user
```

**示例**:

```bash
# 设置用户级语言为中文
colyn config set lang zh-CN --user

# 设置项目级包管理器为 yarn
colyn config set systemCommands.npm yarn

# 设置用户级包管理器为 pnpm
colyn config set systemCommands.npm pnpm --user

# 删除某个配置项，恢复内置默认
colyn config unset systemCommands.npm
```

**⚠️ 注意**: `config set` / `config unset` 支持 `lang`、`verbose`、`syncFiles`、`systemCommands.npm`、`commands.*`、`todo.*` 等点分键（完整列表见[命令参考 · config](04-command-reference/03-system-config.md)）。对象或数组类型的字段（如 `branchOverrides`、`branchCategories`）需要手动编辑配置文件。

---

## 配置示例

### 示例 1: 最小配置

如果你对默认值满意,可以不创建任何配置文件,或者创建一个空的配置:

```json
{
  "version": 5
}
```

**效果**:
- 使用英文界面
- 使用 npm 作为包管理器
- 所有命令开关使用内置默认值

### 示例 2: 简单个性化

设置语言和包管理器:

```json
{
  "version": 5,
  "lang": "zh-CN",
  "systemCommands": {
    "npm": "yarn"
  }
}
```

### 示例 3: 自定义命令默认值

```json
{
  "version": 5,
  "verbose": true,
  "commands": {
    "merge": {
      "build": false,
      "rebase": false
    },
    "update": {
      "all": false
    }
  }
}
```

### 示例 4: 分支特定配置

```json
{
  "version": 5,
  "lang": "zh-CN",
  "systemCommands": {
    "npm": "yarn"
  },
  "branchOverrides": {
    "main": {
      "systemCommands": {
        "npm": "pnpm"
      }
    },
    "release/*": {
      "commands": {
        "merge": { "build": true },
        "release": { "tag": true }
      }
    },
    "bugfix/*": {
      "commands": {
        "merge": { "update": false }
      }
    }
  }
}
```

### 示例 5: 团队共享配置

项目级配置可以提交到版本控制,让团队成员共享:

```json
{
  "version": 5,
  "systemCommands": {
    "npm": "pnpm"
  },
  "syncFiles": ["data/*.json", "certs/**"],
  "commands": {
    "merge": {
      "build": true,
      "rebase": true
    }
  },
  "branchOverrides": {
    "main": {
      "commands": {
        "merge": { "update": false }
      }
    }
  }
}
```

**提交到 Git**:

```bash
git add .colyn/settings.json
git commit -m "Add team colyn configuration"
```

---

## 配置版本与迁移

### 版本管理

Colyn 使用版本号来管理配置文件的演进,当配置结构发生变化时,系统会**自动迁移**你的配置。

**当前版本**: `5`

### 配置文件格式

Colyn 支持多种配置文件格式：

**JSON5 格式** (推荐，文件名：`settings.json`)
- 支持注释（`//` 和 `/* */`）
- 支持尾部逗号
- 完全兼容标准 JSON

**YAML 格式** (文件名：`settings.yaml` 或 `settings.yml`)
- 更简洁的语法
- 支持注释（`#`）
- 适合多行配置

### 自动迁移机制

**触发时机**:
- 加载配置文件时自动检测版本
- 如果版本低于当前版本,自动执行迁移
- 迁移后自动保存更新的配置文件

**迁移原则**:
- ✅ 保留所有用户自定义配置
- ✅ 自动转换为新的配置结构
- ✅ 提供合理的默认值
- ✅ 递归处理 `branchOverrides`

**你需要做什么**: **什么都不用做！** 系统会自动处理。

### 版本历史

#### Version 0 → Version 1

**变更时间**: 2026-02-14

**变更内容**:
- 添加 `version` 字段用于版本管理

#### Version 1 → Version 2

**变更时间**: 2026-02-20

**变更内容**:

1. **配置结构重构**
   - `npm` → `systemCommands.npm`

**迁移示例**:

**旧配置** (Version 1):
```json
{
  "version": 1,
  "npm": "yarn"
}
```

**自动迁移后** (Version 2):
```json
{
  "version": 2,
  "systemCommands": {
    "npm": "yarn"
  }
}
```

#### Version 2 → Version 3

**变更时间**: 2026-02-20

**变更内容**:

1. **配置文件格式支持**
   - 新增 YAML 格式支持（`settings.yaml`, `settings.yml`）
   - 原 JSON 文件现在使用 JSON5 解析（支持注释和尾部逗号）
   - 格式优先级：`settings.json` > `settings.yaml` > `settings.yml`

配置内容本身无需转换，仅递增版本号。

#### Version 3 → Version 4

**变更时间**: 2026-02-22

**变更内容**:

1. **插件系统重构**
   - 移除 `plugins` 和 `pluginSettings` 字段
   - 改为 `toolchain`（单项目）/ `projects`（Mono Repo）字段，由命令运行时按需自动检测并写入

#### Version 4 → Version 5

**变更时间**: 2026-10-14

**变更内容**:

1. **清理已废弃的配置字段**
   - 删除终端布局相关的旧配置字段（含 `branchOverrides` 中的嵌套项）
   - 删除 `systemCommands` 下已废弃的 `claude` 项
   - 其余字段原样保留,无需手动处理

### 检查配置版本

```bash
# 查看配置文件中的版本号
cat ~/.config/colyn/settings.json | grep version

# 或者查看完整配置
colyn config --json | grep version
```

### 手动更新配置

通常不需要手动更新,但如果你想主动触发迁移:

```bash
# 只需运行任何会加载配置的命令
colyn config

# 系统会自动检测版本并迁移
```

### 配置文件损坏

如果配置文件损坏或无法解析:

```bash
# 备份旧配置
mv ~/.config/colyn/settings.json ~/.config/colyn/settings.json.bak

# 创建新的配置
cat > ~/.config/colyn/settings.json << 'EOF'
{
  "version": 5,
  "lang": "zh-CN"
}
EOF
```

---

## 常见问题

### 1. 配置没有生效?

**检查步骤**:

```bash
# 1. 查看生效的配置
colyn config

# 2. 检查配置优先级
#    环境变量 > 项目配置 > 用户配置 > 默认值

# 3. 检查 JSON 语法
cat ~/.config/colyn/settings.json | jq .
cat .colyn/settings.json | jq .
```

### 2. 如何重置为默认配置?

```bash
# 删除配置文件即可
rm ~/.config/colyn/settings.json  # 用户级
rm .colyn/settings.json           # 项目级

# 或者设置为空配置
echo '{"version": 5}' > ~/.config/colyn/settings.json
```

### 3. 分支覆盖配置不生效?

**可能原因**:

1. **通配符语法错误**
   ```json
   // ❌ 错误
   "feature*": { ... }

   // ✅ 正确
   "feature/*": { ... }
   ```

2. **精确匹配优先**
   ```json
   {
     "branchOverrides": {
       "feature/auth": { ... },  // 精确匹配
       "feature/*": { ... }       // 通配符匹配
     }
   }
   // 分支 "feature/auth" 使用精确匹配的配置
   ```

### 4. 如何在不同项目使用不同配置?

**方案**: 使用项目级配置

```bash
cd project-a
cat > .colyn/settings.json << 'EOF'
{
  "version": 5,
  "systemCommands": { "npm": "yarn" }
}
EOF

cd project-b
cat > .colyn/settings.json << 'EOF'
{
  "version": 5,
  "systemCommands": { "npm": "pnpm" }
}
EOF
```

---

## Todo 配置项

`todo` 配置组控制 `todo` 命令的存储后端及相关行为。

### todo.backend

**类型**: `"local" | "github"`
**默认值**: `"local"`
**说明**: 选择 todo 的存储后端

| 值 | 说明 |
|----|------|
| `"local"` | 将 todo 存储到项目目录下的本地 `todo.json` 文件 |
| `"github"` | 将 todo 存储到当前仓库的 GitHub Issues |

**前置条件（使用 `github` 时）**：
- 已安装并登录 `gh`（GitHub CLI）
- 当前仓库的 `origin` remote 为 GitHub 地址

**命令行设置**:

```bash
# 切换到 GitHub Issues 后端
colyn config set todo.backend github

# 切换回本地后端
colyn config set todo.backend local
```

---

### todo.autoArchive

**类型**: `boolean`
**默认值**: `false`
**说明**: 开启后，执行 `todo complete` 将 todo 标记为 done 时自动归档

**命令行设置**:

```bash
# 开启自动归档
colyn config set todo.autoArchive true

# 关闭自动归档
colyn config set todo.autoArchive false
```

---

### todo.github.archivedLabel

**类型**: `string`（可选）
**默认值**: 未设置
**说明**: GitHub backend 专用，用于区分 done 状态与 archived 状态的 GitHub label 名称

**行为说明**:

| 配置状态 | done | archived |
|---------|------|----------|
| 未设置（默认） | closed issue | closed issue（所有 closed issue 均视为 archived） |
| 已设置 label 名 | closed issue（**无**该 label） | closed issue（**有**该 label） |

**命令行设置**:

```bash
# 设置归档 label（例如使用名为 "archived" 的 label）
colyn config set todo.github.archivedLabel archived
```

---

### todo.github.typeLabels

**类型**: `object`（可选，键值均为 `string`）
**默认值**: `{}`
**说明**: GitHub backend 专用，定义 colyn 分支类型（type）与 GitHub label 之间的映射关系

**⚠️ 注意**: 该字段为对象映射，**无法通过 `config set` 设置**，必须手动编辑 `.colyn/settings.json`。

**配置示例**:

```jsonc
{
  "todo": {
    "backend": "github",
    "github": {
      "typeLabels": {
        "feature": "enhancement",
        "bugfix": "bug"
      }
    }
  }
}
```

**说明**：上例将 colyn 类型 `feature` 映射到 GitHub label `enhancement`，`bugfix` 映射到 `bug`。未在映射中列出的类型不添加额外 label。

---

### Todo 配置示例

**使用 GitHub Issues 后端（完整配置）**:

```jsonc
{
  "version": 5,
  "todo": {
    "backend": "github",
    "autoArchive": true,
    "github": {
      "archivedLabel": "archived",
      "typeLabels": {
        "feature": "enhancement",
        "bugfix": "bug"
      }
    }
  }
}
```

---

## 命令默认值配置

从 v3.3 起，可以在 `settings.json` 中为各子命令的开关型参数设置项目级或用户级默认值。

**配置位置**：
- 用户级：`~/.config/colyn/settings.json`
- 项目级：`<project>/.colyn/settings.json`
- 还可通过 `branchOverrides` 按分支递归覆盖

### 配置项清单

#### 顶层字段

| 字段 | 默认 | 说明 |
|------|------|------|
| `verbose` | `false` | 为所有命令开启详细输出，等价于每次加 `-v` |
| `syncFiles` | `[]` | 未跟踪文件同步清单（支持通配符），见下方说明 |

#### commands.merge

| 字段 | 默认 | CLI 开启 | CLI 关闭 | 说明 |
|------|------|----------|----------|------|
| `build` | `true` | `--build` | `--no-build` | 合并前执行构建 |
| `rebase` | `true` | `--rebase` | `--no-rebase` | 使用 rebase 更新主分支 |
| `update` | `true` | `--update` | `--no-update` | 合并前更新所有 worktree |
| `fetch` | `true` | `--fetch` | `--no-fetch` | 执行 git fetch |
| `all` | `true` | `--all` | `--no-all` / `--current-only` | 更新所有 worktree |
| `syncConfig` | `true` | `--sync-config` | `--no-sync-config` | 合并时双向同步运行时配置 |
| `syncFiles` | `true` | `--sync-files` | `--no-sync-files` | 合并时同步未跟踪文件（带回主分支并传播到其他 worktree） |

> ⚠️ `merge.all` 仅在 `merge.update === true` 时生效。若 `update=false`（或命令行 `--no-update`），即使 `all=true` 也不会更新任何 worktree。

#### commands.update

| 字段 | 默认 | CLI 开启 | CLI 关闭 | 说明 |
|------|------|----------|----------|------|
| `rebase` | `true` | `--rebase` | `--no-rebase` | 使用 rebase 更新 |
| `fetch` | `true` | `--fetch` | `--no-fetch` | 执行 git fetch |
| `all` | `true` | `--all` | `--no-all` / `--current-only` | 更新所有 worktree |
| `syncConfig` | `true` | `--sync-config` | `--no-sync-config` | 更新时同步主分支运行时配置 |
| `syncFiles` | `true` | `--sync-files` | `--no-sync-files` | 更新时同步主分支未跟踪文件 |

### 未跟踪文件同步清单（syncFiles）

顶层 `syncFiles` 是**文件清单**（`string[]`），控制「未跟踪文件同步」机制处理哪些文件：在主分支目录与 worktree 目录之间，按清单同步不入 git 的本地文件（如种子数据、本地证书）。默认 `[]`，即功能关闭。

```jsonc
{
  "version": 5,
  "syncFiles": ["data/*.json", "certs/**"]
}
```

要点：

- **通配符**：`*` 匹配单段（不跨 `/`），`**` 跨目录段，风格与 `branchOverrides` 一致
- **同步方向**：`add` / `update` / `repair` 主分支 → worktree；`merge` 先把 worktree 新增文件带回主分支，再随 `--update` 环节传播到其他 worktree
- **保守语义**：目标缺失才复制；两侧都有且内容相同则不动；**内容不同报冲突提示，不覆盖、不合并**；永不传播删除
- **自动排除**：已被 git 跟踪的文件由 git 同步；运行时配置文件（`.env.local` 等）由运行时配置同步处理，二者命中时输出跳过提示
- **建议同步加入 `.gitignore`**：清单内的文件若未被 git 忽略，会出现在 `git status` 未跟踪列表中，可能导致 `update` / `merge` 判定工作目录不干净而跳过

#### commands.release

| 字段 | 默认 | CLI 开启 | CLI 关闭 | 说明 |
|------|------|----------|----------|------|
| `update` | `true` | `--update` | `--no-update` | 发布成功后自动 update 所有 worktree |
| `build` | `true` | `--build` | `--no-build` | 发布前执行构建 |
| `tag` | `true` | `--tag` | `--no-tag` | 创建 git tag |
| `versionUpdate` | `true` | `--version-update` | `--no-version-update` | 更新版本号 |

#### commands.checkout

| 字段 | 默认 | CLI 开启 | CLI 关闭 | 说明 |
|------|------|----------|----------|------|
| `fetch` | `true` | `--fetch` | `--no-fetch` | checkout 前执行 git fetch |

### 顶层 verbose 共享

顶层 `verbose: boolean` 字段会作用于所有支持 `-v/--verbose` 的命令（merge、release 等）。命令行上 `-v` 或 `--no-verbose` 总是优先。

### 三态解析

所有开关型参数遵循以下优先级：

1. **命令行显式**：`--xxx` 或 `--no-xxx` 直接指定，最高优先
2. **配置文件**：`settings.json` 中 `commands.<cmd>.<key>` 的值（含 branchOverrides）
3. **内置默认**：命令的内置默认值（通常为 `true`）

### 配置示例

```jsonc
{
  "version": 5,

  // 顶层 verbose：所有命令共享
  "verbose": true,

  "commands": {
    "merge": {
      "build": false,    // 合并时默认跳过构建
      "rebase": false    // 不做 rebase
    },
    "update": {
      "all": false       // 只更新当前 worktree（覆盖新版默认 all=true）
    }
  },

  // release/* 分支上，强制执行构建
  "branchOverrides": {
    "release/*": {
      "commands": {
        "merge": { "build": true }
      }
    }
  }
}
```

**含义**：
- 全局开启详细输出
- merge 默认跳过 build、不 rebase（平时快速迭代）
- update 默认只更新当前 worktree
- 在 `release/*` 分支上合并时，仍执行 build

### 反向覆盖与 --current-only 别名

每个配置项都对应一对 CLI flag：`--xxx`（开启）/ `--no-xxx`（关闭）。例如配置 `commands.merge.build=true`，命令行 `merge --no-build` 可临时覆盖。

`update --all` / `merge --all` 的 `--no-all` 提供了别名 `--current-only`，语义更直观：

```bash
# 以下两条命令等价
colyn update --no-all
colyn update --current-only
```

### 破坏性变更（v3.3）

> **升级时请注意以下不兼容变更**：

| 变更 | 旧用法 | 新用法 |
|------|--------|--------|
| `merge --skip-build` 已移除 | `colyn merge --skip-build` | `colyn merge --no-build` |
| `merge --update-all` 已移除 | `colyn merge --update-all` | `colyn merge --all` |
| `update --all` 默认反转 | 需显式加 `--all` | 默认即更新所有 worktree |
| 恢复旧行为 | 无需参数 | `colyn update --current-only` |
| verbose 配置来源变更 | 各命令独立 | 读取顶层 `verbose` 字段 |

---

## 下一步

- 查看 [命令参考](04-command-reference.md) 了解所有可用命令
- 查看 [最佳实践](07-best-practices.md) 了解配置建议

---

**相关文档**:
- [设计文档: 配置迁移](../docs/design-config-migration.md)
- [设计文档: 命令默认值配置](../develop/design/design-command-defaults.md)
- [CLAUDE.md: 配置设计原则](../CLAUDE.md#配置设计原则)
