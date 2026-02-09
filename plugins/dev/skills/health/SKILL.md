---
name: health
description: "Check planning directory integrity. Find and fix corrupted state."
allowed-tools: Read, Bash, Glob, Grep
---

# /dev:health — Planning Directory Diagnostics

You are running the **health** skill. Your job is to validate the integrity of the `.planning/` directory, report problems, and suggest targeted fixes. You never auto-repair anything.

This skill runs **inline** and is **read-only** — it never modifies any files.

---

## Core Principle

**Find what is broken and tell the user exactly how to fix it.** Each check produces a clear PASS or FAIL. Failures include the specific file, the problem, and a concrete fix suggestion. No vague warnings.

---

## Checks

Run all 9 checks in order. Collect results and present them together at the end.

### Check 1: Structure

Validate that the `.planning/` directory exists and contains the required scaffolding files.

**Required files:**
- `.planning/STATE.md`
- `.planning/config.json`
- `.planning/ROADMAP.md`

**Steps:**
1. Confirm `.planning/` directory exists
   - If missing: FAIL the entire health check immediately. Report: "No `.planning/` directory found. Run `/dev:begin` to initialize."
   - Stop all further checks.
2. Check for each required file
3. Note any missing files

**Result:**
- PASS: All three required files exist
- FAIL: One or more required files missing. List each missing file with:
  ```
  FAIL  Missing: .planning/{filename}
        Fix: Run `/dev:begin` to re-initialize, or create the file manually.
  ```

### Check 2: Config Validity

Validate that `config.json` is well-formed JSON with the required fields.

**Steps:**
1. Read `.planning/config.json`
2. Attempt to parse as JSON
3. Check for required fields: `projectName`, `version`
4. Check for recommended fields: `phases`, `currentPhase`

**Result:**
- PASS: Valid JSON with all required fields present
- FAIL (parse error): "config.json is not valid JSON. Error: {parse error message}. Fix: Open the file and correct the syntax."
- FAIL (missing field): "config.json is missing required field `{field}`. Fix: Add the field to config.json."
- WARN (missing recommended): "config.json is missing recommended field `{field}`. This may cause issues with some skills."

### Check 3: Phase Consistency

Validate that phase directories in `.planning/phases/` correspond to the phases defined in `ROADMAP.md`.

**Steps:**
1. Read `ROADMAP.md` and extract all phase identifiers (phase numbers and names)
2. List all directories in `.planning/phases/`
3. Compare the two lists

**Result:**
- PASS: Every directory matches a ROADMAP.md phase, and no ROADMAP.md phase that has been started is missing its directory
- FAIL (orphan directory): "Directory `.planning/phases/{dir}` exists but is not listed in ROADMAP.md. Fix: Add this phase to ROADMAP.md or remove the directory."
- FAIL (missing directory for active phase): "ROADMAP.md lists phase {N} as in-progress but `.planning/phases/{dir}` does not exist. Fix: Create the directory or update ROADMAP.md."
- Note: Future phases in ROADMAP.md without directories are normal (not a failure).

### Check 4: Plan/Summary Pairing

Validate that every PLAN file has a corresponding SUMMARY file (or is expected to get one), and that no orphaned files exist.

**Steps:**
1. Glob for all `PLAN*.md` and `SUMMARY*.md` files in `.planning/phases/`
2. For each PLAN file, check if a corresponding SUMMARY file exists (matching by plan number/name)
3. For each SUMMARY file, check if a corresponding PLAN file exists
4. A PLAN without a SUMMARY is normal if the plan has not been executed yet — only flag if the phase is marked as complete in ROADMAP.md or STATE.md

**Result:**
- PASS: All pairings are valid; no orphaned summaries
- FAIL (orphaned summary): "SUMMARY file `{path}` has no matching PLAN file. Fix: This summary may reference a deleted or renamed plan. Verify and remove or re-pair."
- WARN (missing summary in complete phase): "Phase {N} is marked complete but `{plan}` has no SUMMARY. Fix: Either execute the plan with `/dev:build {N}` or mark the phase as incomplete."

### Check 5: STATE.md Accuracy

Validate that the current position described in `STATE.md` matches the actual directory state.

**Steps:**
1. Read `STATE.md` and extract:
   - Current phase number
   - Current plan identifier
   - Progress percentage (if stated)
2. Verify against the file system:
   - Does the referenced phase directory exist?
   - Does the referenced plan file exist?
   - Is the progress percentage consistent with the actual plan/summary counts?

**Result:**
- PASS: STATE.md references match the file system
- FAIL (stale phase): "STATE.md references phase {N} but this phase directory does not exist. Fix: Update STATE.md to reflect the actual current phase."
- FAIL (stale plan): "STATE.md references plan `{name}` but this file does not exist in phase {N}. Fix: Update STATE.md to the correct current plan."
- FAIL (wrong progress): "STATE.md says progress is {X}% but actual progress is {Y}% ({completed}/{total} plans complete). Fix: Update the progress in STATE.md."
- WARN (no position): "STATE.md does not specify a current phase or plan. This is fine for a new project but may indicate lost state."

### Check 6: Frontmatter Validity

Validate that PLAN and SUMMARY files have valid YAML frontmatter.

**Steps:**
1. Glob for all `PLAN*.md` and `SUMMARY*.md` files in `.planning/phases/`
2. For each file, check:
   - File starts with `---` on the first line
   - There is a closing `---` delimiter
   - The content between delimiters is valid YAML
   - PLAN files have required frontmatter fields: `title`, `status`
   - SUMMARY files have required frontmatter fields: `title`, `status`
3. Collect all violations

