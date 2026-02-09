---
phase: "13"
plan: "13-04"
status: "complete"
subsystem: "skills/begin, skills/discuss"
tags:
  - "refactor"
  - "template-extraction"
  - "context-optimization"
requires: []
provides:
  - "begin/templates/researcher-prompt.md.tmpl: prompt template for spawning researcher agents"
  - "begin/templates/synthesis-prompt.md.tmpl: prompt template for spawning synthesis agent"
  - "begin/templates/roadmap-prompt.md.tmpl: prompt template for spawning roadmap planner"
  - "discuss/templates/CONTEXT.md.tmpl: template for phase CONTEXT.md output"
  - "discuss/templates/decision-categories.md: gray area category reference table"
affects:
  - "plugins/dev/skills/begin/SKILL.md"
  - "plugins/dev/skills/discuss/SKILL.md"
tech_stack:
  - "Markdown templates"
key_files:
  - "plugins/dev/skills/begin/templates/researcher-prompt.md.tmpl: prompt structure for researcher agents"
  - "plugins/dev/skills/begin/templates/synthesis-prompt.md.tmpl: prompt structure for synthesis agent"
  - "plugins/dev/skills/begin/templates/roadmap-prompt.md.tmpl: prompt structure for roadmap planner"
  - "plugins/dev/skills/discuss/templates/CONTEXT.md.tmpl: CONTEXT.md output template"
  - "plugins/dev/skills/discuss/templates/decision-categories.md: gray area categories reference"
  - "plugins/dev/skills/begin/SKILL.md: updated with Read references to 3 new templates"
  - "plugins/dev/skills/discuss/SKILL.md: updated with Read references to 2 new templates"
key_decisions:
  - "Placeholder documentation added inline in SKILL.md files so agents know what to fill in without reading templates upfront"
patterns:
  - "Read reference with placeholder docs: SKILL.md provides Read path + placeholder list so agents only load templates when needed"
metrics:
  duration_minutes: 3
  start_time: "2026-02-09T18:15:54Z"
  end_time: "2026-02-09T18:18:31Z"
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 5
  files_modified: 2
deferred: []
---

# Plan Summary: 13-04

## What Was Built

Extracted 3 inline prompt templates from `skills/begin/SKILL.md` (researcher prompt, synthesis prompt, roadmap prompt) and 2 inline templates from `skills/discuss/SKILL.md` (CONTEXT.md template, decision categories table) into external template files.

Both SKILL.md files were updated to reference their templates via `Read` instructions with inline placeholder documentation. This means agents only load the full template content when they actually need it during execution, rather than having it consume context budget on every SKILL.md load. The begin/SKILL.md dropped from 517 to 471 lines, and discuss/SKILL.md dropped from 333 to 288 lines.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 13-04-T1: Extract begin/SKILL.md prompt templates | done | 5f75e62 | 4 | passed |
| 13-04-T2: Extract discuss/SKILL.md templates | done | 7aa1d74 | 3 | passed |

## Key Implementation Details

Each Read reference in the SKILL.md files includes a **Placeholders to fill** section that documents every variable the agent must substitute. This allows agents to understand what data they need to gather before reading the template, reducing unnecessary context loading.

The begin/templates/ directory now contains 8 files total (5 pre-existing from prior plans + 3 new prompt templates). The discuss/templates/ directory was newly created with 2 files.

Template files use HTML comment headers (`<!-- Source: ... | Purpose: ... -->`) consistent with the pattern established in plans 13-01 through 13-03.

## Known Issues

None.

## Dependencies Provided

- `begin/templates/researcher-prompt.md.tmpl` -- available for /dev:begin Step 5
- `begin/templates/synthesis-prompt.md.tmpl` -- available for /dev:begin Step 6
- `begin/templates/roadmap-prompt.md.tmpl` -- available for /dev:begin Step 8
- `discuss/templates/CONTEXT.md.tmpl` -- available for /dev:discuss Step 7
- `discuss/templates/decision-categories.md` -- available for /dev:discuss Step 3
