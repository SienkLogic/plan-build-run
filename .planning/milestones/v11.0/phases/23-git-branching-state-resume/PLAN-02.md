---
phase: "23-git-branching-state-resume"
plan: "23-02"
type: "feature"
wave: 1
depends_on: []
speculative: true
autonomous: true
discovery: 1
gap_closure: false
files_modified:
  - "plugins/pbr/skills/resume/SKILL.md"
must_haves:
  truths:
    - "/pbr:resume detects .autonomous-state.json and offers to continue the autonomous run from the last completed phase"
    - "Resume displays prior autonomous run summary (phases done, current phase, branch) before the normal resume flow"
  artifacts:
    - "plugins/pbr/skills/resume/SKILL.md: Step 1b or equivalent adds autonomous state detection block"
    - "plugins/pbr/skills/resume/SKILL.md: AskUserQuestion offer to continue autonomous run with /pbr:autonomous --from {N}"
  key_links:
    - "resume reads .planning/.autonomous-state.json to extract current_phase, completed_phases, branch_state"
    - "resume routes to /pbr:autonomous --from {N} when user accepts"
provides:
  - "autonomous run continuation via /pbr:resume"
  - "autonomous state surface in resume display"
consumes:
  - ".autonomous-state.json schema (branch_state, current_phase, completed_phases from Plan 23-01)"
implements: []
---

<task id="23-02-T1" type="auto" tdd="false" complexity="medium">
<name>Add autonomous state detection to resume skill with offer to continue</name>
<read_first>plugins/pbr/skills/resume/SKILL.md</read_first>
<files>plugins/pbr/skills/resume/SKILL.md</files>
<action>
1. Open `plugins/pbr/skills/resume/SKILL.md`.

2. Locate **Step 1b: Check for HANDOFF.json and WAITING.json**. After the WAITING.json block (end of Step 1b), ADD a new sub-section titled **Autonomous State Detection**. Place it as the last sub-section within Step 1b.

3. The new sub-section text:

   ```markdown
   #### Autonomous State (.autonomous-state.json)

   Check if `.planning/.autonomous-state.json` exists:
   - If found, parse it and extract:
     - `current_phase` — the phase the autonomous run was on when interrupted
     - `completed_phases` — list of phases already completed
     - `branch_state` — map of phase -> branch name (may be empty `{}`)
     - `started_at` — when the run began
     - `failed_phase` / `error` — whether the run failed vs. was interrupted
   - Display a summary block:
     ```
     Autonomous Run Detected
     Started: {started_at}
     Completed phases: {completed_phases list, or "none"}
     Current phase: {current_phase}
     {If branch_state non-empty:}
     Active branch: {branch for current_phase, if present}
     {If failed_phase non-null:}
     Failed at phase: {failed_phase} — {error}
     ```
   - Use AskUserQuestion to offer resumption:
     ```
     Use AskUserQuestion:
       question: "An autonomous run was interrupted at Phase {current_phase}. Continue it?"
       header: "Autonomous Resume"
       options:
         - label: "Continue autonomous run from Phase {current_phase}"
           description: "Run /pbr:autonomous --from {current_phase}"
         - label: "Resume manually (normal resume flow)"
           description: "Continue with the standard resume process"
         - label: "Discard autonomous state"
           description: "Delete .autonomous-state.json and start fresh"
       multiSelect: false
     ```
   - If user selects **Continue autonomous run**: display `Run: /pbr:autonomous --from {current_phase}` and stop (do not proceed with normal resume flow)
   - If user selects **Resume manually**: proceed with normal resume flow (Step 2 onward), keep .autonomous-state.json intact
   - If user selects **Discard autonomous state**: delete `.planning/.autonomous-state.json`, then proceed with normal resume flow
   - If `.autonomous-state.json` does NOT exist: skip this block entirely, proceed with Step 2
   ```

4. Also update the **Resume Routing** table at the bottom of the skill. Add a new row:

   | Autonomous run interrupted | `/pbr:autonomous --from {N}` |

   Place it as the first row in the table (highest priority routing situation).

5. Do NOT modify any other sections. Preserve all existing Step 1b content (HANDOFF.json, WAITING.json sub-sections).
</action>
<acceptance_criteria>
grep -c "autonomous-state" plugins/pbr/skills/resume/SKILL.md
grep -c "Autonomous Run Detected" plugins/pbr/skills/resume/SKILL.md
grep -c "autonomous.*from" plugins/pbr/skills/resume/SKILL.md
grep -c "Autonomous State" plugins/pbr/skills/resume/SKILL.md
</acceptance_criteria>
<verify>
grep -n "autonomous-state" plugins/pbr/skills/resume/SKILL.md
grep -n "Autonomous" plugins/pbr/skills/resume/SKILL.md
npx markdownlint-cli2 "plugins/pbr/skills/resume/SKILL.md" 2>&1 | tail -5
</verify>
<done>resume/SKILL.md Step 1b has an Autonomous State Detection sub-section that reads .autonomous-state.json, shows a summary, and offers AskUserQuestion with three options (continue/manual/discard). Resume Routing table has autonomous row. markdownlint passes.</done>
</task>

## Summary

**Plan:** 23-02 | **Wave:** 1

**Tasks:**
1. T1 — Add autonomous state detection to resume skill with AskUserQuestion offer to continue autonomous run

**Key files:** `plugins/pbr/skills/resume/SKILL.md`

**Must-haves:**
- `/pbr:resume` detects `.autonomous-state.json` and offers to continue from last phase
- AskUserQuestion with continue/manual/discard options

**Provides:** Autonomous run continuation via /pbr:resume
**Consumes:** .autonomous-state.json schema (branch_state, current_phase from Plan 23-01)
