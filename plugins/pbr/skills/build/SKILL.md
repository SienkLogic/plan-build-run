---
name: build
description: "Execute all plans in a phase. Spawns agents to build in parallel, commits atomically."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task, AskUserQuestion, Skill
argument-hint: "<phase-number> [--gaps-only] [--team] [--model <model>] [--auto]"
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes ~7,600 tokens. Begin executing Step 1 immediately.**

# /pbr:execute-phase — Phase Execution

**References:** `@references/questioning.md`, `@references/ui-brand.md`

You are the orchestrator for `/pbr:execute-phase`. This skill executes all plans in a phase by spawning executor agents. Plans are grouped by wave and executed in order — independent plans run in parallel, dependent plans wait. Your job is to stay lean, delegate ALL building work to Task() subagents, and keep the user's main context window clean.

## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.
Reference: `skills/shared/agent-type-resolution.md` for agent type fallback when spawning Task() subagents.

Reference: `skills/shared/agent-context-enrichment.md` for enriching executor spawn prompts with project context.
Reference: `references/deviation-rules.md` for the deviation taxonomy (Rules 1-4) used by executors to classify and handle unexpected issues.
Reference: `references/node-repair.md` for the node repair taxonomy (RETRY, DECOMPOSE, PRUNE, ESCALATE) used by executors to handle failed tasks.

Additionally for this skill:
- **Minimize** reading executor output — read only SUMMARY.md frontmatter, not full content. Exception: if `context_window_tokens` in `.planning/config.json` is >= 500000, reading full SUMMARY.md bodies is permitted when semantic content is needed for inline decisions.
- **Delegate** all building work to executor subagents — the orchestrator routes, it doesn't build
- **Lazy-load steps**: Instead of reading ahead, fetch the next step's instructions on demand:
  `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js skill-section build "step-6"` → returns that step's content as JSON. Use this when context budget is DEGRADING.

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► BUILDING PHASE {N}                         ║
╚══════════════════════════════════════════════════════════════╝
```

Where `{N}` is the phase number from `$ARGUMENTS`. Then proceed to Step 1.

## Multi-Session Sync

Before any phase-modifying operations (spawning executors, writing SUMMARY.md, updating STATE.md/ROADMAP.md), acquire a claim:

```
acquireClaim(phaseDir, sessionId)
```

If the claim fails (another session owns this phase), display: "Another session owns this phase. Use `/pbr:progress` to see active claims."

On completion or error (including all exit paths), release the claim:

```
releaseClaim(phaseDir, sessionId)
```

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
| `3 --model opus` | Use opus for all executor spawns in phase 3 (overrides config and adaptive selection) |
| `3 --auto` | Build phase 3 with auto mode — suppress confirmation gates, auto-advance on success |
| (no number) | Use current phase from STATE.md |
| `3 --preview` | Preview what build would do for phase 3 without executing |
| `3 --cross-check` | Before spawning executors for phase 3, check current plan files_modified against prior-phase provides for conflicts |

---

### --preview mode

If `--preview` is present in `$ARGUMENTS`:

1. Extract the phase slug from `$ARGUMENTS` (use the phase number to look up the slug, or pass the number directly — the CLI accepts partial slug matches).
2. Run:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js build-preview {phase-slug}
   ```

   Capture the JSON output.
3. Render the following preview document (do NOT proceed to Step 2):

   ```
   ╔══════════════════════════════════════════════════════════════╗
   ║  DRY RUN — /pbr:execute-phase {N} --preview                          ║
   ║  No executor agents will be spawned                          ║
   ╚══════════════════════════════════════════════════════════════╝

   PHASE: {phase}

   ## Plans
   {for each plan: - {id} (wave {wave}, {task_count} tasks)}

   ## Wave Structure
   {for each wave: Wave {wave}: {plan IDs} [parallel | sequential]}

   ## Files That Would Be Modified
   {for each file in files_affected: - {file}}
   (Total: {count} files)

   ## Estimated Agent Spawns
   {agent_count} executor task(s)

   ## Critical Path
   {critical_path joined with " → "}

   ## Dependency Chain
   {for each entry in dependency_chain: - {id} (wave {wave}) depends on: {depends_on or "none"}}
   ```

4. **STOP** — do not proceed to Step 2.

---

## Orchestration Flow

Execute these steps in order.

---

### Step 1: Parse and Validate (inline)

Reference: `skills/shared/config-loading.md` for the tooling shortcut and config field reference.

1. Parse `$ARGUMENTS` for phase number and flags
   - If `--auto` is present in `$ARGUMENTS`: set `auto_mode = true`. Log: "Auto mode enabled — suppressing confirmation gates"
2. **CRITICAL — Init first.** Run the init CLI call as the FIRST action after argument parsing:
   ```bash
   node plugins/pbr/scripts/pbr-tools.js init execute-phase {N}
   ```
   Store the JSON result as `blob`. All downstream steps MUST reference `blob` fields instead of re-reading files. Key fields: `blob.phase.dir`, `blob.phase.status`, `blob.config.depth`, `blob.plans`, `blob.waves`, `blob.executor_model`, `blob.drift`.
3. Resolve depth profile: run `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js config resolve-depth` to get the effective feature/gate settings for the current depth. Store the result for use in later gating decisions.
4. **CRITICAL (hook-enforced): Write .active-skill NOW.** Write `.planning/.active-skill` with the content `build` (registers with workflow enforcement hook)
5. **Pre-build dependency validation (consolidated check):**
   Run all three checks before spawning any executors. Use `blob.phase.dir` for the phase directory path and `blob.plans` for plan metadata:

   a. **Phase artifact check:** `blob.phase.dir` is set and `blob.plans` is non-empty (PLAN.md files are present)
   b. **Dependency SUMMARY check:** All phases listed in `depends_on` for each plan in `blob.plans` have a SUMMARY.md file (i.e., they have been built). If any dependency is unbuilt, display:
      ```
      BLOCKED: Plan {plan_id} depends on phase {dep_phase} which has not been built yet.
      Run `/pbr:build {dep_phase}` first.
      ```
      and stop.
   c. **Staleness / cross-check (optional):** If `--cross-check` flag is present, compare each plan's `files_modified` list against prior-phase `provides` for conflicts (see --cross-check section above for full logic). Without the flag, skip this check.

   d. **Plan validation check:** Verify `.plan-check.json` exists in the phase directory and has `status: "passed"`. If missing or failed:
      - Display: `BLOCKED: Phase {N} plans have not passed validation. Run /pbr:plan-phase {N} to validate plans.`
      - Stop execution.
      Note: This is an early-exit check complementing the validate-task.js hook gate. The hook gate catches executor spawns; this skill-level check catches the entire build flow before any executor is spawned.

   All four sub-checks (a, b, c, d) are part of the same pre-build gate. Stop execution if (a), (b), or (d) fail. Proceed after (c) even if conflicts are acknowledged.
6. If no phase number given, use `blob.phase.number` (already resolved from STATE.md by init)
   - `blob.config.models.complexity_map` — adaptive model mapping (default: `{ simple: "haiku", medium: "sonnet", complex: "inherit" }`)
7. If `gates.confirm_execute` is true AND `auto_mode` is NOT true:
   **CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
   Use AskUserQuestion (pattern: yes-no from `skills/shared/gate-prompts.md`):
   question: "Ready to build Phase {N}? This will execute {count} plans."
   header: "Build?"
   options:
     - label: "Yes"  description: "Start building Phase {N}"
     - label: "No"   description: "Cancel — review plans first"
   If "No" or "Other": stop and suggest `/pbr:plan-phase {N}` to review plans
   **Skip if:** `auto_mode` is true — auto-proceed as if user selected "Yes"
8. **Git branching (config-gated):**
   Read `git.branching` from config (values: none, phase, milestone, disabled).
   - If `none` or `disabled`: skip branch operations entirely (current default behavior)
   - If `phase`:
     a. Determine branch name: `pbr/phase-{NN}-{name}` (e.g., `pbr/phase-03-auth`)
     b. Check if branch already exists: `git branch --list {branch-name}`
     c. If branch exists (resume scenario): `git switch {branch-name}` — log "Resuming on existing phase branch"
     d. If branch does not exist: `git switch -c {branch-name}` — log "Created phase branch: {branch-name}"
   - If `milestone`:
     a. Determine branch name: `pbr/milestone-v{version}` where {version} comes from the active milestone in ROADMAP.md
     b. Check if branch already exists: `git branch --list {branch-name}`
     c. If branch exists: `git switch {branch-name}` — log "Switching to milestone branch"
     d. If branch does not exist: `git switch -c {branch-name}` — log "Created milestone branch: {branch-name}"
     e. Note: milestone branch persists across all phases in the milestone; it is merged by /pbr:milestone complete
