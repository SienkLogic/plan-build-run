---
title: Add hook execution audit logging
status: done
priority: P2
source: dogfood-testing
created: 2026-02-07
---

## Problem

Towline hooks (validate-commit, check-plan-format, context-budget-check, progress-tracker) have no execution logging. After a session, there's no way to verify which hooks actually fired, when, or what they decided.

## Observed During

Trying to verify that `validate-commit.js` PreToolUse hook fired during `/dev:begin` init commit. The commit message happened to be valid, so we can't distinguish "hook approved it" from "hook never ran." No log trail exists.

## Possible Approaches

- Add a lightweight audit log file (e.g., `.planning/.hook-log` or temp file) that each hook appends to
- Log: timestamp, hook name, event type, decision (allow/block), and the input that triggered it
- Keep log small — rotate or cap at N entries
- Could be opt-in via config (`features.hook_logging: true`)

## Impact

Without hook logging, we can't verify hooks are working during dogfood testing, and users can't debug unexpected behavior (e.g., "why was my commit blocked?").
