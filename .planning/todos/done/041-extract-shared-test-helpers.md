---
title: "Extract shared test helpers and add complex fixture"
status: pending
priority: P2
source: dev-guide-review
created: 2026-02-10
theme: testing
---

## Goal

Tests duplicate tmpdir creation/cleanup logic across 15 files. Current fixture project is minimal (6 phases, not a real git repo). Extract shared helpers and add a more complete fixture.

## Changes

1. **`tests/helpers.js`** — Extract shared utilities:
   - `makeTmpTowlineProject()` — creates temp .planning/ with STATE, config, ROADMAP
   - `makeComplexTowlineProject()` — 8 phases, multiple plans, gap closures
   - `cleanup(tmpDir)` — safe recursive removal with cwd restore
   - `runHookScript(scriptPath, input, opts)` — standard hook invocation pattern
   - `parseJSONL(filePath)` — parse log files

2. **Refactor existing tests** to use shared helpers where beneficial

3. **`tests/fixtures/fake-project/`** — Consider adding:
   - REQUIREMENTS.md, RESEARCH.md files
   - Phase with gap-closure plans
   - Checkpoint task examples

## Acceptance Criteria

- [ ] Shared helpers created in tests/helpers.js
- [ ] At least 3 test files refactored to use helpers
- [ ] No test regressions
