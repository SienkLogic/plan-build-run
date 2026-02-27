---
name: plan
description: "Create a detailed plan for a phase. Research, plan, and verify before building."
allowed-tools: Read, Write, Bash, Glob, Grep, WebFetch, WebSearch, Task, AskUserQuestion, Skill
argument-hint: "<phase-number> [--skip-research] [--assumptions] [--gaps] | add | insert <N> | remove <N>"
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes ~7,600 tokens. Begin executing Step 1 immediately.**

# /pbr:plan — Phase Planning

You are the orchestrator for `/pbr:plan`. This skill creates detailed, executable plans for a specific phase. Plans are the bridge between the roadmap and actual code — they must be specific enough for an executor agent to follow mechanically. Your job is to stay lean, delegate heavy work to Task() subagents, and keep the user's main context window clean.

## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.

Additionally for this skill:
- **Minimize** reading subagent output — read only plan frontmatter for summaries
- **Delegate** all research and planning work to subagents — the orchestrator routes, it doesn't plan

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► PLANNING PHASE {N}                         ║
╚══════════════════════════════════════════════════════════════╝
```

Where `{N}` is the phase number from `$ARGUMENTS`. Then proceed to Step 1.

## Prerequisites

- `.planning/config.json` exists (run `/pbr:begin` first)
- `.planning/ROADMAP.md` exists with at least one phase
- `.planning/REQUIREMENTS.md` exists

---

## Argument Parsing

Parse `$ARGUMENTS` according to `skills/shared/phase-argument-parsing.md`.

### Standard Invocation

`/pbr:plan <N>` — Plan phase N

Parse the phase number and optional flags:

| Argument | Meaning |
|----------|---------|
| `3` | Plan phase 3 |
| `3 --skip-research` | Plan phase 3, skip research step |
| `3 --assumptions` | Surface assumptions before planning phase 3 |
| `3 --gaps` | Create gap-closure plans for phase 3 (from VERIFICATION.md) |
| `3 --teams` | Plan phase 3 using specialist agent teams |
| (no number) | Use current phase from STATE.md |

### Subcommands

| Subcommand | Meaning |
|------------|---------|
| `add` | Append a new phase to the end of the roadmap |
| `insert <N>` | Insert a new phase at position N (uses decimal numbering) |
| `remove <N>` | Remove phase N from the roadmap |

### Freeform Text Guard — CRITICAL

**STOP. Before ANY context loading or Step 1 work**, you MUST check whether `$ARGUMENTS` looks like freeform text rather than a valid invocation. This check is non-negotiable. Valid patterns are:

- Empty (no arguments)
- A phase number: integer (`3`, `03`) or decimal (`3.1`)
- A subcommand: `add`, `insert <N>`, `remove <N>`
- A phase number followed by flags: `3 --skip-research`, `3 --assumptions`, `3 --gaps`, `3 --teams`
- The word `check` (legacy alias)

If `$ARGUMENTS` does NOT match any of these patterns — i.e., it contains freeform words that are not a recognized subcommand or flag — then **stop execution** and respond:

```
`/pbr:plan` expects a phase number or subcommand.

Usage:
  /pbr:plan <N>              Plan phase N
  /pbr:plan <N> --gaps       Create gap-closure plans
  /pbr:plan add              Add a new phase
  /pbr:plan insert <N>       Insert a phase at position N
  /pbr:plan remove <N>       Remove phase N
