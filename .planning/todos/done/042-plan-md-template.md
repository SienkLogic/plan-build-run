---
title: "Create PLAN.md template to extract structure from planner agent"
status: pending
priority: P1
source: dev-guide-review
created: 2026-02-10
theme: context-discipline
---

## Goal

The planner agent (586 lines) contains ~100 lines of inline PLAN.md XML structure, frontmatter schema, and examples. This should be a template that the planner references, not inline content.

## Changes

1. **`plugins/dev/templates/PLAN.md.tmpl`** — Create template with:
   - YAML frontmatter schema (phase, plan, type, wave, depends_on, etc.)
   - XML task structure (`<task>`, `<name>`, `<files>`, `<action>`, `<verify>`, `<done>`)
   - Task type variants (auto, human-verify, decision, human-action)
   - Checkpoint task format
   - Frontmatter field descriptions

2. **`plugins/dev/agents/towline-planner.md`** — Replace inline structure with reference to template:
   ```markdown
   Read the PLAN.md template from `templates/PLAN.md.tmpl` for the required format.
   ```

## Estimated savings: ~100 lines from planner agent (17%)

## Acceptance Criteria

- [ ] PLAN.md template contains complete structure specification
- [ ] Planner agent references template instead of inlining structure
- [ ] Planner still produces valid PLAN.md files
- [ ] `npm run validate` passes
