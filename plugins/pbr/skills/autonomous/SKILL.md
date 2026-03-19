---
name: autonomous
description: "Run multiple phases hands-free. Chains discuss, plan, build, and verify automatically."
allowed-tools: Read, Write, Bash, Glob, Grep, Skill, Task, AskUserQuestion
argument-hint: "[--from <N>] [--through <N>] [--speculative-depth <N>] [--dry-run]"
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes tokens. Begin executing Step 0 immediately.**

# /pbr:autonomous — Hands-Free Multi-Phase Execution

References: @references/questioning.md, @references/ui-brand.md

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► AUTONOMOUS MODE                           ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

---

## Step 1: Config Gate and Parse Arguments

1. Read `.planning/config.json`. Check `workflow.autonomous` — if `false` or missing, display:

```
Autonomous mode is disabled.

Enable with: /pbr:config set workflow.autonomous true
```

Stop immediately. Do NOT proceed.

2. Parse `$ARGUMENTS`:

| Argument | Meaning | Default |
|----------|---------|---------|
| `--from N` | Start from phase N | Current phase from STATE.md |
| `--through N` | Stop after phase N | Last phase in current milestone |
| `--speculative-depth N` | How many phases ahead to plan speculatively | From config `workflow.speculative_depth` (default 2) |
| `--dry-run` | Show which phases would execute without doing anything | Off |

3. Determine speculative planning settings:
   - Read `workflow.speculative_planning` from config — if false, speculative depth = 0
   - Read `workflow.speculative_depth` from config (default: 2)
   - If `--speculative-depth N` provided, override config value
   - Store as `speculativeDepth` for use in Step 3

4. Read `gates.checkpoint_auto_resolve` from config (default: `"none"`). Values:
   - `"none"`: STOP on all checkpoints (user must resolve)
   - `"verify-only"`: Auto-resolve `checkpoint:human-verify` (proceed after confidence-gate passes), STOP on `checkpoint:human-action`
   - `"verify-and-decision"`: Auto-resolve verify + decision checkpoints, STOP on `checkpoint:human-action`
   - `"all"`: Auto-resolve all checkpoints (dangerous — only for fully automated pipelines)
   Store as `checkpointResolveLevel` for use in Step 3c.
5. Read `.planning/STATE.md` to determine current phase (used as default for `--from`).
6. Read `.planning/ROADMAP.md` to build phase list for current milestone.
7. Filter to phases from `--from` through `--through` that are not yet complete.
8. If no phases to execute, display: "All phases in range are complete." and stop.

**If `--dry-run`:** Display the phase list with planned actions per phase, then stop without executing.

```
DRY RUN — Would execute:
  Phase 3 (data-layer): discuss -> plan -> build -> verify
  Phase 4 (api-endpoints): plan -> build -> verify  (CONTEXT.md exists, skip discuss)
    [speculative: plan Phase 5 during Phase 4 build]
  Phase 5 (frontend): discuss -> plan -> build -> verify
Speculative depth: 2
```

When `speculativeDepth > 0`, append the speculative depth value and annotate phases where speculative planning would occur. When `speculativeDepth == 0` (speculative_planning is false), omit the speculation lines.

---

## Step 2: Dynamic Phase Detection

Before each phase iteration:

1. Re-read `.planning/ROADMAP.md` (catches inserted/removed phases between iterations)
2. Rebuild the phase list for the current milestone
3. Compare with previous iteration's list — if changed, log:
   ```
   Phase list changed: {diff}. Adjusting execution order.
   ```
4. Skip phases already marked as verified/complete in ROADMAP.md

---

## Step 3: Phase Loop

For each remaining phase N:

### 3a. Discuss Phase (conditional)

- Check if `.planning/phases/{NN}-{slug}/CONTEXT.md` exists -- if so, skip (decisions already captured)
- Count requirements for this phase: parse the `### Phase {N}:` section in ROADMAP.md, count bullet lines under `**Requirements:**`
- **Auto-skip discuss** (no Skill() call) when ANY of these are true:
  - CONTEXT.md already exists
  - Requirement count is 0 or 1 (well-specified, no gray areas worth discussing)
  - `--auto` mode is active AND all requirements are simple factual statements (no `[NEEDS DECISION]` markers)
  - Log: `Phase {N}: auto-skipping discuss ({count} requirement(s), well-specified)`
