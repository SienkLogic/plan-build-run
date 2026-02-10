---
title: "Add contexts for behavioral mode switching"
status: pending
priority: P3
source: ecc-review
created: 2026-02-10
theme: ux
---

## Goal

Create context files that define different behavioral modes (dev, research, review) so Claude's approach changes based on the current phase of work.

## Context

ECC has 3 context files in `contexts/`:
- dev.md: Write code first, favor Edit/Write/Bash
- research.md: Read widely, do NOT write code until understanding is clear
- review.md: Read thoroughly, prioritize by severity, suggest fixes

Towline's skills implicitly set behavior but there's no explicit mode switch.

## Scope

- Create `contexts/dev.md` — active development mode
- Create `contexts/research.md` — exploration/understanding mode
- Create `contexts/review.md` — code review mode
- Skills like `/dev:build` could auto-activate dev context
- Skills like `/dev:discuss` could auto-activate research context
- Skills like `/dev:review` could auto-activate review context

## Acceptance Criteria

- [ ] Three context files exist with clear behavioral guidelines
- [ ] Context switching is documented in help
- [ ] Skills reference appropriate contexts
