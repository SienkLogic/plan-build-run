---
title: "Replace plain-text prompts with AskUserQuestion tool across skills"
status: pending
priority: P1
source: user-request
created: 2026-02-10
theme: ux-improvement
---

## Goal

Replace plain-text gate checks and interactive prompts across skills with Claude Code's AskUserQuestion tool. Currently skills output text like "Type approved" and wait for freeform input. AskUserQuestion provides structured UI with labeled options, multi-select, and descriptions — much better UX.

## Scope

Audit all 20 skills for opportunities:
- Gate checks (confirm_project, confirm_roadmap, confirm_plan, confirm_execute, confirm_transition)
- Config selection (model profiles, feature toggles)
- Routing decisions (what to do next)
- Error recovery choices (retry, skip, abort)
- Phase/plan selection

## Acceptance Criteria

- [ ] All gate checks use AskUserQuestion with approve/revise/abort options
- [ ] Routing decisions (e.g., status → next action) use AskUserQuestion
- [ ] Config skill uses AskUserQuestion for settings selection
- [ ] All existing tests still pass
