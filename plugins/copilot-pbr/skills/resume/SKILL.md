---
name: resume
description: "Pick up where you left off. Restores context and suggests next action."
---

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► RESUMING SESSION                           ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

# /pbr:resume — Resume Previous Session

You are running the **resume** skill. Your job is to find the last pause point, restore context for the user, and suggest the next action so they can continue seamlessly.

This skill runs **inline** (no Task delegation).

---

## Core Principle

**Get the user back to work in under 30 seconds.** Read the handoff, show what matters, and suggest the next command. Don't make them re-discover their own project state.

---

## Resumption Priority Hierarchy

When resuming, scan for conditions in this priority order. Handle the HIGHEST priority item first:

```
1. 🔴 UAT-BLOCKER (diagnosed) → Fix must come first
2. 🟡 Interrupted agent → Resume agent from checkpoint
3. 🟡 .continue-here checkpoint → Resume from checkpoint
4. 🟡 Incomplete plan → Complete plan execution
5. 🟢 Phase complete → Transition to next phase
6. 🟢 Ready to plan/execute → Normal workflow
```

### Scanning for Priority Items

Before presenting the standard resume view, check:

1. **UAT Blockers**: Search for VERIFICATION.md files with `status: gaps_found` in any phase. If found and gaps are marked as blocking, surface them first: "Phase {N} has {count} blocking verification gaps. These should be fixed before continuing."

2. **Interrupted Agents**: Check for `.checkpoint-manifest.json` files in phase directories with `checkpoints_pending` entries. These indicate a build was interrupted mid-checkpoint.

3. **Stale .continue-here.md**: If the file references commits that don't exist in git log, warn about state corruption.

### Auto-Reconcile STATE.md Against Filesystem

On every resume, reconcile STATE.md claims against filesystem reality. This catches both corruption and drift from interrupted operations.

**Step 1: Detect discrepancies** — Compare STATE.md values against the filesystem:

| STATE.md Claim | Filesystem Check |
|----------------|------------------|
| Phase number | Does `.planning/phases/{NN}-*/` exist? |
| Plan count | Count `*-PLAN.md` files in the phase directory |
| Completed plans | Count `SUMMARY.md` files in the phase directory |
| Status "verified" | Does `VERIFICATION.md` with `status: passed` exist? |
| Status "building" | Are there PLAN.md files without SUMMARY.md? |
| Progress percentage | Recalculate from completed phases / total phases |

**Step 2: Classify** — If any discrepancy found:
- **Obvious corruption** (duplicate headers, impossible percentages, phase directory missing): flag as corruption
- **Stale data** (plan count wrong, status outdated): flag as drift

**Step 3: Repair** —
- For **corruption**: Present repair and ask for confirmation: "STATE.md appears corrupted. Based on the file system, you're at Phase {N} with {M}/{T} plans complete. Should I repair STATE.md?"
- For **drift**: Auto-repair silently and note: "Updated STATE.md to match filesystem (plan count {old}→{new}, status {old}→{new})."
- Log all repairs to `.planning/logs/events.jsonl` with category `state-reconcile`

---

## Flow

### Step 1: Read STATE.md

Read `.planning/STATE.md` for the last known position.

**Extract:**
- Current phase and plan
- Session Continuity section (if exists):
  - Last paused date
  - Continue file location
  - Suggested next action

**If STATE.md doesn't exist:**
- Go to **Recovery Flow** (Step 4)

### Step 2: Search for .continue-here.md Files

Search for `.continue-here.md` files across all phase directories:

```
.planning/phases/**/.continue-here.md
```

**If exactly one found:**
- This is the resume point. Go to **Normal Resume** (Step 3a).

**If multiple found:**
Use the **pause-point-select** pattern (see `skills/shared/gate-prompts.md`):

Use AskUserQuestion:
  question: "Found multiple pause points. Which would you like to resume?"
  header: "Resume"
  options:
    - label: "Phase {A}"  description: "Paused {date}, {brief context}"
    - label: "Phase {B}"  description: "Paused {date}, {brief context}"
    - label: "Phase {C}"  description: "Paused {date}, {brief context}"
    - label: "Phase {D}"  description: "Paused {date}, {brief context}"
  multiSelect: false

