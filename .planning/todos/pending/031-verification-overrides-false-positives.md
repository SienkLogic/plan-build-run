---
title: "Add verification overrides for false positive must-haves"
status: pending
priority: P3
source: dev-guide-review
created: 2026-02-10
theme: workflow-automation
---

## Goal

Verifier's wiring check (Level 3) flags standalone utilities not yet imported. No way to mark a gap as "false positive." This causes endless gap-closure cycles.

## Changes

1. **VERIFICATION.md format** — Add `overrides:` section in frontmatter
2. **`plugins/dev/agents/towline-verifier.md`** — Check overrides list, skip verification for overridden must-haves, count as "passed (override)"
3. **`plugins/dev/skills/review/SKILL.md`** — Allow user to add overrides inline

## Acceptance Criteria

- [ ] User can mark must-haves as "accepted" with reason
- [ ] Subsequent reviews skip overridden must-haves
- [ ] Overrides visible in verification report
