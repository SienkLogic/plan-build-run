---
title: "Improve session-cleanup.js with stale checkpoint removal and log rotation"
status: pending
priority: P3
source: dev-guide-review
created: 2026-02-10
theme: hook-hardening
---

## Goal

session-cleanup.js only removes 3 signal files. Should also handle stale checkpoints and log rotation.

## Changes

1. **`plugins/dev/scripts/session-cleanup.js`** — Add:
   - Remove `.checkpoint-manifest.json` if older than 24 hours
   - Rotate `.planning/logs/hooks.jsonl` if >200KB (move to hooks.jsonl.1)
   - Warn about orphaned `.PROGRESS-*` files (executor crash artifacts)

## Acceptance Criteria

- [ ] Stale checkpoints cleaned up
- [ ] Log rotation works
- [ ] Tests updated
