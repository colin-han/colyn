# Xcode 插件设计文档（草案）

**状态**：已实现
**创建时间**：2026-02-22
**实现文件**：`src/plugins/builtin/xcode.ts`
**相关文档**：`docs/design-plugin-toolchain.md`

---

## 1. 背景

Xcode 是 Apple 平台原生应用（iOS / macOS / tvOS / watchOS）的主要开发工具。将 Xcode 项目纳入 colyn 管理时，面临一个核心难题：`xcodebuild` 命令需要指定 `-scheme` 和 `-destination` 参数，而这些参数无法从项目文件中自动唯一确定（一个项目可能有多个 scheme，平台类型也有多种选择）。

本文档记录 Xcode 插件的设计分析，包括：
- 项目类型检测策略
- 各扩展点的实现方案
- 利用 `repairSettings` 机制解决构建参数问题的思路
- 尚未解决的设计问题

> **说明**：本文档为草案状态，Xcode 插件尚未实现。实现时需基于本文档讨论确认细节。

---

## 2. 项目类型检测

### 2.1 检测目标文件

| 优先级 | 文件 / 目录 | 对应场景 |
|--------|------------|---------|
| 1（最高） | `*.xcworkspace/`（排除内部的 `project.xcworkspace`） | CocoaPods 管理的项目；多 target 工作区 |
| 2 | `*.xcodeproj/` | 标准单项目 Xcode 工程 |
| 3 | `Package.swift` | 纯 Swift Package Manager 项目（无 .xcodeproj） |

### 2.2 关键过滤规则

**必须排除 `project.xcworkspace`**：每个 `.xcodeproj` 内部都会自动生成一个 `project.xcworkspace` 子目录（路径为 `*.xcodeproj/project.xcworkspace/`），这是 Xcode 自动管理的内部文件，不是用户创建的独立 workspace。若将其误检为有效 workspace，后续 `-workspace` 参数会指向错误路径。

**检测逻辑（伪代码）**：

```typescript
async detect(worktreePath: string): Promise<boolean> {
  const entries = await fs.readdir(worktreePath);

  // 检测真正的 xcworkspace（排除名为 project.xcworkspace 的）
  const hasWorkspace = entries.some(
    e => e.endsWith('.xcworkspace') && e !== 'project.xcworkspace'
  );

  // 检测 xcodeproj
  const hasProject = entries.some(e => e.endsWith('.xcodeproj'));

  // 检测 Package.swift
  const hasSPM = entries.includes('Package.swift');

  return hasWorkspace || hasProject || hasSPM;
}
```

---

## 3. 各扩展点分析

### 3.1 扩展点总览

| 扩展点 | 实现方案 | 备注 |
|--------|----------|------|
| `detect` | 检测 `.xcworkspace`（非 project.xcworkspace）/ `.xcodeproj` / `Package.swift` | 见 §2 |
| `portConfig` | 返回 `null` | 原生 App 无 web 端口需求 |
| `getRuntimeConfigFileName` | 返回 `null` | Xcode 无标准运行时配置文件 |
| `readRuntimeConfig` | 不实现 | 不适用 |
| `writeRuntimeConfig` | 不实现 | 不适用 |
| `devServerCommand` | 返回 `null` | 原生 App 不需要 dev server |
| `repairSettings` | 检测 scheme / destination，交互询问，保存到 `pluginSettings.xcode` | 见 §4 |
| `install` | 检测 Podfile / Package.swift，执行相应安装命令 | 见 §5.1 |
| `lint` | 检测 `.swiftlint.yml`，执行 SwiftLint | 见 §5.2 |
| `build` | 从 `pluginSettings.xcode` 读取参数，执行 `xcodebuild` | 见 §5.3 |
| `bumpVersion` | `agvtool new-marketing-version {version}` | 见 §5.4 |

---

## 4. repairSettings 设计

### 4.1 问题背景

`xcodebuild` 命令需要以下参数才能正确执行：

