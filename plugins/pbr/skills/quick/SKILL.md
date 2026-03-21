---
name: quick
description: "Execute an ad-hoc task with atomic commits. Skips full plan/review."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task, AskUserQuestion
---

**STOP -- DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes ~7,600 tokens. Begin executing Step 0 immediately.**

# /pbr:quick -- Quick Ad-Hoc Task Execution

You are running the **quick** skill. Your job is to execute a small, self-contained task outside the normal plan/build/review cycle. Quick tasks get their own tracking, atomic commits, and state integration, but skip the overhead of full planning.

This skill **spawns a single Task(subagent_type: "pbr:executor")** for execution.

**Dual-mode flow**: This skill has two execution paths controlled by the `features.zero_friction_quick` config toggle (default: `true`). The zero-friction path reaches the executor in 2 tool calls. The legacy path preserves the full pre-planning ceremony.

---

## Step 0 -- Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► QUICK TASK                                ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

## References

- `references/questioning.md` -- Questioning philosophy and progressive depth patterns
- `references/ui-brand.md` -- Status symbols, banners, checkpoint boxes, progress display

## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.
Reference: `skills/shared/agent-type-resolution.md` for agent type fallback when spawning Task() subagents.

Additionally for this skill:
- **Never** implement the task yourself -- you are a router, not a builder. ALL code changes go through a spawned `Task(subagent_type: "pbr:executor")`
- **Minimize** reading executor output into main context -- read only SUMMARY.md frontmatter

## Composable Flags

Parse `$ARGUMENTS` for optional flags before extracting the task description:

- **`--discuss`**: Before spawning the executor, ask 2-3 clarifying questions about the approach. Write the Q&A results to `.planning/quick/{NNN}-{slug}/CONTEXT.md` as a lightweight decision record. Pass this CONTEXT.md to the executor via files_to_read.
- **`--research`**: Spawn a `Task(subagent_type: "pbr:researcher")` to investigate the task domain before execution. The researcher writes findings to `.planning/quick/{NNN}-{slug}/RESEARCH.md`. Pass this RESEARCH.md to the executor via files_to_read.
- **`--full`**: Enable plan-checker validation (max 2 iterations) before executor spawn AND post-execution verification via verifier agent. Creates VERIFICATION.md in the quick task directory. Does NOT escalate to /pbr:plan -- stays in quick pipeline.

Strip these flags from `$ARGUMENTS` before using the remainder as the task description.

**Flag combinations:**
- `--discuss` alone: Quick task with discussion + CONTEXT.md
- `--research` alone: Quick task with research + RESEARCH.md
- `--full` alone: Quick task with plan-checking + verification
- `--discuss --research`: Discussion + research before execution
- `--discuss --full`: Discussion + plan-checking + verification
- `--research --full`: Research + plan-checking + verification
- `--discuss --research --full`: All quality layers
- No flags: Standard quick task flow (zero-friction or legacy based on config)

**Note:** `--full` converts the zero-friction path to use a PLAN.md so plan-checker can validate it. The executor then reads the PLAN.md instead of inline instructions. This adds 1-2 tool calls but enables structured validation.

## Core Principle

**Quick tasks are for small, well-defined work.** If the user describes something that would take more than 3-5 tasks or touches multiple subsystems, suggest using the full plan/build cycle instead.

---

## Flow

### Step 1: Init + Route Decision (1 tool call)

**Init-first pattern**: Run the init command to get config + state in a single call:

```bash
node plugins/pbr/scripts/pbr-tools.js init quick "{description}"
```

From the init output:
1. Check if `.planning/` directory exists
   - If no: create **both** `.planning/` and `.planning/quick/` directories, then warn "No Plan-Build-Run project found. This will create a standalone quick task. Consider running `/pbr:new-project` first for full project tracking."
2. If `.planning/` exists but `.planning/quick/` does not: create `.planning/quick/` now
3. Read `features.zero_friction_quick` from config (default: `true`)

