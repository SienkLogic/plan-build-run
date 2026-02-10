---
title: "Gap analysis: Towline workflows vs GSD workflows"
status: done
priority: P2
source: user-request
created: 2026-02-10
completed: 2026-02-10
---

## Goal

Review GSD's workflow files and identify what Towline needs to add or already covers differently.

## Architectural Difference

GSD separates **commands** (28 files in `commands/gsd/`) from **workflows** (30 files in `get-shit-done/workflows/`). Commands are thin dispatchers; workflows contain the orchestration logic. Some workflows are sub-workflows called by other workflows (e.g., `execute-plan.md` is called by `execute-phase.md`).

Towline uses a **unified skill model**: each `skills/{name}/SKILL.md` is both the command entry point and the orchestration logic. No separate workflow layer exists.

## Workflow Mapping

### GSD (30 workflows) → Towline (21 skills)

| GSD Workflow | Towline Equivalent | Coverage |
|-------------|-------------------|----------|
| add-phase.md | plan skill (add subcommand) | Full |
| add-todo.md | todo skill | Full |
| audit-milestone.md | milestone skill (audit subcommand) | Full |
| check-todos.md | todo skill (list subcommand) | Full |
| complete-milestone.md | milestone skill (complete subcommand) | Full |
| diagnose-issues.md | health skill | Full — Towline's health does self-diagnosis |
| discovery-phase.md | explore skill | Partial — explore is broader, less structured |
| discuss-phase.md | discuss skill | Full |
| execute-phase.md | build skill | Full |
| execute-plan.md | *(sub-workflow of build)* | Covered — build handles per-plan execution inline |
| help.md | help skill | Full |
| insert-phase.md | plan skill (insert subcommand) | Full |
| list-phase-assumptions.md | plan skill (--assumptions flag) | Full |
| map-codebase.md | scan skill | Full |
| new-milestone.md | milestone skill (new subcommand) | Full |
| new-project.md | begin skill | Full |
| pause-work.md | pause skill | Full |
| plan-milestone-gaps.md | plan skill (--gaps flag) | Full |
| plan-phase.md | plan skill | Full |
| progress.md | status skill | Full |
| quick.md | quick skill | Full |
| remove-phase.md | plan skill (remove subcommand) | Full |
| research-phase.md | plan skill (research step) | Covered — research is built into plan |
| resume-project.md | resume skill | Full |
| set-profile.md | config skill (model-profile subcommand) | Full |
| settings.md | config skill | Full |
| transition.md | *(inline in skills)* | Covered — transition logic embedded in skills |
| update.md | *(none)* | N/A — Towline uses git pull, not npm update |
| verify-phase.md | *(sub-workflow of review)* | Covered — review handles verification inline |
| verify-work.md | review skill | Full |

### Towline-Only Skills

| Towline Skill | Purpose | GSD Equivalent |
|--------------|---------|---------------|
| continue | Auto-execute next logical step | None |
| explore | Freeform idea exploration and routing | Closest: discovery-phase (less flexible) |
| import | Import external plan documents | None |
| note | Zero-friction idea capture | None |
| setup | Interactive onboarding wizard | None |
| health | Planning directory integrity check | Closest: diagnose-issues |

## Gap Assessment

**No functional gaps.** GSD's 30 workflows map cleanly to Towline's 21 skills. The count difference comes from:

1. **Sub-workflows** (3): `execute-plan.md`, `transition.md`, `verify-phase.md` — GSD splits these out as separate files; Towline handles them as sections within the parent skill
2. **Distribution workflows** (3): `update.md`, `set-profile.md`, `resume-project.md` — GSD needs separate files for npm package management; Towline consolidates into config/resume skills
3. **Structural redundancy** (3): GSD has both `research-phase.md` and research as part of `plan-phase.md`; `discovery-phase.md` overlaps with `discuss-phase.md`

### Towline's consolidated approach

GSD: 28 commands + 30 workflows = 58 orchestration files
Towline: 21 commands + 21 skills = 42 orchestration files (28% fewer)

This consolidation isn't just about file count — it means each skill is self-contained. A developer reading `/dev:build` sees the complete orchestration in one file, rather than tracing through `execute-phase.md` → `execute-plan.md` → `transition.md`.

## Acceptance Criteria

- [x] Complete mapping of GSD workflows to Towline skills
- [x] Gap list — no functional gaps
- [x] Analysis of architectural differences (unified skills vs command+workflow split)
