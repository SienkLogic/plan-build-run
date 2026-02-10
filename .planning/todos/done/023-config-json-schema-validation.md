---
title: "Add JSON Schema validation for config.json"
status: pending
priority: P2
source: dev-guide-review
created: 2026-02-10
theme: state-reliability
---

## Goal

Typos in config.json (e.g., `"deph": "quick"`) are silently ignored. Add schema validation that warns on unrecognized keys.

## Changes

1. **New file: `plugins/dev/scripts/config-schema.json`** — JSON Schema for config.json
2. **`plugins/dev/scripts/towline-tools.js`** — Add `configValidate()` function using schema
3. **`plugins/dev/scripts/progress-tracker.js`** — Validate config on SessionStart, warn if invalid
4. **`plugins/dev/skills/config/SKILL.md`** — Run validation before config writes
5. **Tests** — Schema validation test cases

## Acceptance Criteria

- [ ] Unrecognized config keys produce warnings
- [ ] Invalid enum values (e.g., bad depth) produce warnings
- [ ] Valid configs pass silently
- [ ] SessionStart hook warns if config is invalid
