---
name: validate-phase
description: "Post-build quality gate. Identifies test gaps and spawns nyquist-auditor to fill them."
allowed-tools: Read, Write, Bash, Glob, Grep, Task, AskUserQuestion
argument-hint: "<phase-number> [--auto]"
---
<!-- markdownlint-disable MD012 MD046 -->

**STOP -- DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes tokens. Begin executing Step 1 immediately.**

# /pbr:validate-phase -- Post-Build Validation Quality Gate

**References:** `@references/ui-brand.md`

You are the orchestrator for `/pbr:validate-phase`. This skill identifies validation gaps in a completed phase -- requirements without tests, tests that fail, or verify commands without automated coverage -- and spawns the nyquist-auditor agent to fill them. Your job is to collect gaps, present them, delegate test generation, and write VALIDATION.md.

## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.
Reference: `skills/shared/agent-type-resolution.md` for agent type fallback when spawning Task() subagents.

Additionally for this skill:

- **Minimize** reading subagent output -- read only VALIDATION.md frontmatter for summaries after the auditor completes.
- **Delegate** all test generation to the nyquist-auditor agent. Never write tests yourself.

## Step 0 -- Immediate Output

**Before ANY tool calls**, display this banner:

```
+==============================================================+
|  PLAN-BUILD-RUN > VALIDATING PHASE {N}                       |
+==============================================================+
```

Where `{N}` is the phase number from `$ARGUMENTS`. Then proceed to Step 1.

## Multi-Session Sync

Before any phase-modifying operations (writing VALIDATION.md, spawning agents), acquire a claim:

```
acquireClaim(phaseDir, sessionId)
```

If the claim fails (another session owns this phase), display: "Another session owns this phase. Use `/pbr:progress` to see active claims."

On completion or error (including all exit paths), release the claim:

```
releaseClaim(phaseDir, sessionId)
```

## Prerequisites

- `.planning/config.json` exists
- Phase has been built: SUMMARY.md files exist in `.planning/phases/{NN}-{slug}/`

---

## Argument Parsing

Parse `$ARGUMENTS` according to `skills/shared/phase-argument-parsing.md`.

| Argument | Meaning |
|----------|---------|
| `3` | Validate phase 3 |
| `3 --auto` | Validate phase 3, skip interactive gap confirmation |
| (no number) | Use current phase from STATE.md |

---

## Orchestration Flow

Execute these steps in order.

---

### Step 1: Parse and Validate (inline)

1. Parse `$ARGUMENTS` for phase number and `--auto` flag
   - If `--auto` is present: set `auto_mode = true`. Log: "Auto mode enabled -- skipping gap confirmation prompt"
2. Read `.planning/config.json`
   **CRITICAL (hook-enforced): Write .active-skill NOW.** Write the text "validate" to `.planning/.active-skill` using the Write tool.
3. Resolve phase directory `.planning/phases/{NN}-{slug}/`
4. Validate:
   - Phase directory exists at `.planning/phases/{NN}-{slug}/`
   - SUMMARY.md files exist (phase has been built)
   - PLAN.md files exist (needed for requirement extraction)
5. If no phase number given, read current phase from `.planning/STATE.md`

**Validation errors:**

If phase directory not found:

```
+==============================================================+
|  ERROR                                                       |
+==============================================================+

Phase {N} not found in .planning/phases/. Run /pbr:status to see available phases.
```

If no SUMMARY.md files:

```
+==============================================================+
|  ERROR                                                       |
+==============================================================+

Phase {N} hasn't been built yet.

**To fix:** Run `/pbr:build {N}` first.
```

If no PLAN.md files:

```
+==============================================================+
|  ERROR                                                       |
+==============================================================+

Phase {N} has no plans.

**To fix:** Run `/pbr:plan-phase {N}` first.
```

---

### Step 2: Collect Requirements and Tests (inline)

1. Read all `PLAN-*.md` files in the phase directory:
   - Extract `must_haves` from frontmatter (truths, artifacts, key_links)
   - Extract `<verify>` commands from each `<task>` element
2. Read all `SUMMARY-*.md` files in the phase directory:
   - Extract `key_files` from frontmatter
3. For each key_file: check if a corresponding test file exists using project test conventions:
   - `*.test.js`, `*.test.ts` (Jest/Vitest)
   - `test_*.py` (pytest)
   - `*_test.go` (Go)
   - `*.spec.js`, `*.spec.ts` (Mocha/Jasmine)
4. For each `<verify>` command in plans: run it, record pass/fail
5. Build gap list with entries:

```
{
  task_id: "string",
  requirement: "from must_have",
  gap_type: "no_test_file | test_fails | no_automated_command",
  impl_file: "path/to/file"
}
```

---

### Step 3: Present Gaps (inline)

Display gap summary table:

```
Validation Gap Summary
| Task ID | Requirement | Gap Type | Impl File |
|---------|-------------|----------|-----------|
| T1      | {req}       | {type}   | {file}    |
```

