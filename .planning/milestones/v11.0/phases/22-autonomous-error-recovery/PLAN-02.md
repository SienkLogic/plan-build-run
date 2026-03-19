---
phase: "22-autonomous-error-recovery"
plan: "22-02"
type: "feature"
wave: 2
depends_on: ["22-01"]
speculative: true
autonomous: true
discovery: 1
gap_closure: false
files_modified:
  - "plugins/pbr/skills/autonomous/SKILL.md"
must_haves:
  truths:
    - "Autonomous mode classifies build/hook errors as transient or permanent before deciding retry vs stop"
    - "Transient errors (stale .active-skill, stale .active-agent, git lock files) are auto-cleaned then retried"
    - "Retry count is bounded by autonomous.max_retries from config (default 2)"
    - "autonomous.error_strategy=skip allows the loop to skip a failed phase and continue"
    - "Discuss is auto-skipped when phase has 0 or 1 requirements in ROADMAP.md"
    - "Error counts and retry counts are written to .autonomous-state.json after each phase"
  artifacts:
    - "plugins/pbr/skills/autonomous/SKILL.md: Error Classification section added"
    - "plugins/pbr/skills/autonomous/SKILL.md: .autonomous-state.json schema includes errors and retries fields"
  key_links:
    - "Step 3a discuss check reads requirement count from ROADMAP phase section before deciding to invoke discuss"
    - "Step 3c build failure path reads autonomous.max_retries and autonomous.error_strategy from config"
    - "Step 3e (phase complete) writes errors and retries to .autonomous-state.json"
provides:
  - "Error classification logic (transient vs permanent) in autonomous skill"
  - "Auto-cleanup of stale signal files on transient error"
  - "Discuss auto-skip for phases with 0-1 requirements"
  - "Error/retry metrics in .autonomous-state.json"
consumes:
  - "autonomous.max_retries config key (from plan 22-01)"
  - "autonomous.error_strategy config key (from plan 22-01)"
implements: []
---

<task id="22-02-T1" type="auto" tdd="false" complexity="medium">
<name>Add error classification + graduated retry loop to autonomous SKILL.md Step 3c</name>
<read_first>plugins/pbr/skills/autonomous/SKILL.md</read_first>
<files>plugins/pbr/skills/autonomous/SKILL.md</files>
<action>
1. Open `plugins/pbr/skills/autonomous/SKILL.md`.
2. Read the existing Step 3c (Build Phase) and the "Error Recovery" section near the bottom.

3. **Add an "Error Classification" reference block** immediately before the existing Step 3c build failure bullet. Insert this subsection:

```
#### Error Classification

Before retrying any build failure, classify the error:

**Transient errors** (auto-fixable — clean up then retry):
- Stale `.active-skill`: file exists but session that wrote it is gone (check via `ps` or absence of matching `.session-*.json`)
- Stale `.active-agent`: same pattern
- Git lock file: `.git/index.lock` or `.git/MERGE_HEAD` left by a killed process
- `EBUSY`/`EACCES` file lock errors on Windows

**Permanent errors** (do not retry):
- Missing PLAN-*.md files
- Syntax errors in plan YAML frontmatter
- Executor returned checkpoint:human-action
- Missing dependency phase SUMMARY.md (means prior phase incomplete)

**Classification procedure (Step 3c on failure):**
1. Read the Skill() return value / error message
2. Check for known transient patterns (lock files, stale signal files)
3. Read `autonomous.max_retries` from config (default: 2)
4. Read `autonomous.error_strategy` from config (default: 'retry'): 'stop' | 'retry' | 'skip'
```

4. **Replace the existing single-retry bullet in Step 3c** ("If Skill returns failure: attempt single retry. If retry fails: stop loop, display error.") with:

```
- If Skill returns failure:
  a. Classify error (see Error Classification above)
  b. **If transient error:**
     - Auto-fix: remove stale signal file OR remove `.git/index.lock` via Bash
     - Increment retry counter for this phase (start at 0)
     - If retry counter < `autonomous.max_retries`: retry `Skill({ skill: "pbr:build", args: "{N} --auto" })`
     - If retry counter >= `autonomous.max_retries`: apply error_strategy (see below)
  c. **If permanent error:** apply error_strategy immediately (no retries)
  d. **error_strategy application:**
     - `stop` (safe default): stop autonomous loop, display error, suggest `/pbr:build {N}`
     - `retry`: already handled above (retry up to max_retries, then stop)
     - `skip`: log warning "Skipping Phase {N} due to unrecoverable error", continue to Phase N+1
  e. **On transient auto-fix:** log: `Auto-fixed transient error in Phase {N}: {description}. Retry {n}/{max}.`
```

5. Do NOT alter Step 3a, 3b, 3c-speculative, 3c-stale, 3d, or 3e beyond what is specified here.
6. Do NOT remove or modify the Hard Stops section.
</action>
<acceptance_criteria>
grep -c "Error Classification" plugins/pbr/skills/autonomous/SKILL.md
grep -c "max_retries" plugins/pbr/skills/autonomous/SKILL.md
grep -c "error_strategy" plugins/pbr/skills/autonomous/SKILL.md
grep -c "Transient errors" plugins/pbr/skills/autonomous/SKILL.md
grep -c "auto-fix\|Auto-fix\|Auto-fixed" plugins/pbr/skills/autonomous/SKILL.md
</acceptance_criteria>
<verify>
grep -n "max_retries\|error_strategy\|Transient\|permanent" plugins/pbr/skills/autonomous/SKILL.md | head -20
</verify>
<done>SKILL.md Step 3c contains error classification logic with transient/permanent distinction, configurable max_retries, and error_strategy branching. The existing Hard Stops section is unchanged.</done>
</task>

