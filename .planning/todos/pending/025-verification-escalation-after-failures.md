---
title: "Add verification attempt counter and escalation after 3 failures"
status: pending
priority: P2
source: dev-guide-review
created: 2026-02-10
theme: workflow-automation
---

## Goal

No handling for "verification failed N times" — users get stuck in verify-fix-verify loops.

## Changes

1. **`plugins/dev/skills/review/SKILL.md`** — Track `verification_attempts` in VERIFICATION.md frontmatter. After 3 failures, offer: accept-with-gaps, re-plan, spawn debugger, or abandon.
2. **`plugins/dev/agents/towline-verifier.md`** — Read prior VERIFICATION.md attempt count, increment on write.

## Acceptance Criteria

- [ ] VERIFICATION.md tracks attempt count
- [ ] After 3 failed attempts, user gets escalation options
- [ ] Accept-with-gaps marks phase as "complete-with-gaps"
