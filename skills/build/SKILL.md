---
name: build
description: "Execute all plans in a phase. Spawns agents to build in parallel, commits atomically."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task
argument-hint: "<phase-number> [--gaps-only] [--team]"
---

# /dev:build — Phase Execution

You are the orchestrator for `/dev:build`. This skill executes all plans in a phase by spawning executor agents. Plans are grouped by wave and executed in order — independent plans run in parallel, dependent plans wait. Your job is to stay lean, delegate ALL building work to Task() subagents, and keep the user's main context window clean.

## Prerequisites

- `.planning/config.json` exists
- Phase has been planned: `.planning/phases/{NN}-{slug}/` contains PLAN.md files
- Prior phase dependencies are completed (check SUMMARY.md files)

---

## Argument Parsing

Parse `$ARGUMENTS` according to `skills/shared/phase-argument-parsing.md`.

| Argument | Meaning |
|----------|---------|
| `3` | Build phase 3 |
| `3 --gaps-only` | Build only gap-closure plans in phase 3 |
| `3 --team` | Use Agent Teams for complex inter-agent coordination |
| (no number) | Use current phase from STATE.md |

---

## Orchestration Flow

Execute these steps in order.

---

### Step 1: Parse and Validate (inline)

1. Parse `$ARGUMENTS` for phase number and flags
2. Read `.planning/config.json` for parallelization, model, and gate settings
3. Validate:
   - Phase directory exists at `.planning/phases/{NN}-{slug}/`
   - PLAN.md files exist in the directory
   - Prior phase dependencies are met (check for SUMMARY.md files in dependency phases)
4. If no phase number given, read current phase from `.planning/STATE.md`
5. If `gates.confirm_execute` is true: ask user to confirm before proceeding

**Validation errors:**
- No plans found: "Phase {N} has no plans. Run `/dev:plan {N}` first."
- Dependencies incomplete: "Phase {N} depends on Phase {M}, which is not complete. Build Phase {M} first."

---

### Step 2: Load Config (inline)

Read configuration values needed for execution:

```
parallelization.enabled     — whether to run plans in parallel
parallelization.plan_level  — parallel at plan level (within a wave)
parallelization.max_concurrent_agents — max simultaneous executors
features.goal_verification  — run verifier after build
features.atomic_commits     — require atomic commits per task
planning.commit_docs        — commit planning docs after build
git.commit_format           — commit message format
git.branching               — branching strategy
```

---

### Step 3: Discover Plans (inline)

1. List all files matching `.planning/phases/{NN}-{slug}/*-PLAN.md`
2. If `--gaps-only` flag: filter to only plans with `gap_closure: true` in frontmatter
3. Read each plan file's YAML frontmatter to extract:
   - Plan ID
   - Wave number
   - Dependencies (depends_on)
   - Whether autonomous
4. Sort plans by plan number

**If no plans match filters:**
- With `--gaps-only`: "No gap-closure plans found. Run `/dev:plan {N} --gaps` first."
- Without filter: "No plans found in phase directory."

---

### Step 4: Check for Prior Work (inline)

Check for existing SUMMARY.md files from previous runs (crash recovery):

1. List all `SUMMARY-*.md` files in the phase directory
2. For each SUMMARY, read its status:
   - `completed`: Skip this plan (already done)
   - `partial`: Present to user — retry or skip?
   - `failed`: Present to user — retry or skip?
   - `checkpoint`: Resume from checkpoint (see Step 6e)
3. Build the skip list of plans to exclude

**If all plans already have completed SUMMARYs:**
- "Phase {N} has already been built. All plans have completed SUMMARYs. Re-build? This will delete existing SUMMARYs and re-execute."
- If yes: delete SUMMARY files and proceed
- If no: suggest `/dev:review {N}`

---

### Step 5: Extract Waves (inline)

Group plans by wave number:

```
Wave 1: [plan-01, plan-02]      (no dependencies, can run in parallel)
Wave 2: [plan-03]               (depends on wave 1 plans)
Wave 3: [plan-04, plan-05]      (depends on wave 2)
```

Validate wave consistency:
- Wave 1 plans must have `depends_on: []`
- Wave 2+ plans must depend only on plans from earlier waves
- No plan depends on a plan in the same wave (would need to be sequential)

---

### Step 6: Wave Loop (core execution)

For each wave, in order (Wave 1, then Wave 2, etc.):

#### 6a. Spawn Executors

For each plan in the current wave (excluding skipped plans):

1. Read the full PLAN.md content
2. Read `.planning/CONTEXT.md` (if exists)
3. Read `.planning/STATE.md`
4. Read prior SUMMARY.md files from the same phase (completed plans in earlier waves)
5. Read `.planning/config.json`

Construct the executor prompt:

