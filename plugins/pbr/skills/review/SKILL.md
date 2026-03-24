---
name: review
description: "Verify the build matched the plan. Automated checks + walkthrough with you."
allowed-tools: Read, Write, Bash, Glob, Grep, Task, AskUserQuestion, Skill
argument-hint: "<phase-number> [--auto-fix] [--teams] [--model <model>] [--auto]"
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes ~7,600 tokens. Begin executing Step 1 immediately.**

# /pbr:verify-work — Phase Review and Verification

Reference: `@references/verification-overrides.md` for verification override handling and gap acceptance.

**References:** `@references/questioning.md`, `@references/ui-brand.md`

You are the orchestrator for `/pbr:verify-work`. This skill verifies that what was built matches what was planned. It runs automated three-layer checks against must-haves, then walks the user through a conversational UAT (user acceptance testing) for each deliverable. Your job is to present findings clearly and help the user decide what's good enough versus what needs fixes.

## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.
Reference: `skills/shared/agent-type-resolution.md` for agent type fallback when spawning Task() subagents.

Additionally for this skill:
- **Minimize** reading subagent output — read only VERIFICATION.md frontmatter for summaries. Exception: if `context_window_tokens` in `.planning/config.json` is >= 500000, reading full VERIFICATION.md bodies is permitted when gap details are needed for inline presentation.

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► REVIEWING PHASE {N}                        ║
╚══════════════════════════════════════════════════════════════╝
```

Where `{N}` is the phase number from `$ARGUMENTS`. Then proceed to Step 1.

## Multi-Session Sync

Before any phase-modifying operations (writing VERIFICATION.md, updating STATE.md/ROADMAP.md), acquire a claim:

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
- Phase has been built: SUMMARY.md files exist in `.planning/phases/{NN}-{slug}/`

### Event-Driven Auto-Verification

When `features.goal_verification` is enabled and depth is "standard" or "comprehensive", the `event-handler.js` hook automatically queues verification after executor completion. The hook writes `.planning/.auto-verify` as a signal file. The build skill's orchestrator detects this signal and spawns the verifier agent.

**This is additive**: `/pbr:verify-work` can always be invoked manually regardless of auto-verification settings. If auto-verification already ran, `/pbr:verify-work` re-runs verification (useful for re-checking after fixes).

---

## Argument Parsing

Parse `$ARGUMENTS` according to `skills/shared/phase-argument-parsing.md`.

| Argument | Meaning |
|----------|---------|
| `3` | Review phase 3 |
| `3 --auto-fix` | Review phase 3, automatically diagnose and create gap-closure plans for failures |
| `3 --teams` | Review phase 3 with parallel specialist verifiers (functional + security + performance) |
| `3 --model opus` | Use opus for all verifier spawns in phase 3 (overrides config verifier_model) |
| `3 --auto` | Review phase 3 with auto mode — skip interactive UAT, auto-accept if verification passes |
| (no number) | Use current phase from STATE.md |

---

## Orchestration Flow

Execute these steps in order.

---

### Step 1: Parse and Validate (inline)

1. Parse `$ARGUMENTS` for phase number and `--auto-fix` flag
   - If `--model <value>` is present in `$ARGUMENTS`, extract the value (sonnet, opus, haiku, inherit). Store as `override_model`. When spawning verifier Task() agents, use `override_model` instead of the config-derived `blob.verifier_model`. If an invalid value is provided, display an error and list valid values.
   - If `--auto` is present in `$ARGUMENTS`: set `auto_mode = true`. Log: "Auto mode enabled — skipping interactive UAT walkthrough"
2. **CRITICAL — Init first.** Run the init CLI call as the FIRST action after argument parsing:
   ```bash
   node plugins/pbr/scripts/pbr-tools.js init verify-work {N}
   ```
   Store the JSON result as `blob`. All downstream steps MUST reference `blob` fields instead of re-reading files. Key fields: `blob.phase.dir`, `blob.phase.name`, `blob.phase.goal`, `blob.phase.plan_count`, `blob.phase.completed`, `blob.verifier_model`, `blob.has_verification`, `blob.prior_attempts`, `blob.prior_status`, `blob.summaries`.
   **CRITICAL (hook-enforced): Write .active-skill NOW.** Write the text "review" to `.planning/.active-skill` using the Write tool.
3. Resolve depth profile: run `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js config resolve-depth` to get the effective feature/gate settings for the current depth. Store the result for use in later gating decisions.
4. Validate using blob fields:
   - If `blob.error`: display error and stop
   - If `blob.summaries` is empty: display "Phase hasn't been built yet" error (see error box below)
   - If `blob.phase.plan_count === 0`: display "Phase has no plans" error (see error box below)
5. If no phase number given, use `blob.phase.number` (already resolved from STATE.md by init)
6. If `.planning/.auto-verify` signal file exists, read it and note the auto-verification was already queued. Delete the signal file after reading (one-shot, same pattern as auto-continue.js).
7. Resolve verification depth:
   - Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js trust-gate {N}`
   - Parse the JSON response to get `depth` (light/standard/thorough)
   - Log: "Verification depth: {depth} (trust-based)"
   - Store as `verification_depth` for use in Step 3
   - If the command fails or graduated_verification is disabled, default to "standard"

