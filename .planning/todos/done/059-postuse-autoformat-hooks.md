---
title: "Add PostToolUse auto-format and quality hooks"
status: done
priority: P2
source: ecc-review
created: 2026-02-10
completed: 2026-02-10
theme: hooks
---

## Goal

Add PostToolUse hooks that automatically run code quality checks after JS/TS edits.

## What Was Done

1. Created `post-write-quality.js` with 3 opt-in quality checks:
   - **autoFormat**: Runs Prettier on the file (requires local installation)
   - **typeCheck**: Runs `tsc --noEmit` filtered to the edited file (TS/TSX only, requires local typescript)
   - **detectConsoleLogs**: Warns about leftover `console.log` statements
2. All checks disabled by default — enable via `.planning/config.json`:
   ```json
   { "hooks": { "autoFormat": true, "typeCheck": true, "detectConsoleLogs": true } }
   ```
3. Updated `config-schema.json` with `hooks` section (also added `blockDocSprawl`, `compactThreshold` for future phases)
4. Added `enforce_phase_boundaries` to schema's `safety` section (was read by scripts but missing from schema)
5. Wired into hooks.json as PostToolUse Write|Edit entry
6. Added 21 tests covering unit functions and hook execution
7. All 380 tests pass (27 suites)

## Design Decisions

- Single script handles all 3 checks (no 3-script overhead per Write/Edit call)
- Uses `findLocalBin()` to find prettier/tsc in project's `node_modules/.bin/` — never downloads
- TypeScript check only runs for `.ts`/`.tsx` files (not `.js`)
- Console.log detection skips single-line comments
- Prettier warning includes "re-read before further edits" to mitigate context staleness

## Acceptance Criteria

- [x] Hooks are disabled by default (opt-in)
- [x] Config toggles control each hook independently
- [x] Hooks work cross-platform (Windows/macOS/Linux)
- [x] Tests cover enabled/disabled states
