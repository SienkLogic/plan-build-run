---
name: plan
description: "Create a detailed plan for a phase. Research, plan, and verify before building."
allowed-tools: Read, Write, Bash, Glob, Grep, WebFetch, WebSearch, Task
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

1. Parse `$ARGUMENTS` for phase number and flags
2. Read `.planning/config.json` for settings
3. Validate:
   - Phase exists in ROADMAP.md
   - Phase directory exists at `.planning/phases/{NN}-{slug}/`
   - Phase does not already have PLAN.md files (unless user confirms re-planning)
4. If no phase number given, read current phase from `.planning/STATE.md`
5. **CONTEXT.md existence check**: If the phase is non-trivial (has 2+ requirements or success criteria), check whether `.planning/CONTEXT.md` exists. If missing, warn: "Phase {N} has no CONTEXT.md. Consider running `/dev:discuss {N}` first to capture your preferences. Continue anyway?" If user says no, stop. If yes, continue.

**If phase already has plans:**
- Tell user: "Phase {N} already has plans. Re-plan from scratch? This will replace existing plans."
- If yes: delete existing PLAN.md files in the phase directory
- If no: stop

---

### Step 2: Load Context (inline)

Read all relevant context files. This context will be inlined into subagent prompts.

```
1. Read .planning/ROADMAP.md — extract current phase goal, dependencies, requirements
2. Read .planning/REQUIREMENTS.md — extract requirements mapped to this phase
3. Read .planning/CONTEXT.md (if exists) — extract locked decisions, constraints, deferred ideas
4. Read .planning/config.json — extract feature flags, depth, model settings
5. Read prior SUMMARY.md files from preceding phases — extract what's already been built
6. Read .planning/research/SUMMARY.md (if exists) — extract research findings
```

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

```
You are the towline-researcher agent operating in Phase Research mode.

<phase_context>
Phase: {NN} - {phase name}
Phase goal: {goal from roadmap}
Phase requirements: {REQ-IDs mapped to this phase}
Phase depends on: {dependencies from roadmap}
</phase_context>

<project_context>
[Inline relevant sections of CONTEXT.md — locked decisions, constraints]
[Inline relevant prior SUMMARY.md content — what's already built]
[Inline research SUMMARY.md if it exists — prior research findings]
</project_context>

<research_questions>
Research these specific questions for this phase:
1. What is the best implementation approach for {phase goal}?
2. What libraries/packages are needed?
3. What are the common pitfalls for this type of work?
4. What configuration is needed?
5. How does this integrate with what's already been built?
</research_questions>

Write your findings to .planning/phases/{NN}-{slug}/RESEARCH.md using the Phase Research output format. Use the Write tool.
```

Wait for the researcher to complete before proceeding.

---

### Step 4.5: Seed Scanning (inline, before planning)

Before spawning the planner, scan `.planning/seeds/` for seeds whose trigger matches the current phase:

1. Glob for `.planning/seeds/*.md`
2. For each seed file, read its frontmatter and check the `trigger` field
3. A seed matches if:
   - `trigger` equals the current phase number (e.g., `trigger: 3`)
   - `trigger` equals the phase slug (e.g., `trigger: authentication`)
   - `trigger` equals `*` (always matches)
4. If matching seeds are found, present them to the user:
   ```
   Found {N} seeds related to Phase {NN}:
     - {seed_name}: {seed description}
     - {seed_name}: {seed description}

   Include them in planning? [yes/no/pick]
   ```
5. If user says `yes`: include all matching seed content in the planner's context
6. If user says `pick`: let user select which seeds to include
7. If user says `no`: proceed without seeds
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

