---
title: "Gap analysis: Towline agents vs GSD agents"
status: pending
priority: P2
source: user-request
created: 2026-02-10
---

## Goal

Review GSD's agents and identify what Towline needs to add or rebuild. Focus on agents that fill gaps in Towline's current workflow.

## Known Gaps (Likely Needed)

- **Towline Phase Checker** — Validates phase readiness/completion (distinct from plan-checker)
- **Towline Phase Researcher** — Researches how to implement a specific phase before planning
- **Towline Roadmapper** — Creates project roadmaps with phase breakdown and requirement mapping

## Research Source

- GSD agents: https://github.com/gsd-build/get-shit-done/tree/main/agents
- Towline's existing agents: `plugins/dev/agents/` (10 agents currently)

## Current Towline Agents

1. towline-researcher
2. towline-planner
3. towline-plan-checker
4. towline-executor
5. towline-verifier
6. towline-integration-checker
7. towline-debugger
8. towline-codebase-mapper
9. towline-synthesizer
10. towline-general

## Tasks

1. Catalog all GSD agents with their purpose and capabilities
2. Map each GSD agent to its Towline equivalent (if one exists)
3. Identify gaps — GSD agents with no Towline counterpart
4. For each gap, assess whether Towline needs it or can cover the functionality differently
5. For agents we should add, note what skills would spawn them and how they fit the workflow
6. Check if any existing Towline agents need capability upgrades based on GSD's versions

## Acceptance Criteria

- [ ] Complete mapping of GSD agents to Towline agents
- [ ] Gap list with priority and rationale for each
- [ ] Draft agent frontmatter for any new agents recommended
- [ ] Notes on which skills need updating to spawn new agents