9. Record the current HEAD commit SHA: `git rev-parse HEAD` — store as `pre_build_commit` for use in Step 8-pre-c (codebase map update)

**Staleness check (from init blob):**
After validating prerequisites, check `blob.drift` for plan staleness. The drift field contains `{ stale: bool, plans: [{id, stale, reason}] }`. If `stale: true` for any plan:
**CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
- Use AskUserQuestion (pattern: stale-continue from `skills/shared/gate-prompts.md`):
  question: "Plan {plan_id} may be stale — {reason}"
  options: ["Continue anyway", "Re-plan with /pbr:plan-phase {N}"]
- If "Re-plan": stop. If "Continue anyway": proceed.
If `stale: false`: proceed silently.

**Validation errors — use branded error boxes:**

If no plans found:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Phase {N} has no plans.

**To fix:** Run `/pbr:plan-phase {N}` first.
```

If dependencies incomplete, use conversational recovery:

1. Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js suggest-alternatives missing-prereq {dependency-phase-slug}`
2. Parse the JSON response to get `existing_summaries`, `missing_summaries`, and `suggested_action`.
3. Display what summaries exist and what is still missing.
4. **CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
   Use AskUserQuestion (pattern: yes-no from `skills/shared/gate-prompts.md`) to offer:
   - "Build {dependency-phase} first" — stop and show: `/pbr:execute-phase {dependency-phase}`
   - "Continue anyway (skip dependency check)" — proceed with build, note unmet deps in output

If config validation fails for a specific field, use conversational recovery:

1. Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js suggest-alternatives config-invalid {field} {value}`
2. Parse the JSON response to get `valid_values` and `suggested_fix`.
3. Display the invalid field, its current value, and the valid options.
4. **CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
   Use AskUserQuestion to offer: "Fix config.json now, or continue with current value?"
   - If "Fix now": stop and display the `suggested_fix` instruction.
   - If "Continue": proceed with default value for that field.

---

### Step 2: Load Config (inline)

From the init `blob` captured in Step 1, extract the configuration fields needed for execution: `blob.config.parallelization`, `blob.config.features.goal_verification`, `blob.config.features.inline_verify`, `blob.config.features.atomic_commits`, `blob.config.features.auto_continue`, `blob.config.features.auto_advance`, `blob.config.planning.commit_docs`, `blob.config.git.commit_format`, `blob.config.git.branching`. See `skills/shared/config-loading.md` for the full field reference.

---

### Step 3: Discover Plans (inline)

Use `blob.plans` and `blob.waves` from the init blob (Step 1). These contain the plan index with plan_id, wave, depends_on, autonomous, and must_haves_count per plan, already grouped by wave. No additional file reads or CLI calls needed.

1. Use `blob.plans` array for the plan list
2. If `--gaps-only` flag: filter `blob.plans` to only plans with `gap_closure: true`
3. Plans are already sorted by plan number in the blob
4. Use `blob.waves` for wave grouping

**If no plans match filters:**
- With `--gaps-only`: "No gap-closure plans found. Run `/pbr:plan-phase {N} --gaps` first."
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
**CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
Use AskUserQuestion (pattern: yes-no from `skills/shared/gate-prompts.md`):
  question: "Phase {N} has already been built. All plans have completed SUMMARYs. Re-build from scratch?"
  header: "Re-build?"
  options:
    - label: "Yes"  description: "Delete existing SUMMARYs and re-execute all plans"
    - label: "No"   description: "Keep existing build — review instead"
- If "Yes": delete SUMMARY files and proceed
- If "No" or "Other": suggest `/pbr:verify-work {N}`

---

### Step 5: Extract Waves (inline)

Use `blob.waves` from the init blob (Step 1) which already groups plans by wave number. Do NOT re-parse plan frontmatter for wave extraction. If `blob.waves` is missing, error — do not fall back to manual parsing.

See `references/wave-execution.md` for the full wave execution model (parallelization, git lock handling, checkpoint manifests).

Validate wave consistency:
- Wave 1 plans must have `depends_on: []`
- Wave 2+ plans must depend only on plans from earlier waves
- No plan depends on a plan in the same wave (would need to be sequential)

---

### Step 5a: Pre-Spawn Intra-Phase Conflict Detection (conditional)

**Trigger:** Only run if `context_window_tokens` in `.planning/config.json` is >= 500000.

If the condition is false, skip this step entirely and proceed to Step 5c.

**Purpose:** Before spawning any executor, detect whether plans within this phase conflict with each other — specifically plans that are assigned to the same wave (and would run in parallel) but modify the same files or share import graph dependencies without an explicit `depends_on` relationship. This prevents silent data-race failures where two parallel executors clobber each other's writes.

**Procedure:**

1. Use the `plan-index` output already collected in Step 3. No additional file reads are needed. Extract from each plan:
   - `plan_id`
   - `wave`
   - `depends_on` list
   - `files_modified` list

2. **Same-file conflict detection:** For every pair of plans in the same wave, compute the intersection of their `files_modified` lists. A non-empty intersection is a **direct conflict** — both plans write the same file in parallel.

3. **Import graph overlap detection:** For every pair of plans in the same wave that do NOT share a direct file conflict, check for shared directory prefix overlap. If plan A modifies `src/auth/session.ts` and plan B modifies `src/auth/middleware.ts`, they share the `src/auth/` subtree — flag as a **potential conflict** (import graph sibling edits may cause merge conflicts or runtime breakage even without touching the same file).

   Overlap rule: two files share a directory prefix if their paths share at least one path segment beyond the project root (e.g., both under `src/auth/` or both under `plugins/pbr/scripts/`).

4. **Implicit dependency detection:** For every pair of plans across ANY waves (not just same-wave) where plan B's `files_modified` overlaps with plan A's `files_modified` BUT plan B does NOT list plan A in its `depends_on` (and plan A is in an earlier wave), flag as an **implicit dependency warning** — plan B will overwrite plan A's work without declaring the dependency.

5. Build a conflict report:

   ```
   Intra-Phase Conflict Detection Results

   Plans analyzed: {count} | Context: {context_window_tokens} tokens

   {If direct conflicts found:}
   DIRECT CONFLICTS (same file, same wave — parallel execution will clobber):

   | File | Plan A | Plan B | Wave |
   |------|--------|--------|------|
   | {path} | {plan_id} | {plan_id} | {wave} |

   {If potential conflicts found:}
   POTENTIAL CONFLICTS (shared directory subtree, same wave):

   | Shared Prefix | Plan A | Plan B | Wave |
   |---------------|--------|--------|------|
   | {prefix}/ | {plan_id} | {plan_id} | {wave} |

   {If implicit dependencies found:}
   IMPLICIT DEPENDENCIES (file overlap, no depends_on declared):

   | File | Earlier Plan | Later Plan | Missing depends_on |
   |------|-------------|------------|-------------------|
   | {path} | {plan_id} (wave {W}) | {plan_id} (wave {W+N}) | {plan_id} not in depends_on |

   {If conflicts found:}
   Suggested wave reordering:
   {For each direct conflict pair: "Move {plan_id} to wave {current_wave + 1} and add depends_on: ['{other_plan_id}']"}
   {For each implicit dependency: "Add depends_on: ['{earlier_plan_id}'] to {later_plan_id}"}
   ```

6. If **any** conflicts or warnings were found, present the report and:
   **CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
   Use AskUserQuestion (pattern: yes-no from `skills/shared/gate-prompts.md`):

   ```
   question: "{N} conflict(s) detected between plans in this phase. Proceed anyway?"
   header: "Intra-Phase Conflicts"
   options:
     - label: "Proceed"  description: "Continue — conflicts are intentional or I will fix them manually"
     - label: "Abort"    description: "Stop — I need to re-plan with /pbr:plan-phase {N}"
   ```

   If user selects "Abort": stop the build. Display: "Re-run `/pbr:plan-phase {N}` and apply the suggested wave reordering above."

   If user selects "Proceed": log a deviation — `DEVIATION: Intra-phase conflict(s) acknowledged by user. Plans: {conflicting plan IDs}.` — then continue to Step 5c.

7. If **no conflicts found**: display `✓ No intra-phase conflicts detected. Proceeding.` and continue to Step 5c silently.

---

### Step 5c: Pre-Spawn Cross-Phase Conflict Check (conditional)

Runs after Step 5a (intra-phase conflict detection).

**Trigger:** Only run if `--cross-check` flag is present in `$ARGUMENTS` AND `context_window_tokens` in `.planning/config.json` is >= 500000.

If either condition is false, skip this step entirely and proceed to Step 5b (checkpoint manifest).

**Purpose:** Before spawning any executor, detect whether this phase's planned file modifications conflict with artifacts or provides from prior completed phases. A conflict means the current phase may overwrite or break something a prior phase established.

**Procedure:**

1. Collect current phase `files_modified` from all PLAN.md frontmatters:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js plan-index {phase-slug}
   ```

   Extract the union of all `files_modified` arrays across plans. This is the **change surface**.

