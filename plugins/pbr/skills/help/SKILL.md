---
name: help
description: "Command reference and workflow guide for Plan-Build-Run."
allowed-tools: Read, Bash
argument-hint: "[command]"
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes tokens. Begin executing Step 1 immediately.**

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► COMMAND REFERENCE                          ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

# /pbr:help — Plan-Build-Run Command Reference

## Step 1 — Contextual Help (Single Command)

If `$ARGUMENTS` contains a command name (e.g., `plan`, `build`, `review`, `config`, `quick`), show detailed help for just that command:

1. Run this command to get metadata for the requested skill:

```bash
pbr-tools skill-metadata $ARGUMENTS
```

2. Parse the JSON response.

3. **If the response contains a `name` field** (success): Display a formatted detail block:

| Field | Value |
|-------|-------|
| **Command** | `/pbr:{name}` |
| **Description** | `{description}` |
| **Arguments** | `{argument_hint}` (or "None" if empty) |
| **Allowed Tools** | `{allowed_tools}` joined with ", " |

4. **If the response contains an `error` field** (not found): Tell the user the command was not found. List available commands from the `available` array, formatted as `/pbr:{name}`.

5. **STOP after displaying single-skill help.** Do not continue to Step 2.

## Step 2 — Full Help (All Commands)

If no argument was provided, display the full command reference:

1. Run this command to get all skills:

```bash
pbr-tools help
```

2. Parse the JSON response. The result has a `.skills` array of objects with `name`, `description`, and `argument_hint` fields.

3. Group the skills into these categories based on skill name:

- **Core Workflow**: begin, plan, build, review, test
- **Planning & Discovery**: explore, discuss, import, scan, list-phase-assumptions
- **Execution**: quick, continue, autonomous, do
- **Verification & Debugging**: debug, health, validate-phase, ui-review, ui-phase
- **Session Management**: status, pause, resume, undo, continue
- **Project Management**: milestone, todo, note, config, setup, release, ship
- **Analysis & Utilities**: audit, audit-fix, dashboard, intel, profile, profile-user, session-report, statusline

Skills not matching any category go under **Other**.

4. For each category, display a markdown table:

| Command | Description |
|---------|-------------|
| `/pbr:{name} {argument_hint}` | `{description}` |

Format command names as `/pbr:{name}` with the `argument_hint` appended (space-separated) when present.

5. After the CLI-driven command tables, display the static sections below.

## Choose Your Command

Not sure which command to use? Follow this guide:

| I want to... | Command |
|--------------|---------|
| Start a new project | `/pbr:new-project` |
| Fix a bug or investigate an error | `/pbr:debug` |
| Think through an idea or approach | `/pbr:explore` |
| Do a small task (≤3 files) | `/pbr:quick` |
| Plan a complex change (4+ files) | `/pbr:plan-phase <N>` |
| See where I am and what's next | `/pbr:progress` |
| Auto-execute the next step | `/pbr:continue` |
| Describe something and let PBR route it | `/pbr:do <description>` |
| Lock decisions for a specific phase | `/pbr:discuss-phase <N>` |
| Check project health | `/pbr:health` |

## Typical Workflow

```
/pbr:new-project              ← Start project, define requirements, create roadmap
/pbr:discuss-phase 1          ← (optional) Talk through phase details
/pbr:plan-phase 1             ← Plan the first phase
/pbr:execute-phase 1            ← Build it
/pbr:verify-work 1           ← Verify it works
/pbr:plan-phase 2             ← Plan the next phase
...                     ← Repeat plan → build → review
/pbr:complete-milestone ← Archive when done
```

**Shortcut**: After `/pbr:new-project`, run `/pbr:continue` repeatedly — it auto-advances through plan → build → review → next phase, stopping at milestones and errors.

## status vs continue vs do

| | `/pbr:progress` | `/pbr:continue` | `/pbr:do <text>` |
|-|---------------|-----------------|-------------------|
| **Purpose** | Dashboard — show progress, suggest next | Auto-execute the next logical step | Route freeform text to a skill |
| **Reads state?** | Yes (full scan) | Yes (minimal) | No |
| **Modifies files?** | Never | Yes (via delegation) | Depends on routed skill |
| **Asks questions?** | If multiple options | Never — fully automatic | Only if ambiguous |
| **Use when...** | You want to see where you are before deciding | You trust PBR to pick and run the next step | You'd rather describe a task in plain English |
| **Hard stops** | N/A | Milestones, checkpoints, errors, verification gaps, session phase limit | N/A |

## Quick Reference

- **Context strategy**: `aggressive` (delegate everything) | `balanced` | `minimal` (run inline)
- **Depth**: `quick` (skip research, ~50% cheaper) | `standard` | `comprehensive` (~2x cost)
- **State files**: `.planning/STATE.md` (position), `.planning/ROADMAP.md` (phases), `.planning/config.json` (settings)
- **Configure**: `/pbr:settings` to change depth, models, gates, parallelization
- **List agents**: Run `claude agents` in your terminal to see all registered PBR agents and verify loading
- **Tip**: Use `/pbr:quick` for creative/visual work where structured planning adds overhead without benefit.
- **PR hygiene**: When creating PRs from a Plan-Build-Run project, `.planning/` commits can be filtered using phase branching (`git.branching: phase`) which squash-merges code-only changes to main.
- **Session cycling**: After `session_phase_limit` phases (default 3), PBR auto-pauses and resumes with a fresh context. In TMUX, this is seamless. Configure via `/pbr:settings session_phase_limit <N>`.
- **Seeds**: `/pbr:explore` can create seed files (`.planning/seeds/`) with trigger conditions. Seeds auto-inject into planning when their trigger phase is reached.

## Getting Started

```


╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

- `/pbr:new-project` — start a new project
- `/pbr:progress` — check current project status
- `/pbr:settings` — configure workflow settings
- `/pbr:help <command>` — detailed help for a specific command


```

## Getting Help

- GitHub Issues: https://github.com/SienkLogic/plan-build-run/issues
- README: https://github.com/SienkLogic/plan-build-run