**Route decision:**
- If `--full` flag: continue with the selected path below (plan-checker and verifier steps will activate later). Do NOT escalate to `Skill({ skill: "pbr:plan" })`.
- If `--discuss` flag: go to **Step 1c** (ask clarifying questions, write CONTEXT.md), then continue.
- If `--research` flag: go to **Step 1d** (spawn researcher, write RESEARCH.md), then continue.
- If both `--discuss` and `--research`: run Step 1c first, then Step 1d.
- If `features.zero_friction_quick` is `true` (default): go to **Step 2** (zero-friction path)
- If `features.zero_friction_quick` is `false`: go to **Step 5** (legacy path)

**DO NOT fall back to the legacy flow when `zero_friction_quick` is `true`.** The zero-friction path is the intended default experience.

### Step 1b: Get Task Description (if needed)

If `$ARGUMENTS` is provided and non-empty (after stripping flags):
- Use it as the task description

If `$ARGUMENTS` is empty:
- Ask the user: "What do you need done? Describe the task in a sentence or two."
  This is a freeform text prompt -- do NOT use AskUserQuestion here. Task descriptions require arbitrary text input, not option selection.

### Step 1c: Discussion (only if `--discuss` flag is set)

Ask 2-3 clarifying questions about the approach, constraints, and edge cases. Use plain text prompts (not AskUserQuestion -- these require freeform answers).

After receiving answers, write the Q&A to `.planning/quick/{NNN}-{slug}/CONTEXT.md`:

```markdown
# Quick Task Context

**Task:** {description}
**Date:** {YYYY-MM-DD}

## Discussion

{Q&A content -- each question and answer}

## Decisions

{Key decisions derived from the discussion}
```

**Note:** The task directory `.planning/quick/{NNN}-{slug}/` must be created before writing CONTEXT.md. In the zero-friction path, create it now (it will be reused in Step 3). In the legacy path, it is created in Step 5e.

Continue to Step 1d if `--research` is also set, otherwise continue to the selected path (Step 2 or Step 5).

### Step 1d: Research (only if `--research` flag is set)

Spawn a `Task(subagent_type: "pbr:researcher")` with the following prompt:

```
Research the following task domain for a quick task.
Task: {description}
Write findings to: .planning/quick/{NNN}-{slug}/RESEARCH.md
Focus on: existing patterns in the codebase, potential risks, recommended approach.
Keep it concise (under 500 tokens).
```

**Note:** The task directory `.planning/quick/{NNN}-{slug}/` must exist before the researcher writes to it. Create it if not already created by Step 1c.

After the researcher completes, verify `.planning/quick/{NNN}-{slug}/RESEARCH.md` exists. If missing, log a warning and continue without research context.

Continue to the selected path (Step 2 or Step 5).

---

## Zero-Friction Path (Steps 2-4)

> This path executes the task in 2 tool calls: init (Step 1) + spawn executor (Step 2).
> No PLAN.md is written before execution. No `.active-skill` is set.
> Artifacts are created AFTER execution completes.

### Step 2: Spawn Executor Immediately (1 tool call)

**Generate slug** via CLI (or use `blob.slug` from initQuick if available):
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js slug-generate "{description}"
```
Parse the JSON output to get the `slug` field. If `blob.slug` is available from the initQuick response, use it directly instead of calling slug-generate.

**Find next task number** from `.planning/quick/` listing (from init output if available, else quick `ls`):
1. Scan `.planning/quick/` directory for existing quick task directories
2. Extract the NNN prefix from directory names (pattern: `{NNN}-{slug}/`)
3. Next number = highest existing NNN + 1
4. If no existing tasks: start at 001
5. Zero-pad to 3 digits

Display to the user: `> Spawning executor...`

**Context Assembly:** Build the executor prompt's `files_to_read` block dynamically at spawn time. Always include STATE.md and CLAUDE.md as base files. Add CONTEXT.md line only if `--discuss` was used AND the file was created. Add RESEARCH.md line only if `--research` was used AND the file was created. Only include files that exist on disk.

Spawn a `Task(subagent_type: "pbr:executor")` with the following inline prompt:

> **Completion markers**: After executor completes, check for `## PLAN COMPLETE` or `## PLAN FAILED`. Route accordingly.

