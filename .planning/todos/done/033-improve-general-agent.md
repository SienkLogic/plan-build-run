---
title: "Improve towline-general agent with decision tree and examples"
status: pending
priority: P3
source: dev-guide-review
created: 2026-02-10
theme: agent-improvement
---

## Goal

`towline-general.md` is only 86 lines — minimal guidance. Add decision tree, common task examples, anti-patterns, and self-escalation guidance.

## Changes

1. **`plugins/dev/agents/towline-general.md`** — Add:
   - "When to Use This Agent" decision tree
   - "Common Ad-Hoc Tasks" examples
   - Anti-patterns section
   - Self-escalation: "If task requires >10 min or >30% context, suggest specialized agent"

## Acceptance Criteria

- [ ] Agent prompt expanded with guidance sections
- [ ] Validate plugin passes
