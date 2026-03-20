---
name: ui-review
description: "Retroactive visual audit of UI implementation with 1-4 scoring per dimension."
allowed-tools: Read, Write, Bash, Glob, Grep, Task, AskUserQuestion
argument-hint: "<phase-number> [--url <dev-server-url>]"
---

**STOP -- DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes tokens. Begin executing Step 0 immediately.**

## Step 0 -- Banner

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► UI REVIEW                                 ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

## Step 1 -- Load State

Read the following files:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state load
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

If the user chooses option 1, proceed. If option 2, **STOP**. If option 3, tell them to run the config command and then re-run `/pbr:ui-review`.

## Step 3 -- Parse Arguments

Parse `$ARGUMENTS` for:

- **Phase number** (required): The phase to audit
- **--url flag** (optional): Dev server URL for visual inspection (e.g., `http://localhost:3000`)

If no phase number is provided, display usage and **STOP**:

```
Usage: /pbr:ui-review <phase-number> [--url <dev-server-url>]

Example: /pbr:ui-review 3 --url http://localhost:3000
```

## Step 4 -- Load UI-SPEC.md

Look for the UI-SPEC.md in the phase directory:

```
.planning/phases/{NN}-{slug}/UI-SPEC.md
```

If the file does not exist, display:

```
No UI-SPEC.md found for phase {N}.

Run /pbr:ui-phase {N} first to generate design contracts,
then re-run /pbr:ui-review {N} to audit against them.
```

Then **STOP**. The review requires a baseline specification to score against.

## Step 5 -- Spawn UI Checker Agent

**CRITICAL: Agent type rule** -- ALWAYS use `subagent_type: "pbr:ui-checker"`. NEVER use `general-purpose` or other non-PBR agent types. The PreToolUse hook will block non-PBR agents.

Spawn a Task with:

- `subagent_type: "pbr:ui-checker"`
- Spawn prompt containing:
  - Project root path
  - Phase number
  - Path to UI-SPEC.md: `.planning/phases/{NN}-{slug}/UI-SPEC.md`
  - Dev server URL (if provided via `--url`, otherwise state "not provided")
  - Target output path: `.planning/phases/{NN}-{slug}/UI-REVIEW.md`
  - Instruction to review UI implementation against the spec and score each dimension

Display before spawning:

```
Spawning ui-checker... (est. 2-5 min)
```

Wait for agent completion.

## Step 6 -- Read Results

Read the generated `UI-REVIEW.md` from `.planning/phases/{NN}-{slug}/UI-REVIEW.md`.

If the file was not created, report the error and **STOP**.

## Step 7 -- Present Scores

Display the audit results in a formatted table:

```
UI Visual Audit -- Phase {N}
============================

Dimension    | Score | Notes
-------------|-------|------
Copywriting  | X/4   | {summary}
Visuals      | X/4   | {summary}
Color        | X/4   | {summary}
Typography   | X/4   | {summary}
Spacing      | X/4   | {summary}
Experience   | X/4   | {summary}
-------------|-------|------
Overall      | X.X/4 | Visual verification: Yes/No

Legend: 1 = Poor, 2 = Below Average, 3 = Good, 4 = Excellent
```

If the overall score is below 2.5, highlight areas needing attention:

```
Dimensions below threshold (< 3):
- {dimension}: {specific issue and suggested fix}
```

## Step 8 -- Offer Next Steps

Ask the user:

```
Would you like to address any of these findings?

Options:
1. Fix specific dimensions -- I'll suggest /pbr:do tasks for improvements
2. Re-run audit -- after making manual changes
3. Accept results -- no changes needed
```

## Step 9 -- Suggest Fixes

If the user wants to fix specific dimensions, for each dimension they want to address, suggest a `/pbr:do` task:

```
Suggested tasks:

/pbr:do "Improve {dimension} for phase {N}: {specific improvement from review}"
```

List each dimension the user selected with a concrete, actionable task description derived from the ui-checker's feedback.

## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.
Reference: `skills/shared/agent-type-resolution.md` for agent type fallback when spawning Task() subagents.

Additionally for this skill:

- Delegate ALL analysis to the ui-checker subagent -- do not analyze UI implementation yourself
- Read UI-REVIEW.md output for score presentation, extract only the scoring table and key findings
- Keep follow-up suggestions concise -- one `/pbr:do` command per dimension

Reference: `skills/shared/commit-planning-docs.md` -- if `planning.commit_docs` is true, commit UI-REVIEW.md.

## Anti-Patterns

1. DO NOT analyze the UI implementation yourself -- the ui-checker agent does this
2. DO NOT read agent .md files -- auto-loaded via subagent_type
3. DO NOT modify UI-REVIEW.md directly -- the agent handles writes
4. DO NOT skip the UI eligibility check (Step 2)
5. DO NOT skip the UI-SPEC.md existence check (Step 4) -- review requires a baseline
6. DO NOT use general-purpose agents -- always use `pbr:ui-checker`
7. DO NOT implement fixes yourself -- suggest `/pbr:do` tasks for the user
