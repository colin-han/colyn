# Branch Category 设计文档

**创建时间**：2026-02-26
**状态**：✅ 已实现

---

## 1. 概述

Branch Category（分支类别）是 Colyn 用于描述分支用途的分类标签。它贯穿分支命名、Todo 管理和列表显示三个场景，是连接 Branch Name 与 Todo ID 的核心概念。

---

## 2. 核心概念及关系

### 2.1 三个概念

| 概念 | 说明 | 示例 |
|------|------|------|
| **Category** | 分支类别，描述工作的性质 | `feature`、`bugfix` |
| **Branch Name** | Git 分支完整名称，格式为 `{category}/{name}` | `feature/user-auth` |
| **Todo ID** | Todo 任务的唯一标识符，格式为 `{category}/{name}` | `feature/user-auth` |

### 2.2 关系图

```
Category (name + abbr)
    │
    ├── 用于 Branch Name：{category.name}/{name}
    │       示例：feature/user-auth
    │
    └── 用于 Todo ID：   {category.name}/{name}
            示例：feature/user-auth
```

**关键设计**：Branch Name 与 Todo ID 使用完全相同的格式，一个 Todo 任务与它对应的分支共享同一个标识符。

### 2.3 Branch Name 与 Todo ID 的等价性

```
Todo ID:     feature/user-auth
                │
                └── 同时也是 Branch Name: feature/user-auth
```

当用户执行 `colyn todo start feature/user-auth` 时，系统会用该 Todo ID 作为分支名直接创建/切换到 `feature/user-auth` 分支。

---

## 3. Category 数据结构

```typescript
interface BranchCategory {
  name: string;   // 类别名称，用于 Branch Name 和 Todo ID
  abbr?: string;  // 显示缩写（可含 emoji），仅用于 UI 展示
}
```

### 3.1 字段说明

| 字段 | 用途 | 示例 |
|------|------|------|
| `name` | 实际写入 Branch Name 和 Todo ID 的字符串 | `"feature"` |
| `abbr` | UI 选择列表和 todo list 表格中的显示文本 | `"✨feat"` |

**重要规则**：
- `name` 是功能性字段，用于实际的 Git 操作和文件存储
- `abbr` 是展示性字段，**不影响任何实际数据**
- 未设置 `abbr` 时，截取 `name` 前 4 个字符作为 fallback

### 3.2 默认 Category 列表

```typescript
const DEFAULT_BRANCH_CATEGORIES: BranchCategory[] = [
  { name: 'feature',  abbr: '✨feat' },
  { name: 'bugfix',   abbr: '🐛fix'  },
  { name: 'refactor', abbr: '♻️ref'  },
  { name: 'document', abbr: '📝doc'  },
];
```

---

## 4. abbr 的使用范围

abbr **仅用于 UI 展示**，不影响任何数据写入。

| 场景 | 显示内容 | 实际写入值 |
|------|----------|------------|
| 类型选择列表（`add`/`checkout`/`todo add`） | `✨feat (feature)` | `feature`（写入 Branch Name / Todo ID） |
| `todo list` 表格的 Type 列 | `✨feat` | — |
| `checkout`/`add` 中的 pending todo 列表 | `✨feat` | — |

---

## 5. 合并策略

Category 列表从三个来源合并，按 `name` 去重（第一次出现的优先）：

```
项目配置 (.colyn/settings.json)
    +
用户配置 (~/.config/colyn/settings.json)
    +
内置默认值
    ↓
按 name 去重（前者优先）
    ↓
最终列表
```

**示例**：

```json
// 项目配置
{ "branchCategories": [{ "name": "hotfix", "abbr": "🔥fix" }] }

// 用户配置
{ "branchCategories": [{ "name": "feature", "abbr": "⭐feat" }] }

// 最终列表
[
  { "name": "hotfix",   "abbr": "🔥fix"  },  // 来自项目配置
  { "name": "feature",  "abbr": "⭐feat" },  // 来自用户配置（覆盖默认）
  { "name": "bugfix",   "abbr": "🐛fix"  },  // 来自默认值
  { "name": "refactor", "abbr": "♻️ref"  },  // 来自默认值
  { "name": "document", "abbr": "📝doc"  },  // 来自默认值
]
```

---

## 6. 完整数据流示例

以用户新建一个 feature 任务为例：

```
1. 用户执行：colyn todo add

2. 系统显示类型选择列表：
   ❯ ✨feat (feature)     ← 显示 abbr (name)
     🐛fix  (bugfix)
     ♻️ref  (refactor)
     📝doc  (document)

3. 用户选择 "✨feat (feature)"
   → 写入 Todo: { type: "feature", name: "user-auth", ... }
   → Todo ID = "feature/user-auth"

4. 用户执行：colyn todo start feature/user-auth
   → 创建/切换到 Git 分支 "feature/user-auth"
   → Branch Name = "feature/user-auth"

5. 用户执行：colyn todo list
   Type 列显示：✨feat    ← 仅显示 abbr
   实际存储：   feature   ← type 字段保持原值
```

---

## 7. 配置方式

在 `.colyn/settings.json`（项目级）或 `~/.config/colyn/settings.json`（用户级）中配置：

```json
{
  "branchCategories": [
    { "name": "hotfix", "abbr": "🔥fix" },
    { "name": "chore" }
  ]
}
```

**查看当前生效的完整列表**：

```bash
colyn config get branchCategories
```

输出（JSON 数组，包含合并后的所有 category）：

```json
[
  { "name": "hotfix",   "abbr": "🔥fix"  },
  { "name": "chore",    "abbr": "chor"   },
  { "name": "feature",  "abbr": "✨feat" },
  { "name": "bugfix",   "abbr": "🐛fix"  },
  { "name": "refactor", "abbr": "♻️ref"  },
  { "name": "document", "abbr": "📝doc"  }
]
```

> `chore` 无 `abbr`，fallback 为 `name` 前 4 字符 `"chor"`。

---

## 8. 相关文档

- [用户手册：配置系统 → branchCategories](../../manual/10-configuration.md#branchcategories)
- [用户手册：config get 命令](../../manual/04-command-reference/03-system-config.md)
- [术语表](../glossary.md)