```
You are executor. Execute this quick task directly.

<files_to_read>
CRITICAL (no hook): Read these files BEFORE any other action:
1. .planning/STATE.md -- current project state (if exists)
2. CLAUDE.md -- project instructions
{3. .planning/quick/{NNN}-{slug}/CONTEXT.md -- task context (only if --discuss was used)}
{4. .planning/quick/{NNN}-{slug}/RESEARCH.md -- research findings (only if --research was used)}
</files_to_read>

Do NOT look for a PLAN.md file. Execute based on this description:

Task: {description}
Task ID: quick-{NNN}
Commit scope: quick-{NNN}

Instructions:
1. Understand what needs to change
2. Make the changes
3. Run appropriate verification (lint, test, typecheck)
4. Commit with format: {type}(quick-{NNN}): {description}

Do NOT write SUMMARY.md -- it will be generated post-hoc.

When done, output ## PLAN COMPLETE with a list of commits made.
```

This is the 2nd tool call. Code is now running.

### Step 2-full: Plan-Checker Loop for Zero-Friction (only if --full)

If `--full` flag is set in the zero-friction path, add plan-checker validation before executor spawn:

1. **Create PLAN.md**: Write a PLAN.md to `.planning/quick/{NNN}-{slug}/PLAN.md` using the same format as Legacy Step 5f. This is required so the plan-checker has a structured plan to validate.

2. **Run plan-checker loop**: Same logic as Legacy Step 5g-full:

```
iteration = 0
max_iterations = 2
while iteration < max_iterations:
  Spawn Task(subagent_type: "pbr:plan-checker") with quick-mode validation profile
  (same prompt as Legacy Step 5g-full)

  If CHECK PASSED: break
  If CHECK FAILED: fix PLAN.md, iteration += 1

If max_iterations reached: warn user and continue.
```

3. **Spawn executor with PLAN.md**: Instead of the inline zero-friction prompt, use the legacy-style executor prompt with `files_to_read` pointing to the PLAN.md (same as Legacy Step 5h).

**Note:** `--full` converts the zero-friction path to use a PLAN.md so plan-checker can validate it. The executor then reads the PLAN.md instead of inline instructions.

If `--full` is NOT set, skip this step entirely -- the zero-friction path proceeds directly to Step 2 executor spawn with no overhead.

### Step 3: Post-Execution Recording (after executor returns)

After the executor completes:

**CRITICAL — DO NOT SKIP: Create task directory .planning/quick/{NNN}-{slug}/ NOW. Executor output cannot be stored without this directory.**
1. **Create task directory**: `.planning/quick/{NNN}-{slug}/`

2. **Generate post-hoc SUMMARY.md** (if `features.post_hoc_artifacts` is not `false`):
   ```bash
   node -e "const ph=require('./plan-build-run/bin/lib/post-hoc.cjs'); ph.generateSummary(process.argv[1], process.argv[2], {commitPattern: 'quick-{NNN}', description: '{description}'})" .planning ".planning/quick/{NNN}-{slug}"
   ```
   - If `features.post_hoc_artifacts` is `false`: skip SUMMARY.md generation

3. **Update STATE.md** quick tasks table (same as Legacy Step 5i)

4. **Post-execution verification (only if --full)**: If `--full` flag is set AND executor completed successfully, run the same verifier spawn as Legacy Step 5i-full. Read VERIFICATION.md result after verifier returns.

5. **Check pending todos** (same as Step 6)

6. Go to **Step 4**

### Step 4: Commit Planning Docs (if configured)

If `planning.commit_docs: true` in config.json:
- Stage the quick task directory files (SUMMARY.md if generated, VERIFICATION.md if `--full` was used)
- Stage STATE.md changes
- Commit: `docs(planning): quick task {NNN} - {slug}`

Go to **Step 8** (Report Results).

---

## Legacy Path (Step 5)

> This path is used when `features.zero_friction_quick` is `false`.
> It preserves the full pre-planning ceremony: scope validation, PLAN.md creation, then executor spawn.

### Step 5: Full Pre-Planned Quick Task Flow

#### Step 5a: Set Active Skill

**CRITICAL — DO NOT SKIP: Write .active-skill NOW.** Write `.planning/.active-skill` with the content `quick` (single word, no newline). This registers you with the workflow enforcement hook -- it will block source code writes until PLAN.md exists.

