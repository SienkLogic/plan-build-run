---
title: "Consolidate Write|Edit hooks into dispatch scripts"
status: done
priority: P2
source: ecc-review
created: 2026-02-10
completed: 2026-02-10
theme: hooks
---

## Goal

Reduce unnecessary hook process spawns by consolidating Write|Edit hooks into dispatcher scripts.

## Context

Research revealed that Claude Code's hook matchers only support regex against the tool name — NOT against tool_input fields. The original todo assumed ECC used expression-based input matching, but ECC's matchers are identical to Towline's existing tool-name matchers. Towline already had specific matchers ("Bash", "Write|Edit", "Task", "Read") — no wildcards.

The actual optimization: consolidate 4 Write|Edit hook scripts (2 PreToolUse + 2 PostToolUse) into 2 dispatcher scripts, cutting process spawns per Write/Edit call from 4 to 2 (50% reduction).

## What Was Done

1. Extracted core check logic from 4 scripts into exported functions:
   - `check-phase-boundary.js` → `checkBoundary(data)`
   - `check-skill-workflow.js` → `checkWorkflow(data)`
   - `check-plan-format.js` → `checkPlanWrite(data)`
   - `check-roadmap-sync.js` → `checkSync(data)`
2. Created `pre-write-dispatch.js` (calls checkWorkflow then checkBoundary)
3. Created `post-write-dispatch.js` (calls checkPlanWrite then checkSync)
4. Updated hooks.json: 4 Write|Edit entries → 2 dispatcher entries
5. Added 24 new tests across 2 test files
6. All 359 tests pass (26 suites)

## Acceptance Criteria

- [x] Write|Edit process spawns reduced from 4 to 2 per call
- [x] All existing hook behavior preserved (original scripts still work standalone)
- [x] Tests pass — 359 tests, 26 suites
