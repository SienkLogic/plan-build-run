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

---

## Orchestration Flow: Standard Planning

Execute these steps in order for standard `/dev:plan <N>` invocations.

---

### Step 1: Parse and Validate (inline)

**Tooling shortcut**: Instead of reading and parsing STATE.md, ROADMAP.md, and config.json manually, you can run:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/towline-tools.js state load
```
This returns a JSON object with `config`, `state`, `roadmap`, `current_phase`, and `progress`. For plan inventory, use `plan-index <phase>`. For comprehensive phase status, use `phase-info <phase>`. Falls back gracefully if the script is missing — parse files manually in that case.

1. Parse `$ARGUMENTS` for phase number and flags
2. Read `.planning/config.json` for settings
3. Validate:
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

Read all relevant context files. This context will be inlined into subagent prompts.

```
1. Read .planning/ROADMAP.md — extract current phase goal, dependencies, requirements
2. Read .planning/REQUIREMENTS.md — extract requirements mapped to this phase
3. Read .planning/CONTEXT.md (if exists) — extract locked decisions, constraints, deferred ideas
4. Read .planning/phases/{NN}-{slug}/CONTEXT.md (if exists) — extract phase-specific locked decisions, deferred ideas, and discretion areas captured by /dev:discuss
5. Read .planning/config.json — extract feature flags, depth, model settings
6. Read prior SUMMARY.md files using digest-select depth (see below)
7. Read .planning/research/SUMMARY.md (if exists) — extract research findings
```

**Digest-select depth for prior SUMMARYs (Step 6):**

Not all prior phase SUMMARYs need the same level of detail. Use selective depth to save tokens:

| Relationship to current phase | Read depth |
|-------------------------------|------------|
| Direct dependency (listed in `depends_on` in ROADMAP.md) | Frontmatter + "Key Decisions" section only. The planner reads full bodies from disk in its own context. |
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
- `features.research_phase` is `false` in config
- `depth` is `quick` in config

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
- `<prior_work>` - preceding phase SUMMARY.md data (status, key files, exports, patterns)
- `<research>` - RESEARCH.md content if it exists
- `<config>` - max tasks, parallelization, TDD mode from config.json
- `<planning_instructions>` - phase-specific planning rules and output path

Wait for the planner to complete.

---

### Step 6: Plan Validation (delegated, conditional)

**Skip this step if:**
- `features.plan_checking` is `false` in config

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
- `<plans_to_check>` - inline the FULL content of each PLAN.md file in the phase directory
- `<phase_context>` - phase goal and requirement IDs
- `<context>` - inline project-level and phase-level CONTEXT.md files

**Process checker results:**
- If `VERIFICATION PASSED`: proceed to Step 8
- If issues found: proceed to Step 7

---

### Step 7: Revision Loop (max 3 iterations)

If the plan checker found issues:

**Iteration 1-3:**

1. Read the checker's issue report
2. If only INFO-level issues: proceed to Step 8 (acceptable)
3. If BLOCKER or WARNING issues:
   a. Re-spawn the planner Task() with the checker feedback appended:

Read `skills/plan/templates/revision-prompt.md.tmpl` and use it as the prompt template for the revision planner. Fill in the placeholders:
- `<original_plans>` - inline the current plan files
- `<checker_feedback>` - inline the checker's issue report
- `<revision_instructions>` - specific revision guidance

   b. After revision, re-run the checker (back to Step 6)

**After 3 iterations:**
If issues persist after 3 revision cycles:
- Present remaining issues to the user
- Ask: "These issues remain after 3 revision attempts. Proceed anyway, or do you want to adjust the approach?"
- If proceed: go to Step 8
- If adjust: discuss with user and re-enter Step 5 with updated context

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