**Validation errors:**

If phase directory not found, use conversational recovery:

1. Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js suggest-alternatives phase-not-found {slug}`
2. Parse the JSON response to get `available` phases and `suggestions` (closest matches).
3. Display: "Phase '{slug}' not found. Did you mean one of these?"
   - List `suggestions` (if any) as numbered options.
   - Offer "Show all phases" to list `available`.
4. **CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
   Use AskUserQuestion (pattern: yes-no-pick from `skills/shared/gate-prompts.md`) to let the user pick a phase or abort.
   - If user picks a valid phase slug: re-run with that slug.
   - If user chooses to abort: stop cleanly with a friendly message.

If no SUMMARY.md files:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Phase {N} hasn't been built yet.

**To fix:** Run `/pbr:execute-phase {N}` first.
```

If no PLAN.md files:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Phase {N} has no plans.

**To fix:** Run `/pbr:plan-phase {N}` first.
```

---

### Step 2: Check Existing Verification (inline)

Check if a VERIFICATION.md already exists using `blob.has_verification` and `blob.prior_status` from the init blob:

1. Check `blob.has_verification` — if `true`, a VERIFICATION.md exists at `.planning/phases/{blob.phase.dir}/VERIFICATION.md`
2. If it exists (use `blob.prior_status` and `blob.prior_attempts` for status checks):
   - Read it and check the status
   - If `status: passed` and no `--auto-fix` flag: skip to Step 4 (conversational UAT)
   - If `status: gaps_found`: present gaps and proceed to Step 4
     - Check for `fix_plans:` in frontmatter. If present, summarize each fix plan (gap, effort, tasks) before presenting gaps.
     - Classify gaps by severity: Critical (blocks functionality) vs Non-Critical (cosmetic, optional). Display severity counts: "Critical: {N}, Non-Critical: {N}"
   - If `status: human_needed`: proceed to Step 4

3. If it does NOT exist: proceed to Step 3 (automated verification)

---

### Step 3: Automated Verification (delegated)

**Depth profile gate:** Before spawning the verifier, resolve the depth profile. If `features.goal_verification` is false in the profile, skip automated verification and proceed directly to Step 5 (Conversational UAT). Note to user: "Automated verification skipped (depth: {depth}). Proceeding to manual review."

#### Team Review Mode

If `--teams` flag is present OR `config.parallelization.use_teams` is true OR `features.extended_context` is `true` in `.planning/config.json`:

When triggered by `extended_context`, log: "Extended context: auto-enabling team review (3 parallel verifiers)"

1. Create team output directory: `.planning/phases/{NN}-{slug}/team/` (if not exists)
2. Display to the user: `◆ Spawning 3 verifiers in parallel (functional, security, performance)...`

   Spawn THREE verifier agents in parallel using Task():

   **Agent 1 -- Functional Reviewer**:
   - subagent_type: "pbr:verifier"
   - Prompt includes: "You are the FUNCTIONAL REVIEWER in a review team. Focus on: must-haves met, code correctness, completeness, integration points. Write output to `.planning/phases/{NN}-{slug}/team/functional-VERIFY.md`."

   **Agent 2 -- Security Auditor**:
   - subagent_type: "pbr:verifier"
   - Prompt includes: "You are the SECURITY AUDITOR in a review team. Focus on: vulnerabilities, auth bypass paths, injection risks, secrets exposure, permission escalation. Write output to `.planning/phases/{NN}-{slug}/team/security-VERIFY.md`."

   **Agent 3 -- Performance Analyst**:
   - subagent_type: "pbr:verifier"
   - Prompt includes: "You are the PERFORMANCE ANALYST in a review team. Focus on: N+1 queries, memory leaks, unnecessary allocations, bundle size impact, blocking operations. Write output to `.planning/phases/{NN}-{slug}/team/performance-VERIFY.md`."

3. Wait for all three to complete
4. Display to the user: `◆ Spawning synthesizer...`

   Spawn synthesizer:
   - subagent_type: "pbr:synthesizer"
   - Prompt: "Read all *-VERIFY.md files in `.planning/phases/{NN}-{slug}/team/`. Synthesize into a unified VERIFICATION.md. Merge pass/fail verdicts -- a must-have fails if ANY reviewer flags it. Combine gap lists. Security and performance findings go into dedicated sections."
5. Proceed to UAT walkthrough with the unified VERIFICATION.md

If teams not enabled, proceed with existing single-verifier flow.

Reference: `references/agent-teams.md`

#### Single-Verifier Flow (default)

**Pre-spawn config reading:** Before spawning the verifier, read live verification settings from config:
- Read `features.live_verification` from config (boolean, default false)
- Read `verification.live_tools` from config (string array, default `["chrome-mcp"]`)
- Read `verification.live_timeout_ms` from config (integer, default 60000)

Display to the user: `◆ Spawning verifier...`

Spawn a verifier Task() to run three-layer checks:

```
Task({
  subagent_type: "pbr:verifier",
  // After verifier completes, check for: ## VERIFICATION COMPLETE
  prompt: <verifier prompt with:>
    verification_depth: "thorough"  // review always uses thorough depth
    live_verification: {true if features.live_verification is true, false otherwise}
    live_tools: {from verification.live_tools config, only included if live_verification is true}
    round: 1          // review is always single-pass
    total_rounds: 1   // review does not implement multi-round QA
})
```

**Path resolution**: Before constructing any agent prompt, resolve `${CLAUDE_PLUGIN_ROOT}` to its absolute path. Do not pass the variable literally in prompts — Task() contexts may not expand it. Use the resolved absolute path for any pbr-tools.js or template references included in the prompt.

#### Verifier Prompt Template

Read `${CLAUDE_SKILL_DIR}/templates/verifier-prompt.md.tmpl` and use its content as the verifier prompt.

**Prepend this block to the verifier prompt before sending:**
```
<files_to_read>
CRITICAL (no hook): Read these files BEFORE any other action:
1. .planning/phases/{NN}-{slug}/PLAN-*.md — must-haves to verify against
2. .planning/phases/{NN}-{slug}/SUMMARY-*.md — executor build summaries
3. .planning/phases/{NN}-{slug}/VERIFICATION.md — prior verification results (if exists)
4. .planning/phases/{NN}-{slug}/CONTEXT.md — locked decisions and phase constraints (if exists)
</files_to_read>
```

**Placeholders to fill before sending:**
- `{For each PLAN.md file in the phase directory:}` — inline each plan's must_haves frontmatter block
- `{For each SUMMARY.md file in the phase directory:}` — provide manifest table with file paths and status from frontmatter. The verifier reads full content from disk via Read tool.
- `{NN}-{slug}` — the phase directory name
- `{N}` — the phase number
- `{date}`, `{count}`, `{phase name}` — fill from context
- `{verification_depth}` — "thorough" (review always uses thorough depth)

**Append this block to the verifier prompt after the placeholders:**

```
**Verification depth:** thorough
- Review skill always uses thorough verification (L1-L4) + cross-phase regression check + full anti-pattern scan.

