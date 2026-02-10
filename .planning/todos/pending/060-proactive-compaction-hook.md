---
title: "Add proactive compaction suggestion hook"
status: pending
priority: P2
source: ecc-review
created: 2026-02-10
theme: hooks
---

## Goal

Add a PreToolUse hook that tracks tool call count per session and proactively suggests `/compact` at configurable thresholds, preventing context degradation before it happens.

## Context

ECC's `suggest-compact.js` increments a counter in a temp file (keyed by CLAUDE_SESSION_ID) and suggests compaction at configurable thresholds (default: 50 calls, reminder every 25 after). Towline's `context-budget-check.js` only fires on PreCompact (when compaction is already happening).

## Scope

- New script: `scripts/suggest-compact.js`
- Counter stored in temp file keyed by `CLAUDE_SESSION_ID`
- Configurable threshold via `config.json` setting `hooks.compactThreshold` (default: 50)
- Reminder interval after first suggestion (default: every 25 calls)
- Add to hooks.json as PreToolUse on Edit/Write
- Add tests

## Acceptance Criteria

- [ ] Counter persists across tool calls within a session
- [ ] Suggestion appears at threshold via stderr
- [ ] Threshold is configurable
- [ ] Counter resets on new session
- [ ] Tests cover threshold triggering and reset
