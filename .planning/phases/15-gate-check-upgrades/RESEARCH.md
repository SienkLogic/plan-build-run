---
phase: 15
title: Gate Check Upgrades Research
date: 2026-02-10
---

# Phase 15 Research: Gate Check Upgrades

## AskUserQuestion Tool API Summary

The AskUserQuestion tool is a Claude Code built-in with these constraints:
- 1-4 questions per invocation
- Each question has: `question` (string), `header` (max 12 chars), `options` (2-4 items), `multiSelect` (bool)
- Each option has: `label` (1-5 words), `description` (explanation text)
- Users can always select "Other" (auto-added) for custom text input
- The tool returns structured answers

## Skill-by-Skill Audit

### plan (SKILL.md)

**Approval points found: 3**

**1. Re-planning confirmation (lines 80-83)**
- Current pattern: "Phase {N} already has plans. Re-plan from scratch? This will replace existing plans." → If yes/no response
- Context: Checks if user wants to overwrite existing plans
- Gate: No config gate controls this (always runs)
- **Should convert:** YES

**2. Assumption surfacing (lines 128-153)**
- Current pattern: Multi-part inline confirmation for each assumption: "Correct? [yes/no/adjust]"
- Context: Validates planner assumptions before spawning agents (Step 3 with `--assumptions` flag)
- Gate: Only runs if `--assumptions` flag provided
- **Should convert:** YES — but this is a special case with 4+ assumptions per phase

**3. Seed selection (lines 203-214)**
- Current pattern: "Include them in planning? [yes/no/pick]"
- Context: After finding matching seeds for the phase
- Gate: No config gate controls this
- **Should convert:** YES

**4. User approval of plans (lines 303-344)**
- Current pattern: Plain text presentation ending with:
  ```
  Approve these plans?
  -> yes — proceed to build
  -> changes — request adjustments
  -> abort — cancel planning
  ```
- Context: After all plans are created and validated
- Gate: `gates.confirm_plan` in config (line 306)
- **Should convert:** YES — this is the primary gate check

**Changes approval flow (lines 337-340):**
- If user says "changes": enters discussion mode (freeform)
- This SHOULD NOT use AskUserQuestion — it's a discussion prompt, not a structured choice

### build (SKILL.md)

**Approval points found: 6**

**1. Execute confirmation (line 64)**
- Current pattern: "ask user to confirm before proceeding" (implementation details not specified)
- Context: Before starting any build work
- Gate: `gates.confirm_execute` in config
- **Should convert:** YES

**2. Plan staleness warning (lines 68-76)**
- Current pattern: "Re-plan with `/dev:plan {N}` or continue with existing plans?"
- Context: When dependency fingerprints show plans are stale
- Gate: No config gate (always runs if staleness detected)
- **Should convert:** YES

**3. All plans already completed (lines 133-136)**
- Current pattern: "Re-build? This will delete existing SUMMARYs and re-execute." → If yes/no
- Context: Crash recovery check found all plans done
- Gate: No config gate
- **Should convert:** YES

**4. Failure handling (lines 391-430)**
- Current pattern: Present failure details then ask:
  ```
  - retry — re-spawn the executor for the failed plan
  - skip — mark plan as skipped, continue to next wave
  - rollback — undo commits from the failed plan, revert to last-good state
  - abort — stop the entire build
  ```
- Context: When an executor returns `failed` or `partial`
- Gate: No config gate (always runs on failure)
- **Should convert:** YES — but needs clear descriptions for each option

**5. Phase branch merge (lines 652-655)**
- Current pattern: "Phase {N} complete on branch `towline/phase-{NN}-{name}`. Squash merge to main?"
- Context: After phase complete when using phase branching strategy
- Gate: `git.branching_strategy` is `phase`
- **Should convert:** YES

**6. Verification timestamp freshness (milestone context, not in build directly)**
- Not a build skill approval point — handled by milestone/review

### review (SKILL.md)

**Approval points found: 6**

**1. Escalation options after 3 failed attempts (lines 105-125)**
- Current pattern: Multi-option text menu:
  ```
  -> accept-with-gaps — mark phase as "complete-with-gaps" and move on
  -> re-plan — go back to /dev:plan {N} with gap context
  -> debug — spawn /dev:debug to investigate root causes
  -> override — mark specific gaps as false positives
  -> retry — try one more verification cycle
  ```
- Context: After 3 verification attempts with persistent gaps
- Gate: No config gate (triggered by attempt count)
- **Should convert:** YES — this is a critical decision point

**2. UAT item verification (lines 175-188)**
- Current pattern: For each must-have truth, inline conversation:
  ```
  Does this work as expected? [pass / fail / skip]
  ```