**Round metadata:** round: 1, total_rounds: 1
- Review is always single-pass verification.

**Live verification:** {live_verification}
- If true: Execute Step 5b (Live Functional Verification) using live_tools: {live_tools}
- If false: Skip Step 5b entirely
```

Wait for the verifier to complete.

**After the verifier completes**, read VERIFICATION.md frontmatter and display a quick summary before the full results:

```
✓ Verifier: {passed}/{total} must-haves verified
```

Then show a brief table of must-haves with pass/fail status:

```
| Must-Have | Status |
|-----------|--------|
| {name}    | ✓      |
| {name}    | ✗      |
```

Then display the overall verdict (`PASSED`, `GAPS FOUND`, or `HUMAN NEEDED`) before proceeding to the full results presentation.

### Step 3a: Spot-Check Verifier Output

CRITICAL (no hook): Verify verifier output before proceeding.

1. **VERIFICATION.md exists**: Check `.planning/phases/{NN}-{slug}/VERIFICATION.md` exists on disk
2. **Status field present**: Read VERIFICATION.md frontmatter — verify `status` field is present and is one of: pass, fail, partial
3. **Must-haves checked**: Verify `must_haves_checked` count > 0 in frontmatter
4. **Completion marker**: Look for `## VERIFICATION COMPLETE` in the Task() output

