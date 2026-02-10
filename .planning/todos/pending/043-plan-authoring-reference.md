---
title: "Create plan authoring guide reference"
status: pending
priority: P1
source: dev-guide-review
created: 2026-02-10
theme: context-discipline
---

## Goal

The planner agent contains ~150 lines of authoring guidance (how to write good action steps, derive verify commands, write falsifiable done conditions, size tasks). This should be a reference doc that the planner loads, shrinking the agent definition.

## Changes

1. **`plugins/dev/references/plan-authoring.md`** — Create guide covering:
   - Action step specificity levels (tool calls, code snippets, structured, directional)
   - Deriving verify commands from must-have truths
   - Writing falsifiable done conditions (good vs bad examples)
   - Task sizing guidance (when to split, when to merge)
   - When to use checkpoints vs auto tasks
   - Discovery level selection criteria

2. **`plugins/dev/agents/towline-planner.md`** — Replace inline authoring guidance with:
   ```markdown
   Read `references/plan-authoring.md` for plan quality guidelines.
   ```

## Estimated savings: ~150 lines from planner agent (26%)

## Acceptance Criteria

- [ ] Plan authoring reference is comprehensive and standalone
- [ ] Planner agent references it instead of inlining guidance
- [ ] Planner still produces quality plans
- [ ] `npm run validate` passes
