---
title: "/dev:quick skill does not follow its own 11-step workflow"
status: pending
priority: P2
source: dashboard-e2e-testing
created: 2026-02-10
---

## Problem

The `/dev:quick` skill defines an 11-step orchestration flow in `plugins/dev/skills/quick/SKILL.md`:

1. Check context (read STATE.md)
2. Get task description from user args
3. Validate scope (reject multi-phase work)
4. Generate slug and sequence number
5. Create `.planning/quick/NNN-slug/` directory
6. Write PLAN.md with task breakdown
7. Spawn `dev:towline-executor` to implement
8. Read executor's SUMMARY.md results
9. Update STATE.md with quick-task record
10. Commit planning docs
11. Report results to user

During the responsive-design task ("update the Towline dashboard so it uses responsive pages and better fonts"), the orchestrator loaded the skill but then skipped the entire flow — jumping straight to implementation with no `.planning/quick/` directory, no PLAN.md, no SUMMARY.md, no STATE.md update, and no commit of planning artifacts.

This means `/dev:quick` provides zero traceability advantage over just asking Claude to do the work directly.

## Root Cause Hypothesis

The skill instructions may not be forceful enough to override the orchestrator's tendency to "just do the work" when the task seems straightforward. The skill text reads more like a description of what *should* happen rather than a strict instruction sequence that the orchestrator *must* follow.

Possible contributing factors:
- The skill lacks explicit "STOP — do not write any code until steps 1-6 are complete" guardrails
- No hook or validator enforces that the `.planning/quick/` directory was created before code changes begin
- The skill may need to front-load the directory creation and PLAN.md write as mandatory gates

## Proposed Fixes

1. **Add explicit gate language** to SKILL.md: "You MUST complete steps 1-6 before writing ANY code"
2. **Consider a pre-execution hook** that checks whether `.planning/quick/` was created when `/dev:quick` is the active skill
3. **Add a self-check step** at the end: "Verify that `.planning/quick/NNN-slug/PLAN.md` and `SUMMARY.md` exist"
4. **Test the skill** end-to-end with a trivial task to confirm the full flow executes

## Acceptance Criteria

- [ ] `/dev:quick` reliably creates `.planning/quick/NNN-slug/` directory
- [ ] PLAN.md is written before any code changes
- [ ] SUMMARY.md is written after executor completes
- [ ] STATE.md is updated with quick-task record
- [ ] At least one successful end-to-end test of the full 11-step flow