If ANY spot-check fails, present the user with options: **Retry** / **Continue anyway** / **Abort**

---

### Step 4: Present Verification Results (inline)

Read the VERIFICATION.md frontmatter. Check the `attempt` counter.

**If `attempt >= 3` AND `status: gaps_found`:** This phase has failed verification multiple times. Present escalation options instead of the normal flow:

Present the escalation context:
```
Phase {N}: {name} — Verification Failed ({attempt} attempts)
The same gaps have persisted across {attempt} verification attempts.
Remaining gaps: {count}
```

Use AskUserQuestion (pattern: multi-option-escalation from `skills/shared/gate-prompts.md`):
  question: "Phase {N} has failed verification {attempt} times with {count} persistent gaps. How should we proceed?"
  header: "Escalate"
  options:
    - label: "Accept gaps"   description: "Mark as complete-with-gaps and move on"
    - label: "Re-plan"       description: "Go back to /pbr:plan-phase {N} with gap context"
    - label: "Debug"         description: "Spawn /pbr:debug to investigate root causes"
    - label: "Retry"         description: "Try one more verification cycle"

- **If user selects "Accept gaps":** Follow up with a second AskUserQuestion:
    question: "Accept all gaps or pick specific ones to override?"
    header: "Override?"
    options:
      - label: "Accept all"    description: "Mark phase as complete-with-gaps, accept everything"
      - label: "Pick specific"  description: "Choose which gaps to mark as false positives"
  - If "Accept all": Update STATE.md status to `complete-with-gaps`, update ROADMAP.md to `verified*`, add a note in VERIFICATION.md about accepted gaps. Proceed to next phase.
  - If "Pick specific": Use the override flow from Step 6 "Gaps Found" section (present each gap for selection).
- **If user selects "Re-plan":** Suggest `/pbr:plan-phase {N} --gaps` to create targeted fix plans.
- **If user selects "Debug":** Suggest `/pbr:debug` with the gap details as starting context.
- **If user selects "Retry":** Continue with normal Step 5 flow.

**Otherwise**, present results normally using standardized status symbols (`✓` pass, `✗` fail, `⚠` warning — see `@references/ui-brand.md`):

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► VERIFYING                                  ║
╚══════════════════════════════════════════════════════════════╝

Phase {N}: {name} — Verification Results

Status: {✓ PASSED | ✗ GAPS FOUND | ⚠ HUMAN NEEDED}
Attempt: {attempt}

Must-have truths:  {passed}/{total}
Must-have artifacts: {passed}/{total}
Must-have key links: {passed}/{total}

{If all passed:}
✓ All automated checks passed.

{If gaps found:}
✗ Gaps found:
  1. {gap description} — {failed layer}
  2. {gap description} — {failed layer}