Build options dynamically from discovered `.continue-here.md` files. Include phase name and pause date in each option. If more than 4 pause points exist, show the 4 most recent and replace the last option with:
  - label: "Show earlier"  description: "See older pause points"

When "Show earlier" is selected, re-prompt with the next batch of 4.

Use the selected pause point for the rest of the resume flow.

**If none found:**
- Check STATE.md for position info
- If STATE.md has position: go to **Inferred Resume** (Step 3b)
- If STATE.md has no position: go to **Recovery Flow** (Step 4)

### Step 3a: Normal Resume (from .continue-here.md)

1. Read the `.continue-here.md` file completely
2. Parse all sections:
   - Position (phase, plan, status)
   - Completed work
   - Remaining work
   - Decisions
   - Blockers
   - Next steps

3. Display the resume context using the branded banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► SESSION RESTORED ✓                         ║
╚══════════════════════════════════════════════════════════════╝

Resuming session from {pause date}

Position: Phase {N} -- {name}
Plan: {M} of {total}
Status: {status}

Completed last session:
{bulleted list of completed work}

Remaining in this phase:
{bulleted list of remaining plans}

{If decisions were made:}
Key decisions:
{bulleted list of decisions}

{If blockers exist:}
Blockers:
{bulleted list of blockers}
```

4. Validate the resume point:
   - Check that the phase directory still exists
   - Check that the plan files mentioned still exist
   - Check git log to verify commits mentioned in completed work
   - If anything is inconsistent, warn: "Some state has changed since the pause. {details}"

5. Present the next action from the continue-here file.

**If only one clear next action exists**, present it with branded routing:
```

╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**{explanation from continue-here}**

`{suggested command}`

<sub>`/clear` first → fresh context window</sub>

```

**If multiple reasonable actions exist** (e.g., the continue-here suggests one thing but the filesystem state suggests another), use the **action-routing** pattern (see `skills/shared/gate-prompts.md`):

Use AskUserQuestion:
  question: "How would you like to proceed?"
  header: "Next Step"
  options:
    - label: "{continue-here suggestion}"   description: "Resume from pause point"
    - label: "{filesystem-inferred action}"  description: "Based on current state"
    - label: "Show status"                   description: "Run /pbr:status for full overview"
    - label: "Something else"                description: "Enter a different command"
  multiSelect: false

**After user selects an option:**
- Display "Run: `/pbr:{action} {args}`" so the user can execute it
- This skill does not auto-execute — it suggests and the user acts

6. Clean up:
   - **DO NOT** delete the .continue-here.md file yet
   - It will be naturally superseded when the next pause happens
   - Or it can be manually removed after the user confirms they're back on track

### Step 3b: Inferred Resume (from STATE.md only)

When there's no .continue-here.md but STATE.md has position info:

1. Read STATE.md position
2. Scan the current phase directory for plan and summary files
3. Determine what's complete vs. remaining
4. Present a reduced resume context:

```
Resuming from STATE.md (no pause file found)

Position: Phase {N} -- {name}
Progress: {completed}/{total} plans complete

{Plans with summaries listed as complete}
{Plans without summaries listed as remaining}

Note: No detailed pause context available. Run `/pbr:status` for a full overview.
```

5. Suggest the next action based on phase state using the **action-routing** pattern:

Use AskUserQuestion:
  question: "What would you like to do next?"
  header: "Next Step"
  options: (build dynamically from phase state)
    - label: "/pbr:build {N}"       description: "Continue building (plans remaining)"
    - label: "/pbr:review {N}"      description: "Review completed phase"
    - label: "/pbr:plan {N} --gaps" description: "Fix verification gaps"
    - label: "/pbr:plan {N+1}"      description: "Plan the next phase"
  multiSelect: false

Show only the options that apply to the current state (1-3 real options + "Something else").

### Step 4: Recovery Flow

When neither .continue-here.md nor STATE.md position data exists:

1. Check if `.planning/` directory exists at all
   - If no, display:
     ```
     ╔══════════════════════════════════════════════════════════════╗
     ║  ERROR                                                       ║
     ╚══════════════════════════════════════════════════════════════╝

     No Plan-Build-Run project found.

     **To fix:** Run `/pbr:begin` to start a new project, or `/pbr:scan` to analyze an existing codebase.
     ```
   - Stop here.

2. If `.planning/` exists, scan for any project state:
   - Check for ROADMAP.md
   - Check for any phase directories
   - Check for any SUMMARY.md files
   - Check for config.json

3. If some state exists:

```
Found a Plan-Build-Run project but no pause point.