- **Run discuss** only when: CONTEXT.md missing AND requirement count >= 2 AND at least one requirement contains ambiguous language or `[NEEDS DECISION]`
  - Invoke: `Skill({ skill: "pbr:discuss", args: "{N} --auto" })`
  - The `--auto` flag triggers smart discuss batching: collect ALL gray areas across the phase requirements and present them in a single batch for resolution, rather than asking one at a time.

### 3b. Plan Phase

- Check if `.planning/phases/{NN}-{slug}/PLAN-*.md` files exist
- If NOT exists:
  - Invoke: `Skill({ skill: "pbr:plan", args: "{N} --auto" })`
- If plans exist (from speculative planning or prior run): skip planning.
  - Log: `Phase {N}: plans already exist (speculative or prior) -- skipping plan step.`
- If Skill returns failure: stop autonomous loop, display error, suggest: `/pbr:plan {N}`

### 3c. Build Phase

- Check if all PLAN files have corresponding SUMMARY files
- If incomplete:
  - Invoke: `Skill({ skill: "pbr:build", args: "{N} --auto" })`
- If all SUMMARYs exist: skip build
- **Checkpoint handling** (uses `checkpointResolveLevel` from Step 1):
  - `checkpoint:human-action`: ALWAYS stop (regardless of config). Display: "Human action required in Phase {N}. Complete the action, then resume with: `/pbr:autonomous --from {N}`"
  - `checkpoint:human-verify`: If `checkpointResolveLevel` is `"verify-only"`, `"verify-and-decision"`, or `"all"`: auto-resolve by running confidence gate. Otherwise STOP.
  - `checkpoint:human-decision`: If `checkpointResolveLevel` is `"verify-and-decision"` or `"all"`: auto-resolve with default option. Otherwise STOP.
  - Any other checkpoint type: If `checkpointResolveLevel` is `"all"`: auto-resolve. Otherwise STOP.

#### Error Classification

Before retrying any build failure, classify the error:

**Transient errors** (auto-fixable -- clean up then retry):

- Stale `.active-skill`: file exists but session that wrote it is gone (check via `ps` or absence of matching `.session-*.json`)
- Stale `.active-agent`: same pattern
- Git lock file: `.git/index.lock` or `.git/MERGE_HEAD` left by a killed process
- `EBUSY`/`EACCES` file lock errors on Windows

**Permanent errors** (do not retry):

- Missing PLAN-*.md files
- Syntax errors in plan YAML frontmatter
- Executor returned checkpoint:human-action
- Missing dependency phase SUMMARY.md (means prior phase incomplete)

**Classification procedure (Step 3c on failure):**

1. Read the Skill() return value / error message
2. Check for known transient patterns (lock files, stale signal files)
3. Read `autonomous.max_retries` from config (default: 2)
4. Read `autonomous.error_strategy` from config (default: 'retry'): 'stop' | 'retry' | 'skip'

- If Skill returns failure:
  a. Classify error (see Error Classification above)
  b. **If transient error:**
     - Auto-fix: remove stale signal file OR remove `.git/index.lock` via Bash
     - Increment retry counter for this phase (start at 0)
     - If retry counter < `autonomous.max_retries`: retry `Skill({ skill: "pbr:build", args: "{N} --auto" })`
     - If retry counter >= `autonomous.max_retries`: apply error_strategy (see below)
  c. **If permanent error:** apply error_strategy immediately (no retries)
  d. **error_strategy application:**
     - `stop` (safe default): stop autonomous loop, display error, suggest `/pbr:build {N}`
     - `retry`: already handled above (retry up to max_retries, then stop)
     - `skip`: log warning "Skipping Phase {N} due to unrecoverable error", continue to Phase N+1
  e. **On transient auto-fix:** log: `Auto-fixed transient error in Phase {N}: {description}. Retry {n}/{max}.`

### 3c-speculative. Speculative Planning (during build)

**Gate:** Only execute this sub-step if ALL conditions are met:
- `speculativeDepth > 0` (from Step 1.3 -- speculative_planning is true AND depth > 0)
- Phase N build was just invoked (not skipped because SUMMARYs exist)

**Procedure:**

1. Determine candidate phases for speculative planning:
   - Start from N+1, up to N+speculativeDepth
   - For each candidate phase C:
     a. Skip if C is beyond `--through` limit
     b. Skip if C already has PLAN-*.md files
     c. Skip if C already has CONTEXT.md AND the CONTEXT.md was NOT auto-generated
     d. Read ROADMAP.md `### Phase C:` section, extract `**Depends on:**` line
     e. Parse dependency phase numbers (same regex as build-dependency.js: `/Phase\s+(\d+)/gi`)
     f. For each dependency D: check if D is completed (has VERIFICATION.md) OR is currently building (D == N)
     g. If ALL dependencies are satisfied or in-flight: C is a candidate
     h. If ANY dependency is neither completed nor in-flight: skip C AND all phases after C

