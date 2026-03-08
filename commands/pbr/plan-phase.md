---
name: gsd:plan-phase
description: Create detailed phase plan (PLAN.md) with verification loop
argument-hint: "[phase] [--auto] [--research] [--skip-research] [--gaps] [--skip-verify] [--prd <file>]"
agent: pbr-planner
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Task
  - WebFetch
  - mcp__context7__*
---
<objective>
Create executable phase prompts (PLAN.md files) for a roadmap phase with integrated research and verification.

**Default flow:** Research (if needed) → Plan → Verify → Done

**Orchestrator role:** Parse arguments, validate phase, research domain (unless skipped), spawn pbr-planner, verify with pbr-plan-checker, iterate until pass or max iterations, present results.
</objective>

<execution_context>
@~/.claude/plan-build-run/workflows/plan-phase.md
@~/.claude/plan-build-run/references/ui-brand.md
</execution_context>

<context>
Phase number: $ARGUMENTS (optional — auto-detects next unplanned phase if omitted)

**Flags:**
- `--research` — Force re-research even if RESEARCH.md exists
- `--skip-research` — Skip research, go straight to planning
- `--gaps` — Gap closure mode (reads VERIFICATION.md, skips research)
- `--skip-verify` — Skip verification loop
- `--prd <file>` — Use a PRD/acceptance criteria file instead of discuss-phase. Parses requirements into CONTEXT.md automatically. Skips discuss-phase entirely.

Normalize phase input in step 2 before any directory lookups.
</context>

<process>
Execute the plan-phase workflow from @~/.claude/plan-build-run/workflows/plan-phase.md end-to-end.
Preserve all workflow gates (validation, research, planning, verification loop, routing).
</process>
