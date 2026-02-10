---
title: "Add atomic file writes for critical state files"
status: pending
priority: P3
source: ecc-review
created: 2026-02-10
theme: reliability
---

## Goal

Use write-to-temp + rename + backup/restore pattern for crash safety when writing critical state files.

## Context

ECC's session-aliases.js uses atomic writes: write to .tmp, rename over original, backup previous version, restore from backup on failure. Towline's STATE.md and config.json writes are direct, risking corruption on crash.

## Scope

- Add `atomicWrite(filePath, content)` function to `towline-tools.js`
- Pattern: write to `{file}.tmp`, rename over original, backup to `{file}.bak`
- On failure: restore from backup
- Apply to STATE.md, config.json, and ROADMAP.md writes in hook scripts
- Add tests for atomic write success and failure recovery

## Acceptance Criteria

- [ ] `atomicWrite` function exists in towline-tools.js
- [ ] Critical file writes use atomic pattern
- [ ] Backup/restore works on write failure
- [ ] Tests cover success, failure, and recovery paths
- [ ] Works on Windows (rename semantics differ)
