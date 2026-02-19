<!-- canonical: ../../pbr/references/planning-config.md -->
# Planning Config Reference

Schema, fields, defaults, and behavioral effects of Plan-Build-Run's `config.json`.

---

## Overview

Plan-Build-Run's configuration lives at `.planning/config.json` in the project root. It is created by `/pbr:begin` and can be modified via `/pbr:config` or by editing the file directly. The config controls workflow behavior, model selection, parallelization, git integration, and confirmation gates.

---

## Schema Version

```json
{ "version": 2 }
```

The `version` field tracks schema migrations. Current version is `2`. When loading a config with an older version, Plan-Build-Run runs automatic migration (e.g., v1 to v2 adds missing fields with defaults, renames `model_profile` to per-agent `models` object).

---

## Top-Level Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `version` | number | `2` | Config schema version |
| `context_strategy` | string | `"aggressive"` | Context budget strategy: `aggressive`, `balanced`, `minimal` |
| `mode` | string | `"interactive"` | Workflow mode: `interactive` |
| `depth` | string | `"standard"` | Research/planning depth: `quick`, `standard`, `comprehensive` |

### depth

Controls how thorough research and planning phases are:

| Value | Behavior |
|-------|----------|
| `quick` | Minimal research, smaller plans, faster execution |
| `standard` | Balanced research depth, standard plan detail |
| `comprehensive` | Deep research with multiple sources, detailed plans with more tasks |

### context_strategy

Controls how aggressively Plan-Build-Run manages context budget:

| Value | Behavior |
|-------|----------|
| `aggressive` | Proactive compaction warnings, strict context isolation, minimal file reads in main context |
| `balanced` | Moderate context management with some inline reads |
| `minimal` | Relaxed context management, more inline content allowed |

---

## features

Boolean toggles that enable or disable specific workflow capabilities.

| Field | Default | Description |
|-------|---------|-------------|
| `structured_planning` | `true` | Use phased planning with ROADMAP and plan files |
| `goal_verification` | `true` | Run verifier agent after builds to check goals are met |
| `integration_verification` | `true` | Run cross-phase integration checks |
| `context_isolation` | `true` | Isolate work into subagents to protect main context |
| `atomic_commits` | `true` | Require one commit per task (vs. batched commits) |
| `session_persistence` | `true` | Persist state across sessions via STATE.md |
| `research_phase` | `true` | Run research before planning |
| `plan_checking` | `true` | Run plan-checker agent before execution |
| `tdd_mode` | `false` | Enable Test-Driven Development for all tasks (Red-Green-Refactor) |
| `status_line` | `true` | Show status line in session UI |
| `auto_continue` | `false` | Write `.auto-next` signal on phase completion for automatic continuation |
| `auto_advance` | `false` | Chain build→review→plan automatically in autonomous mode (requires `mode: autonomous`) |
| `team_discussions` | `false` | Enable team-based discussion workflows (never used for execution) |
| `inline_verify` | `false` | Run per-task verification after each executor commit (opt-in, adds latency) |

### Notable interactions

- `goal_verification: false` skips the post-build verification step. The build skill appends a note suggesting `/pbr:review` manually.
- `tdd_mode: true` causes all task types to follow Red-Green-Refactor, producing 3 commits per task instead of 1.
- `auto_continue: true` writes a `.planning/.auto-next` file containing the next command (e.g., `/pbr:plan 4`), allowing wrapper scripts to chain phases.
- `auto_advance: true` + `mode: autonomous` enables full phase cycling: build completes → auto-invoke review → if verification passes → auto-invoke plan for next phase. Hard stops at: checkpoints, verification gaps, errors, milestone boundaries.
- `inline_verify: true` spawns a haiku-model verifier after each plan completes within a wave. Adds ~10-20s latency per plan but catches issues before dependent plans run.

---

## models

Per-agent model selection. See `references/model-profiles.md` for full details.

```json
{
  "models": {
    "researcher": "sonnet",
    "planner": "inherit",
    "executor": "inherit",
    "verifier": "sonnet",
    "integration_checker": "sonnet",
    "debugger": "inherit",
    "mapper": "sonnet",
    "synthesizer": "haiku"
  }
}
```

