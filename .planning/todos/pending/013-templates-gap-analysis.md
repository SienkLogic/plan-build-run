---
title: "Gap analysis: Towline templates vs GSD templates"
status: pending
priority: P2
source: user-request
created: 2026-02-10
---

## Goal

Review GSD's templates and identify what Towline needs to add or rebuild.

## Research Source

- GSD templates: https://github.com/gsd-build/get-shit-done/tree/main/get-shit-done/templates
- Towline's existing templates: `plugins/dev/templates/`

## Tasks

1. Catalog all GSD templates with their purpose and which agents/skills use them
2. Map each GSD template to its Towline equivalent (if one exists)
3. Identify gaps — GSD templates with no Towline counterpart
4. For each gap, assess whether Towline needs it or generates the content differently
5. For templates we should add, note the format (EJS-style .tmpl) and variables needed
6. Check if any existing Towline templates need content or variable upgrades

## Acceptance Criteria

- [ ] Complete mapping of GSD templates to Towline templates
- [ ] Gap list with priority and rationale for each
- [ ] Recommendations for new templates with variable lists
- [ ] Notes on existing templates that need updates
