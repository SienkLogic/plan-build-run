---
title: "Add auto_advance for seamless phase cycling in autonomous mode"
status: pending
priority: P1
source: dev-guide-review
created: 2026-02-10
theme: workflow-automation
---

## Goal

When `mode: autonomous`, the build→review→plan-next cycle requires 2-3 manual command invocations per phase. Add `auto_advance` feature flag that chains these automatically.

## Logic

```
/dev:build completes successfully
  └─ if auto_advance && mode == autonomous && goal_verification == true:
       └─ Auto-invoke /dev:review <N>
            └─ if verification passes:
                 └─ Auto-invoke /dev:plan <N+1>
```

Hard stops remain at: checkpoints, verification gaps, errors, milestone boundaries.

## Changes

1. **`plugins/dev/skills/build/SKILL.md`** — Add auto-advance logic after Step 8
2. **`plugins/dev/skills/plan/SKILL.md`** — Write `.auto-next` when `mode: autonomous && confirm_plan: false`
3. **`plugins/dev/skills/continue/SKILL.md`** — Respect `mode: autonomous` (invoke, don't just suggest)
4. **Config** — Add `features.auto_advance` toggle (default: false)

## Acceptance Criteria

- [ ] `auto_advance: true` + `mode: autonomous` chains build → review → plan automatically
- [ ] Hard stops at checkpoints/failures still require user intervention
- [ ] `auto_advance: false` preserves current behavior
