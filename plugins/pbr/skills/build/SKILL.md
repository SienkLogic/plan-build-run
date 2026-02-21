---
name: build
description: "Execute all plans in a phase. Spawns agents to build in parallel, commits atomically."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task, AskUserQuestion
argument-hint: "<phase-number> [--gaps-only] [--team]"
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes ~7,600 tokens. Begin executing Step 1 immediately.**

# /pbr:build — Phase Execution

You are the orchestrator for `/pbr:build`. This skill executes all plans in a phase by spawning executor agents. Plans are grouped by wave and executed in order — independent plans run in parallel, dependent plans wait. Your job is to stay lean, delegate ALL building work to Task() subagents, and keep the user's main context window clean.

## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.

Additionally for this skill:
- **Minimize** reading executor output — read only SUMMARY.md frontmatter, not full content
- **Delegate** all building work to executor subagents — the orchestrator routes, it doesn't build

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► BUILDING PHASE {N}                         ║
╚══════════════════════════════════════════════════════════════╝
```

Where `{N}` is the phase number from `$ARGUMENTS`. Then proceed to Step 1.

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

Reference: `skills/shared/config-loading.md` for the tooling shortcut and config field reference.

1. Parse `$ARGUMENTS` for phase number and flags
2. Read `.planning/config.json` for parallelization, model, and gate settings (see config-loading.md for field reference)
3. Resolve depth profile: run `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js config resolve-depth` to get the effective feature/gate settings for the current depth. Store the result for use in later gating decisions.
4. **CRITICAL: Write .active-skill NOW.** Write `.planning/.active-skill` with the content `build` (registers with workflow enforcement hook)
5. Validate:
   - Phase directory exists at `.planning/phases/{NN}-{slug}/`
   - PLAN.md files exist in the directory
   - Prior phase dependencies are met (check for SUMMARY.md files in dependency phases)
6. If no phase number given, read current phase from `.planning/STATE.md`
   - `config.models.complexity_map` — adaptive model mapping (default: `{ simple: "haiku", medium: "sonnet", complex: "inherit" }`)
7. If `gates.confirm_execute` is true: use AskUserQuestion (pattern: yes-no from `skills/shared/gate-prompts.md`):
   question: "Ready to build Phase {N}? This will execute {count} plans."
   header: "Build?"
   options:
     - label: "Yes"  description: "Start building Phase {N}"
     - label: "No"   description: "Cancel — review plans first"
   If "No" or "Other": stop and suggest `/pbr:plan {N}` to review plans
8. If `git.branching` is `phase`: create and switch to branch `plan-build-run/phase-{NN}-{name}` before any build work begins
9. Record the current HEAD commit SHA: `git rev-parse HEAD` — store as `pre_build_commit` for use in Step 8-pre-c (codebase map update)

**Staleness check (dependency fingerprints):**
After validating prerequisites, check plan staleness:
1. Read each PLAN.md file's `dependency_fingerprints` field (if present)
2. For each fingerprinted dependency, check the current SUMMARY.md file (length + modification time)
3. If any fingerprint doesn't match: the dependency phase was re-built after this plan was created
4. Use AskUserQuestion (pattern: stale-continue from `skills/shared/gate-prompts.md`):
   question: "Plan {plan_id} may be stale — dependency phase {M} was re-built after this plan was created."
   header: "Stale"
   options:
     - label: "Continue anyway"  description: "Proceed with existing plans (may still be valid)"
     - label: "Re-plan"          description: "Stop and re-plan with `/pbr:plan {N}` (recommended)"
   If "Re-plan" or "Other": stop and suggest `/pbr:plan {N}`
   If "Continue anyway": proceed with existing plans
10. If plans have no `dependency_fingerprints` field, fall back to timestamp-based staleness detection:
   a. Read `.planning/ROADMAP.md` and identify the current phase's dependencies (the `depends_on` field)
   b. For each dependency phase, find its phase directory under `.planning/phases/`
   c. Check if any SUMMARY.md files in the dependency phase directory have a modification timestamp newer than the current phase's PLAN.md files
   d. If any upstream dependency was modified after planning, display a warning (do NOT block):
      ```
      Warning: Phase {dep_phase} (dependency of Phase {N}) was modified after this phase was planned.
      Plans may be based on outdated assumptions. Consider re-planning with `/pbr:plan {N}`.
      ```
   e. This is advisory only — continue with the build after displaying the warning

**Validation errors — use branded error boxes:**

If no plans found:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Phase {N} has no plans.

**To fix:** Run `/pbr:plan {N}` first.
```

