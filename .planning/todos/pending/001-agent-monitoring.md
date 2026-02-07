---
title: Add agent progress monitoring for orchestrator
status: open
priority: P1
source: dogfood-testing
created: 2026-02-07
---

## Problem

During `/dev:begin` research phase, the orchestrator has no visibility into subagent progress. The only way to check is manually polling output files via `TaskOutput` with `block: false`, which returns raw JSON logs — not structured progress.

## Observed During

Running 4 parallel researchers in `/dev:begin`. User had to ask "still waiting?" because there's no progress feedback loop.

## Possible Approaches

- Structured progress events from subagents (e.g., "researching", "writing output", "done")
- Periodic status summary the orchestrator can display
- A callback or event pattern that lets the skill show progress inline
- Integration with the status line hook to show active agent count + phase

## Impact

Poor UX during any multi-agent operation (research, parallel execution, synthesis). User sits blind for 2-4 minutes with no feedback.
