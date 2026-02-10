---
title: "Add tests for 3 untested hook scripts"
status: pending
priority: P1
source: dev-guide-review
created: 2026-02-10
theme: testing
---

## Goal

Three hook scripts have ZERO test coverage: `auto-continue.js`, `progress-tracker.js`, and `session-cleanup.js`. These are critical paths — auto-continue prevents infinite loops, progress-tracker runs on every SessionStart, and session-cleanup fires on every SessionEnd.

## Changes

1. **`tests/auto-continue.test.js`** — Test:
   - Reads and deletes `.auto-next` signal file (one-shot deletion)
   - Handles Windows file locking with retry logic
   - Exits silently when `auto_continue` disabled in config
   - Prevents infinite loops via signal file deletion

2. **`tests/progress-tracker.test.js`** — Test:
   - Injects project state context on SessionStart
   - Detects ROADMAP/STATE mismatches
   - Warns about stale `.auto-next` signals
   - Handles git command failures gracefully
   - Handles missing STATE.md/ROADMAP.md files

3. **`tests/session-cleanup.test.js`** — Test:
   - Removes `.auto-next`, `.active-operation`, `.active-skill` on SessionEnd
   - Logs cleanup decisions via logHook()
   - Silent failure when files don't exist

## Acceptance Criteria

- [ ] auto-continue.js has ≥80% coverage
- [ ] progress-tracker.js has ≥70% coverage
- [ ] session-cleanup.js has ≥80% coverage
- [ ] All tests pass on Windows, macOS, and Linux
- [ ] 221+ tests total (currently 221)
