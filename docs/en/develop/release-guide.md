# Release Script Usage Guide

## Features

Automated version release process, including:

1. ✅ Verify git working directory status (must be clean)
2. ✅ Install dependencies (using the configured package manager command)
3. ✅ Run code quality checks (lint)
4. ✅ Build project
5. ✅ Update package.json version number
6. ✅ Create git commit
7. ✅ Create git tag
8. ✅ Push to remote repository
9. ✅ Check toolchain publishability (auto-skip when conditions are not met)
10. ✅ Publish to package registry (via toolchain plugin)

## Usage

### Quick Commands (Recommended)

```bash
# Release patch version (1.2.0 -> 1.2.1)
colyn release patch

# Release minor version (1.2.0 -> 1.3.0)
colyn release minor

# Release major version (1.2.0 -> 2.0.0)
colyn release major

# Release specific version
colyn release 1.2.3
```

## Version Number Rules

Following [Semantic Versioning](https://semver.org/):

- **Major version**: Incompatible API changes
- **Minor version**: Backward-compatible feature additions
- **Patch version**: Backward-compatible bug fixes

### Examples

| Current | Type | New | Use Case |
|---------|------|-----|----------|
| 1.2.0 | patch | 1.2.1 | Bug fixes, performance improvements |
| 1.2.0 | minor | 1.3.0 | New features, new commands |
| 1.2.0 | major | 2.0.0 | Breaking changes, refactoring |

## Release Process

### 1. Preparation

Ensure:
- ✅ All code committed
- ✅ Working directory clean (no uncommitted changes)
- ✅ On correct branch (usually main)

```bash
# Check status
git status

# If there are uncommitted changes, commit first
git add .
git commit -m "feat: add new feature"
```

### 2. Run Release Script

```bash
# Release patch version
colyn release patch
```

The script will automatically execute the following steps:

```
=== Colyn Release Script ===

Step 1: Check git status
✓ Working directory clean
  Current branch: main

Step 2: Determine new version number
  Current version: 1.2.0
New version: 1.2.0 -> 1.2.1

Step 3: Install dependencies
  Installing dependencies...
✓ Dependencies installed successfully

Step 4: Run code quality check
  Running lint...
✓ Lint check passed

Step 5: Build project
  Running build...
✓ Build successful

Step 6: Update package.json
✓ Version updated: 1.2.0 -> 1.2.1

Step 7: Create git commit
✓ Created commit: chore: release v1.2.1

Step 8: Create git tag
✓ Created tag: v1.2.1

Step 9: Push to remote repository
  Pushing...
✓ Pushed to remote repository

Step 10: Publish to package registry
  Checking toolchain publishability...
  Publishing to package registry...
✓ Published to package registry

=== Release Complete! ===

Release info:
  Version: v1.2.1
  Branch: main
  Tag: v1.2.1

Next steps:
  1. Create Release on GitHub:
     https://github.com/your-repo/releases/new?tag=v1.2.1

  2. Update installation documentation (if needed)

  3. Notify users of new release
```

### 3. Follow-up Actions

#### Create GitHub Release

1. Visit GitHub repository Releases page
2. Click "Draft a new release"
3. Select the newly created tag (e.g., v1.2.1)
4. Fill in release notes:
   - New features
   - Bug fixes
   - Breaking changes (if any)
5. Publish Release

#### Example Release Notes

```markdown
## v1.2.1

### New Features
- Add auto-completion support (Bash/Zsh)
- Add `colyn completion` command

### Bug Fixes
- Fix color output lost when running via alias

### Improvements
- Add colored display for `info --short` output
```

## Error Handling

### Working Directory Not Clean

**Error message**:
```
✗ Working directory not clean, please commit or stash all changes first
```

**Solution**:
```bash
# Commit all changes
git add .
git commit -m "chore: prepare for release"

# Or stash
git stash
```

### Lint Check Failed

**Error message**:
```
✗ Lint check failed
```

**Solution**:
```bash
# Run lint check (using your configured package manager)
npm run lint

# Auto-fix fixable issues
npm run lint:fix

# Manually fix other issues
```

### Push Failed

**Error message**:
```
✗ Push commits failed
```

**Solution**:

If push fails, the script will provide rollback commands:

```bash
# Delete tag
git tag -d v1.2.1

# Rollback commit
git reset --hard HEAD~1

# Re-run release script after fixing the issue
```

### Package Publish Failed

**Error message**:
```
✗ Failed to publish to package registry
```

**Solution**:
```bash
# 1. Check login status (npm example)
npm whoami

# 2. Check publish configuration (registry, credentials, permissions)
npm config get registry

# 3. Retry publish command manually after fixing (npm example)
npm publish
```

## Rollback Release

If issues are found after release, rollback:

### 1. Local Rollback

```bash
# Delete local tag
git tag -d v1.2.1

# Rollback commit
git reset --hard HEAD~1
```

### 2. Remote Rollback

```bash
# Delete remote tag
git push origin :refs/tags/v1.2.1

# Force push (use with caution)
git push origin main --force
```

### 3. GitHub Release Rollback

1. Visit GitHub Releases page
2. Find the corresponding Release
3. Click "Delete" to remove

## Best Practices

### 1. Pre-release Checklist

- ✅ Ensure all tests pass
- ✅ Ensure lint check passes
- ✅ Ensure documentation is updated
- ✅ Ensure CHANGELOG is updated (if applicable)

### 2. Commit Message Convention

Release script creates commit messages in this format:

```
chore: release v1.2.1

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### 3. Release Frequency

- **Patch version**: Release anytime (bug fixes)
- **Minor version**: Every 1-2 weeks (new features)
- **Major version**: Release carefully (breaking changes)

### 4. Version Selection Guide

| Change Type | Version Type | Example |
|-------------|--------------|---------|
| Bug fix | patch | 1.2.0 -> 1.2.1 |
| New command | minor | 1.2.0 -> 1.3.0 |
| New option | minor | 1.2.0 -> 1.3.0 |
| Performance improvement | patch | 1.2.0 -> 1.2.1 |
| Documentation improvement | patch | 1.2.0 -> 1.2.1 |
| Code refactoring (no API change) | patch | 1.2.0 -> 1.2.1 |
| Remove command | major | 1.2.0 -> 2.0.0 |
| Change command behavior | major | 1.2.0 -> 2.0.0 |
| Rename command | major | 1.2.0 -> 2.0.0 |

## FAQ

### Q: Can I skip certain steps?

A: Not recommended. Each step in the release script is important:
- Lint ensures code quality
- Build ensures code works
- Git check ensures no changes are lost

### Q: What if release fails?

A: The script provides detailed error messages and rollback commands. Follow the prompts.

### Q: Can I release from other branches?

A: Yes, but recommended to only release from main or release branches.

### Q: What's the tag naming convention?

A: Auto-created tags use format `v<version>`, e.g., `v1.2.1`.

## References

- [Semantic Versioning 2.0.0](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Keep a Changelog](https://keepachangelog.com/)
