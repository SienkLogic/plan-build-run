---
phase: "17-discussion-and-discovery-upgrades"
plan: "17-03"
status: "complete"
subsystem: "skills"
tags:
  - "AskUserQuestion"
  - "debug-skill"
  - "false-positive-fix"
requires:
  - "17-01: debug-session-select and debug-checkpoint patterns in gate-prompts.md"
provides:
  - "debug SKILL.md fully converted to AskUserQuestion for structured decisions"
  - "All 4 Phase 17 target skills (begin, discuss, explore, debug) now use AskUserQuestion"
affects:
  - "plugins/dev/skills/debug/SKILL.md"
tech_stack:
  - "Markdown skill definitions"
  - "AskUserQuestion structured prompts"
key_files:
  - "plugins/dev/skills/debug/SKILL.md: session selection and checkpoint converted to AskUserQuestion, symptom gathering fixed to freeform"
key_decisions:
  - "Symptom gathering kept as freeform text: questions require open-ended answers not option selection"
  - "Checkpoint follow-ups (More info, New approach) use freeform after initial AskUserQuestion selection"
patterns:
  - "AskUserQuestion pattern references: debug-session-select for session selection, debug-checkpoint for checkpoint responses"
  - "Freeform exemption markers: explicit 'do NOT use AskUserQuestion' annotations for open-ended questions"
metrics:
  duration_minutes: 2
  start_time: "2026-02-10T20:17:09-05:00"
  end_time: "2026-02-10T20:18:45-05:00"
  tasks_completed: 2
  tasks_total: 2
  commits: 1
  files_created: 0
  files_modified: 1
deferred: []
---

# Plan Summary: 17-03

## What Was Built

Converted the debug SKILL.md to use AskUserQuestion with pattern references for two structured decision points: active session selection (debug-session-select pattern) and checkpoint responses (debug-checkpoint pattern). Added AskUserQuestion to the skill's allowed-tools frontmatter.

Corrected a false positive in symptom gathering where the text incorrectly said "use AskUserQuestion for each" -- symptom questions (expected behavior, actual behavior, reproduction, onset, scope) require freeform text answers, not option selection. The wording now explicitly says "ask as plain text -- these are freeform, do NOT use AskUserQuestion."

Ran the full test suite (540 tests, 31 suites, all passing), plugin validation (0 errors), and verified all Phase 17 changes: all 4 target skills have AskUserQuestion in allowed-tools, gate-prompts.md has all 21 patterns, and freeform elements in debug/discuss/explore are preserved.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 17-03-T1: Convert debug SKILL.md to use AskUserQuestion for structured decisions | done | 61efbc9 | 1 | passed |
| 17-03-T2: Run full test suite and validate all Phase 17 changes | done | (verify-only) | 0 | passed |

## Key Implementation Details

- debug SKILL.md now references two patterns by name from gate-prompts.md: debug-session-select and debug-checkpoint
- Session selection generates options dynamically from active sessions, with max 4 options (3 recent + "New session")
- Checkpoint response handles three options: Continue, More info, New approach -- the latter two use freeform follow-ups
- Symptom gathering (5 questions) is explicitly marked as freeform with "do NOT use AskUserQuestion" annotation
- All 4 converted skills confirmed: begin, discuss, explore, debug all have AskUserQuestion in allowed-tools
- gate-prompts.md confirmed at 21 total patterns (14 existing + 7 new from 17-01)
- Lint has 6 pre-existing errors in unrelated files (suggest-compact.js, test files) -- not introduced by Phase 17

## Known Issues

None.

## Dependencies Provided

- debug SKILL.md fully converted to AskUserQuestion pattern references
- Phase 17 is complete: all 4 target skills (begin, discuss, explore, debug) use structured AskUserQuestion for decision points while preserving freeform elements where appropriate
