---
name: status
description: "Show current project status and suggest what to do next."
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes ~7,600 tokens. Begin executing Step 1 immediately.**

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► PROJECT STATUS                             ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

# /pbr:progress — Project Status Dashboard

You are running the **status** skill. Your job is to read the project state and present a clear, actionable status dashboard. You suggest the most logical next action based on where the project is.

This skill runs **inline** and is **read-only** — it never modifies any files.

## References

- `references/questioning.md` — Questioning philosophy (for routing intelligence)
- `references/ui-brand.md` — Status symbols, banners, progress display format

---

## Core Principle

**Show the user where they are and what to do next.** The status display should be a quick glance, not a wall of text. Surface problems and route to the right action.

---

## Flow

### Step 1: Read Project State

**Tooling shortcut**: Instead of parsing multiple files manually, you can run:
```bash
node ${PLUGIN_ROOT}/scripts/pbr-tools.js state load
```
and
```bash
node ${PLUGIN_ROOT}/scripts/pbr-tools.js state check-progress
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

     **To fix:** Run `/pbr:new-project` to start a new project, or `/pbr:map-codebase` to analyze an existing codebase.
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

### Step 1b: Read Local LLM Stats (advisory — skip on any error)

After loading config.json, check `local_llm.enabled`. If `true`:

```bash
node ${PLUGIN_ROOT}/scripts/pbr-tools.js llm status
node ${PLUGIN_ROOT}/scripts/pbr-tools.js llm metrics
```

Parse both JSON responses. Capture:

- `status.model` — model name
- `metrics.total_calls` — lifetime total calls
- `metrics.tokens_saved` — lifetime frontier tokens saved
- `metrics.cost_saved_usd` — lifetime cost estimate
- `metrics.avg_latency_ms` — lifetime average latency

Also run session-scoped metrics if `.planning/.session-start` exists:

```bash
node ${PLUGIN_ROOT}/scripts/pbr-tools.js llm metrics --session <content-of-.session-start>
```

If `local_llm.enabled` is `false` or commands fail, skip this step silently.

### Step 1c: Read Context Budget (advisory — skip on any error)

Run:
```bash
node ${PLUGIN_ROOT}/scripts/pbr-tools.js context-triage
```

Parse the JSON response. Capture:
- `tier` — one of PEAK / GOOD / DEGRADING / POOR / CRITICAL
- `percentage` — numeric 0-100 (or null if unavailable)
- `recommendation` — PROCEED / CHECKPOINT / COMPACT

Store these for use in Step 4 display and Step 5 routing.

6. **`.planning/STATE.md` ## History section** (if exists)
   - Note: milestone completions, phase completion records (consolidated from legacy HISTORY.md)
   - **Backwards compat:** If STATE.md has no ## History section but `.planning/HISTORY.md` exists, read from the legacy file

7. **`.planning/PROJECT.md` ## Context section** (if exists)
   - Note: locked decisions, user constraints, deferred ideas (consolidated from legacy CONTEXT.md)
   - **Backwards compat:** If PROJECT.md has no ## Context section but `.planning/CONTEXT.md` exists, read from the legacy file

### Step 1d: Check Project Documents

Check existence of the core project-level documents and record their status for Step 4 display:
- `.planning/PROJECT.md` — exists or not (includes ## Context section for locked decisions)
- `.planning/REQUIREMENTS.md` — exists or not

### Step 2: Scan Phase Directories

For each phase listed in ROADMAP.md:

1. Check if the phase directory exists in `.planning/phases/`
2. If exists, scan for:
   - `CONTEXT.md` — discussion happened
   - `*-PLAN.md` or `PLAN.md` files — plans exist
   - `*-SUMMARY.md` or `SUMMARY.md` files — plans were executed
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

If any discrepancy found, add: `Run /pbr:resume-work to auto-reconcile STATE.md.`

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
     - Flag: "WARN: Phase {N} plans may be stale — dependency phase {M} was re-built since planning. Consider re-planning with `/pbr:plan-phase {N}`."

#### Active Debug Sessions
- Check `.planning/debug/` for files with `status: active`
- Note any active debug sessions

#### Pending Todos
- Check `.planning/todos/pending/` for pending todo files
- Count and summarize if any exist

#### Critical Path
Identify the single next-blocking item — the one phase or plan whose completion unblocks the most downstream work.

Logic:
1. From ROADMAP.md dependency graph, find all phases that are NOT yet verified.
2. For each unverified phase, count how many other unverified phases list it in `depends_on` (direct + transitive).
3. The phase with the highest downstream dependent count is the critical-path phase.
4. If all unverified phases are independent (no dependencies between them), the critical path is the current phase from STATE.md.
5. Within the critical-path phase, the critical-path plan is the lowest-numbered plan without a SUMMARY.md.

Store: `criticalPhase` (number + name), `criticalPlan` (plan ID or null if phase not yet planned), `criticalCount` (number of downstream phases blocked).

#### Quick Notes
- Check `.planning/notes/` directory for note files (individual `.md` files)
- Count active notes (files where frontmatter does NOT contain `promoted: true`)
- Also check `~/.claude/notes/` for global notes

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

**Project documents:**
| File | Status |
|------|--------|
| PROJECT.md | {exists / not found -- run /pbr:new-project} (includes ## Context section) |
| REQUIREMENTS.md | {exists / not found -- run /pbr:new-project} |

{If context tier is DEGRADING, POOR, or CRITICAL:}
⚠ Context: {percentage}% used ({tier}) — {recommendation_text}
  Run `/compact` to reclaim context before spawning more agents.

Where `{recommendation_text}` maps:
- DEGRADING → "quality may degrade on complex agents"
- POOR → "context window is filling up"
- CRITICAL → "STOP — compact before continuing"

{If criticalPhase is identified AND criticalCount >= 1 AND there are 2+ unverified phases with dependencies:}
Critical Path: Phase {N} — {phase name}{, Plan {criticalPlan} is next} [BLOCKING {criticalCount} downstream phase(s)]
{Else: omit — not meaningful when only one phase remains or no inter-phase dependencies exist}

{If blockers exist:}
Blockers:
- {blocker 1}
- {blocker 2}

{If no blockers:}
Blockers: None

{If paused work:}
Paused: Phase {N} has a checkpoint at plan {M}. Run `/pbr:resume-work` to continue.

{If verification gaps:}
Gaps: Phase {N} verification found {count} gaps. Run `/pbr:plan-phase {N} --gaps` to address.

{If cross-phase re-planning needed:}
Warning: Phase {N} was planned before Phase {M} was built. Consider re-planning with `/pbr:plan-phase {N}`.

{If active debug sessions:}
Debug: {count} active session(s). Run `/pbr:debug` to continue.

{If pending todos:}
Todos: {count} pending. Run `/pbr:check-todos` to see them.

{If notes exist:}
Notes: {count} quick capture(s). `/pbr:note list` to review.

{If local_llm.enabled AND total_calls > 0:}
Local LLM: enabled ({model}, avg {avg_ms}ms)
This session: {session_calls} calls, ~{session_tokens} frontier tokens saved
Lifetime: {total_calls} calls, ~{tokens_saved} tokens saved (~{cost_str} at $3/M)

{If local_llm.enabled AND total_calls == 0:}
Local LLM: enabled ({model}) — no calls yet this session
```

