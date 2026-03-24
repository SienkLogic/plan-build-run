---
component: audit
version: 1
last_calibrated: 2026-03-24
---

# Audit Few-Shot Examples

## Positive Examples

### Example 1: Executor task skipping detected with specific evidence

**Input:** Session JSONL for a `/pbr:build` invocation. PLAN.md has 7 tasks (T1-T7). SUMMARY.md reports 4 tasks complete.

**Output:**

> **Code: WC-03 (Plan Execution Completeness)**
> Status: fail
> Evidence:
> - PLAN.md contains tasks T1 through T7 (7 total)
> - SUMMARY.md frontmatter lists commits for T1, T2, T3, T5 only (4 of 7)
> - Tasks T4, T6, T7 have no corresponding commit SHA and no entry in SUMMARY.md task results table
> - T4 action was "add error handling to hook-logger.js" -- no changes to hook-logger.js in `git log --oneline`
> - No deviation entry explains the skipped tasks
> Recommendation: Re-run executor for tasks T4, T6, T7 or document deviations explaining why they were skipped.

**Why this is good:** The auditor cross-referenced the plan task list against the SUMMARY.md output, identified exactly which tasks were missing (T4, T6, T7), verified with git log that the expected file changes never happened, and noted the absence of deviation documentation. Every claim has a specific source.

### Example 2: Stale active-skill file traced as root cause of hook failures

**Input:** Session JSONL shows 4 consecutive PreToolUse blocks with reason "Workflow violation: /pbr:plan should only write to .planning/ files."

**Output:**

> **Code: EF-03 (Active-Skill Conflicts)**
> Status: fail
> Evidence:
> - JSONL lines 412, 418, 425, 431: Four consecutive PreToolUse blocks on Write tool
> - Block reason references `/pbr:plan` as active skill, but session shows `/pbr:build` was invoked at line 380
> - `.planning/.active-skill` contained "plan" (stale from prior session that crashed at 17:42:03Z without cleanup)
> - No `session-cleanup.js` firing evidence between the prior session end and current session start
> Root cause: Prior session terminated without firing the Stop hook, leaving `.active-skill` set to "plan". Current `/pbr:build` session inherited the stale marker.
> Recommendation: Check that `session-cleanup.js` fires on all exit paths. Consider adding `.active-skill` staleness check to `progress-tracker.js` SessionStart.

**Why this is good:** The auditor traced a pattern of failures (4 blocks) back to a specific root cause (stale file from crashed session) with timestamps and JSONL line numbers. It identified the gap in the cleanup mechanism and suggested two specific preventive measures.

## Negative Examples

### Example 1: Vague quality assessment with no metrics or evidence

**Input:** Session JSONL with 200+ entries across a 45-minute session.

**Output:**

> **Session Quality: Good**
> The session ran smoothly with no major issues. Hooks appeared to fire correctly and the workflow was followed. No concerns identified.
> Dimensions checked: 88, passed: 88

**Why this is bad:** The auditor claimed 88/88 dimensions passed with zero evidence. No JSONL line references, no timestamps, no specific hook events cited. "Hooks appeared to fire correctly" is speculation -- the auditor should cite specific `hook_progress` entries. Reporting 88 passed dimensions with no findings is statistically implausible and suggests the auditor skipped the actual checks.

### Example 2: Every commit flagged as a concern despite correct format

**Input:** Session with 6 commits: `feat(hooks): add context tier tracking`, `fix(hooks): handle null config gracefully`, `test(tests): add context-bridge coverage`, `refactor(hooks): extract threshold logic`, `docs(refs): update hook ordering reference`, `chore(ci): bump Node matrix to 22`.

**Output:**

> **Code: WC-05 (Commit Format)**
> Status: warn
> Evidence:
> - 6 commits analyzed, all flagged for review
> - `feat(hooks): add context tier tracking` -- scope "hooks" may be too broad
> - `fix(hooks): handle null config gracefully` -- description could be more specific
> - `test(tests): add context-bridge coverage` -- redundant scope "tests" for test type
> - (continues for all 6)
> Recommendation: Tighten commit message specificity across all commits.

**Why this is bad:** All 6 commits follow the enforced format `{type}({scope}): {description}` perfectly. The auditor invented subjective concerns ("may be too broad", "could be more specific") that do not correspond to any documented rule violation. This is noise that drowns out real issues and wastes the user's attention on false positives.