```
You are the towline-executor agent. Execute the following plan.

<plan>
[Inline the FULL PLAN.md content — frontmatter and all tasks]
</plan>

<project_context>
Project root: {absolute path to project root}
Platform: {win32|linux|darwin}

Config:
[Inline relevant sections of config.json — commit format, TDD mode, etc.]

Context:
[Inline CONTEXT.md if it exists — locked decisions, constraints]

State:
[Inline current position section of STATE.md]
</project_context>

<prior_work>
[Table of completed plans in this phase with commit hashes]
| Plan | Status | Commits | Key Exports |
|------|--------|---------|-------------|
| {plan_id} | complete | {hash1}, {hash2} | {provides list} |
</prior_work>

Execute all tasks in the plan sequentially. For each task:
1. Execute the <action> steps
2. Run the <verify> commands
3. Create an atomic commit with format: {commit_format}
4. Record the commit hash

After all tasks complete:
1. Write SUMMARY.md to .planning/phases/{NN}-{slug}/SUMMARY-{plan_id}.md
2. Run self-check (verify files exist, commits exist, verify commands still pass)
3. Return your SUMMARY.md content as your final response

If you hit a checkpoint task, STOP and return the checkpoint response format immediately.
```

**Spawn strategy based on config:**

- If `parallelization.enabled: true` AND multiple plans in this wave:
  - Spawn up to `max_concurrent_agents` Task() calls in parallel
  - Each Task() call is independent

- If `parallelization.enabled: false` OR single plan in wave:
  - Spawn Task() calls sequentially, one at a time

```
Task({
  subagent_type: "dev:towline-executor",
  prompt: <executor prompt constructed above>
})

NOTE: The dev:towline-executor subagent type auto-loads the agent definition. Do NOT inline it.
```

#### 6b. Wait for Wave Completion

Block until all executor Task() calls for this wave complete.

#### 6c. Read Results

For each completed executor:

1. Check if SUMMARY.md was written to the expected location
2. Read the SUMMARY.md
3. Extract status: `completed` | `partial` | `checkpoint` | `failed`
4. Record commit hashes, files created, deviations

Build a wave results table:

```
Wave {W} Results:
| Plan | Status | Tasks | Commits | Deviations |
|------|--------|-------|---------|------------|
| {id} | complete | 3/3 | abc, def, ghi | 0 |
| {id} | complete | 2/2 | jkl, mno | 1 |
```

#### 6d. Handle Failures

If any executor returned `failed` or `partial`:

Present failure details to the user:
```
Plan {id} {status}:
  Task {N}: {name} - FAILED
  Error: {verify output or error message}

  Deviations attempted: {count}
  Last verify output: {output}
```

Ask user:
- **retry** — re-spawn the executor for the failed plan
- **skip** — mark plan as skipped, continue to next wave
- **abort** — stop the entire build

**If retry:**
- Re-spawn executor Task() with the same prompt
- If retry also fails: ask user again (max 2 retries total)

**If skip:**
- Note the skip in results
- Check if any plans in later waves depend on the skipped plan
- If yes: warn user that those plans will also need to be skipped or adjusted

**If abort:**
- Update STATE.md with current progress
- Present what was completed before the abort
- Suggest: "Fix the issue and run `/dev:build {N}` to resume (completed plans will be skipped)"

#### 6e. Handle Checkpoints

If any executor returned `checkpoint`:

1. Read the checkpoint details from the executor's response
2. Present the checkpoint to the user:

```
Checkpoint in Plan {id}, Task {N}: {checkpoint type}

{checkpoint details — what was built, what is needed}

{For decision type: present options}
{For human-action type: present steps}
{For human-verify type: present what to verify}
```

3. Wait for user response
4. Spawn a FRESH continuation executor:

Reference: `skills/build/continuation-format.md` for the continuation protocol.

```
You are the towline-executor agent. Continue executing a plan from a checkpoint.

<plan>
[Inline the FULL PLAN.md content]
</plan>

<completed_tasks>
| Task | Commit | Status |
|------|--------|--------|
| {task_name} | {hash} | complete |
| {task_name} | {hash} | complete |
| {checkpoint_task} | — | checkpoint |
</completed_tasks>

<checkpoint_resolution>
User response to checkpoint: {user's response}
Resume at: Task {N+1} (or re-execute checkpoint task with user's answer)
</checkpoint_resolution>

<project_context>
[Same context as original spawn]
</project_context>

Continue execution from the checkpoint. Skip completed tasks. Process the checkpoint resolution, then continue with remaining tasks. Write SUMMARY.md when done.
```

#### 6f. Update STATE.md

After each wave completes (all plans in the wave are done, skipped, or aborted):

Update `.planning/STATE.md`:
- Current plan progress: "{completed}/{total} in current phase"
- Last activity timestamp
- Progress bar percentage
- Any new decisions from executor deviations

---

### Step 7: Phase Verification (delegated, conditional)

**Skip if:**
- `features.goal_verification` is `false` in config
- Build was aborted

