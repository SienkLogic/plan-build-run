---
title: "Add file locking for STATE.md and ROADMAP.md concurrent writes"
status: pending
priority: P2
source: dev-guide-review
created: 2026-02-10
theme: state-reliability
---

## Goal

No file locking exists for STATE.md or ROADMAP.md. Concurrent writes (e.g., `/dev:todo add` while `/dev:build` runs) cause last-write-wins data loss.

## Changes

1. **`plugins/dev/scripts/towline-tools.js`** — Add `stateUpdate(updateFn)` with exclusive file locking via `fs.promises.open()`
2. All STATE.md writers use the new locking function
3. Same pattern for ROADMAP.md writes

## Acceptance Criteria

- [ ] Concurrent writes to STATE.md are serialized
- [ ] Lock acquired/released cleanly (no stale locks)
- [ ] Cross-platform (Windows, macOS, Linux)
- [ ] Tests verify locking behavior
