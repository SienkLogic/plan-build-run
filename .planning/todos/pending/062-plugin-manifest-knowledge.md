---
title: "Document plugin manifest validator constraints"
status: pending
priority: P3
source: ecc-review
created: 2026-02-10
theme: documentation
---

## Goal

Capture hard-won knowledge about Claude Code's plugin validator behavior for when Towline publishes to the marketplace.

## Context

ECC's PLUGIN_SCHEMA_NOTES.md documents undocumented validator constraints that caused 4 fix/revert cycles:
- Agents require explicit file paths in plugin.json (not directory paths)
- hooks field must NOT be in plugin.json (auto-loaded by convention; causes duplicate error)
- All component fields must be arrays even for single values
- version is mandatory
- Cross-platform Windows installs are less forgiving

## Scope

- Create `references/plugin-manifest.md` documenting these constraints
- Add a regression test ensuring hooks is NOT declared in any future plugin.json
- Reference this doc when marketplace publishing work begins

## Acceptance Criteria

- [ ] Reference doc captures all known validator constraints
- [ ] Test prevents accidental hooks declaration in plugin.json