If dependencies incomplete:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Phase {N} depends on Phase {M}, which is not complete.

**To fix:** Build Phase {M} first with `/pbr:build {M}`.
```

---

### Step 2: Load Config (inline)

Read configuration values needed for execution. See `skills/shared/config-loading.md` for the full field reference; build uses: `parallelization.*`, `features.goal_verification`, `features.inline_verify`, `features.atomic_commits`, `features.auto_continue`, `features.auto_advance`, `planning.commit_docs`, `git.commit_format`, `git.branching`.

---

### Step 3: Discover Plans (inline)

**Tooling shortcut**: Instead of manually parsing each PLAN.md frontmatter, run:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js plan-index <phase>
```
This returns a JSON object with `plans` (array with plan_id, wave, depends_on, autonomous, must_haves_count per plan) and `waves` (grouped by wave). Falls back to manual parsing if unavailable.

1. List all files matching `.planning/phases/{NN}-{slug}/*-PLAN.md`
2. If `--gaps-only` flag: filter to only plans with `gap_closure: true` in frontmatter
3. Read each plan file's YAML frontmatter to extract:
   - Plan ID
   - Wave number
   - Dependencies (depends_on)
   - Whether autonomous
4. Sort plans by plan number

**If no plans match filters:**
- With `--gaps-only`: "No gap-closure plans found. Run `/pbr:plan {N} --gaps` first."
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
Use AskUserQuestion (pattern: yes-no from `skills/shared/gate-prompts.md`):
  question: "Phase {N} has already been built. All plans have completed SUMMARYs. Re-build from scratch?"
  header: "Re-build?"
  options:
    - label: "Yes"  description: "Delete existing SUMMARYs and re-execute all plans"
    - label: "No"   description: "Keep existing build — review instead"
- If "Yes": delete SUMMARY files and proceed
- If "No" or "Other": suggest `/pbr:review {N}`

---

### Step 5: Extract Waves (inline)

Group plans by wave number from their frontmatter. See `references/wave-execution.md` for the full wave execution model (parallelization, git lock handling, checkpoint manifests).

Validate wave consistency:
- Wave 1 plans must have `depends_on: []`
- Wave 2+ plans must depend only on plans from earlier waves
- No plan depends on a plan in the same wave (would need to be sequential)

---

### Step 5b: Write Checkpoint Manifest (inline)

**CRITICAL: Write .checkpoint-manifest.json NOW before entering the wave loop.**

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

Display to the user before spawning:

```
◐ Spawning {N} executor(s) for Wave {W}...
```

Then present a brief narrative for each plan to give the user context on what's about to happen:

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

**Model Selection (Adaptive)**:
Before spawning the executor for each plan, determine the model:
1. Read the plan's task elements for `complexity` and `model` attributes
2. If ANY task has an explicit `model` attribute, use the most capable model among them (inherit > sonnet > haiku)
3. Otherwise, use the HIGHEST complexity among the plan's tasks to select the model:
   - Look up `config.models.complexity_map.{complexity}` (defaults: simple->haiku, medium->sonnet, complex->inherit)
4. If `config.models.executor` is set (non-null), it overrides adaptive selection entirely — use that model for all executors
5. Pass the selected model to the Task() spawn

Reference: `references/model-selection.md` for full details.

1. Extract the `## Summary` section from the PLAN.md (everything after the `## Summary` heading to end of file). If no ## Summary section exists (legacy plans), fall back to reading the full PLAN.md content. Note: The orchestrator reads the full PLAN.md once for narrative extraction AND summary extraction; only the ## Summary portion is inlined into the executor prompt. The full PLAN.md stays on disk for the executor to Read.
2. Read `.planning/CONTEXT.md` (if exists)
3. Read `.planning/STATE.md`
4. Read prior SUMMARY.md files from the same phase (completed plans in earlier waves)
5. Read `.planning/config.json`

Construct the executor prompt:

