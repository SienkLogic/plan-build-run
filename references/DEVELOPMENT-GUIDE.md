# Towline Development Guide

This document describes how to develop **Towline itself** — the workflow patterns, architectural decisions, conventions, and anti-patterns for contributing to the Towline Claude Code plugin.

**Audience**: Contributors to the Towline codebase (human or AI).

**Scope**: This is NOT user documentation. For user-facing documentation, see `CLAUDE.md` in the repo root.

---

## Table of Contents

### Part 1: Towline Workflow Documentation
- [Workflow Overview](#workflow-overview)
- [Full Lifecycle Map](#full-lifecycle-map)
- [Skill Invocation Graph](#skill-invocation-graph)
- [Agent Spawning Map](#agent-spawning-map)
- [State Transitions](#state-transitions)
- [Hook Firing Sequence](#hook-firing-sequence)
- [Decision Points](#decision-points)
- [Data Flow Diagram](#data-flow-diagram)
- [Error and Recovery Paths](#error-and-recovery-paths)

### Part 2: Development Conventions
- [Project Structure](#project-structure)
- [Commit Format](#commit-format)
- [File Naming Conventions](#file-naming-conventions)
- [Directory Structure](#directory-structure)
- [Hook Development Rules](#hook-development-rules)
- [Skill Authoring Patterns](#skill-authoring-patterns)
- [Agent Authoring Patterns](#agent-authoring-patterns)
- [Template Conventions](#template-conventions)
- [Testing Requirements](#testing-requirements)
- [Context Budget Discipline](#context-budget-discipline)
- [State Management](#state-management)
- [Cross-Platform Compatibility](#cross-platform-compatibility)
- [CI Requirements](#ci-requirements)
- [Development Gotchas](#development-gotchas)
- [Anti-Patterns](#anti-patterns)

---

# Part 1: Towline Workflow Documentation

## Workflow Overview

Towline is a structured development workflow for Claude Code that solves **context rot** through disciplined subagent delegation, file-based state management, and goal-backward verification.

**Core principle**: The main Claude session (orchestrator) stays lean (~15% context usage) by delegating heavy work to Task() subagents. Each subagent gets a fresh 200k token context window.

**Communication mechanism**: Skills and agents communicate through files on disk, not through messages. Every workflow artifact is written to `.planning/` and read by subsequent skills.

**User entry points**: Users invoke `/dev:*` slash commands (skills) that orchestrate specialized agents.

---

## Full Lifecycle Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PROJECT INITIALIZATION                      │
└─────────────────────────────────────────────────────────────────────┘

/dev:begin
  ├─ Step 1: Detect brownfield (inline)
  ├─ Step 2: Deep questioning (inline)
  │    └─ Reference: references/questioning.md
  ├─ Step 3: Workflow preferences (inline)
  │    ├─ Mode: interactive/autonomous
  │    ├─ Depth: quick/standard/comprehensive
  │    └─ Features: tdd_mode, parallelization, etc.
  ├─ Step 4: Research (delegate to 4 towline-researcher agents in parallel)
  │    ├─ Stack research → .planning/research/STACK.md
  │    ├─ Features research → .planning/research/FEATURES.md
  │    ├─ Architecture research → .planning/research/ARCHITECTURE.md
  │    └─ Pitfalls research → .planning/research/PITFALLS.md
  ├─ Step 5: Requirements scoping (spawn towline-synthesizer)
  │    └─ Write .planning/REQUIREMENTS.md
  ├─ Step 6: Roadmap generation (spawn towline-planner)
  │    └─ Write .planning/ROADMAP.md
  ├─ Step 7: Gate check (if confirm_roadmap: true)
  ├─ Step 8: Initialize state (inline)
  │    ├─ Create .planning/STATE.md
  │    ├─ Create .planning/config.json
  │    ├─ Create .planning/PROJECT.md
  │    ├─ Create phase directories: .planning/phases/{NN}-{slug}/
  │    └─ Git commit: docs(planning): initialize project structure
  └─ Step 9: Next up routing
       └─ Suggest: /dev:plan 1, /dev:discuss 1, or /dev:explore

┌─────────────────────────────────────────────────────────────────────┐
│                         IDEA EXPLORATION (OPTIONAL)                 │
└─────────────────────────────────────────────────────────────────────┘

/dev:explore [topic]
  ├─ Load project context (if .planning/ exists)
  ├─ Socratic conversation (inline)
  │    ├─ Surface implications and trade-offs
  │    ├─ Challenge with alternatives
  │    ├─ Optional mid-conversation research (spawn towline-researcher)
  │    └─ Help user think through what they actually want
  └─ Route insights:
       ├─ /dev:todo create → capture as a todo
       ├─ Append to NOTES.md → record for later
       ├─ Append to REQUIREMENTS.md → commit as a requirement
       ├─ Append to CONTEXT.md → lock as a decision
       └─ /dev:discuss <N> → continue with phase-specific discussion

┌─────────────────────────────────────────────────────────────────────┐
│                         PHASE DISCUSSION (OPTIONAL)                 │
└─────────────────────────────────────────────────────────────────────┘

/dev:discuss <N>
  ├─ Load phase context from ROADMAP.md
  ├─ Spawn towline-synthesizer in conversational mode
  │    ├─ Surface discretion areas (planner needs guidance)
  │    ├─ Surface assumptions (sanity check before planning)
  │    └─ Capture locked decisions and deferred ideas
  ├─ Write .planning/phases/{NN}-{slug}/CONTEXT.md
  └─ Next up: /dev:plan <N>

┌─────────────────────────────────────────────────────────────────────┐
│                         PHASE PLANNING                              │
└─────────────────────────────────────────────────────────────────────┘

/dev:plan <N> [--skip-research] [--assumptions] [--gaps]
  ├─ Step 1: Parse and validate (inline)
  │    ├─ Check phase exists in ROADMAP.md
  │    ├─ Check phase directory exists
  │    └─ Warn if CONTEXT.md missing (suggest /dev:discuss first)
  ├─ Step 2: Load context (inline)
  │    ├─ Read ROADMAP.md (phase goal)
  │    ├─ Read REQUIREMENTS.md (mapped requirements)
  │    ├─ Read CONTEXT.md (locked decisions)
  │    ├─ Read phases/{NN}-{slug}/CONTEXT.md (phase-specific context)
  │    ├─ Read research/SUMMARY.md or individual research files
  │    └─ Read dependency SUMMARY.md files (digest-select depth)
  ├─ Step 3: Research (if not --skip-research and research_phase: true)
  │    └─ Spawn towline-researcher → .planning/phases/{NN}-{slug}/RESEARCH.md
  ├─ Step 4: Generate plans (spawn towline-planner)
  │    ├─ Planner reads: ROADMAP, REQUIREMENTS, CONTEXT, RESEARCH
  │    ├─ Planner writes: PLAN.md files (one per plan)
  │    └─ Each PLAN.md: YAML frontmatter + XML tasks
  ├─ Step 5: Plan checking (if plan_checking: true)
  │    └─ Spawn towline-plan-checker for each PLAN.md
  │         └─ Verify: completeness, must-haves coverage, dependencies
  ├─ Step 6: Gate check (if confirm_plan: true)
  │    └─ Display plan summaries, ask user to approve
  └─ Step 7: Next up routing
       └─ Suggest: /dev:build <N>

┌─────────────────────────────────────────────────────────────────────┐
│                         PHASE BUILD                                 │
└─────────────────────────────────────────────────────────────────────┘

/dev:build <N>
  ├─ Step 1: Validate (inline)
  │    ├─ Check PLAN.md files exist
  │    ├─ Check all dependencies complete (have SUMMARY.md)
  │    └─ Parse wave structure from PLAN.md frontmatter
  ├─ Step 2: Gate check (if confirm_execute: true)
  ├─ Step 3: Execute waves (sequential, one wave at a time)
  │    └─ For each wave:
  │         ├─ If parallelization.enabled and plans >= min_plans_for_parallel:
  │         │    └─ Spawn executor agents in parallel (up to max_concurrent_agents)
  │         └─ Else:
  │              └─ Spawn executor agents sequentially
  │
  │         Each executor agent (towline-executor):
  │         ├─ Read PLAN.md
  │         ├─ For each task:
  │         │    ├─ Execute <action>
  │         │    ├─ Run <verify>
  │         │    ├─ If verify passes: commit (atomic commit, one per task)
  │         │    ├─ If verify fails: apply deviation rules
  │         │    └─ If checkpoint: STOP and return
  │         ├─ Write SUMMARY.md (task results, files modified, commits)
  │         └─ Run self-check
  ├─ Step 4: Integration check (if integration_verification: true)
  │    └─ Spawn towline-integration-checker
  │         ├─ Read all SUMMARY.md files in phase
  │         ├─ Verify cross-plan integration points
  │         └─ Write INTEGRATION-REPORT.md
  ├─ Step 5: Commit planning docs (if commit_docs: true)
  │    └─ git commit -m "docs({phase}): add build summaries and verification"
  └─ Step 6: Next up routing
       ├─ If goal_verification enabled: suggest /dev:review <N>
       └─ Else: suggest /dev:plan <N+1> or manual testing

┌─────────────────────────────────────────────────────────────────────┐
│                         PHASE VERIFICATION                          │
└─────────────────────────────────────────────────────────────────────┘

/dev:review <N> [--auto-fix]
  ├─ Step 1: Validate (inline)
  │    └─ Check phase has SUMMARY.md files
  ├─ Step 2: Spawn towline-verifier
  │    ├─ Read ROADMAP.md (phase goal)
  │    ├─ Read all PLAN.md files (must-haves)
  │    ├─ Read all SUMMARY.md files (what was built)
  │    ├─ Verify each must-have:
  │    │    ├─ Truths: run verification commands, check assertions
  │    │    ├─ Artifacts: check file existence, size, structure
  │    │    └─ Key links: grep for integration points
  │    └─ Write VERIFICATION.md (checklist format)
  ├─ Step 3: Parse verification result (inline)
  │    ├─ Count verified vs. failed must-haves
  │    └─ Determine pass/fail (100% required unless user accepts gaps)
  ├─ Step 4: Display result
  │    ├─ If all pass: "PHASE N COMPLETE ✓"
  │    └─ If gaps: "PHASE N GAPS FOUND ⚠" + gap summary
  ├─ Step 5: Auto-fix flow (if --auto-fix flag)
  │    └─ If gaps found:
  │         ├─ Spawn towline-debugger for root cause analysis
  │         ├─ Create gap-closure plans inline
  │         └─ Route to: /dev:build {N} --gaps-only
  └─ Step 6: Next up routing (if not auto-fix)
       ├─ If pass: suggest /dev:plan <N+1> or /dev:milestone
       └─ If gaps: suggest /dev:plan <N> --gaps (gap closure plans)

┌─────────────────────────────────────────────────────────────────────┐
│                         MILESTONE COMPLETION                        │
└─────────────────────────────────────────────────────────────────────┘

/dev:milestone [new|complete|audit|gaps]
  ├─ new: Start a new milestone cycle
  │    ├─ Mini roadmap session (condensed questioning)
  │    ├─ Spawn towline-planner to generate new phases
  │    ├─ Append phases to ROADMAP.md
  │    └─ Update STATE.md with new milestone
  ├─ complete: Manual acceptance testing
  │    └─ Display UAT checklist, ask user to confirm
  ├─ audit: Cross-phase verification
  │    ├─ Spawn towline-verifier for milestone-level checks
  │    ├─ Check all requirements mapped to phases are complete
  │    ├─ Check cross-phase integration points
  │    └─ Write .planning/MILESTONE.md
  └─ gaps: Create phases to close audit gaps
       ├─ Read most recent MILESTONE.md
       ├─ Extract failed requirements and integration issues
       ├─ Spawn towline-planner to generate gap-closure phases
       └─ Append to ROADMAP.md

┌─────────────────────────────────────────────────────────────────────┐
│                         UTILITY WORKFLOWS                           │
└─────────────────────────────────────────────────────────────────────┘

/dev:quick <task-description>
  ├─ Parse task description from arguments or ask user
  ├─ Validate scope (warn if too large for quick task)
  ├─ Generate slug and task number (NNN)
  ├─ Create .planning/quick/{NNN}-{slug}/ directory
  ├─ Write PLAN.md (1-3 tasks max, minimal structure)
  ├─ Spawn single towline-executor agent
  │    ├─ Execute tasks (code changes, tests, etc.)
  │    └─ Write SUMMARY.md
  ├─ Update STATE.md (increment quick_task_count)
  ├─ Commit: {type}(quick-{NNN}): {description}
  └─ Display completion summary

/dev:debug [<phase>] [--context] [--attach-llm]
  ├─ Scan for failing tests, error logs, broken builds
  ├─ Spawn towline-debugger
  ├─ Write .planning/DEBUG.md (root cause analysis)
  └─ Suggest fixes or create gap-closure plans

/dev:scan [--depth=quick|standard|deep]
  ├─ Analyze existing codebase (brownfield projects)
  ├─ Spawn 4x towline-codebase-mapper agents (parallel)
  ├─ Write 8 output files to .planning/codebase/:
  │    ├─ RECON.md — Initial reconnaissance (entry points, scale)
  │    ├─ STACK.md — Technology stack inventory
  │    ├─ INTEGRATIONS.md — External dependencies and APIs
  │    ├─ ARCHITECTURE.md — System architecture and patterns
  │    ├─ STRUCTURE.md — Directory structure and modules
  │    ├─ CONVENTIONS.md — Coding standards and patterns
  │    ├─ TESTING.md — Test coverage and strategy
  │    └─ CONCERNS.md — Technical debt and risks
  └─ Suggest: /dev:begin or /dev:import

/dev:import <source-doc>
  ├─ Parse existing roadmap/plan from doc
  ├─ Convert to Towline format
  └─ Write ROADMAP.md or PLAN.md files

/dev:status [--detail]
  ├─ Read STATE.md, ROADMAP.md, SUMMARY.md files
  ├─ Display progress table (phases, plans, tasks)
  └─ Show next recommended command

/dev:health
  ├─ Run 8 diagnostic checks:
  │    1. .planning/ structure
  │    2. State file integrity
  │    3. Roadmap consistency
  │    4. Git status
  │    5. Config validation
  │    6. Dependency chain
  │    7. File references
  │    8. Hook log check
  └─ Display health report with fixes

/dev:continue
  ├─ Resume from paused state
  ├─ Read STATE.md (last_activity, current phase/plan)
  └─ Route to appropriate next command

/dev:resume
  ├─ Similar to continue but handles checkpoint resumption
  └─ Read checkpoint metadata from SUMMARY.md

/dev:pause
  ├─ Save current progress to STATE.md
  ├─ Create continuation instructions
  └─ Write .planning/.continue-here

/dev:config [<key> <value>]
  ├─ Read or modify config.json
  ├─ Validate against schema
  └─ Write updated config.json

/dev:note <message>
  ├─ Append timestamped note to .planning/NOTES.md
  └─ Useful for tracking decisions, observations

/dev:todo [list|create|complete|remove]
  ├─ Manage .planning/todos/pending/ and .planning/todos/done/
  ├─ Todo format: YAML frontmatter + markdown body
  └─ Track P1/P2/P3 priorities

/dev:help [<skill-name>]
  └─ Display skill documentation
```

---

## Skill Invocation Graph

```
Skill-to-Skill Invocation Paths:

/dev:begin
  └─> suggests /dev:plan 1, /dev:discuss 1, or /dev:explore

/dev:explore [topic]
  ├─> routes to /dev:todo create (capture as todo)
  ├─> routes to NOTES.md (append note)
  ├─> routes to REQUIREMENTS.md (commit requirement)
  ├─> routes to CONTEXT.md (lock decision)
  └─> routes to /dev:discuss <N> (continue with phase discussion)

/dev:discuss <N>
  └─> suggests /dev:plan <N>

/dev:plan <N>
  └─> suggests /dev:build <N>

/dev:build <N>
  ├─> suggests /dev:review <N> (if goal_verification enabled)
  └─> suggests /dev:plan <N+1> (if goal_verification disabled)

/dev:review <N>
  ├─> suggests /dev:plan <N+1> (if phase passes)
  ├─> suggests /dev:plan <N> --gaps (if gaps found)
  └─> suggests /dev:milestone (if last phase)

/dev:milestone
  └─> suggests /dev:begin (for next milestone) or project complete

/dev:pause
  └─> creates .continue-here file with next command

/dev:continue / /dev:resume
  └─> reads .continue-here, routes to appropriate skill
      (UNIQUE: uses Skill() tool for direct invocation, not suggestions)

/dev:scan
  └─> suggests /dev:begin or /dev:import

/dev:import
  └─> suggests /dev:plan 1

/dev:debug
  └─> suggests /dev:build <N> or /dev:plan <N> --gaps

/dev:quick
  └─> standalone (no suggestions)

/dev:status, /dev:health, /dev:config, /dev:note, /dev:todo, /dev:help
  └─> standalone (informational/utility)
```

**Skills communicate through state, not direct invocation**, with one exception:

1. STATE.md updates (current phase, last activity)
2. Suggestion text in "Next Up" blocks
3. `.continue-here` files (for auto-continuation when auto_continue enabled)

**Exception**: `/dev:continue` uses the `Skill()` tool to directly invoke the next command (the only skill that does this). All other skills only suggest next commands.

---

## Agent Spawning Map

```
Skill              → Agents Spawned                      → Output Files
─────────────────────────────────────────────────────────────────────────────────
/dev:begin         → 4x towline-researcher (parallel)    → .planning/research/*.md
                   → towline-synthesizer                 → .planning/REQUIREMENTS.md
                   → towline-planner                     → .planning/ROADMAP.md

/dev:discuss       → towline-synthesizer                 → .planning/phases/{NN}/CONTEXT.md

/dev:plan          → towline-researcher (optional)       → .planning/phases/{NN}/RESEARCH.md
                   → towline-planner                     → .planning/phases/{NN}/PLAN-{MM}.md
                   → Nx towline-plan-checker (optional)  → Validation feedback (not saved)

/dev:build         → Nx towline-executor (sequential     → .planning/phases/{NN}/SUMMARY-{MM}.md
                      or parallel, per wave)             → Git commits (atomic, per task)

/dev:review        → towline-verifier                    → .planning/phases/{NN}/VERIFICATION.md

/dev:milestone     → towline-verifier (for audit)        → .planning/MILESTONE.md
                                                          → .planning/archive/{milestone}/SUMMARY.md
                   → towline-integration-checker         → .planning/phases/{NN}/INTEGRATION-REPORT.md
                      (optional, during audit)

/dev:scan          → 4x towline-codebase-mapper          → .planning/codebase/*.md (7 files)
                      (RECON.md written inline first)      → .planning/codebase/RECON.md

/dev:debug         → towline-debugger                    → .planning/debug/{NNN}-{slug}.md

/dev:quick         → towline-executor                    → .planning/quick/{NNN}-{slug}/SUMMARY.md

/dev:import        → towline-planner                     → .planning/ROADMAP.md or PLAN.md
                   → towline-synthesizer (optional)      → .planning/REQUIREMENTS.md

All other skills   → No agents (inline logic only)
```

### Agent Cross-Interactions

Some agents read output from other agents:

```
towline-planner reads:
  ← towline-researcher output (RESEARCH.md, STACK.md, etc.)
  ← towline-synthesizer output (REQUIREMENTS.md, CONTEXT.md)

towline-executor reads:
  ← towline-planner output (PLAN.md)
  ← towline-executor output from dependencies (SUMMARY.md)

towline-verifier reads:
  ← towline-planner output (PLAN.md must-haves)
  ← towline-executor output (SUMMARY.md)

towline-integration-checker reads:
  ← towline-executor output from multiple plans (SUMMARY.md)

towline-debugger reads:
  ← towline-executor output (SUMMARY.md, git log)
  ← towline-verifier output (VERIFICATION.md)
```

**Critical**: Agents never read other agent *definitions* (agents/*.md files). The `subagent_type: "dev:towline-{name}"` mechanism auto-loads agent definitions from disk. Main orchestrator never inlines agent prompts into Task() calls.

---

## State Transitions

### STATE.md Lifecycle

```
/dev:begin
  ├─ CREATE: .planning/STATE.md
  │    ├─ current_phase: 1
  │    ├─ status: "planning"
  │    ├─ progress: 0%
  │    └─ last_activity: timestamp

/dev:plan <N>
  ├─ UPDATE: STATE.md
  │    ├─ current_phase: N
  │    ├─ status: "planning"
  │    └─ last_activity: timestamp

/dev:build <N>
  ├─ UPDATE: STATE.md
  │    ├─ status: "building"
  │    └─ last_activity: timestamp
  └─ POST-BUILD UPDATE:
       ├─ status: "built" or "verification pending"
       └─ progress: updated based on phase completion

/dev:review <N>
  ├─ UPDATE: STATE.md
  │    ├─ status: "verifying"
  │    └─ last_activity: timestamp
  └─ POST-VERIFICATION UPDATE:
       ├─ status: "phase_complete" or "gaps_found"
       └─ progress: updated

/dev:milestone
  ├─ UPDATE: STATE.md
  │    ├─ milestone_history: append completed milestone
  │    └─ status: "milestone_complete"

/dev:pause
  ├─ UPDATE: STATE.md
  │    ├─ status: "paused"
  │    └─ last_activity: timestamp
  └─ CREATE: .planning/.continue-here (instruction file)

/dev:continue / /dev:resume
  ├─ UPDATE: STATE.md
  │    └─ status: resume prior status
  └─ DELETE: .planning/.continue-here
```

### ROADMAP.md Lifecycle

```
/dev:begin
  └─ CREATE: .planning/ROADMAP.md (initial phase structure)

/dev:plan add
  └─ APPEND: Add new phase to end of ROADMAP.md

/dev:plan insert <N>
  └─ INSERT: Add phase at position N, renumber subsequent phases

/dev:plan remove <N>
  └─ REMOVE: Delete phase, renumber subsequent phases

/dev:import
  └─ REPLACE: Overwrite ROADMAP.md with imported structure
```

### Checkpoint Manifest Lifecycle

```
/dev:build <N>
  ├─ CREATE: .checkpoint-manifest.json (per phase directory)
  ├─ UPDATE: after each wave (resolved plans, commits, wave counter)
  └─ READ: on resume to skip completed plans

/dev:session-cleanup (SessionEnd hook)
  └─ WARN: about stale checkpoint manifests (>24h old)
```

### PLAN.md Lifecycle

```
/dev:plan <N>
  └─ CREATE: .planning/phases/{NN}-{slug}/PLAN-{MM}.md (per plan)
       ├─ YAML frontmatter (metadata, must-haves)
       └─ XML tasks (executable specifications)

/dev:plan <N> --gaps
  └─ APPEND: Create additional PLAN-{MM}.md files (gap_closure: true)

/dev:build <N>
  └─ READ-ONLY: Executors read PLAN.md, never modify
```

### SUMMARY.md Lifecycle

```
/dev:build <N>
  └─ CREATE: .planning/phases/{NN}-{slug}/SUMMARY-{MM}.md (per plan)
       ├─ Frontmatter: plan_id, status, execution_time
       ├─ Task results (success/failure/checkpoint)
       ├─ Files modified
       ├─ Commits created
       └─ Issues encountered

Checkpoint continuation:
  └─ APPEND: Update SUMMARY.md with additional task results
```

### VERIFICATION.md Lifecycle

```
/dev:review <N>
  └─ CREATE: .planning/phases/{NN}-{slug}/VERIFICATION.md
       ├─ Must-have checklist (✓ verified / ✗ failed)
       ├─ Gap details (what's missing)
       └─ Score: X/Y must-haves verified

/dev:milestone audit
  └─ CREATE: .planning/MILESTONE.md (cross-phase verification)
```

### CONTEXT.md Lifecycle

```
/dev:begin
  └─ CREATE: .planning/CONTEXT.md (project-level locked decisions)

/dev:discuss <N>
  └─ CREATE: .planning/phases/{NN}-{slug}/CONTEXT.md (phase-level)
       ├─ Locked decisions
       ├─ Deferred ideas
       └─ Discretion areas
```

### config.json Lifecycle

```
/dev:begin
  └─ CREATE: .planning/config.json (workflow settings)

/dev:config <key> <value>
  └─ UPDATE: Modify specific config keys

Manual edit
  └─ UPDATE: Direct file modification (validated on next skill invocation)
```

---

## Hook Firing Sequence

Hooks are configured in `plugins/dev/hooks/hooks.json` and fire at specific lifecycle events.

### Session Lifecycle

```
SESSION START
  ├─ SessionStart hook fires
  │    └─ progress-tracker.js
  │         ├─ Reads STATE.md
  │         ├─ Injects project context into session
  │         └─ Logs to .planning/logs/hooks.jsonl
  │
  ├─ User invokes skill (/dev:plan 3)
  │
  ├─ Skill executes (orchestrator reads files, spawns agents)
  │
  ├─ PreToolUse hooks fire (before each tool call)
  │    ├─ For Bash tool:
  │    │    ├─ validate-commit.js
  │    │    │    ├─ Checks commit message format
  │    │    │    ├─ Blocks sensitive files
  │    │    │    └─ Exit 0 = allow, Exit 2 = block
  │    │    └─ check-dangerous-commands.js
  │    │         └─ Blocks destructive commands (rm -rf, force push, etc.)
  │    └─ For Write/Edit tools:
  │         ├─ check-skill-workflow.js (verify workflow rules)
  │         └─ check-phase-boundary.js (verify not editing future phases)
  │
  ├─ Tool executes (Read, Write, Edit, Bash, Task, etc.)
  │
  ├─ PostToolUse hooks fire (after each tool call)
  │    ├─ For Write/Edit tools:
  │    │    ├─ check-plan-format.js
  │    │    │    └─ Validates PLAN.md XML structure
  │    │    └─ check-roadmap-sync.js
  │    │         └─ Checks ROADMAP.md consistency
  │    ├─ For Read tool:
  │    │    └─ track-context-budget.js
  │    │         └─ Tracks context budget usage from file reads
  │    └─ For Task tool:
  │         └─ check-subagent-output.js
  │              └─ Validates agent output files exist and are non-empty
  │
  ├─ PostToolUseFailure hook fires (if tool errors)
  │    └─ log-tool-failure.js
  │         └─ Logs error to .planning/logs/hooks.jsonl and events.jsonl
  │
  ├─ SubagentStart hook fires (when Task() spawns agent)
  │    └─ log-subagent.js start
  │         └─ Logs agent spawn, injects project context
  │
  ├─ (Subagent executes in isolated context)
  │
  ├─ SubagentStop hook fires (when agent completes)
  │    └─ log-subagent.js stop
  │         └─ Logs agent completion with duration
  │
  ├─ PreCompact hook fires (if context limit approaching)
  │    └─ context-budget-check.js
  │         ├─ Reads STATE.md
  │         ├─ Preserves critical context
  │         └─ Logs compaction event
  │
  ├─ Stop hook fires (when skill completes)
  │    └─ auto-continue.js
  │         ├─ Checks if auto_continue enabled
  │         ├─ Reads .planning/.auto-next
  │         └─ Chains next command (if configured)
  │
  └─ SessionEnd hook fires
       └─ session-cleanup.js
            └─ Removes stale files: .auto-next, .active-operation, .active-skill

CONTEXT COMPACTION (if triggered)
  ├─ PreCompact fires → context-budget-check.js
  ├─ Claude Code compacts conversation history
  └─ SessionStart fires again (fresh context window)
       └─ progress-tracker.js re-injects project state
```

### Hook Exit Codes

```
Exit Code 0:
  ├─ PreToolUse: Allow the tool call to proceed
  └─ PostToolUse: Tool call succeeded, continue

Exit Code 2:
  ├─ PreToolUse: Block the tool call, return error to Claude
  └─ PostToolUse: Not used (PostToolUseFailure handles errors)

Any other exit code:
  └─ Treated as error, logged but does not block workflow
```

### Utility Scripts

Several utility scripts provide shared functionality for hook scripts and testing:

| Script | Purpose |
|--------|---------|
| `hook-logger.js` | Shared logging for all hooks. Exports `logHook()` function. Writes to `.planning/logs/hooks.jsonl` (JSONL format, 200-entry rotation). |
| `event-logger.js` | Workflow event logging. Exports `logEvent()` function. Writes to `.planning/logs/events.jsonl` (JSONL format, 1,000-entry rotation). |
| `towline-tools.js` | Shared CLI utilities. Exports `stateLoad()`, `configLoad()`, `planIndex()`, and other common functions used by multiple hook scripts. |
| `status-line.js` | Status bar formatting for terminal display. Generates colored status indicators and progress bars. |
| `local-llm.js` | Local LLM integration utilities. Handles communication with local LLM instances for offline operation. |
| `validate-plugin-structure.js` | Plugin directory validation. Used by `npm run validate`. Checks that all skills, agents, hooks, and templates are properly structured. |

**When to use which logger**:
- Use `logHook()` for hook execution auditing (e.g., commit validation, plan format checks)
- Use `logEvent()` for workflow-level event tracking (e.g., phase completion, milestone creation)

---

## Decision Points

The workflow branches at multiple decision points based on config toggles, user input, and state checks.

### Config-Driven Branches

```
features.research_phase
  ├─ true:  /dev:plan spawns researcher before planner
  └─ false: /dev:plan skips research, planner uses prior research only

features.plan_checking
  ├─ true:  /dev:plan spawns plan-checker after planner
  └─ false: /dev:plan skips plan validation

features.goal_verification
  ├─ true:  /dev:build suggests /dev:review after execution
  └─ false: /dev:build suggests /dev:plan <N+1>

features.integration_verification
  ├─ true:  /dev:build spawns integration-checker after wave completion
  └─ false: /dev:build skips cross-plan checks

features.tdd_mode
  ├─ true:  Executors follow Red-Green-Refactor, 3 commits per task
  └─ false: Executors produce 1 commit per task

parallelization.enabled
  ├─ true:  /dev:build spawns multiple executors concurrently
  └─ false: /dev:build spawns executors sequentially

gates.confirm_roadmap
  ├─ true:  /dev:begin pauses for user approval before finalizing roadmap
  └─ false: /dev:begin auto-approves roadmap

gates.confirm_plan
  ├─ true:  /dev:plan pauses for user approval before finalizing plans
  └─ false: /dev:plan auto-approves plans

gates.confirm_execute
  ├─ true:  /dev:build pauses for user approval before execution
  └─ false: /dev:build auto-starts execution

gates.confirm_transition
  ├─ true:  After phase complete, pause before suggesting next phase
  └─ false: After phase complete, auto-suggest next phase

git.branching
  ├─ "none":      Work on current branch
  ├─ "phase":     Create branch per phase (towline/phase-{N}-{slug})
  ├─ "milestone": Create branch per milestone (towline/{version}-{slug})
  └─ "disabled":  No git operations at all

git.mode
  ├─ "enabled":  Run git commands normally
  └─ "disabled": Skip all git operations (no commits, no validation)

depth
  ├─ "quick":        Minimal research, 1-2 tasks per plan
  ├─ "standard":     Balanced research, 2-3 tasks per plan
  └─ "comprehensive": Deep research, 3+ tasks per plan
```

### State-Driven Branches

```
.planning/ exists?
  ├─ Yes: /dev:begin warns about overwrite
  └─ No:  /dev:begin proceeds

Existing code detected?
  ├─ Yes: /dev:begin suggests /dev:scan first
  └─ No:  /dev:begin proceeds to questioning

CONTEXT.md exists for phase?
  ├─ Yes: /dev:plan proceeds
  └─ No:  /dev:plan warns, suggests /dev:discuss first

PLAN.md files exist for phase?
  ├─ Yes: /dev:plan asks to re-plan or skip
  └─ No:  /dev:plan proceeds

All dependencies complete (have SUMMARY.md)?
  ├─ Yes: /dev:build proceeds
  └─ No:  /dev:build blocks with error

Phase verification passed?
  ├─ Yes: Suggest next phase
  └─ No:  Suggest gap closure plans

Last phase of milestone?
  ├─ Yes: Suggest /dev:milestone
  └─ No:  Suggest /dev:plan <N+1>

Checkpoint encountered during execution?
  ├─ Yes: Executor stops, returns checkpoint metadata
  └─ No:  Executor continues to next task

Authentication gate hit?
  ├─ Yes: Executor stops, returns AUTH-GATE checkpoint
  └─ No:  Executor continues
```

### User Input Branches

```
Gate approval:
  ├─ User says "approved" / "yes" / "looks good" → proceed
  ├─ User says "no" / "reject" → abort
  └─ User provides feedback → revise and re-present

Checkpoint verification:
  ├─ User says "approved" / "works" → continue to next task
  ├─ User describes issues → spawn debugger or revert
  └─ User says "skip" → mark task as manual, continue

Checkpoint decision:
  ├─ User selects option A/B/C → record decision, continue
  └─ User defers → pause, suggest /dev:note

Checkpoint human-action:
  ├─ User says "done" → continue to next task
  └─ User describes blockers → pause, suggest resolution

Verification gaps:
  ├─ User accepts gaps → mark phase complete anyway
  ├─ User requests fixes → run /dev:plan <N> --gaps
  └─ User wants to debug → run /dev:debug <N>
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ARTIFACT PIPELINE                                │
└─────────────────────────────────────────────────────────────────────┘

User conversation
  └─> /dev:begin

      Deep questioning (inline)
        └─> Conversation context (in memory)

      Research phase (4x researcher agents, parallel)
        ├─> Read: (external) web search, docs, repos
        ├─> Write: .planning/research/STACK.md
        ├─> Write: .planning/research/FEATURES.md
        ├─> Write: .planning/research/ARCHITECTURE.md
        └─> Write: .planning/research/PITFALLS.md

      Requirements scoping (synthesizer agent)
        ├─> Read: Conversation context
        ├─> Read: .planning/research/*.md
        └─> Write: .planning/REQUIREMENTS.md

      Roadmap generation (planner agent)
        ├─> Read: .planning/REQUIREMENTS.md
        ├─> Read: .planning/research/*.md
        └─> Write: .planning/ROADMAP.md

      State initialization (inline)
        ├─> Write: .planning/STATE.md
        ├─> Write: .planning/config.json
        ├─> Write: .planning/PROJECT.md
        └─> Write: .planning/CONTEXT.md

────────────────────────────────────────────────────────────────────────

User: /dev:discuss <N>

      Synthesizer agent (conversational mode)
        ├─> Read: .planning/ROADMAP.md (phase goal)
        ├─> Read: .planning/REQUIREMENTS.md
        ├─> Read: .planning/CONTEXT.md
        ├─> Converse: Gather user preferences
        └─> Write: .planning/phases/{NN}-{slug}/CONTEXT.md

────────────────────────────────────────────────────────────────────────

User: /dev:plan <N>

      Context loading (inline)
        ├─> Read: .planning/ROADMAP.md
        ├─> Read: .planning/REQUIREMENTS.md
        ├─> Read: .planning/CONTEXT.md
        ├─> Read: .planning/phases/{NN}-{slug}/CONTEXT.md
        └─> Read: .planning/phases/{dep}/SUMMARY-*.md (dependencies)

      Research phase (researcher agent, optional)
        ├─> Read: Context from above
        └─> Write: .planning/phases/{NN}-{slug}/RESEARCH.md

      Plan generation (planner agent)
        ├─> Read: All context files
        ├─> Read: .planning/phases/{NN}-{slug}/RESEARCH.md
        └─> Write: .planning/phases/{NN}-{slug}/PLAN-{MM}.md (per plan)

      Plan checking (plan-checker agents, optional)
        ├─> Read: PLAN-{MM}.md
        └─> Return: Validation feedback (not saved to disk)

────────────────────────────────────────────────────────────────────────

User: /dev:build <N>

      Validation (inline)
        ├─> Read: .planning/phases/{NN}-{slug}/PLAN-*.md
        └─> Parse: Wave structure from frontmatter

      Wave execution (executor agents, sequential or parallel)
        ├─> Read: PLAN-{MM}.md
        ├─> Read: dependency SUMMARY.md files
        ├─> Execute: Tasks (write code, run tests, etc.)
        ├─> Write: Code files (per <files> in task)
        ├─> Bash: git add <files> && git commit -m "..."
        └─> Write: .planning/phases/{NN}-{slug}/SUMMARY-{MM}.md

      Integration check (integration-checker agent, optional)
        ├─> Read: All SUMMARY-*.md in phase
        └─> Write: .planning/phases/{NN}-{slug}/INTEGRATION-REPORT.md

      Planning docs commit (inline, optional)
        └─> Bash: git add .planning/ && git commit -m "docs({phase}): ..."

────────────────────────────────────────────────────────────────────────

User: /dev:review <N>

      Verification (verifier agent)
        ├─> Read: .planning/ROADMAP.md (phase goal)
        ├─> Read: .planning/phases/{NN}-{slug}/PLAN-*.md (must-haves)
        ├─> Read: .planning/phases/{NN}-{slug}/SUMMARY-*.md
        ├─> Bash: Run verification commands from must-haves
        ├─> Grep: Check key links (integration points)
        └─> Write: .planning/phases/{NN}-{slug}/VERIFICATION.md

      Result parsing (inline)
        ├─> Read: VERIFICATION.md
        └─> Count: verified vs. failed must-haves

────────────────────────────────────────────────────────────────────────

User: /dev:milestone audit

      Milestone verification (verifier agent)
        ├─> Read: .planning/REQUIREMENTS.md
        ├─> Read: .planning/ROADMAP.md
        ├─> Read: All VERIFICATION.md files
        ├─> Check: Cross-phase integration
        └─> Write: .planning/MILESTONE.md

────────────────────────────────────────────────────────────────────────

File Read Patterns:

Orchestrator (main context) reads:
  ├─ STATE.md (frequently, to track position)
  ├─ config.json (once per skill invocation)
  ├─ ROADMAP.md (summary/frontmatter only)
  ├─ PLAN.md (frontmatter only, never full XML)
  ├─ SUMMARY.md (frontmatter only, or first 20 lines)
  └─ VERIFICATION.md (checklist summary only)

Agents (subagent context) read:
  ├─ Full context files (ROADMAP, REQUIREMENTS, CONTEXT)
  ├─ Full PLAN.md (executors)
  ├─ Full SUMMARY.md (verifiers)
  ├─ Full RESEARCH.md (planners)
  └─ Codebase files (as needed for their task)

**Rule**: Never read full agent definitions (agents/*.md) in orchestrator context.
Use subagent_type to auto-load.
```

---

## Error and Recovery Paths

### Executor Failures

```
Task verify fails:
  ├─ Apply deviation rules:
  │    ├─ Rule 1: Auto-fix bugs (fix obvious typos, logic errors)
  │    ├─ Rule 2: Install missing dependencies (update package.json, requirements.txt)
  │    └─ Rule 3: Critical gaps (add missing null checks, error handling)
  ├─ Retry verify
  ├─ If still fails after 3 attempts:
  │    └─> STOP, return error checkpoint
  │         ├─> What failed: task ID, verify command, error output
  │         ├─> Completed tasks: list with commits
  │         └─> Suggest: /dev:debug or manual fix

Checkpoint task:
  ├─ Executor stops execution
  ├─> Write partial SUMMARY.md
  └─> Return checkpoint metadata
       ├─> Type: human-verify, decision, human-action, AUTH-GATE
       ├─> What to do: instructions for user
       └─> Resume signal: what to say to continue

Git lock conflict (parallel execution):
  ├─ Wait 2 seconds
  ├─ Retry (max 3 attempts)
  └─ If still failing:
       └─> STOP, suggest reducing max_concurrent_agents

Authentication gate:
  ├─ Executor hits API auth error
  ├─> STOP immediately
  └─> Return AUTH-GATE checkpoint
       ├─> Credential needed: description
       ├─> Where to configure: file/env var
       └─> Completed tasks: list
```

### Verifier Failures

```
Must-have verification fails:
  ├─> Write VERIFICATION.md with gaps
  ├─> Orchestrator displays gap summary
  └─> User chooses:
       ├─ /dev:plan <N> --gaps → create gap-closure plans
       ├─ /dev:debug <N> → investigate why verification failed
       └─ Accept gaps → mark phase complete anyway

Verification command errors:
  ├─> Verifier logs error in VERIFICATION.md
  ├─> Mark must-have as "verification failed" (not "not verified")
  └─> Continue checking other must-haves
```

### Plan Checker Failures

```
Plan incompleteness detected:
  ├─> Plan-checker returns feedback list
  ├─> Orchestrator re-spawns planner with feedback
  ├─> Planner revises PLAN.md
  └─> Re-run plan-checker (max 2 iterations)

Plan-checker times out:
  ├─> Orchestrator logs warning
  └─> Proceed without plan checking (user accepts risk)
```

### Hook Failures

```
PreToolUse hook blocks (exit 2):
  ├─> Tool call is prevented
  ├─> Claude receives block reason
  └─> Claude adjusts and retries

Hook script crashes (exit code != 0, != 2):
  ├─> Hook is logged as failed
  ├─> Tool call proceeds anyway (non-blocking)
  └─> /dev:health Check 8 flags hook errors

Hook log full (>200 entries):
  ├─> Rotate log
  ├─> Keep last 200 entries
  └─> Archive old entries to .planning/logs/hooks.jsonl.archive
```

### State Corruption

```
STATE.md missing or malformed:
  ├─> /dev:health detects issue
  ├─> Suggest: restore from git history
  └─> Or: run /dev:begin to reinitialize

ROADMAP.md out of sync with phase directories:
  ├─> /dev:health detects issue
  ├─> Suggest: run /dev:config to fix
  └─> Or: manually edit ROADMAP.md

Orphaned PLAN.md (phase not in ROADMAP):
  ├─> /dev:health detects issue
  └─> Suggest: remove orphaned files or add phase to ROADMAP

Missing dependency SUMMARY.md:
  ├─> /dev:build blocks before execution
  └─> Suggest: run /dev:build <dep_phase> first
```

### Context Budget Overflow

```
Context approaching limit during skill:
  ├─> Orchestrator proactively warns user:
  │    "Context budget is getting heavy. Consider /dev:pause after this step."
  ├─> User can:
  │    ├─ Continue (risk compaction mid-task)
  │    └─ Run /dev:pause now (checkpoint progress)

Context compacted mid-session:
  ├─> PreCompact hook fires → context-budget-check.js
  ├─> Critical context preserved in STATE.md
  ├─> Claude Code compacts conversation
  ├─> SessionStart hook fires → progress-tracker.js
  └─> Orchestrator re-reads STATE.md to reorient
```

### Gap Closure Loop

```
/dev:review {N} finds gaps in verification:
  ├─> Verifier writes VERIFICATION.md with failed must-haves
  ├─> Orchestrator displays gap summary
  └─> Suggests: /dev:plan {N} --gaps

/dev:plan {N} --gaps creates gap-closure plans:
  ├─> Read VERIFICATION.md to identify failed must-haves
  ├─> Spawn towline-planner with gap context
  ├─> Planner creates PLAN-{MM}.md files with:
  │    ├─ Frontmatter: gap_closure: true
  │    ├─ Focused tasks to close specific gaps
  │    └─ Must-haves that verify the gaps are closed
  └─> Suggests: /dev:build {N} --gaps-only

/dev:build {N} --gaps-only executes gap-closure plans:
  ├─> Filter plans to gap_closure: true only
  ├─> Spawn executors for gap-closure plans
  ├─> Write SUMMARY.md files for gap plans
  └─> Suggests: /dev:review {N}

/dev:review {N} re-verifies the phase:
  ├─> Read VERIFICATION.md from prior run
  ├─> Re-check only previously-failed must-haves
  ├─> Update VERIFICATION.md with new results
  └─> If all pass: "PHASE N COMPLETE ✓"
       If gaps remain: suggest /dev:plan {N} --gaps (iterate)
```

### Checkpoint Resume Flow

```
/dev:build {N} executor hits checkpoint task:
  ├─> Executor executes task (if checkpoint:human-verify)
  │    OR stops before execution (if checkpoint:decision or checkpoint:human-action)
  ├─> Executor commits completed work
  ├─> Executor writes partial SUMMARY.md with:
  │    ├─ Completed tasks (with commits)
  │    ├─ Checkpoint task (with type and instructions)
  │    └─ Pending tasks (not yet executed)
  ├─> Executor updates .checkpoint-manifest.json:
  │    ├─ plan: "03-01"
  │    ├─ checkpoint_task: "task-02"
  │    ├─ checkpoint_type: "human-verify|decision|human-action|AUTH-GATE"
  │    ├─ completed_tasks: ["task-01"]
  │    └─ pending_tasks: ["task-03", "task-04"]
  └─> Executor returns to orchestrator with checkpoint metadata

User handles checkpoint:
  ├─ checkpoint:human-verify → User tests, says "approved" or describes issues
  ├─ checkpoint:decision → User selects option A/B/C
  ├─ checkpoint:human-action → User performs external action, says "done"
  └─ AUTH-GATE → User configures credentials, says "done"

/dev:continue resumes from checkpoint:
  ├─> Read .checkpoint-manifest.json
  ├─> Read partial SUMMARY.md
  ├─> Spawn executor with resumption context:
  │    ├─ plan: "03-01"
  │    ├─ resume_from: "task-03"
  │    ├─ prior_checkpoint: user's response/decision
  │    └─ completed_commits: ["abc123", "def456"]
  ├─> Executor continues from pending_tasks
  ├─> Executor appends to SUMMARY.md
  ├─> Executor deletes .checkpoint-manifest.json when complete
  └─> Orchestrator suggests next command

Checkpoint types:
  ├─ checkpoint:human-verify — Execute task, commit, STOP for user verification
  ├─ checkpoint:decision — STOP before execution, user chooses option
  ├─ checkpoint:human-action — STOP, user performs external action
  └─ AUTH-GATE — STOP on auth error, user configures credentials
```

---

# Part 2: Development Conventions

## Project Structure

```
towline/
├── plugins/dev/                    ← Plugin root (${CLAUDE_PLUGIN_ROOT})
│   ├── skills/                     ← Skill definitions
│   │   ├── begin/SKILL.md
│   │   ├── plan/SKILL.md
│   │   ├── build/SKILL.md
│   │   └── ... (20 skills total)
│   ├── agents/                     ← Agent definitions
│   │   ├── towline-executor.md
│   │   ├── towline-verifier.md
│   │   └── ... (10 agents total)
│   ├── scripts/                    ← Hook scripts (CommonJS)
│   │   ├── validate-commit.js
│   │   ├── progress-tracker.js
│   │   ├── towline-tools.js        ← Shared utilities
│   │   └── ... (20 scripts total)
│   ├── hooks/hooks.json            ← Hook configuration
│   ├── references/                 ← Shared reference docs
│   │   ├── plan-format.md
│   │   ├── commit-conventions.md
│   │   ├── ui-formatting.md
│   │   └── ... (17 references total)
│   ├── templates/                  ← EJS-style templates
│   │   ├── SUMMARY.md.tmpl
│   │   ├── PLAN.md.tmpl
│   │   ├── VERIFICATION.md.tmpl
│   │   ├── VERIFICATION-DETAIL.md.tmpl
│   │   ├── INTEGRATION-REPORT.md.tmpl
│   │   ├── USER-SETUP.md.tmpl
│   │   ├── CONTEXT.md.tmpl
│   │   ├── DEBUG.md.tmpl
│   │   ├── UAT.md.tmpl
│   │   ├── discovery.md.tmpl
│   │   ├── milestone.md.tmpl
│   │   ├── milestone-archive.md.tmpl
│   │   ├── continue-here.md.tmpl
│   │   ├── codebase/               ← Brownfield scan templates
│   │   │   ├── STACK.md.tmpl
│   │   │   ├── INTEGRATIONS.md.tmpl
│   │   │   ├── ARCHITECTURE.md.tmpl
│   │   │   ├── STRUCTURE.md.tmpl
│   │   │   ├── CONVENTIONS.md.tmpl
│   │   │   ├── TESTING.md.tmpl
│   │   │   └── CONCERNS.md.tmpl
│   │   └── research/               ← Initial research templates
│   │       ├── ARCHITECTURE.md.tmpl
│   │       ├── FEATURES.md.tmpl
│   │       ├── PITFALLS.md.tmpl
│   │       ├── STACK.md.tmpl
│   │       └── SUMMARY.md.tmpl
│   ├── commands/                   ← Command registration
│   │   ├── begin.md
│   │   ├── plan.md
│   │   └── ... (20 commands)
│   └── skills/shared/              ← Shared skill fragments
│       ├── domain-probes.md
│       ├── error-reporting.md
│       ├── phase-argument-parsing.md
│       ├── progress-display.md
│       ├── state-loading.md
│       └── state-update.md
├── tests/                          ← Jest test suite
│   ├── fixtures/fake-project/      ← Test fixture (.planning/ structure)
│   ├── validate-commit.test.js
│   ├── towline-tools.test.js
│   ├── integration.test.js
│   └── ... (24 test files total)
├── references/                     ← Repo-level reference docs
│   └── DEVELOPMENT-GUIDE.md        ← This file
├── .planning/                      ← Towline's own planning state
│   ├── STATE.md
│   ├── ROADMAP.md
│   ├── config.json
│   └── phases/                     ← 14 phases (Towline v1 + v2)
├── CLAUDE.md                       ← User-facing documentation
├── package.json                    ← Node.js project config
├── .github/workflows/ci.yml        ← CI pipeline (Node 18/20/22, Win/Mac/Linux)
└── README.md                       ← Public-facing README
```

---

## Commit Format

All commits follow the Conventional Commits format, enforced by the `validate-commit.js` hook.

### Format

```
{type}({scope}): {description}
```

### Valid Types

```
feat       New feature or functionality
fix        Bug fix (including during execution)
refactor   Code restructuring, no behavior change
test       Adding or modifying tests
docs       Documentation changes
chore      Build config, dependencies, tooling
wip        Work in progress (use sparingly)
```

### Valid Scopes

```
{NN}-{MM}       Phase-plan scope (e.g., 03-01, 14-06)
quick-{NNN}     Quick task scope (e.g., quick-001)
planning        Planning doc changes
(any word)      Other valid scope (e.g., ci, deps, hooks)
```

### Examples

```bash
# Standard phase work
git commit -m "feat(03-01): add user authentication endpoint"
git commit -m "fix(02-02): resolve null pointer in parser"
git commit -m "test(04-03): add integration tests for OAuth flow"

# Planning docs
git commit -m "docs(planning): update roadmap with phase 4"
git commit -m "docs(03): add build summaries and verification"

# Quick tasks
git commit -m "feat(quick-001): add health endpoint"
git commit -m "fix(quick-002): resolve CORS issue in dev server"

# Infrastructure
git commit -m "chore: update dependencies"
git commit -m "chore(ci): add Node 22 to test matrix"
git commit -m "refactor(hooks): extract common logging logic"
```

### Commit Body (Optional)

For commits that need explanation:

```
feat(02-01): implement discord oauth client

- Uses discord-oauth2 library for token exchange
- Stores tokens in httpOnly cookies for security
- Supports identify and email OAuth scopes

Deviation: Added null check for user.email (Rule 3 — critical gap)
```

### TDD Commits

TDD tasks produce exactly 3 commits:

```bash
# RED — failing tests
test(02-01): add failing tests for auth middleware

# GREEN — passing implementation
feat(02-01): implement auth middleware to pass tests

# REFACTOR — clean up
refactor(02-01): extract token verification helper
```

### Sensitive File Blocking

The `validate-commit.js` hook blocks commits containing:

```
.env (exactly, not .env.example)
.env.production, .env.local (not .env.example)
*.key, *.pem, *.pfx, *.p12
*credential*, *secret* (unless in tests/ or *.example)
```

To bypass false positives, rename files to include `.example`, `.template`, or `.sample`.

---

## File Naming Conventions

### Skill Files

```
plugins/dev/skills/{skill-name}/SKILL.md

Examples:
  plugins/dev/skills/begin/SKILL.md
  plugins/dev/skills/plan/SKILL.md
  plugins/dev/skills/build/SKILL.md
```

**Rules**:
- Skill directory name is lowercase, hyphenated
- File is always named `SKILL.md` (uppercase)
- One skill per directory

### Agent Files

```
plugins/dev/agents/towline-{agent-name}.md

Examples:
  plugins/dev/agents/towline-executor.md
  plugins/dev/agents/towline-verifier.md
  plugins/dev/agents/towline-planner.md
```

**Rules**:
- All agent files in flat `agents/` directory
- Prefix: `towline-` (never `gsd-` or other brands)
- Lowercase, hyphenated name
- Extension: `.md`

### Script Files

```
plugins/dev/scripts/{script-name}.js

Examples:
  plugins/dev/scripts/validate-commit.js
  plugins/dev/scripts/progress-tracker.js
  plugins/dev/scripts/towline-tools.js
```

**Rules**:
- All script files in flat `scripts/` directory
- Lowercase, hyphenated name
- Extension: `.js` (CommonJS)
- Must use `require()`, not `import`

### Template Files

```
plugins/dev/templates/{template-name}.tmpl

Examples:
  plugins/dev/templates/SUMMARY.md.tmpl
  plugins/dev/templates/VERIFICATION.md.tmpl
  plugins/dev/templates/codebase/stack-research.md.tmpl
```

**Rules**:
- Extension: `.tmpl` (EJS-style syntax)
- Can be in subdirectories for organization (`codebase/`, `research/`)
- Name matches output file (e.g., `SUMMARY.md.tmpl` → `SUMMARY.md`)

### Reference Files

```
plugins/dev/references/{reference-name}.md

Examples:
  plugins/dev/references/plan-format.md
  plugins/dev/references/commit-conventions.md
  plugins/dev/references/ui-formatting.md
```

**Rules**:
- All reference files in flat `references/` directory
- Lowercase, hyphenated name
- Extension: `.md`
- Loaded by skills via relative path

### Test Files

```
tests/{script-name}.test.js

Examples:
  tests/validate-commit.test.js
  tests/towline-tools.test.js
  tests/integration.test.js
```

**Rules**:
- Test file name mirrors script name
- Extension: `.test.js`
- Use Jest syntax
- Fixture data in `tests/fixtures/`

---

## Directory Structure

### Planning State Structure

When Towline initializes a project, it creates this structure:

```
.planning/
├── STATE.md                        ← Current position, progress
├── ROADMAP.md                      ← Phase structure, goals
├── REQUIREMENTS.md                 ← Committed requirements
├── CONTEXT.md                      ← Locked decisions (project-level)
├── PROJECT.md                      ← Project metadata
├── config.json                     ← Workflow settings
├── research/                       ← Initial research artifacts
│   ├── SUMMARY.md
│   ├── STACK.md
│   ├── FEATURES.md
│   ├── ARCHITECTURE.md
│   └── PITFALLS.md
├── phases/                         ← One directory per phase
│   ├── 01-foundation/
│   │   ├── CONTEXT.md              ← Phase-level locked decisions
│   │   ├── RESEARCH.md             ← Phase-specific research
│   │   ├── PLAN-01.md              ← Executable plan (YAML + XML)
│   │   ├── PLAN-02.md
│   │   ├── SUMMARY-01.md           ← Build results
│   │   ├── SUMMARY-02.md
│   │   ├── INTEGRATION-REPORT.md   ← Cross-plan integration check
│   │   └── VERIFICATION.md         ← Goal verification results
│   ├── 02-authentication/
│   │   └── ... (same structure)
│   └── ... (all phases)
├── todos/                          ← Todo tracking
│   ├── pending/
│   │   └── 001-example.md
│   └── done/
│       └── 002-completed.md
├── quick/                          ← Quick task artifacts
│   └── {NNN}-{slug}/
│       ├── PLAN.md
│       └── SUMMARY.md
├── debug/                          ← Debug session artifacts
│   └── {slug}.md
├── codebase/                       ← Brownfield analysis (from /dev:scan)
│   ├── RECON.md
│   ├── STACK.md
│   ├── INTEGRATIONS.md
│   ├── ARCHITECTURE.md
│   ├── STRUCTURE.md
│   ├── CONVENTIONS.md
│   ├── TESTING.md
│   └── CONCERNS.md
├── milestones/                     ← Milestone archives
│   ├── {version}-ROADMAP.md
│   ├── {version}-REQUIREMENTS.md
│   └── {version}-STATS.md
├── logs/
│   ├── hooks.jsonl                ← Hook execution log (max 200 entries)
│   └── events.jsonl               ← Workflow event log (max 1,000 entries)
└── .continue-here                  ← Continuation instruction (if paused)
```

### Key Files

| File | Purpose | Created By | Read By |
|------|---------|------------|---------|
| STATE.md | Source of truth for current position | /dev:begin | All skills |
| ROADMAP.md | Phase structure, goals, dependencies | /dev:begin | /dev:plan, /dev:build, /dev:review |
| REQUIREMENTS.md | Committed requirements | /dev:begin | /dev:plan, /dev:milestone |
| CONTEXT.md | Project-level locked decisions | /dev:begin | /dev:plan, agents |
| config.json | Workflow settings | /dev:begin | All skills |
| PLAN.md | Executable plan (YAML + XML tasks) | /dev:plan | /dev:build |
| SUMMARY.md | Build results (task outcomes, commits) | /dev:build | /dev:review, /dev:status |
| VERIFICATION.md | Goal verification results | /dev:review | /dev:status, /dev:milestone |
| RESEARCH.md | Research findings | /dev:plan | /dev:plan (planner agent) |

---

## Hook Development Rules

### CommonJS Requirement

All hook scripts MUST use CommonJS, not ES modules.

**Good**:
```javascript
const path = require('path');
const fs = require('fs');
const { logHook } = require('./hook-logger');

module.exports = { someFunction };
```

**Bad**:
```javascript
import path from 'path';
import fs from 'fs';
import { logHook } from './hook-logger';

export { someFunction };
```

**Reason**: Claude Code's hook system expects CommonJS. ES modules will fail to load.

### Cross-Platform Paths

Always use `path.join()` for file paths. Never hardcode separators.

**Good**:
```javascript
const planPath = path.join(planningDir, 'phases', `${phaseNum}-${slug}`, 'PLAN.md');
```

**Bad**:
```javascript
const planPath = `${planningDir}/phases/${phaseNum}-${slug}/PLAN.md`;  // Fails on Windows
const planPath = `${planningDir}\\phases\\${phaseNum}-${slug}\\PLAN.md`;  // Fails on Linux
```

### Logging Requirement

All hooks MUST log their execution via `logHook()` from `hook-logger.js`.

**Pattern**:
```javascript
const { logHook } = require('./hook-logger');

function main() {
  // ... hook logic ...

  if (shouldBlock) {
    logHook('my-hook', 'PreToolUse', 'block', { reason: 'invalid format' });
    const output = { decision: 'block', reason: 'Invalid format' };
    process.stdout.write(JSON.stringify(output));
    process.exit(2);
  }

  logHook('my-hook', 'PreToolUse', 'allow', { message: 'valid' });
  process.exit(0);
}
```

**Logs go to**: `.planning/logs/hooks.jsonl` (JSONL format, max 200 entries, auto-rotates)

### Exit Codes

```
Exit 0:  Success (PreToolUse: allow, PostToolUse: continue)
Exit 2:  Block (PreToolUse only: prevent tool call)
Exit 1+: Error (logged, does not block workflow)
```

### stdin/stdout Protocol

Hooks receive JSON on stdin, write JSON to stdout.

**Input**:
```json
{
  "tool_input": {
    "command": "git commit -m \"feat(03-01): add auth\""
  }
}
```

**Output (blocking)**:
```json
{
  "decision": "block",
  "reason": "Invalid commit message format."
}
```

**Output (allowing)**:
```
(empty stdout, exit 0)
```

### Error Handling

Hooks should fail gracefully:

```javascript
function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      // ... hook logic ...
    } catch (e) {
      // Parse error - don't block, just log
      logHook('my-hook', 'Error', 'parse-failure', { error: e.message });
      process.exit(0);  // Allow by default on error
    }
  });
}
```

### Testing Hooks

Every hook script MUST have a corresponding test file in `tests/`.

**Example**: `validate-commit.js` → `tests/validate-commit.test.js`

**Note**: 4 hook scripts currently lack test files and should be prioritized for testing:
- `auto-continue.js`
- `progress-tracker.js`
- `session-cleanup.js`
- `validate-plugin-structure.js`

New hooks should always have corresponding test files from the start.

Test pattern:
```javascript
const { execSync } = require('child_process');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'dev', 'scripts', 'my-hook.js');

function runScript(toolInput) {
  const input = JSON.stringify({ tool_input: toolInput });
  try {
    const result = execSync(`node "${SCRIPT}"`, {
      input: input,
      encoding: 'utf8',
      timeout: 5000,
    });
    return { exitCode: 0, output: result };
  } catch (e) {
    return { exitCode: e.status, output: e.stdout || '' };
  }
}

describe('my-hook.js', () => {
  test('allows valid input', () => {
    const result = runScript({ command: 'valid command' });
    expect(result.exitCode).toBe(0);
  });

  test('blocks invalid input', () => {
    const result = runScript({ command: 'invalid command' });
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('block');
  });
});
```

### statusMessage Field

Every hook entry in `hooks.json` has a `statusMessage` field. This text is displayed in Claude Code's status bar while the hook is running, giving users visual feedback that background processing is happening.

**Best practices for statusMessage**:
- Use present participle (gerund) form: "Validating commit...", "Checking phase boundary..."
- Keep it short — it appears in a narrow status bar
- End with ellipsis (`...`) to indicate ongoing work
- Use action-specific language, not generic "Running hook..."

**Example in hooks.json**:
```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-commit.js",
      "statusMessage": "Validating commit..."
    }
  ]
}
```

### Windows File Deletion Retry Pattern

On Windows, file deletion can fail transiently because antivirus scanners and file indexer services (Windows Defender, Windows Search) hold brief locks on recently accessed files. Any hook that deletes files should implement a retry loop.

**Pattern** (from `auto-continue.js`):
```javascript
// Retry unlink to handle Windows file locking (e.g. antivirus/indexer)
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    fs.unlinkSync(filePath);
    break;
  } catch (unlinkErr) {
    if (attempt === 2) {
      logHook('my-hook', 'EventType', 'unlink-failed', { error: unlinkErr.message });
    }
    // Brief pause before retry (optional — often not needed since the retry itself provides enough delay)
  }
}
```

**When to use**: Any hook that removes signal files (`.auto-next`, `.active-operation`, `.active-skill`, `.active-agent`, lock files). The `session-cleanup.js` helper `tryRemove()` and `auto-continue.js` both implement this pattern.

### Checkpoint Manifest Lifecycle

The `.checkpoint-manifest.json` file tracks build execution progress for crash recovery. It is created and managed by the `/dev:build` skill.

```
/dev:build <N>
  ├─ CREATE: .planning/phases/{NN}-{slug}/.checkpoint-manifest.json
  │    ├─ plans: list of all plan IDs in the phase
  │    ├─ checkpoints_resolved: plans completed in this run
  │    ├─ wave: current wave number
  │    ├─ commit_log: array of {plan, sha, timestamp}
  │    └─ last_good_commit: SHA for rollback target
  │
  ├─ UPDATE: after each wave completes
  │    ├─ Move completed plans to checkpoints_resolved
  │    ├─ Advance wave counter
  │    └─ Record new commits in commit_log
  │
  └─ READ: on resume after crash/compaction
       └─ Reconstruct skip list from checkpoints_resolved
```

The manifest persists across sessions. If the orchestrator's context is compacted or the session is interrupted mid-build, the next `/dev:build` invocation reads it to skip already-completed plans.

---

## Skill Authoring Patterns

### Frontmatter Schema

Every SKILL.md starts with YAML frontmatter:

```yaml
---
name: skill-name                    # Must match directory name
description: "One-line description" # Used in /dev:help
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebFetch, WebSearch, Task
argument-hint: "<N> [--flag]"       # Shown in help text
---
```

**allowed-tools**: Comma-separated list. Only include tools the skill actually uses.

**argument-hint**: Optional. Shows expected arguments. Use `<required>` and `[optional]` notation.

### Context Budget Section

Every skill MUST have a "Context Budget" section at the top, immediately after frontmatter:

```markdown
## Context Budget

Keep the main orchestrator context lean. Follow these rules:
- **Never** read agent definition files (agents/*.md) — subagent_type auto-loads them
- **Never** inline large files into Task() prompts — tell agents to read files from disk instead
- **Minimize** reading subagent output into main context — read only summaries, not full files
- **Delegate** all analysis work to subagents — the orchestrator routes, it doesn't analyze
```

**Why**: This is the most critical discipline for avoiding context rot. Every skill must remind the orchestrator.

### Orchestration Flow Pattern

Skills use numbered step sections:

```markdown
## Orchestration Flow

Execute these steps in order.

---

### Step 1: Parse and Validate (inline)

1. Parse `$ARGUMENTS` for phase number
2. Read `.planning/config.json` for settings
3. Validate phase exists in ROADMAP.md

---

### Step 2: Spawn Planner Agent (delegate)

Spawn a Task() subagent:

```
subagent_type: "dev:towline-planner"
input:
  phase: {N}
  goal: {from ROADMAP.md}
  requirements: {from REQUIREMENTS.md}
  context: {from CONTEXT.md}
```

Wait for agent to complete. Do NOT read the full PLAN.md into main context.

---

### Step 3: Gate Check (inline)

If `gates.confirm_plan` is true:
1. Read PLAN.md frontmatter only (first 20 lines)
2. Display plan summary to user
3. Ask: "Approve this plan?"
4. If yes: proceed. If no: abort.

---
```

**Pattern**:
- Mark each step as `(inline)` or `(delegate)`
- Inline steps run in orchestrator context
- Delegate steps spawn Task() subagents
- Never inline agent definitions — use `subagent_type`

### Gate Check Pattern

When a gate is configured, check it before proceeding:

```markdown
### Step N: Gate Check

If `gates.confirm_{gate_name}` is true:
1. Display {summary of what will happen}
2. Ask user: "Approve?"
3. If user says "yes" / "approved" / "looks good": proceed
4. If user says "no" / "reject": abort
5. If user provides feedback: {handle feedback}
```

### Subagent Spawning Pattern

**Good** (uses subagent_type):
```markdown
Spawn a Task() subagent:

subagent_type: "dev:towline-planner"
input:
  phase: 3
  goal: "Implement user authentication"
  requirements: "R1, R2, R3"
  research: "Read .planning/phases/03-auth/RESEARCH.md"
```

**Bad** (inlines agent definition):
```markdown
Spawn a Task() subagent with this prompt:

"You are towline-planner, a specialized planning agent. Your job is to..."
(400 lines of agent definition)
```

**Why**: `subagent_type` auto-loads the agent definition from `agents/towline-{name}.md`. Inlining the definition wastes 400+ lines of main context.

### File Reading Pattern

**Good** (minimal reads in orchestrator):
```markdown
1. Read STATE.md to get current phase
2. Read config.json to get settings
3. Spawn planner agent, tell it to read ROADMAP.md and REQUIREMENTS.md
```

**Bad** (reads everything into orchestrator):
```markdown
1. Read STATE.md
2. Read config.json
3. Read ROADMAP.md (full 500-line file)
4. Read REQUIREMENTS.md (full 300-line file)
5. Read all PLAN.md files (1000+ lines total)
6. Pass all this to the planner agent as inline input
```

**Why**: Orchestrator should read only enough to route decisions. Subagents read full files in their own context.

### Result Reading Pattern

After a subagent completes, read only the summary:

**Good**:
```markdown
1. Spawn executor agent
2. Agent writes SUMMARY.md
3. Read SUMMARY.md frontmatter only (first 10 lines)
4. Check status field: "complete" or "checkpoint"
5. Display result to user
```

**Bad**:
```markdown
1. Spawn executor agent
2. Agent writes SUMMARY.md (500 lines)
3. Read entire SUMMARY.md into orchestrator context
4. Parse every task result, every commit, every file modification
5. Display detailed breakdown
```

### UI Formatting

All skills MUST use Towline-branded UI elements from `references/ui-formatting.md`:

**Stage banners**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TOWLINE ► PLANNING PHASE 3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Checkpoint boxes**:
```
╔══════════════════════════════════════════════════════════════╗
║  CHECKPOINT: Verification Required                           ║
╚══════════════════════════════════════════════════════════════╝

Review the build results above.

──────────────────────────────────────────────────────────────
→ Type "approved" or describe issues
──────────────────────────────────────────────────────────────
```

**Next Up blocks**:
```
───────────────────────────────────────────────────────────────

## ▶ Next Up

**Phase 4: Frontend** — Build the user interface

/dev:plan 4

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────
```

**Status indicators**:
```
✓ Complete
✗ Failed
○ Pending
◐ In Progress
```

Never use `GSD ►` or any GSD branding. Always use `TOWLINE ►`.

---

## Agent Authoring Patterns

### Frontmatter Schema

Every agent file starts with YAML frontmatter:

```yaml
---
name: towline-agent-name            # Must match filename
description: "One-line description" # Used in logs
model: inherit|sonnet|haiku|opus   # Model preference
memory: none|user|project          # Memory context
tools:                             # Allowed tools (array)
  - Read
  - Write
  - Bash
---
```

**model**:
- `inherit` = use same model as orchestrator
- `sonnet` = Claude 3.7 Sonnet (balanced)
- `haiku` = Claude 3.5 Haiku (fast, cheap)
- `opus` = Claude Opus 4.6 (powerful, expensive)

**memory**:
- `none` = no memory context
- `user` = user-level memory
- `project` = project-level memory

**tools**: Only include tools the agent needs. More tools = more complexity.

### Agent Structure

```markdown
---
frontmatter here
---

# Agent Name

You are **towline-agent-name**, the {role} agent for the Towline development system. You {core job description}.

## Core Principle

{1-2 sentence statement of agent's primary constraint}

---

## {Main Section}

{Agent-specific instructions}

---

## {Secondary Section}

{More instructions}
```

### Common Patterns

**Executor pattern**: Mechanical task execution, atomic commits, deviation handling

**Verifier pattern**: Goal-backward checking, must-haves verification, gap reporting

**Planner pattern**: Goal decomposition, wave structuring, dependency management

**Researcher pattern**: Scoped research, fact-based synthesis, source citation

**Synthesizer pattern**: Multi-source consolidation, conversational elicitation

### Anti-Patterns

**Bad**: Reading agent definitions in agent prompts
```markdown
You are towline-executor. Before you start, read agents/towline-verifier.md to understand how verification works.
```

**Good**: Assume agent definitions are self-contained
```markdown
You are towline-executor. Your job is to execute tasks. When done, you write SUMMARY.md. The verifier agent will read this later.
```

**Why**: Agents should never need to read other agent definitions. Each agent is a black box with a clear input/output contract.

---

## Template Conventions

### Variable Syntax

Templates use **simple `{variable}` placeholders** (Mustache-style) for string substitution. These are NOT rendered by a template engine — the orchestrator or agent replaces variables manually.

```
{phase}              Phase number (e.g., "03")
{slug}               Phase slug (e.g., "authentication")
{plan_id}            Plan ID (e.g., "03-01")
{goal}               Phase goal
{score}              Verification score (e.g., "8/10")
{status}             Status string
{timestamp}          ISO timestamp
{date}               Date (YYYY-MM-DD)
```

**Exception**: `templates/PLAN.md.tmpl` uses EJS syntax (`<%= %>`, `<% for %>`) because it requires loops for dynamic arrays (must-haves, tasks). This is the only template that uses EJS.

### When to Use Each Syntax

| Syntax | When | Example |
|--------|------|---------|
| `{var}` | Simple substitution (default) | `{phase}`, `{status}`, `{date}` |
| `<%= var %>` | Only in PLAN.md.tmpl (EJS) | `<%= phase %>` |
| `<% code %>` | Only when loops/conditionals are needed (EJS) | `<% for (const t of tasks) { %>` |

**Rule**: When creating a new template, always use `{var}` syntax unless you genuinely need loops or conditionals.

### Template Location

```
plugins/dev/templates/SUMMARY.md.tmpl           ← Top-level templates
plugins/dev/templates/codebase/STACK.md.tmpl    ← Organized in subdirs
plugins/dev/templates/research/FEATURES.md.tmpl
plugins/dev/skills/{name}/templates/            ← Skill-specific templates
```

### Template Usage in Skills

Skills should reference templates by filename, not inline them:

**Good**:
```markdown
Write SUMMARY.md using the template at `templates/SUMMARY.md.tmpl`.
```

**Bad**:
```markdown
Write SUMMARY.md in this exact format:

---
plan: {plan_id}
status: {status}
---

# Summary
...
(200 lines of template inlined)
```

---

## Testing Requirements

### Test File Naming

Test files MUST mirror script names:

```
plugins/dev/scripts/validate-commit.js  → tests/validate-commit.test.js
plugins/dev/scripts/towline-tools.js    → tests/towline-tools.test.js
plugins/dev/scripts/progress-tracker.js → tests/progress-tracker.test.js
```

### Jest Configuration

Jest runs with **default configuration** from `package.json`:

```json
{
  "scripts": {
    "test": "jest",
    "lint": "eslint plugins/dev/scripts/ tests/",
    "validate": "node plugins/dev/scripts/validate-plugin-structure.js"
  }
}
```

Jest auto-discovers tests in the `tests/` directory matching `*.test.js` pattern. No `jest.config.js` file exists — Jest uses its default configuration.

### Fixture Project

Use the fixture project for integration tests:

```
tests/fixtures/fake-project/
├── .planning/
│   ├── STATE.md
│   ├── ROADMAP.md
│   ├── config.json
│   └── phases/
│       └── 01-foundation/
│           ├── PLAN-01.md
│           └── SUMMARY-01.md
└── src/
    └── index.js
```

**Pattern**:
```javascript
const path = require('path');
const fs = require('fs');

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'fake-project');
const PLANNING_DIR = path.join(FIXTURE_DIR, '.planning');

describe('integration test', () => {
  beforeEach(() => {
    // Reset fixture state
    const statePath = path.join(PLANNING_DIR, 'STATE.md');
    fs.writeFileSync(statePath, originalStateContent);
  });

  test('reads state correctly', () => {
    const state = loadState(PLANNING_DIR);
    expect(state.current_phase).toBe(1);
  });
});
```

### Testing Hooks

Hook tests use stdin/stdout protocol:

```javascript
function runScript(toolInput) {
  const input = JSON.stringify({ tool_input: toolInput });
  try {
    const result = execSync(`node "${SCRIPT}"`, {
      input: input,
      encoding: 'utf8',
      timeout: 5000,
      cwd: os.tmpdir(),  // Run in temp dir to avoid polluting project
    });
    return { exitCode: 0, output: result };
  } catch (e) {
    return { exitCode: e.status, output: e.stdout || '' };
  }
}
```

### Test Coverage

Minimum coverage targets (not yet enforced in CI — see todo 040):

```
Branches:   70%
Functions:  70%
Lines:      70%
Statements: 70%
```

Run coverage:
```bash
npm test -- --coverage
```

### CI Test Matrix

All tests must pass on:

```
Node.js: 18, 20, 22
OS:      Windows, macOS, Linux
```

CI config: `.github/workflows/ci.yml`

---

## Context Budget Discipline

### The Core Problem

Claude has a 200k token context window. When context fills up:
1. Quality degrades (more hallucinations, less coherence)
2. Context compaction kicks in (conversation history is summarized, losing details)
3. Cost increases (more tokens = higher API cost)

Towline solves this through **context isolation**: the main orchestrator delegates heavy work to Task() subagents. Each subagent gets a fresh 200k token window.

### Orchestrator Budget Guidelines

```
Target:  15% context usage
Max:     30% before warning user
```

**What belongs in orchestrator context**:
- Skill instructions (SKILL.md)
- State files (STATE.md, config.json)
- Reference docs (plan-format.md, commit-conventions.md, etc.)
- User conversation
- Routing logic (which agent to spawn, what command to suggest next)

**What does NOT belong in orchestrator context**:
- Agent definitions (agents/*.md) — use subagent_type instead
- Full PLAN.md files — read frontmatter only
- Full SUMMARY.md files — read first 20 lines only
- Full RESEARCH.md files — delegate to subagents
- Full codebase files — delegate to subagents
- Detailed analysis — delegate to subagents

### The subagent_type Rule

**NEVER** do this in a skill:

```markdown
Read `agents/towline-executor.md` and inline it into the Task() prompt.
```

**ALWAYS** do this instead:

```markdown
Spawn a Task() subagent:

subagent_type: "dev:towline-executor"
input:
  plan: "03-01"
  goal: "Implement authentication"
```

**Why**: The `subagent_type` mechanism auto-loads the agent definition from disk. Claude Code reads `agents/towline-executor.md` directly when spawning the Task(). This saves 400+ lines of orchestrator context per agent spawn.

### Reading Subagent Output

After a subagent completes, read only what you need:

**Minimal read** (best):
```markdown
1. Spawn executor
2. Read SUMMARY.md frontmatter (10 lines)
3. Check status: "complete" or "checkpoint"
4. Route next command
```

**Moderate read** (acceptable):
```markdown
1. Spawn verifier
2. Read VERIFICATION.md first section (checklist only, 20 lines)
3. Count verified vs. failed
4. Route based on result
```

**Full read** (avoid):
```markdown
1. Spawn researcher
2. Read entire RESEARCH.md (500 lines)
3. Summarize findings
4. Pass to planner
```

**Why**: The researcher already wrote a summary. The planner will read the full file in its own context. The orchestrator doesn't need to process it.

### Proactive Session Boundaries

Skills should warn users BEFORE context gets full:

```markdown
### Step 4: Context Budget Check

Before spawning 4 researchers in parallel, check context usage:

If context is already >30%:
  "Context budget is getting heavy. I recommend running `/dev:pause` now to checkpoint progress, then `/dev:continue` with a fresh window."

If user wants to continue anyway:
  "Proceeding. If context compacts mid-research, you may need to re-run this step."
```

**Why**: Once context compacts, details are lost. Checkpointing before heavy work preserves state.

### File Read Budget

When reading files in orchestrator context, be selective:

```
STATE.md:        Full read (usually <100 lines)
config.json:     Full read (<100 lines)
ROADMAP.md:      Frontmatter only, or specific phase section
PLAN.md:         Frontmatter only (first 20 lines)
SUMMARY.md:      Frontmatter only (first 10 lines)
VERIFICATION.md: Checklist only (first 30 lines)
```

Use `Read` tool with `limit` parameter:

```
Read SUMMARY.md with limit=20
```

---

## State Management

### STATE.md as Source of Truth

Every skill MUST trust STATE.md as the authoritative source of:
- Current phase
- Current plan
- Project status
- Last activity timestamp
- Progress percentage

**Do NOT** infer current phase from directory listings, git log, or conversation history. Always read STATE.md.

### Updating STATE.md

Skills update STATE.md at these points:

```
/dev:begin       Creates STATE.md
/dev:plan        Updates current_phase, status="planning"
/dev:build       Updates status="building" → "built"
/dev:review      Updates status="verifying" → "phase_complete" or "gaps_found"
/dev:pause       Updates status="paused", creates .continue-here
/dev:continue    Updates status to resume prior status
/dev:milestone   Appends to milestone_history
```

**Pattern**:
```markdown
1. Read STATE.md
2. Parse current values
3. Update relevant fields
4. Write STATE.md
5. (Do NOT commit STATE.md mid-skill; hooks handle this)
```

### config.json Validation

Before using any config value, validate it exists and has a valid value:

```javascript
const depth = config.depth || 'standard';
if (!['quick', 'standard', 'comprehensive'].includes(depth)) {
  console.error('Invalid depth:', depth);
  process.exit(1);
}
```

### Cross-File Consistency

Multiple files must stay in sync:

**ROADMAP.md ↔ phase directories**:
- Every phase in ROADMAP.md must have a directory in `.planning/phases/`
- Every directory in `.planning/phases/` must have a phase in ROADMAP.md

**PLAN.md frontmatter ↔ file structure**:
- `files_modified` in frontmatter must list actual files
- `depends_on` must reference valid plan IDs

**STATE.md ↔ SUMMARY.md**:
- If STATE.md says phase 3 is complete, `.planning/phases/03-*/SUMMARY-*.md` files must exist

The `/dev:health` skill checks these invariants.

---

## Cross-Platform Compatibility

Towline must work on Windows, macOS, and Linux.

### Path Separators

**NEVER hardcode** `/` or `\`.

**Good**:
```javascript
const planPath = path.join(planningDir, 'phases', `${phase}-${slug}`, 'PLAN.md');
```

**Bad**:
```javascript
const planPath = `${planningDir}/phases/${phase}-${slug}/PLAN.md`;
```

### Line Endings

Use `\n` in string literals. Node.js and Git will normalize.

**Good**:
```javascript
const content = `# Title\n\nBody text\n`;
fs.writeFileSync(path, content);
```

**Bad**:
```javascript
const content = `# Title\r\n\r\nBody text\r\n`;  // Windows-specific
```

### Shell Commands

Avoid shell-specific syntax in Bash tool calls.

**Good**:
```bash
git add file1.js file2.js
git commit -m "feat(03-01): add feature"
```

**Bad**:
```bash
git add file1.js && git commit -m "feat(03-01): add feature"  # OK
git add file1.js; git commit -m "feat(03-01): add feature"    # OK
git add file1.js | git commit -m "feat(03-01): add feature"   # WRONG (pipe doesn't work here)
```

For chained commands, use `&&` (stops on error) or `;` (continues on error).

### Environment Variables

In hook scripts, expand `${CLAUDE_PLUGIN_ROOT}` via hooks.json, not shell:

**hooks.json** (Good):
```json
{
  "type": "command",
  "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/my-hook.js"
}
```

Claude Code expands `${CLAUDE_PLUGIN_ROOT}` internally before execution. Works on all platforms.

**Bad**:
```json
{
  "type": "command",
  "command": "node $CLAUDE_PLUGIN_ROOT/scripts/my-hook.js"
}
```

Shell expansion is platform-dependent and may fail.

### File Permissions

Don't rely on execute bits. Always invoke scripts via `node`:

**Good**:
```bash
node plugins/dev/scripts/validate-commit.js
```

**Bad**:
```bash
./plugins/dev/scripts/validate-commit.js  # Requires +x, fails on Windows
```

### Testing Cross-Platform

Run tests locally on your OS, but also verify CI passes on all three platforms before merging.

```bash
npm test          # Run locally
git push          # Triggers CI on Windows, macOS, Linux
```

Check `.github/workflows/ci.yml` for CI status.

---

## CI Requirements

### Test Matrix

CI runs on 9 combinations:

```
Node.js: 18, 20, 22
OS:      ubuntu-latest, macos-latest, windows-latest
```

**All 9 must pass** before merging.

### CI Checks

1. **Lint**: ESLint on `plugins/dev/scripts/` and `tests/`
2. **Test**: Jest on all test files
3. **Coverage**: Minimum 70% on all metrics
4. **Structure**: `npm run validate` (checks plugin directory structure)

### Local Pre-Push Checks

Before pushing, run:

```bash
npm run lint      # Check code style
npm test          # Run all tests
npm run validate  # Validate plugin structure
```

Fix any failures before pushing.

### CI Failure Handling

If CI fails:

1. Check which OS/Node version failed
2. Reproduce locally (use `nvm` or `volta` to switch Node versions)
3. Fix the issue
4. Re-run tests locally
5. Push fix

Common CI failures:

```
Path separator issues     → Use path.join()
Line ending issues        → Use \n, not \r\n
Shell syntax issues       → Test commands on all shells
Missing dependencies      → Check package.json
```

---

## Development Gotchas

Common edge cases and platform-specific issues encountered during Towline development.

### 1. JSDoc `*/` in Glob Patterns

**Problem**: Babel parser interprets `*/` inside `/** */` block comments as closing the comment, causing syntax errors.

**Example that breaks**:
```javascript
/**
 * Read all PLAN.md files from .planning/phases/NN-*/
 */
const plans = glob('.planning/phases/**/PLAN.md');
```

**Error**: `SyntaxError: Missing semicolon` (the `*/` in the JSDoc closes the comment early)

**Fix**: Use `//` line comments instead of block comments when patterns contain `*/`:
```javascript
// Read all PLAN.md files from .planning/phases/NN-*/
const plans = glob('.planning/phases/**/PLAN.md');
```

### 2. Regex Anchors in Chained Commands

**Problem**: Claude Code's Bash tool passes the full command string including chained commands like `cd /dir && git commit`. Using `^git\s+commit` anchor misses these cases.

**Example that breaks**:
```javascript
const commitRegex = /^git\s+commit/;  // Misses "cd /foo && git commit"
```

**Fix**: Use word boundaries `\b` instead of anchors:
```javascript
const commitRegex = /\bgit\s+commit\b/;  // Matches in any position
```

### 3. Windows cwd File Locking in Tests

**Problem**: On Windows, `process.chdir()` can lock directories, preventing cleanup in test teardown.

**Example that breaks**:
```javascript
beforeEach(() => {
  process.chdir(testDir);  // Locks testDir on Windows
});

afterAll(() => {
  fs.rmSync(testDir, { recursive: true });  // Fails: EBUSY
});
```

**Fix**: Use `cwd` option in `execSync` instead of `process.chdir()`, and restore cwd in `afterAll`:
```javascript
const originalCwd = process.cwd();

test('example', () => {
  execSync('git status', { cwd: testDir });  // No chdir needed
});

afterAll(() => {
  process.chdir(originalCwd);  // Restore before cleanup
  fs.rmSync(testDir, { recursive: true });
});
```

### 4. logEvent vs logHook

**Problem**: Two similar logging functions with different purposes can be confused.

**Distinction**:
- `logHook()` → Logs to `.planning/logs/hooks.jsonl` (max 200 entries) for hook execution auditing. Use in hook scripts to track PreToolUse/PostToolUse events.
- `logEvent()` → Logs to `.planning/logs/events.jsonl` (max 1,000 entries) for workflow-level event tracking. Use for significant milestones like phase completion, milestone creation.

**Rule of thumb**: If it's inside a hook script, use `logHook()`. If it's tracking a high-level workflow event, use `logEvent()`.

---

## Anti-Patterns

### Critical Anti-Patterns (Never Do This)

#### 1. Reading Agent Definitions in Orchestrator

**Bad**:
```markdown
Step 3: Spawn Executor

Read `agents/towline-executor.md` and inline the full prompt into Task().
```

**Good**:
```markdown
Step 3: Spawn Executor

Spawn Task() with:
subagent_type: "dev:towline-executor"
```

**Why**: Agent definitions are 400+ lines. `subagent_type` auto-loads them. Reading them wastes orchestrator context.

**Impact**: Context usage balloons from 15% to 88% (real bug from v2 dogfooding).

#### 2. Inlining Large Files into Task() Prompts

**Bad**:
```markdown
Read ROADMAP.md (500 lines), REQUIREMENTS.md (300 lines), and all prior SUMMARY.md files (2000 lines). Pass all this as inline input to the planner agent.
```

**Good**:
```markdown
Spawn planner agent with:
subagent_type: "dev:towline-planner"
input:
  roadmap_path: ".planning/ROADMAP.md"
  requirements_path: ".planning/REQUIREMENTS.md"

The agent will read these files from disk in its own context.
```

**Why**: Subagents have their own 200k context. They can read files directly.

**Impact**: Wasted orchestrator context, no benefit to agent.

#### 3. Reading Full Subagent Output

**Bad**:
```markdown
1. Spawn executor
2. Read entire SUMMARY.md (500 lines) into orchestrator
3. Parse every task, commit, file change
4. Display detailed breakdown
```

**Good**:
```markdown
1. Spawn executor
2. Read SUMMARY.md frontmatter only (first 10 lines)
3. Check status field
4. Display one-line summary
```

**Why**: The SUMMARY.md is for the verifier agent to read later, not the orchestrator.

**Impact**: Context bloat, slower skill execution.

#### 4. Using GSD Branding

**Bad**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► EXECUTING WAVE 1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Good**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TOWLINE ► EXECUTING WAVE 1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Why**: Towline is a separate project. GSD is a different workflow.

**Impact**: User confusion, brand inconsistency.

#### 5. Hardcoding Path Separators

**Bad**:
```javascript
const planPath = `${dir}/phases/${phase}-${slug}/PLAN.md`;
```

**Good**:
```javascript
const planPath = path.join(dir, 'phases', `${phase}-${slug}`, 'PLAN.md');
```

**Why**: `/` fails on Windows, `\` fails on Linux/macOS.

**Impact**: Cross-platform breakage, CI failures.

#### 6. Using ES Modules in Hooks

**Bad**:
```javascript
import path from 'path';
import { logHook } from './hook-logger.js';
```

**Good**:
```javascript
const path = require('path');
const { logHook } = require('./hook-logger');
```

**Why**: Claude Code's hook system expects CommonJS.

**Impact**: Hook fails to load, workflow breaks.

#### 7. Skipping Hook Logging

**Bad**:
```javascript
function main() {
  // ... validate commit ...
  if (invalid) {
    process.exit(2);  // Block without logging
  }
  process.exit(0);
}
```

**Good**:
```javascript
const { logHook } = require('./hook-logger');

function main() {
  // ... validate commit ...
  if (invalid) {
    logHook('validate-commit', 'PreToolUse', 'block', { reason });
    process.exit(2);
  }
  logHook('validate-commit', 'PreToolUse', 'allow');
  process.exit(0);
}
```

**Why**: Logs are used by `/dev:health` Check 8 to verify hooks are working.

**Impact**: Silent hook failures, harder debugging.

#### 8. Modifying State Files in Agents

**Bad** (in towline-executor.md):
```markdown
After completing all tasks, update STATE.md to mark the phase complete.
```

**Good**:
```markdown
After completing all tasks, write SUMMARY.md. The orchestrator will update STATE.md.
```

**Why**: State management is orchestrator responsibility. Agents write artifacts (SUMMARY, VERIFICATION), orchestrator updates STATE.

**Impact**: Race conditions, state corruption (especially with parallel execution).

### Common Mistakes

#### 9. Forgetting to Update STATE.md

**Bad**:
```markdown
/dev:build completes all tasks, displays "Phase complete", but doesn't update STATE.md.
```

**Good**:
```markdown
/dev:build completes all tasks, updates STATE.md status to "built", displays "Phase complete".
```

**Why**: Other skills trust STATE.md. If it's not updated, `/dev:status` shows stale data.

#### 10. Not Checking Gates

**Bad**:
```markdown
/dev:plan generates plans and immediately proceeds to /dev:build.
```

**Good**:
```markdown
/dev:plan generates plans, checks gates.confirm_plan, pauses if true, then suggests /dev:build.
```

**Why**: Users expect gates to be respected. Skipping gates breaks the workflow contract.

#### 11. Ignoring Dependencies

**Bad** (in executor):
```markdown
Read PLAN.md, execute tasks, don't check if depends_on plans are complete.
```

**Good**:
```markdown
Read PLAN.md, check all depends_on plans have SUMMARY.md files, then execute tasks.
```

**Why**: Executing before dependencies are ready causes build failures.

#### 12. Not Handling Checkpoints

**Bad** (in executor):
```markdown
Hit a `<task type="checkpoint:human-verify">`, execute it as if it were auto, commit the result.
```

**Good**:
```markdown
Hit a checkpoint task, STOP execution, write partial SUMMARY.md, return checkpoint metadata.
```

**Why**: Checkpoints require human input. Continuing past them breaks the workflow.

#### 13. Using `git add .` or `git add -A`

**Bad**:
```bash
git add .
git commit -m "feat(03-01): add auth"
```

**Good**:
```bash
git add src/auth/discord.ts src/auth/types.ts
git commit -m "feat(03-01): add Discord OAuth client"
```

**Why**: `git add .` can stage sensitive files (.env, credentials), unrelated changes, or generated files.

**Impact**: Sensitive data leaks, bloated commits.

#### 14. Skipping Tests

**Bad**:
```
Add new hook script, don't create test file, push to CI.
```

**Good**:
```
Add new hook script, create corresponding test file, run `npm test`, verify coverage >=70%, push to CI.
```

**Why**: Untested code breaks in production. Target is 70% coverage.

#### 15. Inconsistent Frontmatter

**Bad** (PLAN.md):
```yaml
---
phase: 3
plan: 03-01
type: feature
---
```

**Good**:
```yaml
---
phase: "03-authentication"
plan: "03-01"
type: "feature"
wave: 1
depends_on: []
files_modified:
  - "src/auth/discord.ts"
autonomous: true
must_haves:
  truths: []
  artifacts: []
  key_links: []
---
```

**Why**: Incomplete frontmatter breaks plan parsing, verification, and dependency checks.

---

## Summary

### The Towline Development Philosophy

1. **Context is precious**. Protect the main orchestrator context by delegating heavy work to subagents.

2. **State is on disk**. Skills and agents communicate through files, not messages.

3. **Agents are black boxes**. Each agent has a clear input/output contract. Agents never read other agent definitions.

4. **Gates provide safety**. Users control the pace of the workflow through config toggles.

5. **One task, one commit**. Atomic commits keep git history clean and enable easy rollback.

6. **Cross-platform always**. Use `path.join()`, CommonJS, and test on all platforms.

7. **Test everything**. Target 70% coverage minimum, all platforms must pass CI.

8. **UI is branded**. Always use `TOWLINE ►` banners, never `GSD ►` or other brands.

### Where to Start

**Adding a new skill**:
1. Create `plugins/dev/skills/{name}/SKILL.md` with frontmatter
2. Add Context Budget section
3. Write orchestration flow (inline vs. delegate steps)
4. Reference templates and reference docs, don't inline them
5. Add command registration in `plugins/dev/commands/{name}.md`
6. Test manually with `claude --plugin-dir .`

**Adding a new agent**:
1. Create `plugins/dev/agents/towline-{name}.md` with frontmatter
2. Write agent-specific instructions
3. Define clear input/output contract
4. Update skills to spawn this agent via `subagent_type`

**Adding a new hook**:
1. Create `plugins/dev/scripts/{name}.js` (CommonJS)
2. Add hook registration in `plugins/dev/hooks/hooks.json`
3. Use `logHook()` from `hook-logger.js`
4. Create `tests/{name}.test.js`
5. Run `npm test` to verify
6. Test on Windows, macOS, Linux

**Modifying an existing component**:
1. Read this guide for relevant conventions
2. Check existing code for patterns
3. Make changes
4. Run `npm run lint`, `npm test`, `npm run validate`
5. Verify CI passes on all platforms
6. Commit with proper format: `{type}({scope}): {description}`

### Resources

- **CLAUDE.md**: User-facing plugin documentation
- **plugins/dev/references/**: Reference docs for skills and agents
- **plugins/dev/templates/**: EJS-style templates
- **tests/**: Jest test suite
- **.planning/**: Towline's own planning state (dogfood testing)

### Getting Help

- Run `/dev:help {skill-name}` to see skill documentation
- Run `/dev:health` to diagnose workflow issues
- Check `.planning/logs/hooks.jsonl` for hook execution logs
- Check CI logs for platform-specific failures

---

**This is a living document**. As Towline evolves, update this guide to reflect new patterns, conventions, and anti-patterns discovered through dogfooding and user feedback.
