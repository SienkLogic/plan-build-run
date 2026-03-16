---
description: "Reapply local modifications after a PBR update"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
---

<objective>
After a PBR update wipes and reinstalls files, merge user's previously saved local modifications back into the new version. Uses intelligent comparison to handle cases where the upstream file also changed.
</objective>

<process>
## 1. Detect Backed-up Patches

```bash
PATCHES_DIR="${HOME}/.claude/pbr-local-patches"
if [ ! -d "$PATCHES_DIR" ]; then
  PATCHES_DIR="./.claude/pbr-local-patches"
fi
```

Read `backup-meta.json` from the patches directory.
If no patches found: "No local patches found. Nothing to reapply." Exit.

## 2. Show Patch Summary

List all backed-up files with status.

## 3. Merge Each File

For each file in backup-meta.json:
1. Read backed-up version (user's modified copy)
2. Read newly installed version (current file after update)
3. Compare and merge:
   - Identical: skip (modification incorporated upstream)
   - Different: identify user modifications, apply to new version
   - Conflict: show both versions, ask user which to keep

## 4. Report

Display merge results table with status per file.
</process>
