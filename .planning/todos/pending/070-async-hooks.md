---
title: "Explore async hooks with timeout for non-blocking background work"
status: pending
priority: P3
source: ecc-review
created: 2026-02-10
theme: hooks
---

## Goal

Investigate using `"async": true, "timeout": 30` hook configuration for non-blocking background work.

## Context

ECC uses async hooks for build analysis PostToolUse — the hook runs in the background without blocking the main Claude interaction. Towline does not use async hooks.

## Scope

- Research: which Towline hooks would benefit from async execution?
- Candidates: log-subagent.js (doesn't need to block), session-cleanup.js
- Test async hook behavior on all 3 platforms
- Document findings and apply if beneficial

## Acceptance Criteria

- [ ] Research complete on which hooks benefit from async
- [ ] If adopted: hooks.json updated with async: true where appropriate
- [ ] Verified no race conditions with async execution
