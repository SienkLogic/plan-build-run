---
phase: "18-reference-docs-and-testing"
plan: "18-02"
status: "complete"
subsystem: "references"
tags:
  - "documentation"
  - "AskUserQuestion"
  - "DEVELOPMENT-GUIDE"
requires: []
provides:
  - "DEVELOPMENT-GUIDE.md AskUserQuestion Conventions subsection"
  - "DEVELOPMENT-GUIDE.md updated Gate Check Pattern with AskUserQuestion"
affects:
  - "references/DEVELOPMENT-GUIDE.md"
tech_stack:
  - "Markdown"
key_files:
  - "references/DEVELOPMENT-GUIDE.md: Updated with AskUserQuestion conventions and gate check patterns"
key_decisions:
  - "Placed AskUserQuestion Conventions as its own subsection after Gate Check Pattern: keeps gate checks focused on the config-driven pattern while conventions cover the full tool usage"
  - "Listed 17 of 21 skills as using AskUserQuestion per plan specification: 4 excluded skills have valid reasons (automation-only or read-only)"
patterns:
  - "Documentation update: edit existing subsection + insert new subsection before known anchor"
metrics:
  duration_minutes: 2
  start_time: "2026-02-10T23:41:21Z"
  end_time: "2026-02-10T23:43:18Z"
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 0
  files_modified: 1
deferred: []
---

# Plan Summary: 18-02

## What Was Built

Updated `references/DEVELOPMENT-GUIDE.md` with comprehensive AskUserQuestion documentation for skill authors. The Gate Check Pattern subsection was rewritten to reference AskUserQuestion and the `skills/shared/gate-prompts.md` pattern catalog instead of the old plain-text "Ask: Approve?" prompts.

A new "AskUserQuestion Conventions" subsection was added to the Skill Authoring Patterns section, documenting usage rules (max 4 options, header limits, multiSelect: false), when-to-use vs when-not-to-use guidance, how to add new patterns, a concrete example from the build skill, and the full skill coverage breakdown (17 of 21 skills).

The Orchestration Flow Pattern example (Step 3: Gate Check) was also updated to use the approve-revise-abort pattern with proper option handling instead of the stale "Ask: Approve this plan?" text.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 18-02-T1: Add AskUserQuestion conventions to Skill Authoring Patterns section | done | bbb5f0e | 1 | passed |
| 18-02-T2: Update Gate Check Pattern example in Decision Points section | done | 5aa772c | 1 | passed |

## Key Implementation Details

- The Gate Check Pattern subsection (formerly lines 1924-1937) was replaced with an AskUserQuestion-based version that references four specific patterns: approve-revise-abort, yes-no, multi-option-failure, multi-option-escalation
- The new AskUserQuestion Conventions subsection was inserted between Gate Check Pattern and Subagent Spawning Pattern to maintain logical flow
- The Orchestration Flow Pattern example (Step 3) was updated from 4 steps to 6 steps to properly cover Approve, Request changes, and Abort paths
- Final AskUserQuestion mention count: 12 occurrences across the document
- Final gate-prompts.md reference count: 5 occurrences across the document
- Zero remaining "Ask: Approve?" old-style patterns

## Known Issues

None.

## Dependencies Provided

- `references/DEVELOPMENT-GUIDE.md` now documents AskUserQuestion conventions for any future skill authoring
- Pattern catalog reference (`skills/shared/gate-prompts.md`) is documented as the canonical location for reusable prompt patterns
