# Release Script Usage Guide

## Features

Automated version release process, including:

1. Verify git workspace status (must be clean)
2. Run code quality checks (lint)
3. Compile project
4. Update package.json version number
5. Create git commit
6. Create git tag
7. Push to remote repository

## Usage

### Quick Commands (Recommended)

```bash
# Release patch version (1.2.0 -> 1.2.1)
volta run yarn release:patch

# Release minor version (1.2.0 -> 1.3.0)
volta run yarn release:minor

# Release major version (1.2.0 -> 2.0.0)
volta run yarn release:major
```

### Run Script Directly

```bash
# Release patch version
node scripts/release.js patch

# Release minor version
node scripts/release.js minor

# Release major version
node scripts/release.js major

# Specify version number
node scripts/release.js 1.2.3
```

## Version Number Rules

Following [Semantic Versioning](https://semver.org/):

- **Major version**: Incompatible API changes
- **Minor version**: Backward-compatible new features
- **Patch version**: Backward-compatible bug fixes

### Examples

| Current Version | Type | New Version | Use Case |
|-----------------|------|-------------|----------|
| 1.2.0 | patch | 1.2.1 | Bug fixes, performance optimization |
| 1.2.0 | minor | 1.3.0 | New features, new commands |
| 1.2.0 | major | 2.0.0 | Breaking changes, refactoring |

## Release Process

### 1. Preparation

Ensure:
- All code is committed
- Workspace is clean (no uncommitted changes)
- On correct branch (usually main)

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
volta run yarn release:patch
```

Script will automatically execute the following steps:

```
=== Colyn Release Script ===

Step 1: Check git status
✓ Workspace clean
  Current branch: main

Step 2: Determine new version number
  Current version: 1.2.0
New version: 1.2.0 -> 1.2.1

Step 3: Run tests and code checks
  Running lint...
✓ Lint check passed

Step 4: Compile project
  Running build...
✓ Build successful

Step 5: Update package.json
✓ Version updated: 1.2.0 -> 1.2.1

Step 6: Create git commit
✓ Created commit: chore: release v1.2.1

Step 7: Create git tag
✓ Created tag: v1.2.1

Step 8: Push to remote repository
  Pushing commits...
✓ Commits pushed
  Pushing tags...
✓ Tags pushed

=== Release Complete! ===

Release info:
  Version: v1.2.1
  Branch: main
  Tag: v1.2.1

Next steps:
  1. Create Release on GitHub:
     https://github.com/your-repo/releases/new?tag=v1.2.1

  2. Update installation documentation (if needed)

  3. Notify users of new version release
```

### 3. Follow-up Actions

#### Create GitHub Release

1. Visit GitHub repository's Releases page
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
- Added auto-completion feature (supports Bash/Zsh)
- New `colyn completion` command

### Bug Fixes
- Fixed color loss issue when running via alias

### Improvements
- Added colored display for `info --short` output
```

## Error Handling

### Workspace Not Clean

**Error message**:
```
✗ Workspace not clean, please commit or stash all changes first
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
# Run lint check
volta run yarn lint

# Auto-fix fixable issues
volta run yarn lint:fix

# Manually fix other issues
```

### Push Failed

**Error message**:
```
✗ Push commits failed
```

**Solution**:

If push fails, script will provide rollback commands:

```bash
# Delete tag
git tag -d v1.2.1

# Rollback commit
git reset --hard HEAD~1

# Re-run release script after resolving issue
```

## Rollback Release

If issues found after release, need to rollback:

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
3. Click "Delete" to delete

## Best Practices

### 1. Pre-release Checklist

- Ensure all tests pass
- Ensure lint check passes
- Ensure documentation is updated
- Ensure CHANGELOG is updated (if applicable)

### 2. Commit Message Convention

Release script creates commit messages in the following format:

```
chore: release v1.2.1

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### 3. Release Frequency

- **Patch version**: Release anytime (bug fixes)
- **Minor version**: Every 1-2 weeks (new features)
- **Major version**: Release carefully (breaking changes)

### 4. Version Number Selection Guide

| Change Type | Version Type | Example |
|-------------|--------------|---------|
| Bug fix | patch | 1.2.0 -> 1.2.1 |
| New command | minor | 1.2.0 -> 1.3.0 |
| New option | minor | 1.2.0 -> 1.3.0 |
| Performance optimization | patch | 1.2.0 -> 1.2.1 |
| Documentation improvement | patch | 1.2.0 -> 1.2.1 |
| Code refactoring (no interface change) | patch | 1.2.0 -> 1.2.1 |
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

A: Script provides detailed error messages and rollback commands. Follow the prompts.

### Q: Can I release on other branches?

A: Yes, but recommended to only release on main or release branches.

### Q: What is the tag naming convention?

A: Auto-created tags follow format `v<version>`, e.g., `v1.2.1`.

## References

- [Semantic Versioning 2.0.0](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Keep a Changelog](https://keepachangelog.com/)
