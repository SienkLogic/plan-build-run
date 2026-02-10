---
phase: "15-gate-check-upgrades"
plan: "15-01"
status: "complete"
subsystem: "skills"
tags:
  - "AskUserQuestion"
  - "gate-checks"
  - "UI-upgrade"
requires: []
provides:
  - "gate-prompts.md shared reference with 8 reusable AskUserQuestion patterns"
  - "plan SKILL.md with 3 structured gate checks"
  - "build SKILL.md with 5 structured gate checks"
  - "import SKILL.md with 1 structured gate check"
  - "scan SKILL.md with 1 structured gate check"
affects:
  - "plan skill"
  - "build skill"
  - "import skill"
  - "scan skill"
tech_stack:
  - "AskUserQuestion (Claude Code built-in tool)"
key_files:
  - "plugins/dev/skills/shared/gate-prompts.md: 8 reusable AskUserQuestion patterns"
  - "plugins/dev/skills/plan/SKILL.md: 3 gate checks converted"
  - "plugins/dev/skills/build/SKILL.md: 5 gate checks converted"
  - "plugins/dev/skills/import/SKILL.md: 1 gate check converted"
  - "plugins/dev/skills/scan/SKILL.md: 1 gate check converted"
key_decisions:
  - "8 named patterns: approve-revise-abort, yes-no, stale-continue, yes-no-pick, multi-option-failure, multi-option-escalation, multi-option-gaps, multi-option-priority"
  - "All headers kept to max 12 characters per AskUserQuestion constraint"
  - "All gates use multiSelect: false"
  - "Other/freeform responses handled as fallback in every gate"
patterns:
  - "AskUserQuestion gate pattern: skills reference gate-prompts.md by pattern name"
  - "Consistent Other handling: all gates specify behavior for freeform user input"
metrics:
  duration_minutes: 4
  tasks_completed: 3
  tasks_total: 3
  commits: 3
  files_created: 1
  files_modified: 4
deferred: []
---

# Plan Summary: 15-01

## What Was Built

Created a shared reference document (`gate-prompts.md`) containing 8 reusable AskUserQuestion patterns for structured gate checks, then converted 10 gate check points across 4 skills from freeform text prompts to structured AskUserQuestion prompts.

The gate-prompts.md file defines named patterns (approve-revise-abort, yes-no, stale-continue, yes-no-pick, multi-option-failure, multi-option-escalation, multi-option-gaps, multi-option-priority) that skills reference by name for consistency. Each pattern specifies the question, header (max 12 chars), options with descriptions, and multiSelect: false.

The 4 converted skills are: plan (3 gates: re-planning confirmation, seed selection, plan approval), build (5 gates: execute confirmation, staleness warning, rebuild confirmation, failure handling, branch merge), import (1 gate: checker loop resolution), and scan (1 gate: commit decision). The assumption surfacing section in plan SKILL.md was intentionally left as inline conversation per the plan's explicit instruction.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 15-01-T1: Create shared gate-prompts.md reference and convert plan SKILL.md gates | done | c717de1 | 2 | passed |
| 15-01-T2: Convert build SKILL.md gate checks to AskUserQuestion | done | 026db17 | 1 | passed |
| 15-01-T3: Convert import and scan SKILL.md gate checks to AskUserQuestion | done | abad1e2 | 2 | passed |

## Key Implementation Details

- **gate-prompts.md** lives at `plugins/dev/skills/shared/gate-prompts.md` alongside other shared fragments (phase-argument-parsing.md, state-update.md, etc.)
- **AskUserQuestion added to allowed-tools** in plan, build, and scan SKILL.md frontmatter. Import already had it.
- **Failure handler labels updated** in build SKILL.md: "If retry:" changed to "If user selects 'Retry':" etc. for all 4 options.
- **Merge handler** uses custom labels "Yes, merge" / "No, keep" instead of plain Yes/No for clarity.
- All 344 existing tests pass after changes (hook tests don't test SKILL.md content directly).

## Known Issues

None.

## Dependencies Provided

- `plugins/dev/skills/shared/gate-prompts.md` with 8 named patterns available for plan 15-02 (review and milestone skill conversions)
- Consistent AskUserQuestion gate pattern established for remaining skills to follow