#### Step 5b: Check ROADMAP Context

Check if ROADMAP.md exists:
- If yes: note the current phase context (quick tasks may relate to the active phase)
- If no: proceed without phase context

#### Step 5c: Validate Scope

Analyze the task description. If it appears to involve:
- More than ~5 files
- Multiple independent subsystems
- Significant architectural decisions
- Complex multi-step workflows

**CRITICAL -- DO NOT SKIP**: Present the following choice to the user via AskUserQuestion before proceeding:
Then use the **scope-confirm** pattern (see `skills/shared/gate-prompts.md`):

Use AskUserQuestion:
  question: "This task looks complex. Quick tasks work best for bug fixes, small features, config changes, and single-module refactors. How would you like to proceed?"
  header: "Scope"
  options:
    - label: "Quick task"  description: "Execute as lightweight task"
    - label: "Full plan"   description: "Switch to /pbr:plan-phase for proper planning"
    - label: "Revise"      description: "Let me rewrite the task description"
  multiSelect: false

If user selects "Quick task": continue to Step 5d.
If user selects "Full plan": clean up `.active-skill` if it exists, then chain directly: `Skill({ skill: "pbr:plan", args: "" })`. The user's task description carries over in conversation context -- the plan skill will pick it up.
If user selects "Revise": go back to Step 1b to get a new task description.
If user types something else (freeform): interpret their response and proceed accordingly.

#### Step 5d: Generate Slug and Task Number

**Generate slug** via CLI:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js slug-generate "{description}"
```
Parse the JSON output to get the `slug` field.

**Find next task number:**
1. Scan `.planning/quick/` directory for existing quick task directories
2. Extract the NNN prefix from directory names (pattern: `{NNN}-{slug}/`)
3. Next number = highest existing NNN + 1
4. If no existing tasks: start at 001
5. Zero-pad to 3 digits

#### Step 5e: Create Quick Task Directory

**STOP -- Use the Write or Bash tool RIGHT NOW to create this directory. Do not skip this step.**

Create: `.planning/quick/{NNN}-{slug}/`

Verify the directory exists with `ls .planning/quick/{NNN}-{slug}/` before proceeding. If the directory doesn't exist, you have a bug -- go back and create it.

#### Step 5f: Create Minimal PLAN.md

Write `.planning/quick/{NNN}-{slug}/PLAN.md`:

Read `references/plan-format.md` for the plan file format. Fill in all `{variable}` placeholders with actual task data from the user's description and project context.

**Plan generation rules:**
- Break the task into 1-3 tasks maximum (prefer fewer)
- Each task should be atomic (one commit per task)
- Infer file paths from the description and project context
- Include concrete verification commands
- If verification is unclear, use `echo "Manual verification needed"` and add a note

**For multi-task quick tasks**, add sequential tasks:

```markdown
<task name="{task 1}" type="auto">
...
</task>