```
You are the executor agent. Execute the following plan.

<plan_summary>
[Inline only the ## Summary section from PLAN.md]
</plan_summary>

<plan_file>
.planning/phases/{NN}-{slug}/{plan_id}-PLAN.md
</plan_file>

<project_context>
Project root: {absolute path to project root}
Platform: {win32|linux|darwin}

Config:
  commit_format: {commit_format from config}
  tdd_mode: {tdd_mode from config}
  atomic_commits: {atomic_commits from config}

Available context files (read via Read tool as needed):
  - Config: {absolute path to config.json}
  - State: {absolute path to STATE.md}
{If CONTEXT.md exists:}
  - Project context (locked decisions): {absolute path to CONTEXT.md}
</project_context>

<prior_work>
Completed plans in this phase:
| Plan | Status | Commits | Summary File |
|------|--------|---------|-------------|
| {plan_id} | complete | {hash1}, {hash2} | {absolute path to SUMMARY.md} |

Read any SUMMARY file via Read tool if you need details on what prior plans produced.
</prior_work>

Execute all tasks in the plan sequentially. For each task:
0. Read the full plan file from the path in <plan_file> to get task details
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
  subagent_type: "pbr:executor",
  prompt: <executor prompt constructed above>
})

NOTE: The pbr:executor subagent type auto-loads the agent definition. Do NOT inline it.
```

**Path resolution**: Before constructing the agent prompt, resolve `${CLAUDE_PLUGIN_ROOT}` to its absolute path. Do not pass the variable literally in prompts — Task() contexts may not expand it. Use the resolved absolute path for any pbr-tools.js or template references included in the prompt.

#### 6b. Wait for Wave Completion

Block until all executor Task() calls for this wave complete.

#### 6c. Read Results

For each completed executor:

1. Check if SUMMARY.md was written to the expected location
2. Read the SUMMARY.md frontmatter (not the full body — keep context lean)
3. Extract status: `completed` | `partial` | `checkpoint` | `failed`
4. Display per-plan completion to the user:
   ```
   ✓ Plan {id} complete — {brief summary from SUMMARY.md frontmatter description or first key_file}
   ```
   Extract the brief summary from the SUMMARY.md frontmatter (use the `description` field if present, otherwise use the first entry from `key_files`).
5. Record commit hashes, files created, deviations
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

**Skip if** the depth profile has `features.inline_verify: false`.

To check: use the resolved depth profile. Only `comprehensive` mode enables inline verification by default.

When inline verification is enabled, each completed plan gets a targeted verification pass before the orchestrator proceeds to the next wave. This catches issues early — before dependent plans build on a broken foundation.

For each plan that completed successfully in this wave:

1. Read the plan's SUMMARY.md to get `key_files` (the files this plan created/modified)
2. Display to the user: `◐ Spawning inline verifier for plan {plan_id}...`

   Spawn a lightweight verifier:

   <!-- NOTE: This is a targeted inline check (existence/substantiveness/wiring for specific files),
        NOT the full must-have verifier. The canonical full verifier prompt lives in
        agents/verifier.md and is templated via skills/review/templates/verifier-prompt.md.tmpl.
        Keep this lightweight prompt distinct from the full verifier. -->

```
Task({
  subagent_type: "pbr:verifier",
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

Use AskUserQuestion (pattern: multi-option-failure from `skills/shared/gate-prompts.md`):
  question: "Plan {id} failed at task {N} ({name}). How should we proceed?"
  header: "Failed"
  options:
    - label: "Retry"     description: "Re-spawn the executor for this plan"
    - label: "Skip"      description: "Mark as skipped, continue to next wave"
    - label: "Rollback"  description: "Undo commits from this plan, revert to last good state"
    - label: "Abort"     description: "Stop the entire build"

**If user selects 'Retry':**
- Re-spawn executor Task() with the same prompt
- If retry also fails: ask user again (max 2 retries total)

**If user selects 'Skip':**
- Note the skip in results
- Check if any plans in later waves depend on the skipped plan
- If yes: warn user that those plans will also need to be skipped or adjusted

**If user selects 'Rollback':**
- Read `last_good_commit` from `.checkpoint-manifest.json`
- If `last_good_commit` exists:
  - Show the user: "Rolling back to commit {sha} (last verified good state). This will soft-reset {N} commits."
  - Run: `git reset --soft {last_good_commit}`
  - Delete the failed plan's SUMMARY.md file if it was created
  - Update the checkpoint manifest: remove the failed plan from `checkpoints_resolved`
  - Continue to next wave or stop based on user preference
- If no `last_good_commit`: warn "No rollback point available (this was the first plan). Use abort instead."

**If user selects 'Abort':**
- Update STATE.md with current progress
- Present what was completed before the abort
- Suggest: "Fix the issue and run `/pbr:build {N}` to resume (completed plans will be skipped)"

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
You are the executor agent. Continue executing a plan from a checkpoint.

<plan_summary>
[Inline only the ## Summary section from PLAN.md]
</plan_summary>

<plan_file>
.planning/phases/{NN}-{slug}/{plan_id}-PLAN.md
</plan_file>

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
{Same lean context as original spawn — config key-values + file paths, not inlined bodies}
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

**Tooling shortcut**: Use the CLI for atomic STATE.md updates instead of manual read-modify-write:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state update plans_complete {N}
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state update status building
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state update last_activity now
```