```

Then suggest the appropriate skill based on the text content:

| If the text looks like... | Suggest |
|---------------------------|---------|
| A task, idea, or feature request | `/pbr:todo` to capture it, or `/pbr:explore` to investigate |
| A bug or debugging request | `/pbr:debug` to investigate the issue |
| A review or quality concern | `/pbr:review` to assess existing work |
| Anything else | `/pbr:explore` for open-ended work |

Do NOT proceed with planning. The user needs to use the correct skill.

**Self-check**: If you reach Step 1 without having matched a valid argument pattern above, you have a bug. Stop immediately and show the usage block.

---

## Orchestration Flow: Standard Planning

Execute these steps in order for standard `/pbr:plan <N>` invocations.

---

### Step 1: Parse and Validate (inline)

Reference: `skills/shared/config-loading.md` for the tooling shortcut (`state load`, `plan-index`, `phase-info`) and config field reference.

1. Parse `$ARGUMENTS` for phase number and flags
2. Read `.planning/config.json` for settings (see config-loading.md for field reference)
   **CRITICAL: Write .active-skill NOW.** Write the text "plan" to `.planning/.active-skill` using the Write tool.
3. Resolve depth profile: run `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js config resolve-depth` to get the effective feature/gate settings for the current depth. Store the result for use in later gating decisions.
4. Validate:
   - Phase exists in ROADMAP.md
   - Phase directory exists at `.planning/phases/{NN}-{slug}/`
   - Phase does not already have PLAN.md files (unless user confirms re-planning)
5. If no phase number given, read current phase from `.planning/STATE.md`
6. **CONTEXT.md existence check**: If the phase is non-trivial (has 2+ requirements or success criteria), check whether a CONTEXT.md exists at EITHER `.planning/CONTEXT.md` (project-level) OR `.planning/phases/{NN}-{slug}/CONTEXT.md` (phase-level). If NEITHER exists, warn: "Phase {N} has no CONTEXT.md. Consider running `/pbr:discuss {N}` first to capture your preferences. Continue anyway?" If user says no, stop. If yes, continue. If at least one exists, proceed without warning.

**If phase already has plans:**
- Use AskUserQuestion (pattern: yes-no from `skills/shared/gate-prompts.md`):
  question: "Phase {N} already has plans. Re-plan from scratch?"
  header: "Re-plan?"
  options:
    - label: "Yes"  description: "Delete existing plans and create new ones"
    - label: "No"   description: "Keep existing plans unchanged"
- If "Yes": delete existing PLAN.md files in the phase directory
- If "No" or "Other": stop

---

### Step 2: Load Context (inline)

**Init-first pattern**: When spawning agents, pass the output of `node plugins/pbr/scripts/pbr-tools.js init plan-phase {N}` as context rather than having the agent read multiple files separately. This reduces file reads and prevents context-loading failures.

Read context file PATHS and metadata. Build lean context bundles for subagent prompts — include paths and one-line descriptions, NOT full file bodies. Agents have the Read tool and will pull file contents on-demand.

```
1. Read .planning/ROADMAP.md — extract current phase goal, dependencies, requirements
2. Read .planning/REQUIREMENTS.md — extract requirements mapped to this phase
3. Read .planning/CONTEXT.md (if exists) — extract only the `## Decision Summary` section (everything from `## Decision Summary` to the next `##` heading). If no Decision Summary section exists (legacy CONTEXT.md), fall back to extracting the full `## Decisions (LOCKED...)` and `## Deferred Ideas` sections.
4. Read .planning/phases/{NN}-{slug}/CONTEXT.md (if exists) — extract only the `## Decision Summary` section. Fall back to full locked decisions + deferred sections if no Decision Summary exists.
5. Read .planning/config.json — extract feature flags, depth, model settings
6. List prior SUMMARY.md file paths and extract frontmatter metadata only (status, provides, key_files). Do NOT read full SUMMARY bodies — agents pull these on-demand via Read tool.
7. Read .planning/research/SUMMARY.md (if exists) — extract research findings
```

**Digest-select depth for prior SUMMARYs (Step 6):**

Reference: `skills/shared/digest-select.md` for the full depth rules and examples. In short: direct dependencies get frontmatter + key decisions, transitive get frontmatter only, 2+ back get skipped.

Collect all of this into a context bundle that will be passed to subagents.

---

### Step 3: Assumption Surfacing (inline, if `--assumptions` flag)

**IMPORTANT**: This step is FREE (no subagents). It happens entirely inline.

Before spawning any agents, present your assumptions about how this phase should be approached:

```
Phase {N}: {Name}
Goal: {from roadmap}