```bash
xcodebuild -workspace MyApp.xcworkspace \
           -scheme MyApp \
           -destination "generic/platform=iOS Simulator" \
           build
```

- **`-workspace` / `-project`**：可从文件系统扫描获得，但项目根目录可能有多个 `.xcodeproj`
- **`-scheme`**：项目可能有多个 scheme（主 App、Extension、测试等），无法自动选择
- **`-destination`**：平台类型（iOS / macOS / tvOS 等）可从 `project.pbxproj` 的 `SDKROOT` 推断，但不总是唯一

`repairSettings` 的职责：在 `colyn init` / `colyn repair` 时自动发现能确定的信息，交互式询问无法确定的信息，将结果保存到 `pluginSettings.xcode`，供 `build` 命令使用。

### 4.2 执行流程

```
步骤 1：查找项目入口
  扫描 worktreePath，找到 .xcworkspace（过滤 project.xcworkspace）或 .xcodeproj
  记录 workspaceFile 或 projectFile

步骤 2：发现 shared scheme
  路径：{project}.xcodeproj/xcshareddata/xcschemes/*.xcscheme
  shared scheme 会提交到 git，是最可靠的构建目标
  非 shared 的 scheme 存储在用户私有目录中，不会提交

步骤 3：推断目标平台
  读取 {project}.xcodeproj/project.pbxproj
  查找 SDKROOT 值：
    iphoneos     → iOS
    macosx       → macOS
    appletvos    → tvOS
    watchos      → watchOS

步骤 4：决策与交互
  - 只有一个 shared scheme → 自动使用，告知用户
  - 有多个 shared scheme   → 让用户选择（单选）
  - 没有 shared scheme     → 提示用户手动输入 scheme 名称
  - destination 可明确推断 → 自动使用
  - destination 不确定     → 询问用户（提供常见选项）

步骤 5：返回结果
  {
    workspace: "MyApp.xcworkspace",  // 或 project: "MyApp.xcodeproj"
    scheme: "MyApp",
    destination: "generic/platform=iOS Simulator"
  }
```

### 4.3 幂等性处理

当 `repair` 命令再次执行时，`context.currentSettings` 中已有上次保存的值：
- 已有值且项目结构未变 → 直接复用，不再询问
- 已有值但对应 scheme 已不存在 → 提示并重新询问
- 用户可通过 `colyn repair` 更新配置（强制重新检测并询问）

### 4.4 非交互模式（nonInteractive = true）

CI 环境下无法弹出交互提问：
- 只使用可以自动推断的值（唯一 shared scheme、可确定的 destination）
- 如果必要信息缺失，返回空对象，跳过配置
- 不输出错误（`build` 命令遇到缺少配置时会自行处理）

### 4.5 Destination 参考值

| 目标平台 | destination 字符串 |
|----------|-------------------|
| iOS 模拟器 | `generic/platform=iOS Simulator` |
| iOS 真机 | `generic/platform=iOS` |
| macOS | `platform=macOS` |
| tvOS 模拟器 | `generic/platform=tvOS Simulator` |
| watchOS 模拟器 | `generic/platform=watchOS Simulator` |

---

## 5. 其他扩展点详解

### 5.1 install

```
检测逻辑（按优先级）：
1. 如果 worktreePath 下有 Podfile
   → 执行 pod install
   → 如果 pod 命令不存在，抛出 PluginCommandError 提示用户安装 CocoaPods

2. 如果 worktreePath 下有 Package.swift（且无 Podfile）
   → 执行 swift package resolve

3. 两者都没有 → 静默跳过
```

### 5.2 lint

```
检测逻辑：
1. 如果 worktreePath 下有 .swiftlint.yml 或 .swiftlint.yaml
   → 执行 swiftlint lint
   → 如果 swiftlint 命令不存在，静默跳过（不是错误，工具未安装）
   → 失败时抛出 PluginCommandError

2. 否则 → 静默跳过
```

### 5.3 build