**If verification is enabled:**

Spawn a verifier Task():

```
Task({
  subagent_type: "dev:towline-verifier",
  prompt: <verifier prompt>
})

NOTE: The dev:towline-verifier subagent type auto-loads the agent definition. Do NOT inline it.
```

#### Verifier Prompt Template

```
You are the towline-verifier agent. Verify that phase {N} meets its goals.

<verification_approach>
For each must-have from the phase's plans, perform a three-layer check:

Layer 1 — Existence: Does the artifact exist? (ls, grep for exports)
Layer 2 — Substantiveness: Is it more than a stub? (wc -l, grep for implementation)
Layer 3 — Wiring: Is it connected to the rest of the system? (grep for imports/usage)

See skills/plan/verification-patterns.md for detailed patterns.
</verification_approach>

<phase_plans>
[For each PLAN.md in the phase: inline the must_haves section from frontmatter]
</phase_plans>

<build_results>
[For each SUMMARY.md in the phase: inline the full content]
</build_results>

<instructions>
1. For each must-have truth: run existence, substantiveness, and wiring checks
2. For each must-have artifact: verify the file exists and has real content
3. For each must-have key_link: verify the connection is made

Write your verification report to .planning/phases/{NN}-{slug}/VERIFICATION.md

Format:
---
status: "passed" | "gaps_found" | "human_needed"
phase: "{NN}-{slug}"
checked_at: "{date}"
must_haves_checked: {count}
must_haves_passed: {count}
must_haves_failed: {count}
---

# Phase Verification: {phase name}

## Results

| Must-Have | Layer 1 | Layer 2 | Layer 3 | Status |
|-----------|---------|---------|---------|--------|
| {truth} | PASS | PASS | PASS | PASSED |
| {truth} | PASS | FAIL | — | GAP |

## Gaps Found
{For each gap: what's missing, which layer failed, suggested fix}

## Passed
{For each pass: what was verified, how}
</instructions>

Use the Write tool to create VERIFICATION.md. Use Bash to run verification commands.
```

---

### Step 8: Finalize (inline)

After all waves complete and optional verification runs:

**8a. Update STATE.md:**
- Phase status: "built" (or "partial" if some plans failed)
- Plan completion count
- Last activity timestamp
- Progress bar

**8b. Commit planning docs (if configured):**
If `planning.commit_docs` is `true`:
- Stage SUMMARY.md files and VERIFICATION.md
- Commit: `docs({phase}): add build summaries and verification`

**8c. Handle git branching:**
If `git.branching` is `phase`:
- All work was done on the phase branch
- Suggest merging: "Phase {N} complete on branch `{branch_name}`. Merge to main?"

**8d. Present completion summary:**

```
Phase {N}: {name} — Build Complete

Results:
| Plan | Status | Tasks | Commits |
|------|--------|-------|---------|
| {id} | complete | 3/3 | 3 |
| {id} | complete | 2/2 | 2 |

{If verification ran:}
Verification: {PASSED | GAPS_FOUND}
  {count} must-haves checked, {count} passed, {count} gaps

{If gaps found:}
Gaps: {list gaps briefly}

Total commits: {count}
Total files created: {count}
Total files modified: {count}
Deviations: {count}

What's next?
-> /dev:review {N} — verify and walk through what was built
-> /dev:plan {N+1} — plan the next phase
-> /dev:build {N} --gaps-only — fix verification gaps (if any)
```

---

## Error Handling

### Executor agent timeout
If a Task() doesn't return within a reasonable time:
- Check for partial SUMMARY.md (may have been written before timeout)
- Treat as `partial` status
- Present to user: retry or skip

### Git lock conflicts
If multiple parallel executors create git lock conflicts:
- The executor agent handles retries internally (see executor agent definition)
- If lock conflicts persist across executors, reduce `max_concurrent_agents` to 1
- Warn user: "Git lock conflicts detected with parallel execution. Consider disabling parallelization."

### Executor produces unexpected files
If SUMMARY.md shows files not listed in the plan's `files_modified`:
- Note the discrepancy in the wave results
- Do not fail — the executor's deviation rules may have required additional files
- Flag for review: "Plan {id} modified files not in the plan: {list}"

### Build on wrong branch
If `git.branching` is `phase` but we're not on the phase branch:
- Create the phase branch: `git checkout -b {phase_branch_template}`
- Proceed with build on the new branch

---

## Files Created/Modified by /dev:build

| File | Purpose | When |
|------|---------|------|
| `.planning/phases/{NN}-{slug}/SUMMARY-{plan_id}.md` | Per-plan build summary | Step 6 (each executor) |
| `.planning/phases/{NN}-{slug}/VERIFICATION.md` | Phase verification report | Step 7 |
| `.planning/STATE.md` | Updated progress | Steps 6f, 8a |
| Project source files | Actual code | Step 6 (executors) |