{If human needed:}
⚠ Items requiring your verification:
  1. {item} — {why automated check couldn't verify}
```

#### Cross-Phase Findings (conditional)

**Condition:** Only display if ALL of the following are true:
- `context_window_tokens` in `.planning/config.json` is >= 500000
- VERIFICATION.md frontmatter contains a `cross_phase_regressions` key with at least one entry

**How to check:** The `cross_phase_regressions` array was already read from VERIFICATION.md frontmatter in Step 2 or Step 4. If the array is empty or absent, skip this block entirely.

If the condition is met, append a cross-phase findings section to the Step 4 output:

```
Cross-Phase Regressions: {count} found

| Prior Phase | Must-Have | Status | Evidence |
|-------------|-----------|--------|----------|
| {phase}     | {must_have} | ✗ REGRESSION | {evidence} |
| {phase}     | {must_have} | ✓ INTACT | — |

{If regressions found:}
⚠ These must-haves passed in prior phases but may be broken by current phase changes.
  Treat them as additional gaps — select "Auto-fix" to create repair plans.
```

Cross-phase regressions are displayed AFTER the single-phase verification results and BEFORE the UAT walkthrough (Step 5). They are additive — they do not replace single-phase results.

If regressions exist, include them in the gap count for the "Gaps Found" flow in Step 6. When presenting gap options to the user, regressions appear in the gap list labeled `[cross-phase]` to distinguish them from current-phase gaps.

---

### Step 5: Conversational UAT (inline)

**Skip if:** `auto_mode` is true — skip the interactive UAT walkthrough entirely. Still run automated verification (Step 3). If automated verification passed, auto-accept and proceed to Step 6 "All Items Pass" path. If automated verification found gaps, proceed to Step 6 "Gaps Found" path.

**Autonomy gate:** Read `autonomy.level` from config.
- If level is "guided", "collaborative", or "adaptive" AND automated verification passed (status: passed):
  Skip interactive UAT. Log: "UAT skipped (autonomy: {level}, verification: passed)."
  Proceed directly to Step 6 "All Items Pass" path.
- If level is "supervised" OR verification has gaps:
  Run full interactive UAT as currently defined.

Walk the user through each deliverable one by one. This is an interactive conversation, not an automated check.

**For each plan in the phase:**

0. **Filter out ineligible plans**: Read each plan's SUMMARY.md `status` field. Skip plans with `status: failed`, `status: incomplete`, or `status: partial` that have zero committed tasks (check `commits` frontmatter field). Only walk through plans that completed successfully (`status: complete`) or partially with at least one committed task. For each skipped plan, note it to the user: "Skipping plan {plan_id} ({status}) — not eligible for UAT." If ALL plans in the phase are skipped, display: "No plans eligible for UAT walkthrough. All plans in Phase {N} are incomplete or failed. Run `/pbr:execute-phase {N}` to retry." and stop.
1. Read the plan's must-haves and SUMMARY.md
2. Present what was built:

```
Plan {plan_id}: {plan name}

What was built:
  {Brief description from SUMMARY.md}

Key deliverables:
  1. {artifact/truth 1}
  2. {artifact/truth 2}
  3. {artifact/truth 3}
```

3. For each must-have truth, walk the user through verification:

```
Checking: "{truth statement}"

How to verify:
  {Specific steps the user can take to check this}
  {e.g., "Open http://localhost:3000 and click Login"}
  {e.g., "Run `npm test` and check that auth tests pass"}

Does this work as expected? [pass / fail / skip]
```

4. Record the user's assessment for each item

**Keep the conversation flowing:**
- If user says "pass": move to the next item
- If user says "fail": ask what's wrong, record the issue
- If user says "skip": note it and move on
- If user has questions: answer them using the SUMMARY.md and plan context

---

### Step 6: Handle Results (inline)

Compile the UAT results and determine next steps.

#### All Items Pass

If all automated checks and UAT items passed:

1. **Update `.planning/ROADMAP.md` Progress table** (REQUIRED — do this BEFORE updating STATE.md):

   > Note: Use CLI for atomic writes — direct Write bypasses file locking.

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js roadmap update-status {phase} verified
   node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state patch '{"status":"verified","last_activity":"now"}'
   ```

2. Update `.planning/STATE.md` via CLI **(CRITICAL (no hook) — update BOTH frontmatter AND body):**

   > Note: Use CLI for atomic writes — direct Write bypasses file locking.

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state patch '{"status":"verified","last_activity":"now","last_command":"/pbr:verify-work {N}"}'
   ```
   These update both frontmatter (`status`, `progress_percent`, `last_activity`, `last_command`) and body `## Current Position` (`Status:`, `Last activity:`, `Progress:` bar) atomically — they MUST stay in sync. See `skills/shared/state-update.md`.
   - **STATE.md size limit:** Follow size limit enforcement rules in `skills/shared/state-update.md` (150 lines max).
3. Update VERIFICATION.md with UAT results (append UAT section)
3. Present completion:

Use the branded output from `references/ui-brand.md`:
- If more phases remain: use the "Phase Complete" banner template
- If this was the last phase in the current milestone: use the "Milestone Complete" banner template
- **Milestone boundary detection:** Read ROADMAP.md and find the `## Milestone:` section containing the current phase. Active milestones use `## Milestone:` headings directly; completed milestones are wrapped in `<details><summary>## Milestone:` blocks or use the legacy `-- COMPLETED` suffix. Check the active milestone's `**Phases:** start - end` range. If the current phase equals `end`, this is the last phase in the milestone.
- Always include the "Next Up" routing block

4. If `gates.confirm_transition` is true in config AND `features.auto_advance` is NOT true:
   - Use AskUserQuestion (pattern: yes-no from `skills/shared/gate-prompts.md`):
     question: "Phase {N} verified. Ready to move to Phase {N+1}?"
     header: "Continue?"
     options:
       - label: "Yes"  description: "Proceed to plan Phase {N+1}"
       - label: "No"   description: "Stay on Phase {N} for now"
   - If "Yes": suggest `/pbr:plan-phase {N+1}`
   - If "No" or "Other": stop

5. **If `auto_mode` is `true` AND more phases remain:** Set `features.auto_advance = true` and `mode = autonomous` behavior for the remainder of this invocation. Chain directly to plan: `Skill({ skill: "pbr:plan", args: "{N+1} --auto" })`. This continues the review→plan→build cycle automatically. **If this is the last phase in the current milestone:** HARD STOP — do NOT auto-advance past milestone boundaries. Display: "auto_advance pauses at milestone boundaries — your sign-off is required."

   **Else if `features.auto_advance` is `true` AND `mode` is `autonomous` AND more phases remain:**
   - Chain directly to plan: `Skill({ skill: "pbr:plan", args: "{N+1}" })`
   - This continues the build→review→plan cycle automatically
   - **If this is the last phase in the current milestone:** HARD STOP — do NOT auto-advance past milestone boundaries. Display: "auto_advance pauses at milestone boundaries — your sign-off is required."

#### Gaps Found WITH `--auto-fix`

If gaps were found and `--auto-fix` was specified:

**Step 6a: Diagnose**

Display to the user: `◆ Spawning debugger...`

Spawn a debugger Task() to analyze each failure:

```
Task({
  subagent_type: "pbr:debugger",
  prompt: <debugger prompt>
})
```

##### Debugger Prompt Template

Read `${CLAUDE_SKILL_DIR}/templates/debugger-prompt.md.tmpl` and use its content as the debugger prompt.

**Prepend this block to the debugger prompt before sending:**
```
<files_to_read>
CRITICAL (no hook): Read these files BEFORE any other action:
1. .planning/phases/{NN}-{slug}/VERIFICATION.md — gaps and failure details
2. .planning/phases/{NN}-{slug}/SUMMARY-*.md — what was built
3. .planning/phases/{NN}-{slug}/PLAN-*.md — original plan must-haves
</files_to_read>
```

**Placeholders to fill before sending:**
- `[Inline the VERIFICATION.md content]` — provide file path; debugger reads via Read tool
- `[Inline all SUMMARY.md files for the phase]` — provide manifest table of file paths
- `[Inline all PLAN.md files for the phase]` — provide manifest table of file paths

**Step 6b: Create Gap-Closure Plans**

After receiving the root cause analysis, display to the user: `◆ Spawning planner (gap closure)...`

Spawn the planner in gap-closure mode:

```
Task({
  subagent_type: "pbr:planner",
  prompt: <gap planner prompt>
})
```

##### Gap Planner Prompt Template

Read `${CLAUDE_SKILL_DIR}/templates/gap-planner-prompt.md.tmpl` and use its content as the gap planner prompt.

**Prepend this block to the gap planner prompt before sending:**
```
<files_to_read>
CRITICAL (no hook): Read these files BEFORE any other action:
1. .planning/phases/{NN}-{slug}/VERIFICATION.md — gaps to close
2. .planning/phases/{NN}-{slug}/PLAN-*.md — existing plans for context
3. .planning/CONTEXT.md — locked decisions and constraints (if exists)
</files_to_read>
```

**Placeholders to fill before sending:**
- `[Inline VERIFICATION.md]` — provide file path; planner reads via Read tool
- `[Inline the debugger's root cause analysis]` — keep inline (already in conversation context)
- `[Inline all existing PLAN.md files for this phase]` — provide manifest table of file paths
- `[Inline CONTEXT.md if it exists]` — provide file path; planner reads via Read tool
- `{NN}-{slug}` — the phase directory name

**Step 6c: Validate gap-closure plans (conditional)**

If `features.plan_checking` is true in config:
- Display to the user: `◆ Spawning plan checker...`
- Spawn plan checker Task() on the new gap-closure plans
- Same process as `/pbr:plan-phase` Step 6

**Step 6d: Present gap-closure plans to user**

```
Auto-fix analysis complete.

Gaps found: {count}
Root causes identified: {count}
Gap-closure plans created: {count}

Plans:
  {plan_id}: {name} — fixes: {gap description} ({difficulty})
  {plan_id}: {name} — fixes: {gap description} ({difficulty})

Use AskUserQuestion (pattern: approve-revise-abort from `skills/shared/gate-prompts.md`):
  question: "Approve these {count} gap-closure plans?"
  header: "Approve?"
  options:
    - label: "Approve"          description: "Proceed — I'll suggest the build command"
    - label: "Review first"     description: "Let me review the plans before approving"
    - label: "Fix manually"     description: "I'll fix these gaps myself"

- If "Approve": suggest `/pbr:execute-phase {N} --gaps-only`
- If "Review first" or "Other": present the full plan files for inspection
- If "Fix manually": suggest relevant files to inspect based on gap details

#### Gaps Found WITHOUT `--auto-fix`

If gaps were found and `--auto-fix` was NOT specified:

1. List all gaps clearly, grouped by severity (Critical first, then Non-Critical)
2. If VERIFICATION.md frontmatter contains `fix_plans:`, present existing fix plans:
   - For each fix plan: show gap, estimated effort, and planned tasks
   - Offer to create these as follow-up plans directly
3. **Default to auto-fix** — offer it as the recommended action, not a hidden flag

```
Phase {N}: {name} — Gaps Found

{count} verification gaps need attention:

1. {gap description}
   Layer failed: {existence | substantiveness | wiring}
   Details: {what's wrong}

2. {gap description}
   ...

Use AskUserQuestion (pattern: multi-option-gaps from `skills/shared/gate-prompts.md`):
  question: "{count} verification gaps need attention. How should we proceed?"
  header: "Gaps"
  options:
    - label: "Auto-fix"  description: "Diagnose root causes and create fix plans (recommended)"
    - label: "Override"   description: "Accept specific gaps as false positives"
    - label: "Manual"     description: "I'll fix these myself"
    - label: "Skip"       description: "Save results for later"

**If user selects "Auto-fix":** proceed with the same Steps 6a-6d as the `--auto-fix` flow above (diagnose, create gap-closure plans, validate, present). This is the default path.

**If user selects "Override":** present each gap and ask which ones to accept. For each accepted gap, collect a reason. Add to VERIFICATION.md frontmatter `overrides` list:
```yaml
overrides:
  - must_have: "{text}"
    reason: "{user's reason}"
    accepted_by: "user"
    accepted_at: "{ISO date}"
```
After adding overrides, re-evaluate: if all remaining gaps are now overridden, mark status as `passed`. Otherwise, offer auto-fix for the remaining non-overridden gaps.

**If user selects "Manual":** suggest relevant files to inspect based on the gap details.

**If user selects "Skip":** save results and exit.

---

## UAT Result Recording

**Template reference:** Read `${CLAUDE_PLUGIN_ROOT}/templates/UAT.md.tmpl` for the persistent UAT session format. Use this template when creating standalone UAT tracking files for complex phases. For simpler phases, append UAT results directly to VERIFICATION.md as shown below.

After conversational UAT, append UAT results to VERIFICATION.md:

```markdown
## User Acceptance Testing

| # | Item | Automated | UAT | Final Status |
|---|------|-----------|-----|-------------|
| 1 | {must-have} | PASS | PASS | VERIFIED |
| 2 | {must-have} | PASS | FAIL | GAP |
| 3 | {must-have} | GAP | — | GAP |
| 4 | {must-have} | PASS | SKIP | UNVERIFIED |

UAT conducted: {date}
Items verified: {count}
Items passed: {count}
Items failed: {count}
Items skipped: {count}
```

---

## Integration Verification (optional)

If `features.integration_verification: true` AND this phase depends on prior phases:

After Step 3, also check cross-phase integration:
- Read SUMMARY.md `provides` and `requires` from this phase and dependent phases
- Verify that exports from prior phases are used in this phase's code
- Verify that this phase's outputs are compatible with future phase expectations
- Include integration findings in Step 4 presentation

---

## Error Handling

### Verifier agent fails
If the verifier Task() fails, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Automated verification failed.

**To fix:** We'll do a manual walkthrough instead.
```
Fall back to manual UAT only (skip automated checks).

### No must-haves to check
If plans have empty must_haves:
- Warn user: `⚠ Plans don't have defined must-haves. UAT will be based on plan descriptions only.`
- Use SUMMARY.md content as the basis for UAT

### User can't verify something
If user can't verify an item (e.g., needs server running, needs credentials):
- Mark as SKIP
- Record what's needed
- Suggest how to verify later

### Debugger fails during auto-fix
If the debugger Task() fails, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Auto-diagnosis failed.

**To fix:** Create gap-closure plans based on the verification report alone.
```
Ask user: "Would you like to proceed with gap-closure plans without root cause analysis?"

---

## Files Created/Modified by /pbr:verify-work

| File | Purpose | When |
|------|---------|------|
| `.planning/phases/{NN}-{slug}/VERIFICATION.md` | Verification report (depth-aware) | Step 3 (created or updated with UAT) |
| `.planning/phases/{NN}-{slug}/*-PLAN.md` | Gap-closure plans | Step 6b (--auto-fix only) |
| `.planning/ROADMAP.md` | Status → `verified` + Completed date | Step 6 |
| `.planning/STATE.md` | Updated with review status | Step 6 |

**Graduated depth behavior:** Step 1.7 resolves verification depth via trust-gate. Step 3 passes depth to verifier. Step 5 checks autonomy.level to gate UAT.

---

## Cleanup

Delete `.planning/.active-skill` if it exists. This must happen on all paths (success, partial, and failure) before reporting results.

## Completion

After review completes, always present a clear next action using the completion banners from Read `references/ui-brand.md` § "Completion Summary Templates":

- **If verified (not final phase):** Use the "Phase Complete" template. Fill in phase number, name, plan count, and next phase details.
- **If gaps remain:** Use the "Gaps Found" template. Fill in phase number, name, gap count, and gap summaries.
- **If final phase:** Use the "Milestone Complete" template. Fill in phase count.

Include `<sub>/clear first → fresh context window</sub>` inside the Next Up routing block of the completion template.

---

## Notes

For user-friendly interpretation of verification results, see `references/reading-verification.md`.

- The verifier agent has NO Write/Edit tools for project source code — it can only read, check, and write VERIFICATION.md
- Re-running `/pbr:verify-work` after gap closure triggers fresh verification
- UAT results are conversational — user responses are captured inline
- VERIFICATION.md is persistent and serves as the ground truth for gap closure
- The three-layer check (existence -> substantiveness -> wiring) catches progressively deeper issues
