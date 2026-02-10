---
title: "Add JSON schemas for configuration files"
status: pending
priority: P3
source: ecc-review
created: 2026-02-10
theme: quality
---

## Goal

Create JSON Schema files for Towline's configuration formats to enable IDE autocompletion and formal validation.

## Context

ECC has 3 JSON schemas (hooks, package-manager, plugin). Towline has none. Schemas provide IDE autocompletion when referenced via `$schema` and enable CI validation.

## Scope

- `schemas/config.schema.json` — validates `.planning/config.json` (16 feature toggles, model settings, gates, git config)
- `schemas/hooks.schema.json` — validates `hooks/hooks.json` structure
- Add `$schema` references to existing config.json and hooks.json files
- Add CI validation step or Jest test that validates against schemas

## Acceptance Criteria

- [ ] Schemas cover all current config.json and hooks.json fields
- [ ] IDE autocompletion works when editing config files
- [ ] CI catches schema violations
