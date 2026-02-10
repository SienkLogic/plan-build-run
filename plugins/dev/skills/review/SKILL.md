---
name: review
description: "Verify the build matched the plan. Automated checks + walkthrough with you."
allowed-tools: Read, Write, Bash, Glob, Grep, Task, AskUserQuestion
argument-hint: "<phase-number> [--auto-fix]"
---

# /dev:review — Phase Review and Verification

You are the orchestrator for `/dev:review`. This skill verifies that what was built matches what was planned. It runs automated three-layer checks against must-haves, then walks the user through a conversational UAT (user acceptance testing) for each deliverable. Your job is to present findings clearly and help the user decide what's good enough versus what needs fixes.

## Context Budget

Keep the main orchestrator context lean. Follow these rules:
- **Never** read agent definition files (agents/*.md) — subagent_type auto-loads them
- **Minimize** reading subagent output into main context — read only VERIFICATION.md frontmatter for summaries
- **Before spawning agents**: If you've already consumed significant context (large file reads, multiple subagent results), warn the user: "Context budget is getting heavy. Consider running `/dev:pause` to checkpoint progress." Suggest pause proactively rather than waiting for compaction.

## Prerequisites

- `.planning/config.json` exists
- Phase has been built: SUMMARY.md files exist in `.planning/phases/{NN}-{slug}/`

---

## Argument Parsing

Parse `$ARGUMENTS` according to `skills/shared/phase-argument-parsing.md`.

| Argument | Meaning |
|----------|---------|
| `3` | Review phase 3 |
| `3 --auto-fix` | Review phase 3, automatically diagnose and create gap-closure plans for failures |
| (no number) | Use current phase from STATE.md |

---

## Orchestration Flow

Execute these steps in order.

---

### Step 1: Parse and Validate (inline)

1. Parse `$ARGUMENTS` for phase number and `--auto-fix` flag
2. Read `.planning/config.json`
3. Validate:
   - Phase directory exists at `.planning/phases/{NN}-{slug}/`
   - SUMMARY.md files exist (phase has been built)
   - PLAN.md files exist (needed for must-have extraction)
4. If no phase number given, read current phase from `.planning/STATE.md`

**Validation errors:**
- No SUMMARY.md files: "Phase {N} hasn't been built yet. Run `/dev:build {N}` first."
- No PLAN.md files: "Phase {N} has no plans. Run `/dev:plan {N}` first."

---

### Step 2: Check Existing Verification (inline)

Check if a VERIFICATION.md already exists from `/dev:build`'s auto-verification step:

1. Look for `.planning/phases/{NN}-{slug}/VERIFICATION.md`
2. If it exists:
   - Read it and check the status
   - If `status: passed` and no `--auto-fix` flag: skip to Step 4 (conversational UAT)
   - If `status: gaps_found`: present gaps and proceed to Step 4
   - If `status: human_needed`: proceed to Step 4

3. If it does NOT exist: proceed to Step 3 (automated verification)

---

### Step 3: Automated Verification (delegated)

Spawn a verifier Task() to run three-layer checks:

```
Task({
  subagent_type: "dev:towline-verifier",
  prompt: <verifier prompt>
})
```

#### Verifier Prompt Template

Read `skills/review/templates/verifier-prompt.md.tmpl` and use its content as the verifier prompt.

**Placeholders to fill before sending:**
- `{For each PLAN.md file in the phase directory:}` — inline each plan's must_haves frontmatter block
- `{For each SUMMARY.md file in the phase directory:}` — inline YAML frontmatter only (status, key_files, commits). The verifier reads full bodies from disk in its own context.
- `{NN}-{slug}` — the phase directory name
- `{N}` — the phase number
- `{date}`, `{count}`, `{phase name}` — fill from context

Wait for the verifier to complete.

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
    - label: "Re-plan"       description: "Go back to /dev:plan {N} with gap context"
    - label: "Debug"         description: "Spawn /dev:debug to investigate root causes"
    - label: "Retry"         description: "Try one more verification cycle"

- **If user selects "Accept gaps":** Follow up with a second AskUserQuestion:
    question: "Accept all gaps or pick specific ones to override?"
    header: "Override?"
    options:
      - label: "Accept all"    description: "Mark phase as complete-with-gaps, accept everything"
      - label: "Pick specific"  description: "Choose which gaps to mark as false positives"
  - If "Accept all": Update STATE.md status to `complete-with-gaps`, update ROADMAP.md to `verified*`, add a note in VERIFICATION.md about accepted gaps. Proceed to next phase.
  - If "Pick specific": Use the override flow from Step 6 "Gaps Found" section (present each gap for selection).
- **If user selects "Re-plan":** Suggest `/dev:plan {N} --gaps` to create targeted fix plans.
- **If user selects "Debug":** Suggest `/dev:debug` with the gap details as starting context.
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
   - Use AskUserQuestion (pattern: yes-no from `skills/shared/gate-prompts.md`):
     question: "Phase {N} verified. Ready to move to Phase {N+1}?"
     header: "Continue?"
     options:
       - label: "Yes"  description: "Proceed to plan Phase {N+1}"
       - label: "No"   description: "Stay on Phase {N} for now"
   - If "Yes": suggest `/dev:plan {N+1}`
   - If "No" or "Other": stop

5. **If `features.auto_advance` is `true` AND `mode` is `autonomous` AND more phases remain:**
   - Chain directly to plan: `Skill({ skill: "dev:plan", args: "{N+1}" })`
   - This continues the build→review→plan cycle automatically
   - **If this is the last phase:** HARD STOP — do NOT auto-advance past milestone boundaries

#### Gaps Found WITH `--auto-fix`

If gaps were found and `--auto-fix` was specified:

**Step 6a: Diagnose**

Spawn a debugger Task() to analyze each failure:

```
Task({
  subagent_type: "dev:towline-debugger",
  prompt: <debugger prompt>
})
```

##### Debugger Prompt Template

Read `skills/review/templates/debugger-prompt.md.tmpl` and use its content as the debugger prompt.

**Placeholders to fill before sending:**
- `[Inline the VERIFICATION.md content — specifically the Gaps Found section]` — paste from VERIFICATION.md
- `[Inline all SUMMARY.md files for the phase]` — paste all phase SUMMARY.md files
- `[Inline all PLAN.md files for the phase]` — paste all phase PLAN.md files

**Step 6b: Create Gap-Closure Plans**

After receiving the root cause analysis, spawn the planner in gap-closure mode:

```
Task({
  subagent_type: "dev:towline-planner",
  prompt: <gap planner prompt>
})
```

##### Gap Planner Prompt Template

Read `skills/review/templates/gap-planner-prompt.md.tmpl` and use its content as the gap planner prompt.

**Placeholders to fill before sending:**
- `[Inline VERIFICATION.md]` — paste full VERIFICATION.md content
- `[Inline the debugger's root cause analysis]` — paste the debugger agent's output
- `[Inline all existing PLAN.md files for this phase]` — paste all phase PLAN.md files
- `[Inline CONTEXT.md if it exists]` — paste CONTEXT.md if present
- `{NN}-{slug}` — the phase directory name

**Step 6c: Validate gap-closure plans (conditional)**

If `features.plan_checking` is true in config:
- Spawn plan checker Task() on the new gap-closure plans
- Same process as `/dev:plan` Step 6

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

- If "Approve": suggest `/dev:build {N} --gaps-only`
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
If the verifier Task() fails:
- Fall back to manual UAT only (skip automated checks)
- Tell user: "Automated verification failed. We'll do a manual walkthrough instead."

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
If the debugger Task() fails:
- Fall back to gap-closure without root cause analysis
- Tell user: "Auto-diagnosis failed. Would you like to create gap-closure plans based on the verification report alone?"

---

## Files Created/Modified by /dev:review

| File | Purpose | When |
|------|---------|------|
| `.planning/phases/{NN}-{slug}/VERIFICATION.md` | Verification report | Step 3 (created or updated with UAT) |
| `.planning/phases/{NN}-{slug}/*-PLAN.md` | Gap-closure plans | Step 6b (--auto-fix only) |
| `.planning/ROADMAP.md` | Status → `verified` + Completed date | Step 6 |
| `.planning/STATE.md` | Updated with review status | Step 6 |

---

## Completion

After review completes, always present a clear next action:

**If verified:**
```
Phase {N} verified. Ready for Phase {N+1}.
-> /dev:plan {N+1}
```

**If gaps remain:**
```
Phase {N} has {count} gaps.
-> /dev:review {N} --auto-fix — auto-diagnose and fix
-> /dev:plan {N} --gaps — create fix plans
-> Fix manually, then /dev:review {N}
```

**If final phase:**
```
All phases complete and verified!

Your milestone is ready for wrap-up:
-> /dev:milestone audit   — verify cross-phase integration (recommended first)
-> /dev:milestone complete — archive this milestone and tag it
-> /dev:milestone new      — start planning the next set of features
-> /dev:status             — see final project status
```

---

## Notes

- The verifier agent has NO Write/Edit tools for project source code — it can only read, check, and write VERIFICATION.md
- Re-running `/dev:review` after gap closure triggers fresh verification
- UAT results are conversational — user responses are captured inline
- VERIFICATION.md is persistent and serves as the ground truth for gap closure
- The three-layer check (existence -> substantiveness -> wiring) catches progressively deeper issues
