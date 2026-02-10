---
title: "Add proactive compaction suggestion hook"
status: done
priority: P2
source: ecc-review
created: 2026-02-10
completed: 2026-02-10
theme: hooks
---

## Goal

Add a PostToolUse hook that tracks tool call count per session and proactively suggests `/compact` at configurable thresholds, preventing context degradation before it happens.

## What Was Done

1. Created `suggest-compact.js` with session-scoped counter:
   - Counter stored in `.planning/.compact-counter` (JSON with count + lastSuggested)
   - Default threshold: 50 Write/Edit calls, configurable via `hooks.compactThreshold`
   - Reminder every 25 calls after first suggestion
   - Outputs suggestion via `additionalContext` when threshold reached
2. Counter resets on SessionStart via `progress-tracker.js` calling `resetCounter()`
3. Wired into hooks.json as PostToolUse Write|Edit entry
4. Added 19 tests covering unit functions and hook execution
5. All 399 tests pass (28 suites)

## Design Decisions

- Used PostToolUse (not PreToolUse) so suggestion appears after a completed action, giving a natural pause point
- Hooked on Write|Edit specifically (not all tools) to avoid overhead on frequent Read/Grep calls
- Counter stored in `.planning/` (not OS temp dir) — simpler, no session ID env var dependency
- Counter reset happens in SessionStart hook (progress-tracker.js) for clean session boundaries
- Suggestion uses `additionalContext` (shown to Claude) rather than stderr (shown to user) — Claude can then suggest compaction to the user contextually

## Acceptance Criteria

- [x] Counter persists across tool calls within a session
- [x] Suggestion appears at threshold via additionalContext
- [x] Threshold is configurable
- [x] Counter resets on new session (SessionStart hook)
- [x] Tests cover threshold triggering and reset
