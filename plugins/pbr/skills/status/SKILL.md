---
name: status
description: "Show current project status and suggest what to do next."
allowed-tools: Read, Glob, Grep, AskUserQuestion
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes ~7,600 tokens. Begin executing Step 1 immediately.**

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PLAN-BUILD-RUN ► PROJECT STATUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Then proceed to Step 1.

# /pbr:status — Project Status Dashboard

You are running the **status** skill. Your job is to read the project state and present a clear, actionable status dashboard. You suggest the most logical next action based on where the project is.

This skill runs **inline** and is **read-only** — it never modifies any files.

---

## Core Principle

**Show the user where they are and what to do next.** The status display should be a quick glance, not a wall of text. Surface problems and route to the right action.

---

## Flow

### Step 1: Read Project State

**Tooling shortcut**: Instead of parsing multiple files manually, you can run:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state load
```
and
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state check-progress
```
These return structured JSON with config, state, roadmap, and filesystem-verified progress. Falls back gracefully if the script is missing — parse files manually in that case.

Read the following files (skip any that don't exist):

1. **`.planning/config.json`** — Project settings
   - If this doesn't exist, display:
     ```
     ╔══════════════════════════════════════════════════════════════╗
     ║  ERROR                                                       ║
     ╚══════════════════════════════════════════════════════════════╝

     No Plan-Build-Run project found.

     **To fix:** Run `/pbr:begin` to start a new project, or `/pbr:scan` to analyze an existing codebase.
     ```
   - Stop here if no project found.

2. **`.planning/STATE.md`** — Current position, progress, blockers
   - Extract: current phase, current plan, overall progress, blockers, session info

3. **`.planning/ROADMAP.md`** — Phase overview
   - Extract: all phases with names, descriptions, status indicators

4. **`.planning/PROJECT.md`** — Project metadata (if exists)
   - Extract: project name, milestone info

5. **`.planning/REQUIREMENTS.md`** — Requirements (if exists)
   - Extract: requirement completion status if tracked

### Step 2: Scan Phase Directories

For each phase listed in ROADMAP.md:

1. Check if the phase directory exists in `.planning/phases/`
2. If exists, scan for:
   - `CONTEXT.md` — discussion happened
   - `PLAN-*.md` or plan files — plans exist
   - `SUMMARY-*.md` or summary files — plans were executed
   - `VERIFICATION.md` — phase was reviewed
   - `.continue-here.md` — paused work

3. Calculate phase status:

| Condition | Status |
|-----------|--------|
| No directory | Not started |
| Directory exists, no plans | Discussed only |
| Plans exist, no summaries | Planned (ready to build) |
| Some summaries, not all | Building (in progress) |
| All summaries exist | Built (ready to review) |
| VERIFICATION.md exists, status=passed | Verified (complete) |
| VERIFICATION.md exists, status=gaps_found | Needs fixes |

4. Calculate progress percentage:
   - Count total plans across all phases
   - Count plans with SUMMARY.md (status=completed)
   - Progress = completed / total * 100

### Step 2b: Check STATE.md Size and Consistency

Count lines in `.planning/STATE.md`. If over 150 lines, add a warning to the dashboard:
```
Warning: STATE.md is {N} lines (limit: 150). Run any build/review command to auto-compact it.
```

**Discrepancy check:** Compare STATE.md phase/plan/status claims against the filesystem:
- Does the phase directory exist? If not: `Warning: STATE.md references Phase {N} but no directory exists.`
- Does the plan count match? If not: `Warning: STATE.md says {X} plans but filesystem has {Y}.`
- Does the status match? If STATE.md says "verified" but no `VERIFICATION.md` exists: `Warning: STATE.md says "verified" but no VERIFICATION.md found.`

If any discrepancy found, add: `Run /pbr:resume to auto-reconcile STATE.md.`

### Step 3: Check for Special Conditions

#### Paused Work
- Search for `.continue-here.md` files in `.planning/phases/`
- If found: note the phase and brief description of where work stopped

#### Verification Gaps
- Search for `VERIFICATION.md` files with `gaps_found` status
- If found: note which phases have gaps

#### Cross-Phase Re-Planning Check
- For each planned phase, check if its dependency phases have been built yet
- Logic:
  1. Read ROADMAP.md to find phase dependencies (phases that come before)
  2. If Phase N has plans but Phase N-1 doesn't have summaries (wasn't built yet):
     - This means Phase N was planned without knowledge of what Phase N-1 actually produced
     - Flag for re-planning
