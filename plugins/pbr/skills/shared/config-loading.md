# Config Loading Pattern

Standard pattern for loading `.planning/config.json` fields at the start of a skill invocation.

> Referenced by: build, plan, review, import, begin, quick, milestone, scan skills

---

## Tooling Shortcut

Instead of reading and parsing STATE.md, ROADMAP.md, and config.json manually, run:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state load
```
This returns a JSON object with `config`, `state`, `roadmap`, `current_phase`, and `progress`. Falls back gracefully if the script is missing -- parse files manually in that case.

Additional tooling shortcuts:
- `plan-index <phase>` -- returns plan inventory (plan_id, wave, depends_on, autonomous, must_haves_count per plan)
- `phase-info <phase>` -- returns comprehensive phase status (verification, summaries, roadmap_status, filesystem_status, plan_count, completed)

---

## Standard Config Fields

These are the config.json fields commonly read by workflow skills. Each skill reads a subset depending on its needs.

### Core Settings
```
depth                 -- quick | standard | comprehensive
mode                  -- interactive | autonomous
```

### Feature Flags
```
features.research_phase        -- run researcher before planning
features.plan_checking         -- validate plans via plan-checker agent
features.goal_verification     -- run verifier after build
features.inline_verify         -- per-task verification after each executor commit (opt-in)
features.atomic_commits        -- require atomic commits per task
features.auto_continue         -- write .auto-next signal on phase completion
features.auto_advance          -- chain build->review->plan in autonomous mode
features.integration_verification -- check cross-phase integration
```

### Gate Flags
```
gates.confirm_plan             -- require user approval before building
gates.confirm_execute          -- require user confirmation before executing build
gates.confirm_transition       -- require confirmation before advancing to next phase
```

### Parallelization
```
parallelization.enabled        -- whether to run plans in parallel
parallelization.plan_level     -- parallel at plan level (within a wave)
parallelization.max_concurrent_agents -- max simultaneous executors
```

### Planning
```
planning.commit_docs           -- commit planning docs after operations
planning.max_tasks_per_plan    -- maximum tasks in a single plan
```

### Git
```
git.commit_format              -- commit message format
git.branching         -- none | phase | milestone
```

### Models
```
models.researcher              -- model for researcher agent
models.planner                 -- model for planner agent
models.executor                -- model for executor agent
models.verifier                -- model for verifier agent
```

---

## Config Field Matrix by Skill

| Field | build | plan | review | import | begin | quick | milestone |
|-------|-------|------|--------|--------|-------|-------|-----------|
| depth | | X | | | X | | |
| mode | X | X | X | | X | | |
| features.research_phase | | X | | | | | |
| features.plan_checking | | X | | X | | | |
| features.goal_verification | X | | X | | | | |
| features.inline_verify | X | | | | | | |
| features.atomic_commits | X | | | | | | |
| features.auto_continue | X | | | | | | |
| features.auto_advance | X | X | X | | | | |
| features.integration_verification | | | X | | | | X |
| gates.confirm_plan | | X | | | | | |
| gates.confirm_execute | X | | | | | | |
| gates.confirm_transition | | | X | | | | |
| parallelization.* | X | | | | | | |
| planning.commit_docs | X | | | | | X | X |
| git.commit_format | X | | | | X | X | |
| git.branching | X | | | | | | |
| models.* | | X | X | | X | | X |
