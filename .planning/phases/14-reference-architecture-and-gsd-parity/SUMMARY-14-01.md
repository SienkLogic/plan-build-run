---
phase: "14"
plan: "14-01"
status: "complete"
subsystem: "plugin references"
tags:
  - "refactor"
  - "file-organization"
  - "reference-docs"
requires: []
provides:
  - "plugins/dev/references/ directory with 7 cross-cutting reference docs"
  - "Centralized location for continuation-format, verification-patterns, ui-formatting, questioning, commit-conventions, deviation-rules, plan-format"
affects:
  - "plugins/dev/skills/build/"
  - "plugins/dev/skills/plan/"
  - "plugins/dev/skills/shared/"
  - "plugins/dev/skills/begin/"
  - "plugins/dev/references/"
tech_stack:
  - "markdown"
key_files:
  - "plugins/dev/references/continuation-format.md: continuation protocol for executor agents"
  - "plugins/dev/references/verification-patterns.md: goal-backward verification patterns"
  - "plugins/dev/references/ui-formatting.md: consistent output formatting for all skills"
  - "plugins/dev/references/questioning.md: deep questioning guide for /dev:begin (renamed from questioning-guide.md)"
  - "plugins/dev/references/commit-conventions.md: atomic commit format and rules"
  - "plugins/dev/references/deviation-rules.md: 5 rules for execution deviations"
  - "plugins/dev/references/plan-format.md: XML task specification reference"
key_decisions:
  - "questioning-guide.md renamed to questioning.md: shorter name, consistent with other reference doc naming"
  - "Content preserved exactly: byte-for-byte copies verified with diff"
patterns:
  - "git rm for deletion: ensures git tracks the move as delete+create"
metrics:
  duration_minutes: 6
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 7
  files_modified: 0
  files_deleted: 7
  start_time: "2026-02-09T18:44:17Z"
  end_time: "2026-02-09T18:49:50Z"
deferred: []
---

# Plan Summary: 14-01

## What Was Built

Moved 7 cross-cutting reference documents from scattered locations under `plugins/dev/skills/` subdirectories into a centralized `plugins/dev/references/` directory. This consolidation makes reference docs discoverable in one location rather than being mixed in with skill definitions.

The files were: continuation-format.md and commit-conventions.md (from skills/build/), verification-patterns.md, deviation-rules.md, and plan-format.md (from skills/plan/), ui-formatting.md (from skills/shared/), and questioning-guide.md (from skills/begin/, renamed to questioning.md).

All content was preserved exactly as verified by diff comparisons against the originals. The originals were then deleted from their former locations using git rm.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 14-01-T1: Create references/ directory and move 7 reference docs | done | a6941e1 | 7 created | passed |
| 14-01-T2: Delete original reference docs from skills/ subdirectories | done | b6dd8fe | 7 deleted | passed |

## Key Implementation Details

- The references/ directory already contained 3 other files (checkpoints.md, git-integration.md, model-profiles.md) from prior work -- these were not touched.
- questioning-guide.md was renamed to questioning.md during the move per plan specification.
- All diffs verified clean (byte-for-byte identical content).

## Known Issues

- Skills that previously `@reference`-ed these files from their old paths (e.g., `@skills/build/continuation-format.md`) will need their references updated. This is covered by subsequent plans in this phase (14-02 through 14-06).

## Dependencies Provided

- All 7 reference docs now live in `plugins/dev/references/` for centralized access by any skill or agent definition.
