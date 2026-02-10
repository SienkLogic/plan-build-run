---
title: "Make review auto-fix the default flow when gaps are found"
status: pending
priority: P2
source: dev-guide-review
created: 2026-02-10
theme: workflow-automation
---

## Goal

When `/dev:review` finds gaps, user must know about `--auto-fix` flag. Instead, offer inline: "I can diagnose and create gap-closure plans now. Proceed?" Default yes.

## Changes

1. **`plugins/dev/skills/review/SKILL.md`** — Step 6 "Gaps Found": make auto-fix the primary path with inline offer, not a hidden flag

## Acceptance Criteria

- [ ] When gaps found, user is offered inline auto-fix (default yes)
- [ ] `--auto-fix` flag still works for explicit invocation
- [ ] User can decline and get current suggest-only behavior