- **Dependency fingerprint check**: For each planned phase with `dependency_fingerprints` in plan frontmatter:
  1. Compare the fingerprints against current dependency SUMMARY.md files
  2. If any fingerprint is stale (dependency was re-built after the plan was created):
     - Flag: "WARN: Phase {N} plans may be stale — dependency phase {M} was re-built since planning. Consider re-planning with `/pbr:plan {N}`."

#### Active Debug Sessions
- Check `.planning/debug/` for files with `status: active`
- Note any active debug sessions

#### Pending Todos
- Check `.planning/todos/pending/` for pending todo files
- Count and summarize if any exist

#### Quick Notes
- Check `.planning/NOTES.md` for active note entries
- Count active notes (lines matching `^- \[` that don't contain `[promoted]`)
- Also check `~/.claude/notes.md` for global notes

#### Quick Tasks
- Check `.planning/quick/` for recent quick tasks
- Note any failed or partial quick tasks

### Step 4: Display Status Dashboard

Present the status in this format:

```
Project: {name from PROJECT.md or config.json}
Phase: {current} of {total} -- {current phase name}
Progress: [{progress bar}] {percentage}%

Phase Status:
| Phase | Status | Plans | Progress |
|-------|--------|-------|----------|
| 1. {name} | {status indicator} {status text} | {completed}/{total} | {percentage}% |
| 2. {name} | {status indicator} {status text} | {completed}/{total} | {percentage}% |
| ...

{If blockers exist:}
Blockers:
- {blocker 1}
- {blocker 2}

{If no blockers:}
Blockers: None

{If paused work:}
Paused: Phase {N} has a checkpoint at plan {M}. Run `/pbr:resume` to continue.

{If verification gaps:}
Gaps: Phase {N} verification found {count} gaps. Run `/pbr:plan {N} --gaps` to address.

{If cross-phase re-planning needed:}
Warning: Phase {N} was planned before Phase {M} was built. Consider re-planning with `/pbr:plan {N}`.

{If active debug sessions:}
Debug: {count} active session(s). Run `/pbr:debug` to continue.

{If pending todos:}
Todos: {count} pending. Run `/pbr:todo list` to see them.

{If notes exist:}
Notes: {count} quick capture(s). `/pbr:note list` to review.
```

### Progress Bar

Generate a 20-character progress bar:

```
[####################] 100%    (all filled)
[################....] 80%     (16 filled, 4 empty)
[########............] 40%     (8 filled, 12 empty)
[....................] 0%      (all empty)
```

Use the Unicode block characters from the UI formatting reference:
- Filled: block character
- Empty: light shade

### Status Indicators

Use indicators from `references/ui-formatting.md`:

| Status | Indicator |
|--------|-----------|
| Complete/Verified | checkmark |
| In Progress | half-filled circle |
| Not started | empty circle |
| Needs fixes | warning triangle |
| Blocked | blocked symbol |

### Step 5: Smart Routing

Based on the project state, suggest the single most logical next action:

**Decision tree:**

```
1. Is there paused work (.continue-here.md)?
   YES → "Resume your work: `/pbr:resume`"

2. Is there a verification with gaps?
   YES → "Fix verification gaps: `/pbr:plan {N} --gaps`"

3. Is the current phase planned but not built?
   YES → "Build the current phase: `/pbr:build {N}`"

4. Is the current phase built but not reviewed?
   YES → "Review what was built: `/pbr:review {N}`"

5. Is the current phase verified (complete)?
   YES → Is there a next phase?
     YES → Was next phase already planned?
       YES → Does it need re-planning? (dependency phase changed)
         YES → "Re-plan with updated context: `/pbr:plan {N+1}`"
         NO → "Build the next phase: `/pbr:build {N+1}`"
       NO → "Plan the next phase: `/pbr:plan {N+1}`"
     NO → "All phases complete! Your next steps:\n       -> /pbr:milestone audit — verify cross-phase integration (recommended)\n       -> /pbr:milestone complete — archive this milestone and create a git tag\n       -> /pbr:milestone new — start planning the next set of features"

6. Is the current phase not started?
   YES → Has it been discussed?
     YES → "Plan this phase: `/pbr:plan {N}`"
     NO → "Start with a discussion: `/pbr:discuss {N}` or jump to `/pbr:plan {N}`"

7. Active debug sessions?
   YES → "Continue debugging: `/pbr:debug`"

8. Nothing active?
   → "Start your project: `/pbr:begin`"
```

**If only one reasonable next action exists**, present it with branded routing:

```
───────────────────────────────────────────────────────────────

## ▶ Next Up

**{brief explanation}**

`{suggested command}`

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────
```

**If multiple reasonable next actions exist** (2-3 alternatives), use the **action-routing** pattern (see `skills/shared/gate-prompts.md`):

Use AskUserQuestion:
  question: "What would you like to do next?"
  header: "Next Step"
  options:
    - label: "{primary action}"    description: "{brief explanation}"
    - label: "{alternative 1}"     description: "{brief explanation}"
    - label: "{alternative 2}"     description: "{brief explanation}"
    - label: "Something else"      description: "Enter a different command"
  multiSelect: false

Build options dynamically from the decision tree results. Always include "Something else" as the last option. Generate 1-3 real options based on the state analysis.

**After user selects an option:**
- If they selected a real action: display "Run: `/dev:{action} {args}`" so they can execute it
- If they selected "Something else": ask what they'd like to do (freeform text)
- This skill remains read-only — display the command, do not execute it

---

## Edge Cases

### No `.planning/` directory at all
- Display: "No Plan-Build-Run project found."
- Suggest: `/pbr:begin` to start a new project
- Also mention: `/pbr:scan` if there's an existing codebase to analyze first

### STATE.md exists but is outdated
- STATE.md may not reflect the actual file system state
- Always verify by scanning phase directories
- If STATE.md disagrees with the file system, note the discrepancy:
  "Note: STATE.md says Phase 2 is in progress, but all plans have summaries. Status may need updating."

### All phases complete
- Celebrate briefly: "All phases complete!"
- Suggest: `/pbr:milestone audit` to verify cross-phase integration (recommended first)
- Then: `/pbr:milestone complete` to archive the milestone and tag it
- Or: `/pbr:milestone new` to start the next set of features

### ROADMAP.md has phases but no phase directories
- This is normal for future phases
- Show them as "Not started" with no plan counts

### Multiple milestones
- If PROJECT.md shows multiple milestones, display the current one
- Show completed milestones as collapsed summary

### Large project (many phases)
- If more than 8 phases, consider grouping:
  - Completed phases: collapsed summary
  - Current phase: full detail
  - Upcoming phases: brief list

---

## Performance

This skill should be fast. It's a status check, not an analysis.

**DO:**
- Read files quickly (frontmatter only where possible)
- Use Glob to find files efficiently
- Cache nothing (always read fresh state)

**DO NOT:**
- Read full SUMMARY.md contents (frontmatter is enough)
- Read plan file contents (just check existence)
- Run any Bash commands
- Modify any files
- Spawn any Task agents

---

## Anti-Patterns

1. **DO NOT** modify any files — this is read-only
2. **DO NOT** run Bash commands — use Read and Glob only
3. **DO NOT** show overwhelming detail — keep it scannable
4. **DO NOT** hide problems — surface blockers, gaps, and warnings prominently
5. **DO NOT** suggest multiple actions without prioritizing — the primary suggestion should be clear
6. **DO NOT** re-read full file contents when frontmatter is sufficient
7. **DO NOT** show completed phases in full detail unless specifically relevant
8. **DO NOT** execute the suggested action — present it for the user to run manually. Use /pbr:continue for auto-execution.
