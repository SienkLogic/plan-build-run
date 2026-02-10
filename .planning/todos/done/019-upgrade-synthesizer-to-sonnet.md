---
title: "Upgrade synthesizer agent from haiku to sonnet"
status: pending
priority: P1
source: dev-guide-review
created: 2026-02-10
theme: agent-improvement
---

## Goal

The synthesizer resolves contradictions between research sources — this requires reasoning, not speed. Haiku may produce shallow resolutions that cascade to bad planning decisions.

## Changes

1. **`plugins/dev/agents/towline-synthesizer.md`** — Change `model: haiku` to `model: sonnet`

## Acceptance Criteria

- [ ] Model field updated
- [ ] Validate plugin passes
