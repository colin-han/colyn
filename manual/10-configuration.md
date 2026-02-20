# 配置系统

本章详细介绍 Colyn 的配置系统,包括配置文件的位置、结构、加载顺序以及所有可用的配置项。

---

## 目录

1. [配置文件位置](#配置文件位置)
2. [配置加载顺序](#配置加载顺序)
3. [配置文件结构](#配置文件结构)
4. [全局配置项](#全局配置项)
5. [Tmux 配置项](#tmux-配置项)
6. [分支特定配置](#分支特定配置)
7. [配置管理命令](#配置管理命令)
8. [配置示例](#配置示例)
9. [配置版本与迁移](#配置版本与迁移)

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
- 跨项目通用的 tmux 布局偏好
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
- 项目特定的 tmux 布局
- 项目特定的系统命令配置
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
  "version": 3,
  "lang": "zh-CN",
  "systemCommands": {
    "npm": "yarn"
  }
}
EOF

# 或使用 YAML 格式
cat > ~/.config/colyn/settings.yaml << 'EOF'
version: 3
lang: zh-CN
systemCommands:
  npm: yarn
EOF

# 创建项目级配置文件(在项目根目录执行)
mkdir -p .colyn
cat > .colyn/settings.json << 'EOF'
{
  "version": 3,
  "tmux": {
    "layout": "three-pane",
    "autoRun": true
  }
}
EOF
```

---

## 配置加载顺序

Colyn 使用多层配置系统,所有配置项（`lang`、`systemCommands`、`tmux`）都遵循统一的优先级规则。

**⚠️ 重要说明**: 以下列表按**优先级从高到低**排序,**序号越小优先级越高**。

### 统一配置优先级

适用于所有配置项（`lang`、`systemCommands.npm`、`systemCommands.claude`、`tmux.*`）:

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
   └── 内置默认值（如 main 分支默认单窗格布局）
```

**说明**:
- **所有配置项**都支持分支覆盖（`branchOverrides`）
- 你可以在 `branchOverrides` 中覆写 `lang`、`systemCommands`、`tmux` 等任意配置
- System builtin 仅对特定分支提供默认值（如 `main` 分支）

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
  "tmux": {
    "autoRun": true,
    "leftPane": {
      "command": "continue claude session",
      "size": "60%"
    }
  }
}

// 项目级配置（只修改 autoRun）
{
  "tmux": {
    "autoRun": false
  }
}

// 最终生效的配置
{
  "tmux": {
    "autoRun": false,  // ← 来自项目级配置
    "leftPane": {      // ← 来自用户级配置（保留）
      "command": "continue claude session",
      "size": "60%"
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
  "version": 3,

  // 界面语言
  "lang": "zh-CN" | "en",

  // 系统命令配置
  "systemCommands": {
    "npm": "npm" | "yarn" | "pnpm",  // 包管理器命令
    "claude": "claude"                // Claude CLI 命令
  },

  // tmux 配置
  "tmux": {
    "autoRun": true | false,           // 是否自动运行命令
    "layout": "single-pane"            // 布局类型
            | "two-pane-horizontal"
            | "two-pane-vertical"
            | "three-pane"
            | "four-pane",

    // 窗格配置（根据布局类型使用不同的窗格）
    "leftPane": { /* PaneConfig */ },
    "rightPane": { /* PaneConfig */ },
    "topPane": { /* PaneConfig */ },
    "bottomPane": { /* PaneConfig */ },
    "topRightPane": { /* PaneConfig */ },
    "bottomRightPane": { /* PaneConfig */ },
    "topLeftPane": { /* PaneConfig */ },
    "bottomLeftPane": { /* PaneConfig */ },

    // 四窗格布局的分割配置
    "horizontalSplit": "50%",  // 上下分割线位置
    "verticalSplit": "50%"     // 左右分割线位置
  },

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
**默认值**: `3`（当前版本）
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
colyn config set npm yarn --user

# 设置项目级包管理器
colyn config set npm pnpm
```

#### systemCommands.claude

**类型**: `string`
**默认值**: `"claude"`
**说明**: Claude CLI 命令,支持添加额外参数

**示例**:

```json
{
  "systemCommands": {
    "claude": "claude --dangerously-skip-permissions"
  }
}
```

**用途**:
- 指定 Claude CLI 的自定义路径
- 添加全局参数(如 `--dangerously-skip-permissions`)
- 配合内置命令 `continue claude session` 使用

---

## Tmux 配置项

### tmux.autoRun

**类型**: `boolean`
**默认值**: `true`
**说明**: 是否自动在窗格中运行命令

**作用**:
- `true` - 创建 worktree 时自动在对应窗格执行配置的命令
- `false` - 创建窗格但不自动运行命令(仅打开 shell)

**示例**:

```json
{
  "tmux": {
    "autoRun": false
  }
}
```

**使用场景**:
- Main 分支通常设置为 `false`(不需要自动启动服务)
- Feature 分支通常设置为 `true`(自动启动开发环境)

### tmux.layout

**类型**: `"single-pane" | "two-pane-horizontal" | "two-pane-vertical" | "three-pane" | "four-pane"`
**默认值**: `"three-pane"`
**说明**: tmux window 的布局类型

#### 支持的布局

**1. single-pane - 单窗格**

```
┌──────────────────────┐
│                      │
│                      │
│                      │
│      Single Pane     │
│                      │
│                      │
│                      │
└──────────────────────┘
```

**用途**: 不需要分割的简单场景(如 main 分支)

---

**2. two-pane-horizontal - 水平两窗格**

```
┌────────────┬─────────┐
│            │         │
│            │         │
│  Left      │  Right  │
│  Pane      │  Pane   │
│            │         │
│            │         │
└────────────┴─────────┘
```

**窗格**: `leftPane`, `rightPane`

---

**3. two-pane-vertical - 垂直两窗格**

```
┌──────────────────────┐
│                      │
│      Top Pane        │
│                      │
├──────────────────────┤
│                      │
│     Bottom Pane      │
│                      │
└──────────────────────┘
```

**窗格**: `topPane`, `bottomPane`

---

**4. three-pane - 三窗格（默认）**

```
┌────────────┬─────────┐
│            │  Top    │
│            │  Right  │
│            │  Pane   │
│   Left     ├─────────┤
│   Pane     │ Bottom  │
│            │  Right  │
│            │  Pane   │
└────────────┴─────────┘
```

**窗格**: `leftPane`, `topRightPane`, `bottomRightPane`

**典型用途**:
- Left: Claude Code (AI 助手)
- Top Right: Dev Server (开发服务器日志)
- Bottom Right: Bash (命令行操作)

---

**5. four-pane - 四窗格**

```
┌──────────┬──────────┐
│   Top    │   Top    │
│   Left   │   Right  │
│   Pane   │   Pane   │
├──────────┼──────────┤
│  Bottom  │  Bottom  │
│   Left   │   Right  │
│   Pane   │   Pane   │
└──────────┴──────────┘
```

**窗格**: `topLeftPane`, `topRightPane`, `bottomLeftPane`, `bottomRightPane`

### 窗格配置（PaneConfig）

每个窗格都可以配置以下属性:

```typescript
{
  "command": string | null,  // 要执行的命令
  "size": string             // 窗格大小（百分比）
}
```

#### command - 窗格命令

**类型**: `string | null`
**默认值**: 取决于窗格位置
**说明**: 在窗格中执行的命令

**支持的值**:

1. **内置命令** - 自动检测和执行
2. **自定义命令** - 任意 shell 命令
3. **null** - 不执行任何命令(仅打开 shell)

##### 内置命令

**`"continue claude session"`**

自动检测并继续 Claude 会话:
- 如果 worktree 存在 Claude session → 执行 `claude -c`(继续会话)
- 如果不存在 → 执行 `claude`(新建会话)

**示例**:

```json
{
  "leftPane": {
    "command": "continue claude session"
  }
}
```

---

**`"start dev server"`**

自动检测并启动开发服务器:
- 检测 `package.json` 中的 `dev` 或 `start` 脚本
- 自动使用配置的包管理器执行

**检测逻辑**:
1. 优先使用 `dev` 脚本
2. 如果没有 `dev`,使用 `start` 脚本
3. 如果都没有,不执行命令

**示例**:

```json
{
  "topRightPane": {
    "command": "start dev server"
  }
}
```

---

##### 自定义命令

你可以指定任意 shell 命令:

```json
{
  "bottomRightPane": {
    "command": "git status && echo 'Ready to code!'"
  }
}
```

##### null - 不执行命令

设置为 `null` 表示不执行任何命令,仅打开一个空 shell:

```json
{
  "bottomRightPane": {
    "command": null
  }
}
```

#### size - 窗格大小

**类型**: `string`
**格式**: `"{数字}%"` 或 `"{数字}"`
**说明**: 窗格占用的空间百分比

**不同布局的 size 含义**:

| 布局 | 窗格 | size 含义 |
|------|------|-----------|
| `two-pane-horizontal` | `leftPane` | 左侧窗格占总宽度的百分比 |
| `two-pane-vertical` | `topPane` | 上方窗格占总高度的百分比 |
| `three-pane` | `leftPane` | 左侧窗格占总宽度的百分比 |
| `three-pane` | `topRightPane` | 右上窗格占右侧高度的百分比 |
| `four-pane` | 各窗格 | 见四窗格布局说明 |

**示例**:

```json
{
  "tmux": {
    "layout": "three-pane",
    "leftPane": {
      "size": "60%"  // 左侧占 60% 宽度
    },
    "topRightPane": {
      "size": "30%"  // 右上占右侧 30% 高度
    }
  }
}
```

### 四窗格布局配置

四窗格布局支持两种配置方式:

#### 方式 1: 同时配置 horizontalSplit 和 verticalSplit

**推荐使用**,提供对称的布局:

```json
{
  "tmux": {
    "layout": "four-pane",
    "horizontalSplit": "50%",  // 上下分割线位置（上方占 50%）
    "verticalSplit": "50%"     // 左右分割线位置（左侧占 50%）
  }
}
```

**效果**:
```
┌──────────┬──────────┐
│    50%   │   50%    │
│    ↑     │          │
├──────────┼──────────┤  ← horizontalSplit: 50%
│          │          │
│          │          │
└──────────┴──────────┘
     ↑
verticalSplit: 50%
```

#### 方式 2: 配置各窗格的 size

**更灵活**,但可能不对称:

```json
{
  "tmux": {
    "layout": "four-pane",
    "topLeftPane": { "size": "60%" },    // 左上占左侧 60% 高度
    "topRightPane": { "size": "40%" },   // 右上占右侧 40% 高度
    "bottomLeftPane": { "size": "40%" }, // 左下占左侧 40% 高度
    "bottomRightPane": { "size": "60%" } // 右下占右侧 60% 高度
  }
}
```

**⚠️ 注意**: 如果同时配置了 split 和 pane size,split 优先级更高,pane size 会被忽略。

---

## 分支特定配置

通过 `branchOverrides` 可以为特定分支或分支模式定制配置。

**⚠️ 重要**: `branchOverrides` 中可以覆写**任意配置项**,包括:
- `lang` - 针对特定分支使用不同语言
- `systemCommands` - 针对特定分支使用不同的包管理器或 Claude 命令
- `tmux` - 针对特定分支使用不同的 tmux 布局

### 配置语法

```json
{
  "branchOverrides": {
    "分支名或模式": {
      // 任意 Settings 配置
      "lang": "...",
      "systemCommands": { ... },
      "tmux": { ... }
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
      "tmux": {
        "layout": "single-pane",
        "autoRun": false
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
      "tmux": {
        "layout": "three-pane",
        "autoRun": true
      }
    },
    "bugfix/*": {
      "tmux": {
        "layout": "two-pane-horizontal"
      }
    }
  }
}
```

**匹配示例**:
- `"feature/*"` 匹配: `feature/auth`, `feature/ui/dashboard`
- `"bugfix/*"` 匹配: `bugfix/login`, `bugfix/user/profile`
- `"*/test"` 匹配: `feature/test`, `bugfix/test`

### 内置分支默认配置

Colyn 为某些分支提供了**系统内置默认配置**,优先级**最低**:

```json
{
  "main": {
    "tmux": {
      "layout": "single-pane",
      "autoRun": false
    }
  }
}
```

**特点**:
- 优先级最低,会被任何用户或项目配置覆盖
- 为常见分支提供合理的默认值
- 可以在用户或项目配置中完全覆盖

### 配置覆盖示例

**示例 1**: Main 分支使用单窗格,Feature 分支使用三窗格

```json
{
  "version": 3,
  "tmux": {
    "layout": "three-pane",
    "autoRun": true
  },
  "branchOverrides": {
    "main": {
      "tmux": {
        "layout": "single-pane",
        "autoRun": false
      }
    },
    "feature/*": {
      "tmux": {
        "leftPane": {
          "command": "continue claude session"
        },
        "topRightPane": {
          "command": "start dev server"
        }
      }
    }
  }
}
```

**示例 2**: 为不同分支使用不同的包管理器和语言

```json
{
  "version": 3,
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

**输出示例**:

```
Colyn Configuration

User-level Config:
  Path: /Users/username/.config/colyn/settings.json
  Status: Exists
  Content:
    {
      "version": 3,
      "lang": "zh-CN"
    }

Project-level Config:
  Path: /Users/username/projects/my-app/.colyn/settings.json
  Status: Exists
  Content:
    {
      "version": 3,
      "tmux": {
        "layout": "three-pane"
      }
    }

Effective Config:

  autoRun: true (default)

  leftPane:
    command: "continue claude session" (default)
    size:    "60%" (default)
  ...
```

### 获取配置值

```bash
# 获取项目级配置值
colyn config get <key>

# 获取用户级配置值
colyn config get <key> --user
```

**支持的 key**:
- `npm` - 包管理器
- `lang` - 界面语言

**示例**:

```bash
# 查看当前项目的包管理器
colyn config get npm

# 查看用户级语言设置
colyn config get lang --user
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
colyn config set npm yarn

# 设置用户级包管理器为 pnpm
colyn config set npm pnpm --user
```

**⚠️ 注意**: `config set` 命令只支持 `npm` 和 `lang` 两个配置项。Tmux 相关配置需要手动编辑配置文件。

---

## 配置示例

### 示例 1: 最小配置

如果你对默认值满意,可以不创建任何配置文件,或者创建一个空的配置:

```json
{
  "version": 3
}
```

**效果**:
- 使用默认布局(`three-pane`)
- 自动运行命令(`autoRun: true`)
- 左侧运行 Claude,右上运行 Dev Server,右下为空 shell

### 示例 2: 简单个性化

设置语言和包管理器:

```json
{
  "version": 3,
  "lang": "zh-CN",
  "systemCommands": {
    "npm": "yarn"
  }
}
```

### 示例 3: 自定义 Tmux 布局

```json
{
  "version": 3,
  "tmux": {
    "layout": "three-pane",
    "autoRun": true,
    "leftPane": {
      "command": "continue claude session",
      "size": "70%"
    },
    "topRightPane": {
      "command": "start dev server",
      "size": "40%"
    },
    "bottomRightPane": {
      "command": "git status",
      "size": "60%"
    }
  }
}
```

### 示例 4: 分支特定配置

```json
{
  "version": 3,
  "lang": "zh-CN",
  "systemCommands": {
    "npm": "yarn"
  },
  "tmux": {
    "layout": "three-pane",
    "autoRun": true
  },
  "branchOverrides": {
    "main": {
      "tmux": {
        "layout": "single-pane",
        "autoRun": false
      }
    },
    "feature/*": {
      "tmux": {
        "leftPane": {
          "size": "60%"
        },
        "topRightPane": {
          "size": "30%"
        }
      }
    },
    "bugfix/*": {
      "tmux": {
        "layout": "two-pane-horizontal",
        "leftPane": {
          "command": "continue claude session"
        },
        "rightPane": {
          "command": null
        }
      }
    }
  }
}
```

### 示例 5: 禁用自动运行

如果你不希望自动运行任何命令:

```json
{
  "version": 3,
  "tmux": {
    "autoRun": false,
    "layout": "three-pane"
  }
}
```

### 示例 6: 团队共享配置

项目级配置可以提交到版本控制,让团队成员共享:

```json
{
  "version": 3,
  "systemCommands": {
    "npm": "pnpm",
    "claude": "claude --dangerously-skip-permissions"
  },
  "tmux": {
    "layout": "three-pane",
    "autoRun": true,
    "leftPane": {
      "command": "continue claude session",
      "size": "60%"
    },
    "topRightPane": {
      "command": "start dev server",
      "size": "30%"
    },
    "bottomRightPane": {
      "command": "npm run test -- --watch",
      "size": "70%"
    }
  },
  "branchOverrides": {
    "main": {
      "tmux": {
        "layout": "single-pane",
        "autoRun": false
      }
    }
  }
}
```

**提交到 Git**:

```bash
git add .colyn/settings.json
git commit -m "Add team tmux configuration"
```

---

## 配置版本与迁移

### 版本管理

Colyn 使用版本号来管理配置文件的演进,当配置结构发生变化时,系统会**自动迁移**你的配置。

**当前版本**: `3`

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
   - `claudeCommand` → `systemCommands.claude`

2. **废弃的内置命令处理**
   - `"auto continues claude session with dangerously skip permissions"` → `"auto continues claude session"`
   - 自动添加 `--dangerously-skip-permissions` 到 `systemCommands.claude`

**迁移示例**:

**旧配置** (Version 1):
```json
{
  "version": 1,
  "npm": "yarn",
  "claudeCommand": "claude --env prod",
  "tmux": {
    "leftPane": {
      "command": "auto continues claude session with dangerously skip permissions"
    }
  }
}
```

**自动迁移后** (Version 2):
```json
{
  "version": 2,
  "systemCommands": {
    "npm": "yarn",
    "claude": "claude --env prod --dangerously-skip-permissions"
  },
  "tmux": {
    "leftPane": {
      "command": "auto continues claude session"
    }
  }
}
```

#### Version 2 → Version 3 (当前版本)

**变更时间**: 2026-02-20

**变更内容**:

1. **重命名内置命令**（去掉 "auto" 前缀）
   - `"auto continues claude session"` → `"continue claude session"`
   - `"auto start dev server"` → `"start dev server"`

2. **配置文件格式支持**
   - 新增 YAML 格式支持（`settings.yaml`, `settings.yml`）
   - 原 JSON 文件现在使用 JSON5 解析（支持注释和尾部逗号）
   - 格式优先级：`settings.json` > `settings.yaml` > `settings.yml`

**迁移示例**:

**旧配置** (Version 2):
```json
{
  "version": 2,
  "systemCommands": {
    "npm": "yarn"
  },
  "tmux": {
    "leftPane": {
      "command": "auto continues claude session"
    },
    "topRightPane": {
      "command": "auto start dev server"
    }
  }
}
```

**自动迁移后** (Version 3):
```json
{
  "version": 3,
  "systemCommands": {
    "npm": "yarn"
  },
  "tmux": {
    "leftPane": {
      "command": "continue claude session"
    },
    "topRightPane": {
      "command": "start dev server"
    }
  }
}
```

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
  "version": 3,
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
echo '{"version": 3}' > ~/.config/colyn/settings.json
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
  "version": 3,
  "systemCommands": { "npm": "yarn" }
}
EOF

cd project-b
cat > .colyn/settings.json << 'EOF'
{
  "version": 3,
  "systemCommands": { "npm": "pnpm" }
}
EOF
```

### 5. 如何禁用 tmux 自动运行?

```json
{
  "version": 3,
  "tmux": {
    "autoRun": false
  }
}
```

或者针对特定分支:

```json
{
  "version": 3,
  "branchOverrides": {
    "main": {
      "tmux": {
        "autoRun": false
      }
    }
  }
}
```

---

## 下一步

- 查看 [tmux 集成](06-tmux-integration.md) 了解 tmux 工作流
- 查看 [命令参考](04-command-reference.md) 了解所有可用命令
- 查看 [最佳实践](07-best-practices.md) 了解配置建议

---

**相关文档**:
- [设计文档: 配置迁移](../docs/design-config-migration.md)
- [CLAUDE.md: 配置设计原则](../CLAUDE.md#配置设计原则)
