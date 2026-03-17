# STATE.md Update Pattern

Standard pattern for updating `.planning/STATE.md`. CLI commands handle both YAML frontmatter and markdown body atomically. Skills and agents call `pbr-tools.cjs` commands instead of writing STATE.md directly.

> Referenced by: build, plan, review, milestone, pause, resume, continue, begin, import, quick skills

---

## CLI Command Reference

All commands use: `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.cjs <command>`

| Action | CLI Command | What It Updates |
|--------|------------|-----------------|
| Update single field | `state update <field> <value>` | Frontmatter field + body line |
| Update multiple fields | `state patch '{"field":"value",...}'` | Multiple frontmatter fields + body lines atomically |
| Advance plan counter | `state advance-plan` | `plans_complete` + `progress_percent` in frontmatter and body |
| Recalculate progress | `state update-progress` | `progress_percent` from disk (counts plans vs summaries) |
| Complete a phase | `phase complete <N>` | STATE.md (advance phase, reset plans) + ROADMAP.md (checkbox, table) |
| Record activity | `state record-activity "<desc>"` | `last_activity` with today's date + description |
| Load full state | `state load` | Returns JSON -- does not write |

---

## When to Use Each Command

| Event | CLI Command |
|-------|------------|
| Plan completes | `state advance-plan` then `state update-progress` |
| Phase status changes | `state update status <value>` |
| Phase fully built and verified | `phase complete <N>` |
| After any state mutation | `state record-activity "<what happened>"` |
| Session starts (read only) | `state load` |
| New decision made | Edit STATE.md "Accumulated Context > Decisions" section directly (CLI does not manage this section) |
| Blocker discovered | Edit STATE.md "Accumulated Context > Blockers" section directly |

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
Calculation: `filled = Math.round((completed_phases / phase_count) * 20)` where `phase_count` is derived from ROADMAP.md (available via `stateLoad` as `phase_count`)

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
2. **Remove decisions already captured in CONTEXT.md** -- avoid duplication between STATE.md and phase CONTEXT.md files
3. **Remove old session entries** -- keep only the current session's continuity data
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

Use `pbr-tools.cjs history append`:
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.cjs history append phase "Phase 3 (Auth)" "Verified 2026-02-10. Key decisions: JWT + httpOnly cookies, Discord OAuth."
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.cjs history append milestone "v1.0 User Auth" "Phases 1-4. All verified. Core auth flow complete."
```

### After Archiving

Remove the archived content from STATE.md. The Accumulated Context section should contain ONLY:
- Decisions relevant to the **current** phase
- Active (unresolved) blockers
- Pending todos for the current milestone

Historical decisions live in HISTORY.md and per-phase SUMMARY.md files.

---

## Anti-Pattern

> **DO NOT** use Write or Edit to modify STATE.md frontmatter or the Current Position body section.
> Always use CLI commands. They ensure frontmatter and body stay in sync.
> **Exception:** Accumulated Context sections (Decisions, Blockers, Todos) are edited directly since they are freeform text.