- Context: Walking user through deliverables one by one
- Gate: No config gate (part of UAT flow)
- **Should convert:** MAYBE — this is a repeated micro-decision in a loop. AskUserQuestion might be too heavy if there are 10+ items. Keep as freeform?

**3. Auto-fix confirmation (lines 227-233)**
- Current pattern: "Ready to move to Phase {N+1}?"
- Context: After all verification passed
- Gate: `gates.confirm_transition` in config AND `features.auto_advance` is NOT true
- **Should convert:** YES

**4. Gap-closure plan approval (lines 286-302)**
- Current pattern:
  ```
  Approve these gap-closure plans?
  -> yes — I'll suggest the build command
  -> no — let me review the plans first
  -> manual — I'll fix these myself
  ```
- Context: After auto-fix creates gap-closure plans
- Gate: Runs if `--auto-fix` flag or user chooses auto-fix from gap menu
- **Should convert:** YES

**5. Gaps found handling (lines 308-348)**
- Current pattern: Default to auto-fix with menu:
  ```
  -> yes (recommended) — diagnose root causes and create gap-closure plans
  -> override — accept specific gaps as false positives (won't block verification)
  -> manual — I'll fix these myself
  -> skip — just save the results for later
  ```
- Context: After verification finds gaps, no `--auto-fix` flag
- Gate: No config gate (always runs when gaps found)
- **Should convert:** YES

**6. Override gap selection (lines 336-344)**
- Current pattern: "present each gap and ask which ones to accept" → custom loop
- Context: User chose "override" from gaps menu
- Gate: No config gate
- **Should convert:** MAYBE — this is a custom multi-select loop. Could use AskUserQuestion with `multiSelect: true` but needs iteration per gap for reasons.

### import (SKILL.md)

**Approval points found: 4**

**1. Replace existing plans confirmation (lines 50-52)**
- Current pattern: "Phase {N} already has plans. Replace them with imported plans?"
- Context: Phase directory already has PLAN.md files
- Gate: No config gate (always runs if plans exist)
- **Should convert:** YES

**2. Blocker resolution (lines 191-193)**
- Current pattern: "ask user to resolve EACH blocker via AskUserQuestion"
- Context: After conflict detection report finds blockers
- Gate: No config gate (always runs if blockers found)
- **Should convert:** Already using AskUserQuestion (line 191 explicitly says "via AskUserQuestion")
- **Action needed:** NONE — already implemented

**3. Warning acknowledgment (line 192)**
- Current pattern: "Acknowledge these findings and continue with conversion?" via AskUserQuestion
- Context: After conflict detection report finds only warnings/info
- Gate: No config gate (always runs if warnings but no blockers)
- **Should convert:** Already using AskUserQuestion
- **Action needed:** NONE — already implemented

**4. Checker revision loop (lines 309-311)**
- Current pattern: "These issues remain after 3 revision attempts. Proceed anyway, or adjust the approach?"
- Context: Plan checker found issues after 3 iterations
- Gate: `features.plan_checking` enabled
- **Should convert:** YES

### milestone (SKILL.md)

**Approval points found: 7**

**1. New milestone details (lines 74-77)**
- Current pattern: Multi-question flow via AskUserQuestion:
  - "What's the name/goal for this new milestone?"
  - "What are the major features or capabilities it should deliver?"
- Context: Starting a new milestone
- Gate: No config gate
- **Should convert:** Already using AskUserQuestion
- **Action needed:** NONE — already implemented

**2. Mini roadmap session (lines 84-92)**
- Current pattern: Multi-question flow via AskUserQuestion:
  - "What are the 2-5 major areas of work for this milestone?"
  - For each area: "Any specific requirements or constraints for {area}?"
- Context: Creating phases for new milestone
- Gate: No config gate
- **Should convert:** Already using AskUserQuestion
- **Action needed:** NONE — already implemented

**3. Unverified phases warning (lines 171-184)**
- Current pattern: "Continue anyway? (not recommended)" → user decision
- Context: Some phases lack VERIFICATION.md during milestone complete
- Gate: No config gate (validation check)
- **Should convert:** YES

**4. Timestamp freshness check (lines 187-194)**
- Current pattern: "Re-run `/dev:review` for affected phases, or proceed anyway?"
- Context: SUMMARY.md newer than VERIFICATION.md
- Gate: No config gate (validation check)
- **Should convert:** YES

**5. Version collision (lines 488-490)**
- Current pattern: "Tag {version} already exists. Use a different version number." → ask for alternative via AskUserQuestion
- Context: Git tag already exists for requested version
- Gate: No config gate
- **Should convert:** Already using AskUserQuestion
- **Action needed:** NONE — already implemented

