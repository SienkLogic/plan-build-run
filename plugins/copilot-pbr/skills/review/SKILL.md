---
name: review
description: "Verify the build matched the plan. Automated checks + walkthrough with you."
---

# /pbr:review — Phase Review and Verification

You are the orchestrator for `/pbr:review`. This skill verifies that what was built matches what was planned. It runs automated three-layer checks against must-haves, then walks the user through a conversational UAT (user acceptance testing) for each deliverable. Your job is to present findings clearly and help the user decide what's good enough versus what needs fixes.

## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.

Additionally for this skill:
- **Minimize** reading agent output — read only VERIFICATION.md frontmatter for summaries

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PLAN-BUILD-RUN ► REVIEWING PHASE {N}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Where `{N}` is the phase number from `$ARGUMENTS`. Then proceed to Step 1.

## Prerequisites

- `.planning/config.json` exists
- Phase has been built: SUMMARY.md files exist in `.planning/phases/{NN}-{slug}/`

### Event-Driven Auto-Verification

When `features.goal_verification` is enabled and depth is "standard" or "comprehensive", event hooks automatically queue verification after executor completion. The hook writes `.planning/.auto-verify` as a signal file. The build skill's orchestrator detects this signal and invokes the verifier agent.

**This is additive**: `/pbr:review` can always be invoked manually regardless of auto-verification settings. If auto-verification already ran, `/pbr:review` re-runs verification (useful for re-checking after fixes).

---

## Argument Parsing

Parse `$ARGUMENTS` according to `skills/shared/phase-argument-parsing.md`.

| Argument | Meaning |
|----------|---------|
| `3` | Review phase 3 |
| `3 --auto-fix` | Review phase 3, automatically diagnose and create gap-closure plans for failures |
| `3 --teams` | Review phase 3 with parallel specialist verifiers (functional + security + performance) |
| (no number) | Use current phase from STATE.md |

---

## Orchestration Flow

Execute these steps in order.

---

### Step 1: Parse and Validate (inline)

1. Parse `$ARGUMENTS` for phase number and `--auto-fix` flag
2. Read `.planning/config.json`
3. Resolve depth profile: run `node ${PLUGIN_ROOT}/scripts/pbr-tools.js config resolve-depth` to get the effective feature/gate settings for the current depth. Store the result for use in later gating decisions.
4. Validate:
   - Phase directory exists at `.planning/phases/{NN}-{slug}/`
   - SUMMARY.md files exist (phase has been built)
   - PLAN.md files exist (needed for must-have extraction)
5. If no phase number given, read current phase from `.planning/STATE.md`
6. If `.planning/.auto-verify` signal file exists, read it and note the auto-verification was already queued. Delete the signal file after reading (one-shot).

**Validation errors — use branded error boxes:**

If no SUMMARY.md files:
```
ERROR

Phase {N} hasn't been built yet.

**To fix:** Run `/pbr:build {N}` first.
```

If no PLAN.md files:
```
ERROR

Phase {N} has no plans.

**To fix:** Run `/pbr:plan {N}` first.
```

---

### Step 2: Check Existing Verification (inline)

Reference: `skills/shared/config-loading.md` for the tooling shortcut (`phase-info`) and config field reference.

Check if a VERIFICATION.md already exists from `/pbr:build`'s auto-verification step:

1. Look for `.planning/phases/{NN}-{slug}/VERIFICATION.md`
2. If it exists:
   - Read it and check the status
   - If `status: passed` and no `--auto-fix` flag: skip to Step 4 (conversational UAT)
   - If `status: gaps_found`: present gaps and proceed to Step 4
   - If `status: human_needed`: proceed to Step 4

3. If it does NOT exist: proceed to Step 3 (automated verification)

---

### Step 3: Automated Verification (delegated)

**Depth profile gate:** Before invoking the verifier, resolve the depth profile. If `features.goal_verification` is false in the profile, skip automated verification and proceed directly to Step 5 (Conversational UAT). Note to user: "Automated verification skipped (depth: {depth}). Proceeding to manual review."

#### Team Review Mode

If `--teams` flag is present OR `config.parallelization.use_teams` is true:

