---
title: "Research: multi-model orchestration patterns"
status: pending
priority: P4
source: ecc-review
created: 2026-02-10
theme: research
---

## Goal

Research multi-model orchestration patterns for potential future Towline capabilities.

## Context

ECC has a full multi-model system (CCG):
- Codex for backend logic/algorithms
- Gemini for frontend UI/UX
- Claude as orchestrator/sovereign (all file writes go through Claude)
- "Dirty prototype refactoring" — external models produce prototypes, Claude refactors to production quality
- Trust routing: backend decisions trust Codex, frontend decisions trust Gemini
- Session reuse across phases

## Scope

- Research: Which Towline workflows would benefit from multi-model?
- Research: How would trust-routing work in Towline's phase system?
- Research: What is the cost/latency impact of multi-model calls?
- Document findings for future consideration

## Acceptance Criteria

- [ ] Research document with feasibility assessment
- [ ] Clear recommendation on if/when to pursue
