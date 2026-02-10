---
title: "Explore async hooks with timeout for non-blocking background work"
status: done
priority: P3
source: ecc-review
created: 2026-02-10
completed: 2026-02-10
theme: hooks
---

## Goal

Investigate using `"async": true, "timeout": 30` hook configuration for non-blocking background work.

## What Was Done

1. Analyzed all 15 hook entries for async eligibility
2. Applied `async: true, timeout: 30` to 2 qualifying hooks:
   - **SubagentStop** (`log-subagent.js stop`) — pure logging + .active-agent cleanup
   - **SessionEnd** (`session-cleanup.js`) — cleanup + session history writing
3. Added 5 structural tests to reference-integrity.test.js:
   - hooks.json valid structure
   - All script paths reference existing files
   - Async hooks only on safe events (SubagentStop, SessionEnd)
   - Async hooks all have timeouts
   - PreToolUse hooks are never async
4. All 424 tests pass (29 suites)

## Analysis

**Cannot be async (13 hooks):**
- Hooks that output `additionalContext` or `hookSpecificOutput` (stdout is not captured from async hooks)
- PreToolUse hooks that can block (exit code 2)
- PreCompact hook (must complete state save before compaction)

**Can be async (2 hooks):**
- `log-subagent.js stop` (SubagentStop) — no stdout, pure logging
- `session-cleanup.js` (SessionEnd) — no stdout, cleanup + history

**Almost but not quite:**
- `log-subagent.js start` (SubagentStart) — outputs `hookSpecificOutput.additionalContext` to inject context into subagent
- `log-tool-failure.js` (PostToolUseFailure) — outputs recovery hints for Bash failures

## Acceptance Criteria

- [x] Research complete on which hooks benefit from async
- [x] hooks.json updated with async: true where appropriate
- [x] Verified no race conditions with async execution