**Result:**
- PASS: All files have valid frontmatter with required fields
- FAIL (no frontmatter): "`{path}` has no YAML frontmatter. Fix: Add frontmatter block starting with `---` at the top of the file."
- FAIL (malformed): "`{path}` has malformed frontmatter: {error}. Fix: Correct the YAML syntax between the `---` delimiters."
- FAIL (missing field): "`{path}` frontmatter is missing required field `{field}`. Fix: Add `{field}: {suggested value}` to the frontmatter."

### Check 7: ROADMAP/STATE Sync

Validate that ROADMAP.md phase statuses are consistent with STATE.md's current position.

**Steps:**
1. Read ROADMAP.md Progress table and extract each phase's status
2. Read STATE.md and extract the current phase number and status
3. Compare: if ROADMAP says phase N is "verified" but STATE says the current phase is N with status "building", flag a mismatch
4. Check that no phase after the current phase is marked as "built" or "verified" in ROADMAP (would indicate out-of-order completion)

**Result:**
- PASS: ROADMAP and STATE are consistent
- FAIL (mismatch): "ROADMAP.md shows phase {N} as `{status}` but STATE.md says `{status}`. Fix: Update STATE.md to match ROADMAP.md, or vice versa."
- WARN (drift): "STATE.md current phase is {N} but ROADMAP.md shows later phases as complete."

### Check 8: Hook Execution Log

Check for hook execution audit trail.

**Steps:**
1. Check if `.planning/.hook-log` exists
2. If exists: scan the last 20 entries for any with `result: "error"` or `result: "unlink-failed"`
3. Count recent errors (last 24 hours if timestamps are available)

**Result:**
- PASS: Hook log exists with no recent errors
- WARN (errors found): "Hook log shows {count} recent errors. Most recent: {error description}. This may indicate hooks are not firing correctly."
- INFO (no log): "No hook execution log found at `.planning/.hook-log`. Hook failures would be invisible. This is normal if no hooks have fired yet."

### Check 9: Config Completeness

Validate that config.json has all fields that skills reference.

**Steps:**
1. Read `.planning/config.json`
2. Check for these commonly-referenced fields:
   - `features.auto_continue` (used by build skill and auto-continue.js hook)
   - `features.team_discussions` (used by config skill)
   - `features.goal_verification` (used by build and review skills)
   - `features.integration_verification` (used by review skill)
   - `git.mode` (used by config skill)
3. Flag any missing fields

**Result:**
- PASS: All expected config fields present
- WARN (missing fields): "config.json is missing field `{field}` (used by {skill}). Default behavior will apply, but explicit configuration is recommended. Fix: Run `/dev:config` to set all options."

---

## Bonus: Recent Decisions

After all 6 checks, look for `.planning/logs/decisions.jsonl`.

**If the file exists:**
1. Read the last 5 entries (most recent decisions)
2. Display them in a compact list:
   ```
   Recent Decisions:
   - {date}: {summary} (phase {N})
   - {date}: {summary} (phase {N})
   - ...
   ```

**If the file does not exist:**
- Skip silently. Do not warn or suggest creating it.

---

## Output Format

Present results as a single report after all checks complete:

```
Planning Health Check
=====================

[PASS]  Structure         .planning/ exists, all required files present
[FAIL]  Config            config.json missing required field `projectName`
[PASS]  Phase consistency Directories match ROADMAP.md phases
[PASS]  Plan/Summary      All pairings valid
[FAIL]  STATE.md accuracy Phase reference is stale (points to phase 3, but phase 3 has no directory)
[PASS]  Frontmatter       All PLAN/SUMMARY files have valid frontmatter
[PASS]  ROADMAP/STATE sync  ROADMAP and STATE phase statuses are consistent
[PASS]  Hook log            No recent hook errors
[PASS]  Config completeness All expected fields present

Issues Found: 2
---------------

1. config.json missing required field `projectName`
   File: .planning/config.json
   Fix:  Add `"projectName": "your-project-name"` to config.json

2. STATE.md references phase 3 but no directory exists
   File: .planning/STATE.md
   Fix:  Update STATE.md to reflect the actual current phase, or create .planning/phases/03-phase-name/

{If decisions.jsonl exists:}
Recent Decisions:
- 2025-01-15: Chose PostgreSQL over SQLite for persistence (phase 2)
- 2025-01-14: Deferred auth to phase 4 (phase 1)

Result: 2 issues found. Review and apply fixes manually.
```

When all checks pass:
```
Planning Health Check
=====================

[PASS]  Structure         .planning/ exists, all required files present
[PASS]  Config            Valid JSON with all required fields
[PASS]  Phase consistency Directories match ROADMAP.md phases
[PASS]  Plan/Summary      All pairings valid
[PASS]  STATE.md accuracy Current position matches file system
[PASS]  Frontmatter       All PLAN/SUMMARY files have valid frontmatter
[PASS]  ROADMAP/STATE sync  ROADMAP and STATE phase statuses are consistent
[PASS]  Hook log            No recent hook errors
[PASS]  Config completeness All expected fields present

{If decisions.jsonl exists:}
Recent Decisions:
- ...

Result: All checks passed. Planning directory is healthy.
```

---

## Anti-Patterns

1. **DO NOT** modify any files — this is strictly read-only
2. **DO NOT** auto-repair anything — present fixes and let the user decide
3. **DO NOT** skip checks that depend on missing files — report the dependency failure and continue
4. **DO NOT** treat warnings as failures in the summary count — only count FAIL items
5. **DO NOT** read full plan/summary contents — frontmatter and existence checks are sufficient
6. **DO NOT** fail silently — every check must produce an explicit PASS, WARN, or FAIL
7. **DO NOT** suggest running destructive commands — fixes should be safe, targeted edits