2. Collect prior completed phase provides:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js phase list --status verified --before {phase_number}
   ```

   For each returned phase, read SUMMARY.md `provides` list (frontmatter only — keep context lean).

3. Compare: for each prior-phase `provides` entry that names a specific file path, check if that path appears in the current phase's change surface.

4. Present conflict report to user before proceeding:

   ```
   Cross-Phase Conflict Check Results

   Files in scope: {count}
   Prior phases checked: {count}

   {If conflicts found:}
   ⚠ Potential conflicts detected:

   | File | Current Phase Plans | Prior Phase That Provides It |
   |------|---------------------|------------------------------|
   | {path} | {plan_ids} | Phase {N}: {slug} |

   These files were established as deliverables by prior phases. Modifying them may cause regressions.
   ```

   **CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
   Use AskUserQuestion (pattern: yes-no from `skills/shared/gate-prompts.md`):

   ```
   question: "{count} potential cross-phase conflicts detected. Proceed with build?"
   header: "Conflicts"
   options:
     - label: "Proceed"  description: "Continue — I reviewed the conflicts and they are intentional"
     - label: "Abort"    description: "Stop — I need to review the plan before building"
   ```

   ```
   {If no conflicts found:}
   ✓ No cross-phase conflicts detected. Proceeding to executor spawn.
   ```

5. If user selects "Abort": stop the build. Suggest reviewing the flagged plan files and running `/pbr:plan-phase {N}` to revise if needed.
6. If user selects "Proceed" or no conflicts found: continue to Step 5b (checkpoint manifest).

---

### Step 5b: Write Checkpoint Manifest (inline)

**CRITICAL (hook-enforced): Initialize checkpoint manifest NOW before entering the wave loop.**

**Session affinity:** The checkpoint manifest includes a `session_id` field. Before writing any phase state, validate that the current session owns the manifest by checking `manifest.session_id` matches the active session. If mismatch, another session may have taken over — re-acquire the claim or warn the user.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js checkpoint init {phase-slug} --plans "{comma-separated plan IDs}"
```

After each wave completes, update the manifest:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js checkpoint update {phase-slug} --wave {N} --resolved {plan-id} --sha {commit-sha}
```

This tracks execution for crash recovery and rollback. Read `.checkpoint-manifest.json` on resume to reconstruct which plans are complete.

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

**Inline Execution Gate (conditional):**

Before spawning a Task() executor, check if this plan qualifies for inline execution:

1. Read `workflow.inline_execution` from config. If `false`, skip this check — use normal Task() spawn.
2. Estimate current context usage percentage. Use a rough heuristic: if `context_window_tokens` is set in config, estimate based on conversation length; otherwise assume 30%.
3. For each plan in the current wave, run the inline decision gate:
   ```
   const { shouldInlineExecution } = require(path.join(PLUGIN_ROOT, 'scripts/lib/gates/inline-execution.js'));
   const result = shouldInlineExecution(planPath, config, contextPct);
   ```
   — The orchestrator conceptually evaluates these conditions; it does not literally run JavaScript. The gate logic is: plan has <= `inline_max_tasks` tasks (default 2), ALL tasks are `simple` complexity, AND context < `inline_context_cap_pct` (default 40%).

4. If `result.inline` is `true`:
   a. Display: `◆ Executing plan {plan_id} inline (trivial plan, {taskCount} simple task(s))`
   **CRITICAL — DO NOT SKIP: Write .inline-active signal file NOW before executing inline tasks.**
   b. Write signal file: Write the current phase number to `.planning/.inline-active` using the Write tool
   c. Read the full PLAN.md file
   d. For each task in the plan (parsed from XML `<task>` blocks):
      - Read the `<action>` element and execute each numbered step directly
      - Follow the same rules as a normal executor: create/modify files, run commands
      - After each task, run the `<verify>` command
      - If verify fails, fall back to normal Task() spawn for this plan
   **CRITICAL — DO NOT SKIP: Write SUMMARY.md for the inline plan NOW. Required for crash recovery and build completion tracking.**
   e. After all tasks complete, write SUMMARY.md directly:
      - Use the same frontmatter format as executor-produced SUMMARYs
      - Include: `status: completed`, `key_files`, `requires: []`, `deferred: []`
      - Body: brief description of what was done
   f. Delete `.planning/.inline-active` signal file
   g. Skip the normal Task() spawn below — proceed to Step 6c (Read Results)

5. If `result.inline` is `false`: proceed with normal Task() spawn below (no change to existing flow)

**Agent Context Enrichment (conditional):**

Before spawning each Task() executor, enrich its prompt with project context if enabled:

1. Check `features.rich_agent_prompts` in config. If `true`:
   ```
   const { buildRichAgentContext } = require(path.join(PLUGIN_ROOT, 'scripts/lib/gates/rich-agent-context.js'));
   const richContext = buildRichAgentContext(planningDir, config, contextPct > 50 ? 2500 : 5000);
   ```
   — The orchestrator conceptually evaluates this; it does not literally run JavaScript. If rich context is non-empty, include it in the executor spawn prompt under a `## Project Context` header.

2. Check `features.multi_phase_awareness` in config. If `true`:
   ```
   const { loadMultiPhasePlans } = require(path.join(PLUGIN_ROOT, 'scripts/lib/gates/multi-phase-loader.js'));
   const multiPhase = loadMultiPhasePlans(planningDir, currentPhaseNum, config);
   ```
   — If `multiPhase.phasesLoaded > 1`, include adjacent phase plan frontmatter (first 30 lines of each) in the executor spawn prompt under a `## Adjacent Phase Context` header. Do NOT include full plan bodies for adjacent phases — frontmatter only.

3. If neither feature is enabled, skip enrichment entirely (no performance cost).

**Teams mode status check:**

Before spawning executors, read the teams config:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js config get parallelization.use_teams
```

If `true`: Log `"Teams mode active — executor spawning coordinated with team config"`. This is informational only — teams mode affects planning and review, not execution. The log helps operators understand the full pipeline state.

**Present plan narrative before spawning:**

Display to the user before spawning:

```
◆ Spawning {N} executor(s) for Wave {W}...
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
0. If `--model <value>` was parsed from `$ARGUMENTS` (valid values: sonnet, opus, haiku, inherit), use that model for ALL executor Task() spawns in this run. Skip steps 1-4. The --model flag is the highest precedence override.
1. Read the plan's task elements for `complexity` and `model` attributes
2. If ANY task has an explicit `model` attribute, use the most capable model among them (inherit > sonnet > haiku)
3. Otherwise, use the HIGHEST complexity among the plan's tasks to select the model:
   - Look up `config.models.complexity_map.{complexity}` (defaults: simple->haiku, medium->sonnet, complex->inherit)
4. If `config.models.executor` is set (non-null), it overrides adaptive selection entirely — use that model for all executors
5. Pass the selected model to the Task() spawn

If `--model <value>` is present in `$ARGUMENTS`, extract the value. Valid values: `sonnet`, `opus`, `haiku`, `inherit`. If an invalid value is provided, display an error and list valid values. Store as `override_model`.

Reference: `references/model-selection.md` for full details.

1. Extract the `## Summary` section from the PLAN.md (everything after the `## Summary` heading to end of file). If no ## Summary section exists (legacy plans), fall back to reading the full PLAN.md content. Note: The orchestrator reads the full PLAN.md once for narrative extraction AND summary extraction; only the ## Summary portion is inlined into the executor prompt. The full PLAN.md stays on disk for the executor to Read.
2. Use `blob.phase.dir` for phase directory, `blob.phase.status` for current status
3. Use `blob.config` for config fields instead of re-reading `.planning/config.json`
4. Read prior SUMMARY.md files from the same phase (completed plans in earlier waves)

