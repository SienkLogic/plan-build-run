---
phase: "16-config-routing-upgrades"
plan: "16-02"
status: "complete"
subsystem: "skills"
tags:
  - "AskUserQuestion"
  - "status"
  - "resume"
  - "routing"
requires: []
provides:
  - "status SKILL.md with AskUserQuestion routing for multi-option next steps"
  - "resume SKILL.md with AskUserQuestion for pause-point selection and next-action routing"
affects:
  - "plugins/dev/skills/status/SKILL.md"
  - "plugins/dev/skills/resume/SKILL.md"
tech_stack:
  - "AskUserQuestion tool"
  - "gate-prompts.md patterns"
key_files:
  - "plugins/dev/skills/status/SKILL.md: status dashboard with AskUserQuestion routing"
  - "plugins/dev/skills/resume/SKILL.md: resume skill with structured pause-point and action selection"
key_decisions:
  - "Keep both skills read-only: status and resume display commands but do not execute them, preserving /dev:continue as the auto-execution path"
  - "Single-option bypass: when only one next action exists, use plain text arrow format instead of AskUserQuestion"
patterns:
  - "action-routing: used in status Step 5 and resume Steps 3a/3b for multi-option next actions"
  - "pause-point-select: used in resume Step 2 for multiple .continue-here.md selection"
metrics:
  duration_minutes: 2
  start_time: "2026-02-10T21:07:37Z"
  end_time: "2026-02-10T21:09:39Z"
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 0
  files_modified: 2
deferred: []
---

# Plan Summary: 16-02

## What Was Built

Converted the status and resume skills from freeform text-based routing suggestions to structured AskUserQuestion prompts. The status skill's Step 5 "Smart Routing" now uses the action-routing pattern from gate-prompts.md when multiple next actions exist, presenting dynamically generated options with a "Something else" escape hatch. The resume skill received three conversion points: pause-point selection (Step 2) now uses the pause-point-select pattern with up to 4 options and pagination for larger sets, the normal resume next-action (Step 3a) uses action-routing when the continue-here suggestion conflicts with filesystem state, and the inferred resume next-action (Step 3b) uses action-routing with state-dependent options.

Both skills remain strictly read-only -- they present commands for the user to run manually but never execute them. This preserves the existing separation of concerns where /dev:continue handles auto-execution.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 16-02-T1: Convert status SKILL.md routing suggestions to AskUserQuestion | done | 2028ba5 | 1 | passed |
| 16-02-T2: Convert resume SKILL.md pause-point and next-action to AskUserQuestion | done | 8695533 | 1 | passed |

## Key Implementation Details

- Status SKILL.md: AskUserQuestion added to allowed-tools; Step 5 now branches on single vs. multiple next actions; anti-pattern #8 added explicitly prohibiting execution
- Resume SKILL.md: AskUserQuestion added to allowed-tools; three conversion points (pause-point-select in Step 2, action-routing in Step 3a, action-routing in Step 3b); pagination support for >4 pause points via "Show earlier" option
- Both skills reference gate-prompts.md patterns by name (action-routing, pause-point-select) for consistency with the Phase 15 pattern library

## Known Issues

None.

## Dependencies Provided

- Status skill with structured AskUserQuestion routing (available for any skill that reads status output)
- Resume skill with structured pause-point selection and next-action routing
