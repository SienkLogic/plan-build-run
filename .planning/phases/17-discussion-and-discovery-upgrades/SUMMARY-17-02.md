---
phase: "17-discussion-and-discovery-upgrades"
plan: "17-02"
status: "complete"
subsystem: "skills"
tags:
  - "AskUserQuestion"
  - "gate-prompts"
  - "discuss"
  - "explore"
requires:
  - "17-01: gate-prompts.md with context-handling, gray-area-option, output-routing, yes-no patterns"
provides:
  - "discuss SKILL.md with structured AskUserQuestion gates for CONTEXT.md handling, gray areas, and follow-ups"
  - "explore SKILL.md with structured AskUserQuestion gate for output routing confirmation"
affects:
  - "discuss skill"
  - "explore skill"
tech_stack:
  - "SKILL.md (Claude Code plugin skill definitions)"
key_files:
  - "plugins/dev/skills/discuss/SKILL.md: pre-planning discussion skill with AskUserQuestion pattern references"
  - "plugins/dev/skills/explore/SKILL.md: idea exploration skill with output-routing and yes-no patterns"
key_decisions:
  - "Follow-up questions split by type: scope boundary and future-proofing use yes-no pattern, quality level and integration remain freeform"
  - "Edge case 'user disagrees with all options' explicitly marked as freeform, not AskUserQuestion"
  - "Context pressure awareness ('Want to wrap up?') preserved as conversational text, not structured"
patterns:
  - "context-handling pattern: discuss Step 2 CONTEXT.md handling and Edge Cases section"
  - "gray-area-option pattern: discuss Step 4 gray area presentation"
  - "yes-no pattern: discuss Step 5 scope boundary and future-proofing follow-ups"
  - "output-routing pattern: explore Step 3 output confirmation"
  - "yes-no pattern: explore mid-conversation research decision"
metrics:
  duration_minutes: 2
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 0
  files_modified: 2
deferred: []
---

# Plan Summary: 17-02

## What Was Built

Converted the discuss and explore skills to use AskUserQuestion with explicit pattern references from `skills/shared/gate-prompts.md`. The discuss skill received 3 conversion points: CONTEXT.md handling (context-handling pattern), gray area presentation (gray-area-option pattern), and follow-up questions (yes-no pattern for scope boundary and future-proofing, with quality level and integration preserved as freeform). The explore skill received 1 conversion point for output routing (output-routing pattern) plus a consistency update to its existing mid-conversation research question (now references yes-no pattern).

Freeform conversation elements were carefully preserved in both skills. The discuss skill's open exploration (Step 2.5), domain probing (Step 3), quality/integration follow-ups, and "user disagrees with all options" edge case all remain as plain text. The explore skill's Socratic conversation and context pressure awareness bridging remain unstructured.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 17-02-T1: Convert discuss SKILL.md to use AskUserQuestion for structured decisions | done | 779deb1 | 1 | passed |
| 17-02-T2: Convert explore SKILL.md output routing to AskUserQuestion | done | 053dc96 | 1 | passed |

## Key Implementation Details

- The discuss skill's `allowed-tools` was updated from `Read, Write, Glob, Grep` to include `AskUserQuestion`
- The explore skill already had `AskUserQuestion` in `allowed-tools` -- no change needed
- The discuss skill's Step 4 now enforces max 4 options per gray area (top 3 concrete + "Let Claude decide"), with omitted options mentioned in the question text
- The discuss skill's Step 5 follow-ups are now split: binary decisions (scope boundary, future-proofing) use yes-no pattern; open-ended questions (quality level, integration) stay freeform with explicit "do NOT use AskUserQuestion" guidance
- The Edge Cases section for "Phase already has CONTEXT.md" was also updated to reference the context-handling pattern for consistency with Step 2

## Known Issues

None.

## Dependencies Provided

- discuss SKILL.md now references context-handling, gray-area-option, and yes-no patterns from gate-prompts.md
- explore SKILL.md now references output-routing and yes-no patterns from gate-prompts.md
- Both skills are ready for use with AskUserQuestion tool