Construct the executor prompt by reading `${CLAUDE_SKILL_DIR}/templates/executor-prompt.md.tmpl` and filling in all `{placeholder}` values:

- `{NN}-{slug}` — from `blob.phase.dir` (e.g., `02-authentication`)
- `{plan_id}` — plan being executed (e.g., `02-01`)
- `{commit_format}`, `{tdd_mode}`, `{atomic_commits}` — from `blob.config`
- File paths: absolute paths to project root, config.json, STATE.md, PROJECT.md
- `{prior_work table rows}` — one row per completed plan in this phase

Use the filled template as the Task() prompt.

**Spawn strategy based on config:**

- If `parallelization.enabled: true` AND multiple plans in this wave:
  - **Extended context override:** If `features.extended_context` is `true` in `.planning/config.json`, use `max_concurrent_agents = 5` regardless of the configured value (unless the configured value is already higher). The 1M context window gives the orchestrator enough headroom to track 5 concurrent executor results. Log: "Extended context: raising max_concurrent_agents to 5"
  - Spawn up to `max_concurrent_agents` Task() calls in parallel
  - Each Task() call is independent
  - **CRITICAL: Individual Agent Calls** — Each executor MUST be a separate Task() tool call in a single response message. Do NOT describe the batch in prose (e.g., "5 executors launched"). Each separate Task() call gets its own colored badge and independent ctrl+o expansion in the Claude Code UI. Multiple Task() calls in one message still run concurrently — no parallelism is lost.
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

NOTE: The pbr:executor subagent type auto-loads the agent definition.

After executor completes, check its output for completion markers:

- `## PLAN COMPLETE` -- proceed to next plan or verification
- `## PLAN FAILED` -- log failure, check if retry is appropriate based on workflow.node_repair_budget
- `## CHECKPOINT: {TYPE}` -- surface checkpoint to user, pause workflow
- No marker found -- treat as partial completion, log warning "Executor returned without completion marker"

Route accordingly. Do NOT inline executor output into orchestrator context.

**Memory capture:** Reference `skills/shared/memory-capture.md` — check executor output for `<memory_suggestion>` blocks and save any reusable knowledge discovered during execution.
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

CRITICAL (no hook): Before reading results or advancing to the next wave, run the spot-check CLI for each completed plan.

For each completed plan in this wave:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js spot-check {phaseSlug} {planId}
```

Where `{phaseSlug}` is the phase directory name (e.g., `49-build-workflow-hardening`) and `{planId}` is the plan identifier (e.g., `49-01`).

The command returns JSON: `{ ok, summary_exists, key_files_checked, commits_present, detail }`

**If `ok` is `false` for ANY plan: STOP.** Do NOT advance to the next wave. Present the user with:

```
Spot-check FAILED for plan {planId}: {detail}

Choose an action:
  Retry   — Re-spawn executor for this plan
  Continue — Skip this plan and proceed to next wave (may leave phase incomplete)
  Abort   — Stop the build entirely
```

**CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
Use AskUserQuestion with the three options. Route:

- Retry: Re-spawn the executor for this plan (go back to Step 6a for this plan only)
- Continue: Log the failure, skip the plan, proceed
- Abort: Stop all build work, leave phase in partial state

**If `ok` is `true` for all plans:**

- Also check SUMMARY.md frontmatter for `self_check_failures`: if present, warn the user: "Plan {id} reported self-check failures: {list}. Inspect before continuing?"
- Also search SUMMARY.md for `## Self-Check: FAILED` marker — if present, warn before next wave
- Between waves: verify no file conflicts from parallel executors (`git status` for uncommitted changes)

**Read executor deviations:**
After all executors in the wave complete, read all SUMMARY frontmatter and:
- Collect `deferred` items into a running list (append to `.checkpoint-manifest.json` deferred array)
- Flag any deviation-rule-4 (architectural) stops — these require user attention
- If SUMMARY frontmatter contains `deviations:` with entries, summarize by rule:
  - Rule 1 (Bug, auto-fixed): informational only
  - Rule 2 (Missing dep, auto-installed): informational only
  - Rule 3 (Blocking, asked user): highlight for review
  - Rule 4 (Architectural, asked user): highlight for review — these may need re-planning
- Check for ESCALATE entries from node repair (SUMMARY frontmatter `node_repair` field with strategy "ESCALATE"): these indicate the executor exhausted RETRY/DECOMPOSE/PRUNE and needs user intervention. Surface immediately:
  ```
  Executor escalated {N} task(s):
  - Task {id}: {description} — {error details}
  How to proceed? (retry with different approach / skip / abort)
  ```
- Present a brief wave summary to the user:
  "Wave {W} complete. {N} plans done. {D} deferred ideas logged. {A} architectural issues."

Build a wave results table using standardized status symbols (`✓` complete, `✗` failed, `◆` in-progress, `○` pending — see `@references/ui-brand.md`):

```
Wave {W} Results:
| Plan | Status | Tasks | Commits | Deviations |
|------|--------|-------|---------|------------|
| {id} | ✓ complete | 3/3 | abc, def, ghi | 0 |
| {id} | ✓ complete | 2/2 | jkl, mno | 1 |
```

#### 6c-ii. Inline Per-Task Verification (conditional)

**Skip if** the depth profile has `features.inline_verify: false`.

To check: use the resolved depth profile. Only `comprehensive` mode enables inline verification by default. When inline verification is enabled, each completed plan gets a targeted verification pass before the orchestrator proceeds to the next wave — catching issues early before dependent plans build on a broken foundation.

For each plan that completed successfully in this wave:

1. Read the plan's SUMMARY.md to get `key_files` (the files this plan created/modified)
2. Display to the user: `◆ Spawning inline verifier for plan {plan_id}...`

   Spawn `Task({ subagent_type: "pbr:verifier", model: "haiku", prompt: ... })`. Read `${CLAUDE_SKILL_DIR}/templates/inline-verifier-prompt.md.tmpl` and fill in `{NN}-{slug}`, `{plan_id}`, and `{comma-separated key_files list}` (key_files from PLAN.md frontmatter). Use the filled template as the `prompt` value.