Valid values: `sonnet`, `opus`, `haiku`, `inherit`.

---

## parallelization

Controls whether and how plans execute concurrently.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable parallel plan execution within a wave |
| `plan_level` | boolean | `true` | Parallelize at plan level (multiple plans in same wave) |
| `task_level` | boolean | `false` | Parallelize at task level within a plan (not currently used) |
| `max_concurrent_agents` | number | `3` | Maximum simultaneous executor subagents |
| `min_plans_for_parallel` | number | `2` | Minimum plans in a wave to trigger parallel execution |
| `use_teams` | boolean | `false` | Use Agent Teams for coordination (discussion only, never execution) |

### Behavior

When `enabled: true` and a wave has >= `min_plans_for_parallel` plans, the build orchestrator spawns up to `max_concurrent_agents` executor Task() calls in parallel using `run_in_background: true`.

When `enabled: false` or a wave has only 1 plan, executors run sequentially.

Git lock conflicts can occur with parallel execution. Executors handle this with retry logic (wait 2s, max 3 attempts). If conflicts persist, reduce `max_concurrent_agents` to 1.

---

## planning

Controls planning behavior and documentation.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `commit_docs` | boolean | `true` | Commit planning docs (SUMMARY, VERIFICATION) after builds |
| `max_tasks_per_plan` | number | `3` | Maximum tasks per plan (keeps plans focused and atomic) |
| `search_gitignored` | boolean | `false` | Include gitignored files in codebase scanning |

### commit_docs

When `true`, after all plans in a phase complete, the build orchestrator stages and commits planning artifacts:
```
docs({phase}): add build summaries and verification
```

When `false`, planning docs remain unstaged/uncommitted.

---

## git

Controls git integration and branching.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `branching` | string | `"none"` | Branching strategy: `none`, `phase`, `milestone`, `disabled` |
| `commit_format` | string | `"{type}({phase}-{plan}): {description}"` | Commit message template |
| `phase_branch_template` | string | `"plan-build-run/phase-{phase}-{slug}"` | Phase branch naming |
| `milestone_branch_template` | string | `"plan-build-run/{milestone}-{slug}"` | Milestone branch naming |
| `mode` | string | `"enabled"` | Git mode: `enabled` or `disabled` |

See `references/git-integration.md` for full branching strategy details.

### mode: disabled

When `git.mode` is `"disabled"`, no git commands are run at all -- no commits, no branching, no hook validation. Useful for prototyping or non-git projects.

---

## gates

Confirmation gates that pause execution to ask the user before proceeding.

| Field | Default | When Triggered |
|-------|---------|----------------|
| `confirm_project` | `true` | Before creating a new Plan-Build-Run project (`/pbr:begin`) |
| `confirm_roadmap` | `true` | Before finalizing a roadmap |
| `confirm_plan` | `true` | Before finalizing plans for a phase |
| `confirm_execute` | `false` | Before starting phase execution (`/pbr:build`) |
| `confirm_transition` | `true` | Before transitioning to the next phase |
| `issues_review` | `true` | Before proceeding when issues are detected |

Setting a gate to `false` makes that step automatic (no user prompt).

---

## safety

Safety controls for destructive or external operations.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `always_confirm_destructive` | boolean | `true` | Always ask before destructive git operations |
| `always_confirm_external_services` | boolean | `true` | Always ask before calling external APIs or services |

These cannot be disabled via `/pbr:config` -- they require manual editing of `config.json` as a deliberate action.

---

## Validation Rules

When modifying config (via `/pbr:config` or direct edit):

| Field | Valid Values |
|-------|-------------|
| `depth` | `quick`, `standard`, `comprehensive` |
| `models.*` | `sonnet`, `inherit`, `haiku`, `opus` |
| `context_strategy` | `aggressive`, `balanced`, `minimal` |
| `git.branching` | `none`, `phase`, `milestone`, `disabled` |
| `git.mode` | `enabled`, `disabled` |
| All boolean fields | `true`, `false` |