Project has:
- {count} phases in ROADMAP.md
- {count} phase directories
- {count} completed plans (SUMMARY.md files)

Attempting to determine position...
```

4. Infer position:
   - Find the last phase with SUMMARY.md files
   - Check if all plans in that phase have summaries
   - Determine the next action

5. Present recovery status:

```
Best guess for current position:

Phase {N}: {name}
- {X} of {Y} plans completed
- Last activity: {date from most recent SUMMARY.md or git log}

Suggested: Run `/pbr:status` for a full overview, then choose your next action.
```

---

## Resume Routing

After displaying context, route to the appropriate action:

| Situation | Suggested Action |
|-----------|-----------------|
| Mid-phase, plans remaining | `/pbr:build {N}` (executor will skip completed plans) |
| Phase complete, not reviewed | `/pbr:review {N}` |
| Phase reviewed, has gaps | `/pbr:plan {N} --gaps` |
| Phase complete and verified | `/pbr:plan {N+1}` |
| Between milestones | `/pbr:milestone new` |
| Active debug session | `/pbr:debug` (will offer to resume) |
| Pending todos exist | Mention: "Also {count} pending todos. `/pbr:todo list`" |

---

## State Validation

When resuming, validate that the project state is consistent:

### Git State Check

```bash
git status --short
```

If there are uncommitted changes:
- Warn: "There are uncommitted changes in the working directory."
- List the changed files
- Suggest: "These may be from an interrupted build. Review them before continuing."

### Plan-Summary Consistency

For each plan file in the current phase:
- Check if SUMMARY.md exists
- If SUMMARY.md exists, check its status field
- If status is `partial` or `failed`, warn

### Continuation Context Freshness

If .continue-here.md is more than 7 days old:
- Warn: "This pause point is {N} days old. The codebase may have changed."
- Suggest: "Run `/pbr:status` to verify the current state before continuing."

---

## Edge Cases

### .continue-here.md references deleted files
- Warn about each missing file
- Attempt to find equivalent files (renamed, moved)
- If phase directory is gone: "Phase {N} directory was removed. This pause point is invalid."
- Suggest `/pbr:status` for recovery

### Git history doesn't match .continue-here.md
- Commits referenced in the handoff may have been rebased, amended, or rolled back
- Warn: "Some commits referenced in the pause file couldn't be found in git history."
- Don't treat this as fatal — the file system state matters more than commit hashes

### User made changes between sessions (outside Plan-Build-Run)
- The user may have manually edited files, committed changes, or modified configs
- These changes won't be reflected in .continue-here.md
- Check git log for commits not referenced in the handoff
- If found: "Found {N} commits since the last pause that aren't tracked in the handoff."

### Multiple users / branches
- If git branch has changed since the pause:
  - Warn: "You're on branch `{current}` but the pause was on `{paused-branch}`."
  - Suggest switching branches or starting fresh

### Empty project (just initialized)
- If `.planning/` exists but only has config.json, display:
  ```
  ╔══════════════════════════════════════════════════════════════╗
  ║  ERROR                                                       ║
  ╚══════════════════════════════════════════════════════════════╝

  Project was initialized but no work has been done.

  **To fix:** Run `/pbr:plan 1` to start planning, or `/pbr:discuss 1` to talk through the first phase.
  ```

---

## Anti-Patterns

1. **DO NOT** auto-execute the suggested next action — just suggest it
2. **DO NOT** delete .continue-here.md during resume — let the next pause overwrite it
3. **DO NOT** modify any project files — resume is read-only (except cleaning up stale state)
4. **DO NOT** assume .continue-here.md is accurate — always validate against the file system
5. **DO NOT** show overwhelming amounts of detail — focus on actionable information
6. **DO NOT** ignore inconsistencies — surface them as warnings
7. **DO NOT** skip the git state check — uncommitted changes are important to surface
8. **DO NOT** suggest multiple actions without clear priority — one primary suggestion
