---
title: "Plan skill: read dependency SUMMARYs as frontmatter only"
status: pending
priority: P3
source: dev-guide-review
created: 2026-02-10
theme: context-discipline
---

## Goal

Plan skill reads full SUMMARY bodies for direct dependencies. Planner only needs provides, key_decisions, patterns from frontmatter — not task-by-task logs.

## Changes

1. **`plugins/dev/skills/plan/SKILL.md`** — Change digest-select depth: direct deps get frontmatter + "Key Decisions" section only, not full body

## Estimated savings: 2,000-5,000 tokens per phase plan cycle.

## Acceptance Criteria

- [ ] Direct dependency reads limited to frontmatter + key sections
- [ ] Planner agent still produces quality plans (reads full files from disk if needed)
