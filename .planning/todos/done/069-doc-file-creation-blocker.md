---
title: "Add hook to block unnecessary documentation file creation"
status: done
priority: P3
source: ecc-review
created: 2026-02-10
completed: 2026-02-10
theme: hooks
---

## Goal

Add a PreToolUse check that blocks creation of random .md/.txt files (except known documentation files), preventing doc sprawl during builds.

## What Was Done

1. Created `check-doc-sprawl.js` with `checkDocSprawl(data, cwd)` export:
   - Blocks new .md/.txt files outside a known allowlist
   - Allowlist: README.md, CLAUDE.md, CONTRIBUTING.md, CHANGELOG.md, LICENSE.md, LICENSE, LICENSE.txt
   - Always allows: .planning/, .claude/, node_modules/, .git/ directories
   - Only blocks NEW file creation — edits to existing docs always pass
   - Opt-in via `hooks.blockDocSprawl` in config.json (disabled by default)
2. Integrated into `pre-write-dispatch.js` as third check (no new hook entry needed)
3. Added 20 tests covering unit functions, allowlist, and dispatcher integration
4. All 419 tests pass (29 suites)

## Design Decisions

- Integrated into pre-write-dispatch.js rather than a separate hooks.json entry (no extra process spawn)
- Uses `fs.existsSync()` to distinguish new files from edits (existing files always pass)
- Basename comparison is case-insensitive for Windows compatibility
- Path normalization uses forward slashes for consistent directory segment matching

## Acceptance Criteria

- [x] Hook blocks random .md creation outside allowlist
- [x] Allowlist includes all legitimate doc files
- [x] .planning/ directory is always allowed
- [x] Config toggle controls behavior
