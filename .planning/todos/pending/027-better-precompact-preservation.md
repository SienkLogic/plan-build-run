---
title: "Improve PreCompact hook to preserve conversation context"
status: pending
priority: P2
source: dev-guide-review
created: 2026-02-10
theme: session-continuity
---

## Goal

After compaction, orchestrator knows "Phase 3, Plan 2" but not "we were debugging JWT signature verification". Preserve more context.

## Changes

1. **`plugins/dev/scripts/context-budget-check.js`** — Add to recovery context:
   - Recent errors from events.jsonl (last 3)
   - Recent agent spawns from hooks.jsonl (last 5)
   - Active checkpoint breadcrumbs
   - Read `.active-plan` instead of guessing from directory listing
2. Expand recovery context from ~500 to ~1000 chars

## Acceptance Criteria

- [ ] Recovery context includes recent errors and agent history
- [ ] Active plan correctly identified from signal file
- [ ] Post-compaction orchestrator has enough context to continue without user re-explanation
