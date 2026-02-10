---
name: resume
description: "Pick up where you left off. Restores context and suggests next action."
allowed-tools: Read, Write, Glob, Grep
---

# /dev:resume — Resume Previous Session

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
- Present to user via AskUserQuestion:
  ```
  Found multiple pause points:
  1. Phase {A} -- paused {date}
  2. Phase {B} -- paused {date}

  Which would you like to resume?
  ```
- Use the selected one.

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

3. Display the resume context:

```
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

5. Present the next action from the continue-here file:

```
Next step:
--> {suggested command} -- {explanation from continue-here}
```

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

Note: No detailed pause context available. Run `/dev:status` for a full overview.
```

5. Suggest the next action based on phase state:
   - Incomplete plans exist: `/dev:build {N}`
   - All plans complete, no verification: `/dev:review {N}`
   - Verification exists with gaps: `/dev:plan {N} --gaps`
   - Phase complete: `/dev:plan {N+1}`

### Step 4: Recovery Flow

When neither .continue-here.md nor STATE.md position data exists:

1. Check if `.planning/` directory exists at all
   - If no: "No Towline project found. Run `/dev:begin` to start a new project, or `/dev:scan` to analyze an existing codebase."
   - Stop here.

2. If `.planning/` exists, scan for any project state:
   - Check for ROADMAP.md
   - Check for any phase directories
   - Check for any SUMMARY.md files
   - Check for config.json

3. If some state exists:

```
Found a Towline project but no pause point.

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

Suggested: Run `/dev:status` for a full overview, then choose your next action.
```

---

## Resume Routing

After displaying context, route to the appropriate action:

| Situation | Suggested Action |
|-----------|-----------------|
| Mid-phase, plans remaining | `/dev:build {N}` (executor will skip completed plans) |
| Phase complete, not reviewed | `/dev:review {N}` |
| Phase reviewed, has gaps | `/dev:plan {N} --gaps` |
| Phase complete and verified | `/dev:plan {N+1}` |
| Between milestones | `/dev:milestone new` |
| Active debug session | `/dev:debug` (will offer to resume) |
| Pending todos exist | Mention: "Also {count} pending todos. `/dev:todo list`" |

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
- Suggest: "Run `/dev:status` to verify the current state before continuing."

---

## Edge Cases

### .continue-here.md references deleted files
- Warn about each missing file
- Attempt to find equivalent files (renamed, moved)
- If phase directory is gone: "Phase {N} directory was removed. This pause point is invalid."
- Suggest `/dev:status` for recovery

### Git history doesn't match .continue-here.md
- Commits referenced in the handoff may have been rebased, amended, or rolled back
- Warn: "Some commits referenced in the pause file couldn't be found in git history."
- Don't treat this as fatal — the file system state matters more than commit hashes

### User made changes between sessions (outside Towline)
- The user may have manually edited files, committed changes, or modified configs
- These changes won't be reflected in .continue-here.md
- Check git log for commits not referenced in the handoff
- If found: "Found {N} commits since the last pause that aren't tracked in the handoff."

### Multiple users / branches
- If git branch has changed since the pause:
  - Warn: "You're on branch `{current}` but the pause was on `{paused-branch}`."
  - Suggest switching branches or starting fresh

### Empty project (just initialized)
- If `.planning/` exists but only has config.json:
  - "Project was initialized but no work has been done."
  - Suggest: `/dev:plan 1` or `/dev:discuss 1`

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
