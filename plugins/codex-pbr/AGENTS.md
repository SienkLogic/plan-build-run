# Plan-Build-Run Workflow for Codex

> This file teaches Codex the Plan-Build-Run (PBR) development methodology.
> Place it in your repository root so Codex reads it before starting any task.
>
> PBR prevents quality degradation on complex projects by enforcing a
> disciplined Plan → Build → Review cycle with file-based state tracking.

---

## Core Principle

**Never build without a plan. Never ship without a review.**

Every meaningful change flows through three stages:

1. **Plan** — Research the problem, design the solution, define success criteria
2. **Build** — Execute the plan with atomic commits, one task at a time
3. **Review** — Verify the build achieved the plan's goals (goal-backward verification)

---

## Project State Directory

All workflow state lives in `.planning/` at the repository root. Codex should
create and maintain these files as it works:

```
.planning/
├── STATE.md              # Current position in the workflow
├── ROADMAP.md            # Phase structure with goals and dependencies
├── config.json           # Workflow settings (optional)
├── phases/
│   └── NN-slug/          # One directory per phase
│       ├── PLAN.md       # What to build and how
│       ├── SUMMARY.md    # What was built (written after execution)
│       └── VERIFICATION.md  # Did the build match the plan?
├── quick/                # Lightweight tasks outside the full cycle
│   └── NNN-slug/
│       ├── PLAN.md
│       └── SUMMARY.md
├── debug/                # Persistent debug sessions
│   └── slug/
│       └── HYPOTHESIS.md
├── notes/                # Captured ideas and decisions
├── todos/
│   ├── pending/          # Active cross-session backlog
│   └── done/             # Completed todos
└── milestones/           # Archived milestone snapshots
    └── v{version}/
```

### STATE.md Format

```markdown
---
current_phase: "01-setup"
current_plan: "01-01"
status: "Planning"           # Planning | Planned | Building | Built | Verified
updated: "2025-01-15T10:30:00Z"
---

## Current Focus
Brief description of what's happening now.

## Recently Completed
- Phase 01, Plan 01: Project scaffolding (Verified)

## Next Steps
1. Primary: Start planning phase 02
2. Alternative: Review phase 01 verification results
```

Valid status transitions: Planning → Planned → Building → Built → Verified

---

## Skill Invocation

PBR skills live in `.agents/skills/{name}/SKILL.md` in the plugin directory.
Codex discovers and runs them using the `$pbr-{name}` syntax.

### Available Skills

| Skill | Command | When to Use |
|-------|---------|-------------|
| begin | `$pbr-begin` | Start a new project or onboard PBR to existing codebase |
| plan | `$pbr-plan` | Plan the next phase or plan item |
| build | `$pbr-build` | Execute the current plan |
| review | `$pbr-review` | Verify a completed build against its plan |
| status | `$pbr-status` | Show current workflow position |
| quick | `$pbr-quick` | Run a lightweight task outside the full cycle |
| continue | `$pbr-continue` | Resume from a checkpoint or interrupted session |
| pause | `$pbr-pause` | Pause with context preservation |
| resume | `$pbr-resume` | Resume a paused session |
| debug | `$pbr-debug` | Start or continue a debug investigation |
| explore | `$pbr-explore` | Research a domain or problem space |
| discuss | `$pbr-discuss` | Think through a design decision |
| do | `$pbr-do` | Execute a one-off instruction under PBR rules |
| scan | `$pbr-scan` | Audit codebase for issues |
| health | `$pbr-health` | Check project health and workflow hygiene |
| milestone | `$pbr-milestone` | Manage versioned milestone releases |
| todo | `$pbr-todo` | Manage cross-session task backlog |
| note | `$pbr-note` | Capture a decision or observation |
| import | `$pbr-import` | Import existing work into PBR structure |
| config | `$pbr-config` | Manage workflow configuration |
| setup | `$pbr-setup` | Configure or reconfigure PBR for this project |
| audit | `$pbr-audit` | Analyze session logs for workflow compliance |
| help | `$pbr-help` | Show available skills and usage |
| statusline | `$pbr-statusline` | Output a compact status summary |
| undo | `$pbr-undo` | Roll back the last plan or build step |