2. For each candidate phase C (in order):
   - Check agent budget: if current concurrent agents >= `parallelization.max_concurrent_agents`, skip remaining candidates
   - Log: `Speculative planning: Phase {C} (while Phase {N} builds)`
   - Invoke planner as background task:
     ```
     Task({
       subagent_type: "pbr:planner",
       model: "sonnet",
       run_in_background: true,
       prompt: "Plan Phase {C} --speculative. Phase goal from ROADMAP.md. Write plans to .planning/phases/{CC}-{slug}/. This is a speculative plan -- Phase {N} is still building. Do NOT write .active-skill. Do NOT update STATE.md."
     })
     ```
   - After dispatching: add expected plan file paths to `.autonomous-state.json` `speculative_plan_paths["{C}"]`.
     Paths use pattern `.planning/phases/{CC}-{slug}/PLAN-*.md`. At dispatch time, store the glob pattern as-is;
     it will be resolved to actual paths after the planner completes.
   - Plans are written directly to the normal phase directory (NOT .speculative/) per locked decision #2

3. After Phase N build completes (the Skill() call returns), proceed to staleness check in 3c-stale below.

Important constraints:
- Plan-only: Do NOT invoke discuss for speculative phases (locked decision #2). The planner only needs ROADMAP + CONTEXT.md.
- Exception: if a phase-level CONTEXT.md already exists from a prior manual `/pbr:discuss-phase`, that is fine -- the planner will use it.
- Do NOT speculate on phases that already have plans.
- Respect max_concurrent_agents: count the build executor as 1 agent. Speculative planners share the remaining budget.
- After dispatching speculative Task()s, do NOT write .active-skill — the orchestrator already owns it for the active Phase {N} build. The speculative planner receives --speculative and will skip signal file writes.

### 3c-stale. Staleness Check (after build completes)

**Gate:** Only execute if speculative planners were dispatched in 3c-speculative for this phase N.

Note: When speculative plans are replaced (re-planned), the checkpoint manifest from a prior
speculative run (if any) becomes stale. Re-initialize it immediately after re-planning so
that the build skill does not try to skip plans that no longer exist.

**Procedure:**

1. Wait for any outstanding speculative planner tasks to complete (they run in background).
2. Read Phase N's SUMMARY.md files. For each SUMMARY.md, extract `deviations` from YAML frontmatter.
3. Compute total deviation count across all SUMMARY files for Phase N.
4. If total deviations == 0: speculative plans are fresh -- no action needed. Log:
   `Phase {N} build: 0 deviations -- speculative plans for Phase(s) {list} are valid.`
5. If total deviations > 0: check each speculatively-planned phase C:
   a. Read ROADMAP.md dependencies for Phase C
   b. If Phase C depends on Phase N (directly):
      - Delete the speculative PLAN-*.md files for Phase C
      - Log: `Phase {N} had {count} deviation(s) -- re-planning Phase {C}`
      - Re-invoke planner synchronously:
        ```
        Skill({ skill: "pbr:plan", args: "{C} --auto" })
        ```
      - Re-initialize checkpoint manifest for Phase C with the new plan IDs:
        ```bash
        # Collect new PLAN-*.md filenames from .planning/phases/{CC}-{slug}/
        # Extract plan IDs from frontmatter (plan: field) of each new PLAN file
        node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js checkpoint init {CC}-{slug} --plans "{comma-separated plan IDs}"
        ```
        This ensures the build skill starts with accurate plan tracking when Phase C is built.
   c. If Phase C does NOT depend on Phase N: plans are still valid, no action needed.

Important: The staleness check uses deviation count from SUMMARY.md frontmatter (locked decision #3). Any deviation > 0 triggers re-plan for dependent phases. This is intentionally simple -- no partial staleness analysis.

### 3d-pre. Validate Phase (conditional)

**Gate:** Run only if ALL of these are true:
- `workflow.validate_phase` is `true` in config (default: `true` — read via `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js config get workflow.validate_phase`)
- No `VALIDATION.md` with `status: passed` already exists in the phase directory

If gate passes:
- Display: `◆ Running validate-phase for Phase {N}...`
- Invoke: `Skill({ skill: "pbr:validate-phase", args: "{N} --auto" })`
- If validate-phase returns gaps (`impl_bugs: true` in VALIDATION.md frontmatter):
  - Attempt gap closure: `Skill({ skill: "pbr:build", args: "{N} --gaps-only --auto" })`
  - Re-run validate: `Skill({ skill: "pbr:validate-phase", args: "{N} --auto" })`
  - If gaps persist: stop loop, display gaps, suggest manual intervention (same hard stop as verification gaps).
- If validate-phase passes or toggle is false: continue to step 3d.

### 3d. Verify Phase (Lightweight-First)

- Check if `VERIFICATION.md` exists with `status: passed` — if yes, skip to 3e.
- **Lightweight verification first** (avoid spawning heavyweight verifier agent):
  1. Read ALL SUMMARY.md frontmatter from this phase. Extract `completion` percentage from each.
  2. Compute aggregate completion (average across all plans).
  3. Check git log for commit SHAs listed in SUMMARY files — verify they exist.
  4. **Test result caching:** Before running the test suite:
     a. Compute cache key: the current phase directory path (e.g., `.planning/phases/23-slug`)
     b. Check `.planning/.test-cache.json` for a fresh result (TTL: 60 seconds):
        - If a fresh result exists (`passed: true`, timestamp within 60s): use it directly — do NOT re-run tests
        - Log: `Tests: cached result used (age: {age}s)`
     c. If no fresh cache: detect and run test suite (`npm test`, `pytest`, `make test`, etc.)
        - On completion: write result to `.planning/.test-cache.json` with the phase directory as key
        - Log: `Tests: ran fresh, result cached`
     d. Use the result (cached or fresh) for the confidence gate check in sub-step 5
  5. **If ALL three signals pass** (completion >= 90%, SHAs verified, tests pass):
     **CRITICAL — DO NOT SKIP: Write VERIFICATION.md to the phase directory NOW.**
     - Write a minimal VERIFICATION.md to the phase directory:

<!-- markdownlint-disable MD046 -->

     ```yaml
     ---
     status: passed
     method: confidence-gate
     completion: {pct}
     shas_verified: true
     tests_passed: true
     must_haves_checked: 0
     must_haves_passed: 0
     ---
     # Verification — Confidence Gate (Autonomous)

     Phase auto-verified via confidence gate in autonomous mode.
     Run `/pbr:verify-work {N}` for full must-have verification.
     ```

<!-- markdownlint-disable MD046 -->

   - Display: `Phase {N}: confidence gate passed (completion: {pct}%, SHAs: OK, tests: OK)`
   - Continue to next phase — do NOT spawn verifier agent.

<!-- markdownlint-enable MD046 -->

6. **If ANY signal fails**: fall through to full verification below.
- **Full verification fallback** (only when confidence gate fails):
  - Invoke: `Skill({ skill: "pbr:review", args: "{N} --auto" })`
- If verification finds gaps:
  - Attempt gap closure: `Skill({ skill: "pbr:plan", args: "{N} --gaps --auto" })`
  - Then retry build: `Skill({ skill: "pbr:build", args: "{N} --gaps-only --auto" })`
  - Then retry verify: `Skill({ skill: "pbr:review", args: "{N} --auto" })`
  - If gaps persist after one retry: stop loop, display gaps, suggest manual intervention.
- If passes: continue to next phase

### 3e. Phase Complete

- Log: "Phase {N} complete. Moving to Phase {N+1}."
- **Git branch (conditional):** If `git.branching: "phase"` in `.planning/config.json`:
  1. Read `git.phase_branch_template` from config (default: `pbr/phase-{phase}-{slug}`)
  2. Expand template: `{phase}` -> zero-padded phase number (e.g., `23`), `{slug}` -> phase slug from ROADMAP
  3. Run `git checkout -b {branch_name}` to create branch from current HEAD
  4. If that fails with "already exists": run `git checkout {branch_name}` instead
  5. Log: `Branch: {branch_name}`
  6. Write branch name to `.autonomous-state.json` under `branch_state["{N}"]`
**CRITICAL — DO NOT SKIP: Update STATE.md current_phase via CLI NOW. Do not skip.**
- Update STATE.md current_phase to next phase via CLI:
  ```bash
  node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state update current_phase {N+1}
  ```
- Update `.autonomous-state.json` with phase error metrics:

  ```bash
  # Read current state, merge phase N error/retry data, write back
  node -e "
    const fs=require('fs');
    const f='.planning/.autonomous-state.json';
    const s=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):{};
    s.errors=s.errors||{}; s.retries=s.retries||{};
    // phase_errors and phase_retries are substituted by orchestrator
    if('{phase_errors}') s.errors['{N}']='{phase_errors}';
    if('{phase_retries}'!='0') s.retries['{N}']=parseInt('{phase_retries}');
    s.timestamp=new Date().toISOString();
    fs.writeFileSync(f,JSON.stringify(s,null,2));
  "
  ```

  Where `{phase_errors}` and `{phase_retries}` are the accumulated error description and retry count tracked during Step 3c for phase N. If phase N had no errors, omit the errors entry.

- Check milestone boundary: if this was the last phase in milestone, stop loop.
  Display: "Milestone complete! Run `/pbr:milestone` to archive."

---

## Notification Throttling

During autonomous execution, suppress routine status output to reduce noise:
- **Suppress**: Hook `additionalContext` messages that repeat the same content within 60 seconds (e.g., repeated "context budget" warnings)
- **Suppress**: Per-task progress updates during build — only show per-plan completion
- **Keep**: Phase-level status changes (discussing → planned → building → verified)
- **Keep**: Error/warning messages (always display)
- **Keep**: Speculative planning status (first mention only)
- **Batch**: When multiple speculative planners complete between phases, report them in a single line: "Speculative plans ready: Phase {list}"

Target: <100 status lines per 7-phase autonomous session (excluding agent output).

---

## Step 4: Completion

Display summary:

```
PLAN-BUILD-RUN > AUTONOMOUS COMPLETE

Phases completed: {list}
Phases remaining: {list}
Speculative plans used: {count} (re-planned: {count})
Total time: {elapsed}
Errors encountered: {count}
Errors auto-fixed: {count} | Phases skipped: {count}
Test cache hits: {count}
```

If all phases completed successfully:
```
All {count} phases completed successfully.
```

Clean up `.planning/.autonomous-state.json` on successful completion.

---

## Hard Stops (autonomous loop MUST stop)

The autonomous loop MUST stop immediately when any of these conditions occur:

1. **human-action checkpoint** encountered — NEVER auto-resolve these
2. **Gap closure fails** on retry — gaps persist after one attempt
3. **Build fails** after exhausting retries — error_strategy is 'stop' or retries exhausted
4. **Milestone boundary** reached — last phase in milestone verified
5. **`--through` limit** reached — user-specified phase limit hit
6. **Context budget > 70%** — suggest: `/pbr:pause` then resume in new session with `/pbr:autonomous --from {N}`

---

## Error Recovery

Save execution state to `.planning/.autonomous-state.json` after each phase:

```json
{
  "current_phase": 4,
  "completed_phases": [2, 3],
  "speculative_plans": {"5": "pending", "6": "pending"},
  "speculative_plan_paths": {"5": [".planning/phases/05-slug/PLAN-01.md"]},
  "branch_state": {"2": "pbr/phase-02-slug", "3": "pbr/phase-03-slug"},
  "failed_phase": null,
  "error": null,
  "errors": {},
  "retries": {},
  "started_at": "2026-01-15T10:00:00Z",
  "timestamp": "2026-01-15T10:30:00Z"
}
```

Where:

- `"errors"`: object mapping phase number to error description, e.g. `{"4": "stale .active-skill"}`
- `"retries"`: object mapping phase number to retry count, e.g. `{"4": 1}`
- `"speculative_plan_paths"`: maps phase number to list of plan file paths written by speculative planner
- `"branch_state"`: maps phase number to git branch name created for that phase build

- On `--from N`: check `.autonomous-state.json` for prior run context
- Display prior run info if available: "Resuming from prior autonomous run. Last completed: Phase {N}."
- Clean up `.autonomous-state.json` on successful completion of all phases

---

Reference: `skills/shared/commit-planning-docs.md` -- if `planning.commit_docs` is true, commit modified .planning/ files.

---

## Anti-Patterns

1. **DO NOT** skip the config gate — `workflow.autonomous` must be true
2. **DO NOT** auto-resolve human-action checkpoints — always stop
3. **DO NOT** retry more than once on gap closure or build failure
4. **DO NOT** continue past milestone boundaries — user must explicitly archive
5. **DO NOT** read SKILL.md files into context — use Skill() tool for delegation
6. **DO NOT** modify STATE.md directly — use CLI commands
7. **DO NOT** ignore dynamic phase detection — always re-read ROADMAP.md between iterations