- Current plan progress: "{completed}/{total} in current phase"
- Last activity timestamp
- Progress bar percentage
- Any new decisions from executor deviations

**STATE.md size limit:** Follow the size limit enforcement rules in `skills/shared/state-update.md` (150 lines max — collapse completed phases, remove duplicated decisions, trim old sessions).

---

### Step 7: Phase Verification (delegated, conditional)

**Event-driven auto-verify signal:** Check if `.planning/.auto-verify` exists (written by `event-handler.js` SubagentStop hook). If the signal file exists, read it and delete it (one-shot). The signal confirms that auto-verification was triggered — proceed with verification even if the build just finished.

**Skip if:**
- Build was aborted
- Depth profile has `features.goal_verification: false`
- Depth is `quick` AND the total task count across all plans in this phase is fewer than 3

To check: run `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js config resolve-depth` and read `profile["features.goal_verification"]`. For the task-count check in quick mode, sum the task counts from all PLAN.md frontmatter `must_haves` (already available from Step 3 plan discovery).

This implements budget mode's "skip verifier for < 3 tasks" rule: small phases in quick mode don't need a full verification pass.

**If skipping because `features.goal_verification` is `false`:**
Note for Step 8f completion summary: append "Note: Automatic verification was skipped (goal_verification: false). Run `/pbr:review {N}` to verify what was built."

**If verification is enabled:**

Display to the user: `◐ Spawning verifier...`

Spawn a verifier Task():

```
Task({
  subagent_type: "pbr:verifier",
  prompt: <verifier prompt>
})

NOTE: The pbr:verifier subagent type auto-loads the agent definition. Do NOT inline it.
```

**Path resolution**: Before constructing the agent prompt, resolve `${CLAUDE_PLUGIN_ROOT}` to its absolute path. Do not pass the variable literally in prompts — Task() contexts may not expand it. Use the resolved absolute path for any pbr-tools.js or template references included in the prompt.

#### Verifier Prompt Template

Use the same verifier prompt template as defined in `/pbr:review`: read `skills/review/templates/verifier-prompt.md.tmpl` and fill in its placeholders with the phase's PLAN.md must_haves and SUMMARY.md file paths. This avoids maintaining duplicate verifier prompts across skills.

After the verifier returns, read the VERIFICATION.md frontmatter and display the results:

- If status is `passed`: display `✓ Verifier: {X}/{Y} must-haves verified` (where X = `must_haves_passed` and Y = `must_haves_checked`)
- If status is `gaps_found`: display `⚠ Verifier found {N} gap(s) — see VERIFICATION.md` (where N = `must_haves_failed`)

---

### Step 8: Finalize (inline)

After all waves complete and optional verification runs:

**8-pre. Re-verify after gap closure (conditional):**

If `--gaps-only` flag was used AND `features.goal_verification` is `true`:

1. Delete the existing `VERIFICATION.md` (it reflects pre-gap-closure state)
2. Re-run the verifier using the same Step 7 process — this produces a fresh `VERIFICATION.md` that accounts for the gap-closure work
3. Read the new verification status for use in determining `final_status` below

This ensures that `/pbr:review` after a `--gaps-only` build sees the updated verification state, not stale gaps from before the fix.

**8-pre-b. Determine final status based on verification:**
- If verification ran and status is `passed`: final_status = "built"
- If verification ran and status is `gaps_found`: final_status = "built*" (built with unverified gaps)
- If verification was skipped: final_status = "built (unverified)"
- If build was partial: final_status = "partial"

**8-pre-c. Codebase map incremental update (conditional):**

Only run if ALL of these are true:
- `.planning/codebase/` directory exists (project was previously scanned with `/pbr:scan`)
- Build was not aborted
- `git diff --name-only {pre_build_commit}..HEAD` shows >5 files changed OR `package.json`/`requirements.txt`/`go.mod`/`Cargo.toml` was modified

