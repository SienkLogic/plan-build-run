---
title: "Auto-reconcile STATE.md against filesystem on resume"
status: pending
priority: P3
source: dev-guide-review
created: 2026-02-10
theme: state-reliability
---

## Goal

If a skill crashes mid-operation, STATE.md reflects pre-crash state. Resume and status skills should reconcile STATE.md against filesystem reality (SUMMARY.md files, git log, etc.) and auto-repair.

## Changes

1. **`plugins/dev/skills/resume/SKILL.md`** — Step 1: auto-repair corrupted STATE.md by scanning filesystem
2. **`plugins/dev/skills/status/SKILL.md`** — Detect and warn about discrepancies

## Acceptance Criteria

- [ ] Resume auto-repairs corrupted STATE.md
- [ ] Status detects discrepancies and warns
- [ ] Repair logged to events.jsonl
