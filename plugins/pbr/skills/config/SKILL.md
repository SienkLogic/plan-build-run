---
name: config
description: "Configure settings: depth, model profiles, features, git, and gates."
allowed-tools: Read, Write, Bash, Glob, AskUserQuestion
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes ~7,600 tokens. Begin executing Step 1 immediately.**

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► CONFIGURATION                              ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

# /pbr:config — Configure Plan-Build-Run

## Overview

Reads and writes `.planning/config.json`. Interactive configuration with AskUserQuestion.

## References

- `references/config-reference.md` — Full config.json schema (54 fields, 16 feature toggles, validation rules)
- `references/model-profiles.md` — Model selection guide for agent spawning

## Flow

### 1. Load Current Config

Read `.planning/config.json`. If it doesn't exist, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

No Plan-Build-Run project found.

**To fix:** Run `/pbr:begin` first.
```

### 2. Parse Arguments

If `$ARGUMENTS` is provided, handle direct setting:
- `depth quick|standard|comprehensive` — set depth directly
- `model <agent> <model>` — set model for specific agent (e.g., `model executor sonnet`)
- `model-profile quality|balanced|budget|adaptive` — set all models at once using a preset
- `gate <gate-name> on|off` — toggle a gate
- `feature <feature-name> on|off` — toggle a feature (e.g., `feature auto_continue on`). When the user specifies a feature name without the `features.` prefix, automatically prepend `features.` before writing to config.
- `git branching none|phase|milestone|disabled` — set branching strategy
- `git mode disabled` — disable git integration entirely
- `show` — display current config (default when no args)

### 3. Interactive Mode (no arguments or just `show`)

Display current configuration in a readable format:

```
Plan-Build-Run Configuration
=====================

Workflow:
  Depth: standard (balanced)
    Research: on   Plan-check: on   Verify: on
    Scan mappers: 4   Debug rounds: 5   Inline verify: off
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

Status Line:
  Sections: [phase, plan, status, context]
  Brand: PLAN-BUILD-RUN
  Context bar: 20 chars, green<50%, yellow<80%

Spinner Tips: (none configured — using defaults)
```

Then present the configuration menu using the **settings-category-select** pattern (see `skills/shared/gate-prompts.md`):

Use AskUserQuestion:
  question: "What would you like to configure?"
  header: "Configure"
  options:
    - label: "Depth"          description: "quick/standard/comprehensive"
    - label: "Model profile"  description: "quality/balanced/budget/adaptive"
    - label: "Features"       description: "Toggle workflow features, gates, status line"
    - label: "Git settings"      description: "branching strategy, commit mode"
    - label: "Save as defaults"  description: "Save current config as user-level defaults for new projects"
  multiSelect: false

Note: The original 7 categories are condensed to 5. "Models" (per-agent) is accessible through "Model profile" with a follow-up option. "Gates", "Parallelization", and "Status Line" are grouped under "Features". "Save as defaults" exports to ~/.claude/pbr-defaults.json.

**Follow-up based on selection:**

If user selects "Depth":
Use AskUserQuestion:
  question: "Select workflow depth"
  header: "Depth"
  options:
    - label: "Quick"           description: "Budget mode: skip research/plan-check/verifier, 2 scan mappers, ~1-3 fewer spawns per phase"
    - label: "Standard"        description: "Balanced mode: conditional research, full plan-check and verification, 4 scan mappers (default)"
    - label: "Comprehensive"   description: "Thorough mode: always research, always verify, inline verification, 4 scan mappers"
  multiSelect: false

After setting depth, the profile is automatically resolved. Show the user the effective settings:
  "Depth set to {value}. Effective profile:"
  Then display the profile summary (research, plan-check, verify, scan mappers, debug rounds, inline verify).

To resolve the profile, run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js config resolve-depth`

If the user wants to override a specific profile setting, they can set `depth_profiles.{depth}.{key}` directly.
For example: to use quick mode but keep plan-checking, the user would set depth to quick and then override:
  `/pbr:config` -> Features -> Plan checking -> Enable
This writes `depth_profiles.quick.features.plan_checking: true` to config.json.

If user selects "Model profile":
Use the **model-profile-select** pattern:
Use AskUserQuestion:
  question: "Select model profile"
  header: "Profile"
  options:
    - label: "Quality"    description: "opus for all agents (highest cost)"
    - label: "Balanced"   description: "sonnet/inherit mix (default)"
    - label: "Budget"     description: "haiku for all agents (lowest cost)"
    - label: "Adaptive"   description: "sonnet planning, haiku execution"
  multiSelect: false

If user asks for per-agent model selection (typed "models" or "per-agent"), present individual agent selection as plain text: list the agents and ask which one to change, then ask for the model. This is a freeform flow because agent names are dynamic.

If user selects "Features":
List all features and gates with current status, then use the **toggle-confirm** pattern for each change.
**Feature name normalization:** When toggling a feature, if the user specifies a bare name (e.g., `inline_verify`), normalize it to `features.inline_verify` before writing to config. All feature flags live under the `features.*` namespace in config.json.
Use AskUserQuestion:
  question: "Enable {feature_name}?"
  header: "Toggle"
  options:
    - label: "Enable"   description: "Turn this feature on"
    - label: "Disable"  description: "Turn this feature off"
  multiSelect: false

Repeat for each feature the user wants to change. Show updated status after each toggle.

If user selects "Git settings":
Use AskUserQuestion:
  question: "Select branching strategy"
  header: "Branching"
  options:
    - label: "None"        description: "All work on current branch"
    - label: "Phase"       description: "New branch per phase"
    - label: "Milestone"   description: "New branch per milestone"
    - label: "Disabled"    description: "No git integration"
  multiSelect: false

If user selects "Save as defaults":
Save current project config as user-level defaults for future projects:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js" config save-defaults
```

Display: "Saved your preferences to ~/.claude/pbr-defaults.json. New projects created with /pbr:setup will use these as starting values."

If user types something else (freeform): interpret as a direct setting command and handle via Step 2 argument parsing logic.

### 4. Apply Changes

Update config.json with new values. Show what changed with a branded completion:
```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► CONFIG UPDATED ✓                           ║
╚══════════════════════════════════════════════════════════════╝

Updated:
  depth: standard → quick
  models.executor: inherit → sonnet



╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**Continue your workflow** — settings saved

`/pbr:status`

<sub>`/clear` first → fresh context window</sub>



**Also available:**
- `/pbr:continue` — execute next logical step
- `/pbr:config` — change more settings


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
