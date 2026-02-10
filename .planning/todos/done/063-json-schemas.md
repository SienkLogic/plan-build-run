---
title: "Add JSON schemas for configuration files"
status: done
priority: P3
source: ecc-review
created: 2026-02-10
completed: 2026-02-10
theme: quality
---

## Goal

Create JSON Schema files for Towline's configuration formats to enable IDE autocompletion and formal validation.

## What Was Done

1. Created `hooks-schema.json` (JSON Schema for hooks.json):
   - Defines all 9 hook event types (SessionStart through SessionEnd)
   - hookEntry with optional matcher and required hooks array
   - hookCommand with type, command, statusMessage, async, timeout
   - Proper $ref definitions for reuse
2. Added `$schema` reference to hooks.json pointing to the schema
3. Kept existing `config-schema.json` in place (already used by towline-tools.js)
4. Added 17 structural validation tests in `schema-validation.test.js`:
   - hooks.json: top-level structure, event names, hook entries, commands, matchers, async/timeout, $schema ref
   - hooks-schema.json: JSON Schema structure, event types, field coverage
   - config-schema.json: sections, feature toggles, hook toggles, additionalProperties
5. All 441 tests pass (30 suites)

## Design Decisions

- No `ajv` dependency — structural tests validate without a schema library (keeps devDependencies minimal)
- hooks-schema.json placed in scripts/ alongside config-schema.json for consistency
- $schema added to hooks.json only (config.json is a user file — users can add it themselves)
- Schema uses JSON Schema draft-07 (same as config-schema.json)

## Acceptance Criteria

- [x] Schemas cover all current config.json and hooks.json fields
- [x] IDE autocompletion works when editing hooks.json (via $schema)
- [x] CI catches schema violations (17 structural tests)
