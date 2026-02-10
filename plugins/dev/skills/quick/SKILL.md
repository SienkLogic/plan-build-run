---
name: quick
description: "Execute a quick ad-hoc task. Atomic commits + state tracking, skips full plan/review cycle."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task
---

# /dev:quick — Quick Ad-Hoc Task Execution

You are running the **quick** skill. Your job is to execute a small, self-contained task outside the normal plan/build/review cycle. Quick tasks get their own tracking, atomic commits, and state integration, but skip the overhead of full planning.

This skill **spawns a single Task(towline-executor)** for execution.

---

## Core Principle

**Quick tasks are for small, well-defined work.** If the user describes something that would take more than 3-5 tasks or touches multiple subsystems, suggest using the full plan/build cycle instead.

---

## Flow

### Step 1: Check Project Context

1. Check if `.planning/` directory exists
   - If yes: read config.json for settings
   - If no: warn "No Towline project found. This will create a standalone quick task. Consider running `/dev:begin` first for full project tracking."

2. Check if ROADMAP.md exists
   - If yes: note the current phase context (quick tasks may relate to the active phase)
   - If no: proceed without phase context

### Step 2: Get Task Description

If `$ARGUMENTS` is provided and non-empty:
- Use `$ARGUMENTS` as the task description

If `$ARGUMENTS` is empty:
- Ask user via AskUserQuestion: "What do you need done? Describe the task in a sentence or two."

### Step 3: Validate Scope

Analyze the task description. If it appears to involve:
- More than ~5 files
- Multiple independent subsystems
- Significant architectural decisions
- Complex multi-step workflows

Then warn the user:
```
This looks like it might be bigger than a quick task. Quick tasks work best for:
- Bug fixes
- Small feature additions
- Configuration changes
- Refactoring a single module
- Adding a test

Would you like to proceed as a quick task, or use `/dev:plan` for a full planning cycle?
```

Use AskUserQuestion to let the user decide. If they want to proceed, continue.

### Step 4: Generate Slug and Task Number

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

### Step 5: Create Quick Task Directory

Create: `.planning/quick/{NNN}-{slug}/`

### Step 6: Create Minimal PLAN.md

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

### Step 7: Spawn Executor

Spawn a `Task(towline-executor)` with the following prompt:

```
You are towline-executor. Execute the following quick task plan.

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

### Step 8: Read Results

After the executor completes:
1. Read `.planning/quick/{NNN}-{slug}/SUMMARY.md`
2. Check the status field:
   - `completed` — task succeeded
   - `partial` — some tasks completed, others failed
   - `failed` — task failed entirely

### Step 9: Update STATE.md

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

### Step 10: Commit Planning Docs

If `planning.commit_docs: true` in config.json:
- Stage the quick task directory files (PLAN.md, SUMMARY.md)
- Stage STATE.md changes
- Commit: `docs(planning): quick task {NNN} - {slug}`

### Step 11: Report Results

Display results to the user:

```
Quick Task {NNN}: {description}
Status: {Completed / Partial / Failed}

{If completed:}
Commit: {hash} - {commit message}
Files: {list of files changed}

{If partial:}
Completed: {N} of {M} tasks
Failed task: {task name} - {failure reason}

{If failed:}
Error: {failure details}
Suggestion: {what to try next}
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
- Read error output
- Present to user with suggestion
- Do NOT auto-retry — let the user decide

### Task description is too vague
- Ask clarifying questions via AskUserQuestion:
  - "Which file(s) need to change?"
  - "What should the end result look like?"
  - "Is there a specific error to fix?"

### User provides a file path in the description
- Use it directly in the plan
- Read the file first to understand its context
- Tailor the plan to the specific file

---

## Anti-Patterns

1. **DO NOT** create elaborate multi-wave plans — quick tasks should be 1-3 tasks max
2. **DO NOT** spawn multiple executors — one executor for the whole quick task
3. **DO NOT** skip the SUMMARY.md — even quick tasks need documentation
4. **DO NOT** use `git add .` — stage specific files only
5. **DO NOT** skip verification — every task needs a verify step
6. **DO NOT** create a quick task for something that needs planning — suggest `/dev:plan`
7. **DO NOT** modify STATE.md if it doesn't exist (other than warning)
8. **DO NOT** break the numbering sequence — always find the next number
