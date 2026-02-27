---
name: health
description: "Check planning directory integrity. Find and fix corrupted state."
---

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► HEALTH CHECK                               ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

# /pbr:health — Planning Directory Diagnostics

You are running the **health** skill. Your job is to validate the integrity of the `.planning/` directory, report problems, and suggest targeted fixes.

This skill runs **inline**. It is read-only by default, but offers an optional **auto-fix** flow for common corruption patterns (see the Auto-Fix section below).

## Argument Parsing

Check if the user passed `--repair`:
- `--repair`: Skip the AskUserQuestion prompt in the Auto-Fix section and automatically apply ALL fixes (equivalent to selecting "Fix all"). Still create backups before any destructive operations.
- No flag: Use the interactive AskUserQuestion flow as described below (default behavior).

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

### Check 10: Orphaned Crash Recovery & Lock Files

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

Also check for `.planning/.active-skill`:

- If the file does not exist: no action needed (PASS for this sub-check)
- If the file exists, check its age by comparing the file modification time to the current time:
  - If older than 1 hour: WARN with fix suggestion: "Stale .active-skill lock file detected (set {age} ago). No PBR skill appears to be running. Safe to delete with `rm .planning/.active-skill`."
  - If younger than 1 hour: INFO: "Active skill lock exists ({content}). A PBR skill may be running."

---

## Auto-Fix for Common Corruption Patterns

After running all 10 checks and collecting results, if any of the following auto-fixable issues were found, offer to fix them.

### Auto-Fixable Patterns

| Pattern | Detection | Fix Action |
|---------|-----------|------------|
| Missing STATE.md frontmatter | Check 5 finds STATE.md without `---` block | Regenerate frontmatter from ROADMAP.md phase data (current_phase, total_phases, status) |
| STATE.md phase_slug mismatch | Check 5/7 finds phase_slug doesn't match current phase directory name | Correct phase_slug to match the actual directory name in `.planning/phases/` |
| Missing config.json | Check 1/2 finds no `.planning/config.json` | Create with default config template (same as `/pbr:setup` defaults) |
| Orphaned .active-skill file | Check 10 or general scan finds `.planning/.active-skill` older than 1 hour | Delete the stale `.active-skill` file |
| Empty phases directory | Check 3 finds `.planning/phases/` missing | Create the directory: `mkdir -p .planning/phases` |
| STATE.md over 150 lines | Check 5 finds STATE.md exceeds 150 lines | Compact the `## Accumulated Context` section, keeping only the last 3 entries |

### Auto-Fix Flow

After displaying health check results, if any auto-fixable issues were detected:

**CRITICAL — Before ANY auto-fix that modifies or regenerates STATE.md (frontmatter regeneration, phase_slug correction, or line compaction), you MUST create a timestamped backup first. DO NOT SKIP THIS STEP.**

```
mkdir -p .planning/backups
cp .planning/STATE.md .planning/backups/STATE-$(date +%Y%m%dT%H%M%S).md
```

This ensures the user can recover the original STATE.md if the fix produces incorrect results.

1. Count the auto-fixable issues.

   **If `--repair` flag was passed**: Skip the question and go directly to "Fix all" (step 2). Display: "Auto-repair mode: applying {N} fixes..."

   **Otherwise**: Present the choice:

   Use AskUserQuestion:
     question: "Found {N} auto-fixable issues. How should we handle them?"
     header: "Fix?"
     options:
       - label: "Fix all"       description: "Apply all {N} fixes automatically"
       - label: "Review each"   description: "Show each fix and confirm individually"
       - label: "Skip"          description: "Do nothing — just report"

2. If "Fix all" (or `--repair`): Apply all fixes in order, then display a summary:
   ```
   Auto-fix results:
   - Fixed: {description of fix 1}
   - Fixed: {description of fix 2}
   ...
   ```

3. If "Review each": For each fixable issue, display:
   ```
   Issue: {description}
   Fix: {what will be done}
   ```
   Then ask via AskUserQuestion (yes/no): "Apply this fix?"
   - If yes: apply and display `- Fixed: {description}`
   - If no: skip and display `- Skipped: {description}`

4. If "Skip": Do nothing, continue to the rest of the output.

---

## Bonus: Recent Decisions

After all checks, look for `.planning/logs/decisions.jsonl`. If it exists, display the last 5 entries as `- {date}: {summary} (phase {N})`. If it does not exist, skip silently.

---

## Completion

After all checks complete, display the branded result:

**If all checks passed (0 failures):**
```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► HEALTH CHECK PASSED ✓                      ║
╚══════════════════════════════════════════════════════════════╝

{N} checks passed, {M} warnings



╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**Continue your workflow** — planning directory is healthy

`/pbr:status`

<sub>`/clear` first → fresh context window</sub>



**Also available:**
- `/pbr:continue` — execute next logical step
- `/pbr:config` — adjust settings


```

**If failures found:**
```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► HEALTH CHECK FAILED ⚠                      ║
╚══════════════════════════════════════════════════════════════╝

{N} checks passed, {F} failures, {M} warnings



╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**Fix the failures** listed above, then re-run

`/pbr:health`


```

---

## Anti-Patterns

1. **DO NOT** modify files without user consent — auto-fix requires explicit user approval via AskUserQuestion
2. **DO NOT** auto-repair anything silently — always present fixes and let the user decide
3. **DO NOT** skip checks that depend on missing files — report the dependency failure and continue
4. **DO NOT** treat warnings as failures in the summary count — only count FAIL items
5. **DO NOT** read full plan/summary contents — frontmatter and existence checks are sufficient
6. **DO NOT** fail silently — every check must produce an explicit PASS, WARN, or FAIL
7. **DO NOT** suggest running destructive commands — fixes should be safe, targeted edits