**If zero gaps:**

1. Write VALIDATION.md with all-green status (see Step 5 format)
2. Display: "All requirements have passing tests."
3. Route to `/pbr:review {N}`
4. Clean up and STOP

**If gaps found and `--auto` flag set:**

Skip confirmation, proceed directly to Step 4.

**If gaps found without `--auto`:**

Use AskUserQuestion:

```
question: "Found {N} validation gaps. Spawn nyquist-auditor to generate tests?"
header: "Validation Gaps"
options:
  - label: "Yes"   description: "Generate tests for all gaps"
  - label: "No"    description: "Skip test generation, save gap report only"
```

- If "Yes": proceed to Step 4
- If "No": write VALIDATION.md with gaps (status yellow/red), display routing, clean up and STOP

---

### Step 4: Spawn Nyquist Auditor (delegated)

Display: `Spawning nyquist-auditor... (est. 2-5 min)`

Build spawn prompt with:

- `<files_to_read>` block listing: all PLAN.md files, all SUMMARY.md files, implementation files from gaps
- `<gaps>` XML block with the gap list from Step 2:

```xml
<gaps>
  <gap task_id="{id}" gap_type="{type}" impl_file="{file}">
    {requirement text}
  </gap>
  ...
</gaps>
```

- Phase number and phase slug

Spawn the agent:

```
Task({
  subagent_type: "pbr:nyquist-auditor",
  prompt: <auditor prompt with gaps and files_to_read>
})
```

Parse agent return for completion marker:

- `GAPS FILLED` -- all gaps resolved
- `PARTIAL` -- some gaps remain
- `ESCALATE` -- critical issues found

---

### Step 5: Write VALIDATION.md (inline)

**CRITICAL: Write VALIDATION.md NOW. Do not skip this step.**

Write `.planning/phases/{NN}-{slug}/VALIDATION.md` with this structure:

**Frontmatter:**

```yaml
---
phase: {NN}
phase_slug: "{slug}"
status: "green|yellow|red"
gaps_total: {N}
gaps_resolved: {M}
gaps_escalated: {K}
---
```

Status values:

- `green` -- all gaps resolved or no gaps found
- `yellow` -- some gaps resolved, some remain
- `red` -- escalations exist or critical gaps unresolved

**Body:**

```markdown
## Requirement-to-Test Mapping

| Task ID | Requirement | Test File | Command | Status |
|---------|-------------|-----------|---------|--------|
| T1      | {req}       | {file}    | {cmd}   | PASS   |
| T2      | {req}       | -         | -       | GAP    |

## Escalated Gaps

{If any escalated gaps, list them here with details}

{If none: "No escalated gaps."}
```

---

### Step 6: Route Next (inline)

**If status is green or yellow (all gaps resolved or partially resolved):**

```
+==============================================================+
|  VALIDATION COMPLETE                                         |
+==============================================================+

Phase {N} validation: {status}
Gaps found: {total} | Resolved: {resolved} | Remaining: {remaining}

NEXT UP:
  /pbr:review {N}          -- run verification checks
  /pbr:validate-phase {N}  -- re-validate (if yellow)
```

**If status is red (escalations exist):**

```
+==============================================================+
|  VALIDATION: ESCALATIONS                                     |
+==============================================================+

Phase {N} validation: RED
Gaps found: {total} | Resolved: {resolved} | Escalated: {escalated}

NEXT UP:
  /pbr:build {N} --gaps-only  -- fix implementation bugs
  /pbr:validate-phase {N}     -- re-validate after fixes
```

---

## Cleanup

Delete `.planning/.active-skill` if it exists. This must happen on all paths (success, partial, and failure) before reporting results.

Release any multi-session claim acquired in the sync step.

---

## Error Handling

### Nyquist-auditor agent fails

If the Task() spawn fails, display:

```
+==============================================================+
|  ERROR                                                       |
+==============================================================+

Nyquist-auditor failed to complete.

**To fix:** Review gaps manually or retry with `/pbr:validate-phase {N}`.
```

Write VALIDATION.md with current gap status (status: red). Clean up and STOP.

### No must-haves to check

If plans have empty must_haves:

- Warn: "Plans don't have defined must-haves. Validation will be based on key_files only."
- Use SUMMARY.md key_files as the basis for gap detection

---

## Files Created/Modified by /pbr:validate-phase

| File | Purpose | When |
|------|---------|------|
| `.planning/phases/{NN}-{slug}/VALIDATION.md` | Validation report with test mapping | Step 5 |
| `.planning/.active-skill` | Session lock | Step 1 (created), Cleanup (deleted) |

---

## Notes

- The nyquist-auditor agent handles ALL test generation -- never write tests in the orchestrator
- Re-running `/pbr:validate-phase` after fixes triggers fresh gap detection
- VALIDATION.md is persistent and serves as the ground truth for test coverage gaps
- Gap detection checks: test file existence, test execution results, automated verify commands
