---
phase: "13-extract-and-deduplicate"
plan: "13-03"
status: "complete"
subsystem: "review skill"
tags:
  - "refactor"
  - "prompt-extraction"
  - "context-optimization"
requires: []
provides:
  - "skills/review/templates/verifier-prompt.md.tmpl"
  - "skills/review/templates/debugger-prompt.md.tmpl"
  - "skills/review/templates/gap-planner-prompt.md.tmpl"
affects:
  - "plugins/dev/skills/review/SKILL.md"
  - "plugins/dev/skills/review/templates/"
tech_stack:
  - "markdown"
  - "ejs-style placeholders"
key_files:
  - "plugins/dev/skills/review/templates/verifier-prompt.md.tmpl: Three-layer verification prompt (110 lines)"
  - "plugins/dev/skills/review/templates/debugger-prompt.md.tmpl: Root cause analysis prompt (44 lines)"
  - "plugins/dev/skills/review/templates/gap-planner-prompt.md.tmpl: Gap closure planning prompt (34 lines)"
  - "plugins/dev/skills/review/SKILL.md: Updated with Read references replacing inline templates"
key_decisions:
  - "Preserved exact XML tag structure and placeholder syntax in extracted templates"
  - "Added HTML comment headers to each template identifying source and purpose"
  - "Placeholder documentation in SKILL.md lists all variables to fill before sending"
patterns:
  - "Read reference with placeholder docs: used for all 3 template replacements"
metrics:
  duration_minutes: 3
  start_time: "2026-02-09T18:09:10Z"
  end_time: "2026-02-09T18:11:45Z"
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 3
  files_modified: 1
deferred: []
---

# Plan Summary: 13-03

## What Was Built

Extracted 3 inline prompt templates from `plugins/dev/skills/review/SKILL.md` into external template files under `plugins/dev/skills/review/templates/`. The templates are: the verifier prompt (used in Step 3 for automated three-layer verification), the debugger prompt (used in Step 6a for root cause analysis during auto-fix), and the gap planner prompt (used in Step 6b for creating gap-closure plans).

The SKILL.md was reduced from 592 lines to 425 lines (a reduction of 167 lines / ~28%). Each inline code-fenced prompt was replaced with a Read instruction referencing the external template file, along with documentation of all placeholders that need to be filled before sending the prompt to the subagent.

After extraction, no inline code blocks longer than 20 lines remain in the SKILL.md, satisfying the must-have truth.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 13-03-T1: Create review/templates/ directory and extract 3 prompt templates | done | d5af38d | 3 | passed |
| 13-03-T2: Update review/SKILL.md to reference external templates | done | 2f3ef8d | 1 | passed |

## Key Implementation Details

Each template file includes an HTML comment header identifying its source file and purpose. The verifier prompt template is the largest at 110 lines, containing the full three-layer verification methodology, phase_plans/build_results XML blocks with inline placeholders, and the detailed VERIFICATION.md report format. The debugger and gap planner templates are smaller (44 and 34 lines respectively) with bracket-notation placeholders for content to be inlined at send time.

The Read references in SKILL.md include a "Placeholders to fill before sending" section that documents every variable/placeholder in the template, making it clear what the orchestrator needs to substitute.

## Known Issues

None.

## Dependencies Provided

Three external template files are now available for the review skill's subagent spawning:
- `skills/review/templates/verifier-prompt.md.tmpl` — used by Step 3 (automated verification)
- `skills/review/templates/debugger-prompt.md.tmpl` — used by Step 6a (auto-fix diagnosis)
- `skills/review/templates/gap-planner-prompt.md.tmpl` — used by Step 6b (gap-closure planning)
