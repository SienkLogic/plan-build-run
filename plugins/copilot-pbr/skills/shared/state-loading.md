<!-- canonical: ../../../pbr/skills/shared/state-loading.md -->
# State Loading Pattern

Standard pattern for loading project state at the start of a skill invocation. Include this fragment in skills that need project context.

---

## Minimal State Read (for simple skills)

Use when the skill only needs to know the current position. Skills: status, help, note, todo, pause, config.
STATE.md is lean — it contains only current-phase context. Historical data lives in HISTORY.md.

```
1. Read .planning/STATE.md lines 1-20 only
2. Extract: current phase, plan, status
3. If STATE.md missing: inform user, suggest /pbr:begin
```

## Full State Read (for workflow skills)

Use when the skill needs complete project context. Skills: build, plan, review, begin, milestone, continue, resume, debug.

Reading order (always this sequence):

```
1. Read .planning/STATE.md
   - Extract: Current Position section (phase, plan, status)
   - Extract: Blockers/Concerns section (if not "None")
   - Extract: Session Continuity section (if present)

2. Read .planning/config.json
   - Extract: depth, mode, features flags
   - Extract: models configuration
   - Extract: gates configuration

3. Read .planning/ROADMAP.md (if exists)
   - Extract: Phase Overview table (current + next 2 phases)
   - Extract: dependency chain for current phase
   - Do NOT read full phase details for past phases

4. Read .planning/HISTORY.md (ONLY when cross-phase context is needed)
   - Do NOT read HISTORY.md for normal build/plan/review operations
   - Read ONLY when: debugging a regression that may trace to a prior phase,
     or when a milestone audit needs historical context
   - Use: `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js history load`
   - This returns structured JSON -- do not read the raw file
```

## Error Handling

| File Missing | Action |
|-------------|--------|
| STATE.md | Warn user: "No STATE.md found. Run /pbr:begin to initialize." |
| config.json | Use defaults (depth: standard, mode: interactive) |
| ROADMAP.md | Continue without roadmap context (acceptable for quick tasks) |
| .planning/ dir | Exit: "No .planning directory. This is not a Plan-Build-Run project." |

## What NOT to Read During State Loading

- Full SUMMARY.md bodies from prior phases (read frontmatter only if needed)
- Agent definition files (agents/*.md) — auto-loaded by subagent_type
- PLAN.md files from other phases (only current phase plans)
- .planning/logs/ files (only health skill reads these)
