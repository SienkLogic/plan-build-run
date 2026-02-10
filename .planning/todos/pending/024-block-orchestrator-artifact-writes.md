---
title: "Block orchestrator from writing agent artifacts (SUMMARY, PLAN, VERIFICATION)"
status: pending
priority: P2
source: dev-guide-review
created: 2026-02-10
theme: context-discipline
---

## Goal

Nothing prevents the orchestrator from writing SUMMARY.md, PLAN.md, or VERIFICATION.md directly, bypassing delegation discipline.

## Changes

1. **`plugins/dev/scripts/check-skill-workflow.js`** — Add rules:
   - Writing SUMMARY-*.md outside a Task() → block
   - Writing PLAN-*.md outside a Task() → block (except orchestrator-written initial plans)
   - Writing VERIFICATION.md outside a Task() → block
2. **`plugins/dev/scripts/log-subagent.js`** — Write `.planning/.active-agent` on SubagentStart, remove on SubagentStop
3. **Tests** — New test cases in check-skill-workflow.test.js

## Detection Method

Check for `.planning/.active-agent` signal file to determine if we're inside a Task() context.

## Acceptance Criteria

- [ ] Orchestrator blocked from writing agent artifacts
- [ ] Agents can still write their expected outputs
- [ ] Tests verify both blocked and allowed scenarios