**6. Existing analysis refresh decision (lines 37-49)**
- Current pattern: (in scan context, not milestone) Multi-option menu
- Not in milestone skill — this is in scan

**7. Gap priority selection (lines 387-410)**
- Current pattern: Multi-option menu:
  ```
  Which gaps should we address?
  1. All must-fix gaps
  2. Must-fix + should-fix
  3. Everything
  4. Let me pick specific ones
  ```
- Context: After reading milestone audit gaps
- Gate: No config gate
- **Should convert:** YES

### scan (SKILL.md)

**Approval points found: 2**

**1. Existing analysis decision (lines 36-52)**
- Current pattern: Multi-option menu via AskUserQuestion:
  ```
  Options:
  1. Refresh the full analysis (overwrites existing)
  2. Refresh a specific area (tech, arch, quality, or concerns)
  3. Keep existing analysis
  ```
- Context: `.planning/codebase/` already exists
- Gate: No config gate
- **Should convert:** Already using AskUserQuestion
- **Action needed:** NONE — already implemented

**2. Commit decision (lines 387-388)**
- Current pattern: "Commit the codebase analysis? (y/n)"
- Context: No config.json exists yet (scan before begin)
- Gate: Not a gate config — this is a git convenience
- **Should convert:** YES

## Cross-Cutting Patterns

### Pattern 1: Approve/Revise/Abort (3-option gate)
Used in:
- **plan** Step 8 (approve plans)
- **review** Step 6d (approve gap-closure plans)

Standard options:
1. **Approve/Yes** — proceed with the work
2. **Changes/Revise** — request adjustments (triggers discussion)
3. **Abort/Cancel** — stop the workflow

AskUserQuestion mapping:
```
{
  question: "Approve these {plans|changes|...}?",
  header: "Approve?",
  options: [
    { label: "Approve", description: "Proceed with {build|execution|...}" },
    { label: "Request changes", description: "Discuss adjustments before proceeding" },
    { label: "Abort", description: "Cancel this operation" }
  ],
  multiSelect: false
}
```

### Pattern 2: Yes/No simple confirmation
Used in:
- **plan** re-planning (line 80)
- **build** all plans completed (line 133)
- **build** phase branch merge (line 652)
- **import** replace plans (line 50)
- **milestone** unverified phases (line 182)
- **milestone** timestamp freshness (line 191)
- **scan** commit decision (line 387)

Standard options:
1. **Yes/Continue/Proceed** — continue with the action
2. **No/Cancel/Skip** — skip or cancel

AskUserQuestion mapping:
```
{
  question: "{Specific question about the action}",
  header: "Confirm?",
  options: [
    { label: "Yes", description: "{What happens if yes}" },
    { label: "No", description: "{What happens if no}" }
  ],
  multiSelect: false
}
```

### Pattern 3: Multi-option decision (4+ choices)
Used in:
- **build** failure handling (4 options: retry/skip/rollback/abort)
- **review** escalation (5 options: accept-gaps/re-plan/debug/override/retry)
- **review** gaps found (4 options: yes/override/manual/skip)
- **milestone** gap priority (4 options: must-fix/must+should/everything/pick)

These need carefully crafted option labels and descriptions. Example for build failures:
```
{
  question: "Plan {id} failed. How should we proceed?",
  header: "Failed",
  options: [
    { label: "Retry", description: "Re-run this plan's executor" },
    { label: "Skip", description: "Mark as skipped, continue to next wave" },
    { label: "Rollback", description: "Undo commits, revert to last good state" },
    { label: "Abort", description: "Stop the entire build" }
  ],
  multiSelect: false
}
```

### Pattern 4: Stale/outdated warnings with continue option
Used in:
- **build** plan staleness (line 73)
- **milestone** timestamp freshness (line 191)

Standard options:
1. **Re-plan/Refresh** — update the stale artifact
2. **Continue anyway** — proceed despite staleness

AskUserQuestion mapping:
```
{
  question: "{Artifact} is stale. Continue or refresh?",
  header: "Stale",
  options: [
    { label: "Refresh", description: "Update before proceeding (recommended)" },
    { label: "Continue anyway", description: "Proceed with current version" }
  ],
  multiSelect: false
}
```

### Pattern 5: Already using AskUserQuestion
These skills already use AskUserQuestion and don't need updates:
- **import** blocker resolution (line 191)
- **import** warning acknowledgment (line 192)
- **milestone** new milestone questions (lines 74-92)
- **milestone** version collision (line 489)
- **scan** existing analysis refresh (line 38)

## Recommendations

### Conversion Strategy