```
You are the towline-planner agent operating in Standard Planning mode.

<phase_context>
Phase: {NN} - {phase name}
Phase directory: .planning/phases/{NN}-{slug}/
Phase goal: {goal from roadmap}
Phase requirements:
{For each REQ-ID mapped to this phase:}
- {REQ-ID}: {requirement text}
Phase depends on: {dependencies}
Success criteria from roadmap:
{Success criteria for this phase}
</phase_context>

<project_context>
Locked decisions:
{All locked decisions from CONTEXT.md}

User constraints:
{All constraints from CONTEXT.md}

Deferred ideas (DO NOT plan for these):
{All deferred ideas from CONTEXT.md}
</project_context>

<prior_work>
{For each preceding phase that has SUMMARY.md files:}
Phase {M}: {name}
- Status: {complete/partial}
- Key files created: {list}
- Exports available: {provides from SUMMARY.md}
- Patterns established: {patterns from SUMMARY.md}
</prior_work>

<research>
{If RESEARCH.md exists for this phase: inline the full content}
{If not: "No phase-specific research conducted."}
{If research SUMMARY.md exists: inline relevant sections}
</research>

<config>
Max tasks per plan: {from config.json}
Parallelization enabled: {from config.json}
TDD mode: {from config.json}
</config>

<planning_instructions>
Create executable plans for this phase following your Standard Planning mode instructions.

Key rules:
1. Apply goal-backward methodology — derive must-haves first
2. 2-3 tasks per plan, 5-8 files per plan maximum
3. Assign wave numbers for parallel execution
4. Every task needs all 5 elements: name, files, action, verify, done
5. Honor all locked decisions from CONTEXT.md
6. Do NOT include deferred ideas
7. Write plan files to: .planning/phases/{NN}-{slug}/{phase}-{plan_num}-PLAN.md

Use the Write tool to create each plan file.
</planning_instructions>
```

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

```
You are the towline-plan-checker agent.

<plans_to_check>
{For each PLAN.md file in .planning/phases/{NN}-{slug}/:}
--- Plan File: {filename} ---
[Inline the FULL content of each plan file]
--- End Plan File ---
</plans_to_check>

<phase_context>
Phase goal: {goal from roadmap}
Phase requirements: {REQ-IDs}
</phase_context>

<context>
{Inline CONTEXT.md if it exists, for Dimension 7 checking}
</context>

Run all 7 verification dimensions on these plans. Return your structured report.
Do NOT write any files. Return your findings as your response text.
```

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

```
You are the towline-planner agent operating in Revision Mode.

<original_plans>
[Inline the current plan files]
</original_plans>

<checker_feedback>
[Inline the checker's issue report]
</checker_feedback>

<revision_instructions>
Revise the plans to address all BLOCKER and WARNING issues. Follow your Revision Mode instructions.
Preserve task IDs that don't need changes. Write updated plan files to the same paths.
</revision_instructions>
```

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

Approve these plans?
-> yes — proceed to build
-> changes — request adjustments
-> abort — cancel planning
```

**If user requests changes:**
- Discuss what needs to change
- Re-enter Step 5 with updated context/constraints
- Or make small inline edits to plan files directly

**If user approves:**
- **CONTEXT.md compliance reporting**: If `.planning/CONTEXT.md` exists, compare all locked decisions against the generated plans. Print: "CONTEXT.md compliance: {M}/{N} locked decisions mapped to tasks" where M = locked decisions that are reflected in at least one task, N = total locked decisions. If any locked decisions are unmapped, list them as warnings.
- Update STATE.md: set current phase plan status to "planned"
- **Update ROADMAP.md**: In the Phase Overview table, set this phase's Status column from `pending` to `planned`
- Suggest next action: `/dev:build {N}`

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

```
You are the towline-planner agent operating in Gap Closure mode.

<verification_report>
[Inline the FULL VERIFICATION.md content]
</verification_report>

<existing_plans>
[Inline all existing PLAN.md files for this phase]
</existing_plans>

<gap_closure_instructions>
Read the verification report and create targeted plans to close each gap.
Follow your Gap Closure Mode instructions.
Number new plans starting after the last existing plan number.
Set gap_closure: true in the frontmatter of each new plan.
Write gap-closure plan files to: .planning/phases/{NN}-{slug}/
</gap_closure_instructions>
```

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
| `.planning/ROADMAP.md` | Phase status → `planned`; updated for add/insert/remove | Step 8, Subcommands |
| `.planning/STATE.md` | Updated with plan status | Step 8 |

---

## Completion

After planning completes, present:

```
Phase {N}: {name} — {plan_count} plans created

Plans:
  {phase}-01: {name} (Wave 1, {task_count} tasks)
  {phase}-02: {name} (Wave 1, {task_count} tasks)
  {phase}-03: {name} (Wave 2, {task_count} tasks)

Wave execution:
  Wave 1: Plans 01, 02 (parallel)
  Wave 2: Plan 03

What's next?
-> /dev:build {N} — execute these plans
-> /dev:plan {N} --assumptions — review assumptions first
-> /dev:discuss {N} — talk through details before building
```
