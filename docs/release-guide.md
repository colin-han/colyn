# 发布脚本使用说明

## 功能

自动化版本发布流程，包括：

1. ✅ 验证 git 工作区状态（必须干净）
2. ✅ 运行代码质量检查（lint）
3. ✅ 编译项目
4. ✅ 更新 package.json 版本号
5. ✅ 创建 git commit
6. ✅ 创建 git tag
7. ✅ 推送到远程仓库

## 使用方法

### 快捷命令（推荐）

```bash
# 发布补丁版本 (1.2.0 -> 1.2.1)
volta run yarn release:patch

# 发布次版本 (1.2.0 -> 1.3.0)
volta run yarn release:minor

# 发布主版本 (1.2.0 -> 2.0.0)
volta run yarn release:major
```

### 直接运行脚本

```bash
# 发布补丁版本
node scripts/release.js patch

# 发布次版本
node scripts/release.js minor

# 发布主版本
node scripts/release.js major

# 指定版本号
node scripts/release.js 1.2.3
```

## 版本号规则

遵循 [语义化版本 (Semantic Versioning)](https://semver.org/lang/zh-CN/)：

- **主版本号 (major)**：不兼容的 API 修改
- **次版本号 (minor)**：向下兼容的功能性新增
- **补丁版本 (patch)**：向下兼容的问题修正

### 示例

| 当前版本 | 类型 | 新版本 | 适用场景 |
|---------|------|--------|---------|
| 1.2.0 | patch | 1.2.1 | 修复 bug、优化性能 |
| 1.2.0 | minor | 1.3.0 | 新增功能、新增命令 |
| 1.2.0 | major | 2.0.0 | 破坏性变更、重构 |

## 发布流程

### 1. 准备工作

确保：
- ✅ 所有代码已提交
- ✅ 工作区干净（无未提交的更改）
- ✅ 在正确的分支上（通常是 main）

```bash
# 检查状态
git status

# 如果有未提交的更改，先提交
git add .
git commit -m "feat: 添加新功能"
```

### 2. 运行发布脚本

```bash
# 发布补丁版本
volta run yarn release:patch
```

脚本会自动执行以下步骤：

```
=== Colyn 发布脚本 ===

步骤 1: 检查 git 状态
✓ 工作区干净
  当前分支: main

步骤 2: 确定新版本号
  当前版本: 1.2.0
新版本: 1.2.0 -> 1.2.1

步骤 3: 运行测试和代码检查
  运行 lint...
✓ Lint 检查通过

步骤 4: 编译项目
  运行 build...
✓ 编译成功

步骤 5: 更新 package.json
✓ 版本号已更新: 1.2.0 -> 1.2.1

步骤 6: 创建 git commit
✓ 已创建提交: chore: release v1.2.1

步骤 7: 创建 git tag
✓ 已创建标签: v1.2.1

步骤 8: 推送到远程仓库
  推送提交...
✓ 已推送提交
  推送标签...
✓ 已推送标签

=== 发布完成！===

发布信息:
  版本: v1.2.1
  分支: main
  标签: v1.2.1

后续操作:
  1. 在 GitHub 上创建 Release:
     https://github.com/your-repo/releases/new?tag=v1.2.1

  2. 更新安装说明文档（如果需要）

  3. 通知用户新版本发布
```

### 3. 后续操作

#### 创建 GitHub Release

1. 访问 GitHub 仓库的 Releases 页面
2. 点击 "Draft a new release"
3. 选择刚创建的标签（如 v1.2.1）
4. 填写发布说明：
   - 新增功能
   - Bug 修复
   - 破坏性变更（如果有）
5. 发布 Release

#### 示例发布说明

```markdown
## v1.2.1

### 新增功能
- 添加自动补全功能（支持 Bash/Zsh）
- 新增 `colyn completion` 命令

### Bug 修复
- 修复通过 alias 运行时颜色丢失的问题

### 改进
- 为 `info --short` 输出添加彩色显示
```

## 错误处理

### 工作区不干净

**错误信息**：
```
✗ 工作区不干净，请先提交或 stash 所有更改
```

**解决方案**：
```bash
# 提交所有更改
git add .
git commit -m "chore: 准备发布"

# 或者 stash
git stash
```

### Lint 检查失败

**错误信息**：
```
✗ Lint 检查失败
```

**解决方案**：
```bash
# 运行 lint 检查
volta run yarn lint

# 自动修复可修复的问题
volta run yarn lint:fix

# 手动修复其他问题
```

### 推送失败

**错误信息**：
```
✗ 推送提交失败
```

**解决方案**：

如果推送失败，脚本会提供回滚命令：

```bash
# 删除标签
git tag -d v1.2.1

# 回滚提交
git reset --hard HEAD~1

# 解决问题后重新运行发布脚本
```

## 回滚发布

如果发现发布有问题，需要回滚：

### 1. 本地回滚

```bash
# 删除本地标签
git tag -d v1.2.1

# 回滚提交
git reset --hard HEAD~1
```

### 2. 远程回滚

```bash
# 删除远程标签
git push origin :refs/tags/v1.2.1

# 强制推送（谨慎使用）
git push origin main --force
```

### 3. GitHub Release 回滚

1. 访问 GitHub Releases 页面
2. 找到对应的 Release
3. 点击 "Delete" 删除

## 最佳实践

### 1. 发布前检查

- ✅ 确保所有测试通过
- ✅ 确保 lint 检查通过
- ✅ 确保文档已更新
- ✅ 确保 CHANGELOG 已更新（如果有）

### 2. 提交消息规范

发布脚本会创建以下格式的提交消息：

```
chore: release v1.2.1

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### 3. 发布频率

- **补丁版本**：随时发布（bug 修复）
- **次版本**：每 1-2 周（新功能）
- **主版本**：慎重发布（破坏性变更）

### 4. 版本号选择指南

| 变更类型 | 版本类型 | 示例 |
|---------|---------|------|
| 修复 bug | patch | 1.2.0 -> 1.2.1 |
| 新增命令 | minor | 1.2.0 -> 1.3.0 |
| 新增选项 | minor | 1.2.0 -> 1.3.0 |
| 优化性能 | patch | 1.2.0 -> 1.2.1 |
| 改进文档 | patch | 1.2.0 -> 1.2.1 |
| 重构代码（不改接口） | patch | 1.2.0 -> 1.2.1 |
| 删除命令 | major | 1.2.0 -> 2.0.0 |
| 改变命令行为 | major | 1.2.0 -> 2.0.0 |
| 重命名命令 | major | 1.2.0 -> 2.0.0 |

## 常见问题

### Q: 可以跳过某些步骤吗？

A: 不建议。发布脚本的每个步骤都很重要：
- Lint 确保代码质量
- 编译确保代码可用
- Git 检查确保不会丢失更改

### Q: 发布失败了怎么办？

A: 脚本会提供详细的错误信息和回滚命令。按照提示操作即可。

### Q: 可以在其他分支上发布吗？

A: 可以，但建议只在 main 或 release 分支上发布。

### Q: 标签命名规则是什么？

A: 自动创建的标签格式为 `v<version>`，如 `v1.2.1`。

## 参考资料

- [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)
- [约定式提交](https://www.conventionalcommits.org/zh-hans/)
- [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)