My assumptions about this phase:

1. **Approach**: I'm assuming we'll {approach}
   - Correct? [yes/no/adjust]

2. **Key technology**: I'm assuming we'll use {tech}
   - Correct? [yes/no/adjust]

3. **Architecture**: I'm assuming {architectural assumption}
   - Correct? [yes/no/adjust]

4. **Scope boundary**: I'm assuming {scope assumption}
   - Correct? [yes/no/adjust]
```

For each assumption the user corrects:
- Record the correction
- These corrections become additional CONTEXT.md entries

After all assumptions are confirmed/corrected:
- Update `.planning/CONTEXT.md` with any new locked decisions
- Continue to Step 4

---

### Step 4: Phase Research (delegated, conditional)

**Skip this step if ANY of these are true:**
- `--skip-research` flag is set
- `--gaps` flag is set
- Depth profile has `features.research_phase: false`

To check: run `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js config resolve-depth` and read `profile["features.research_phase"]`. This replaces checking `features.research_phase` and `depth` separately -- the depth profile already incorporates both.

**Conditional research (standard/balanced mode):** When the profile has `features.research_phase: true`, also check whether `.planning/codebase/` or `.planning/research/` already contains relevant context for this phase. If substantial context exists (>3 files in codebase/ or a RESEARCH.md mentioning this phase's technologies), skip research and note: "Skipping research -- existing context found in {directory}." This implements the balanced mode's "conditional research" behavior.

**If research is needed:**

Display to the user: `◐ Spawning researcher...`

Spawn a researcher Task():

```
Task({
  subagent_type: "pbr:researcher",
  prompt: <phase research prompt>
})

