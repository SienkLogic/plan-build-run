---
name: pause
description: "Save your current session state for later resumption."
allowed-tools: Read, Write, Bash, Glob
---

# /dev:pause — Save Session State

You are running the **pause** skill. Your job is to capture the current session state so the user can resume exactly where they left off in a future conversation. This creates a `.continue-here.md` handoff file with everything the next session needs.

This skill runs **inline** (no Task delegation).

---

## Core Principle

**Capture everything the next session needs to hit the ground running.** The resume skill will read this file cold, with zero prior context. Write it as if you're handing off to a colleague who has never seen this project.

---

## Flow

### Step 1: Read Current State

Read the following files to understand where things stand:

1. **`.planning/STATE.md`** — Current position
   - Extract: current phase, current plan, progress, blockers
   - If STATE.md doesn't exist: "No Towline project state found. Nothing to pause."

2. **`.planning/config.json`** — Project settings
   - Extract: project name, feature toggles

3. **`.planning/ROADMAP.md`** — Phase overview
   - Extract: current phase name, total phases

### Step 2: Determine Current Phase Directory

From STATE.md, get the current phase number and find its directory:
1. List directories in `.planning/phases/`
2. Match the current phase number to a directory
3. If no match: use the most recently modified phase directory

### Step 3: Gather Session State

Collect the following information:

#### Current Position
- Phase number and name
- Plan number (if mid-phase) or "between plans"
- Status: in-progress, between-plans, between-phases, planning, reviewing

#### Work Completed This Session
Scan the current phase directory for SUMMARY.md files:
- Read each SUMMARY.md frontmatter
- Note which ones were created/modified recently (check timestamps or git log)
- For recently completed plans: extract the plan name and brief status

Also check git log for recent commits:
```bash
git log --oneline -20 --since="8 hours ago"
```
This gives a reasonable window for "this session's work."

#### Remaining Work
Scan for plan files without corresponding SUMMARY.md files:
- These are plans that haven't been executed yet
- List them with brief descriptions from their frontmatter

#### Key Decisions Made
Check for:
- Recent CONTEXT.md files (from `/dev:discuss`)
- Key decisions in recent SUMMARY.md files
- Any deviations noted in summaries

#### Blockers or Concerns
From STATE.md blockers section and any:
- Failed verifications
- Checkpoint stops
- Active debug sessions
- Unresolved issues noted in summaries

#### What to Do Next
Determine the logical next action (same routing logic as `/dev:status`):
- If mid-plan execution: "Continue building phase N"
- If between plans in a phase: "Execute next plan (plan M)"
- If phase complete, not reviewed: "Review phase N"
- If phase reviewed, has gaps: "Fix gaps in phase N"
- If phase complete: "Plan phase N+1"

### Step 4: Write .continue-here.md

Write the handoff file to the current phase directory:

**Path:** `.planning/phases/{NN}-{phase-name}/.continue-here.md`

**Content:**

```markdown
# Continue Here

**Paused:** {ISO datetime}
**Session duration:** ~{estimated hours} (based on git log timestamps)

## Position

Phase: {N} -- {name}
Plan: {M} of {total} (or "between plans" / "phase complete")
Status: {in-progress / between-plans / reviewing / planning}

## Completed This Session

{List of work done, with commit references where available}

- Plan {A}: {summary} (commit: {short hash})
- Plan {B}: {summary} (commit: {short hash})
- Quick task: {description} (commit: {short hash})

{If nothing was completed:}
- No plans completed this session (discussion/planning only)

## Remaining

{What still needs to be done in this phase}

- Plan {C}: {brief description from plan frontmatter}
- Plan {D}: {brief description from plan frontmatter}

{If phase is complete:}
- Phase {N} is complete. Next: {review or next phase}

## Decisions Made

{Key decisions from this session that affect future work}

- {decision 1}: {brief description}
- {decision 2}: {brief description}

{If no notable decisions:}
- No major decisions this session

## Blockers

{Any issues preventing progress}

- {blocker description}

{If no blockers:}
- None

## Context Notes

{Any additional context that would help the next session}

- {note about something tricky}
- {note about something to watch out for}
- {note about user preferences expressed during this session}

## Next Steps

{Ordered list of what to do when resuming}

1. {Specific first action with command}
2. {Following action}
3. {And so on}
```

### Step 5: Update STATE.md

Update the Session Continuity section of STATE.md:

```markdown
### Session Continuity

**Last paused:** {ISO datetime}
**Position:** Phase {N}, Plan {M}
**Continue file:** .planning/phases/{NN}-{phase-name}/.continue-here.md
**Next action:** {suggested command}
```

If the Session Continuity section doesn't exist, create it at the end of STATE.md.

### Step 6: Commit as WIP

If `planning.commit_docs: true` in config.json:

```bash
git add .planning/phases/{NN}-{phase-name}/.continue-here.md
git add .planning/STATE.md
git commit -m "wip: pause at phase {N} plan {M}"
```

**Commit rules:**
- Always use `wip:` prefix for pause commits
- Include phase and plan numbers
- Stage only the continue-here and STATE.md files
- Do NOT stage any code changes (those should already be committed by the executor)

### Step 7: Confirm to User

Display confirmation:

```
Session saved.

Position: Phase {N} -- {phase name}, Plan {M}
Completed: {count} plans this session
Remaining: {count} plans in this phase
Next: {suggested action}

Run `/dev:resume` in your next session to continue.
```

---

## What Gets Captured

| Information | Source | Why It Matters |
|-------------|--------|---------------|
| Phase + plan position | STATE.md | Know where to start |
| Completed work | SUMMARY.md files, git log | Know what's already done |
| Remaining work | Plan files without summaries | Know what's left |
| Decisions | CONTEXT.md, SUMMARY.md | Preserve user preferences |
| Blockers | STATE.md, verification files | Don't repeat failed approaches |
| Next steps | Routing logic | Immediate action on resume |

---

## Edge Cases

### No work was done this session
- Still write the continue-here file
- "Completed This Session" section says: "No plans completed (discussion/planning only)"
- Capture any decisions or context from the conversation

### Multiple phases were worked on
- Write .continue-here.md in the MOST RECENT phase directory
- Reference the other phases in the "Completed This Session" section
- Next steps should focus on the current position

### Mid-task pause (executor was interrupted)
- Note which task was in progress
- Warn: "Task {name} was in progress when paused. It may need to be re-executed."
- Check git log to see if any partial commits exist

### .continue-here.md already exists
- Read the existing one
- Ask user via AskUserQuestion: "A previous pause point exists (from {date}). Overwrite with current state?"
- If yes: overwrite
- If no: append as "Amendment" section

### STATE.md doesn't exist
- Warn: "No STATE.md found. Creating a minimal pause file."
- Write .continue-here.md based on git log and file system scan only
- Don't try to update STATE.md

### No git history (fresh project)
- Skip the git log step
- Estimate session work from file modification times
- Still write the continue-here file

---

## Anti-Patterns

1. **DO NOT** include full file contents in .continue-here.md — keep it concise
2. **DO NOT** stage code files in the WIP commit — only planning docs
3. **DO NOT** skip the commit — the WIP commit is how `/dev:resume` finds the pause point
4. **DO NOT** write multiple .continue-here.md files — one per pause
5. **DO NOT** include sensitive information (API keys, passwords) in the handoff
6. **DO NOT** overwrite .continue-here.md without asking
7. **DO NOT** modify any code files — this skill only writes planning docs
8. **DO NOT** skip the "Next Steps" section — it's the most important part for resumption
