# Changelog

## [Unreleased]

## [2.0.2]

- Use Node.js 24 in CI
- Update Prettier config to remove semicolons

## [2.0.1]

Fix the release workflow.

## [2.0.0]

🎉 **Plugin Revival** - New maintainer and major improvements to sync reliability and workflow.

### ✨ New Features

- **Import from HackMD** - New "Create Note from Obsidian from HackMD URL" command
- **Improved Title Sync** - Better title handling when creating notes in Obsidian and syncing to HackMD

### 🔧 Improvements

- **Simplified Frontmatter** - Flattened metadata structure for easier sync operations
- **Smarter Conflict Detection** - Added time margin to reduce false sync conflicts
- **Better Metadata Preservation** - Force Pull now maintains your metadata correctly
- **Clearer Error Messages** - More helpful feedback when sync issues occur

### ⚠️ Breaking Changes

**Frontmatter Structure**
The metadata structure has been simplified and moved to the top level:

**Before:**
```yaml
---
hackmd:
  url: https://hackmd.io/xxx
  title: Some Title
  lastSync: 2025-02-20T09:29:18.181Z
---
```

**After:**
```yaml
---
url: https://hackmd.io/xxx
title: Some Title
lastSync: 2025-02-20T09:29:18.181Z
---
```

Existing notes will be automatically migrated when you next sync them.

### 🙏 Credits

Special thanks to @bagnier for the comprehensive refactor and bug fixes.


## [1.0.3]

- Current release