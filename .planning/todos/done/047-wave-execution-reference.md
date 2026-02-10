---
title: "Create wave execution reference"
status: pending
priority: P3
source: dev-guide-review
created: 2026-02-10
theme: context-discipline
---

## Goal

The build skill contains ~60 lines explaining wave-based execution (dependency-driven parallelization, wave numbering, git lock retries). This is useful context for users reading PLAN.md files too.

## Changes

1. **`plugins/dev/references/wave-execution.md`** — Create reference covering:
   - What waves are (dependency groupings)
   - How wave numbers are assigned from plan `depends_on` fields
   - Parallel execution within a wave (config controls)
   - Sequential execution across waves
   - Git lock conflict handling and retry logic
   - Config fields: `parallelization.*`

2. **`plugins/dev/skills/build/SKILL.md`** — Replace inline wave docs with reference

## Estimated savings: ~60 lines from build skill

## Acceptance Criteria

- [ ] Wave execution reference is standalone and complete
- [ ] Build skill references it instead of inlining
- [ ] No behavioral changes