<task name="{task 2}" type="auto">
...
</task>
```

**PLANNING GATE -- verify before spawning executor:**

Before proceeding to Step 5g, confirm these exist on disk:
1. `.planning/quick/{NNN}-{slug}/` directory exists
2. `.planning/quick/{NNN}-{slug}/PLAN.md` exists, is non-empty, and contains at least one `<task>` block

If either check fails, you have skipped steps. Go back and complete Steps 5d-5f. Do NOT proceed to spawning an executor.

#### Step 5g-full: Plan-Checker Loop (only if --full)

If `--full` flag is set, run the plan-checker before spawning the executor:

```
iteration = 0
max_iterations = 2
while iteration < max_iterations:
  Spawn Task(subagent_type: "pbr:plan-checker") with prompt:
    You are plan-checker validating a QUICK TASK plan (not a full phase plan).

    <files_to_read>
    1. .planning/quick/{NNN}-{slug}/PLAN.md
    </files_to_read>

    Quick-mode validation profile -- check ONLY these dimensions:
    1. Task completeness: all 5 elements present (name, files, action, verify, done)
    2. Verification commands: verify commands are executable
    3. Scope sanity: <= 3 tasks, <= 8 files total

    SKIP these full-plan-only dimensions:
    - Cross-plan data contracts
    - Wave/dependency correctness
    - Requirement coverage (quick tasks don't have requirement IDs)
    - Context compliance (no phase CONTEXT.md for quick tasks unless --discuss)

    Output: ## CHECK PASSED or ## CHECK FAILED with specific issues.

  If plan-checker returns CHECK PASSED: break loop, proceed to executor
  If plan-checker returns CHECK FAILED:
    - Read the issues
    - Fix PLAN.md inline (rewrite the plan addressing issues)
    - iteration += 1
    - Loop again

If max_iterations reached without passing: warn user "Plan-checker did not pass after 2 iterations. Proceeding with current plan." and continue to executor.
```

If `--full` is NOT set, skip this step entirely -- zero overhead on the default path.

#### Step 5g: Spawn Executor

**Pre-spawn check** -- Verify `.planning/quick/{NNN}-{slug}/PLAN.md` exists and contains at least one `<task>` block. If missing, STOP and complete Steps 5d-5f first.

Display to the user: `> Spawning executor...`

Spawn a `Task(subagent_type: "pbr:executor")` with the following prompt:

> **Completion markers**: After executor completes, check for `## PLAN COMPLETE` or `## PLAN FAILED`. Route accordingly.

**Context Assembly:** Build the `files_to_read` block dynamically. Always include PLAN.md, STATE.md, and CLAUDE.md. Add CONTEXT.md line only if `--discuss` was used AND the file was created. Add RESEARCH.md line only if `--research` was used AND the file was created. Only include files that exist on disk.

```
You are executor. Execute the following quick task plan.

<files_to_read>
CRITICAL (no hook): Read these files BEFORE any other action:
1. .planning/quick/{NNN}-{slug}/PLAN.md -- the quick task plan with task details
2. .planning/STATE.md -- current project state and progress (if exists)
3. CLAUDE.md -- project instructions
{4. .planning/quick/{NNN}-{slug}/CONTEXT.md -- task context (only if --discuss was used)}
{5. .planning/quick/{NNN}-{slug}/RESEARCH.md -- research findings (only if --research was used)}
</files_to_read>

Plan file: .planning/quick/{NNN}-{slug}/PLAN.md
Phase: quick
Plan ID: {NNN}

Read the plan file and execute all tasks sequentially. Follow all executor protocols:
- Atomic commits per task
- Commit format: fix(quick-{NNN}): {description} (or feat/refactor/test as appropriate)
- Run verify commands
- Create SUMMARY.md at .planning/quick/{NNN}-{slug}/SUMMARY.md

Execute now.
```

#### Step 5i: Read Results + Spot-Check

After the executor completes:
1. Read `.planning/quick/{NNN}-{slug}/SUMMARY.md`
2. Check the status field:
   - `completed` -- task succeeded
   - `partial` -- some tasks completed, others failed
   - `failed` -- task failed entirely

**Spot-Check Executor Output:**

1. **SUMMARY.md exists**: Check `.planning/quick/{NNN}-{slug}/SUMMARY.md` exists
2. **Key files exist**: Verify first 2 files from SUMMARY.md `key_files` frontmatter exist on disk
3. **Commits present**: Run `git log --oneline -5` and verify at least one commit matches the task scope
4. **Self-check status**: Look for `## Self-Check: FAILED` in SUMMARY.md -- if present, warn the user

If ANY spot-check fails, present the user with options: **Retry** / **Continue anyway** / **Abort**

#### Step 5i-full: Post-Execution Verification (only if --full)

If `--full` flag is set AND executor completed successfully (status = completed or partial):

Spawn `Task(subagent_type: "pbr:verifier")` with prompt:

```
You are verifier. Verify this quick task achieved its goals.

<files_to_read>
1. .planning/quick/{NNN}-{slug}/PLAN.md -- the task plan with acceptance criteria
2. .planning/quick/{NNN}-{slug}/SUMMARY.md -- executor's completion report
</files_to_read>

Quick-mode verification:
1. Check that files listed in PLAN.md files_modified exist on disk
2. Check that verify commands from PLAN.md pass when re-run
3. Check that commits exist matching the task scope (quick-{NNN})

Write VERIFICATION.md to: .planning/quick/{NNN}-{slug}/VERIFICATION.md

Use this frontmatter format:
---
status: passed|failed
must_haves_total: {N}
must_haves_passed: {N}
gaps: []
---

Output: ## VERIFICATION COMPLETE
```

After verifier returns:
- Read `.planning/quick/{NNN}-{slug}/VERIFICATION.md` frontmatter
- If status = passed: display "Verification: PASSED" in results
- If status = failed: display "Verification: FAILED" with gap details, suggest `/pbr:debug`

If `--full` is NOT set, skip this step entirely -- no verifier overhead on the default path.

#### Step 5j: Update STATE.md

If STATE.md exists, update the Quick Tasks section.

**If the section doesn't exist, create it:**

```markdown
### Quick Tasks

| # | Description | Status | Commit |
|---|-------------|--------|--------|
```

**Add the new entry:**

```markdown
| {NNN} | {description} | {status indicator} | {commit hash or "N/A"} |
```

Status indicators:
- Completed: checkmark
- Partial: warning indicator
- Failed: X indicator

#### Step 5k: Commit Planning Docs

Reference: `skills/shared/commit-planning-docs.md` for the standard commit pattern.

If `planning.commit_docs: true` in config.json:
- Stage the quick task directory files (PLAN.md, SUMMARY.md, and VERIFICATION.md if `--full` was used)
- Stage STATE.md changes
- Commit: `docs(planning): quick task {NNN} - {slug}`

Go to **Step 6** (Check Pending Todos), then **Step 7** (Clean Up Active Skill), then **Step 8** (Report Results).

---

## Shared Steps (both paths converge here)

### Step 6: Check Pending Todos

After completing work, check if any pending todos are now satisfied:

1. Check if `.planning/todos/pending/` exists and contains files
2. If no pending todos: skip to Step 7
3. If pending todos exist:
   a. Read the title and description from each pending todo's YAML frontmatter
   b. Compare each todo against the work just completed (the task description, files changed, commits made)
   c. If a todo is **clearly satisfied** by the work (the todo's goal matches what was built):
      - Move it: read the file, update `status: done`, add `completed: {YYYY-MM-DD}`, write to `.planning/todos/done/{filename}`, delete from `pending/` via Bash `rm`
      - Display: `Auto-closed todo {NNN}: {title} (satisfied by quick task {NNN})`
   d. If a todo is **partially related** but not fully satisfied: do NOT close it, but mention it:
      - Display: `Related pending todo {NNN}: {title} -- may be partially addressed`
   e. If a todo is unrelated: skip silently

**Important:** Only auto-close todos where the match is unambiguous. When in doubt, leave it open -- false closures are worse than missed closures.

### Step 7: Clean Up Active Skill

Delete `.planning/.active-skill` if it exists. This must happen on all paths (success, partial, and failure) before reporting results.

**Note:** The zero-friction path never sets `.active-skill`, so this is primarily needed for the legacy path. Deleting a non-existent file is harmless.

### Step 8: Report Results

**Artifact check** -- Before reporting, verify all required artifacts exist:
1. `.planning/quick/{NNN}-{slug}/` directory exists
2. `.planning/quick/{NNN}-{slug}/SUMMARY.md` exists and is non-empty (or was intentionally skipped via `post_hoc_artifacts: false`)
3. STATE.md contains a quick task entry for {NNN} (if STATE.md exists)
4. If `--full` was used: `.planning/quick/{NNN}-{slug}/VERIFICATION.md` exists

If SUMMARY.md is missing and was expected: the executor may have failed -- re-read executor output and report the failure.
If STATE.md entry is missing: write it now (Step 5j logic).

Display results to the user with branded output:

**If completed:**
```
+--------------------------------------------------------------+
|  PLAN-BUILD-RUN > QUICK TASK COMPLETE                        |
+--------------------------------------------------------------+

**Quick Task {NNN}:** {description}
Commit: {hash} -- {commit message}
Files: {list of files changed}
{If --full was used: "Verification: PASSED" or "Verification: FAILED -- {gap details}"}



+--------------------------------------------------------------+
|  > NEXT UP                                                   |
+--------------------------------------------------------------+

**Continue your workflow** -- task complete

`/pbr:progress`

`/clear` first -- fresh context window



**Also available:**
- `/pbr:continue` -- execute next logical step
- `/pbr:check-todos` -- see pending todos


```

**If partial:**
```
+--------------------------------------------------------------+
|  PLAN-BUILD-RUN > QUICK TASK {NNN} PARTIAL                   |
+--------------------------------------------------------------+

Completed: {N} of {M} tasks
Failed task: {task name} -- {failure reason}

-> Re-run with `/pbr:quick` to retry
-> `/pbr:debug` to investigate the failure
```

**If failed:**
```
+--------------------------------------------------------------+
|  ERROR                                                       |
+--------------------------------------------------------------+

Quick Task {NNN} failed: {failure details}

**To fix:** {what to try next}
```

---

## Quick Task Plan Generation

### Inferring File Paths

When the user describes a task, infer file paths from:
1. The project structure (use Glob to find existing files matching keywords)
2. The tech stack (from prior SUMMARY.md files or package.json/requirements.txt)
3. Naming conventions in the codebase
4. Explicit file mentions in the description

### Inferring Verification

Choose verification based on context:

| Context | Verification Command |
|---------|---------------------|
| TypeScript project | `npx tsc --noEmit` |
| Has test files | `npm test` or `pytest` |
| Has ESLint | `npx eslint {files}` |
| Python project | `python -c "import {module}"` |
| Config change | `cat {file}` to verify content |
| Script | Run the script with safe args |
| Unknown | `echo "Manual verification needed"` |

### Commit Type Selection

| Task Nature | Commit Type |
|-------------|-------------|
| Bug fix | `fix` |
| New feature/functionality | `feat` |
| Code restructuring | `refactor` |
| Adding tests | `test` |
| Config/tooling changes | `chore` |
| Documentation | `docs` |

---

## Edge Cases

### No `.planning/` directory
- Create `.planning/quick/` directory
- Proceed without STATE.md integration
- Warn user about limited tracking

### Executor fails entirely
- Delete `.planning/.active-skill` before reporting the error (if it was set)
- Read error output
- Present to user with suggestion
- Do NOT auto-retry -- let the user decide

### Task description is too vague
- Ask clarifying questions as plain text prompts (do NOT use AskUserQuestion -- these require freeform text answers):
  - "Which file(s) need to change?"
  - "What should the end result look like?"
  - "Is there a specific error to fix?"

### User provides a file path in the description
- Use it directly in the plan (legacy path) or pass to executor inline (zero-friction path)
- Read the file first to understand its context
- Tailor the approach to the specific file

---

## Anti-Patterns

**These are the most common failure modes. If you violate any of these, the skill has not executed correctly.**

1. **DO NOT** implement the task yourself -- you MUST spawn a `Task(subagent_type: "pbr:executor")`. This is the single most important rule.
2. **DO NOT** fall back to the legacy flow when `zero_friction_quick` is `true` unless `--full` flag is set. The zero-friction path is the intended default experience.
3. **DO NOT** skip creating `.planning/quick/{NNN}-{slug}/` -- every quick task gets a tracking directory (created post-hoc in zero-friction, pre-execution in legacy)
4. **DO NOT** skip writing PLAN.md in the legacy path -- the executor needs a plan file to follow
5. **DO NOT** create elaborate multi-wave plans -- quick tasks should be 1-3 tasks max
6. **DO NOT** spawn multiple executors -- one executor for the whole quick task
7. **DO NOT** skip the SUMMARY.md -- even quick tasks need documentation (unless `post_hoc_artifacts: false`)
8. **DO NOT** use `git add .` -- stage specific files only
9. **DO NOT** skip verification -- every task needs a verify step
10. **DO NOT** create a quick task for something that needs planning -- suggest `/pbr:plan-phase`
11. **DO NOT** modify STATE.md if it doesn't exist (other than warning)
12. **DO NOT** break the numbering sequence -- always find the next number
13. **DO NOT** write `.active-skill` in the zero-friction path -- it adds unnecessary ceremony
