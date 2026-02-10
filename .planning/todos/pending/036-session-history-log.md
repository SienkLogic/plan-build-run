---
title: "Add session history log in SessionEnd hook"
status: pending
priority: P3
source: dev-guide-review
created: 2026-02-10
theme: session-continuity
---

## Goal

No record of what happened in each session. Add session summary logging for diagnostics and productivity tracking.

## Changes

1. **`plugins/dev/scripts/session-cleanup.js`** — Write session summary to `.planning/logs/sessions.jsonl`:
   ```json
   { "start": "...", "end": "...", "duration_minutes": 120, "commands_run": [...], "agents_spawned": 6, "commits_created": 8 }
   ```

## Acceptance Criteria

- [ ] Session summary written on SessionEnd
- [ ] Log includes duration, commands, agents, commits
- [ ] Log file capped (max 100 entries)