1. Create team output directory: `.planning/phases/{NN}-{slug}/team/` (if not exists)
2. Display to the user: `Spawning 3 verifiers in parallel (functional, security, performance)...`

   Invoke THREE `@verifier` agents in parallel:

   **Agent 1 -- Functional Reviewer**:
   - Invoke `@verifier` with: "You are the FUNCTIONAL REVIEWER in a review team. Focus on: must-haves met, code correctness, completeness, integration points. Write output to `.planning/phases/{NN}-{slug}/team/functional-VERIFY.md`."

   **Agent 2 -- Security Auditor**:
   - Invoke `@verifier` with: "You are the SECURITY AUDITOR in a review team. Focus on: vulnerabilities, auth bypass paths, injection risks, secrets exposure, permission escalation. Write output to `.planning/phases/{NN}-{slug}/team/security-VERIFY.md`."

   **Agent 3 -- Performance Analyst**:
   - Invoke `@verifier` with: "You are the PERFORMANCE ANALYST in a review team. Focus on: N+1 queries, memory leaks, unnecessary allocations, bundle size impact, blocking operations. Write output to `.planning/phases/{NN}-{slug}/team/performance-VERIFY.md`."

3. Wait for all three to complete
4. Display to the user: `Spawning synthesizer...`

   Invoke `@synthesizer` with: "Read all *-VERIFY.md files in `.planning/phases/{NN}-{slug}/team/`. Synthesize into a unified VERIFICATION.md. Merge pass/fail verdicts -- a must-have fails if ANY reviewer flags it. Combine gap lists. Security and performance findings go into dedicated sections."
5. Proceed to UAT walkthrough with the unified VERIFICATION.md

If teams not enabled, proceed with existing single-verifier flow.

Reference: `references/agent-teams.md`

#### Single-Verifier Flow (default)

Display to the user: `Spawning verifier...`

Invoke the `@verifier` agent to run three-layer checks.

**Path resolution**: Before constructing any agent prompt, resolve plugin root to its absolute path. Do not pass the variable literally in prompts. Use the resolved absolute path for any pbr-tools.js or template references included in the prompt.

#### Verifier Prompt Template

Read `skills/review/templates/verifier-prompt.md.tmpl` and use its content as the verifier prompt.

**Placeholders to fill before sending:**
- `{For each PLAN.md file in the phase directory:}` — inline each plan's must_haves frontmatter block
- `{For each SUMMARY.md file in the phase directory:}` — provide manifest table with file paths and status from frontmatter. The verifier reads full content from disk via Read tool.
- `{NN}-{slug}` — the phase directory name
- `{N}` — the phase number
- `{date}`, `{count}`, `{phase name}` — fill from context

Wait for the verifier to complete.

**After the verifier completes**, read VERIFICATION.md frontmatter and display a quick summary before the full results:

```
Verifier: {passed}/{total} must-haves verified
```

Then show a brief table of must-haves with pass/fail status:

```
| Must-Have | Status |
|-----------|--------|
| {name}    | PASS   |
| {name}    | FAIL   |
```

Then display the overall verdict (`PASSED`, `GAPS FOUND`, or `HUMAN NEEDED`) before proceeding to the full results presentation.

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

Use the multi-option-escalation pattern from `skills/shared/gate-prompts.md`:
  question: "Phase {N} has failed verification {attempt} times with {count} persistent gaps. How should we proceed?"
  header: "Escalate"
  options:
    - label: "Accept gaps"   description: "Mark as complete-with-gaps and move on"
    - label: "Re-plan"       description: "Go back to /pbr:plan {N} with gap context"
    - label: "Debug"         description: "Invoke /pbr:debug to investigate root causes"
    - label: "Retry"         description: "Try one more verification cycle"

- **If user selects "Accept gaps":** Follow up with a second question:
    question: "Accept all gaps or pick specific ones to override?"
    header: "Override?"
    options:
      - label: "Accept all"    description: "Mark phase as complete-with-gaps, accept everything"
      - label: "Pick specific"  description: "Choose which gaps to mark as false positives"
  - If "Accept all": Update STATE.md status to `complete-with-gaps`, update ROADMAP.md to `verified*`, add a note in VERIFICATION.md about accepted gaps. Proceed to next phase.
  - If "Pick specific": Use the override flow from Step 6 "Gaps Found" section (present each gap for selection).
- **If user selects "Re-plan":** Suggest `/pbr:plan {N} --gaps` to create targeted fix plans.
- **If user selects "Debug":** Suggest `/pbr:debug` with the gap details as starting context.
- **If user selects "Retry":** Continue with normal Step 5 flow.

**Otherwise**, present results normally:

```
Phase {N}: {name} — Verification Results

Status: {PASSED | GAPS FOUND | HUMAN NEEDED}
Attempt: {attempt}

Must-have truths:  {passed}/{total}
Must-have artifacts: {passed}/{total}
Must-have key links: {passed}/{total}

{If all passed:}
All automated checks passed.

{If gaps found:}
Gaps found:
  1. {gap description} — {failed layer}
  2. {gap description} — {failed layer}

{If human needed:}
Items requiring your verification:
  1. {item} — {why automated check couldn't verify}
```

