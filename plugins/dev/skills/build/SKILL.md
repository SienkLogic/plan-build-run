---
name: build
description: "Execute all plans in a phase. Spawns agents to build in parallel, commits atomically."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task
argument-hint: "<phase-number> [--gaps-only] [--team]"
---

# /dev:build — Phase Execution

You are the orchestrator for `/dev:build`. This skill executes all plans in a phase by spawning executor agents. Plans are grouped by wave and executed in order — independent plans run in parallel, dependent plans wait. Your job is to stay lean, delegate ALL building work to Task() subagents, and keep the user's main context window clean.

## Context Budget

Keep the main orchestrator context lean. Follow these rules:
- **Never** read agent definition files (agents/*.md) — subagent_type auto-loads them
- **Never** inline large files into Task() prompts — tell agents to read files from disk instead
- **Minimize** reading executor output into main context — read only SUMMARY.md frontmatter, not full content
- **Delegate** all building work to executor subagents — the orchestrator routes, it doesn't build
- **Before spawning agents**: If you've already consumed significant context (large file reads, multiple subagent results), warn the user: "Context budget is getting heavy. Consider running `/dev:pause` after this wave to checkpoint progress." Suggest pause proactively rather than waiting for compaction.

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

**Tooling shortcut**: Instead of reading and parsing STATE.md, ROADMAP.md, and config.json manually, you can run:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/towline-tools.js state load
```
This returns a JSON object with `config`, `state`, `roadmap`, `current_phase`, and `progress`. Falls back gracefully if the script is missing — parse files manually in that case.

1. Parse `$ARGUMENTS` for phase number and flags
2. Read `.planning/config.json` for parallelization, model, and gate settings
3. Write `.planning/.active-skill` with the content `build` (registers with workflow enforcement hook)
4. Validate:
   - Phase directory exists at `.planning/phases/{NN}-{slug}/`
   - PLAN.md files exist in the directory
   - Prior phase dependencies are met (check for SUMMARY.md files in dependency phases)
4. If no phase number given, read current phase from `.planning/STATE.md`
5. If `gates.confirm_execute` is true: ask user to confirm before proceeding
6. If `git.branching_strategy` is `phase`: create and switch to branch `towline/phase-{NN}-{name}` before any build work begins
7. Record the current HEAD commit SHA: `git rev-parse HEAD` — store as `pre_build_commit` for use in Step 8-pre-c (codebase map update)

**Staleness check (dependency fingerprints):**
After validating prerequisites, check plan staleness:
1. Read each PLAN.md file's `dependency_fingerprints` field (if present)
2. For each fingerprinted dependency, check the current SUMMARY.md file (length + modification time)
3. If any fingerprint doesn't match: the dependency phase was re-built after this plan was created
4. Warn user: "Plan {plan_id} may be stale — dependency phase {M} was re-built after this plan was created. Re-plan with `/dev:plan {N}` or continue with existing plans?"
5. If user chooses to continue: proceed (the plans may still be valid)
6. If user chooses to re-plan: stop and suggest `/dev:plan {N}`
7. If plans have no `dependency_fingerprints` field: skip this check (backward compatible)

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
features.inline_verify      — run per-task verification after each executor commit (opt-in)
features.atomic_commits     — require atomic commits per task
features.auto_continue      — write .auto-next signal on phase completion
features.auto_advance       — chain build→review→plan in autonomous mode
planning.commit_docs        — commit planning docs after build
git.commit_format           — commit message format
git.branching_strategy      — branching strategy ("phase" = branch per phase)
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

Group plans by wave number from their frontmatter. See `references/wave-execution.md` for the full wave execution model (parallelization, git lock handling, checkpoint manifests).

Validate wave consistency:
- Wave 1 plans must have `depends_on: []`
- Wave 2+ plans must depend only on plans from earlier waves
- No plan depends on a plan in the same wave (would need to be sequential)

---

### Step 5b: Write Checkpoint Manifest (inline)

Before entering the wave loop, write `.planning/phases/{NN}-{slug}/.checkpoint-manifest.json`:

```json
{
  "plans": ["02-01", "02-02", "02-03"],
  "checkpoints_resolved": [],
  "checkpoints_pending": [],
  "wave": 1,
  "deferred": [],
  "commit_log": [],
  "last_good_commit": null
}
```

This file tracks execution progress for crash recovery and rollback. On resume after compaction, read this manifest to determine where execution left off and which plans still need work.

Update the manifest after each wave completes:
- Move completed plan IDs into `checkpoints_resolved`
- Advance the `wave` counter
- Record commit SHAs in `commit_log` (array of `{ plan, sha, timestamp }` objects)
- Update `last_good_commit` to the SHA of the last successfully verified commit
- Append any deferred items collected from executor SUMMARYs

---

### Step 6: Wave Loop (core execution)

**Crash recovery check:** Before entering the wave loop, check if `.checkpoint-manifest.json` already exists with completed plans from a prior run. If it does, reconstruct the skip list from its `checkpoints_resolved` array. This handles the case where the orchestrator's context was compacted or the session was interrupted mid-build.

**Orphaned progress file check:** Also scan the phase directory for `.PROGRESS-*` files. These indicate an executor that crashed mid-task. For each orphaned progress file:
1. Read it to find the `plan_id`, `last_completed_task`, and `total_tasks`
2. If the plan is NOT in `checkpoints_resolved` (not yet complete), inform the user:
   ```
   Detected interrupted execution for plan {plan_id}: {last_completed_task}/{total_tasks} tasks completed.
   ```
3. The executor will automatically resume from the progress file when spawned — no special action needed from the orchestrator.
4. If the plan IS in `checkpoints_resolved`, the progress file is stale — delete it.

For each wave, in order (Wave 1, then Wave 2, etc.):

#### 6a. Spawn Executors

For each plan in the current wave (excluding skipped plans):

**Present plan narrative before spawning:**

Before spawning executors for this wave, present a brief narrative for each plan to give the user context on what's about to happen:

```
Wave {W} — {N} plan(s):

Plan {id}: {plan name}
  {2-3 sentence description: what this plan builds, the technical approach, and why it matters.
   Derive this from the plan's must_haves and first task's <action> summary.}

Plan {id}: {plan name}
  {2-3 sentence description}
```

This is a read-only presentation step — extract descriptions from plan frontmatter `must_haves.truths` and the plan's task names. Do not read full task bodies for this; keep it lightweight.

**State fragment rule:** Executors MUST NOT modify STATE.md directly. The build skill orchestrator is the sole STATE.md writer during execution. Executors report results via SUMMARY.md only; the orchestrator reads those summaries and updates STATE.md itself.

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
  - Use `run_in_background: true` for each executor
  - While waiting, display progress to the user:
    - After spawning: "Wave {W}: launched {N} executors in parallel: {list of plan names}"
    - Periodically (~30s): check `TaskOutput` with `block: false` and report status
    - When each completes: "Plan {id} complete ({duration})"
    - When all complete: "Wave {W} finished. {passed}/{total} plans succeeded."

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
2. Read the SUMMARY.md frontmatter (not the full body — keep context lean)
3. Extract status: `completed` | `partial` | `checkpoint` | `failed`
4. Record commit hashes, files created, deviations
5. **Update checkpoint manifest `commit_log`**: For each completed plan, append `{ plan: "{plan_id}", sha: "{commit_hash}", timestamp: "{ISO date}" }` to the `commit_log` array. Update `last_good_commit` to the last commit SHA from this wave.

**Spot-check executor claims:**

After reading each SUMMARY, perform a lightweight verification:
- Pick 2-3 files from the SUMMARY's `key_files` list and verify they exist (`ls`)
- Run `git log --oneline -n {commit_count}` and confirm the count matches the claimed commits
- For each spot-checked file, verify it has >10 lines (`wc -l`): warn if trivially small
- For each spot-checked file, search for TODO/FIXME/placeholder/stub markers: warn if found
- Check SUMMARY.md frontmatter for `self_check_failures`: if present, warn the user:
  "Plan {id} reported self-check failures: {list failures}. Inspect before continuing?"
- If ANY spot-check fails, warn the user before proceeding to the next wave:
  "Spot-check failed for plan {id}: {detail}. Inspect before continuing?"

**Read executor deviations:**

After all executors in the wave complete, read all SUMMARY frontmatter and:
- Collect `deferred` items into a running list (append to `.checkpoint-manifest.json` deferred array)
- Flag any deviation-rule-4 (architectural) stops — these require user attention
- Present a brief wave summary to the user:
  "Wave {W} complete. {N} plans done. {D} deferred ideas logged. {A} architectural issues."

Build a wave results table:

```
Wave {W} Results:
| Plan | Status | Tasks | Commits | Deviations |
|------|--------|-------|---------|------------|
| {id} | complete | 3/3 | abc, def, ghi | 0 |
| {id} | complete | 2/2 | jkl, mno | 1 |
```

#### 6c-ii. Inline Per-Task Verification (conditional)

**Skip if** `features.inline_verify` is not `true` in config.

When inline verification is enabled, each completed plan gets a targeted verification pass before the orchestrator proceeds to the next wave. This catches issues early — before dependent plans build on a broken foundation.

For each plan that completed successfully in this wave:

1. Read the plan's SUMMARY.md to get `key_files` (the files this plan created/modified)
2. Spawn a lightweight verifier:

```
Task({
  subagent_type: "dev:towline-verifier",
  model: "haiku",
  prompt: "Targeted inline verification for plan {plan_id}.

Verify ONLY these files: {comma-separated key_files list}

For each file, check three layers:
1. Existence — does the file exist?
2. Substantiveness — is it more than a stub? (>10 lines, no TODO/FIXME placeholders)
3. Wiring — is it imported/used by at least one other file?

Report PASS or FAIL with a one-line reason per file.
Write nothing to disk — just return your results as text."
})
```

3. If verifier reports FAIL for any file:
   - Present the failure to the user: "Inline verify failed for plan {plan_id}: {details}"
   - Re-spawn the executor for just the failed items: include only the failing file context in the prompt
   - If the retry also fails: proceed but flag in the wave results table (don't block indefinitely)
4. If verifier reports all PASS: continue to next wave

**Note:** This adds latency (~10-20s per plan for the haiku verifier). It's opt-in via `features.inline_verify: true` for projects where early detection outweighs speed.

---

#### 6d. Handle Failures

If any executor returned `failed` or `partial`:

**Handoff bug check (false-failure detection):**

Before presenting failure options, check whether the executor actually completed its work despite reporting failure (known Claude Code platform bug where handoff reports failure but work is done):

1. Check if SUMMARY.md exists at the expected path for this plan
2. If SUMMARY.md exists:
   a. Read its frontmatter `status` field
   b. If `status: complete` AND frontmatter has `commits` entries:
      - Run the same spot-checks from Step 6c (file existence, commit count)
      - If spot-checks pass: treat this plan as **success**, not failure
      - Tell user: "Plan {id} reported failure but SUMMARY.md shows completed work. Spot-checks passed — treating as success."
      - Skip the failure flow for this plan
   c. If `status: partial` or spot-checks fail: proceed with normal failure handling below

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
- **rollback** — undo commits from the failed plan, revert to last-good state
- **abort** — stop the entire build

**If retry:**
- Re-spawn executor Task() with the same prompt
- If retry also fails: ask user again (max 2 retries total)

**If skip:**
- Note the skip in results
- Check if any plans in later waves depend on the skipped plan
- If yes: warn user that those plans will also need to be skipped or adjusted

**If rollback:**
- Read `last_good_commit` from `.checkpoint-manifest.json`
- If `last_good_commit` exists:
  - Show the user: "Rolling back to commit {sha} (last verified good state). This will soft-reset {N} commits."
  - Run: `git reset --soft {last_good_commit}`
  - Delete the failed plan's SUMMARY.md file if it was created
  - Update the checkpoint manifest: remove the failed plan from `checkpoints_resolved`
  - Continue to next wave or stop based on user preference
- If no `last_good_commit`: warn "No rollback point available (this was the first plan). Use abort instead."

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

Reference: `references/continuation-format.md` for the continuation protocol.

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

**SUMMARY gate — verify before updating STATE.md:**

Before writing any STATE.md update, verify these three gates for every plan in the wave:
1. SUMMARY file exists at the expected path
2. SUMMARY file is not empty (file size > 0)
3. SUMMARY file has a valid title and YAML frontmatter (contains `---` delimiters and a `status:` field)

Block the STATE.md update until ALL gates pass. If any gate fails:
- Warn user: "SUMMARY gate failed for plan {id}: {which gate}. Cannot update STATE.md."
- Ask user to retry the executor or manually inspect the SUMMARY file

Once gates pass, update `.planning/STATE.md`:
- Current plan progress: "{completed}/{total} in current phase"
- Last activity timestamp
- Progress bar percentage
- Any new decisions from executor deviations

**STATE.md size limit:** Follow the size limit enforcement rules in `skills/shared/state-update.md` (150 lines max — collapse completed phases, remove duplicated decisions, trim old sessions).

---

### Step 7: Phase Verification (delegated, conditional)

**Skip if:**
- `features.goal_verification` is `false` in config
- Build was aborted

**If skipping because `features.goal_verification` is `false`:**
Note for Step 8f completion summary: append "Note: Automatic verification was skipped (goal_verification: false). Run `/dev:review {N}` to verify what was built."

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

See references/verification-patterns.md for detailed patterns.
</verification_approach>

<phase_plans>
[For each PLAN.md in the phase: inline the must_haves section from frontmatter]
</phase_plans>

<build_results>
[For each SUMMARY.md in the phase: inline only the YAML frontmatter (status, key_files, commits).
The verifier agent has its own 200k context window and will read full SUMMARY bodies from disk when needed.
Do NOT inline full SUMMARY content here — it wastes orchestrator context.]
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

**8-pre. Re-verify after gap closure (conditional):**

If `--gaps-only` flag was used AND `features.goal_verification` is `true`:

1. Delete the existing `VERIFICATION.md` (it reflects pre-gap-closure state)
2. Re-run the verifier using the same Step 7 process — this produces a fresh `VERIFICATION.md` that accounts for the gap-closure work
3. Read the new verification status for use in determining `final_status` below

This ensures that `/dev:review` after a `--gaps-only` build sees the updated verification state, not stale gaps from before the fix.

**8-pre-b. Determine final status based on verification:**
- If verification ran and status is `passed`: final_status = "built"
- If verification ran and status is `gaps_found`: final_status = "built*" (built with unverified gaps)
- If verification was skipped: final_status = "built (unverified)"
- If build was partial: final_status = "partial"

**8-pre-c. Codebase map incremental update (conditional):**

Only run if ALL of these are true:
- `.planning/codebase/` directory exists (project was previously scanned with `/dev:scan`)
- Build was not aborted
- `git diff --name-only {pre_build_commit}..HEAD` shows >5 files changed OR `package.json`/`requirements.txt`/`go.mod`/`Cargo.toml` was modified

If triggered:
1. Record the pre-build commit SHA at the start of Step 1 (before any executors run) for comparison
2. Run `git diff --name-only {pre_build_commit}..HEAD` to get the list of changed files
3. Spawn a lightweight mapper Task():
   ```
   Task({
     subagent_type: "dev:towline-codebase-mapper",
     model: "haiku",
     prompt: "Incremental codebase map update. These files changed during the Phase {N} build:\n{diff file list}\n\nRead the existing .planning/codebase/ documents. Update ONLY the sections affected by these changes. Do NOT rewrite entire documents — make targeted updates. If a new dependency was added, update STACK.md. If new directories/modules were created, update STRUCTURE.md. If new patterns were introduced, update CONVENTIONS.md. Write updated files to .planning/codebase/."
   })
   ```
4. Do NOT block on this — use `run_in_background: true` and continue to Step 8a. Report completion in Step 8f if it finishes in time.

**8a. Update ROADMAP.md Progress table** (REQUIRED — do this BEFORE updating STATE.md):
1. Open `.planning/ROADMAP.md`
2. Find the `## Progress` table
3. Locate the row matching this phase number
4. Update the `Plans Complete` column to `{completed}/{total}` (e.g., `2/2` if all plans built successfully)
5. Update the `Status` column to the final_status determined in Step 8-pre
6. Save the file — do NOT skip this step

**8b. Update STATE.md:**
- Phase status: {final_status from Step 8-pre}
- Plan completion count
- Last activity timestamp
- Progress bar

**8c. Commit planning docs (if configured):**
If `planning.commit_docs` is `true`:
- Stage SUMMARY.md files and VERIFICATION.md
- Commit: `docs({phase}): add build summaries and verification`

**8d. Handle git branching:**
If `git.branching_strategy` is `phase`:
- All work was done on the phase branch (created in Step 1)
- Squash merge to main: `git checkout main && git merge --squash towline/phase-{NN}-{name}`
- Ask user to confirm: "Phase {N} complete on branch `towline/phase-{NN}-{name}`. Squash merge to main?"
- If confirmed: complete the merge and delete the phase branch
- If declined: leave the branch as-is and inform the user

**8e. Auto-advance / auto-continue (conditional):**

**If `features.auto_advance` is `true` AND `mode` is `autonomous`:**
Chain to the next skill directly within this session. This eliminates manual phase cycling.

| Build Result | Next Action | How |
|-------------|-------------|-----|
| Verification passed, more phases | Plan next phase | `Skill({ skill: "dev:plan", args: "{N+1}" })` |
| Verification skipped | Run review | `Skill({ skill: "dev:review", args: "{N}" })` |
| Verification gaps found | **HARD STOP** — present gaps to user | Do NOT auto-advance past failures |
| Last phase complete | **HARD STOP** — milestone boundary | Suggest `/dev:milestone audit` |
| Build errors occurred | **HARD STOP** — errors need human review | Do NOT auto-advance past errors |

After invoking the chained skill, it runs within the same session. When it completes, the chained skill may itself chain further (review→plan, plan→build) if auto_advance remains true. This creates the full cycle: build→review→plan→build→...

**Else if `features.auto_continue` is `true`:**
Write `.planning/.auto-next` containing the next logical command (e.g., `/dev:plan {N+1}` or `/dev:review {N}`)
- This file signals to the user or to wrapper scripts that the next step is ready

**8f. Present completion summary:**

Use the branded output templates from `references/ui-formatting.md`. Route based on status:

| Status | Template |
|--------|----------|
| `passed` + more phases | "Phase Complete" template |
| `passed` + last phase | "Milestone Complete" template |
| `gaps_found` | "Gaps Found" template |

Before the branded banner, include the results table:

```
Results:
| Plan | Status | Tasks | Commits |
|------|--------|-------|---------|
| {id} | complete | 3/3 | 3 |
| {id} | complete | 2/2 | 2 |

{If verification ran:}
Verification: {PASSED | GAPS_FOUND}
  {count} must-haves checked, {count} passed, {count} gaps

Total commits: {count}
Total files created: {count}
Total files modified: {count}
Deviations: {count}
```

Then present the appropriate branded banner with "Next Up" routing block.

**8g. Display USER-SETUP.md (conditional):**

Check if `.planning/phases/{NN}-{slug}/USER-SETUP.md` exists. If it does:

```
Setup Required:
This phase introduced external setup requirements. See the details below
or read .planning/phases/{NN}-{slug}/USER-SETUP.md directly.

{Read and display the USER-SETUP.md content — it's typically short}
```

This ensures the user sees setup requirements prominently instead of buried in SUMMARY files.

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
If `git.branching_strategy` is `phase` but we're not on the phase branch:
- Create the phase branch: `git checkout -b towline/phase-{NN}-{name}`
- Proceed with build on the new branch

---

## Files Created/Modified by /dev:build

| File | Purpose | When |
|------|---------|------|
| `.planning/phases/{NN}-{slug}/.checkpoint-manifest.json` | Execution progress for crash recovery | Step 5b, updated each wave |
| `.planning/phases/{NN}-{slug}/SUMMARY-{plan_id}.md` | Per-plan build summary | Step 6 (each executor) |
| `.planning/phases/{NN}-{slug}/USER-SETUP.md` | External setup requirements | Step 6 (executor, if needed) |
| `.planning/phases/{NN}-{slug}/VERIFICATION.md` | Phase verification report | Step 7 |
| `.planning/codebase/*.md` | Incremental codebase map updates | Step 8-pre-c (if codebase/ exists) |
| `.planning/ROADMAP.md` | Plans Complete + Status → `built` or `partial` | Step 8a |
| `.planning/STATE.md` | Updated progress | Steps 6f, 8b |
| `.planning/.auto-next` | Next command signal (if auto_continue enabled) | Step 8e |
| Project source files | Actual code | Step 6 (executors) |
