---
title: "Document plugin manifest validator constraints"
status: done
priority: P3
source: ecc-review
created: 2026-02-10
completed: 2026-02-10
theme: documentation
---

## Goal

Capture hard-won knowledge about Claude Code's plugin validator behavior for when Towline publishes to the marketplace.

## What Was Done

1. Created `references/plugin-manifest.md` documenting:
   - Required fields (name, version, description)
   - Component auto-discovery directories (agents, skills, hooks, commands, contexts)
   - 5 critical constraints: no hooks in plugin.json, explicit file paths for agents, arrays for component fields, mandatory version, Windows strictness
   - Towline's current minimal manifest approach (relies on auto-discovery)
   - Pre-publish validation checklist
2. Added 4 regression tests in `schema-validation.test.js`:
   - plugin.json does NOT declare hooks field
   - Has mandatory version field (semver)
   - Has mandatory name field
   - Component fields are arrays when present
3. Fixed pre-existing test bug: integration test expected JSON from status-line.js but it correctly outputs plain text (status line protocol is plain text, not JSON)

## Acceptance Criteria

- [x] Reference doc captures all known validator constraints
- [x] Test prevents accidental hooks declaration in plugin.json