The Local LLM block is **advisory only** — it never affects the routing decision or Next Up suggestion.

### Progress Bar

Generate a 20-character progress bar:

```
[████████████████████] 100%    (all filled)
[████████████████░░░░] 80%     (16 filled, 4 empty)
[████████░░░░░░░░░░░░] 40%     (8 filled, 12 empty)
[░░░░░░░░░░░░░░░░░░░░] 0%      (all empty)
```

Use Unicode block characters:
- Filled: `█` (full block, U+2588)
- Empty: `░` (light shade, U+2591)

### Status Indicators

Use the standardized symbol set from `references/ui-brand.md`:

| Status | Indicator |
|--------|-----------|
| Complete/Verified | `✓` |
| In Progress | `◆` |
| Not started | `○` |
| Needs fixes / Warning | `⚠` |
| Failed / Blocked | `✗` |
| Auto-approved | `⚡` |

### Step 5: Smart Routing

Based on the project state, suggest the single most logical next action:

**Decision tree:**

```
1. Is there paused work (.continue-here.md)?
   YES → "Resume your work: `/pbr:resume-work`"

2. Is there a verification with gaps?
   YES → "Fix verification gaps: `/pbr:plan-phase {N} --gaps`"

3. Is the current phase planned but not built?
   YES → "Build the current phase: `/pbr:execute-phase {N}`"

4. Is the current phase built but not reviewed?
   YES → "Review what was built: `/pbr:verify-work {N}`"

5. Is the current phase verified (complete)?
   YES → Is there a next phase?
     YES → Was next phase already planned?
       YES → Does it need re-planning? (dependency phase changed)
         YES → "Re-plan with updated context: `/pbr:plan-phase {N+1}`"
         NO → "Build the next phase: `/pbr:execute-phase {N+1}`"
       NO → "Plan the next phase: `/pbr:plan-phase {N+1}`"
     NO → Check for existing `*-MILESTONE-AUDIT.md` in `.planning/`:\n       IF audit passed → "All phases complete and audited! `/pbr:complete-milestone` to archive and tag."\n       IF audit has gaps → "Audit found gaps. `/pbr:plan-milestone-gaps` to address them."\n       IF no audit → "All phases complete! `/pbr:audit-milestone` to verify cross-phase integration (recommended), then `/pbr:complete-milestone`."

6. Is the current phase not started?
   YES → Has it been discussed?
     YES → "Plan this phase: `/pbr:plan-phase {N}`"
     NO → "Start with a discussion: `/pbr:discuss-phase {N}` or jump to `/pbr:plan-phase {N}`"

7. Active debug sessions?
   YES → "Continue debugging: `/pbr:debug`"

8. Pending notes to review?
   YES → "Review notes: `/pbr:note list`"

9. Nothing active?
   → "Start your project: `/pbr:new-project`"

Other skills available for routing:
- `/pbr:explore` — open-ended idea exploration
- `/pbr:note` — zero-friction idea capture
- `/pbr:debug` — systematic debugging
- `/pbr:import` — import external plans
```

