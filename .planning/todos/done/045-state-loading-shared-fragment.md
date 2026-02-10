---
title: "Create state-loading shared fragment for skills"
status: pending
priority: P2
source: dev-guide-review
created: 2026-02-10
theme: context-discipline
---

## Goal

17 skills read STATE.md, 15 read ROADMAP.md, many read config.json. Each has slight variations of a 3-step bootstrap pattern. Standardize into a shared fragment.

## Changes

1. **`plugins/dev/skills/shared/state-loading.md`** — Create fragment covering:
   - Minimal state read (for simple skills: STATUS.md lines 1-20 only)
   - Full state read (for workflow skills: all STATE.md sections + config + ROADMAP)
   - Reading order: always STATE.md → config.json → ROADMAP.md
   - Error handling: what to do when files are missing
   - What fields to extract per use case

2. **Skills** — Add `{{include shared/state-loading.md}}` or reference it in state-loading steps

## Estimated savings: ~15 lines per skill × 17 skills = ~255 lines

## Acceptance Criteria

- [ ] Shared fragment covers minimal and full state read patterns
- [ ] At least 5 skills reference it
- [ ] No behavioral changes