NOTE: The pbr:researcher subagent type auto-loads the agent definition. Do NOT inline it.
```

**Path resolution**: Before constructing the agent prompt, resolve `${CLAUDE_PLUGIN_ROOT}` to its absolute path. Do not pass the variable literally in prompts — Task() contexts may not expand it. Use the resolved absolute path for any pbr-tools.js or template references included in the prompt.

#### Phase Research Prompt Template

Read `skills/plan/templates/researcher-prompt.md.tmpl` and use it as the prompt template for spawning the researcher agent. Fill in the placeholders with phase-specific context:
- `{NN}` - phase number (zero-padded)
- `{phase name}` - phase name from roadmap
- `{goal from roadmap}` - phase goal statement
- `{REQ-IDs mapped to this phase}` - requirement IDs
- `{dependencies from roadmap}` - dependency list
- Fill `<project_context>` and `<prior_work>` blocks per the shared partial (`templates/prompt-partials/phase-project-context.md.tmpl`): Decision Summary for context, manifest table for prior work

**Prepend this block to the researcher prompt before sending:**
```
<files_to_read>
CRITICAL: Read these files BEFORE any other action:
1. .planning/ROADMAP.md — phase goals, dependencies, and structure
2. .planning/REQUIREMENTS.md — scoped requirements for this phase (if exists)
</files_to_read>
```

Wait for the researcher to complete before proceeding.

---

### Step 4.5: Seed Scanning (inline, before planning)

Before spawning the planner, scan `.planning/seeds/` for seeds whose trigger matches the current phase:

1. Glob for `.planning/seeds/*.md`
2. For each seed file, read its frontmatter and check the `trigger` field
3. A seed matches if ANY of these are true:
   - `trigger` equals the phase slug (e.g., `trigger: authentication`) — **preferred**
   - `trigger` is a substring of the phase directory name (e.g., `trigger: auth` matches `03-authentication`)
   - `trigger` equals the current phase number as integer (e.g., `trigger: 3`) — backward compatible but NOT recommended for new seeds (breaks with decimal phases like 3.1)
   - `trigger` equals `*` (always matches)
4. If matching seeds are found, present them to the user:
   ```
   Found {N} seeds related to Phase {NN}:
     - {seed_name}: {seed description}
     - {seed_name}: {seed description}
   ```

   Use AskUserQuestion (pattern: yes-no-pick from `skills/shared/gate-prompts.md`):
     question: "Include these {N} seeds in planning?"
     header: "Seeds?"
     options:
       - label: "Yes, all"     description: "Include all {N} matching seeds"
       - label: "Let me pick"  description: "Choose which seeds to include"
       - label: "No"           description: "Proceed without seeds"
5. If "Yes, all": include all matching seed content in the planner's context
6. If "Let me pick": present individual seeds for selection
7. If "No" or "Other": proceed without seeds
8. If no matching seeds found: proceed silently

---

### Step 4.6: Surface Deferred Ideas (inline, before planning)

Before spawning the planner, check `.planning/CONTEXT.md` for deferred ideas that may be relevant to this phase:

1. If `.planning/CONTEXT.md` does NOT exist, skip this step silently
2. If it exists, scan for sections named "Deferred Ideas", "Deferred", "Ideas", or "Seeds" (case-insensitive heading match)
3. For each deferred item found, check relevance to the current phase by comparing the item text against the phase goal, requirements, and slug
4. If relevant deferred items are found, present them to the user:
   ```
   Found {N} deferred idea(s) from previous discussions that may be relevant to Phase {NN}:
     - {deferred item summary}
     - {deferred item summary}
   ```
   Use AskUserQuestion (pattern: yes-no from `skills/shared/gate-prompts.md`):
     question: "Include these deferred ideas in the planning context?"
     header: "Deferred Ideas"
     options:
       - label: "Yes"  description: "Pass relevant deferred ideas to the planner"
       - label: "No"   description: "Proceed without deferred ideas"
5. If "Yes": append the relevant deferred items to the context bundle for the planner prompt (add them to the `<project_context>` block under a `Deferred ideas to consider:` heading)
6. If "No" or no relevant items found: proceed without changes

This is a lightweight relevance filter — do NOT spawn a subagent for this. Just match keywords from the deferred items against the phase goal and requirement text.

---

### Step 5: Planning (delegated)

#### Team Mode (--teams)

Reference: `references/agent-teams.md` for team role definitions and coordination details.

If `--teams` flag is set OR `config.parallelization.use_teams` is true:

1. Create the team output directory: `.planning/phases/{NN}-{slug}/team/`
2. Display to the user: `◐ Spawning 3 planners in parallel (architect, security, test)...`

   Spawn THREE planner agents in parallel using Task():

   **Agent 1 -- Architect**:
   - subagent_type: "pbr:planner"
   - Prompt includes: "You are the ARCHITECT role in a planning team. Focus on: structure, file boundaries, dependency ordering, wave assignment. Write your output to `.planning/phases/{NN}-{slug}/team/architect-PLAN.md`. Do NOT write final PLAN.md files -- your output will be synthesized."
   - Include phase goal, research doc paths, CONTEXT.md path in the prompt

   **Agent 2 -- Security Reviewer**:
   - subagent_type: "pbr:planner"
   - Prompt includes: "You are the SECURITY REVIEWER role in a planning team. Focus on: authentication checks, input validation tasks, secrets handling, permission boundaries. Write your output to `.planning/phases/{NN}-{slug}/team/security-PLAN.md`. Do NOT write final PLAN.md files."
   - Include same context as Agent 1

   **Agent 3 -- Test Designer**:
   - subagent_type: "pbr:planner"
   - Prompt includes: "You are the TEST DESIGNER role in a planning team. Focus on: test strategy, coverage targets, edge cases, which tasks should use TDD, integration test boundaries. Write your output to `.planning/phases/{NN}-{slug}/team/test-PLAN.md`. Do NOT write final PLAN.md files."
   - Include same context as Agent 1

3. Wait for all three to complete
4. Display to the user: `◐ Spawning synthesizer...`

   Spawn the synthesizer agent:
   - subagent_type: "pbr:synthesizer"
   - Prompt: "Read all files in `.planning/phases/{NN}-{slug}/team/`. Synthesize them into unified PLAN.md files in `.planning/phases/{NN}-{slug}/`. The architect output provides structure, the security output adds security-related tasks or checks, and the test output informs TDD flags and test tasks. Resolve any contradictions by preferring the architect's structure with security and test additions."
5. Proceed to plan checking as normal

If `--teams` is NOT set and `config.parallelization.use_teams` is false or unset, proceed with the existing single-planner flow below.

#### Single-Planner Flow (default)

Display to the user: `◐ Spawning planner...`

Spawn the planner Task() with all context inlined:

```
Task({
  subagent_type: "pbr:planner",
  prompt: <planning prompt>
})

NOTE: The pbr:planner subagent type auto-loads the agent definition.

After planner completes, check for completion markers: `## PLANNING COMPLETE`, `## PLANNING FAILED`, or `## PLANNING INCONCLUSIVE`. Route accordingly. Do NOT inline it.
```

**Path resolution**: Before constructing the agent prompt, resolve `${CLAUDE_PLUGIN_ROOT}` to its absolute path. Do not pass the variable literally in prompts — Task() contexts may not expand it. Use the resolved absolute path for any pbr-tools.js or template references included in the prompt.

#### Planning Prompt Template

Read `skills/plan/templates/planner-prompt.md.tmpl` and use it as the prompt template for spawning the planner agent. Fill in all placeholder blocks with phase-specific context:
- `<phase_context>` - phase number, directory, goal, requirements, dependencies, success criteria
- `<project_context>` - locked decisions, user constraints, deferred ideas, phase-specific decisions
- `<prior_work>` - manifest table of preceding phase SUMMARY.md file paths with status and one-line exports (NOT full bodies)
- `<research>` - file path to RESEARCH.md if it exists (NOT inlined content)
- `<config>` - max tasks, parallelization, TDD mode from config.json
- `<planning_instructions>` - phase-specific planning rules and output path

**Prepend this block to the planner prompt before sending:**
```
<files_to_read>
CRITICAL: Read these files BEFORE any other action:
1. .planning/CONTEXT.md — locked decisions and constraints (if exists)
2. .planning/ROADMAP.md — phase goals, dependencies, and structure
3. .planning/phases/{NN}-{slug}/RESEARCH.md — research findings (if exists)
</files_to_read>
```

Wait for the planner to complete.

After the planner returns, read the plan files it created to extract counts. Display a completion summary:

```
✓ Planner created {N} plan(s) across {M} wave(s)
```

Where `{N}` is the number of PLAN.md files written and `{M}` is the number of distinct wave values across those plans (from frontmatter).

### Step 5b: Spot-Check Planner Output

CRITICAL: Verify planner output before proceeding.

1. **PLAN files exist**: Check `.planning/phases/{NN}-{slug}/PLAN-*.md` files exist on disk
2. **Valid frontmatter**: Read first 20 lines of each PLAN file — verify `depends_on`, `files_modified`, `must_haves` fields present
3. **Task structure**: Verify at least one `<task>` block exists in each plan file
4. **Plan count matches**: Number of PLAN files matches what the planner reported

If ANY spot-check fails, present the user with options: **Retry** / **Continue anyway** / **Abort**

---

### Step 6: Plan Validation (delegated, conditional)

**Skip this step if:**
- Depth profile has `features.plan_checking: false`

To check: use the resolved depth profile from Step 1. The profile consolidates the depth setting and any user overrides into a single boolean.

**If validation is enabled:**

Display to the user: `◐ Spawning plan checker...`

Spawn the plan checker Task():

```
Task({
  subagent_type: "pbr:plan-checker",
  prompt: <checker prompt>
})

NOTE: The pbr:plan-checker subagent type auto-loads the agent definition. Do NOT inline it.
```

**Path resolution**: Before constructing the agent prompt, resolve `${CLAUDE_PLUGIN_ROOT}` to its absolute path. Do not pass the variable literally in prompts — Task() contexts may not expand it. Use the resolved absolute path for any pbr-tools.js or template references included in the prompt.

#### Checker Prompt Template

Read `skills/plan/templates/checker-prompt.md.tmpl` and use it as the prompt template for spawning the plan checker agent. Fill in the placeholders:
- `<plans_to_check>` - manifest table of PLAN.md file paths (checker reads each via Read tool)
- `<phase_context>` - phase goal and requirement IDs
- `<context>` - file paths to project-level and phase-level CONTEXT.md files (checker reads via Read tool)

**Prepend this block to the checker prompt before sending:**
```
<files_to_read>
CRITICAL: Read these files BEFORE any other action:
1. .planning/phases/{NN}-{slug}/PLAN-*.md — plan files to validate
2. .planning/CONTEXT.md — locked decisions to check against (if exists)
</files_to_read>
```

**Process checker results:**

After the plan checker returns, display its result:

- If `VERIFICATION PASSED`: display `✓ Plan checker: all plans passed` and proceed to Step 8
- If issues found: display `⚠ Plan checker found {N} issue(s) — entering revision loop` and proceed to Step 7

---

### Step 7: Revision Loop (max 3 iterations)

Reference: `skills/shared/revision-loop.md` for the full Check-Revise-Escalate pattern.

Follow the revision loop pattern with:
- **Producer**: planner (re-spawned with `skills/plan/templates/revision-prompt.md.tmpl`)
- **Checker**: plan-checker (back to Step 6)
- **Escalation**: present issues to user, offer "Proceed anyway" or "Adjust approach" (re-enter Step 5)

---

### Step 8: User Approval (inline, conditional)

**Skip if:**
- `gates.confirm_plan` is `false` in config
- `mode` is `autonomous` in config

**If approval is needed:**

Present a summary of all plans to the user:

```
Phase {N}: {name}
Plans: {count}

Plan {phase}-01: {plan name} (Wave {W}, {task_count} tasks)
  Must-haves: {list truths}
  Files: {list files_modified}
  Tasks:
    1. {task name}
    2. {task name}

Plan {phase}-02: {plan name} (Wave {W}, {task_count} tasks)
  ...

Wave execution order:
  Wave 1: Plan 01, Plan 02 (parallel)
  Wave 2: Plan 03 (depends on 01, 02)

Use AskUserQuestion (pattern: approve-revise-abort from `skills/shared/gate-prompts.md`):
  question: "Approve these {count} plans for Phase {N}?"
  header: "Approve?"
  options:
    - label: "Approve"          description: "Proceed to build phase"
    - label: "Request changes"  description: "Discuss adjustments before proceeding"
    - label: "Abort"            description: "Cancel planning for this phase"
```

**If user selects 'Request changes' or 'Other':**
- Discuss what needs to change
- Re-enter Step 5 with updated context/constraints
- Or make small inline edits to plan files directly

**If user selects 'Approve':**
- **CONTEXT.md compliance reporting**: If `.planning/CONTEXT.md` exists, compare all locked decisions against the generated plans. Print: "CONTEXT.md compliance: {M}/{N} locked decisions mapped to tasks" where M = locked decisions that are reflected in at least one task, N = total locked decisions. If any locked decisions are unmapped, list them as warnings.
- **Dependency fingerprinting**: For each dependency phase (phases that this phase depends on, per ROADMAP.md):
  1. Find all SUMMARY.md files in the dependency phase directory
  2. Compute a simple hash of each SUMMARY.md file (e.g., first 8 chars of a SHA-256 of the file content, or a simpler approach: use the file's byte length + last-modified timestamp as a fingerprint string)
  3. Add a `dependency_fingerprints` field to each plan's YAML frontmatter:
     ```yaml
     dependency_fingerprints:
       "01-01": "len:4856-mod:2025-02-08T09:40"
       "01-02": "len:4375-mod:2025-02-08T09:43"
     ```
  4. This allows the build skill to detect if dependency phases were re-built after this plan was created
- **Update ROADMAP.md Progress table** (REQUIRED — do this BEFORE updating STATE.md):

  **Tooling shortcut**: Use the CLI for atomic updates:
  ```bash
  node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js roadmap update-plans {phase} 0 {N}
  node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js roadmap update-status {phase} planned
  node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state update status planned
  node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state update last_activity now
  ```

  1. Open `.planning/ROADMAP.md`
  2. Find the `## Progress` table
  3. Locate the row matching this phase number
  4. Update the `Plans Complete` column to `0/{N}` where N = number of plan files just created
  5. Update the `Status` column to `planned`
  6. Save the file — do NOT skip this step
- Update STATE.md via CLI **(CRITICAL — update BOTH frontmatter AND body)**: set `status: "planned"`, `plans_total`, `last_command` in frontmatter AND update `Status:`, `Plan:` lines in body `## Current Position`

**Tooling shortcut**: `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state patch '{"status":"planned","last_command":"/pbr:plan {N}"}'`
- **If `features.auto_advance` is `true` AND `mode` is `autonomous`:** Chain directly to build: `Skill({ skill: "pbr:build", args: "{N}" })`. This continues the build→review→plan→build cycle automatically.
- **Otherwise:** Suggest next action: `/pbr:build {N}`

---

## Orchestration Flow: Subcommands

### Subcommand: `add`

**CRITICAL: Write .active-skill NOW.** Write the text "plan" to `.planning/.active-skill` using the Write tool.

1. Read `.planning/ROADMAP.md`
2. Calculate next phase number (last phase + 1)
3. Ask user: "What's the goal for this new phase?"
4. Ask user: "What requirements does it address?" (show available unassigned REQ-IDs)
5. Ask user: "What phases does it depend on?"
6. Append phase to ROADMAP.md
7. Create phase directory: `.planning/phases/{NN}-{slug}/`
8. Update STATE.md if needed
9. Suggest: `/pbr:plan {N}` to plan the new phase
10. Delete `.planning/.active-skill` if it exists.

### Subcommand: `insert <N>`

Reference: `skills/plan/decimal-phase-calc.md` for decimal numbering rules.

**CRITICAL: Write .active-skill NOW.** Write the text "plan" to `.planning/.active-skill` using the Write tool.

1. Read `.planning/ROADMAP.md`
2. Calculate decimal phase number:
   - If inserting at position 3: becomes 3.1
   - If 3.1 already exists: becomes 3.2
   - Etc. (see decimal-phase-calc.md)
3. Ask user for phase goal, requirements, dependencies
4. Insert phase into ROADMAP.md at the correct position
5. Create phase directory: `.planning/phases/{NN.M}-{slug}/`
6. Update dependencies of subsequent phases if affected
7. Suggest: `/pbr:plan {N.M}` to plan the new phase
8. Delete `.planning/.active-skill` if it exists.

### Subcommand: `remove <N>`

1. Read `.planning/ROADMAP.md`
2. Validate:
   - Phase must exist
   - Phase must be in `pending` or `not started` status (cannot remove completed/in-progress phases)
   - No other phases depend on this phase (or user confirms breaking dependencies)
3. **CRITICAL: Write .active-skill NOW.** Write the text "plan" to `.planning/.active-skill` using the Write tool.
4. Confirm with user: "Remove Phase {N}: {name}? This will delete the phase directory and renumber subsequent phases."
5. If confirmed:
   - Delete `.planning/phases/{NN}-{slug}/` directory
   - Remove phase from ROADMAP.md
   - Renumber subsequent phases (N+1 becomes N, etc.)
   - Update all `depends_on` references in ROADMAP.md
   - Update STATE.md if needed
6. Delete `.planning/.active-skill` if it exists.

---

## Orchestration Flow: Gap Closure (`--gaps`)

When invoked with `--gaps`:

1. Read `.planning/phases/{NN}-{slug}/VERIFICATION.md`
   - If no VERIFICATION.md exists: tell user "No verification report found. Run `/pbr:review {N}` first."
2. Extract all gaps from the verification report
3. Spawn planner Task() in Gap Closure mode:

Read `skills/plan/templates/gap-closure-prompt.md.tmpl` and use it as the prompt template for the gap closure planner. Fill in the placeholders:
- `<verification_report>` - inline the FULL VERIFICATION.md content
- `<existing_plans>` - inline all existing PLAN.md files for the phase
- `<gap_closure_instructions>` - specify output path and gap_closure frontmatter flag

4. After gap-closure plans are created:
   - Run plan checker (if enabled)
   - Present to user for approval
   - Suggest: `/pbr:build {N} --gaps-only`

---

## Error Handling

### Phase not found
If the specified phase doesn't exist in ROADMAP.md, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Phase {N} not found in ROADMAP.md.

**To fix:** Run `/pbr:status` to see available phases.
```

### Missing prerequisites
If REQUIREMENTS.md or ROADMAP.md don't exist, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Project not initialized. Missing REQUIREMENTS.md or ROADMAP.md.

**To fix:** Run `/pbr:begin` first.
```

### Research agent fails
If the researcher Task() fails, display:
```
⚠ Research agent failed. Planning without phase-specific research.
  This may result in less accurate plans.
```
Continue to the planning step.

### Planner agent fails
If the planner Task() fails, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Planner agent failed for Phase {N}.

**To fix:**
- Try again with `/pbr:plan {N} --skip-research`
- Check `.planning/CONTEXT.md` for conflicting constraints
```

### Checker loops forever
After 3 revision iterations without passing, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Plan checker failed to pass after 3 revision iterations for Phase {N}.

**To fix:**
- Review the remaining issues below and decide whether to proceed or revise manually
- Run `/pbr:plan {N}` to restart planning from scratch
```

Present remaining issues and ask user to decide: proceed or intervene.

---

## Files Created/Modified by /pbr:plan

| File | Purpose | When |
|------|---------|------|
| `.planning/phases/{NN}-{slug}/RESEARCH.md` | Phase-specific research | Step 4 |
| `.planning/phases/{NN}-{slug}/PLAN-{NN}.md` | Executable plan files | Step 5 |
| `.planning/CONTEXT.md` | Updated with assumptions | Step 3 (--assumptions) |
| `.planning/ROADMAP.md` | Plans Complete + Status → `planned`; updated for add/insert/remove | Step 8, Subcommands |
| `.planning/STATE.md` | Updated with plan status | Step 8 |

---

## Cleanup

Delete `.planning/.active-skill` if it exists. This must happen on all paths (success, partial, and failure) before reporting results.

## Completion

After planning completes, present:

Use the branded stage banner from `references/ui-formatting.md`:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► PLANNING PHASE {N} ✓                       ║
╚══════════════════════════════════════════════════════════════╝

**Phase {N}: {name}** — {plan_count} plans created

Plans:
  {phase}-01: {name} (Wave 1, {task_count} tasks)
  {phase}-02: {name} (Wave 1, {task_count} tasks)
  {phase}-03: {name} (Wave 2, {task_count} tasks)

Wave execution:
  Wave 1: Plans 01, 02 (parallel)
  Wave 2: Plan 03
```

Then use the "Next Up" routing block:
```


╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**Build Phase {N}** — execute these plans

/pbr:build {N}

<sub>/clear first → fresh context window</sub>



**Also available:**
- /pbr:plan {N} --assumptions — review assumptions first
- /pbr:discuss {N} — talk through details before building


```
