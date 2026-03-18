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

- **`--discuss`**: Include a brief discussion step before building. When passed, after identifying the task, ask 2-3 clarifying questions about the approach before spawning the executor. This adds lightweight discussion without the full `/pbr:discuss-phase` overhead.
- **`--full`**: Run the complete begin-plan-build chain. When passed, instead of the quick task flow, chain directly: `Skill({ skill: "pbr:plan", args: "" })` with the task description carried over. This escalates to the full pipeline including research.

Strip these flags from `$ARGUMENTS` before using the remainder as the task description.

**Flag combinations:**
- `--discuss` alone: Quick task with brief discussion step
- `--full` alone: Escalate to full pipeline
- `--discuss --full`: Escalate to full pipeline (--full takes precedence)
- No flags: Standard quick task flow (zero-friction or legacy based on config)

## Core Principle

**Quick tasks are for small, well-defined work.** If the user describes something that would take more than 3-5 tasks or touches multiple subsystems, suggest using the full plan/build cycle instead.

---

## Flow

### Step 1: Init + Route Decision (1 tool call)

**Init-first pattern**: Run the init command to get config + state in a single call:

```bash
node plugins/pbr/scripts/pbr-tools.cjs init quick "{description}"
```

From the init output:
1. Check if `.planning/` directory exists
   - If no: create **both** `.planning/` and `.planning/quick/` directories, then warn "No Plan-Build-Run project found. This will create a standalone quick task. Consider running `/pbr:new-project` first for full project tracking."
2. If `.planning/` exists but `.planning/quick/` does not: create `.planning/quick/` now
3. Read `features.zero_friction_quick` from config (default: `true`)

**Route decision:**
- If `--full` flag: clean up `.active-skill` if it exists, then chain to `Skill({ skill: "pbr:plan", args: "" })`. STOP here.
- If `--discuss` flag: ask 2-3 clarifying questions about the approach, then continue with the selected path below.
- If `features.zero_friction_quick` is `true` (default): go to **Step 2** (zero-friction path)
- If `features.zero_friction_quick` is `false`: go to **Step 5** (legacy path)

**DO NOT fall back to the legacy flow when `zero_friction_quick` is `true` unless `--full` flag is set.** The zero-friction path is the intended default experience.

### Step 1b: Get Task Description (if needed)

If `$ARGUMENTS` is provided and non-empty (after stripping flags):
- Use it as the task description

If `$ARGUMENTS` is empty:
- Ask the user: "What do you need done? Describe the task in a sentence or two."
  This is a freeform text prompt -- do NOT use AskUserQuestion here. Task descriptions require arbitrary text input, not option selection.

---

## Zero-Friction Path (Steps 2-4)

> This path executes the task in 2 tool calls: init (Step 1) + spawn executor (Step 2).
> No PLAN.md is written before execution. No `.active-skill` is set.
> Artifacts are created AFTER execution completes.

### Step 2: Spawn Executor Immediately (1 tool call)

**Generate slug** (inline, no file I/O):
- Take the first 4-5 meaningful words from the description
- Lowercase, hyphen-separated
- Remove articles (a, an, the) and prepositions
- Example: "Fix auth bug in login flow" -> "fix-auth-bug-login"

**Find next task number** from `.planning/quick/` listing (from init output if available, else quick `ls`):
1. Scan `.planning/quick/` directory for existing quick task directories
2. Extract the NNN prefix from directory names (pattern: `{NNN}-{slug}/`)
3. Next number = highest existing NNN + 1
4. If no existing tasks: start at 001
5. Zero-pad to 3 digits

Display to the user: `> Spawning executor...`

Spawn a `Task(subagent_type: "pbr:executor")` with the following inline prompt:

> **Completion markers**: After executor completes, check for `## PLAN COMPLETE` or `## PLAN FAILED`. Route accordingly.

```
You are executor. Execute this quick task directly.

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

### Step 3: Post-Execution Recording (after executor returns)

After the executor completes:

1. **Create task directory**: `.planning/quick/{NNN}-{slug}/`

2. **Generate post-hoc SUMMARY.md** (if `features.post_hoc_artifacts` is not `false`):
   ```bash
   node -e "const ph=require('./plan-build-run/bin/lib/post-hoc.cjs'); ph.generateSummary(process.argv[1], process.argv[2], {commitPattern: 'quick-{NNN}', description: '{description}'})" .planning ".planning/quick/{NNN}-{slug}"
   ```
   - If `features.post_hoc_artifacts` is `false`: skip SUMMARY.md generation

3. **Update STATE.md** quick tasks table (same as Legacy Step 5i)

4. **Check pending todos** (same as Step 6)

5. Go to **Step 4**

### Step 4: Commit Planning Docs (if configured)

If `planning.commit_docs: true` in config.json:
- Stage the quick task directory files (SUMMARY.md if generated)
- Stage STATE.md changes
- Commit: `docs(planning): quick task {NNN} - {slug}`

Go to **Step 8** (Report Results).

---

## Legacy Path (Step 5)

> This path is used when `features.zero_friction_quick` is `false`.
> It preserves the full pre-planning ceremony: scope validation, PLAN.md creation, then executor spawn.

### Step 5: Full Pre-Planned Quick Task Flow

#### Step 5a: Set Active Skill

Write `.planning/.active-skill` with the content `quick` (single word, no newline). This registers you with the workflow enforcement hook -- it will block source code writes until PLAN.md exists.

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

**Generate slug:**
- Take the first 4-5 meaningful words from the description
- Lowercase, hyphen-separated
- Remove articles (a, an, the) and prepositions
- Example: "Fix auth bug in login flow" -> "fix-auth-bug-login"

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

#### Step 5g: Local LLM Task Validation (optional, advisory)

If `config.local_llm.enabled` is `true`, run a quick scope validation before spawning:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js llm classify PLAN ".planning/quick/{NNN}-{slug}/PLAN.md"
```

- If classification is `"stub"` with confidence >= 0.7: warn `"Plan looks like a stub -- executor may struggle. Consider adding more detail to task descriptions."`
- If the command fails or returns null: skip silently (local LLM unavailable)
- This is advisory only -- never block on the result

#### Step 5h: Spawn Executor

**Pre-spawn check** -- Verify `.planning/quick/{NNN}-{slug}/PLAN.md` exists and contains at least one `<task>` block. If missing, STOP and complete Steps 5d-5f first.

Display to the user: `> Spawning executor...`

Spawn a `Task(subagent_type: "pbr:executor")` with the following prompt:

> **Completion markers**: After executor completes, check for `## PLAN COMPLETE` or `## PLAN FAILED`. Route accordingly.

```
You are executor. Execute the following quick task plan.

<files_to_read>
CRITICAL (no hook): Read these files BEFORE any other action:
1. .planning/quick/{NNN}-{slug}/PLAN.md -- the quick task plan with task details
2. .planning/STATE.md -- current project state and progress (if exists)
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
- Stage the quick task directory files (PLAN.md, SUMMARY.md)
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
