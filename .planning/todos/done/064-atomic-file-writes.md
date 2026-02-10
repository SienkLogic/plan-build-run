---
title: "Add atomic file writes for critical state files"
status: done
priority: P3
source: ecc-review
created: 2026-02-10
completed: 2026-02-10
theme: reliability
---

## Goal

Use write-to-temp + rename + backup/restore pattern for crash safety when writing critical state files.

## What Was Done

1. Added `atomicWrite(filePath, content)` to `towline-tools.js`:
   - Writes to `{file}.tmp` first
   - Backs up original to `{file}.bak` (if original exists)
   - Renames `.tmp` over original (atomic on most filesystems)
   - On failure: restores from `.bak` and cleans up `.tmp`
2. Applied to two critical write locations:
   - `context-budget-check.js`: STATE.md write during PreCompact
   - `lockedFileUpdate()` in `towline-tools.js`: planning file writes
3. Added 7 tests covering success, backup creation, failure recovery, and multiple writes
4. All 448 tests pass (30 suites)

## Design Decisions

- `atomicWrite` returns `{success, error}` rather than throwing — callers handle errors
- Backup failure is non-fatal (the write still proceeds)
- Only applied to STATE.md and lockedFileUpdate — JSONL logs and ephemeral counters don't need atomicity
- `fs.renameSync` is atomic on most POSIX filesystems; on Windows NTFS it's effectively atomic for same-volume renames

## Acceptance Criteria

- [x] `atomicWrite` function exists in towline-tools.js
- [x] Critical file writes use atomic pattern
- [x] Backup/restore works on write failure
- [x] Tests cover success, failure, and recovery paths
- [x] Works on Windows (rename semantics verified)
