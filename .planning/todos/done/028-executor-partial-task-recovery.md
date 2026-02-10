---
title: "Add partial task recovery to executor agent"
status: pending
priority: P2
source: dev-guide-review
created: 2026-02-10
theme: agent-improvement
---

## Goal

If executor crashes mid-task, everything restarts from scratch, wasting 5+ minutes re-executing completed tasks.

## Changes

1. **`plugins/dev/agents/towline-executor.md`** — Write `.PROGRESS-{plan_id}` file after each task (task number, last commit, timestamp). Delete when SUMMARY.md written.
2. **`plugins/dev/skills/build/SKILL.md`** — On resume, detect `.PROGRESS-{plan_id}` without SUMMARY and offer retry from last task or restart.

## Acceptance Criteria

- [ ] Executor writes progress file after each completed task
- [ ] Progress file deleted on SUMMARY.md write
- [ ] Build skill detects orphaned progress files and offers resume
