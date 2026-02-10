---
phase: "15-gate-check-upgrades"
plan: "15-02"
title: "Complex multi-option handlers in review and milestone"
status: complete
requires: []
provides:
  - "review SKILL.md AskUserQuestion gate checks (escalation, transition, gap-closure, gaps-found)"
  - "milestone SKILL.md AskUserQuestion gate checks (unverified phases, timestamp freshness, gap priority)"
key_files:
  - "plugins/dev/skills/review/SKILL.md"
  - "plugins/dev/skills/milestone/SKILL.md"
key_decisions:
  - "Escalation 5-option menu split into 4-option primary + 2-option follow-up to stay within AskUserQuestion 4-option limit"
  - "Completion section suggestion arrows (-> /dev:plan etc.) left as-is since they are display-only, not interactive menus"
  - "Existing AskUserQuestion usages in milestone (new, version collision) left unchanged per plan"
patterns:
  - "Multi-option AskUserQuestion with handler branching per selection"
  - "Follow-up AskUserQuestion for overflow options (accept-all vs pick-specific)"
  - "Pattern references to skills/shared/gate-prompts.md for consistency"
commits:
  - hash: "ae95f84"
    message: "feat(15-02): convert review SKILL.md gate checks to AskUserQuestion"
    files:
      - "plugins/dev/skills/review/SKILL.md"
  - hash: "c751d93"
    message: "feat(15-02): convert milestone SKILL.md gate checks to AskUserQuestion"
    files:
      - "plugins/dev/skills/milestone/SKILL.md"
metrics:
  duration_minutes: 3
  start_time: "2026-02-10T12:42:48Z"
  end_time: "2026-02-10T12:45:33Z"
  tests_passed: 344
  test_suites: 24
deferred: []
self_check_failures: []
---

# What Was Built

Converted 7 gate check points in the review and milestone skills from freeform text arrow-menus to structured AskUserQuestion prompts. Each conversion references a named pattern from `skills/shared/gate-prompts.md` for cross-skill consistency.

## Task Results

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 15-02-T1 | Convert review SKILL.md gate checks to AskUserQuestion | ae95f84 | complete |
| 15-02-T2 | Convert milestone SKILL.md gate checks to AskUserQuestion | c751d93 | complete |

## Key Implementation Details

### Review SKILL.md (4 gate checks converted)

1. **Escalation after 3 failed attempts** -- Original 5-option arrow menu (`accept-with-gaps`, `re-plan`, `debug`, `override`, `retry`) converted to 4-option AskUserQuestion (Accept gaps, Re-plan, Debug, Retry) with a follow-up 2-option AskUserQuestion for the override sub-flow (Accept all vs Pick specific). This handles the AskUserQuestion 4-option limit gracefully.

2. **Transition confirmation** -- Simple yes/no AskUserQuestion replacing inline "Ask: Ready to move to Phase {N+1}?"

3. **Gap-closure plan approval** -- 3-option AskUserQuestion (Approve, Review first, Fix manually) replacing arrow menu.

4. **Gaps-found handling** -- 4-option AskUserQuestion (Auto-fix, Override, Manual, Skip) replacing arrow menu. Handler text updated from "If user says/chooses" to "If user selects".

**Preserved as-is:** UAT item verification loop (inline conversation per research recommendation) and override gap selection loop (per-gap iteration after Override selection).

### Milestone SKILL.md (3 gate checks converted)

1. **Unverified phases warning** -- 2-option AskUserQuestion (Continue anyway, Stop and review) replacing freeform "Continue anyway? (not recommended)" text.

2. **Timestamp freshness check** -- 2-option AskUserQuestion (Re-verify, Continue anyway) replacing generic "Use AskUserQuestion" instruction with fully structured prompt.

3. **Gap priority selection** -- 4-option AskUserQuestion (Must-fix only, Must + should, Everything, Let me pick) with handler branching, replacing numbered list menu.

**Preserved as-is:** Existing AskUserQuestion usages for new milestone details (line 73), mini roadmap (line 84/86), and version collision (line 489).

## Known Issues

None.

## Dependencies Provided

- Review and milestone skills now use structured AskUserQuestion prompts that reference pattern names from `skills/shared/gate-prompts.md` (created by plan 15-01)