Skills can be invoked explicitly (`$pbr-plan`) or triggered implicitly when
your request description matches a skill's purpose. For example, saying
"plan the authentication phase" may implicitly trigger `$pbr-plan`.

---

## Phase Workflow

### Step 1: Planning a Phase

Before writing any code for a phase, create a plan file:

**`.planning/phases/NN-slug/PLAN.md`**:

```markdown
---
phase: "01-setup"
plan: "01-01"
type: "feature"
files_modified:
  - "src/config.ts"
  - "src/database.ts"
must_haves:
  truths:
    - "Database connection is established on startup"
    - "Configuration loads from environment variables"
  artifacts:
    - "src/config.ts: >30 lines, exports loadConfig()"
    - "src/database.ts: >40 lines, exports connectDB()"
---

## Tasks

### Task 1: Create configuration loader
- Read environment variables for DB_HOST, DB_PORT, DB_NAME
- Export a typed config object
- Throw on missing required variables

### Task 2: Create database connection module
- Use the config from Task 1
- Implement connection pooling
- Export connectDB() and getDB() functions

### Task 3: Add startup integration
- Call loadConfig() then connectDB() in main entry point
- Log connection success/failure
```

**Planning rules:**
- Define `must_haves` with concrete, verifiable success criteria
- List all files that will be created or modified
- Break work into small, independently committable tasks
- Each task should produce a working, testable increment

### Step 2: Building (Executing the Plan)

When executing a plan:

1. **Read the plan first** — Load `.planning/phases/NN-slug/PLAN.md`
2. **Update STATE.md** — Set status to "Building"
3. **Execute tasks sequentially** — Follow the plan's task order
4. **Commit after each task** — One atomic commit per task
5. **Write SUMMARY.md** — Document what was actually built

**Commit message format:**

```
{type}({scope}): {description}
```

Examples:
- `feat(config): implement configuration loader`
- `fix(config): handle missing DB_PORT with default value`
- `test(config): add unit tests for config validation`
- `refactor(auth): extract auth middleware into separate module`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

**SUMMARY.md format** (written after all tasks complete):

```markdown
---
phase: "01-setup"
plan: "01-01"
status: "complete"
commits:
  - "abc1234: feat(config): implement configuration loader"
  - "def5678: feat(database): create database connection module"
key_files:
  - "src/config.ts"
  - "src/database.ts"
requires:
  - "Node.js 18+"
  - "PostgreSQL 14+"
deferred:
  - "Connection retry logic (moved to phase 03)"
---

## What Was Built
Brief narrative of what was accomplished and any deviations from the plan.
```

### Step 3: Verification

After building, verify the work against the plan's `must_haves`:

**VERIFICATION.md format:**

```markdown
---
phase: "01-setup"
plan: "01-01"
result: "PASS"
verified_at: "2025-01-15T14:00:00Z"
---

## Must-Have Verification

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Database connection established on startup | PASS | `connectDB()` called in `src/index.ts:15` |
| 2 | Config loads from environment variables | PASS | `loadConfig()` reads DB_HOST, DB_PORT, DB_NAME |

## Artifact Verification

| # | Artifact | Status | Evidence |
|---|----------|--------|----------|
| 1 | src/config.ts: >30 lines, exports loadConfig() | PASS | 47 lines, exports `loadConfig()` at line 12 |
| 2 | src/database.ts: >40 lines, exports connectDB() | PASS | 63 lines, exports `connectDB()` at line 28 |

## Deviations
None — plan executed as written.
```

---

## ROADMAP.md Structure

The roadmap defines the full project as a sequence of phases:

```markdown
# Project Roadmap

## Phase 01: Project Setup
**Goal:** Establish project foundation with configuration and database connectivity.
**Status:** Verified
**Depends on:** (none)

## Phase 02: Authentication
**Goal:** Users can sign in via OAuth and receive a session token.
**Status:** Planning
**Depends on:** Phase 01

## Phase 03: Core Features
**Goal:** Implement the primary user-facing features.
**Status:** Pending
**Depends on:** Phase 01, Phase 02
```

**Rules:**
- Phases are numbered sequentially (`01`, `02`, `03`, ...)
- Each phase has a clear, measurable goal
- Dependencies between phases are explicit
- Status tracks the highest completed stage for that phase

---

## Enforcement Rules

Codex has no hook system, so these rules are self-enforced checkpoints.
Run through this checklist at every stage transition.

### Gate 1: Commit Format

Before any `git commit`, verify the message matches:

```
{type}({scope}): {description}
```

- **Valid types**: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
- **Valid scopes**: a short descriptive word for what changed (e.g., `auth`, `config`, `executor`), `quick-NNN`, `planning`
- **Block the commit** if the format doesn't match — fix the message first

### Gate 2: Plan-Before-Build

Before writing any source code for a phase:

- Confirm `.planning/phases/NN-slug/PLAN.md` exists
- Confirm the plan has `must_haves` with at least one truth and one artifact
- **Never write production code without an approved plan**

### Gate 3: Phase Boundary

Only modify `.planning/phases/NN-*/` files for the phase shown in `STATE.md`.

- Cross-phase edits require explicit justification in the commit body
- Don't refactor an old phase while building a new one

### Gate 4: Format Validation

After writing any planning artifact, verify required frontmatter fields:

| File | Required fields |
|------|----------------|
| PLAN.md | `phase`, `plan`, `must_haves` (with `truths` and `artifacts`) |
| SUMMARY.md | `phase`, `plan`, `status`, `requires`, `key_files`, `deferred` |
| VERIFICATION.md | `phase`, `plan`, `result` (must be `PASS`, `FAIL`, `BLOCKED`, or `DEFERRED`) |

### Gate 5: State Sync

After writing SUMMARY.md or VERIFICATION.md:

1. Update `STATE.md` — set `status` to the new stage, update `updated` timestamp
2. Update `ROADMAP.md` — update the phase's `**Status:**` line to match

Both files must stay in sync. Stale state causes confusion across sessions.

---

## Stage Transition Checkpoints

Use these checklists at each stage boundary.

### Before Planning

- [ ] Read `.planning/STATE.md` — confirm current phase and status
- [ ] Read `.planning/ROADMAP.md` — confirm phase goal and dependencies
- [ ] Verify dependent phases are "Verified" before starting this phase
- [ ] Create `.planning/phases/NN-slug/` directory if it doesn't exist

### After Planning (Before Building)

- [ ] PLAN.md has valid frontmatter (Gate 4)
- [ ] `must_haves.truths` are observable facts (not implementation notes)
- [ ] `must_haves.artifacts` specify file path, minimum size, and key exports
- [ ] Update STATE.md status to "Planned"

### Before Building

- [ ] PLAN.md exists and is readable (Gate 2)
- [ ] Update STATE.md status to "Building"
- [ ] Note any pre-existing test failures — don't fix them unless the plan says to

### After Each Commit

- [ ] Commit message matches `{type}({scope}): {description}` (Gate 1)
- [ ] Only files listed in the plan's `files_modified` were staged
- [ ] The commit represents a single logical change

### After Building

- [ ] SUMMARY.md written with all required frontmatter fields (Gate 4)
- [ ] Every file listed in `key_files` exists on disk
- [ ] All commits listed in `commits` frontmatter actually exist in git log
- [ ] Update STATE.md status to "Built"
- [ ] Check `.planning/todos/pending/` — auto-close any todos satisfied by this work

### After Verification

