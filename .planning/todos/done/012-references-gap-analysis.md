---
title: "Gap analysis: Towline references vs GSD references"
status: done
priority: P2
source: user-request
created: 2026-02-10
completed: 2026-02-10
---

## Goal

Review GSD's reference documents and identify what Towline needs to add or already covers.

## Reference Mapping

### GSD (13 references) → Towline (18 references)

| GSD Reference | Towline Equivalent | Coverage |
|--------------|-------------------|----------|
| checkpoints.md | checkpoints.md | Full |
| continuation-format.md | continuation-format.md | Full |
| decimal-phase-calculation.md | *(inline in plan skill)* | Covered — logic is in /dev:plan insert |
| git-integration.md | git-integration.md | Full |
| git-planning-commit.md | commit-conventions.md | Full — Towline split into own file |
| model-profile-resolution.md | *(inline in config skill)* | Covered — model resolution in /dev:config |
| model-profiles.md | model-profiles.md | Full |
| phase-argument-parsing.md | skills/shared/phase-argument-parsing.md | Full — Towline moved to shared fragments |
| planning-config.md | planning-config.md | Full |
| questioning.md | questioning.md | Full |
| tdd.md | *(none)* | Gap — see below |
| ui-brand.md | ui-formatting.md | Full |
| verification-patterns.md | verification-patterns.md | Full |

### Towline-Only References (no GSD equivalent)

| Towline Reference | Purpose |
|------------------|---------|
| deviation-rules.md | Rules for executor deviations from plan |
| plan-format.md | PLAN.md structure specification |
| plan-authoring.md | Plan writing guidelines |
| reading-verification.md | How to verify artifacts when reading |
| stub-patterns.md | Detecting stubs vs real implementations |
| subagent-coordination.md | Multi-agent orchestration patterns |
| wave-execution.md | Parallel wave execution protocol |
| towline-rules.md | Condensed 83-rule reference |
| plugin-manifest.md | Plugin.json validator constraints |

## Gap Assessment

### The one gap: TDD reference

GSD has `tdd.md` — a TDD design philosophy reference (red-green-refactor cycle guidance). Towline doesn't have this. However:

- Towline's config already has `features.tdd: true/false` toggle
- The executor agent already mentions TDD when the feature is enabled
- A dedicated reference doc could improve TDD guidance consistency

**Priority**: Low. The executor handles TDD inline. A reference doc would be a nice-to-have for consistency but isn't blocking anything.

### Towline's Advantage

Towline has 18 references vs GSD's 13 — 9 reference docs that GSD doesn't have. The extras (deviation-rules, plan-format, plan-authoring, stub-patterns, wave-execution, subagent-coordination) represent Towline's deeper investment in codifying its execution patterns into reusable documents that agents load on demand.

## Acceptance Criteria

- [x] Complete mapping of GSD references to Towline references
- [x] Gap list — one minor gap (tdd.md), low priority
- [x] Notes on Towline-only references that represent additional depth