**If only one reasonable next action exists**, present it with branded routing:

```


╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**{brief explanation}**

`{suggested command}`

{If context percentage > 40% OR tier is DEGRADING/POOR/CRITICAL:}
<sub>`/clear` first → fresh context window ({percentage}% used)</sub>
{Else: omit the /clear hint entirely}
{If `percentage` is null (no context data): omit the hint}


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
- If they selected a real action: display "Run: `/pbr:{action} {args}`" so they can execute it
- If they selected "Something else": ask what they'd like to do (freeform text)
- This skill remains read-only — display the command, do not execute it

---

## Edge Cases

### No `.planning/` directory at all
- Display: "No Plan-Build-Run project found."
- Suggest: `/pbr:new-project` to start a new project
- Also mention: `/pbr:map-codebase` if there's an existing codebase to analyze first

### STATE.md exists but is outdated
- STATE.md may not reflect the actual file system state
- Always verify by scanning phase directories
- If STATE.md disagrees with the file system, note the discrepancy:
  "Note: STATE.md says Phase 2 is in progress, but all plans have summaries. Status may need updating."

### All phases complete
- Celebrate briefly: "All phases complete!"
- Check for existing audit report: look for `*-MILESTONE-AUDIT.md` in `.planning/`
  - **If audit exists and passed:** Suggest `/pbr:complete-milestone` to archive (audit already done)
  - **If audit exists with gaps:** Suggest `/pbr:plan-milestone-gaps` to address issues
  - **If no audit exists:** Suggest `/pbr:audit-milestone` to verify cross-phase integration (recommended first)
- Then: `/pbr:complete-milestone` to archive the milestone and tag it
- Or: `/pbr:new-milestone` to start the next set of features

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
- Run Bash commands except for Step 1b (`pbr-tools llm` calls only when `local_llm.enabled: true`) and Step 1c (`pbr-tools context-triage`, always run but skip on error)
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
