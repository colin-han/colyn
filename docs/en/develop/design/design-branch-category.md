# Branch Category Design Document

**Created**: 2026-02-26
**Status**: ✅ Implemented

---

## 1. Overview

Branch Category is a classification label used by Colyn to describe the purpose of a branch. It runs through three scenarios: branch naming, Todo management, and list display — serving as the core concept that connects Branch Name and Todo ID.

---

## 2. Core Concepts and Relationships

### 2.1 The Three Concepts

| Concept | Description | Example |
|---------|-------------|---------|
| **Category** | Branch type, describes the nature of the work | `feature`, `bugfix` |
| **Branch Name** | Full Git branch name, format: `{category}/{name}` | `feature/user-auth` |
| **Todo ID** | Unique identifier for a Todo task, format: `{category}/{name}` | `feature/user-auth` |

### 2.2 Relationship Diagram

```
Category (name + abbr)
    │
    ├── Used in Branch Name: {category.name}/{name}
    │       Example: feature/user-auth
    │
    └── Used in Todo ID:     {category.name}/{name}
            Example: feature/user-auth
```

**Key design**: Branch Name and Todo ID use exactly the same format. A Todo task and its corresponding branch share the same identifier.

### 2.3 Equivalence of Branch Name and Todo ID

```
Todo ID:     feature/user-auth
                │
                └── Also the Branch Name: feature/user-auth
```

When a user runs `colyn todo start feature/user-auth`, the system uses the Todo ID directly as the branch name to create/switch to the `feature/user-auth` branch.

---

## 3. Category Data Structure

```typescript
interface BranchCategory {
  name: string;   // Category name, used in Branch Name and Todo ID
  abbr?: string;  // Display abbreviation (may include emoji), for UI display only
}
```

### 3.1 Field Descriptions

| Field | Purpose | Example |
|-------|---------|---------|
| `name` | The string written into Branch Name and Todo ID | `"feature"` |
| `abbr` | Display text in UI selection lists and todo list table | `"✨feat"` |

**Important rules**:
- `name` is a functional field, used for actual Git operations and file storage
- `abbr` is a display-only field — **it does not affect any actual data**
- If `abbr` is not set, the first 4 characters of `name` are used as a fallback

### 3.2 Default Category List

```typescript
const DEFAULT_BRANCH_CATEGORIES: BranchCategory[] = [
  { name: 'feature',  abbr: '✨feat' },
  { name: 'bugfix',   abbr: '🐛fix'  },
  { name: 'refactor', abbr: '♻️ref'  },
  { name: 'document', abbr: '📝doc'  },
];
```

---

## 4. Scope of abbr Usage

`abbr` is **used for UI display only** and does not affect any data writes.

| Scenario | Display Content | Actual Written Value |
|----------|-----------------|----------------------|
| Type selection list (`add`/`checkout`/`todo add`) | `✨feat (feature)` | `feature` (written to Branch Name / Todo ID) |
| `todo list` table Type column | `✨feat` | — |
| Pending todo list in `checkout`/`add` | `✨feat` | — |

---

## 5. Merge Strategy

The category list is merged from three sources, deduplicated by `name` (first occurrence wins):

```
Project config (.colyn/settings.json)
    +
User config (~/.config/colyn/settings.json)
    +
Built-in defaults
    ↓
Deduplicate by name (first occurrence wins)
    ↓
Final list
```

**Example**:

```json
// Project config
{ "branchCategories": [{ "name": "hotfix", "abbr": "🔥fix" }] }

// User config
{ "branchCategories": [{ "name": "feature", "abbr": "⭐feat" }] }

// Final list
[
  { "name": "hotfix",   "abbr": "🔥fix"  },  // from project config
  { "name": "feature",  "abbr": "⭐feat" },  // from user config (overrides default)
  { "name": "bugfix",   "abbr": "🐛fix"  },  // from defaults
  { "name": "refactor", "abbr": "♻️ref"  },  // from defaults
  { "name": "document", "abbr": "📝doc"  },  // from defaults
]
```

---

## 6. Complete Data Flow Example

Example: user creates a new feature task:

```
1. User runs: colyn todo add

2. System shows type selection list:
   ❯ ✨feat (feature)     ← displays abbr (name)
     🐛fix  (bugfix)
     ♻️ref  (refactor)
     📝doc  (document)

3. User selects "✨feat (feature)"
   → Writes Todo: { type: "feature", name: "user-auth", ... }
   → Todo ID = "feature/user-auth"

4. User runs: colyn todo start feature/user-auth
   → Creates/switches to Git branch "feature/user-auth"
   → Branch Name = "feature/user-auth"

5. User runs: colyn todo list
   Type column displays: ✨feat    ← shows abbr only
   Actually stored:      feature   ← type field retains original value
```

---

## 7. Configuration

Configure in `.colyn/settings.json` (project-level) or `~/.config/colyn/settings.json` (user-level):

```json
{
  "branchCategories": [
    { "name": "hotfix", "abbr": "🔥fix" },
    { "name": "chore" }
  ]
}
```

**View the current effective complete list**:

```bash
colyn config get branchCategories
```

Output (JSON array, includes all merged categories):

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

> `chore` has no `abbr`, so the fallback is the first 4 characters of `name`: `"chor"`.

---

## 8. Related Documentation

- [User Manual: Configuration System → branchCategories](../../manual/10-configuration.md#branchcategories)
- [User Manual: config get command](../../manual/04-command-reference/03-system-config.md)
- [Glossary](../glossary.md)
