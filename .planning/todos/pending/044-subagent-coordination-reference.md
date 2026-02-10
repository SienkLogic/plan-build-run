---
title: "Create subagent coordination reference"
status: pending
priority: P2
source: dev-guide-review
created: 2026-02-10
theme: context-discipline
---

## Goal

8 skills (build, plan, begin, milestone, review, scan, quick, debug) spawn subagents with inline coordination docs. The pattern — read minimal state, spawn with structured input, read frontmatter output, update state — should be a shared reference.

## Changes

1. **`plugins/dev/references/subagent-coordination.md`** — Create reference covering:
   - When to spawn vs inline (>50 lines of analysis → spawn)
   - Structured input format for subagent prompts
   - Reading output: frontmatter only, never full files
   - Error handling: retryable vs fatal failures
   - Context budget impact of each coordination step

2. **Skills** — Replace inline coordination docs with reference link

## Estimated savings: ~30 lines per skill × 8 skills = ~240 lines

## Acceptance Criteria

- [ ] Reference covers full spawn→read→update lifecycle
- [ ] At least 3 skills updated to reference it
- [ ] No behavioral changes