- [ ] VERIFICATION.md written with `result: PASS` or `result: FAIL`
- [ ] Every must-have has a row in the verification table with evidence
- [ ] Update STATE.md status to "Verified"
- [ ] Update ROADMAP.md phase status to "Verified" (Gate 5)
- [ ] Suggest next phase to the user

---

## Supplementary Workflows

### Quick Tasks

For small changes that don't justify the full Plan-Build-Review cycle:

**Use quick tasks for:**
- Single-file changes
- Bug fixes with obvious solutions
- Documentation updates
- Configuration tweaks

**Use the full cycle for:**
- Changes spanning 3+ files
- New features requiring design decisions
- Anything that will take more than one commit

**Quick task structure:**

```
.planning/quick/
└── NNN-slug/
    ├── PLAN.md     # Brief: what, why, files
    └── SUMMARY.md  # What was done, commit SHA
```

Commit scope for quick tasks: `quick-NNN` (e.g., `fix(quick-001): correct typo in README`).

Quick PLAN.md only needs: one-sentence goal, files to touch, and definition of done.
Quick SUMMARY.md only needs: what was done and the commit hash.

### Milestones

Milestones group phases into versioned releases.

**ROADMAP.md milestone syntax:**

```markdown
## Milestone v1.0: Initial Release
**Phases:** 01, 02, 03
**Status:** In Progress
```

**Completing a milestone:**

1. Verify all included phases have `status: Verified`
2. Create `.planning/milestones/v{version}/`
3. Copy (archive) `ROADMAP.md` and phase directories into it
4. Create `STATS.md` with completion date, total commits, and phase count
5. Collapse the milestone section in active ROADMAP.md to a single "COMPLETED" line
6. Tag the commit: `git tag v{version}`

Archive structure:

```
.planning/milestones/v1.0/
├── ROADMAP.md        # Snapshot of roadmap at completion
├── STATS.md          # Summary stats
└── phases/
    ├── 01-setup/
    └── 02-auth/
```

### Debug Workflow

For bugs requiring systematic investigation across sessions:

**Create a debug session:**

```
.planning/debug/{slug}/
└── HYPOTHESIS.md
```

**HYPOTHESIS.md format:**

```markdown
---
bug: "Brief bug description"
created: "2025-01-15"
status: "investigating"   # investigating | confirmed | resolved
---

## Symptoms
What the user observes. Include error messages, reproduction steps.

## Hypotheses

### H1: [Hypothesis name]
**Test:** How to confirm or deny this
**Result:** (fill in after testing)
**Conclusion:** CONFIRMED / RULED OUT

### H2: [Hypothesis name]
**Test:** ...
**Result:** ...
**Conclusion:** ...

## Root Cause
(fill in when found)

## Fix Applied
(fill in after resolution — commit SHA and description)
```

Update `status` to `resolved` and record the fix. The file persists across sessions
so you never re-investigate the same root cause.

### Notes System

Capture decisions, observations, and ideas between sessions:

```
.planning/notes/{YYYY-MM-DD}-{slug}.md
```

**Note frontmatter:**

```markdown
---
date: "2025-01-15"
promoted: false
---

The note body goes here. Free-form markdown.
```

Use `promoted: true` when a note has been acted on (turned into a phase or todo).
Notes are append-only — add new files rather than editing old ones.

### Todo Management

Cross-session task backlog for items that don't yet have a phase:

```
.planning/todos/pending/{NNN}-{slug}.md   # Active
.planning/todos/done/{NNN}-{slug}.md      # Completed
```

**Todo format:**

```markdown
---
id: "001"
created: "2025-01-15"
priority: medium   # high | medium | low
---

What needs to be done and why.
```

After completing any phase or quick task, check `.planning/todos/pending/` and
move satisfied todos to `done/` by renaming the file.

### Session Continuity

Use `.planning/.continue-here.md` to preserve context between Codex sessions.

**When pausing (write `.planning/.continue-here.md`):**