If triggered:
1. Record the pre-build commit SHA at the start of Step 1 (before any executors run) for comparison
2. Run `git diff --name-only {pre_build_commit}..HEAD` to get the list of changed files
3. Display to the user: `◐ Spawning codebase mapper (incremental update)...`

   Spawn a lightweight mapper Task():
   ```
   Task({
     subagent_type: "pbr:codebase-mapper",
     model: "haiku",
     prompt: "Incremental codebase map update. These files changed during the Phase {N} build:\n{diff file list}\n\nRead the existing .planning/codebase/ documents. Update ONLY the sections affected by these changes. Do NOT rewrite entire documents — make targeted updates. If a new dependency was added, update STACK.md. If new directories/modules were created, update STRUCTURE.md. If new patterns were introduced, update CONVENTIONS.md. Write updated files to .planning/codebase/."
   })
   ```
4. Do NOT block on this — use `run_in_background: true` and continue to Step 8a. Report completion in Step 8f if it finishes in time.

**CRITICAL: Update ROADMAP.md progress table NOW. Do NOT skip this step.**

**8a. Update ROADMAP.md Progress table** (REQUIRED — do this BEFORE updating STATE.md):

**Tooling shortcut**: Use the CLI for atomic ROADMAP.md table updates instead of manual editing:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js roadmap update-plans {phase} {completed} {total}
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js roadmap update-status {phase} {final_status}
```
These return `{ success, old_status, new_status }` or `{ success, old_plans, new_plans }`. Falls back to manual editing if unavailable.

1. Open `.planning/ROADMAP.md`
2. Find the `## Progress` table
3. Locate the row matching this phase number
4. Update the `Plans Complete` column to `{completed}/{total}` (e.g., `2/2` if all plans built successfully)
5. Update the `Status` column to the final_status determined in Step 8-pre
6. Save the file — do NOT skip this step

**CRITICAL: Update STATE.md NOW with phase completion status. Do NOT skip this step.**

**8b. Update STATE.md:**
- Phase status: {final_status from Step 8-pre}
- Plan completion count
- Last activity timestamp
- Progress bar

**8c. Commit planning docs (if configured):**
Reference: `skills/shared/commit-planning-docs.md` for the standard commit pattern.
If `planning.commit_docs` is `true`:
- Stage SUMMARY.md files and VERIFICATION.md
- Commit: `docs({phase}): add build summaries and verification`

**8d. Handle git branching:**
If `git.branching` is `phase`:
- All work was done on the phase branch (created in Step 1)
- Squash merge to main: `git checkout main && git merge --squash plan-build-run/phase-{NN}-{name}`
- Use AskUserQuestion (pattern: yes-no from `skills/shared/gate-prompts.md`):
  question: "Phase {N} complete on branch `plan-build-run/phase-{NN}-{name}`. Squash merge to main?"
  header: "Merge?"
  options:
    - label: "Yes, merge"   description: "Squash merge to main and delete the phase branch"
    - label: "No, keep"     description: "Leave the branch as-is for manual review"
- If "Yes, merge": complete the merge and delete the phase branch
- If "No, keep" or "Other": leave the branch as-is and inform the user

**8e. Auto-advance / auto-continue (conditional):**

**If `features.auto_advance` is `true` AND `mode` is `autonomous`:**
Chain to the next skill directly within this session. This eliminates manual phase cycling.

| Build Result | Next Action | How |
|-------------|-------------|-----|
| Verification passed, more phases | Plan next phase | `Skill({ skill: "pbr:plan", args: "{N+1}" })` |
| Verification skipped | Run review | `Skill({ skill: "pbr:review", args: "{N}" })` |
| Verification gaps found | **HARD STOP** — present gaps to user | Do NOT auto-advance past failures |
| Last phase in current milestone | **HARD STOP** — milestone boundary | Suggest `/pbr:milestone audit`. Explain: "auto_advance pauses at milestone boundaries — your sign-off is required." |
| Build errors occurred | **HARD STOP** — errors need human review | Do NOT auto-advance past errors |

After invoking the chained skill, it runs within the same session. When it completes, the chained skill may itself chain further (review→plan, plan→build) if auto_advance remains true. This creates the full cycle: build→review→plan→build→...

**Else if `features.auto_continue` is `true`:**
Write `.planning/.auto-next` containing the next logical command (e.g., `/pbr:plan {N+1}` or `/pbr:review {N}`)
- This file signals to the user or to wrapper scripts that the next step is ready

