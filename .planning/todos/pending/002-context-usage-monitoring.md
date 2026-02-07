---
title: Monitor and display main session context usage
status: open
priority: P1
source: dogfood-testing
created: 2026-02-07
---

## Problem

During `/dev:begin` with comprehensive research (4 parallel researchers + synthesis), the main session hit 88% context usage. The orchestrator has no awareness of its own context budget — it can't warn the user or adapt behavior (e.g., switching to `depth: quick` mid-operation).

## Observed During

Running `/dev:begin` with `depth: comprehensive`. 4 researchers returned large output files, synthesis completed, but by the time we reached requirements scoping the main context was heavily loaded.

## Possible Approaches

- Status line hook showing current context % usage
- Skill-level budget estimation before spawning agents ("this operation will use ~X% of remaining context")
- Automatic depth downgrade when context is running low
- Better context isolation — the orchestrator is consuming too much context reading agent results; consider summarizing agent outputs before loading them into main context

## Impact

Context rot is the core problem Towline exists to solve. If the orchestrator itself suffers from context rot during `/dev:begin`, the tool is undermining its own value proposition.
