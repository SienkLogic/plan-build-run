---
title: "Research: instinct-based continuous learning system"
status: pending
priority: P4
source: ecc-review
created: 2026-02-10
theme: research
---

## Goal

Research whether an instinct-based learning system (inspired by ECC's continuous-learning-v2) would add value to Towline.

## Context

ECC's most innovative concept: atomic "instincts" (learned behaviors) with:
- Confidence scores (0.3-0.9) that increase with confirmation, decay when contradicted
- Trigger conditions and domain tags
- Evidence trails linking back to observations
- Evolution pipeline: instincts cluster into skills/commands/agents via `/evolve`
- Hooks observe every tool call to observations.jsonl

This is a self-improving system but adds significant complexity.

## Scope

- Research: What would a minimal instinct system look like for Towline?
- Research: What patterns would be worth learning? (commit conventions, file organization, test patterns)
- Research: Could this piggyback on existing session-cleanup or auto-continue hooks?
- Cost/benefit analysis: complexity added vs value gained
- Decision: adopt, defer, or reject

## Acceptance Criteria

- [ ] Research document with recommendation
- [ ] If adopted: design doc for minimal viable instinct system
