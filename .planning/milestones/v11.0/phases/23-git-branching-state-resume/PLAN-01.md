---
phase: "23-git-branching-state-resume"
plan: "23-01"
type: "feature"
wave: 1
depends_on: []
speculative: true
autonomous: true
discovery: 1
gap_closure: false
files_modified:
  - "plugins/pbr/skills/autonomous/SKILL.md"
must_haves:
  truths:
    - "When git.branching is 'phase', autonomous Step 3e creates pbr/phase-{NN}-{slug} branch from HEAD before each build"
    - ".autonomous-state.json tracks branch_state (phase->branch name) and speculative_plan_paths (phase->path list)"
  artifacts:
    - "plugins/pbr/skills/autonomous/SKILL.md: Step 3e includes git branch creation block guarded by git.branching check"
    - "plugins/pbr/skills/autonomous/SKILL.md: Error Recovery section shows branch_state and speculative_plan_paths fields"
  key_links:
    - "Step 3e reads git.branching from config before running git checkout -b"
    - ".autonomous-state.json branch_state written by Step 3e is readable by resume skill (Plan 23-02)"
provides:
  - "git.branching phase support in autonomous skill"
  - "branch_state tracking in .autonomous-state.json"
  - "speculative_plan_paths tracking in .autonomous-state.json"
consumes:
  - "git.phase_branch_template config key (default: pbr/phase-{phase}-{slug})"
implements: []
---

<task id="23-01-T1" type="auto" tdd="false" complexity="medium">
<name>Add git branch creation to autonomous Step 3e and expand .autonomous-state.json schema</name>
<read_first>plugins/pbr/skills/autonomous/SKILL.md</read_first>
<files>plugins/pbr/skills/autonomous/SKILL.md</files>
<action>
1. Open `plugins/pbr/skills/autonomous/SKILL.md`.

2. Locate **Step 3e. Phase Complete**. It currently has three bullets:
   - Log: "Phase {N} complete..."
   - Update STATE.md current_phase via CLI
   - Check milestone boundary

3. INSERT a new "Git branch" bullet BETWEEN the log line and the STATE.md update. Use this exact text:

   ```
   - **Git branch (conditional):** If `git.branching: "phase"` in `.planning/config.json`:
     1. Read `git.phase_branch_template` from config (default: `pbr/phase-{phase}-{slug}`)
     2. Expand template: `{phase}` -> zero-padded phase number (e.g., `23`), `{slug}` -> phase slug from ROADMAP
     3. Run `git checkout -b {branch_name}` to create branch from current HEAD
     4. If that fails with "already exists": run `git checkout {branch_name}` instead
     5. Log: `Branch: {branch_name}`
     6. Write branch name to `.autonomous-state.json` under `branch_state["{N}"]`
   ```

4. Locate the **Error Recovery** section. Find the JSON block showing `.autonomous-state.json` content. Replace the existing JSON block with the expanded schema:

   ```json
   {
     "current_phase": 4,
     "completed_phases": [2, 3],
     "speculative_plans": {"5": "pending", "6": "pending"},
     "speculative_plan_paths": {"5": [".planning/phases/05-slug/PLAN-01.md"]},
     "branch_state": {"2": "pbr/phase-02-slug", "3": "pbr/phase-03-slug"},
     "failed_phase": null,
     "error": null,
     "started_at": "2026-01-15T10:00:00Z",
     "timestamp": "2026-01-15T10:30:00Z"
   }
   ```

   Add a brief description of the two new fields after the block:
   - `speculative_plan_paths` — maps phase number to list of plan file paths written by speculative planner
   - `branch_state` — maps phase number to git branch name created for that phase build

5. Locate **Step 3c-speculative**, sub-step 2 (the "For each candidate phase C" loop). After the `Task({ ... run_in_background: true ... })` call, add:

   ```
   - After dispatching: add expected plan file paths to `.autonomous-state.json` `speculative_plan_paths["{C}"]`.
     Paths use pattern `.planning/phases/{CC}-{slug}/PLAN-*.md`. At dispatch time, store the glob pattern as-is;
     it will be resolved to actual paths after the planner completes.
   ```

6. Do NOT remove or reorder any existing content in Step 3e or the Error Recovery section.
</action>
<acceptance_criteria>
grep -c "git.branching.*phase" plugins/pbr/skills/autonomous/SKILL.md
grep -c "branch_state" plugins/pbr/skills/autonomous/SKILL.md
grep -c "speculative_plan_paths" plugins/pbr/skills/autonomous/SKILL.md
grep -c "phase_branch_template" plugins/pbr/skills/autonomous/SKILL.md
</acceptance_criteria>
<verify>
grep -n "git.branching" plugins/pbr/skills/autonomous/SKILL.md
grep -n "branch_state" plugins/pbr/skills/autonomous/SKILL.md
grep -n "speculative_plan_paths" plugins/pbr/skills/autonomous/SKILL.md
npx markdownlint-cli2 "plugins/pbr/skills/autonomous/SKILL.md" 2>&1 | tail -5
</verify>
<done>SKILL.md Step 3e has a conditional git-branch block. .autonomous-state.json JSON example includes branch_state and speculative_plan_paths. markdownlint exits 0 on the file.</done>
</task>

## Summary

**Plan:** 23-01 | **Wave:** 1

**Tasks:**
1. T1 — Add git branch creation to autonomous Step 3e; expand .autonomous-state.json schema with branch_state and speculative_plan_paths

**Key files:** `plugins/pbr/skills/autonomous/SKILL.md`

**Must-haves:**
- Step 3e creates per-phase git branches when `git.branching: "phase"`
- `.autonomous-state.json` tracks `branch_state` and `speculative_plan_paths`

**Provides:** Git phase branching in autonomous mode, expanded state schema
**Consumes:** `git.phase_branch_template` config key
