---
name: audit-fix
description: "Run audit, prioritize findings, auto-fix via quick tasks, test, and commit."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task, AskUserQuestion
argument-hint: "[--max N] [--severity high|medium|all] [--dry-run] [--from DATE] [--to DATE] [--today]"
---

**STOP -- DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes tokens. Begin executing Step 0 immediately.**

# /pbr:audit-fix -- Autonomous Audit-to-Fix Pipeline

You are running the **audit-fix** skill. Your job is to run a session audit, parse findings, classify which are auto-fixable, and spawn executor agents to fix them one-by-one with atomic commits. The pipeline stops on the first test failure.

This skill **chains audit -> prioritize -> fix -> test -> commit** in a single command.

---

## Step 0 -- Immediate Output

**Before ANY tool calls**, display this banner:

```
+--------------------------------------------------------------+
|  PLAN-BUILD-RUN > AUDIT-FIX                                  |
+--------------------------------------------------------------+
```

Then proceed to Step 1.

## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.
Reference: `skills/shared/agent-type-resolution.md` for agent type fallback when spawning Task() subagents.

Additionally for this skill:
- **Delegate ALL code changes** to executor subagents -- do NOT make fixes yourself
- Main context handles: argument parsing, audit orchestration, finding classification, executor dispatch, reporting
- Read only the audit report findings section, not full session details
- Target: main context stays under 25% utilization

---

## Step 1 -- Parse Arguments

Parse `$ARGUMENTS` for:

| Argument | Default | Description |
|----------|---------|-------------|
| `--max N` | 5 | Maximum number of findings to fix |
| `--severity LEVEL` | `medium` | Minimum severity threshold: `high` = Critical+High only, `medium` = +Medium, `all` = +Low |
| `--dry-run` | false | List fixable findings without executing fixes |
| `--from DATE` | Start of today | Passed through to audit agent |
| `--to DATE` | Now | Passed through to audit agent |
| `--today` | true (default) | Shorthand for today's audit window |

If no date arguments provided, default to `--today`.

Display:

```
Max fixes: {N}
Severity threshold: {level}
Mode: {dry-run or execute}
```

---

## Step 2 -- Run Audit

Spawn a `Task(subagent_type: "pbr:audit")` to collect findings:

```
Task({
  subagent_type: "pbr:audit",
  prompt: "Run a full audit for this project.
    Date range: {from} to {to} (or --today)
    Mode: full

    Write the audit report to .planning/audits/ as usual.
    CRITICAL: Include a ## Consolidated Findings section with findings
    categorized by severity (Critical, High, Medium, Low).
    Each finding must have an ID (e.g., H1, M3), description, and evidence.

    Output: ## AUDIT COMPLETE when done."
})
```

After the audit agent completes, check for `## AUDIT COMPLETE`. If absent, warn and attempt to read any partial report.

Read the latest audit report from `.planning/audits/` (glob for the most recent `*-session-audit.md` or `*-consolidated-audit.md`).

---

## Step 3 -- Parse Findings

Read the audit report's `## Consolidated Findings` section. Extract findings by severity:

- **Critical**: Workflow bypassed, hooks not firing, security issues
- **High**: State files not consulted, missing artifacts, broken paths
- **Medium**: Suboptimal flow, missing feedback, config drift
- **Low**: Minor ceremony issues, informational

Build a list of findings at or above the severity threshold (`--severity` flag).

---

## Step 4 -- Classify Fixability

For each finding at or above the severity threshold, classify as:

- **auto-fixable**: Clear mechanical remediation exists. Examples:
  - Missing fields in frontmatter
  - Broken file paths or stale references
  - Lint errors or formatting issues
  - Config drift (value doesn't match expected)
  - Uncommitted planning doc changes
  - Missing command registrations
  - Incorrect counts in test assertions

- **manual-only**: Requires human judgment. Examples:
  - Architectural decisions needed
  - User input or design choices required
  - Ambiguous or context-dependent fixes
  - Multi-system coordination needed
  - Performance tuning with tradeoffs

Display a classification table:

```
Findings at severity >= {threshold}: {N}
Auto-fixable: {N}
Manual-only (skipped): {N}

Auto-fixable findings:
  {ID}: {description} [severity]
  ...

Manual-only findings (skipped):
  {ID}: {description} [severity] -- {reason}
  ...
```

If `--dry-run` flag is set: display the full classification table and STOP. Do not execute any fixes.

```
+--------------------------------------------------------------+
|  PLAN-BUILD-RUN > AUDIT-FIX DRY RUN COMPLETE                 |
+--------------------------------------------------------------+

{classification table above}

To execute fixes, run: /pbr:audit-fix --max {N}
```

---

## Step 5 -- Execute Fixes

**Scope guard (CRITICAL):**
- Only fix findings with clear, mechanical remediation
- NEVER attempt fixes requiring architectural decisions
- NEVER attempt fixes requiring user input or design choices
- STOP on first test failure

For each auto-fixable finding (up to `--max`), ordered by severity (Critical first, then High, Medium, Low):

a. Display: `[{i}/{total}] Fixing {ID}: {description}`

b. Spawn `Task(subagent_type: "pbr:executor")` with a prompt describing the fix:

```
Task({
  subagent_type: "pbr:executor",
  prompt: "You are executor. Fix this audit finding.

    <files_to_read>
    CRITICAL: Read these files BEFORE any other action:
    1. CLAUDE.md -- project instructions
    </files_to_read>

    Finding ID: {ID}
    Severity: {severity}
    Description: {description}
    Evidence: {evidence from audit report}

    Remediation:
    {specific steps to fix this finding}

    Instructions:
    1. Read the affected file(s)
    2. Make the minimal fix described above
    3. Run: npm test
    4. If tests pass, commit with: fix({scope}): {description} (audit finding {ID})
    5. If tests FAIL, do NOT commit. Report the failure.

    Output: ## EXECUTION COMPLETE when done, or ## EXECUTION FAILED if tests fail."
})
```

c. After each executor completes, check its output:
   - If `## EXECUTION COMPLETE`: record success, continue to next finding
   - If `## EXECUTION FAILED`: **STOP the pipeline immediately**

d. On test failure, display:

```
+--------------------------------------------------------------+
|  PIPELINE STOPPED -- TEST FAILURE                             |
+--------------------------------------------------------------+

Finding {ID}: {description}
Test failure details: {from executor output}

Fixed before failure: {N}/{total}
Remaining unfixed: {list}

To investigate: /pbr:debug
```

Do NOT continue to the next finding after a test failure.

---

## Step 6 -- Report

After all fixes complete (or pipeline stops), display the summary:

```
+--------------------------------------------------------------+
|  PLAN-BUILD-RUN > AUDIT-FIX COMPLETE                         |
+--------------------------------------------------------------+

Findings processed: {N}/{total auto-fixable}
Fixed: {N}
Skipped (manual): {N}
Test failures: {0 or 1}

Commits:
  {hash} -- {message}
  ...

Remaining findings (manual intervention needed):
  {ID}: {description}
  ...
```

If all auto-fixable findings were fixed successfully:

```
+--------------------------------------------------------------+
|  > NEXT UP                                                   |
+--------------------------------------------------------------+

Continue your workflow -- audit issues addressed.

/pbr:progress

`/clear` first -- fresh context window
```

If manual findings remain:

```
+--------------------------------------------------------------+
|  > NEXT UP                                                   |
+--------------------------------------------------------------+

Manual findings remain. Options:
- /pbr:quick "{finding description}" -- fix one manually
- /pbr:audit --today -- re-audit to verify fixes
- /pbr:progress -- check overall status

`/clear` first -- fresh context window
```

---

## Error Handling

Reference: `skills/shared/error-reporting.md` for branded error output patterns.

### Audit agent fails
```
+--------------------------------------------------------------+
|  ERROR                                                       |
+--------------------------------------------------------------+

Audit failed: {error details}
Try running /pbr:audit --today first to diagnose.
```

### No findings at threshold
```
+--------------------------------------------------------------+
|  PLAN-BUILD-RUN > AUDIT-FIX -- NO FINDINGS                   |
+--------------------------------------------------------------+

No findings at severity >= {threshold}.
Try: /pbr:audit-fix --severity all
```

### No auto-fixable findings
```
+--------------------------------------------------------------+
|  PLAN-BUILD-RUN > AUDIT-FIX -- NOTHING TO FIX                |
+--------------------------------------------------------------+

Found {N} findings but none are auto-fixable.
All require manual intervention:
  {ID}: {description} -- {reason}

Use /pbr:quick "{description}" to fix individually.
```

---

## Anti-Patterns

1. **DO NOT** make fixes yourself -- ALL code changes go through spawned `Task(subagent_type: "pbr:executor")` agents
2. **DO NOT** attempt fixes requiring architectural decisions -- classify as manual-only
3. **DO NOT** attempt fixes requiring user input or design choices -- classify as manual-only
4. **DO NOT** continue after a test failure -- STOP the pipeline immediately
5. **DO NOT** read full JSONL session logs in main context -- only read the audit report
6. **DO NOT** fix more findings than `--max` allows
7. **DO NOT** fix findings below the severity threshold
8. **DO NOT** skip the classification step -- always show fixable vs manual before executing
