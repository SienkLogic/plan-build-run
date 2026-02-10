---
name: config
description: "Configure Towline settings. Model selection, workflow toggles, depth, gates, and parallelization."
allowed-tools: Read, Write, Bash, Glob
---

# /dev:config — Configure Towline

## Overview

Reads and writes `.planning/config.json`. Interactive configuration with AskUserQuestion.

## Flow

### 1. Load Current Config

Read `.planning/config.json`. If it doesn't exist, inform user: "No Towline project found. Run /dev:begin first."

### 2. Parse Arguments

If `$ARGUMENTS` is provided, handle direct setting:
- `depth quick|standard|comprehensive` — set depth directly
- `model <agent> <model>` — set model for specific agent (e.g., `model executor sonnet`)
- `model-profile quality|balanced|budget|adaptive` — set all models at once using a preset
- `gate <gate-name> on|off` — toggle a gate
- `feature <feature-name> on|off` — toggle a feature (e.g., `feature auto_continue on`)
- `git branching none|phase|milestone|disabled` — set branching strategy
- `git mode disabled` — disable git integration entirely
- `show` — display current config (default when no args)

### 3. Interactive Mode (no arguments or just `show`)

Display current configuration in a readable format:

```
Towline Configuration
=====================

Workflow:
  Depth: standard
  Mode: interactive
  Context Strategy: aggressive

Features:
  ✓ Structured planning    ✓ Goal verification
  ✓ Context isolation       ✓ Atomic commits
  ✓ Session persistence     ✓ Research phase
  ✓ Plan checking           ✗ TDD mode
  ✓ Status line             ✗ Auto-continue
  ✗ Auto-advance           ✗ Team discussions

Models:
  Researcher: sonnet    Planner: inherit     Executor: inherit
  Verifier: sonnet      Int-Checker: sonnet  Debugger: inherit
  Mapper: sonnet        Synthesizer: haiku

Parallelization:
  Enabled: true    Max concurrent: 3
  Plan-level: true  Task-level: false
  Use Teams: false

Git:
  Mode: enabled      Branching: none
  Commit docs: true
  Commit format: {type}({phase}-{plan}): {description}

Gates:
  ✓ Confirm project   ✓ Confirm roadmap   ✓ Confirm plan
  ✗ Confirm execute    ✓ Confirm transition ✓ Issues review
```

Then ask: "What would you like to change?" with options:
- Depth (quick/standard/comprehensive)
- Models (per-agent model selection)
- Model profile (quality/balanced/budget/adaptive — sets all models at once)
- Features (toggle individual features)
- Gates (toggle confirmation gates)
- Parallelization settings
- Git settings (branching strategy, mode)

### 4. Apply Changes

Update config.json with new values. Show what changed:
```
Updated:
  depth: standard → quick
  models.executor: inherit → sonnet
```

## Config Schema

See `skills/begin/templates/config.json.tmpl` for the full schema with defaults.

### Version Migration

If config `version` is older than current (2), run migration:
- v1 → v2: Add missing fields with defaults, rename `model_profile` → per-agent `models` object

## Model Profile Presets

The `model-profile` command sets all agent models at once:

| Profile | researcher | planner | executor | verifier | int-checker | debugger | mapper | synthesizer |
|---------|-----------|---------|----------|----------|-------------|----------|--------|-------------|
| `quality` | opus | opus | opus | opus | sonnet | opus | sonnet | sonnet |
| `balanced` | sonnet | inherit | inherit | sonnet | sonnet | inherit | sonnet | haiku |
| `budget` | haiku | haiku | haiku | haiku | haiku | haiku | haiku | haiku |
| `adaptive` | sonnet | sonnet | inherit | sonnet | haiku | inherit | haiku | haiku |

`balanced` is the default and matches the initial config template. `adaptive` front-loads intelligence in research/planning and uses lighter models for mechanical work.

## Feature Reference

| Feature | Key | Default | Description |
|---------|-----|---------|-------------|
| Auto-continue | `features.auto_continue` | `false` | Automatically spawn continuation agents without user prompt |
| Auto-advance | `features.auto_advance` | `false` | Chain build→review→plan automatically in autonomous mode |
| Team discussions | `features.team_discussions` | `false` | Enable team-based discussion workflows |

**Team boundaries**: Teams are NEVER used for execution, planning, or verification. Teams are only for discussion and brainstorming workflows. All execution, planning, and verification use single-agent Task() spawns with proper subagent types.

## Validation

- `depth` must be one of: quick, standard, comprehensive
- `models.*` must be one of: sonnet, inherit, haiku, opus
- `context_strategy` must be one of: aggressive, balanced, minimal
- `git.branching` must be one of: none, phase, milestone, disabled
- `git.mode` must be one of: enabled, disabled. When `disabled`, no git commands are run (no commits, no branching). Useful for prototyping or non-git projects.
- Boolean fields must be true/false