**8e-ii. Check Pending Todos:**

After completing the build, check if any pending todos are now satisfied:

1. Check if `.planning/todos/pending/` exists and contains files
2. If no pending todos: skip to 8f
3. If pending todos exist:
   a. Read the title and description from each pending todo's YAML frontmatter
   b. Compare each todo against the phase work (plans executed, files changed, features built)
   c. If a todo is **clearly satisfied**: move it to `.planning/todos/done/`, update `status: done`, add `completed: {YYYY-MM-DD}`, delete from `pending/` via Bash `rm`. Display: `✓ Auto-closed todo {NNN}: {title} (satisfied by Phase {N} build)`
   d. If **partially related**: display `ℹ Related pending todo {NNN}: {title} — may be partially addressed`
   e. If unrelated: skip silently

Only auto-close when the match is unambiguous. When in doubt, leave it open.

**8f. Present completion summary:**

Use the branded output templates from `references/ui-formatting.md`. Route based on status:

| Status | Template |
|--------|----------|
| `passed` + more phases in current milestone | "Phase Complete" template |
| `passed` + last phase in current milestone | "Milestone Complete" template |

**Milestone boundary detection:** To determine "last phase in current milestone", read ROADMAP.md and find the `## Milestone:` section containing the current phase. Check its `**Phases:** start - end` range. If the current phase equals `end`, this is the last phase in the milestone. For projects with a single milestone or no explicit milestone sections, "last phase in ROADMAP" is equivalent.
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

Then present the appropriate branded banner:

**If `passed` + more phases:**
```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► PHASE {N} COMPLETE ✓                       ║
╚══════════════════════════════════════════════════════════════╝

**Phase {N}: {Name}**

{X} plans executed
Goal verified ✓



╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**Phase {N+1}: {Name}** — {Goal from ROADMAP.md}

`/pbr:plan {N+1}`

<sub>`/clear` first → fresh context window</sub>



**Also available:**
- `/pbr:review {N}` — manual acceptance testing before continuing
- `/pbr:discuss {N+1}` — talk through the next phase before planning
- `/pbr:status` — see full project status


```

**If `passed` + last phase:**
```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► MILESTONE COMPLETE 🎉                      ║
╚══════════════════════════════════════════════════════════════╝

{N} phases completed
All phase goals verified ✓



╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**Audit milestone** — verify requirements, cross-phase integration, E2E flows

`/pbr:milestone audit`

<sub>`/clear` first → fresh context window</sub>



**Also available:**
- `/pbr:review` — manual acceptance testing
- `/pbr:milestone complete` — archive milestone after audit passes


```

**If `gaps_found`:**
```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► PHASE {N} GAPS FOUND ⚠                     ║
╚══════════════════════════════════════════════════════════════╝

**Phase {N}: {Name}**

Score: {X}/{Y} must-haves verified
Report: .planning/phases/{phase_dir}/VERIFICATION.md

### What's Missing

{Extract gap summaries from VERIFICATION.md}



╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**Plan gap closure** — create additional plans to complete the phase

`/pbr:plan {N} --gaps`

<sub>`/clear` first → fresh context window</sub>



**Also available:**
- `cat .planning/phases/{phase_dir}/VERIFICATION.md` — see full report
- `/pbr:review {N}` — manual testing before planning


```

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
If a Task() doesn't return within a reasonable time, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Executor agent timed out for Plan {id}.

**To fix:** Check `.planning/phases/{NN}-{slug}/` for partial SUMMARY.md, then retry or skip.
```
Treat as `partial` status. Present to user: retry or skip.

For commit conventions and git workflow details, see `references/git-integration.md`.

### Git lock conflicts
If multiple parallel executors create git lock conflicts:
- The executor agent handles retries internally (see executor agent definition)
- If lock conflicts persist, display: `⚠ Git lock conflicts detected with parallel execution. Consider reducing max_concurrent_agents to 1.`

### Executor produces unexpected files
If SUMMARY.md shows files not listed in the plan's `files_modified`:
- Note the discrepancy in the wave results
- Do not fail — the executor's deviation rules may have required additional files
- Flag for review: "Plan {id} modified files not in the plan: {list}"

### Build on wrong branch
If `git.branching` is `phase` but we're not on the phase branch:
- Create the phase branch: `git checkout -b plan-build-run/phase-{NN}-{name}`
- Proceed with build on the new branch

---

## Files Created/Modified by /pbr:build

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
