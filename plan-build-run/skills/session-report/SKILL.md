---
name: session-report
description: "Generate post-session summary with work performed, outcomes, and resource usage."
allowed-tools: Read, Bash, Glob, Grep, AskUserQuestion
argument-hint: "[--since <time>] [--save]"
---

**STOP -- DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Begin executing Step 1 immediately.**

# /pbr:session-report -- Post-Session Summary

**References:** `@references/ui-brand.md`

You are the orchestrator for `/pbr:session-report`. This read-only skill generates a summary of work performed during the current session. By default it displays the report without writing files.

## Step 0 -- Immediate Output

**Before ANY tool calls**, display this banner:

```
+--------------------------------------------------------------+
|  PLAN-BUILD-RUN > SESSION REPORT                             |
+--------------------------------------------------------------+
```

Then proceed to Step 1.

## Step 1: Parse Arguments

1. Parse `$ARGUMENTS` for optional flags:
   - `--since <time>` -- git log time filter (default: "8 hours ago")
   - `--save` -- write report to `.planning/reports/session-{date}.md`
2. Compute the time window for analysis

## Step 2: Gather Session Data

1. Read `.planning/STATE.md` for current position (phase, plan, status)
2. Count commits in time window:
   ```bash
   git log --oneline --since="{since}" --format="%H %s"
   ```
3. Get file change stats:
   ```bash
   git diff --stat HEAD~{commit_count}..HEAD 2>/dev/null || git diff --stat --since="{since}"
   ```
4. Read SUMMARY-*.md files modified during this session:
   ```bash
   git log --since="{since}" --diff-filter=AM --name-only --format="" -- ".planning/phases/*/SUMMARY-*.md"
   ```
   Extract status and key outcomes from each.
5. Check for VERIFICATION.md updates:
   ```bash
   git log --since="{since}" --diff-filter=AM --name-only --format="" -- ".planning/phases/*/VERIFICATION.md"
   ```
6. Check test results if a test command was run recently:
   ```bash
   git log --since="{since}" --oneline --grep="test"
   ```

## Step 3: Compute Metrics

1. **Commit breakdown**: count commits by type (feat, fix, refactor, test, docs, chore)
2. **File breakdown**: count files by directory/category
3. **Phase progress**: compare STATE.md current plan vs total plans
4. **Velocity**: commits per hour estimate

## Step 4: Generate Report

Display the report:

```
SESSION REPORT
==============

Session Window:  {since} to now ({duration} estimate)
Current Phase:   {phase_number} - {phase_name}
Current Status:  {status}

WORK PERFORMED
--------------
Commits:         {total_count}
  feat:          {feat_count}
  fix:           {fix_count}
  refactor:      {refactor_count}
  test:          {test_count}
  other:         {other_count}

Files Changed:   {file_count}
  Insertions:    +{insertions}
  Deletions:     -{deletions}

PLAN PROGRESS
-------------
{For each SUMMARY written during session:}
  Plan {NN}: {status} - {one-liner}

VERIFICATION
------------
{If VERIFICATION.md was updated:}
  Score:         {score}
  Status:        {status}
{Else:}
  No verification updates this session.

NEXT STEPS
----------
{Based on STATE.md status, suggest the logical next command:}
  - If status is "planned": /pbr:build {N}
  - If status is "executing": /pbr:build {N} (continue)
  - If status is "verifying": /pbr:review {N}
  - If status is "complete": /pbr:milestone or /pbr:plan {N+1}
```

## Step 5: Optional Save

If `--save` flag was provided:
1. Create directory: `.planning/reports/` (if not exists)
2. Write report to `.planning/reports/session-{YYYY-MM-DD-HHmm}.md`
3. Display: "Report saved to {path}"

If `--save` was NOT provided:
- Display only. Do not write any files.

## Error Handling

- No commits in time window: "No commits found since {since}. Try --since '24 hours ago'."
- No STATE.md: "No .planning directory found. Run /pbr:new-project first."
- Git not available: stop with error
