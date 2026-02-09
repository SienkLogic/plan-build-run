---
phase: "13"
plan: "13-01"
status: "complete"
subsystem: "agents/codebase-mapper"
tags:
  - "refactor"
  - "template-extraction"
  - "context-optimization"
requires: []
provides:
  - "templates/codebase/STACK.md.tmpl"
  - "templates/codebase/INTEGRATIONS.md.tmpl"
  - "templates/codebase/ARCHITECTURE.md.tmpl"
  - "templates/codebase/STRUCTURE.md.tmpl"
  - "templates/codebase/CONVENTIONS.md.tmpl"
  - "templates/codebase/TESTING.md.tmpl"
  - "templates/codebase/CONCERNS.md.tmpl"
affects:
  - "plugins/dev/agents/towline-codebase-mapper.md"
  - "plugins/dev/templates/codebase/"
tech_stack:
  - "Markdown templates"
key_files:
  - "plugins/dev/templates/codebase/STACK.md.tmpl: Technology stack analysis output format"
  - "plugins/dev/templates/codebase/INTEGRATIONS.md.tmpl: External integrations analysis output format"
  - "plugins/dev/templates/codebase/ARCHITECTURE.md.tmpl: Architecture analysis output format"
  - "plugins/dev/templates/codebase/STRUCTURE.md.tmpl: Project structure analysis output format"
  - "plugins/dev/templates/codebase/CONVENTIONS.md.tmpl: Code conventions analysis output format"
  - "plugins/dev/templates/codebase/TESTING.md.tmpl: Testing infrastructure analysis output format"
  - "plugins/dev/templates/codebase/CONCERNS.md.tmpl: Technical debt and concerns analysis output format"
  - "plugins/dev/agents/towline-codebase-mapper.md: Agent definition with Read references replacing inline templates"
key_decisions:
  - "Each template gets a source comment header for traceability"
  - "Templates stored in templates/codebase/ to match the agent's document category"
  - "Read references use relative paths from the plugin root (templates/codebase/...)"
patterns:
  - "Template extraction to shared directory: agents/ -> templates/codebase/"
  - "Read instruction pattern: 'Read the document template from X and use it as the format for your Y output'"
metrics:
  duration_minutes: 6
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 7
  files_modified: 1
  start_time: "2026-02-09T18:08:39Z"
  end_time: "2026-02-09T18:14:06Z"
deferred: []
---

# Plan Summary: 13-01

## What Was Built

Extracted 7 document format templates from the `towline-codebase-mapper` agent definition into the shared `templates/codebase/` directory. The agent definition was reduced from 895 lines to 256 lines (a ~71% reduction, removing ~640 lines of inline template content).

The 7 templates cover all output formats produced by the codebase-mapper agent: STACK, INTEGRATIONS, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, and CONCERNS. Each template file includes a source comment header for traceability and preserves the exact formatting, placeholder syntax, and table structures from the original inline content.

The agent definition now references each template via a Read instruction, directing the agent to load the template file at runtime and fill in placeholders with codebase analysis data.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 13-01-T1: Create shared templates/codebase/ directory with 4 tech/arch templates | done | 9086760 | 4 | passed |
| 13-01-T2: Create 3 quality/concerns templates and update agent definition | done | bc09360 | 4 | passed |

## Key Implementation Details

- Template files use `.md.tmpl` extension to distinguish from regular markdown
- Each template starts with `<!-- Source: agents/towline-codebase-mapper.md | Purpose: ... -->` comment
- Agent Read references use relative paths from plugin root: `templates/codebase/{DOCTYPE}.md.tmpl`
- The replacement pattern is consistent: heading + single-line Read instruction + fill instruction
- All non-template content in the agent definition (exploration commands, quality standards, anti-patterns, etc.) is preserved unchanged

## Known Issues

None.

## Dependencies Provided

- 7 template files in `plugins/dev/templates/codebase/` available for reuse by plan 13-05 (scan/SKILL.md) and any other agents that need codebase analysis output formats
- Pattern established for future template extractions: source comment header, `.md.tmpl` extension, Read instruction replacement
