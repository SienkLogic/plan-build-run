---
phase: "21-autonomous-hook-compatibility"
plan: "21-01"
wave: 1
speculative: true
depends_on: []
files_modified:
  - "plugins/pbr/skills/plan/SKILL.md"
  - "plugins/pbr/skills/autonomous/SKILL.md"
must_haves:
  truths:
    - "Speculative planner agents run without writing .active-skill or updating STATE.md"
    - "Autonomous orchestrator retains sole ownership of .active-skill during speculative planning"
  artifacts:
    - "plan/SKILL.md has --speculative flag guard around .active-skill write and STATE.md update steps"
    - "autonomous/SKILL.md passes --speculative flag in speculative Task() prompt"
  key_links:
    - "autonomous SKILL.md 3c-speculative prompt includes '--speculative' in planner Task args"
    - "plan SKILL.md active-skill write is gated on absence of --speculative flag"
implements: []
provides:
  - "speculative planner flag: --speculative suppresses .active-skill and STATE.md side effects"
  - "autonomous orchestrator owns .active-skill exclusively during speculative planning"
consumes: []
---

<task id="21-01-T1" type="auto" tdd="false" complexity="medium">
<name>Add --speculative flag guard to plan skill's .active-skill and STATE.md writes</name>
<read_first>
plugins/pbr/skills/plan/SKILL.md
</read_first>
<files>
plugins/pbr/skills/plan/SKILL.md
</files>
<action>
1. Read `plugins/pbr/skills/plan/SKILL.md` in full.
2. Locate every occurrence of the `.active-skill` write instruction. It appears in multiple modes (standard, gap-closure, revision) and looks like: `**CRITICAL (hook-enforced): Write .active-skill NOW.** Write the text "plan" to `.planning/.active-skill``.
3. Immediately BEFORE each `.active-skill` write instruction, insert this guard block:

   ```
   **Speculative mode guard:** If `$ARGUMENTS` contains `--speculative` or `--no-state-update`, SKIP the `.active-skill` write below — the autonomous orchestrator owns `.active-skill` during speculative planning.
   ```

4. Locate the post-planning state update section (contains `pbr-tools.js state update status planned` and `pbr-tools.js state update plans_total`).
5. Add this guard immediately before those CLI commands:

   ```
   **Speculative mode guard:** If `$ARGUMENTS` contains `--speculative` or `--no-state-update`, SKIP all `state update` CLI calls in this section. Do NOT update STATE.md `status`, `current_phase`, or `plans_total` — the autonomous orchestrator manages state exclusively during speculative runs.
   ```

6. Locate every occurrence of "Delete `.planning/.active-skill` if it exists". Add the same guard before each: if `--speculative` is present, skip the delete (nothing was written).
7. Do NOT remove or change the CRITICAL markers themselves — add the guard BEFORE them, so the CRITICAL marker still fires for non-speculative runs.
</action>
<acceptance_criteria>
grep -c "Speculative mode guard" plugins/pbr/skills/plan/SKILL.md | awk '{exit ($1 >= 3) ? 0 : 1}'
grep -q "no-state-update" plugins/pbr/skills/plan/SKILL.md
grep -q "speculative" plugins/pbr/skills/plan/SKILL.md
</acceptance_criteria>
<verify>
grep -c "Speculative mode guard" plugins/pbr/skills/plan/SKILL.md
grep -n "Speculative mode guard\|--speculative\|no-state-update" plugins/pbr/skills/plan/SKILL.md | head -20
</verify>
<done>
`plugins/pbr/skills/plan/SKILL.md` contains at least 3 "Speculative mode guard" blocks — one before each .active-skill write (standard/gap/revision modes) and one before the STATE.md update section. Each guard instructs skipping when `--speculative` or `--no-state-update` is present.
</done>
</task>

<task id="21-01-T2" type="auto" tdd="false" complexity="medium">
<name>Pass --speculative flag from autonomous SKILL.md speculative Task() prompt</name>
<read_first>
plugins/pbr/skills/autonomous/SKILL.md
</read_first>
<files>
plugins/pbr/skills/autonomous/SKILL.md
</files>
<action>
1. Read `plugins/pbr/skills/autonomous/SKILL.md`.
2. Locate Step 3c-speculative, specifically the Task() invocation block. The current prompt reads:
   ```
   prompt: "Plan Phase {C}. Phase goal from ROADMAP.md. Write plans to .planning/phases/{CC}-{slug}/. This is a speculative plan -- Phase {N} is still building."
   ```
3. Replace that prompt string with:
   ```
   prompt: "Plan Phase {C} --speculative. Phase goal from ROADMAP.md. Write plans to .planning/phases/{CC}-{slug}/. This is a speculative plan -- Phase {N} is still building. Do NOT write .active-skill. Do NOT update STATE.md."
   ```
   The `--speculative` flag is placed immediately after the phase number so the plan skill receives it in `$ARGUMENTS`.
4. After the Task() dispatch block, add this constraint bullet to the "Important constraints" list:
   ```
   - After dispatching speculative Task()s, do NOT write .active-skill — the orchestrator already owns it for the active Phase {N} build. The speculative planner receives --speculative and will skip signal file writes.
   ```
5. Verify the change is only in Step 3c-speculative and not in Step 3b (the normal synchronous plan step).
</action>
<acceptance_criteria>
grep -q "\-\-speculative" plugins/pbr/skills/autonomous/SKILL.md
grep -A5 "run_in_background: true" plugins/pbr/skills/autonomous/SKILL.md | grep -q "speculative"
</acceptance_criteria>
<verify>
grep -n "\-\-speculative\|Do NOT write .active-skill\|no-state-update" plugins/pbr/skills/autonomous/SKILL.md
</verify>
<done>
`plugins/pbr/skills/autonomous/SKILL.md` Step 3c-speculative Task() prompt includes `--speculative` in the plan command args, and the Important constraints list states the orchestrator must not write .active-skill after dispatching speculative tasks.
</done>
</task>

## Summary

**Plan ID:** 21-01 | **Wave:** 1 | **Speculative:** true

**Tasks:**
1. `21-01-T1` — Add `--speculative` flag guards to plan/SKILL.md around every `.active-skill` write and STATE.md update
2. `21-01-T2` — Pass `--speculative` in autonomous/SKILL.md's speculative Task() prompt

**Key files:**
- `plugins/pbr/skills/plan/SKILL.md` — gains speculative mode guards on all signal-file and STATE.md writes
- `plugins/pbr/skills/autonomous/SKILL.md` — speculative Task() prompt updated to include `--speculative`

**Must-haves:**
- Speculative planner agents write PLAN files only — not .active-skill or STATE.md
- Autonomous orchestrator retains sole `.active-skill` ownership during speculative builds

**Provides:** `speculative planner flag` — `--speculative` suppresses .active-skill and STATE.md side effects
**Consumes:** nothing (Wave 1)
