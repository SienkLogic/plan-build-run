# Commit Planning Docs Pattern

Standard pattern for committing planning artifacts to git. Reference this fragment in skills that create or modify `.planning/` files.

---

## Pattern

```
If `planning.commit_docs: true` in config.json:
1. Stage the relevant .planning/ files for this skill's output
2. Commit with the format from the **Commit Messages by Skill** table below (most use `docs({scope}):` but some skills like pause use `wip(planning):`)
3. Use the appropriate scope from the skill's commit conventions

If `planning.commit_docs: false` or config.json missing:
- Skip the commit step
```

**Note:** CLI state commands (`state advance-plan`, `phase complete`, `state update-progress`) automatically update STATE.md and ROADMAP.md. The commit step here covers planning artifacts (PLAN.md, SUMMARY.md, VERIFICATION.md), not state files -- those are updated atomically by CLI commands.

## Session Affinity

When a session ID is available (from `.planning/.session.json`), append `[session:{short_id}]` to the commit description, where `short_id` is the first 8 characters of the session_id. This enables conflict tracing when multiple sessions modify planning docs concurrently.

Example: `docs(planning): capture phase 3 discussion decisions [session:a1b2c3d4]`

## Commit Messages by Skill

| Skill | Commit message format |
|-------|----------------------|
| build | `docs({phase}): add build summaries and verification` |
| plan | `docs({phase}): add phase plans` |
| review | `docs({phase}): add verification report` |
| begin | `chore: initialize plan-build-run project planning` |
| import | `docs({phase}): import external plans` |
| quick | `docs(planning): quick task {NNN} - {slug}` |
| scan | `docs(planning): initial codebase analysis` |
| explore | `docs(planning): capture explore session outputs` |
| debug | `docs(planning): open/resolve debug session {NNN}` |
| discuss | `docs(planning): capture phase {N} discussion decisions` |
| pause | `wip(planning): save session state — phase {N} plan {M}` |
| todo | `docs(planning): add/complete todo {NNN}` |
| milestone | `docs(planning): start/complete/audit milestone` |