**方案 A（纯 SPM）**：直接执行 `swift build`，无需任何参数。适用于没有 `.xcodeproj` 的纯 SPM 项目。

**方案 B（xcodebuild）**：读取 `pluginSettings.xcode` 中保存的参数，执行 `xcodebuild`。是 iOS/macOS 原生 App 项目的正确方案。

**推荐的 build 逻辑**：

```
1. 尝试从 pluginSettings.xcode 读取 scheme：
   - 如果 scheme 存在：
     构建 xcodebuild 命令，根据 workspace/project 选择 -workspace 或 -project 参数
     执行：xcodebuild -workspace {w} -scheme {s} -destination {d} build
     或：  xcodebuild -project   {p} -scheme {s} -destination {d} build

   - 如果 scheme 不存在（repairSettings 未运行或用户跳过配置）：
     检查是否有 Package.swift
       有 → SPM fallback：swift build（可能不是用户想要的，但至少能构建）
       无 → 静默跳过，同时输出提示："请运行 colyn repair 配置 Xcode 构建参数"
```

**方案 B 的核心挑战**：许多 Xcode 项目没有 shared scheme，只有本地 scheme。这会导致：
1. `repairSettings` 无法自动发现 scheme → 必须用户手动输入
2. 若用户不填写，`build` 无法执行 → 降级为方案 A 或静默跳过

### 5.4 bumpVersion

使用 Apple 官方工具 `agvtool`：

```bash
# 在 worktreePath 下执行
agvtool new-marketing-version {version}
```

前提条件：
- 项目 Build Settings 中必须设置 `VERSIONING_SYSTEM = apple-generic`（agvtool 依赖此设置）
- 项目需要有 `CFBundleShortVersionString`（通常自动存在）

若 `agvtool` 不可用或项目未配置 `VERSIONING_SYSTEM`：
- 备选：直接修改 `{project}.xcodeproj/project.pbxproj` 中的 `MARKETING_VERSION` 字段
- 此方案较脆弱，依赖文本格式

---

## 6. settings.json 示例

配置成功保存后，`.colyn/settings.json` 示例：

```json
{
  "version": 3,
  "plugins": ["xcode"],
  "pluginSettings": {
    "xcode": {
      "workspace": "MyApp.xcworkspace",
      "scheme": "MyApp",
      "destination": "generic/platform=iOS Simulator"
    }
  }
}
```

纯 SPM 项目（无 scheme 配置）示例：

```json
{
  "version": 3,
  "plugins": ["xcode"],
  "pluginSettings": {
    "xcode": {}
  }
}
```

---

## 7. 开放设计问题

以下问题在具体实现时需进一步确认：

| 编号 | 问题 | 倾向方案 |
|------|------|----------|
| Q1 | 没有 shared scheme 时，是提示手动输入还是列出本地 scheme？ | 提示手动输入（本地 scheme 路径因人而异，不可靠） |
| Q2 | 多 target 项目（App + Extension + Tests）应该构建哪个 scheme？ | 让用户选择（无法自动判断哪个是"主" scheme） |
| Q3 | `agvtool` 不可用时的降级方案？ | 直接修改 `project.pbxproj` 的 `MARKETING_VERSION` |
| Q4 | `colyn repair` 重跑时，是否强制重新询问所有参数？ | 否，只询问缺失或检测到变化的参数 |
| Q5 | CI 环境（nonInteractive=true）无 scheme 时，`build` 是报错还是跳过？ | 静默跳过，避免阻断 CI pipeline |

---

## 8. 目录结构

```
src/plugins/builtin/
└── xcode.ts    # 待实现（本文档草案确认后）
```

---

## 9. 实施计划

1. 基于本设计文档讨论并确认细节（尤其是 §6 中的开放问题）
2. 实现 `src/plugins/builtin/xcode.ts`
3. 注册到 `src/plugins/index.ts`
4. 更新 `docs/design-plugin-toolchain.md` 添加 xcode 插件条目
5. 更新用户手册 `manual/11-plugin-system.md`
