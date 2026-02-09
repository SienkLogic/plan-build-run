---
phase: "14-reference-architecture-and-gsd-parity"
plan: "14-04"
status: "complete"
subsystem: "templates"
tags:
  - "templates"
  - "documentation"
  - "gsd-parity"
requires: []
provides:
  - "DEBUG.md.tmpl: debug session tracking template"
  - "UAT.md.tmpl: user acceptance testing session template"
  - "discovery.md.tmpl: discovery report template for plan-time research"
  - "milestone.md.tmpl: milestone entry template for MILESTONES.md"
  - "milestone-archive.md.tmpl: milestone archive file structure"
  - "continue-here.md.tmpl: session pause/resume handoff template"
affects:
  - "plugins/dev/templates/"
  - "debug skill"
  - "milestone skill"
  - "review skill"
  - "pause skill"
  - "plan skill"
tech_stack:
  - "Markdown templates"
key_files:
  - "plugins/dev/templates/DEBUG.md.tmpl: debug session tracking with hypothesis-driven structure"
  - "plugins/dev/templates/UAT.md.tmpl: user acceptance testing session with gap tracking"
  - "plugins/dev/templates/discovery.md.tmpl: discovery report with confidence levels and alternatives"
  - "plugins/dev/templates/milestone.md.tmpl: milestone entry format for MILESTONES.md"
  - "plugins/dev/templates/milestone-archive.md.tmpl: milestone archive structure for completed milestones"
  - "plugins/dev/templates/continue-here.md.tmpl: session handoff file for pause/resume workflow"
key_decisions:
  - "Used <!-- Source: ... | Purpose: ... --> header convention: consistent with existing Towline templates"
  - "Adapted GSD terminology to Towline equivalents: /gsd:debug -> /dev:debug, /gsd:plan-phase -> /dev:plan, etc."
  - "Kept discovery template aligned with Towline discovery levels 0-3: provides richer context than GSD binary discovery"
patterns:
  - "Template header convention: <!-- Source: ... | Purpose: ... --> on line 1"
  - "Section rules via XML tags: <section_rules>, <lifecycle>, <guidelines>"
metrics:
  duration_minutes: 4
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 6
  files_modified: 0
deferred: []
---

# Plan Summary: 14-04

## What Was Built

Created 6 new top-level templates in `plugins/dev/templates/` adapted from GSD equivalents. Each template uses the `.md.tmpl` extension and follows the `<!-- Source: ... | Purpose: ... -->` header convention established by existing Towline templates.

The templates cover three functional areas: (1) debugging with the DEBUG.md.tmpl providing hypothesis-driven session tracking with section mutation rules (OVERWRITE/APPEND/IMMUTABLE), (2) verification with UAT.md.tmpl for user acceptance testing with gap diagnosis workflow, and (3) project management with discovery.md.tmpl for plan-time research, milestone.md.tmpl for milestone entries, milestone-archive.md.tmpl for completed milestone snapshots, and continue-here.md.tmpl for session pause/resume handoffs.

All templates were adapted from their GSD counterparts with Towline-specific terminology (e.g., /dev:debug instead of /gsd:debug, CONTEXT.md instead of PROJECT-STATE.md) and workflow alignment (e.g., discovery levels 0-3, Towline's three-layer verification).

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 14-04-T1: Create DEBUG, UAT, and discovery templates | done | ea21132 | 3 | passed |
| 14-04-T2: Create milestone, milestone-archive, and continue-here templates | done | b6b724e | 3 | passed |

## Key Implementation Details

- DEBUG.md.tmpl (175 lines): Full debug session structure with Current Focus, Symptoms, Eliminated, Evidence, Hypotheses, Investigation Log, Root Cause, and Fix Applied sections. Includes section mutation rules and resume behavior documentation.
- UAT.md.tmpl (249 lines): Testing session with per-test tracking, severity inference guide, gap diagnosis lifecycle, and YAML-format gaps section that feeds into /dev:plan --gaps.
- discovery.md.tmpl (127 lines): Discovery report with alternatives comparison table, confidence levels (HIGH/MEDIUM/LOW), source priority protocol, and Towline discovery level (0-3) alignment.
- milestone.md.tmpl (119 lines): Milestone entry format with stats, git range, and full example.
- milestone-archive.md.tmpl (113 lines): Archive structure with phase details, decimal phase support, key decisions, issues resolved/deferred, and technical debt tracking.
- continue-here.md.tmpl (73 lines): Near-identical to skills/pause/templates/continue-here.md.tmpl with added Source header comment for consistency.

## Known Issues

None.

## Dependencies Provided

- 6 top-level templates available for skill reference and agent output formatting
- Total template count: 12 top-level .tmpl files, 24 total including subdirectories (research/, codebase/)