---

### Step 5: Conversational UAT (inline)

Walk the user through each deliverable one by one. This is an interactive conversation, not an automated check.

**For each plan in the phase:**

0. **Filter out ineligible plans**: Read each plan's SUMMARY.md `status` field. Skip plans with `status: failed`, `status: incomplete`, or `status: partial` that have zero committed tasks (check `commits` frontmatter field). Only walk through plans that completed successfully (`status: complete`) or partially with at least one committed task. For each skipped plan, note it to the user: "Skipping plan {plan_id} ({status}) — not eligible for UAT." If ALL plans in the phase are skipped, display: "No plans eligible for UAT walkthrough. All plans in Phase {N} are incomplete or failed. Run `/pbr:build {N}` to retry." and stop.
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

   **Tooling shortcut**: Use the CLI for atomic ROADMAP.md and STATE.md updates:
   ```bash
   node ${PLUGIN_ROOT}/scripts/pbr-tools.js roadmap update-status {phase} verified
   node ${PLUGIN_ROOT}/scripts/pbr-tools.js state update status verified
   node ${PLUGIN_ROOT}/scripts/pbr-tools.js state update last_activity now
   ```

   1. Open `.planning/ROADMAP.md`
   2. Find the `## Progress` table
   3. Locate the row matching this phase number
   4. Update the `Status` column to `verified`
   5. Update the `Completed` column to the current date (YYYY-MM-DD)
   6. Save the file — do NOT skip this step
2. Update `.planning/STATE.md`:
   - Phase status: "verified"
   - Progress updated
   - Last activity timestamp
   - **STATE.md size limit:** Follow size limit enforcement rules in `skills/shared/state-update.md` (150 lines max).
3. Update VERIFICATION.md with UAT results (append UAT section)
3. Present completion:

Use the branded output from `references/ui-formatting.md`:
- If more phases remain: use the "Phase Complete" banner template
- If this was the last phase: use the "Milestone Complete" banner template
- Always include the "Next Up" routing block

4. If `gates.confirm_transition` is true in config AND `features.auto_advance` is NOT true:
   - Use the yes-no pattern from `skills/shared/gate-prompts.md`:
     question: "Phase {N} verified. Ready to move to Phase {N+1}?"
     header: "Continue?"
     options:
       - label: "Yes"  description: "Proceed to plan Phase {N+1}"
       - label: "No"   description: "Stay on Phase {N} for now"
   - If "Yes": suggest `/pbr:plan {N+1}`
   - If "No" or "Other": stop

5. **If `features.auto_advance` is `true` AND `mode` is `autonomous` AND more phases remain:**
   - Chain directly to plan next phase
   - This continues the build->review->plan cycle automatically
   - **If this is the last phase:** HARD STOP — do NOT auto-advance past milestone boundaries

#### Gaps Found WITH `--auto-fix`

If gaps were found and `--auto-fix` was specified:

**Step 6a: Diagnose**

Display to the user: `Spawning debugger...`

Invoke the `@debugger` agent to analyze each failure.

##### Debugger Prompt Template

Read `skills/review/templates/debugger-prompt.md.tmpl` and use its content as the debugger prompt.

**Placeholders to fill before sending:**
- `[Inline the VERIFICATION.md content]` — provide file path; debugger reads via Read tool
- `[Inline all SUMMARY.md files for the phase]` — provide manifest table of file paths
- `[Inline all PLAN.md files for the phase]` — provide manifest table of file paths

**Step 6b: Create Gap-Closure Plans**

After receiving the root cause analysis, display to the user: `Spawning planner (gap closure)...`

Invoke the `@planner` agent in gap-closure mode.

##### Gap Planner Prompt Template

Read `skills/review/templates/gap-planner-prompt.md.tmpl` and use its content as the gap planner prompt.

**Placeholders to fill before sending:**
- `[Inline VERIFICATION.md]` — provide file path; planner reads via Read tool
- `[Inline the debugger's root cause analysis]` — keep inline (already in conversation context)
- `[Inline all existing PLAN.md files for this phase]` — provide manifest table of file paths
- `[Inline CONTEXT.md if it exists]` — provide file path; planner reads via Read tool
- `{NN}-{slug}` — the phase directory name

**Step 6c: Validate gap-closure plans (conditional)**

If `features.plan_checking` is true in config:
- Display to the user: `Spawning plan checker...`
- Invoke `@plan-checker` on the new gap-closure plans
- Same process as `/pbr:plan` Step 6

**Step 6d: Present gap-closure plans to user**

