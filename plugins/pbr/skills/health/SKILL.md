---
name: health
description: "Check planning directory integrity. Find and fix corrupted state."
allowed-tools: Read, Write, Bash, Glob, Grep, AskUserQuestion
argument-hint: "[--repair]"
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes ~7,600 tokens. Begin executing Step 1 immediately.**

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

## References

- `references/questioning.md` — Questioning philosophy for diagnostic probing
- `references/ui-brand.md` — Status symbols, banners, checkpoint boxes

## Argument Parsing

Check if the user passed `--repair`:
- `--repair`: Skip the AskUserQuestion prompt in the Auto-Fix section and automatically apply ALL fixes (equivalent to selecting "Fix all"). Still create backups before any destructive operations.
- No flag: Use the interactive AskUserQuestion flow as described below (default behavior).

---

## How Checks Work

Health checks are now CLI-driven via `verify health`. The check-pattern template (`${CLAUDE_SKILL_DIR}/templates/check-pattern.md.tmpl`) describes the classification model (PASS/FAIL/WARN/INFO) used by the CLI internally.

Read `${CLAUDE_SKILL_DIR}/templates/output-format.md.tmpl` for the output format: summary table, status indicators, issues list, optional recent decisions, and final result line.

---

## Checks

Run all health checks via the CLI:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js verify health
```

Parse the JSON output. The CLI returns an object with:
- `checks`: array of `{ name, status, message, fix_suggestion }` for each check
- `summary`: `{ passed, failed, warned, total }`

For each check result, record the status (PASS/FAIL/WARN/INFO) for display in the output table.

If the CLI fails, display a branded ERROR box: "Failed to run health checks. Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js verify health` manually to diagnose." and stop.

---

## Auto-Fix for Common Corruption Patterns

After running all 10 checks and collecting results, if any of the following auto-fixable issues were found, offer to fix them.

### Auto-Fixable Patterns

**CRITICAL: Execute each fix immediately when found. Do not defer fixes to a later step.**

| Pattern | Detection | Fix Action |
|---------|-----------|------------|
| Missing STATE.md frontmatter | Check 5 finds STATE.md without `---` block | Regenerate frontmatter from ROADMAP.md phase data (current_phase, phase_slug, status) |
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

Reference: `skills/shared/error-reporting.md` for branded error output patterns.

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

`/pbr:progress`

<sub>`/clear` first → fresh context window</sub>



**Also available:**
- `/pbr:continue` — execute next logical step
- `/pbr:settings` — adjust settings


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