<task id="22-02-T2" type="auto" tdd="false" complexity="medium">
<name>Add discuss auto-skip for phases with 0-1 requirements and error metrics to .autonomous-state.json</name>
<read_first>plugins/pbr/skills/autonomous/SKILL.md</read_first>
<files>plugins/pbr/skills/autonomous/SKILL.md</files>
<action>
1. Open `plugins/pbr/skills/autonomous/SKILL.md` (already edited in T1 of this plan).

2. **Update Step 3a (Discuss Phase)** — replace the condition check with a richer version:

Current condition:
```
- Check if `.planning/phases/{NN}-{slug}/CONTEXT.md` exists
- If NOT exists AND phase has 2+ requirements:
  - Invoke: `Skill({ skill: "pbr:discuss", args: "{N} --auto" })`
- If CONTEXT.md exists: skip discussion (decisions already captured)
```

Replace with:
```
- Check if `.planning/phases/{NN}-{slug}/CONTEXT.md` exists — if so, skip (decisions already captured)
- Count requirements for this phase: parse the `### Phase {N}:` section in ROADMAP.md, count bullet lines under `**Requirements:**`
- **Auto-skip discuss** (no Skill() call) when ANY of these are true:
  - CONTEXT.md already exists
  - Requirement count is 0 or 1 (well-specified, no gray areas worth discussing)
  - `--auto` mode is active AND all requirements are simple factual statements (no `[NEEDS DECISION]` markers)
  - Log: `Phase {N}: auto-skipping discuss ({count} requirement(s), well-specified)`
- **Run discuss** only when: CONTEXT.md missing AND requirement count >= 2 AND at least one requirement contains ambiguous language or `[NEEDS DECISION]`
  - Invoke: `Skill({ skill: "pbr:discuss", args: "{N} --auto" })`
```

3. **Update the Error Recovery section's `.autonomous-state.json` schema** — add error tracking fields. Find the existing JSON block in the Error Recovery section and add two new fields:

```json
{
  "current_phase": 4,
  "completed_phases": [2, 3],
  "speculative_plans": {"5": "pending", "6": "pending"},
  "failed_phase": null,
  "error": null,
  "errors": {},
  "retries": {},
  "started_at": "2026-01-15T10:00:00Z",
  "timestamp": "2026-01-15T10:30:00Z"
}
```

Where:
- `"errors"`: object mapping phase number to error description, e.g. `{"4": "stale .active-skill"}`
- `"retries"`: object mapping phase number to retry count, e.g. `{"4": 1}`

4. **Update Step 3e (Phase Complete)** to write error/retry metrics. After the existing STATE.md update command, add:

```
- Update `.autonomous-state.json` with phase error metrics:
  ```bash
  # Read current state, merge phase N error/retry data, write back
  node -e "
    const fs=require('fs');
    const f='.planning/.autonomous-state.json';
    const s=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):{};
    s.errors=s.errors||{}; s.retries=s.retries||{};
    // phase_errors and phase_retries are substituted by orchestrator
    if('{phase_errors}') s.errors['{N}']='{phase_errors}';
    if('{phase_retries}'!='0') s.retries['{N}']=parseInt('{phase_retries}');
    s.timestamp=new Date().toISOString();
    fs.writeFileSync(f,JSON.stringify(s,null,2));
  "
  ```
  Where `{phase_errors}` and `{phase_retries}` are the accumulated error description and retry count tracked during Step 3c for phase N. If phase N had no errors, omit the errors entry.
```

5. Do NOT change the Hard Stops section, Anti-Patterns, or Step 4 Completion summary beyond adding errors/retries to the display.

6. **Update Step 4 Completion summary** to include error totals:
   In the completion display block, add a line: `Errors auto-fixed: {count} | Phases skipped: {count}`
</action>
<acceptance_criteria>
grep -c "auto-skipping discuss" plugins/pbr/skills/autonomous/SKILL.md
grep -c "Requirement count is 0 or 1\|requirement count is 0\|requirement.*0 or 1" plugins/pbr/skills/autonomous/SKILL.md
grep -c '"errors"' plugins/pbr/skills/autonomous/SKILL.md
grep -c '"retries"' plugins/pbr/skills/autonomous/SKILL.md
</acceptance_criteria>
<verify>
grep -n "auto-skipping discuss\|errors.*retries\|\"errors\"\|\"retries\"" plugins/pbr/skills/autonomous/SKILL.md | head -20
</verify>
<done>SKILL.md Step 3a has discuss auto-skip for 0-1 requirement phases. The .autonomous-state.json schema includes errors and retries fields. Step 3e writes error metrics. Step 4 completion display shows error totals.</done>
</task>

## Summary

**Plan:** 22-02 | **Wave:** 2 | **Depends on:** 22-01

**Tasks:**
1. T1 — Add error classification + graduated retry loop to autonomous SKILL.md Step 3c
2. T2 — Add discuss auto-skip for phases with 0-1 requirements and error metrics to .autonomous-state.json

**Key files:** `plugins/pbr/skills/autonomous/SKILL.md`

**Must-haves:**
- Transient errors auto-cleaned and retried up to max_retries
- error_strategy (stop/retry/skip) applied after exhausting retries
- Discuss skipped when phase has 0-1 requirements
- errors/retries tracked in .autonomous-state.json

**Provides:** Graduated error recovery logic, discuss auto-skip, error metrics
**Consumes:** autonomous.max_retries and autonomous.error_strategy (from plan 22-01)
