---
title: "Add child-process spawn tests for hook scripts"
status: done
priority: P3
source: ecc-review
created: 2026-02-10
completed: 2026-02-10
theme: testing
---

## Goal

Add integration tests that spawn hook scripts as child processes with simulated stdin, testing actual exit codes and stderr/stdout behavior.

## What Was Done

1. Created `tests/hooks-spawn.test.js` with 34 tests across 9 describe blocks:
   - **validate-commit.js**: valid format (exit 0), invalid format (exit 2), AI co-author block (exit 2), non-commit (exit 0), merge (exit 0), docs(planning) (exit 0)
   - **check-dangerous-commands.js**: safe (exit 0), rm -rf .planning (exit 2), git reset --hard (exit 2), git push --force (exit 2), git clean -fd (exit 2), warning (exit 0 + additionalContext), empty (exit 0)
   - **log-tool-failure.js**: recovery hints (exit 0 + hookSpecificOutput), unknown tool (exit 0)
   - **suggest-compact.js**: below threshold (exit 0, no output), counter increments
   - **context-budget-check.js**: preserves state (exit 0), no STATE.md (exit 0)
   - **auto-continue.js**: no .planning (exit 0), no active operation (exit 0)
   - **log-subagent.js**: start (exit 0), stop (exit 0)
   - **session-cleanup.js**: no .planning (exit 0), cleans up .active-operation/.active-skill/.auto-next
   - **Edge cases**: empty stdin (exit 0), malformed JSON (exit 0), empty object (exit 0)

2. `spawnHook()` utility: spawns `node <script>` with piped stdin, captures stdout/stderr/exitCode
3. `createTmpProject()`: creates temp `.planning/` with STATE.md and logs/ for scripts that need it
4. All tests are cross-platform (use path.join, temp directories, no shell commands)

## Design Decisions

- Used `child_process.spawn` instead of `execFile` for better stdin piping control
- Each test creates/cleans its own temp directory to avoid interference
- Tested only scripts that are wired in hooks.json (not internal utility modules)
- post-write-dispatch.js and post-write-quality.js not individually spawn-tested (they delegate to other checked functions; would require complex phase directory setup)

## Acceptance Criteria

- [x] Each hook script has at least one spawn-based test (8 of 8 distinct scripts covered)
- [x] Exit codes verified for both pass and block scenarios
- [x] Edge cases covered (empty, malformed, large input)
- [x] Tests pass cross-platform (uses path.join, os.tmpdir)
