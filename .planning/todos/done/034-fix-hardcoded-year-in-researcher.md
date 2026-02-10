---
title: "Fix hardcoded year '2026' in researcher agent"
status: pending
priority: P3
source: dev-guide-review
created: 2026-02-10
theme: agent-improvement
---

## Goal

`towline-researcher.md` line 398 references "2026" explicitly. This will become stale.

## Changes

1. **`plugins/dev/agents/towline-researcher.md`** — Replace "2026" with "the current year"

## Acceptance Criteria

- [ ] No hardcoded year in researcher agent
