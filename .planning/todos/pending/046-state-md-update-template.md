---
title: "Create STATE.md update shared pattern"
status: pending
priority: P2
source: dev-guide-review
created: 2026-02-10
theme: state-reliability
---

## Goal

STATE.md has a creation template but no update template. 5 skills (status, build, pause, review, milestone) all update STATE.md with inline formatting, each reimplementing 150-line size limit logic.

## Changes

1. **`plugins/dev/skills/shared/state-update.md`** — Create shared fragment covering:
   - Standard section format (Current Position, Accumulated Context, Milestone, Session Continuity)
   - Size limit enforcement rules (150 lines max)
   - Collapse completed phases rule
   - Session entry trimming rules
   - Progress bar format (20 chars: █ done, ░ remaining)

2. **Skills** — Reference the shared pattern instead of inline formatting

## Note: Complements todo 017 (YAML frontmatter for STATE.md) — this todo addresses the update pattern while 017 addresses the data format.

## Acceptance Criteria

- [ ] Shared update pattern covers all STATE.md sections
- [ ] Size limit enforcement documented once, not 5 times
- [ ] At least 3 skills reference the shared pattern
