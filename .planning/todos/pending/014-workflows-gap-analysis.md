---
title: "Gap analysis: Towline workflow orchestration vs GSD workflows"
status: pending
priority: P2
source: user-request
created: 2026-02-10
---

## Goal

Review GSD's workflow files and identify what Towline needs to add or rebuild into its workflow and process.

## Research Source

- GSD workflows: https://github.com/gsd-build/get-shit-done/tree/main/get-shit-done/workflows
- Towline's workflow is defined across skills in `plugins/dev/skills/`

## Context

Towline doesn't have a separate `workflows/` directory — workflow logic lives inside SKILL.md files. This todo should assess whether GSD's workflow separation pattern has advantages Towline should adopt, or whether Towline's skill-embedded approach is sufficient.

## Tasks

1. Catalog all GSD workflow files with their purpose and orchestration logic
2. Map each GSD workflow to its Towline skill equivalent (if one exists)
3. Identify gaps — GSD workflows with no Towline counterpart
4. Assess the architectural question: should Towline adopt a separate workflows layer?
5. For workflow patterns we should add, note where they'd live (new skills, existing skills, or a new layer)
6. Check if any existing Towline skill orchestration needs upgrades based on GSD's workflow patterns

## Acceptance Criteria

- [ ] Complete mapping of GSD workflows to Towline skills
- [ ] Gap list with priority and rationale for each
- [ ] Architectural recommendation on workflow separation vs skill-embedded approach
- [ ] Recommendations for new or enhanced orchestration patterns
