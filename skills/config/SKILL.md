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
- `gate <gate-name> on|off` — toggle a gate
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
  ✓ Status line

Models:
  Researcher: sonnet    Planner: inherit     Executor: inherit
  Verifier: sonnet      Int-Checker: sonnet  Debugger: inherit
  Mapper: sonnet        Synthesizer: haiku

Parallelization:
  Enabled: true    Max concurrent: 3
  Plan-level: true  Task-level: false
  Use Teams: false

Git:
  Branching: none    Commit docs: true
  Commit format: {type}({phase}-{plan}): {description}

Gates:
  ✓ Confirm project   ✓ Confirm roadmap   ✓ Confirm plan
  ✗ Confirm execute    ✓ Confirm transition ✓ Issues review
```

Then ask: "What would you like to change?" with options:
- Depth (quick/standard/comprehensive)
- Models (per-agent model selection)
- Features (toggle individual features)
- Gates (toggle confirmation gates)
- Parallelization settings

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

## Validation

- `depth` must be one of: quick, standard, comprehensive
- `models.*` must be one of: sonnet, inherit, haiku, opus
- `context_strategy` must be one of: aggressive, balanced, minimal
- `git.branching` must be one of: none, phase, milestone
- Boolean fields must be true/false
