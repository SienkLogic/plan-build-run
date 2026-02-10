---
title: "Gap analysis: Towline commands/skills vs GSD commands"
status: pending
priority: P2
source: user-request
created: 2026-02-10
---

## Goal

Review GSD's commands and identify what Towline needs to add or rebuild as skills/commands.

## Research Source

- GSD commands: https://github.com/gsd-build/get-shit-done/tree/main/commands/gsd
- Towline's existing skills: `plugins/dev/skills/` (20 skills currently)

## Current Towline Skills

begin, build, config, continue, debug, discuss, explore, health, help, import, milestone, note, pause, plan, quick, resume, review, scan, status, todo

## Tasks

1. Catalog all GSD commands with their purpose and usage
2. Map each GSD command to its Towline skill equivalent (if one exists)
3. Identify gaps — GSD commands with no Towline counterpart
4. For each gap, assess whether Towline needs it or handles it differently
5. For commands we should add, draft the skill concept (name, purpose, workflow)
6. Check if any existing Towline skills need capability upgrades based on GSD's versions

## Acceptance Criteria

- [ ] Complete mapping of GSD commands to Towline skills
- [ ] Gap list with priority and rationale for each
- [ ] Recommendations for new skills with brief workflow descriptions
- [ ] Notes on existing skills that need enhancement