**Phase 1: Core gate checks (highest impact)**
Convert the primary approval gates that control workflow progression:
1. **plan** Step 8 user approval (lines 313-334) → gates.confirm_plan
2. **build** Step 1 execute confirmation (line 64) → gates.confirm_execute
3. **review** Step 6 transition confirmation (line 227) → gates.confirm_transition

**Phase 2: Error/edge case handlers**
Convert failure and edge case approval points:
4. **build** failure handling (lines 391-406) → 4-option menu
5. **review** escalation after 3 attempts (lines 107-125) → 5-option menu
6. **review** gaps found (lines 308-333) → 4-option menu

**Phase 3: Simple confirmations**
Convert yes/no confirmations:
7. **plan** re-planning confirmation (line 80)
8. **plan** seed selection (line 209)
9. **build** all plans completed (line 133)
10. **build** plan staleness (line 73)
11. **build** phase branch merge (line 652)
12. **import** replace plans (line 50)
13. **import** checker loop resolution (line 310)
14. **milestone** unverified phases (line 182)
15. **milestone** timestamp freshness (line 191)
16. **scan** commit decision (line 387)

**Phase 4: Multi-step flows**
Convert multi-option menus:
17. **milestone** gap priority selection (lines 401-410)
18. **review** gap-closure plan approval (lines 297-302)

### Special Cases to Handle

**1. Assumption surfacing in plan skill (lines 128-153)**
- Challenge: 4+ assumptions per phase, each with yes/no/adjust
- Solution: Either (a) use 4 separate AskUserQuestion calls OR (b) keep as inline conversation
- Recommendation: Keep as inline conversation — AskUserQuestion is too rigid for this iterative refinement

**2. UAT item verification in review skill (lines 175-188)**
- Challenge: 10+ items in a loop, each needs pass/fail/skip
- Solution: Either (a) batch into groups of 4 with multiSelect OR (b) keep as inline conversation
- Recommendation: Keep as inline conversation — AskUserQuestion overhead is too heavy for rapid iteration

**3. Override gap selection in review skill (lines 336-344)**
- Challenge: "present each gap and ask which ones to accept"
- Solution: Use AskUserQuestion with `multiSelect: true` for the full gap list
- Recommendation: Convert — this is exactly what multiSelect was designed for

**4. Changes request discussion (plan line 337, review line 301)**
- Challenge: After user says "request changes", enter freeform discussion
- Solution: DO NOT use AskUserQuestion for this — it's a conversation, not a menu
- Recommendation: Keep as freeform text discussion

### Template Creation

Create shared AskUserQuestion templates in `skills/shared/gate-prompts.md`:

```markdown
# Shared Gate Check Prompts

## approve-revise-abort (3-option)
{
  question: "Approve these {noun}?",
  header: "Approve?",
  options: [
    { label: "Approve", description: "Proceed with {action}" },
    { label: "Request changes", description: "Discuss adjustments first" },
    { label: "Abort", description: "Cancel this operation" }
  ],
  multiSelect: false
}

## yes-no (simple confirmation)
{
  question: "{Specific question}",
  header: "Confirm?",
  options: [
    { label: "Yes", description: "{yes outcome}" },
    { label: "No", description: "{no outcome}" }
  ],
  multiSelect: false
}

## stale-continue (2-option refresh)
{
  question: "{Artifact} is outdated. Refresh or continue?",
  header: "Outdated",
  options: [
    { label: "Refresh", description: "Update before proceeding (recommended)" },
    { label: "Continue anyway", description: "Proceed with current version" }
  ],
  multiSelect: false
}
```

### Implementation Plan Structure

Split into 2 plans:

**Plan 15-01: Core gate replacements (Wave 1)**
- Convert plan/build/review primary gates (items 1-3 above)
- Convert simple yes/no confirmations (items 7-16 above)
- Create shared template file
- Max 3 tasks: (1) template file + plan skill, (2) build skill, (3) review/import/milestone/scan skills

**Plan 15-02: Complex multi-option handlers (Wave 2)**
- Convert failure/error handlers (items 4-6 above)
- Convert multi-step flows (items 17-18 above)
- Handle special case: override gap selection with multiSelect
- Max 3 tasks: (1) build failures, (2) review escalation + gaps, (3) milestone gap priority

### Files Modified

- `plugins/dev/skills/shared/gate-prompts.md` (new file)
- `plugins/dev/skills/plan/SKILL.md` (4 replacements)
- `plugins/dev/skills/build/SKILL.md` (5 replacements)
- `plugins/dev/skills/review/SKILL.md` (5 replacements)
- `plugins/dev/skills/import/SKILL.md` (2 replacements)
- `plugins/dev/skills/milestone/SKILL.md` (3 replacements)
- `plugins/dev/skills/scan/SKILL.md` (1 replacement)

Total: 1 new file + 6 modified files, 20 total gate checks converted
