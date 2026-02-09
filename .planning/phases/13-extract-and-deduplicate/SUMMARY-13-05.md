---
phase: "13"
plan: "13-05"
status: "complete"
subsystem: "skills/scan, skills/debug"
tags:
  - "template-extraction"
  - "deduplication"
  - "context-optimization"
requires:
  - "13-01: shared codebase templates in templates/codebase/"
provides:
  - "scan/SKILL.md references shared templates instead of inline format specs"
  - "debug/templates/initial-investigation-prompt.md.tmpl"
  - "debug/templates/continuation-prompt.md.tmpl"
affects:
  - "plugins/dev/skills/scan/SKILL.md"
  - "plugins/dev/skills/debug/SKILL.md"
  - "plugins/dev/skills/debug/templates/"
tech_stack:
  - "Markdown"
key_files:
  - "plugins/dev/skills/scan/SKILL.md: scan skill with shared template references (435 lines, down from 610)"
  - "plugins/dev/skills/debug/SKILL.md: debug skill with external prompt template references (386 lines, down from 430)"
  - "plugins/dev/skills/debug/templates/initial-investigation-prompt.md.tmpl: initial debugger spawn prompt"
  - "plugins/dev/skills/debug/templates/continuation-prompt.md.tmpl: continuation debugger spawn prompt"
key_decisions:
  - "Preserved analysis instruction bullets in scan spawn prompts: only format specs removed, not the what-to-analyze lists"
  - "Kept display-only templates inline: the 'Resuming debug session' UI block in Step 2b is not a spawn prompt, stays inline"
patterns:
  - "Read reference pattern: Read `templates/codebase/X.md.tmpl` for format, matching 13-01 agent pattern"
  - "Template header comment: <!-- Source: ... | Purpose: ... --> consistent with other extracted templates"
metrics:
  duration_minutes: 4
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 2
  files_modified: 2
deferred:
  - "T2 commit inadvertently included SUMMARY-13-08.md and STATE.md from a prior staged session (not harmful, but commit is not purely atomic)"
---

# Plan Summary: 13-05

## What Was Built

This plan updated scan/SKILL.md to reference the shared codebase templates created by Plan 13-01, replacing approximately 175 lines of inline format specifications with compact Read references. It also extracted 2 inline prompt templates from debug/SKILL.md into external template files in a new debug/templates/ directory.

The scan/SKILL.md file went from 610 lines to 435 lines. All 4 agent spawn prompts now reference templates/codebase/*.md.tmpl for output format specs while preserving the analysis instruction content (what to investigate). The debug/SKILL.md file went from 430 lines to 386 lines, with the initial investigation and continuation prompts moved to external .md.tmpl files.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 13-05-T1: Replace scan/SKILL.md inline format specs | done | f02da06 | 1 | passed |
| 13-05-T2: Extract debug/SKILL.md prompt templates | done | 1407aca | 3 | passed |

## Key Implementation Details

- scan/SKILL.md spawn prompts retain the analysis focus instructions (what to look for) but replace inline format templates with `Read templates/codebase/X.md.tmpl` references
- 7 total template references in scan/SKILL.md (STACK, INTEGRATIONS, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, CONCERNS)
- debug/templates/ directory contains 2 files following the same header comment convention as other extracted templates
- The debug skill Step 2b "Resuming debug session" display block was intentionally left inline as it is a UI format, not a spawn prompt template

## Known Issues

None.

## Dependencies Provided

- scan/SKILL.md now references shared templates from templates/codebase/ (created by 13-01)
- debug/templates/ directory with 2 prompt templates available for future reference