```markdown
---
paused_at: "2025-01-15T16:00:00Z"
current_phase: "02-auth"
current_plan: "02-01"
---

## What Was In Progress
Which task was active, what had been done, what remained.

## Blockers
Any external dependencies or decisions needed before resuming.

## Next Action
The single most important thing to do when resuming. Be specific.

## Context Notes
Anything Codex would need to know that isn't obvious from the files.
```

**When resuming:**

1. Read `.planning/.continue-here.md` first
2. Read `STATE.md` to confirm current position
3. Execute the "Next Action" listed
4. Delete `.planning/.continue-here.md` once work resumes normally

### Brownfield Onboarding

Introducing PBR to an existing project without a `.planning/` directory:

1. **Scan the codebase** — understand the current structure, tech stack, and any existing docs
2. **Create `.planning/`** — initialize the directory structure
3. **Write ROADMAP.md** — identify logical phases based on what already exists
   - Phase 01 is often "Baseline" — mark it Verified to acknowledge existing work
   - Subsequent phases are planned work
4. **Write STATE.md** — set `current_phase` to the first active phase, status "Planning"
5. **Create PLAN.md for Phase 01 (if not trivial)** — document what exists as baseline
6. **Proceed normally** — the next feature or bug fix becomes Phase 02+

Don't try to retroactively document every historical decision. A lightweight ROADMAP.md
that captures the current state is enough to enable PBR going forward.

---

## Configuration

PBR behavior can be customized via `.codex/config.toml` in your project.
See the sample config at `plugins/codex-pbr/.codex/config.toml` for all options.

Key configuration areas:
- **Agent profiles** — model selection per PBR agent role
- **Sandbox** — which commands are allowed during builds
- **Workflow** — timeouts and context limits

---

## Working Rules for Codex

### Before Starting Any Task

1. Check if `.planning/STATE.md` exists — if so, read it to understand current position
2. Check if `.planning/ROADMAP.md` exists — if so, read it to understand phase structure
3. If the user's request maps to an existing phase, follow the Plan-Build-Review cycle
4. If no `.planning/` directory exists and the task is non-trivial, offer to create one
5. Check `.planning/.continue-here.md` — if it exists, resume from there

### During Execution

- **One task, one commit** — never bundle unrelated changes
- **Stage specific files** — never use `git add .` or `git add -A`
- **Follow the plan** — if you need to deviate, document why in SUMMARY.md
- **Update STATE.md** — keep it current as you transition between stages
- **Don't over-engineer** — build exactly what the plan specifies, nothing more

### After Completing Work

- Write SUMMARY.md documenting what was built
- Run verification against the plan's must_haves
- Write VERIFICATION.md with pass/fail results and evidence
- Update STATE.md status to "Built" or "Verified"
- Check `.planning/todos/pending/` for any todos to close
- Suggest the next logical step to the user

---

## Context Management

Codex operates in interactive CLI sessions, so context management matters:

- **Write decisions to disk** — don't rely on conversation memory
- **STATE.md is the source of truth** — always read it at task start
- **Plans are contracts** — they define what "done" means
- **Summaries close the loop** — they record what actually happened
- **Use `.continue-here.md`** — for deliberate pauses between sessions

If a task is complex enough to span multiple sessions, the
`.planning/` directory ensures continuity between them.

---

## Anti-Patterns to Avoid

1. **Building without a plan** — leads to scope creep and rework
2. **Skipping verification** — you don't know if you succeeded
3. **Giant commits** — impossible to review or revert
4. **Modifying files outside the plan's scope** — creates hidden dependencies
5. **Ignoring must_haves** — they exist to define "done" objectively
6. **Re-reading entire files when summaries exist** — wastes context
7. **Creating artifacts the user didn't approve** — always confirm first
8. **Using `git add .`** — stages unintended files; always stage explicitly
9. **Skipping STATE.md updates** — stale state causes confusion across sessions
10. **Fixing pre-existing bugs while building a phase** — log to todos, stay focused
