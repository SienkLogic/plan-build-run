---
phase: "14"
plan: "14-03"
status: "complete"
subsystem: "templates/research"
tags:
  - "templates"
  - "research"
  - "documentation"
requires: []
provides:
  - "plugins/dev/templates/research/*.md.tmpl: 5 research output templates for towline-researcher agent"
affects:
  - "plugins/dev/templates/research/"
tech_stack:
  - "Markdown templates"
key_files:
  - "plugins/dev/templates/research/ARCHITECTURE.md.tmpl: Architecture research output format"
  - "plugins/dev/templates/research/FEATURES.md.tmpl: Feature landscape research output format"
  - "plugins/dev/templates/research/PITFALLS.md.tmpl: Common pitfalls research output format"
  - "plugins/dev/templates/research/STACK.md.tmpl: Technology stack evaluation output format"
  - "plugins/dev/templates/research/SUMMARY.md.tmpl: Research executive summary with roadmap implications"
key_decisions:
  - "Header comment references agents/towline-researcher.md as source agent"
  - "STACK.md.tmpl notes distinction from codebase/STACK.md.tmpl (external tech eval vs codebase analysis)"
  - "SUMMARY.md.tmpl notes distinction from templates/SUMMARY.md.tmpl (research summary vs phase execution summary)"
patterns:
  - "Towline header comment convention: <!-- Source: ... | Purpose: ... -->"
  - "{variable} placeholder syntax consistent with other .md.tmpl files"
metrics:
  duration_minutes: 2
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 5
  files_modified: 0
deferred: []
---

# Plan Summary: 14-03

## What Was Built

Created five research output templates in `plugins/dev/templates/research/` adapted from GSD's `templates/research-project/` directory. These templates define the output format for the `towline-researcher` agent when conducting research on a new project's domain.

The templates cover architecture patterns (ARCHITECTURE), feature landscape analysis (FEATURES), common pitfalls and avoidance strategies (PITFALLS), technology stack evaluation (STACK), and an executive summary with roadmap implications (SUMMARY). Each template uses Towline's `.md.tmpl` extension and header comment convention, with `{variable}` placeholders for agent-filled content.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 14-03-T1: Create ARCHITECTURE, FEATURES, PITFALLS templates | done | 4fb5b17 | 3 | passed |
| 14-03-T2: Create STACK and SUMMARY templates | done | a28d5d0 | 2 | passed |

## Key Implementation Details

- All five templates follow the same header comment pattern as existing codebase templates: `<!-- Source: agents/towline-researcher.md | Purpose: ... -->`
- STACK.md.tmpl is distinct from `codebase/STACK.md.tmpl` -- the research version evaluates external technologies for a new project, while the codebase version documents an existing project's stack
- SUMMARY.md.tmpl is distinct from the top-level `SUMMARY.md.tmpl` -- the research version is an executive overview of research findings with roadmap implications, while the top-level version is a phase execution summary
- Templates preserve the full structure of the GSD originals (sections, tables, diagrams) but strip the `<template>` and `<guidelines>` XML wrapper, presenting only the output format

## Known Issues

None.

## Dependencies Provided

- `plugins/dev/templates/research/*.md.tmpl`: Five research output templates ready for use by the towline-researcher agent