```
Auto-fix analysis complete.

Gaps found: {count}
Root causes identified: {count}
Gap-closure plans created: {count}

Plans:
  {plan_id}: {name} — fixes: {gap description} ({difficulty})
  {plan_id}: {name} — fixes: {gap description} ({difficulty})

Use the approve-revise-abort pattern from `skills/shared/gate-prompts.md`:
  question: "Approve these {count} gap-closure plans?"
  header: "Approve?"
  options:
    - label: "Approve"          description: "Proceed — I'll suggest the build command"
    - label: "Review first"     description: "Let me review the plans before approving"
    - label: "Fix manually"     description: "I'll fix these gaps myself"

- If "Approve": suggest `/pbr:build {N} --gaps-only`
- If "Review first" or "Other": present the full plan files for inspection
- If "Fix manually": suggest relevant files to inspect based on gap details

#### Gaps Found WITHOUT `--auto-fix`

If gaps were found and `--auto-fix` was NOT specified:

1. List all gaps clearly
2. **Default to auto-fix** — offer it as the recommended action, not a hidden flag

```
Phase {N}: {name} — Gaps Found

{count} verification gaps need attention:

1. {gap description}
   Layer failed: {existence | substantiveness | wiring}
   Details: {what's wrong}

2. {gap description}
   ...

Use the multi-option-gaps pattern from `skills/shared/gate-prompts.md`:
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
If the verifier agent fails, display:
```
ERROR

Automated verification failed.

**To fix:** We'll do a manual walkthrough instead.
```
Fall back to manual UAT only (skip automated checks).

### No must-haves to check
If plans have empty must_haves:
- Warn user: "Plans don't have defined must-haves. UAT will be based on plan descriptions only."
- Use SUMMARY.md content as the basis for UAT

### User can't verify something
If user can't verify an item (e.g., needs server running, needs credentials):
- Mark as SKIP
- Record what's needed
- Suggest how to verify later

### Debugger fails during auto-fix
If the debugger agent fails, display:
```
ERROR

Auto-diagnosis failed.

**To fix:** Create gap-closure plans based on the verification report alone.
```
Ask user: "Would you like to proceed with gap-closure plans without root cause analysis?"

---

## Files Created/Modified by /pbr:review

| File | Purpose | When |
|------|---------|------|
| `.planning/phases/{NN}-{slug}/VERIFICATION.md` | Verification report | Step 3 (created or updated with UAT) |
| `.planning/phases/{NN}-{slug}/*-PLAN.md` | Gap-closure plans | Step 6b (--auto-fix only) |
| `.planning/ROADMAP.md` | Status -> `verified` + Completed date | Step 6 |
| `.planning/STATE.md` | Updated with review status | Step 6 |

---

## Completion

After review completes, always present a clear next action:

**If verified (not final phase):**

Display the "Phase Complete" banner inline:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PLAN-BUILD-RUN ► PHASE {N} COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase {N}: {Name}**

{X} plans executed
Goal verified
```

Then the branded "Next Up" block:
```
---

## Next Up

**Phase {N+1}: {Name}** — {Goal from ROADMAP.md}

`/pbr:plan {N+1}`

`/clear` first for a fresh context window

---

**Also available:**
- `/pbr:discuss {N+1}` — talk through details before planning
- `/pbr:status` — see full project status

---
```

**If gaps remain:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PLAN-BUILD-RUN ► PHASE {N} GAPS FOUND
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase {N}: {name}** — {count} gaps remaining

---

## Next Up

**Fix gaps** — diagnose and create fix plans

`/pbr:review {N} --auto-fix`

`/clear` first for a fresh context window

---

**Also available:**
- `/pbr:plan {N} --gaps` — create fix plans manually
- Fix manually, then `/pbr:review {N}`

---
```

**If final phase:**

Display the "Milestone Complete" banner inline:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PLAN-BUILD-RUN ► MILESTONE COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N} phases completed
All phase goals verified
```

Then:
```
---

## Next Up

**Audit milestone** — verify cross-phase integration

`/pbr:milestone audit`

`/clear` first for a fresh context window

---

**Also available:**
- `/pbr:milestone complete` — archive this milestone and tag it
- `/pbr:milestone new` — start planning next features
- `/pbr:status` — see final project status

---
```

---

## Notes

For user-friendly interpretation of verification results, see `references/reading-verification.md`.

- The verifier agent has NO Write/Edit tools for project source code — it can only read, check, and write VERIFICATION.md
- Re-running `/pbr:review` after gap closure triggers fresh verification
- UAT results are conversational — user responses are captured inline
- VERIFICATION.md is persistent and serves as the ground truth for gap closure
- The three-layer check (existence -> substantiveness -> wiring) catches progressively deeper issues
