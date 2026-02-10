# State Loading Pattern

Standard pattern for loading project state at the start of a skill invocation. Include this fragment in skills that need project context.

---

## Minimal State Read (for simple skills)

Use when the skill only needs to know the current position. Skills: status, help, note, todo, pause, config.

```
1. Read .planning/STATE.md lines 1-20 only
2. Extract: current phase, plan, status
3. If STATE.md missing: inform user, suggest /dev:begin
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
```

## Error Handling

| File Missing | Action |
|-------------|--------|
| STATE.md | Warn user: "No STATE.md found. Run /dev:begin to initialize." |
| config.json | Use defaults (depth: standard, mode: interactive) |
| ROADMAP.md | Continue without roadmap context (acceptable for quick tasks) |
| .planning/ dir | Exit: "No .planning directory. This is not a Towline project." |

## What NOT to Read During State Loading

- Full SUMMARY.md bodies from prior phases (read frontmatter only if needed)
- Agent definition files (agents/*.md) — auto-loaded by subagent_type
- PLAN.md files from other phases (only current phase plans)
- .planning/logs/ files (only health skill reads these)
