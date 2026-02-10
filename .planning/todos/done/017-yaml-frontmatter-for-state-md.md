---
title: "Add YAML frontmatter to STATE.md for reliable parsing"
status: pending
priority: P1
source: dev-guide-review
created: 2026-02-10
theme: state-reliability
---

## Goal

STATE.md is currently free-form markdown parsed with regex in `towline-tools.js` (lines 214-248). Add YAML frontmatter with structured fields so parsing is unambiguous.

## Proposed Format

```yaml
---
version: 2
current_phase: 14
phase_slug: "reference-architecture"
status: "verified"
progress_percent: 100
plans_total: 28
plans_complete: 28
last_activity: "2026-02-10T16:40:17Z"
last_command: "/dev:milestone audit"
blockers: []
active_checkpoint: null
---
# Project State
...markdown body for human readability...
```

## Changes

1. **`plugins/dev/scripts/towline-tools.js`** — `parseStateMd()`: check for frontmatter first, fall back to regex for old files
2. **All skills that write STATE.md** — Use new format with frontmatter
3. **`plugins/dev/scripts/progress-tracker.js`** — Read frontmatter for session injection
4. Add migration: old format → new format on first read
5. Add tests for both old and new format parsing

## Acceptance Criteria

- [ ] `towline-tools.js` parses both old and new STATE.md formats
- [ ] New STATE.md files include YAML frontmatter
- [ ] Existing tests still pass (backward compatible)
- [ ] New tests cover frontmatter parsing
