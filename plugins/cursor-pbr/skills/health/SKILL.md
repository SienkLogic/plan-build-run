---
name: health
description: "Check planning directory integrity. Find and fix corrupted state."
---

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PLAN-BUILD-RUN ► HEALTH CHECK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Then proceed to Step 1.

# /pbr:health — Planning Directory Diagnostics

You are running the **health** skill. Your job is to validate the integrity of the `.planning/` directory, report problems, and suggest targeted fixes. You never auto-repair anything.

This skill runs **inline** and is **read-only** — it never modifies any files.

---

## How Checks Work

Each check follows the common pattern. Read `skills/health/templates/check-pattern.md.tmpl` for the shared execution flow: target files, validate against rules, classify as PASS/FAIL/WARN/INFO, and record the result with a fix suggestion for any failures.

Read `skills/health/templates/output-format.md.tmpl` for the output format: summary table, status indicators, issues list, optional recent decisions, and final result line.

---

## Checks

Run all 10 checks in order. Collect results and present them together at the end.

### Check 1: Structure

Validate `.planning/` exists with required scaffolding: `STATE.md`, `config.json`, `ROADMAP.md`.

- If `.planning/` is missing: FAIL the entire health check immediately. Display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

No .planning/ directory found.

**To fix:** Run `/pbr:begin` to initialize.
```
Stop all further checks.
- PASS: All three required files exist
- FAIL: List each missing file — "Run `/pbr:begin` to re-initialize, or create the file manually."

### Check 2: Config Validity

Parse `.planning/config.json` as JSON. Check required fields: `version`, `depth`. Check recommended fields: `features`, `models`.

- PASS: Valid JSON with all required fields
- FAIL (parse error): Report the parse error message — "Open the file and correct the syntax."
- FAIL (missing required field): Report which field — "Add the field to config.json."
- WARN (missing recommended field): Report which field — "This may cause issues with some skills."

### Check 3: Phase Consistency

Compare directories in `.planning/phases/` against phases defined in `ROADMAP.md`.

- PASS: Every directory matches a ROADMAP.md phase; no started phases are missing directories
- FAIL (orphan directory): Directory exists but not in ROADMAP.md — "Add to ROADMAP.md or remove the directory."
- FAIL (missing directory): ROADMAP.md lists phase as in-progress but directory missing — "Create the directory or update ROADMAP.md."
- Note: Future phases without directories are normal (not a failure).

### Check 4: Plan/Summary Pairing

Glob all `PLAN*.md` and `SUMMARY*.md` in `.planning/phases/`. Match by plan number. A PLAN without SUMMARY is normal unless the phase is marked complete.

- PASS: All pairings valid, no orphaned summaries
- FAIL (orphaned summary): SUMMARY has no matching PLAN — "Verify and remove or re-pair."
- WARN (missing summary in complete phase): Phase marked complete but plan has no SUMMARY — "Execute with `/pbr:build` or mark phase incomplete."

### Check 5: STATE.md Accuracy

Extract current phase, plan identifier, and progress percentage from `STATE.md`. Verify each against the file system.

- PASS: All STATE.md references match the file system
- FAIL (stale phase): Referenced phase directory does not exist — "Update STATE.md to reflect the actual current phase."
- FAIL (stale plan): Referenced plan file does not exist — "Update STATE.md to the correct current plan."
- FAIL (wrong progress): Stated progress does not match actual plan/summary counts — "Update the progress in STATE.md."
- WARN (no position): No current phase or plan specified — "Fine for new projects but may indicate lost state."

### Check 6: Frontmatter Validity

Glob all `PLAN*.md` and `SUMMARY*.md` in `.planning/phases/`. Each file must start with `---`, have a closing `---`, contain valid YAML, and include required fields: `title`, `status`.

- PASS: All files have valid frontmatter with required fields
- FAIL (no frontmatter): "Add frontmatter block starting with `---` at the top of the file."
- FAIL (malformed): Report the YAML error — "Correct the YAML syntax between the `---` delimiters."
- FAIL (missing field): Report which field — "Add `{field}: {suggested value}` to the frontmatter."

### Check 7: ROADMAP/STATE Sync

Compare ROADMAP.md phase statuses against STATE.md current position. Flag if ROADMAP says a phase is "verified" but STATE says it is "building", or if phases after current are marked complete.

- PASS: ROADMAP and STATE are consistent
- FAIL (mismatch): Report both statuses — "Update STATE.md to match ROADMAP.md, or vice versa."
- WARN (drift): Current phase in STATE.md is behind phases marked complete in ROADMAP.md.

### Check 8: Hook Execution Log

Check if `.planning/logs/hooks.jsonl` exists. Also check the legacy path `.planning/.hook-log` (the logger migrates this automatically, but it may still exist if hooks haven't fired since the migration was added). Use whichever file exists (prefer `hooks.jsonl`). If found, scan last 20 entries for `decision: "error"` or `decision: "unlink-failed"`.

- PASS: Log exists with no recent errors
- WARN (errors found): Report error count and most recent error description — "Hooks may not be firing correctly."
- INFO (no log): "No hook log found. Normal if no hooks have fired yet."

### Check 9: Config Completeness

Read `.planning/config.json` and check for fields referenced by skills:
- `features.auto_continue` (build skill, auto-continue.js hook)
- `features.team_discussions` (config skill)
- `features.goal_verification` (build, review skills)
- `features.integration_verification` (review skill)
- `git.mode` (config skill)
- `planning.commit_docs` (import, discuss, quick skills) — must be a boolean; validate that the value is strictly `true` or `false`, not a string or number

- PASS: All expected fields present with correct types
- WARN (missing fields): Report each missing field and which skill uses it — "Run `/pbr:config` to set all options."

### Check 10: Orphaned Crash Recovery Files

The executor creates `.PROGRESS-{plan_id}` files as crash recovery breadcrumbs during builds and deletes them after `SUMMARY.md` is written. Similarly, `.checkpoint-manifest.json` files track checkpoint state during execution. If the executor crashes mid-build, these files remain and could confuse future runs.

Glob for `.planning/phases/**/.PROGRESS-*` and `.planning/phases/**/.checkpoint-manifest.json`.

- PASS: No orphaned files found
- WARN (orphaned progress files): List each file with its parent phase directory:
  ```
  Orphaned progress files detected:
  - .planning/phases/02-auth/.PROGRESS-02-01 (executor may have crashed)
  ```
  Fix suggestion: "These are crash recovery breadcrumbs from interrupted builds. Safe to delete if no `/pbr:build` is currently running. Remove with `rm <path>`."
- WARN (orphaned checkpoint manifests): List each file:
  ```
  Orphaned checkpoint manifests detected:
  - .planning/phases/02-auth/.checkpoint-manifest.json (stale build checkpoint)
  ```
  Fix suggestion: "Checkpoint manifests are leftover from interrupted builds. Safe to delete if no `/pbr:build` is currently running. Remove with `rm <path>`."

---

## Bonus: Recent Decisions

After all checks, look for `.planning/logs/decisions.jsonl`. If it exists, display the last 5 entries as `- {date}: {summary} (phase {N})`. If it does not exist, skip silently.

---

## Completion

After all checks complete, display the branded result:

**If all checks passed (0 failures):**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PLAN-BUILD-RUN ► HEALTH CHECK PASSED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N} checks passed, {M} warnings

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Continue your workflow** — planning directory is healthy

`/pbr:status`

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- `/pbr:continue` — execute next logical step
- `/pbr:config` — adjust settings

───────────────────────────────────────────────────────────────
```

**If failures found:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PLAN-BUILD-RUN ► HEALTH CHECK FAILED ⚠
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{N} checks passed, {F} failures, {M} warnings

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Fix the failures** listed above, then re-run

`/pbr:health`

───────────────────────────────────────────────────────────────
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
