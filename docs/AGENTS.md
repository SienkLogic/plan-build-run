# PBR Agents

PBR has 18 specialized agents at `plugins/pbr/agents/`. Each runs in a fresh `Task()` context with a clean 200k token window. Skills spawn agents via `subagent_type: "pbr:{name}"`.

---

## Researchers

### researcher

Research implementation approaches for phases. Follows source-hierarchy methodology with confidence levels. Reads codebase, external docs, and prior research to produce structured recommendations.

| Property | Value |
|----------|-------|
| Model | sonnet |
| Memory | project |
| Color | cyan |
| Spawned by | plan skill |
| Produces | Research findings in `.planning/research/` |

### ui-researcher

Analyzes existing UI patterns and generates design recommendations. Can visually inspect live pages via Chrome MCP tools.

| Property | Value |
|----------|-------|
| Model | inherit |
| Memory | none |
| Color | #E879F9 |
| Spawned by | ui-phase skill |
| Produces | UI pattern analysis and design recommendations |

### advisor-researcher

Researches a single decision area and produces a structured comparison table. Spawned during discuss-phase when a gray area needs deep research before the user can decide.

| Property | Value |
|----------|-------|
| Model | inherit |
| Memory | none |
| Color | #60A5FA |
| Spawned by | discuss skill (Step 4b) |
| Produces | 5-column comparison table with recommendation and sources |

---

## Planners

### planner

Creates executable phase plans with task breakdown, dependency analysis, wave assignment, and goal-backward verification. Also creates roadmaps for new projects.

| Property | Value |
|----------|-------|
| Model | inherit |
| Memory | project |
| Color | green |
| Spawned by | plan skill |
| Produces | `PLAN-{NN}.md` files with XML task definitions |

### roadmapper

Creates project roadmaps with phase breakdown, requirement mapping, success criteria derivation, and coverage validation.

| Property | Value |
|----------|-------|
| Model | inherit |
| Memory | none |
| Color | purple |
| Spawned by | begin skill |
| Produces | `ROADMAP.md` |

---

## Executors

### executor

Executes plan tasks with atomic commits, deviation handling (5 rules), checkpoint protocols, TDD support, and self-verification. Runs in an isolated git worktree.

| Property | Value |
|----------|-------|
| Model | inherit |
| Memory | project |
| Color | yellow |
| Isolation | worktree |
| Spawned by | build skill |
| Produces | `SUMMARY-{NN}.md`, committed code |

---

## Checkers & Verifiers

### plan-checker

Verifies plans will achieve phase goals before execution. Goal-backward analysis across 10 dimensions: goal coverage, task decomposition, dependency ordering, file scope, must-have clarity, verification commands, security, performance, CLAUDE.md compliance, REQ coverage.

| Property | Value |
|----------|-------|
| Model | inherit |
| Memory | project |
| Color | green |
| Spawned by | plan skill |
| Produces | Plan quality report with pass/fail per dimension |

### verifier

Goal-backward phase verification. Checks codebase reality against phase goals: file existence, substantiveness (not stubs), and wiring (imported and called). Runs in an isolated worktree.

| Property | Value |
|----------|-------|
| Model | inherit |
| Memory | project |
| Color | green |
| Isolation | worktree |
| Spawned by | review skill |
| Produces | `VERIFICATION.md` |

### integration-checker

Cross-phase integration and E2E flow verification. Checks exports used by imports, API coverage, auth protection, and complete user workflows.

| Property | Value |
|----------|-------|
| Model | sonnet |
| Memory | project |
| Color | blue |
| Spawned by | review skill |
| Produces | Integration report |

### nyquist-auditor

Fills Nyquist validation gaps by generating tests and verifying coverage for phase requirements. Named after the Nyquist sampling theorem -- tests must sample at least 2x the requirement frequency.

| Property | Value |
|----------|-------|
| Model | inherit |
| Memory | none |
| Color | #8B5CF6 |
| Spawned by | validate-phase skill |
| Produces | Test files, coverage report |

### ui-checker

Validates UI implementation against UI-SPEC.md design contracts across 6 dimensions with visual verification via Chrome.

| Property | Value |
|----------|-------|
| Model | inherit |
| Memory | none |
| Color | #F472B6 |
| Spawned by | ui-review skill |
| Produces | UI validation report |

---

## Mappers

### codebase-mapper

Explores existing codebases and writes structured analysis. Four focus areas: tech stack, architecture, code quality, and concerns.

| Property | Value |
|----------|-------|
| Model | sonnet |
| Memory | none |
| Color | cyan |
| Spawned by | scan skill |
| Produces | `.planning/codebase/` analysis docs |

### intel-updater

Analyzes codebase and writes structured intel files. Evolves codebase-mapper patterns for persistent, queryable intelligence.

| Property | Value |
|----------|-------|
| Model | sonnet |
| Memory | none |
| Color | cyan |
| Spawned by | intel skill |
| Produces | `.planning/intel/` files |

---

## Debuggers

### debugger

Systematic debugging using the scientific method. Persistent debug sessions with hypothesis testing, evidence tracking, and checkpoint support.

| Property | Value |
|----------|-------|
| Model | inherit |
| Memory | project |
| Color | orange |
| Spawned by | debug skill |
| Produces | `.planning/debug/` session files |

---

## Utility

### general

Lightweight PBR-aware agent for ad-hoc tasks that don't fit specialized roles.

| Property | Value |
|----------|-------|
| Model | inherit |
| Memory | project |
| Color | cyan |
| Spawned by | quick, do skills |
| Produces | Varies by task |

### synthesizer

Fast synthesis of multiple research or team outputs into coherent recommendations. Resolves contradictions between sources.

| Property | Value |
|----------|-------|
| Model | haiku |
| Memory | none |
| Color | purple |
| Spawned by | plan, review skills (team mode) |
| Produces | Combined recommendations |

### audit

Analyzes Claude Code session logs for PBR workflow compliance, hook firing, state file hygiene, and UX quality. Covers ~88 dimensions across 9 categories.

| Property | Value |
|----------|-------|
| Model | inherit |
| Memory | project |
| Color | #8B5CF6 |
| Spawned by | audit skill |
| Produces | `.planning/audits/` reports |

### dev-sync

Syncs PBR plugin changes to cursor-pbr and copilot-pbr derivatives with format adjustments. Currently suspended.

| Property | Value |
|----------|-------|
| Model | inherit |
| Memory | none |
| Color | blue |
| Spawned by | manual |
| Produces | Derivative plugin updates |

---

## Agent Properties Reference

| Property | Values | Description |
|----------|--------|-------------|
| `model` | `sonnet`, `opus`, `haiku`, `inherit` | Which Claude model to use. `inherit` = caller's model |
| `memory` | `none`, `user`, `project` | Persistent memory scope across sessions |
| `isolation` | `worktree` | Run in isolated git worktree (prevents conflicts) |
| `color` | name or hex | Terminal output color for identification |
