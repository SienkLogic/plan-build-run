---
title: "Explore eval-driven development (EDD) concepts for verification"
status: pending
priority: P3
source: ecc-review
created: 2026-02-10
theme: verification
---

## Goal

Investigate incorporating pass@k and pass^k metrics into Towline's verification system for measuring reliability.

## Context

ECC's eval-harness skill treats evals as "unit tests of AI development":
- Capability evals: can it do something new?
- Regression evals: did changes break existing behavior?
- pass@k: at least 1 of k attempts succeeds (reliability)
- pass^k: all k attempts must succeed (consistency)
- Evals stored as first-class artifacts in `.claude/evals/`

Towline's verifier checks "did the build match the plan?" but doesn't formally measure reliability.

## Scope

- Research: how would pass@k metrics apply to Towline's gate checks?
- Could phase gates require pass^3 on all verification criteria?
- Could the verifier run multiple verification passes and report consistency?
- Document findings and decide if this adds value vs complexity

## Acceptance Criteria

- [ ] Research complete with recommendation (adopt/defer/reject)
- [ ] If adopted: metrics integrated into VERIFICATION.md template
