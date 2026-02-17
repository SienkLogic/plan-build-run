# STATE.md Update Pattern

Standard pattern for updating `.planning/STATE.md`. Include this fragment in skills that modify project state.

---

## When to Update STATE.md

| Event | What to Update |
|-------|---------------|
| Phase status changes (planned, building, verified) | Current Position section |
| Plan completes or fails | Plan counter, status, last activity |
| New decision made | Accumulated Context > Decisions |
| Blocker discovered or resolved | Accumulated Context > Blockers/Concerns |
| Session starts or ends | Session Continuity section |
| Milestone boundary | Milestone section |

---

## Section Format

STATE.md has 5 sections. Always preserve this order:

### 1. Project Reference (lines 4-7)
```
## Project Reference
See: .planning/PROJECT.md (updated {date})
**Core value:** {one-liner from PROJECT.md}
**Current focus:** Phase {N} - {name}
```
Update `Current focus` when phase changes.

### 2. Current Position (lines 9-14)
```
## Current Position
Phase: {N} of {total} ({Phase name})
Plan: {completed} of {total_plans} in current phase
Status: {Ready to plan | Planning | Building | Reviewing | Verified}
Last activity: {YYYY-MM-DD} -- {brief description}
Progress: [{progress_bar}] {percent}%
```

**Progress bar format:** 20 characters using `█` (done) and `░` (remaining).
```
Phase 3 of 10 = 20% → [████░░░░░░░░░░░░░░░░] 20%
Phase 7 of 10 = 70% → [██████████████░░░░░░] 70%
```
Calculation: `filled = Math.round((completed_phases / total_phases) * 20)`

### 3. Accumulated Context (lines 16-25)
```
## Accumulated Context

### Decisions
{Active decisions relevant to current work}

### Pending Todos
{Outstanding items, or "None"}

### Blockers/Concerns
{Active blockers, or "None"}
```

### 4. Milestone (lines 27-30)
```
## Milestone
Current: {project_name} {version}
Phases: {start}-{end}
Status: {In progress | Complete}
```

### 5. Session Continuity (lines 32-35)
```
## Session Continuity
Last session: {ISO timestamp}
Stopped at: {brief description of last action}
Resume file: {path or "None"}
```

---

## Size Limit Enforcement

**Hard limit: 150 lines.** After every STATE.md write, check the line count. If over 150 lines, compact:

1. **Collapse completed phase entries** to one-liners:
   ```
   Phase 1: verified 2026-02-08
   Phase 2: verified 2026-02-09
   ```
2. **Remove decisions already captured in CONTEXT.md** — avoid duplication between STATE.md and phase CONTEXT.md files
3. **Remove old session entries** — keep only the current session's continuity data
4. **Keep these always:** current phase detail, active blockers, core value statement, milestone info

If still over 150 lines after compaction, the Accumulated Context section has grown too large. Move non-critical decisions to the phase's CONTEXT.md file.

---

## HISTORY.md Archival

When a milestone completes or a phase is verified, archive historical context to `.planning/HISTORY.md` to keep STATE.md lean:

### What to Archive

| Trigger | What moves to HISTORY.md |
|---------|-------------------------|
| Phase verified | One-liner summary: "Phase {N} ({name}): verified {date}" |
| Milestone complete | Full milestone record: name, phases covered, key decisions |
| Accumulated Context > 20 lines | Decisions from completed phases (keep only current-phase decisions in STATE.md) |

### How to Archive

Use `towline-tools.js history append`:
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/towline-tools.js history append phase "Phase 3 (Auth)" "Verified 2026-02-10. Key decisions: JWT + httpOnly cookies, Discord OAuth."
node ${CLAUDE_PLUGIN_ROOT}/scripts/towline-tools.js history append milestone "v1.0 User Auth" "Phases 1-4. All verified. Core auth flow complete."
```

### After Archiving

Remove the archived content from STATE.md. The Accumulated Context section should contain ONLY:
- Decisions relevant to the **current** phase
- Active (unresolved) blockers
- Pending todos for the current milestone

Historical decisions live in HISTORY.md and per-phase SUMMARY.md files.

---

## Common Update Scenarios

### After build completes
```
Plan: {N} of {total} in current phase
Status: Building → Reviewing (if all plans done) or Building (if more plans remain)
Last activity: {date} -- Built plan {plan_id}
```

### After review/verification passes
```
Status: Verified
Last activity: {date} -- Phase {N} verified
Progress: [{updated bar}] {new percent}%
```
Also update **Current focus** to point to the next phase.

### After pause
```
## Session Continuity
Last session: {timestamp}
Stopped at: {what was in progress}
Resume file: .planning/.pause-state.json
```

### After milestone completion
```
## Milestone
Current: {project_name} {next_version}
Phases: {new_start}-{new_end}
Status: In progress
```
