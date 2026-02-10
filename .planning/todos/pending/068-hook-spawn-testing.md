---
title: "Add child-process spawn tests for hook scripts"
status: pending
priority: P3
source: ecc-review
created: 2026-02-10
theme: testing
---

## Goal

Add integration tests that spawn hook scripts as child processes with simulated stdin, testing actual exit codes and stderr/stdout behavior.

## Context

ECC tests hooks by spawning them as child processes with `spawn('node', [scriptPath])` and piping JSON via stdin, then verifying exit codes and stderr output. Towline currently tests by requiring modules with Jest mocks, which misses stdin/stdout/stderr behavior and exit code semantics.

## Scope

- Add integration test file: `tests/hooks-integration.test.js`
- Test each hook script by spawning as child process
- Simulate stdin with tool_input JSON
- Verify exit codes (0 = pass, 2 = block for PreToolUse)
- Verify stderr messages contain expected content
- Test edge cases: empty stdin, malformed JSON, large input

## Acceptance Criteria

- [ ] Each hook script has at least one spawn-based test
- [ ] Exit codes verified for both pass and block scenarios
- [ ] Edge cases covered (empty, malformed, large input)
- [ ] Tests pass cross-platform
