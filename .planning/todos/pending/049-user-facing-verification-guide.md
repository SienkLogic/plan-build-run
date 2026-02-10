---
title: "Create user-facing verification guide"
status: pending
priority: P3
source: dev-guide-review
created: 2026-02-10
theme: documentation
---

## Goal

`references/verification-patterns.md` is excellent for agents but too technical for users. Users see verification reports and wonder why there are three layers, what gaps mean, and how to interpret recommendations.

## Changes

1. **`plugins/dev/references/reading-verification.md`** — Create user-facing guide covering:
   - What verification checks (existence, substantiveness, wiring layers)
   - How to read gap recommendations (must-have, failed layer, evidence, suggested fix)
   - When something is "verified" vs "needs human review"
   - Common gap types and what they mean
   - How to close gaps (re-run build, create gap-closure plan, manual fix)

## Acceptance Criteria

- [ ] Guide is written for users, not agents
- [ ] Covers all three verification layers in plain language
- [ ] Includes examples of common gap types
