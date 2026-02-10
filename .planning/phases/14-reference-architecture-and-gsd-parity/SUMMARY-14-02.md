---
phase: "14-reference-architecture-and-gsd-parity"
plan: "14-02"
status: "complete"
subsystem: "plugin references"
tags:
  - "documentation"
  - "reference-docs"
  - "gsd-parity"
requires: []
provides:
  - "plugins/dev/references/checkpoints.md: checkpoint type documentation"
  - "plugins/dev/references/git-integration.md: commit conventions, branching, hooks"
  - "plugins/dev/references/model-profiles.md: agent-to-model mapping and presets"
  - "plugins/dev/references/planning-config.md: config.json schema and field reference"
affects:
  - "plugins/dev/references/"
tech_stack:
  - "Markdown"
key_files:
  - "plugins/dev/references/checkpoints.md: documents 3 checkpoint types, continuation protocol, autonomous behavior"
  - "plugins/dev/references/git-integration.md: commit format, types, branching strategies, hook scripts"
  - "plugins/dev/references/model-profiles.md: agent default models, preset profiles, config usage"
  - "plugins/dev/references/planning-config.md: full config.json schema with defaults and behavioral effects"
key_decisions:
  - "planning-config.md exceeds 180-line target at 211 lines: comprehensive coverage of all config fields was prioritized over strict line count"
patterns:
  - "Reference doc structure: title, overview, tables for field documentation, cross-references to related docs"
metrics:
  duration_minutes: 5
  start_time: "2026-02-09T18:44:31Z"
  end_time: "2026-02-09T18:49:06Z"
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 4
  files_modified: 0
deferred: []
---

# Plan Summary: 14-02

## What Was Built

Created 4 new reference documents in `plugins/dev/references/` adapted from Towline's existing agent definitions, skill files, and configuration templates. These documents consolidate scattered knowledge into standalone, browsable references that agents and humans can consult independently.

The checkpoints reference documents all three checkpoint task types (human-verify, decision, human-action) with their executor behavior, plan format syntax, and continuation protocol. The git-integration reference consolidates commit conventions (previously in `skills/build/commit-conventions.md`) with branching strategies, hook scripts, and atomic commit rules into a single comprehensive document.

The model-profiles reference maps all 10 Towline agents to their default models and documents the 4 preset profiles (quality, balanced, budget, adaptive). The planning-config reference provides complete schema documentation for `config.json` including all fields, defaults, valid values, and behavioral effects.

## Task Results

| Task | Status | Commit | Files | Verify |
|------|--------|--------|-------|--------|
| 14-02-T1: Create checkpoints.md and git-integration.md | done | 1ed0967 | 2 | passed |
| 14-02-T2: Create model-profiles.md and planning-config.md | done | 2be6243 | 2 | passed |

## Key Implementation Details

- checkpoints.md (157 lines): Covers all 3 checkpoint types with executor behavior, plan format, autonomous vs non-autonomous distinction, continuation protocol, and implicit checkpoints (auth-gate, architectural deviation)
- git-integration.md (226 lines): Includes commit format, 7 commit types, special scopes (quick, planning, wip), commit points (1 task = 1 commit, TDD = 3), atomic rules, branching strategies, and all 8 hook scripts from hooks.json
- model-profiles.md (97 lines): Maps all 10 agents to defaults sourced from agent frontmatter, documents 4 preset profiles with rationale, covers per-agent config and valid model values
- planning-config.md (211 lines): Documents all sections of config.json (top-level, features, models, parallelization, planning, git, gates, safety) with field tables, defaults, and behavioral notes
- Cross-references between docs: model-profiles.md links to planning-config.md; git-integration.md referenced from planning-config.md; checkpoints.md references executor agent behavior

## Known Issues

None.

## Dependencies Provided

- `plugins/dev/references/checkpoints.md` -- standalone checkpoint type reference for agents and humans
- `plugins/dev/references/git-integration.md` -- consolidated git conventions reference (subsumes content from `skills/build/commit-conventions.md`)
- `plugins/dev/references/model-profiles.md` -- model selection guide for configuration
- `plugins/dev/references/planning-config.md` -- config.json field reference for all Towline settings
