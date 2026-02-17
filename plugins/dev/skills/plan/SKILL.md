---
name: plan
description: "Create a detailed plan for a phase. Research, plan, and verify before building."
allowed-tools: Read, Write, Bash, Glob, Grep, WebFetch, WebSearch, Task, AskUserQuestion
argument-hint: "<phase-number> [--skip-research] [--assumptions] [--gaps] | add | insert <N> | remove <N>"
---

# /dev:plan — Phase Planning

You are the orchestrator for `/dev:plan`. This skill creates detailed, executable plans for a specific phase. Plans are the bridge between the roadmap and actual code — they must be specific enough for an executor agent to follow mechanically. Your job is to stay lean, delegate heavy work to Task() subagents, and keep the user's main context window clean.

## Context Budget

Keep the main orchestrator context lean. Follow these rules:
- **Never** read agent definition files (agents/*.md) — subagent_type auto-loads them
- **Never** inline large files into Task() prompts — tell agents to read files from disk instead
- **Minimize** reading subagent output into main context — read only plan frontmatter for summaries
- **Delegate** all research and planning work to subagents — the orchestrator routes, it doesn't plan
- **Before spawning agents**: If you've already consumed significant context (large file reads, multiple subagent results), warn the user: "Context budget is getting heavy. Consider running `/dev:pause` after this step to checkpoint progress." Suggest pause proactively rather than waiting for compaction.

## Prerequisites

- `.planning/config.json` exists (run `/dev:begin` first)
- `.planning/ROADMAP.md` exists with at least one phase
- `.planning/REQUIREMENTS.md` exists

---

## Argument Parsing

Parse `$ARGUMENTS` according to `skills/shared/phase-argument-parsing.md`.

### Standard Invocation

`/dev:plan <N>` — Plan phase N

Parse the phase number and optional flags:

| Argument | Meaning |
|----------|---------|
| `3` | Plan phase 3 |
| `3 --skip-research` | Plan phase 3, skip research step |
| `3 --assumptions` | Surface assumptions before planning phase 3 |
| `3 --gaps` | Create gap-closure plans for phase 3 (from VERIFICATION.md) |
| (no number) | Use current phase from STATE.md |

### Subcommands

| Subcommand | Meaning |
|------------|---------|
| `add` | Append a new phase to the end of the roadmap |
| `insert <N>` | Insert a new phase at position N (uses decimal numbering) |
| `remove <N>` | Remove phase N from the roadmap |

### Freeform Text Guard

**Before any context loading**, check whether `$ARGUMENTS` looks like freeform text rather than a valid invocation. Valid patterns are:

- Empty (no arguments)
- A phase number: integer (`3`, `03`) or decimal (`3.1`)
- A subcommand: `add`, `insert <N>`, `remove <N>`
- A phase number followed by flags: `3 --skip-research`, `3 --assumptions`, `3 --gaps`
- The word `check` (legacy alias)

If `$ARGUMENTS` does NOT match any of these patterns — i.e., it contains freeform words that are not a recognized subcommand or flag — then **stop execution** and respond:

```
`/dev:plan` expects a phase number or subcommand.

Usage:
  /dev:plan <N>              Plan phase N
  /dev:plan <N> --gaps       Create gap-closure plans
  /dev:plan add              Add a new phase
  /dev:plan insert <N>       Insert a phase at position N
  /dev:plan remove <N>       Remove phase N
```

Then suggest the appropriate skill based on the text content:

| If the text looks like... | Suggest |
|---------------------------|---------|
| A task, idea, or feature request | `/dev:todo` to capture it, or `/dev:explore` to investigate |
| A bug or debugging request | `/dev:debug` to investigate the issue |
| A review or quality concern | `/dev:review` to assess existing work |
| Anything else | `/dev:explore` for open-ended work |

Do NOT proceed with planning. The user needs to use the correct skill.

---

## Orchestration Flow: Standard Planning

Execute these steps in order for standard `/dev:plan <N>` invocations.

---

### Step 1: Parse and Validate (inline)

Reference: `skills/shared/config-loading.md` for the tooling shortcut (`state load`, `plan-index`, `phase-info`) and config field reference.

1. Parse `$ARGUMENTS` for phase number and flags
2. Read `.planning/config.json` for settings (see config-loading.md for field reference)
3. Resolve depth profile: run `node ${CLAUDE_PLUGIN_ROOT}/scripts/towline-tools.js config resolve-depth` to get the effective feature/gate settings for the current depth. Store the result for use in later gating decisions.
4. Validate:
   - Phase exists in ROADMAP.md
   - Phase directory exists at `.planning/phases/{NN}-{slug}/`
   - Phase does not already have PLAN.md files (unless user confirms re-planning)
4. If no phase number given, read current phase from `.planning/STATE.md`
5. **CONTEXT.md existence check**: If the phase is non-trivial (has 2+ requirements or success criteria), check whether `.planning/CONTEXT.md` exists. If missing, warn: "Phase {N} has no CONTEXT.md. Consider running `/dev:discuss {N}` first to capture your preferences. Continue anyway?" If user says no, stop. If yes, continue.

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

Not all prior phase SUMMARYs need the same level of detail. Use selective depth to save tokens:

| Relationship to current phase | Read depth |
|-------------------------------|------------|
| Direct dependency (listed in `depends_on` in ROADMAP.md) | Frontmatter only (status, provides, key_files). The planner reads full bodies from disk via Read tool. |
| 1 phase back from a dependency (transitive) | Frontmatter only (`provides`, `key_files`, `patterns`) |
| 2+ phases back | Skip entirely |

Example: If planning Phase 5 which depends on Phase 4, and Phase 4 depends on Phase 3:
- Phase 4 SUMMARYs: read full body
- Phase 3 SUMMARYs: frontmatter only
- Phases 1-2 SUMMARYs: skip

This saves ~500 tokens per skipped SUMMARY for large projects.

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

To check: run `node ${CLAUDE_PLUGIN_ROOT}/scripts/towline-tools.js config resolve-depth` and read `profile["features.research_phase"]`. This replaces checking `features.research_phase` and `depth` separately -- the depth profile already incorporates both.

**Conditional research (standard/balanced mode):** When the profile has `features.research_phase: true`, also check whether `.planning/codebase/` or `.planning/research/` already contains relevant context for this phase. If substantial context exists (>3 files in codebase/ or a RESEARCH.md mentioning this phase's technologies), skip research and note: "Skipping research -- existing context found in {directory}." This implements the balanced mode's "conditional research" behavior.

**If research is needed:**

Spawn a researcher Task():

```
Task({
  subagent_type: "dev:towline-researcher",
  prompt: <phase research prompt>
})

NOTE: The dev:towline-researcher subagent type auto-loads the agent definition. Do NOT inline it.
```

#### Phase Research Prompt Template

Read `skills/plan/templates/researcher-prompt.md.tmpl` and use it as the prompt template for spawning the researcher agent. Fill in the placeholders with phase-specific context:
- `{NN}` - phase number (zero-padded)
- `{phase name}` - phase name from roadmap
- `{goal from roadmap}` - phase goal statement
- `{REQ-IDs mapped to this phase}` - requirement IDs
- `{dependencies from roadmap}` - dependency list
- Inline relevant CONTEXT.md sections and prior SUMMARY.md content into the `<project_context>` block

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

### Step 5: Planning (delegated)

Spawn the planner Task() with all context inlined:

```
Task({
  subagent_type: "dev:towline-planner",
  prompt: <planning prompt>
})

NOTE: The dev:towline-planner subagent type auto-loads the agent definition. Do NOT inline it.
```

#### Planning Prompt Template

Read `skills/plan/templates/planner-prompt.md.tmpl` and use it as the prompt template for spawning the planner agent. Fill in all placeholder blocks with phase-specific context:
- `<phase_context>` - phase number, directory, goal, requirements, dependencies, success criteria
- `<project_context>` - locked decisions, user constraints, deferred ideas, phase-specific decisions
- `<prior_work>` - manifest table of preceding phase SUMMARY.md file paths with status and one-line exports (NOT full bodies)
- `<research>` - file path to RESEARCH.md if it exists (NOT inlined content)
- `<config>` - max tasks, parallelization, TDD mode from config.json
- `<planning_instructions>` - phase-specific planning rules and output path

Wait for the planner to complete.

---

### Step 6: Plan Validation (delegated, conditional)

**Skip this step if:**
- Depth profile has `features.plan_checking: false`

To check: use the resolved depth profile from Step 1. The profile consolidates the depth setting and any user overrides into a single boolean.

**If validation is enabled:**

Spawn the plan checker Task():

```
Task({
  subagent_type: "dev:towline-plan-checker",
  prompt: <checker prompt>
})

NOTE: The dev:towline-plan-checker subagent type auto-loads the agent definition. Do NOT inline it.
```

#### Checker Prompt Template

Read `skills/plan/templates/checker-prompt.md.tmpl` and use it as the prompt template for spawning the plan checker agent. Fill in the placeholders:
- `<plans_to_check>` - manifest table of PLAN.md file paths (checker reads each via Read tool)
- `<phase_context>` - phase goal and requirement IDs
- `<context>` - file paths to project-level and phase-level CONTEXT.md files (checker reads via Read tool)

**Process checker results:**
- If `VERIFICATION PASSED`: proceed to Step 8
- If issues found: proceed to Step 7

---

### Step 7: Revision Loop (max 3 iterations)

Reference: `skills/shared/revision-loop.md` for the full Check-Revise-Escalate pattern.

Follow the revision loop pattern with:
- **Producer**: towline-planner (re-spawned with `skills/plan/templates/revision-prompt.md.tmpl`)
- **Checker**: towline-plan-checker (back to Step 6)
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
  node ${CLAUDE_PLUGIN_ROOT}/scripts/towline-tools.js roadmap update-plans {phase} 0 {N}
  node ${CLAUDE_PLUGIN_ROOT}/scripts/towline-tools.js roadmap update-status {phase} planned
  node ${CLAUDE_PLUGIN_ROOT}/scripts/towline-tools.js state update status planned
  node ${CLAUDE_PLUGIN_ROOT}/scripts/towline-tools.js state update last_activity now
  ```

  1. Open `.planning/ROADMAP.md`
  2. Find the `## Progress` table
  3. Locate the row matching this phase number
  4. Update the `Plans Complete` column to `0/{N}` where N = number of plan files just created
  5. Update the `Status` column to `planned`
  6. Save the file — do NOT skip this step
- Update STATE.md: set current phase plan status to "planned"
- **If `features.auto_advance` is `true` AND `mode` is `autonomous`:** Chain directly to build: `Skill({ skill: "dev:build", args: "{N}" })`. This continues the build→review→plan→build cycle automatically.
- **Otherwise:** Suggest next action: `/dev:build {N}`

---

## Orchestration Flow: Subcommands

### Subcommand: `add`

1. Read `.planning/ROADMAP.md`
2. Calculate next phase number (last phase + 1)
3. Ask user: "What's the goal for this new phase?"
4. Ask user: "What requirements does it address?" (show available unassigned REQ-IDs)
5. Ask user: "What phases does it depend on?"
6. Append phase to ROADMAP.md
7. Create phase directory: `.planning/phases/{NN}-{slug}/`
8. Update STATE.md if needed
9. Suggest: `/dev:plan {N}` to plan the new phase

### Subcommand: `insert <N>`

Reference: `skills/plan/decimal-phase-calc.md` for decimal numbering rules.

1. Read `.planning/ROADMAP.md`
2. Calculate decimal phase number:
   - If inserting at position 3: becomes 3.1
   - If 3.1 already exists: becomes 3.2
   - Etc. (see decimal-phase-calc.md)
3. Ask user for phase goal, requirements, dependencies
4. Insert phase into ROADMAP.md at the correct position
5. Create phase directory: `.planning/phases/{NN.M}-{slug}/`
6. Update dependencies of subsequent phases if affected
7. Suggest: `/dev:plan {N.M}` to plan the new phase

### Subcommand: `remove <N>`

1. Read `.planning/ROADMAP.md`
2. Validate:
   - Phase must exist
   - Phase must be in `pending` or `not started` status (cannot remove completed/in-progress phases)
   - No other phases depend on this phase (or user confirms breaking dependencies)
3. Confirm with user: "Remove Phase {N}: {name}? This will delete the phase directory and renumber subsequent phases."
4. If confirmed:
   - Delete `.planning/phases/{NN}-{slug}/` directory
   - Remove phase from ROADMAP.md
   - Renumber subsequent phases (N+1 becomes N, etc.)
   - Update all `depends_on` references in ROADMAP.md
   - Update STATE.md if needed

---

## Orchestration Flow: Gap Closure (`--gaps`)

When invoked with `--gaps`:

1. Read `.planning/phases/{NN}-{slug}/VERIFICATION.md`
   - If no VERIFICATION.md exists: tell user "No verification report found. Run `/dev:review {N}` first."
2. Extract all gaps from the verification report
3. Spawn planner Task() in Gap Closure mode:

Read `skills/plan/templates/gap-closure-prompt.md.tmpl` and use it as the prompt template for the gap closure planner. Fill in the placeholders:
- `<verification_report>` - inline the FULL VERIFICATION.md content
- `<existing_plans>` - inline all existing PLAN.md files for the phase
- `<gap_closure_instructions>` - specify output path and gap_closure frontmatter flag

4. After gap-closure plans are created:
   - Run plan checker (if enabled)
   - Present to user for approval
   - Suggest: `/dev:build {N} --gaps-only`

---

## Error Handling

### Phase not found
If the specified phase doesn't exist in ROADMAP.md:
- "Phase {N} not found. Run `/dev:status` to see available phases."

### Missing prerequisites
If REQUIREMENTS.md or ROADMAP.md don't exist:
- "Project not initialized. Run `/dev:begin` first."

### Research agent fails
If the researcher Task() fails:
- Continue without research: "Research failed. Planning without phase-specific research. This may result in less accurate plans."

### Planner agent fails
If the planner Task() fails:
- Report the error to user
- Suggest: "Try again with `/dev:plan {N} --skip-research`" or "Check `.planning/CONTEXT.md` for conflicting constraints"

### Checker loops forever
After 3 revision iterations without passing:
- Present remaining issues
- Ask user to decide: proceed or intervene

---

## Files Created/Modified by /dev:plan

| File | Purpose | When |
|------|---------|------|
| `.planning/phases/{NN}-{slug}/RESEARCH.md` | Phase-specific research | Step 4 |
| `.planning/phases/{NN}-{slug}/{phase}-{NN}-PLAN.md` | Executable plan files | Step 5 |
| `.planning/CONTEXT.md` | Updated with assumptions | Step 3 (--assumptions) |
| `.planning/ROADMAP.md` | Plans Complete + Status → `planned`; updated for add/insert/remove | Step 8, Subcommands |
| `.planning/STATE.md` | Updated with plan status | Step 8 |

---

## Completion

After planning completes, present:

Use the branded stage banner from `references/ui-formatting.md`:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TOWLINE ► PLANNING PHASE {N}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
───────────────────────────────────────────────────────────────

## ▶ Next Up

**Build Phase {N}** — execute these plans

/dev:build {N}

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- /dev:plan {N} --assumptions — review assumptions first
- /dev:discuss {N} — talk through details before building

───────────────────────────────────────────────────────────────
```
