---
name: ui-phase
description: "Generate UI-SPEC.md design contracts for frontend-heavy phases."
allowed-tools: Read, Write, Bash, Glob, Grep, Task, AskUserQuestion
argument-hint: "<phase-number> [--url <dev-server-url>]"
---

**STOP -- DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes tokens. Begin executing Step 0 immediately.**

## Step 0 -- Banner

**Before ANY tool calls**, display this banner:

```
PLAN-BUILD-RUN > UI DESIGN CONTRACTS
```

Then proceed to Step 1.

## Step 1 -- Load State

Read the following files:

```bash
node $HOME/.claude/plan-build-run/bin/pbr-tools.cjs state load
```

Also read `.planning/config.json` to check for `ui.enabled` setting.

## Step 2 -- Check UI Eligibility

Determine whether the UI pipeline should be active:

**2a.** If `config.ui.enabled` is explicitly `true`, proceed to Step 3.

**2b.** If `config.ui.enabled` is explicitly `false`, display:

```
UI pipeline is disabled. Enable with: /pbr:config set ui.enabled true
```

Then **STOP**. Do not proceed further.

**2c.** If `ui.enabled` is not set (undefined), auto-detect frontend project:

1. Check `package.json` for dependencies or devDependencies containing: `react`, `vue`, `angular`, `svelte`, `next`, `nuxt`, `solid-js`, `preact`, `lit`, `@angular/core`
2. Check for `index.html` in the project root or `public/` or `src/`
3. Check for `.css`, `.scss`, `.less`, `.sass` files in `src/` or `styles/`

If frontend indicators are found, proceed to Step 3.

If NO frontend indicators are found, ask the user:

```
This doesn't appear to be a frontend project. No frontend frameworks
or UI files were detected.

Options:
1. Continue anyway (I know this project has UI components)
2. Cancel (this project doesn't need UI design contracts)
3. Enable permanently: /pbr:config set ui.enabled true
```

If the user chooses option 1, proceed. If option 2, **STOP**. If option 3, tell them to run the config command and then re-run `/pbr:ui-phase`.

## Step 3 -- Parse Arguments

Parse `$ARGUMENTS` for:

- **Phase number** (required): The phase to generate design contracts for
- **--url flag** (optional): Dev server URL for visual inspection (e.g., `http://localhost:3000`)

If no phase number is provided, display usage and **STOP**:

```
Usage: /pbr:ui-phase <phase-number> [--url <dev-server-url>]

Example: /pbr:ui-phase 3 --url http://localhost:3000
```

## Step 4 -- Load Phase Context

Read the ROADMAP.md to find the phase directory matching the given phase number:

```bash
node $HOME/.claude/plan-build-run/bin/pbr-tools.cjs state load
```

Read the phase directory at `.planning/phases/{NN}-{slug}/` to understand the phase goal and any existing plans. Extract the phase goal from ROADMAP.md for the given phase number.

If the phase directory does not exist, display an error and **STOP**:

```
Phase {N} not found. Check /pbr:status for available phases.
```

## Step 5 -- Spawn UI Researcher Agent

**CRITICAL: Agent type rule** -- ALWAYS use `subagent_type: "pbr:ui-researcher"`. NEVER use `general-purpose` or other non-PBR agent types. The PreToolUse hook will block non-PBR agents.

Spawn a Task with:

- `subagent_type: "pbr:ui-researcher"`
- Spawn prompt containing:
  - Project root path
  - Phase number and phase goal
  - Dev server URL (if provided via `--url`, otherwise state "not provided")
  - Target output path: `.planning/phases/{NN}-{slug}/UI-SPEC.md`
  - Instruction to analyze the frontend codebase and generate design contracts

Display before spawning:

```
Spawning ui-researcher... (est. 2-5 min)
```

Wait for agent completion.

## Step 6 -- Present Results

Read the generated `UI-SPEC.md` from `.planning/phases/{NN}-{slug}/UI-SPEC.md`.

If the file was not created, report the error and **STOP**.

Present a summary to the user showing:

- Number of dimensions covered
- Key design decisions proposed
- Any constraints or patterns identified

## Step 7 -- Confirm Design Contracts

Ask the user:

```
Review the design contracts above. Options:
1. Confirm -- lock UI-SPEC.md and proceed to planning
2. Request changes -- describe what to adjust
3. Cancel -- discard UI-SPEC.md
```

If the user requests changes, describe what they want adjusted and re-spawn the ui-researcher agent with the feedback. Repeat until confirmed or cancelled.

If cancelled, delete the UI-SPEC.md file and **STOP**.

## Step 8 -- Success

Display:

```
UI-SPEC.md locked for phase {N}.

Next step: Run /pbr:plan-phase {N} to plan with these design contracts.
The planner will reference UI-SPEC.md as a constraint alongside CONTEXT.md.
```

## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.

Additionally for this skill:

- Delegate ALL analysis to the ui-researcher subagent -- do not analyze frontend code yourself
- Read UI-SPEC.md output only for summary presentation, not deep inspection
- If user requests multiple rounds of changes, warn about context budget after 3 iterations

## Anti-Patterns

1. DO NOT analyze the frontend codebase yourself -- the ui-researcher agent does this
2. DO NOT read agent .md files -- auto-loaded via subagent_type
3. DO NOT modify UI-SPEC.md directly -- the agent handles writes
4. DO NOT skip the UI eligibility check (Step 2)
5. DO NOT proceed without user confirmation of design contracts
6. DO NOT use general-purpose agents -- always use `pbr:ui-researcher`
