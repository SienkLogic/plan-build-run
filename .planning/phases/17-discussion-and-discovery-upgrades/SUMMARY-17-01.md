---
phase: "17-discussion-and-discovery-upgrades"
plan: "17-01"
status: "complete"
subsystem: "skills"
tags:
  - "AskUserQuestion"
  - "gate-prompts"
  - "begin-skill"
requires: []
provides:
  - "7 new gate prompt patterns (depth-select, git-strategy-select, context-handling, gray-area-option, output-routing, debug-session-select, debug-checkpoint)"
  - "begin SKILL.md fully converted to AskUserQuestion for all decision points"
affects:
  - "plugins/dev/skills/shared/gate-prompts.md"
  - "plugins/dev/skills/begin/SKILL.md"
tech_stack:
  - "Markdown skill definitions"
  - "AskUserQuestion structured prompts"
key_files:
  - "plugins/dev/skills/shared/gate-prompts.md: 21 total patterns (14 existing + 7 new)"
  - "plugins/dev/skills/begin/SKILL.md: all decision points converted to AskUserQuestion"
key_decisions:
  - "Reused toggle-confirm for mode and parallelization instead of creating new patterns: reduces pattern count"
  - "Reused yes-no for brownfield, overwrite, research, and commit confirmations: consistent 2-option format"
  - "Reused approve-revise-abort for roadmap approval: matches existing plan approval pattern"
patterns:
  - "AskUserQuestion pattern references: skills reference patterns by name from gate-prompts.md"
  - "Sequential AskUserQuestion calls with conversational bridging for multi-preference flows"
metrics:
  duration_minutes: 3
  start_time: "2026-02-10T20:13:26-05:00"
  end_time: "2026-02-10T20:15:58-05:00"
  tasks_completed: 3
  tasks_total: 3
  commits: 3
  files_created: 0
  files_modified: 2
deferred: []
---

# Plan Summary: 17-01

## What Was Built

Added 7 new AskUserQuestion patterns to gate-prompts.md for use by the begin, discuss, explore, and debug skills. The new patterns cover depth selection, git strategy selection, context handling, gray area options, output routing, debug session selection, and debug checkpoints.

Converted all decision points in the begin SKILL.md to use structured AskUserQuestion calls with pattern references. This includes Step 1 brownfield detection and overwrite confirmation, Step 3 workflow preferences (mode, depth, parallelization, git branching, commit docs), Step 4 research decision, Step 8 roadmap approval, and Step 10b commit confirmation. Added AskUserQuestion to the skill's allowed-tools frontmatter.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 17-01-T1: Add 7 new patterns to gate-prompts.md | done | 3b1c26f | 1 | passed |
| 17-01-T2: Convert begin Step 3 to AskUserQuestion | done | 20eb7aa | 1 | passed |
| 17-01-T3: Convert begin Steps 1, 4, 8, 10b to AskUserQuestion | done | 8b9c7cb | 1 | passed |

## Key Implementation Details

- gate-prompts.md now has 21 total patterns (14 existing + 7 new)
- All 7 new patterns follow the existing format: code block with `Use AskUserQuestion`, proper indentation, notes where applicable
- All new patterns have `multiSelect: false` and headers under 12 characters
- The begin skill now references 5 distinct patterns: toggle-confirm, depth-select, git-strategy-select, yes-no, approve-revise-abort
- No bare `Ask:` lines remain in the begin SKILL.md
- Dynamic patterns (gray-area-option, debug-session-select) include notes about runtime option generation

## Known Issues

None.

## Dependencies Provided

- 7 new gate prompt patterns available for plans 17-02 (discuss/explore) and 17-03 (debug): context-handling, gray-area-option, output-routing, debug-session-select, debug-checkpoint, depth-select, git-strategy-select
- begin SKILL.md serves as a reference implementation for other skill conversions
