---
title: "Gap analysis: Towline templates vs GSD templates"
status: done
priority: P2
source: user-request
created: 2026-02-10
completed: 2026-02-10
---

## Goal

Review GSD's templates and identify what Towline needs to add or already covers.

## Template Mapping

### GSD (34 templates) → Towline (25 templates)

#### Core Templates

| GSD Template | Towline Equivalent | Coverage |
|-------------|-------------------|----------|
| config.json | *(inline in setup/begin skills)* | Covered — skills generate config directly |
| context.md | CONTEXT.md.tmpl | Full |
| continue-here.md | continue-here.md.tmpl | Full |
| DEBUG.md | DEBUG.md.tmpl | Full |
| discovery.md | discovery.md.tmpl | Full |
| milestone.md | milestone.md.tmpl | Full |
| milestone-archive.md | milestone-archive.md.tmpl | Full |
| phase-prompt.md | *(inline in plan skill)* | Covered — prompt construction in skill |
| planner-subagent-prompt.md | *(not needed)* | N/A — Towline uses subagent_type auto-loading |
| debug-subagent-prompt.md | *(not needed)* | N/A — Towline uses subagent_type auto-loading |
| project.md | *(inline in begin skill)* | Covered — begin generates PROJECT.md |
| requirements.md | *(inline in begin skill)* | Covered — begin generates REQUIREMENTS.md |
| roadmap.md | *(inline in begin skill)* | Covered — begin uses roadmap-prompt.md.tmpl |
| state.md | *(inline in begin skill)* | Covered — begin generates STATE.md |
| UAT.md | UAT.md.tmpl | Full |
| user-setup.md | USER-SETUP.md.tmpl | Full |
| verification-report.md | VERIFICATION.md.tmpl | Full |

#### Summary Templates

| GSD Template | Towline Equivalent | Coverage |
|-------------|-------------------|----------|
| summary.md | SUMMARY.md.tmpl | Full |
| summary-complex.md | *(not needed)* | Covered — Towline uses single summary template |
| summary-minimal.md | *(not needed)* | Covered — executor chooses detail level inline |
| summary-standard.md | *(not needed)* | Covered — single template is sufficient |

#### Codebase Templates (GSD: 7, Towline: 7)

| GSD Template | Towline Equivalent | Coverage |
|-------------|-------------------|----------|
| codebase/architecture.md | codebase/ARCHITECTURE.md.tmpl | Full |
| codebase/concerns.md | codebase/CONCERNS.md.tmpl | Full |
| codebase/conventions.md | codebase/CONVENTIONS.md.tmpl | Full |
| codebase/integrations.md | codebase/INTEGRATIONS.md.tmpl | Full |
| codebase/stack.md | codebase/STACK.md.tmpl | Full |
| codebase/structure.md | codebase/STRUCTURE.md.tmpl | Full |
| codebase/testing.md | codebase/TESTING.md.tmpl | Full |

#### Research Templates (GSD: 5, Towline: 5)

| GSD Template | Towline Equivalent | Coverage |
|-------------|-------------------|----------|
| research-project/ARCHITECTURE.md | research/ARCHITECTURE.md.tmpl | Full |
| research-project/FEATURES.md | research/FEATURES.md.tmpl | Full |
| research-project/PITFALLS.md | research/PITFALLS.md.tmpl | Full |
| research-project/STACK.md | research/STACK.md.tmpl | Full |
| research-project/SUMMARY.md | research/SUMMARY.md.tmpl | Full |

### Towline-Only Templates

| Towline Template | Purpose |
|-----------------|---------|
| PLAN.md.tmpl | Plan document structure |
| VERIFICATION-DETAIL.md.tmpl | Detailed verification report |
| INTEGRATION-REPORT.md.tmpl | Cross-phase integration report |

### Templates GSD has that Towline uses inline

| GSD Template | How Towline Handles It |
|-------------|----------------------|
| config.json | /dev:setup and /dev:begin generate it directly |
| project.md | /dev:begin generates PROJECT.md inline |
| requirements.md | /dev:begin generates REQUIREMENTS.md inline |
| roadmap.md | /dev:begin uses begin/templates/roadmap-prompt.md.tmpl |
| state.md | /dev:begin generates STATE.md inline |
| planner-subagent-prompt.md | Not needed — subagent_type auto-loads definitions |
| debug-subagent-prompt.md | Not needed — subagent_type auto-loads definitions |
| summary-complex/minimal/standard.md | Single SUMMARY.md.tmpl is sufficient |

## Gap Assessment

**No gaps.** Towline covers all GSD template functionality. The count difference (34 vs 25) is explained by:
1. GSD has 3 summary variants (complex/minimal/standard) — Towline uses 1
2. GSD has 2 subagent prompt templates — Towline doesn't need them (auto-loading)
3. GSD has 5 templates for state/roadmap/project/requirements/config — Towline generates these inline in skills

Towline has 3 templates GSD doesn't (PLAN.md, VERIFICATION-DETAIL.md, INTEGRATION-REPORT.md).

## Acceptance Criteria

- [x] Complete mapping of GSD templates to Towline templates
- [x] Gap list — no gaps found
- [x] Notes on architectural differences in template usage
