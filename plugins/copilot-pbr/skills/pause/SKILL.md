---
name: pause
description: "Save your current session state for later resumption."
---

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PLAN-BUILD-RUN ► PAUSING SESSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Then proceed to Step 1.

# /pbr:pause — Save Session State

You are running the **pause** skill. Your job is to capture the current session state so the user can resume exactly where they left off in a future conversation. This creates a `.continue-here.md` handoff file with everything the next session needs.

This skill runs **inline** (no Task delegation).

---

## Core Principle

**Capture everything the next session needs to hit the ground running.** The resume skill will read this file cold, with zero prior context. Write it as if you're handing off to a colleague who has never seen this project.

---

## Flow

### Step 1: Read Current State

**Flag: `--checkpoint`**

If `$ARGUMENTS` contains `--checkpoint`:
- Perform a lightweight state dump without full session analysis
- Write a minimal .continue-here.md with just: Position, git status, and suggested next action
- Skip the detailed "Completed This Session" analysis (saves time)
- Useful for quick manual checkpoints at any point

Read the following files to understand where things stand:

1. **`.planning/STATE.md`** — Current position
   - Extract: current phase, current plan, progress, blockers
   - If STATE.md doesn't exist, display:
     ```
     ╔══════════════════════════════════════════════════════════════╗
     ║  ERROR                                                       ║
     ╚══════════════════════════════════════════════════════════════╝

     No Plan-Build-Run project state found. Nothing to pause.

     **To fix:** Run `/pbr:begin` to initialize a project first.
     ```

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
- Recent CONTEXT.md files (from `/pbr:discuss`)
- Key decisions in recent SUMMARY.md files
- Any deviations noted in summaries

#### Blockers or Concerns
From STATE.md blockers section and any:
- Failed verifications
- Checkpoint stops
- Active debug sessions
- Unresolved issues noted in summaries

#### What to Do Next
Determine the logical next action (same routing logic as `/pbr:status`):
- If mid-plan execution: "Continue building phase N"
- If between plans in a phase: "Execute next plan (plan M)"
- If phase complete, not reviewed: "Review phase N"
- If phase reviewed, has gaps: "Fix gaps in phase N"
- If phase complete: "Plan phase N+1"

### Step 4: Write .continue-here.md

**CRITICAL: Write pause state NOW before displaying confirmation. Do NOT skip this step.**

Write the handoff file to the current phase directory:

**Path:** `.planning/phases/{NN}-{phase-name}/.continue-here.md`

**Content:**

Read `skills/pause/templates/continue-here.md.tmpl` for the handoff file format. Fill in all `{variable}` placeholders with actual session data gathered in Steps 1-3.

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

Reference: `skills/shared/commit-planning-docs.md` for the standard commit pattern.

If `planning.commit_docs: true` in config.json:

```bash
git add .planning/phases/{NN}-{phase-name}/.continue-here.md
git add .planning/STATE.md
git commit -m "wip(planning): save session state — phase {N} plan {M}"
```

**Commit rules:**
- Always use `wip(planning):` prefix for pause commits
- Include phase and plan numbers
- Stage only the continue-here and STATE.md files
- Do NOT stage any code changes (those should already be committed by the executor)

### Step 7: Confirm to User

Display branded confirmation:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PLAN-BUILD-RUN ► SESSION SAVED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Position: Phase {N} — {phase name}, Plan {M}
Completed: {count} plans this session
Remaining: {count} plans in this phase

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Resume in your next session**

`/pbr:resume`

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────
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
- **Always REPLACE** the existing file entirely — never append
- Appending causes stale data from previous sessions to persist, which confuses resume
- The old .continue-here.md content is superseded by the current state
- No need to ask the user — the current session state is always more accurate

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
3. **DO NOT** skip the commit when `planning.commit_docs` is enabled — the WIP commit preserves the pause state in version control and ensures `.continue-here.md` is not lost if working tree changes occur
4. **DO NOT** write multiple .continue-here.md files — one per pause
5. **DO NOT** include sensitive information (API keys, passwords) in the handoff
6. **DO NOT** modify any code files — this skill only writes planning docs
7. **DO NOT** skip the "Next Steps" section — it's the most important part for resumption