3. If verifier reports FAIL for any file:
   - Present the failure to the user: "Inline verify failed for plan {plan_id}: {details}"
   - Re-spawn the executor for just the failed items: include only the failing file context in the prompt
   - If the retry also fails: proceed but flag in the wave results table (don't block indefinitely)
4. If verifier reports all PASS: continue to next wave

**Note:** This adds latency (~10-20s per plan for the haiku verifier). It's opt-in via `features.inline_verify: true` for projects where early detection outweighs speed.

---

#### 6c-iii. Security Scan (conditional)

**Skip if** `features.security_scanning` is not `true` in `.planning/config.json`.

Run an OWASP-style security scan over the files changed during this wave using the patterns in `plugins/pbr/scripts/lib/security-scan.js`.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js security scan '{space-separated changed files}'
```

(`scanFiles()` in `plugins/pbr/scripts/lib/security-scan.js`)

Display formatted findings:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js security format-findings '{scan-output-json}'
```

(`formatFindings()` in `plugins/pbr/scripts/lib/security-scan.js`)

Output format:
- If no findings: `✓ Security scan: clean`
- If findings exist:
  ```
  ⚠ Security scan: {N} finding(s)
    [SEC-001] {file}:{line} — {message} (severity: high)
    ...
  ```

HIGH-severity findings (hardcoded secrets, SQL injection, eval-of-user-input) require user acknowledgment before the build continues. MEDIUM and LOW findings are logged but non-blocking.

---

#### 6c-v. Smart Test Selection (conditional)

**Skip if** `features.regression_prevention` is not `true` in `.planning/config.json`.

After each wave, identify which test files are relevant to the changed source files using `plugins/pbr/scripts/lib/test-selection.js`. Run only those tests instead of the full suite — this catches regressions early without the latency of a full test run.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js test-selection select '{space-separated changed files}'
```

(`selectTests()` in `plugins/pbr/scripts/lib/test-selection.js`)

Then format the test command:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js test-selection format-command '{selection-output-json}'
```

(`formatTestCommand()` in `plugins/pbr/scripts/lib/test-selection.js`)

Run the resulting command (e.g., `npm test -- tests/foo.test.js tests/bar.test.js`) via Bash. Display:
- `✓ Smart tests ({N} files): all passed`
- `✗ Smart tests ({N} files): {M} failed — {test names}`

If tests fail: present the failure to the user (same flow as Step 6d). The failing test output counts as a gap for the wave — the orchestrator does NOT automatically retry, but surfaces it for the user to decide (fix now, skip, or abort).

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

**CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
Use AskUserQuestion (pattern: multi-option-failure from `skills/shared/gate-prompts.md`):
  question: "Plan {id} failed at task {N} ({name}). How should we proceed?"
  header: "Failed"
  options:
    - label: "Retry"     description: "Re-spawn the executor for this plan"
    - label: "Skip"      description: "Mark as skipped, continue to next wave"
    - label: "Rollback"  description: "Undo commits from this plan, revert to last good state"
    - label: "Abort"     description: "Stop the entire build"

**If user selects 'Retry':**

**Phase Replay Enrichment (conditional):**

Before re-spawning, check `workflow.phase_replay` from config (loaded in Step 2).

If `workflow.phase_replay` is `true`:

1. Collect replay context:
   a. Read the original PLAN.md for this plan (already available from Step 6a)
   b. Read SUMMARY.md if it exists (partial results from the failed attempt)
   c. Read VERIFICATION.md if it exists (specific failure details)
   d. Run `git diff {pre_build_commit}..HEAD -- {files_modified}` to get code diffs from the failed attempt
2. Construct an enriched fix-executor prompt by reading `${CLAUDE_SKILL_DIR}/templates/executor-prompt.md.tmpl` and appending a `## Replay Context` section:

<!-- markdownlint-disable MD046 -->

    ## Replay Context

    This is a RETRY of a failed execution. Use the context below to understand what went wrong and fix it.

    ### Original Plan Summary
    {plan ## Summary section}

    ### Prior Attempt Results
    {SUMMARY.md frontmatter: status, completed tasks, failed task, error details}

    ### Verification Failures
    {VERIFICATION.md gaps if available, or "No verification run yet"}

    ### Code Diffs From Failed Attempt
    {git diff output, truncated to 200 lines max to stay within 30% of the executor's context budget}

<!-- markdownlint-enable MD046 -->

3. Cap the replay context: if the total replay section exceeds 30% of the executor's context budget (estimate ~60k tokens for a 200k window), truncate the git diff first, then VERIFICATION details.

If `workflow.phase_replay` is `false` or not set:
- Re-spawn executor Task() with the same prompt (unchanged current behavior)

- If retry also fails: ask user again (max 2 retries total)

**If user selects 'Skip':**
- Note the skip in results
- Check if any plans in later waves depend on the skipped plan
- If yes: warn user that those plans will also need to be skipped or adjusted

**If user selects 'Rollback':**
Run the rollback CLI:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js rollback .planning/phases/{NN}-{slug}/.checkpoint-manifest.json
```

Returns `{ ok, rolled_back_to, plans_invalidated, files_deleted, warnings }`.

- If `ok` is `true`: display "Rolled back to commit {rolled_back_to}. {plans_invalidated.length} downstream plans invalidated."
  Show any warnings. Continue to next wave or stop based on user preference.
- If `ok` is `false`: display the error message. Suggest "Use abort instead."

**If user selects 'Abort':**
- Update STATE.md with current progress
- Present what was completed before the abort
- Suggest: "Fix the issue and run `/pbr:execute-phase {N}` to resume (completed plans will be skipped)"

#### 6e. Handle Checkpoints

If any executor returned `checkpoint`:

1. Read the checkpoint details from the executor's response
2. Read checkpoint type from executor response: `human-verify` | `decision` | `human-action`
3. Read `gates.checkpoint_auto_resolve` from config.json (default: `"none"`)
   Values: `none` | `verify-only` | `verify-and-decision` | `all`

   **When `--auto` flag is active, `checkpoint_auto_resolve` defaults to `verify-and-decision` unless explicitly set to `none` in config.**

4. Determine auto-resolve eligibility:

   - **human-action**: NEVER auto-resolve (regardless of config or `--auto` flag). Always present to user.
   - **human-verify**:
     - Auto-resolve if `checkpoint_auto_resolve` is `verify-only`, `verify-and-decision`, or `all`
     - Auto-resolve if `--auto` flag is active AND `checkpoint_auto_resolve` is NOT `none`
     - To auto-resolve: run the verify command from the checkpoint. If passes, approve and continue. If fails, present to user.
   - **decision**:
     - Auto-resolve if `checkpoint_auto_resolve` is `verify-and-decision` or `all`
     - To auto-resolve: use the first/default option. Log which option was auto-selected.
     - If `checkpoint_auto_resolve` is `verify-only` or `none`: present to user.

5. If auto-resolved:
   Log: `"Auto-resolved {type} checkpoint for Plan {id}, Task {N}: {resolution}"`
   Resume executor with resolution context.

6. If NOT auto-resolved, present based on type:

   **For `human-verify`:**

   ```text
   CHECKPOINT: Verify Output

   Plan {id}, Task {N}: {description}

   What was built:
   {what_built from checkpoint data}

   How to verify:
   {verify_steps from checkpoint data}
   ```

   **CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
   Use AskUserQuestion with options: "Looks good", "Has issues" (+ text field for details)

   **For `decision`:**

   ```text
   CHECKPOINT: Decision Required

   Plan {id}, Task {N}: {description}

   Options:
   {options from checkpoint data}
   ```

   **CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
   Use AskUserQuestion with the options from the checkpoint as selectable choices

   **For `human-action`:**

   ```text
   CHECKPOINT: Action Required

   Plan {id}, Task {N}: {description}

   You need to:
   {required_action from checkpoint data}

   Reply when complete.
   ```

   **CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
   Use AskUserQuestion with options: "Done", "Can't do this right now"
   If user selects "Can't do this right now": suggest "Run `/pbr:pause` to save state and resume later."

7. Wait for user response
8. Spawn a FRESH continuation executor:

Reference: `references/continuation-format.md` for the continuation protocol.

Read `${CLAUDE_SKILL_DIR}/templates/continuation-prompt.md.tmpl` and fill in:

- `{NN}-{slug}`, `{plan_id}` — current phase and plan
- `{plan_summary}` — the ## Summary section from PLAN.md
- `{task table rows}` — one row per task with completion status
- `{user's response}` — the checkpoint resolution from Step 3
- `{project context key-values}` — config values + file paths

Use the filled template as the Task() prompt.

#### 6e-ii. CI Gate (after wave completion, conditional)

If `config.ci.gate_enabled` is `true` AND `config.git.branching` is not `none`:

1. Push current commits: `git push`
2. Wait 5 seconds for CI to trigger
3. Get the current run ID:
   ```bash
   gh run list --branch $(git branch --show-current) --limit 1 --json databaseId -q '.[0].databaseId'
   ```
4. Poll CI status using CLI:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js ci-poll <run-id> [--timeout <seconds>]
   ```
   Returns `{ status, conclusion, url, next_action, elapsed_seconds }`.
5. If `next_action` is `"continue"`: proceed to next wave
6. If `next_action` is `"wait"`: re-run ci-poll after 15 seconds (repeat up to `config.ci.wait_timeout_seconds`)
7. If `next_action` is `"abort"` or `status` is `"failed"`:
   **CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
   Show warning box and use AskUserQuestion: Wait / Continue anyway / Abort
8. If "Continue anyway": log deviation — `DEVIATION: CI gate bypassed for wave {N}`
9. If "Abort": stop build, update STATE.md

#### 6f. Update STATE.md

After each wave completes (all plans in the wave are done, skipped, or aborted):

**SUMMARY gate — verify before updating STATE.md:**
For every plan in the wave, run:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js summary-gate {phase-slug} {plan-id}
```

Returns `{ ok: bool, gate: string, detail: string }`. Block STATE.md update until ALL plans return `ok: true`. If any fail, warn: "SUMMARY gate failed for plan {id}: {gate} — {detail}. Cannot update STATE.md."

Once gates pass, update `.planning/STATE.md`:

**Tooling shortcut**: Use the CLI for atomic STATE.md updates instead of manual read-modify-write:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state patch '{"plans_complete":"{N}","status":"building","last_activity":"now"}'
```

**CLI exit code verification with retry**: After running each pbr-tools CLI command above, check the exit code:

- If the command succeeds (exit 0): proceed to next command
- If the command fails (non-zero exit):
  1. Log the error: "CLI command failed: {command} (exit {code})"
  2. Wait 1 second
  3. Retry the command once
  4. If retry also fails: log warning "CLI command failed after retry: {command}" and continue. Do NOT block the workflow -- state can be reconciled later via `/pbr:status`

- Current plan progress: "{completed}/{total} in current phase"
- Last activity timestamp
- Progress bar percentage
- Any new decisions from executor deviations

**STATE.md size limit:** Follow the size limit enforcement rules in `skills/shared/state-update.md` (150 lines max — collapse completed phases, remove duplicated decisions, trim old sessions).

**Completion check:** Before proceeding to next wave, confirm ALL of:
- [ ] SUMMARY gate passed for every plan in this wave
- [ ] STATE.md frontmatter `plans_complete` updated
- [ ] STATE.md body progress bar updated
- [ ] `last_activity` timestamp refreshed

To verify programmatically: `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js step-verify build step-6f '["STATE.md updated","SUMMARY.md exists","commit made"]'`
If any item fails, investigate before proceeding to the Regression Gate.

---

### Regression Gate (Pre-Verification)

Before proceeding to verification, run a quick regression check:

1. Read `.planning/config.json` — check `features.regression_gate` (default: `true`). If `false`, skip this gate.
2. Run the project's test suite: `npm test 2>&1 | tail -20`
3. If tests pass: log `Regression gate: PASSED — all tests pass` and proceed to verification.
4. If tests fail:
   a. Log: `Regression gate: FAILED — {N} test failures detected`
   b. Display the failing test output
   c. **CRITICAL**: Do NOT fix failures inline. Spawn a debugger agent:
      `Task({ subagent_type: "pbr:debugger", prompt: "Phase {N} regression gate failed. Test output: {failure_output}. Fix the regressions." })`
   d. After debugger completes, re-run `npm test` to confirm fix
   e. If still failing after debugger: STOP and report to user

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
Note for Step 8f completion summary: append "Note: Automatic verification was skipped (goal_verification: false). Run `/pbr:verify-work {N}` to verify what was built."

**Confidence-Gated Verification Skip (conditional):**

Before spawning the verifier, check if the build passes the confidence gate:

1. Read `verification.confidence_gate` from config. If `false` or not set, skip this check — proceed to normal verification flow.
2. Read `verification.confidence_threshold` from config (default: `100`).
3. Collect confidence signals:
   a. Read ALL SUMMARY.md frontmatter from this phase's completed plans. Extract `completion` percentage from each.
   b. Calculate aggregate completion: average of all plan completion percentages.
   c. Check commit SHAs: for each SUMMARY.md that lists `commits`, verify they exist via `git log --oneline {sha} -1` (quick existence check, not full log).
   d. Detect test suite: check for `package.json` (scripts.test), `pytest.ini`/`pyproject.toml` ([tool.pytest]), `Makefile` (test target), or `Cargo.toml`. Use the first match.
   e. Run test suite: execute the detected test command (e.g., `npm test`, `pytest`, `make test`). Capture exit code.
   f. Wiring check: for each file in SUMMARY.md key_files (excluding test files and .md files), verify at least one require()/import reference exists elsewhere in the project. Use: `grep -rl "{basename}" --include="*.js" --include="*.cjs" --include="*.ts" --include="*.md" . | grep -v node_modules | grep -v "{key_file_itself}"`. If any key file has zero external references, it is orphaned.

4. Evaluate confidence gate:
   - `completion_met`: aggregate completion >= `confidence_threshold`
   - `shas_verified`: all listed commit SHAs exist in git log
   - `tests_passed`: test suite exit code is 0 (or no test suite detected — treat as pass with warning)
   - `key_files_imported`: all key_files (excluding tests, docs, config) have at least one import/require reference elsewhere in the project

5. If ALL FOUR pass:
   - Display: `Confidence gate passed — spawning verifier in light mode`
   - The confidence gate result is advisory context for the verifier. The verifier ALWAYS runs to check must-haves.

6. If ANY signal fails:
   - Display: `Confidence gate not met ({failed_signals}) — spawning verifier in full mode`
   - If wiring check failed specifically: `Display: Confidence gate not met (orphaned files: {list}) — spawning verifier in full mode`

In both cases, proceed to the verifier spawn below. The confidence gate never skips the verifier — it only determines logging output.

**If verification is enabled:**

Display to the user: `◆ Spawning verifier...`

Spawn a verifier Task():

```
Task({
  subagent_type: "pbr:verifier",
  prompt: <verifier prompt>
})

NOTE: The pbr:verifier subagent type auto-loads the agent definition. Do NOT inline it.

After verifier completes, check for completion marker: `## VERIFICATION COMPLETE`. Read VERIFICATION.md frontmatter for status.
```

**Path resolution**: Before constructing the agent prompt, resolve `${CLAUDE_PLUGIN_ROOT}` to its absolute path. Do not pass the variable literally in prompts — Task() contexts may not expand it. Use the resolved absolute path for any pbr-tools.js or template references included in the prompt.

#### Verifier Prompt Template

Use the same verifier prompt template as defined in `/pbr:verify-work`: read `${CLAUDE_PLUGIN_ROOT}/skills/review/templates/verifier-prompt.md.tmpl` and fill in its placeholders with the phase's PLAN.md must_haves and SUMMARY.md file paths. This avoids maintaining duplicate verifier prompts across skills.

**Prepend this block to the verifier prompt before sending:**
```
<files_to_read>
CRITICAL (no hook): Read these files BEFORE any other action:
1. .planning/phases/{NN}-{slug}/PLAN-*.md — must-haves to verify against
2. .planning/phases/{NN}-{slug}/SUMMARY-*.md — executor build summaries
3. .planning/phases/{NN}-{slug}/VERIFICATION.md — prior verification results (if exists)
</files_to_read>
```

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

This ensures that `/pbr:verify-work` after a `--gaps-only` build sees the updated verification state, not stale gaps from before the fix.

**8-pre-b. Determine final status based on verification:**
- If verification ran and status is `passed`: final_status = "built"
- If verification ran and status is `gaps_found`: final_status = "built*" (built with unverified gaps)
- If verification was skipped: final_status = "built (unverified)"
- If build was partial: final_status = "partial"

**8-pre-c. Codebase map incremental update (conditional):**

**CRITICAL (no hook): Run codebase map update if conditions are met. Do NOT skip this step.**

Only run if ALL of these are true:
- `.planning/codebase/` directory exists (project was previously scanned with `/pbr:map-codebase`)
- Build was not aborted
- `git diff --name-only {pre_build_commit}..HEAD` shows >5 files changed OR `package.json`/`requirements.txt`/`go.mod`/`Cargo.toml` was modified

If triggered:
1. Record the pre-build commit SHA at the start of Step 1 (before any executors run) for comparison
2. Run `git diff --name-only {pre_build_commit}..HEAD` to get the list of changed files
3. Display to the user: `◆ Spawning codebase mapper (incremental update)...`

   Spawn a lightweight mapper Task():
   ```
   Task({
     subagent_type: "pbr:codebase-mapper",
     model: "haiku",
     prompt: "Incremental codebase map update. These files changed during the Phase {N} build:\n{diff file list}\n\nRead the existing .planning/codebase/ documents. Update ONLY the sections affected by these changes. Do NOT rewrite entire documents — make targeted updates. If a new dependency was added, update STACK.md. If new directories/modules were created, update STRUCTURE.md. If new patterns were introduced, update CONVENTIONS.md. Write updated files to .planning/codebase/."
   })
   ```
4. Do NOT block on this — use `run_in_background: true` and continue to Step 8a. Report completion in Step 8f if it finishes in time.

**8-pre-d. Write phase manifest (on successful completion):**

If all plans completed successfully (final_status is "built" or "built (unverified)"), write `.phase-manifest.json` to the phase directory. This manifest aggregates all plan commits for the undo skill's `--phase NN` mode:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js phase write-manifest {phase-slug}
```

The manifest collects commit hashes from each plan's SUMMARY.md and stores them as a single artifact that `completePhase()` uses for rollback support. If the command fails, log a warning but do not block completion.

**CRITICAL (no hook): Update ROADMAP.md progress table NOW. Do NOT skip this step. (roadmap-sync warns)**

**8a. Update ROADMAP.md Progress table** (REQUIRED — do this BEFORE updating STATE.md):

**Tooling shortcut**: Use the CLI for atomic ROADMAP.md table updates instead of manual editing:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js roadmap update-plans {phase} {completed} {total}
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js roadmap update-status {phase} {final_status}
```
These return `{ success, old_status, new_status }` or `{ success, old_plans, new_plans }`.

> Note: Use CLI for atomic writes — direct Write bypasses file locking.

**CLI exit code verification with retry**: Same pattern as Step 6f -- if any CLI command fails, retry once after 1 second. If retry also fails, log a warning but do not block the build.

**Last-resort fallback** (only if CLI is completely unavailable after retry):
1. Open `.planning/ROADMAP.md`
2. Find the `## Progress` table
3. Locate the row matching this phase number
4. Update the `Plans Complete` column to `{completed}/{total}` (e.g., `2/2` if all plans built successfully)
5. Update the `Status` column to the final_status determined in Step 8-pre
6. Save the file — do NOT skip this step

**CRITICAL (no hook): Update STATE.md NOW with phase completion status. Do NOT skip this step. (state-sync warns)**

**8b. Update STATE.md (CRITICAL (no hook) — update BOTH frontmatter AND body):**

> Note: Use CLI for atomic writes — direct Write bypasses file locking.

Use CLI commands to update STATE.md (keeps frontmatter and body in sync atomically):
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state patch '{"status":"{final_status}","plans_complete":"{N}","last_activity":"now","progress_percent":"{pct}","last_command":"/pbr:execute-phase {N}"}'
```
These update both frontmatter fields (`status`, `plans_complete`, `last_activity`, `progress_percent`, `last_command`) and the body `## Current Position` section (`Phase:`, `Plan:`, `Status:`, `Last activity:`, `Progress:` bar) atomically — they MUST stay in sync.

**Completion check:** Before proceeding to 8c, confirm ALL of:
- [ ] STATE.md frontmatter fields set: status, plans_complete, last_activity, progress_percent, last_command
- [ ] STATE.md body ## Current Position updated: Phase, Status, Last activity, Progress bar
- [ ] Frontmatter and body are consistent (same status value in both)

To verify programmatically: `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js step-verify build step-8b '["STATE.md updated","ROADMAP.md updated","commit made"]'`
If any item fails, investigate before marking phase complete.

**8b-ii. Calculate and write velocity metrics to STATE.md (informational only):**

After updating STATE.md status, calculate velocity metrics from this phase's build data:

1. Read all SUMMARY.md files in the current phase directory. Extract `metrics.duration_minutes` from each frontmatter (if present). If duration is not in frontmatter, estimate from git log: time between first and last commit for that plan using `git log --format=%aI`.

2. Calculate:
   - `plans_executed`: count of SUMMARY.md files in this phase
   - `avg_duration_minutes`: mean of all plan durations (round to nearest integer)
   - `phase_duration_minutes`: total time from first plan start to last plan completion
   - `trend`: compare this phase's avg\_duration to the previous phase's avg\_duration (read prior phase SUMMARY.md files if they exist):
     - If >20% faster: "improving"
     - If >20% slower: "degrading"
     - Otherwise: "stable"
     - If no previous phase data: "baseline"

3. Count total plans across all phases from ROADMAP.md progress table for the `total_plans` metric.

4. Write a `## Metrics` section to STATE.md. If a `## Metrics` section already exists, replace it. Otherwise insert it before `## History` (or append at end if no History section):

```
## Metrics

| Metric | Value |
|--------|-------|
| Plans executed (this phase) | {plans_executed} |
| Avg plan duration | {avg_duration_minutes} min |
| Phase duration | {phase_duration_minutes} min |
| Trend | {trend} |
| Total plans (all phases) | {total_plans} |
```

5. Keep the metrics section concise (under 10 lines) to respect the 100-line STATE.md cap from RH-56. The metrics section replaces itself on each phase completion — it does NOT accumulate.

6. Metrics are **informational only** — they do NOT gate any workflow decisions.

**8c. Commit planning docs (if configured):**
Reference: `skills/shared/commit-planning-docs.md` for the standard commit pattern.
If `planning.commit_docs` is `true`:
- Stage SUMMARY.md files and VERIFICATION.md
- Commit: `docs({phase}): add build summaries and verification`

**8c-ii. Evolve PROJECT.md (conditional, lightweight):**

After a successful phase build (final_status is "built" or "built (unverified)"), check if `.planning/PROJECT.md` exists. If it does:

1. Read the current phase's SUMMARY.md files (frontmatter only: `provides`, `key_files`, `deferred` fields)
2. Read `.planning/PROJECT.md` to find the `### Active` requirements section
3. Spawn a lightweight Task() to propose PROJECT.md updates:

```
Task({
  subagent_type: "pbr:general",
  model: "haiku",
  prompt: "Evolve PROJECT.md after Phase {N} completion.

Read .planning/PROJECT.md and the SUMMARY.md files in .planning/phases/{NN}-{slug}/.

For each SUMMARY.md, check the 'provides' field against PROJECT.md's ### Active requirements:
- If a requirement was satisfied by this phase's deliverables, move it to ### Validated with: '- [checkmark] {requirement} -- Phase {N}'
- If a SUMMARY.md 'deferred' field mentions a new capability need, add it to ### Active

Also check STATE.md ## Accumulated Context ### Blockers/Concerns:
- If a blocker was resolved by this phase's work (check provides/key_files), remove it
- Keep unresolved blockers

Write the updated PROJECT.md. Write the updated STATE.md Accumulated Context section.

End with: ## EVOLUTION COMPLETE"
})
```

4. Run in background (`run_in_background: true`) -- do NOT block the finalization flow.
5. **Skip if**: `final_status` is "partial" (incomplete builds should not evolve project state).

This step restores the legacy transition workflow's PROJECT.md evolution that was lost during migration. It keeps requirements and blockers current across phases.

**8d. Handle git branching:**
If `git.branching` is `phase`:
- Verify we are on the phase branch: `git branch --show-current`
- If NOT on the phase branch, warn: "Expected to be on {branch-name} but on {current}. Skipping merge."
- If on the phase branch:
  - **CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
    Use AskUserQuestion (pattern: yes-no from `skills/shared/gate-prompts.md`):
    question: "Phase {N} complete on branch `pbr/phase-{NN}-{name}`. Squash merge to main?"
    header: "Merge?"
    options:
      - label: "Yes, merge"   description: "Squash merge to main and delete the phase branch"
      - label: "No, keep"     description: "Leave the branch as-is for manual review"
  - If "Yes, merge":
    1. `git switch main`
    2. `git merge --squash pbr/phase-{NN}-{name}`
    3. `git commit -m "feat({NN}-{name}): phase {N} squash merge"`
    4. `git branch -d pbr/phase-{NN}-{name}`
    5. Log: "Phase branch merged and deleted"
  - If "No, keep" or "Other": leave the branch as-is and inform the user
  - **Skip if:** `auto_mode` is true — auto-proceed with "Yes, merge"

If `git.branching` is `milestone`:
- Do NOT merge after individual phase completion
- Log: "Phase complete on milestone branch. Branch will be merged when milestone is completed via /pbr:milestone complete."
- Stay on the milestone branch for the next phase

**8d-ii. PR Creation (when branching enabled):**

If `config.git.branching` is `phase` or `milestone` AND phase verification passed:

1. Push the phase branch: `git push -u origin {branch-name}`
2. If `config.git.auto_pr` is `true`:
   - Run: `gh pr create --title "feat({phase-scope}): {phase-slug}" --body "$(cat <<'EOF'
## Phase {N}: {phase name}

**Goal**: {phase goal from ROADMAP.md}

### Key Files
{key_files from SUMMARY.md, bulleted}

### Verification
{pass/fail status from VERIFICATION.md}

---
Generated by Plan-Build-Run
EOF
)"`
3. If `config.git.auto_pr` is `false`:
   - **CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
     Use AskUserQuestion to ask: "Phase branch pushed. Create a PR?"
   - Options: Yes (create PR as above) / No / Later (skip)

**8e. Auto-advance / auto-continue (conditional):**

**If `auto_mode` is `true`:** Set `features.auto_advance = true` and `mode = autonomous` behavior for the remainder of this invocation. Pass `--auto` to chained skills. Fall through to the auto_advance logic below.

**Speculative Planning (conditional):**

Before evaluating auto-advance, check if the next phase can be speculatively planned:

1. Read `workflow.speculative_planning` from config. If `false` or not set, skip this block entirely.
2. Determine the next phase number: `N+1`.
3. Check ROADMAP.md for phase N+1:
   a. Does phase N+1 exist in the roadmap?
   b. Read its `**Depends on:**` field. Does it list phase N as a dependency?
   c. If N+1 depends on N: skip speculative planning — the next phase needs this phase's output.
   d. If N+1 does NOT depend on N (independent): proceed with speculative planning.

4. Check deviation count from this build:
   a. Read all SUMMARY.md frontmatter from this phase. Count total `deviations` across all plans.
   b. If deviation count > 2: skip speculative planning. Display: `Speculative planning skipped — {count} deviations detected (threshold: 2)`
   c. If deviation count <= 2: proceed.

5. Spawn speculative planner in background:
   a. Display: `Spawning speculative planner for Phase {N+1} (independent of Phase {N})...`
   b. Write speculative plan to a temp location: `.planning/phases/{N+1-slug}/.speculative/`
   c. Spawn:

<!-- markdownlint-disable MD046 -->

      Task({
        subagent_type: "pbr:planner",
        model: "sonnet",
        run_in_background: true,
        prompt: "Plan Phase {N+1}: {phase goal from ROADMAP.md}. Write plans to .planning/phases/{N+1-slug}/. This is a SPECULATIVE plan — it may be discarded if Phase {N} deviates significantly."
      })

<!-- markdownlint-enable MD046 -->

   d. Do NOT block on the result — continue to auto-advance evaluation.

6. After the build completes (in Step 8f), check if speculative planner finished:
   a. If finished AND phase N deviation count is still <= 2: move speculative plans from `.speculative/` to the phase directory. Display: `Speculative plans for Phase {N+1} ready`
   b. If finished BUT deviation count > 2: discard speculative plans. Delete `.speculative/` directory. Display: `Speculative plans for Phase {N+1} discarded (Phase {N} deviated)`
   c. If not yet finished: note in completion summary. Plans will be available when the planner completes.

**If `features.auto_advance` is `true` AND `mode` is `autonomous`:**
Chain to the next skill directly within this session. This eliminates manual phase cycling.

**NOTE:** When `workflow.phase_boundary_clear` is `enforce`, do NOT write `.auto-next` — force the user to /clear first. The phase boundary enforcement in auto-continue.js will also block continuation if a `.phase-boundary-pending` signal file exists.

| Build Result | Next Action | How |
|-------------|-------------|-----|
| Verification passed, more phases | Plan next phase | `Skill({ skill: "pbr:plan", args: "{N+1}" })` (append `--auto` if `auto_mode`) |
| Verification skipped, `workflow.validate_phase: true` | Run validate-phase | `Skill({ skill: "pbr:validate-phase", args: "{N}" })` (append `--auto` if `auto_mode`) |
| Verification skipped, `workflow.validate_phase: false` | Run review | `Skill({ skill: "pbr:review", args: "{N}" })` (append `--auto` if `auto_mode`) |
| Verification gaps found | **HARD STOP** — present gaps to user | If `auto_continue` also true: write `.planning/.auto-next` with `/pbr:verify-work {N}` before stopping. Do NOT auto-advance past failures. |
| Last phase in current milestone | **HARD STOP** — milestone boundary | If `auto_continue` also true: write `.planning/.auto-next` with `/pbr:complete-milestone` before stopping. Suggest `/pbr:audit-milestone`. Explain: "auto_advance pauses at milestone boundaries — your sign-off is required." |
| Build errors occurred | **HARD STOP** — errors need human review | If `auto_continue` also true: write `.planning/.auto-next` with `/pbr:execute-phase {N}` before stopping. Do NOT auto-advance past errors. |

After invoking the chained skill, it runs within the same session. When it completes, the chained skill may itself chain further (review→plan, plan→build) if auto_advance remains true. This creates the full cycle: build→review→plan→build→...

**Else if `features.auto_continue` is `true`:**
Write `.planning/.auto-next` containing the next logical command (e.g., `/pbr:plan-phase {N+1}` or `/pbr:verify-work {N}`)
- This file signals to the user or to wrapper scripts that the next step is ready

**Completion check:** Before proceeding to 8f, confirm ALL of:
- [ ] auto_advance OR auto_continue evaluated (one path taken)
- [ ] If auto_continue: `.auto-next` file written with correct next command
- [ ] Pending todos evaluated (Step 8e-ii)
- [ ] Clearly-satisfied todos auto-closed via `pbr-tools.js todo done`

To verify programmatically: `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js step-verify build step-8e '["STATE.md updated","commit made"]'`
If any item fails, investigate before closing the session.

**8e-ii. Check Pending Todos:**

**CRITICAL (no hook): Check pending todos after build. Do NOT skip this step.**

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

**8f-pre. Phase Boundary Clear (conditional):**

After verification completes and before the branded banner, check `workflow.phase_boundary_clear` from config:

1. Read config: `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js config get workflow.phase_boundary_clear`
2. If `"off"` or missing: skip (no action — current default behavior)
3. If `"recommend"`:
   - Add an advisory line to the completion output:
     ```
     Context Reset: Run /clear before starting the next phase for optimal context quality.
     ```
   - This is informational only — do NOT block the user
4. If `"enforce"`:
   - Add a prominent warning to the completion output:
     ```
     CONTEXT RESET REQUIRED
     Phase boundary clear is enforced. Run /clear before continuing to the next phase.
     The next /pbr:plan-phase or /pbr:execute-phase will work best with a fresh context window.
     ```
   - Write `.planning/.phase-boundary-pending` file containing `{phase_num}` — this signals to auto-continue.js that a clear is needed
   - Do NOT write `.planning/.auto-next` when enforce is active — the auto-continue hook will handle this

**8f. Present completion summary:**

Use the branded output templates from `references/ui-brand.md`. Route based on status:

| Status | Template |
|--------|----------|
| `passed` + more phases in current milestone | "Phase Complete" template |
| `passed` + last phase in current milestone | "Milestone Complete" template |

**Milestone boundary detection:** To determine "last phase in current milestone", read ROADMAP.md and find the `## Milestone:` section containing the current phase. Active milestones use `## Milestone:` headings directly; completed milestones are wrapped in `<details><summary>## Milestone:` blocks or use the legacy `-- COMPLETED` suffix. Check the active milestone's `**Phases:** start - end` range. If the current phase equals `end`, this is the last phase in the milestone. For projects with a single milestone or no explicit milestone sections, "last phase in ROADMAP" is equivalent.
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

Then present the appropriate branded banner from Read `references/ui-brand.md` § "Completion Summary Templates":

- **If `passed` + more phases:** Use the "Phase Complete" template. Fill in phase number, name, plan count, and next phase details.
- **If `passed` + last phase:** Use the "Milestone Complete" template. Fill in phase count.
- **If `gaps_found`:** Use the "Gaps Found" template. Fill in phase number, name, score, and gap summaries from VERIFICATION.md.

**Conditional routing additions for Next Up block:**

After the primary next-action command in the NEXT UP block, append the following conditional suggestions (in this order):

**A. Ship suggestion (gated: git.branching=phase AND auto_pr=true):**
Read `config.git.branching` and `config.git.auto_pr` from `.planning/config.json`.
If `branching === "phase"` AND `auto_pr === true`:
```
**Also available:** Create a PR for this phase's branch
`/pbr:ship`
```

**B. UI review suggestion (gated: UI files in SUMMARY key_files):**
Collect all `key_files` values from every SUMMARY.md frontmatter in this phase.
Check if any entry has extension `.tsx`, `.jsx`, `.css`, `.scss`, `.vue`, `.svelte`, or `.html` (case-insensitive).
If YES:
```
**UI components detected:** Review visual output before continuing
`/pbr:ui-review {N}`
```
If NO: skip silently — do not display an empty block.

Both A and B are appended AFTER the primary next-action command. They never replace the primary routing.

Include `<sub>/clear first → fresh context window</sub>` inside the Next Up routing block of the completion template.

**NEXT UP routing (when verification was skipped):**

If verification was skipped and `workflow.validate_phase` is `true` (default), present:

```
**Run quality gate** to check test coverage gaps

`/pbr:validate-phase {N}`

**Also available:**
- `/pbr:review {N}` — skip validation, go straight to review
- `/pbr:continue` — auto-route to next logical step
```

If `workflow.validate_phase` is `false`, present the existing `/pbr:review {N}` suggestion instead.

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
- Create the phase branch: `git switch -c pbr/phase-{NN}-{name}`
- Proceed with build on the new branch

---

## Files Created/Modified by /pbr:execute-phase

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

---

## Cleanup

Delete `.planning/.active-skill` if it exists. This must happen on all paths (success, partial, and failure) before reporting results.
