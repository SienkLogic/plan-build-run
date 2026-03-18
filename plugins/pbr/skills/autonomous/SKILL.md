---
name: autonomous
description: "Run multiple phases hands-free. Chains discuss, plan, build, and verify automatically."
allowed-tools: Read, Write, Bash, Glob, Grep, Skill, AskUserQuestion
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

4. Read `.planning/STATE.md` to determine current phase (used as default for `--from`).
5. Read `.planning/ROADMAP.md` to build phase list for current milestone.
6. Filter to phases from `--from` through `--through` that are not yet complete.
7. If no phases to execute, display: "All phases in range are complete." and stop.

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

- Check if `.planning/phases/{NN}-{slug}/CONTEXT.md` exists
- If NOT exists AND phase has 2+ requirements:
  - Invoke: `Skill({ skill: "pbr:discuss", args: "{N} --auto" })`
  - The `--auto` flag triggers smart discuss batching: collect ALL gray areas across the phase requirements and present them in a single batch for resolution, rather than asking one at a time.
- If CONTEXT.md exists: skip discussion (decisions already captured)

### 3b. Plan Phase

- Check if `.planning/phases/{NN}-{slug}/PLAN-*.md` files exist
- If NOT exists:
  - Invoke: `Skill({ skill: "pbr:plan", args: "{N} --auto" })`
- If plans exist: skip planning (plans already created)
- If Skill returns failure: stop autonomous loop, display error, suggest: `/pbr:plan {N}`

### 3c. Build Phase

- Check if all PLAN files have corresponding SUMMARY files
- If incomplete:
  - Invoke: `Skill({ skill: "pbr:build", args: "{N} --auto" })`
- If all SUMMARYs exist: skip build
- **STOP on human-action checkpoint:** If Skill returns a checkpoint with type `human-action`: STOP the autonomous loop immediately.
  Display: "Human action required in Phase {N}. Complete the action, then resume with: `/pbr:autonomous --from {N}`"
- If Skill returns failure: attempt single retry. If retry fails: stop loop, display error.

### 3d. Verify Phase (Lightweight-First)

- Check if `VERIFICATION.md` exists with `status: passed` — if yes, skip to 3e.
- **Lightweight verification first** (avoid spawning heavyweight verifier agent):
  1. Read ALL SUMMARY.md frontmatter from this phase. Extract `completion` percentage from each.
  2. Compute aggregate completion (average across all plans).
  3. Check git log for commit SHAs listed in SUMMARY files — verify they exist.
  4. Detect and run test suite if present (`npm test`, `pytest`, `make test`, etc.).
  5. **If ALL three signals pass** (completion >= 90%, SHAs verified, tests pass):
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
- Update STATE.md current_phase to next phase via CLI:
  ```bash
  node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state update current_phase {N+1}
  ```
- Check milestone boundary: if this was the last phase in milestone, stop loop.
  Display: "Milestone complete! Run `/pbr:milestone` to archive."

---

## Step 4: Completion

Display summary:

```
PLAN-BUILD-RUN > AUTONOMOUS COMPLETE

Phases completed: {list}
Phases remaining: {list}
Total time: {elapsed}
Errors encountered: {count}
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
3. **Build fails** on retry — build error after single retry
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
  "failed_phase": null,
  "error": null,
  "started_at": "2026-01-15T10:00:00Z",
  "timestamp": "2026-01-15T10:30:00Z"
}
```

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
