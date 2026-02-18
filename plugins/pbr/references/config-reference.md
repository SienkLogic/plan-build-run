# Config Reference Guide

Complete reference for `.planning/config.json` -- the file that controls all Plan-Build-Run workflow behavior. Created by `/pbr:begin`, modifiable via `/pbr:config` or direct editing. Validated against `config-schema.json`.

---

## Top-Level Fields

| Property | Type | Allowed Values | Default | Description |
|----------|------|---------------|---------|-------------|
| `version` | integer | `1`, `2` | `2` | Schema version; v1 configs are auto-migrated to v2 on load |
| `context_strategy` | string | `aggressive`, `conservative`, `balanced` | `aggressive` | How aggressively PBR manages the context budget |
| `mode` | string | `interactive`, `autonomous` | `interactive` | Whether PBR pauses for user input or runs hands-free |
| `depth` | string | `quick`, `standard`, `comprehensive` | `standard` | Controls thoroughness of research, planning, and verification |

### context_strategy

| Value | Behavior |
|-------|----------|
| `aggressive` | Proactive compaction warnings, strict context isolation, minimal file reads in main context |
| `balanced` | Moderate context management with some inline reads |
| `conservative` | Relaxed context management, more inline content allowed |

### mode

| Value | Behavior |
|-------|----------|
| `interactive` | Pauses at gates, asks for confirmation, waits for user decisions |
| `autonomous` | Skips all gates, chains phases automatically, no user prompts |

### depth

| Value | Behavior |
|-------|----------|
| `quick` | Skips research, plan-checking, and verification; 2 mapper areas; 3 debug rounds max |
| `standard` | Research + plan-checking + verification enabled; 4 mapper areas; 5 debug rounds max |
| `comprehensive` | Everything from standard plus inline per-task verification; 10 debug rounds max |

See [depth_profiles](#depth_profiles) for the exact feature overrides each depth level applies.

---

## features

Boolean toggles that enable or disable specific workflow capabilities. All default to the value shown unless overridden by the active depth profile.

| Property | Default | Description |
|----------|---------|-------------|
| `structured_planning` | `true` | Use phased planning with ROADMAP and plan files |
| `goal_verification` | `true` | Run verifier agent after builds to check goals are met |
| `integration_verification` | `true` | Run cross-phase integration checks |
| `context_isolation` | `true` | Isolate heavy work into subagents to protect main context |
| `atomic_commits` | `true` | One commit per task rather than batched commits |
| `session_persistence` | `true` | Persist state across sessions via STATE.md |
| `research_phase` | `true` | Run researcher agent before planning |
| `plan_checking` | `true` | Run plan-checker agent to validate plans before execution |
| `tdd_mode` | `false` | Red-Green-Refactor for all tasks (3 commits per task instead of 1) |
| `status_line` | `true` | Show status line in session UI |
| `auto_continue` | `false` | Write `.auto-next` signal on phase completion for chaining |
| `auto_advance` | `false` | Chain build, review, and plan automatically (requires `mode: autonomous`) |
| `team_discussions` | `false` | Enable team-based discussion workflows (never used for execution) |
| `inline_verify` | `false` | Per-task verification after each executor commit; adds ~10-20s latency per plan |

**Notable interactions:**
- `goal_verification: false` skips post-build verification; the build skill suggests running `/pbr:review` manually.
- `auto_continue: true` writes `.planning/.auto-next` containing the next command (e.g., `/pbr:plan 4`).
- `auto_advance: true` requires `mode: autonomous` to function. Hard stops at checkpoints, verification gaps, errors, and milestone boundaries.
- `inline_verify: true` spawns a haiku-model verifier after each plan within a wave, catching issues before dependent plans run.

---

## models

Per-agent model selection. Valid values for all fields: `sonnet`, `opus`, `haiku`, `inherit`.

| Property | Default | Description |
|----------|---------|-------------|
| `researcher` | `sonnet` | Model for the researcher agent |
| `planner` | `inherit` | Model for the planner agent |
| `executor` | `inherit` | Model for the executor agent |
| `verifier` | `sonnet` | Model for the verifier agent |
| `integration_checker` | `sonnet` | Model for the integration-checker agent |
| `debugger` | `inherit` | Model for the debugger agent |
| `mapper` | `sonnet` | Model for the codebase-mapper agent |
| `synthesizer` | `haiku` | Model for the synthesizer agent (combines team outputs) |

### models.complexity_map

Maps task complexity to model tiers. Used when agents auto-select models based on task difficulty.

| Property | Default | Description |
|----------|---------|-------------|
| `simple` | `haiku` | Model for simple tasks |
| `medium` | `sonnet` | Model for medium-complexity tasks |
| `complex` | `inherit` | Model for high-complexity tasks |

---

## parallelization

Controls whether and how plans execute concurrently within a wave.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable parallel plan execution |
| `plan_level` | boolean | `true` | Parallelize at plan level (multiple plans in same wave) |
| `task_level` | boolean | `false` | Parallelize at task level within a plan (not currently used) |
| `max_concurrent_agents` | integer | `3` | Maximum simultaneous executor subagents (1-10) |
| `min_plans_for_parallel` | integer | `2` | Minimum plans in a wave to trigger parallel execution (min: 1) |
| `use_teams` | boolean | `false` | Use Agent Teams for coordination (discussion only, never execution) |

**Behavior notes:**
- When `enabled: true` and a wave has >= `min_plans_for_parallel` plans, the build orchestrator spawns executors in parallel using `run_in_background: true`.
- Git lock conflicts can occur with parallel execution. Executors retry with 2s waits (max 3 attempts). If conflicts persist, reduce `max_concurrent_agents`.

---

## teams

Configures Agent Teams for multi-perspective planning and review discussions.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `planning_roles` | string[] | `["architect", "security-reviewer", "test-designer"]` | Roles used during team planning discussions |
| `review_roles` | string[] | `["functional-reviewer", "security-auditor", "performance-analyst"]` | Roles used during team review discussions |
| `synthesis_model` | string | `sonnet` | Model used for the synthesizer agent that combines team outputs |
| `coordination` | string | `file-based` | How team members coordinate: `file-based` (parallel writes) or `sequential` |

**Interaction with parallelization:** Teams require `parallelization.max_concurrent_agents` > 1 to be useful. Setting `max_concurrent_agents: 1` with teams configured is a validation error.

---

## planning

Controls planning behavior and documentation.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `commit_docs` | boolean | `true` | Commit planning docs (SUMMARY, VERIFICATION) after builds |
| `max_tasks_per_plan` | integer | `3` | Maximum tasks per plan; keeps plans focused and atomic (1-10) |
| `search_gitignored` | boolean | `false` | Include gitignored files in codebase scanning |

When `commit_docs: true`, after all plans in a phase complete, the build orchestrator stages and commits planning artifacts with the message format `docs({phase}): add build summaries and verification`.

---

## git

Controls git integration and branching strategy.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `branching` | string | `none` | Branching strategy: `none`, `phase`, `milestone`, `disabled` |
| `commit_format` | string | `{type}({phase}-{plan}): {description}` | Commit message template |
| `phase_branch_template` | string | `plan-build-run/phase-{phase}-{slug}` | Phase branch name pattern |
| `milestone_branch_template` | string | `plan-build-run/{milestone}-{slug}` | Milestone branch name pattern |
| `mode` | string | `enabled` | Git mode: `enabled` or `disabled` |

When `git.mode` is `disabled`, no git commands run at all -- no commits, branching, or hook validation. Useful for prototyping or non-git projects. See `references/git-integration.md` for full branching strategy details.

---

## gates

Confirmation gates that pause execution to ask the user before proceeding. Setting a gate to `false` makes that step automatic.

| Property | Default | When Triggered |
|----------|---------|----------------|
| `confirm_project` | `true` | Before creating a new PBR project (`/pbr:begin`) |
| `confirm_roadmap` | `true` | Before finalizing a roadmap |
| `confirm_plan` | `true` | Before finalizing plans for a phase |
| `confirm_execute` | `false` | Before starting phase execution (`/pbr:build`) |
| `confirm_transition` | `true` | Before transitioning to the next phase |
| `issues_review` | `true` | Before proceeding when issues are detected |

**Key interaction:** Gates are unreachable in `mode: autonomous`. Setting `mode: autonomous` with any gates enabled is a validation error.

---

## safety

Safety controls for destructive or external operations.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `always_confirm_destructive` | boolean | `true` | Always ask before destructive git operations |
| `always_confirm_external_services` | boolean | `true` | Always ask before calling external APIs or services |
| `enforce_phase_boundaries` | boolean | `true` | Prevent agents from working outside their assigned phase scope |

The `always_confirm_destructive` and `always_confirm_external_services` flags cannot be disabled via `/pbr:config`; they require direct editing of `config.json` as a deliberate action.

---

## hooks

Controls behavior of hook scripts that fire during Claude Code lifecycle events.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `autoFormat` | boolean | `false` | Run auto-formatting after file writes |
| `typeCheck` | boolean | `false` | Run type checking after file writes |
| `detectConsoleLogs` | boolean | `false` | Warn when console.log statements are added |
| `blockDocSprawl` | boolean | `false` | Block creation of excessive documentation files |
| `compactThreshold` | integer | `50` | Context budget percentage at which to suggest compaction (10-200) |

All hook checks are disabled by default and must be opted into via config.

---

## debug

Controls debug workflow behavior.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `max_hypothesis_rounds` | integer | `5` | Maximum hypothesis-test cycles the debugger agent runs (1-20) |

This value is overridden by the active depth profile if a `depth_profiles` entry sets `debug.max_hypothesis_rounds`.

---

## depth_profiles

Override the built-in depth profile defaults. Each key (`quick`, `standard`, `comprehensive`) maps to an object of settings that take effect when that depth is active.

**Built-in defaults:**

| Setting | quick | standard | comprehensive |
|---------|-------|----------|---------------|
| `features.research_phase` | `false` | `true` | `true` |
| `features.plan_checking` | `false` | `true` | `true` |
| `features.goal_verification` | `false` | `true` | `true` |
| `features.inline_verify` | `false` | `false` | `true` |
| `scan.mapper_count` | `2` | `4` | `4` |
| `scan.mapper_areas` | `["tech", "arch"]` | `["tech", "arch", "quality", "concerns"]` | `["tech", "arch", "quality", "concerns"]` |
| `debug.max_hypothesis_rounds` | `3` | `5` | `10` |

User overrides in `depth_profiles` merge on top of these defaults. For example, to keep standard depth but increase debug rounds:

```json
{
  "depth": "standard",
  "depth_profiles": {
    "standard": {
      "debug.max_hypothesis_rounds": 8
    }
  }
}
```

---

## spinner_tips

Custom spinner tips shown during agent execution. Requires Claude Code 2.1.45+.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `tips` | string[] | `[]` | Array of custom tip strings to display in the spinner |
| `exclude_defaults` | boolean | `false` | When true, only show custom tips (suppress default Claude Code tips) |

---

## status_line

Controls the status line displayed in the session UI.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `sections` | string[] | `["phase", "plan", "status", "context"]` | Which sections to display; allowed values: `phase`, `plan`, `status`, `context` |
| `brand_text` | string | -- | Custom brand text for the status line |
| `max_status_length` | integer | -- | Maximum character length for the status section (10-200) |

### status_line.context_bar

Controls the visual context budget bar.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `width` | integer | -- | Width of the context bar in characters (1-50) |
| `thresholds.green` | integer | -- | Percentage threshold for green indicator (0-100) |
| `thresholds.yellow` | integer | -- | Percentage threshold for yellow indicator (0-100) |
| `chars.filled` | string | -- | Character used for the filled portion of the bar |
| `chars.empty` | string | -- | Character used for the empty portion of the bar |

---

## Common Configurations

### Quick Solo Development

Minimal overhead for small fixes or solo prototyping. Skips research, plan-checking, and verification. No gates, no branching.

```json
{
  "version": 2,
  "depth": "quick",
  "mode": "interactive",
  "features": {
    "structured_planning": true,
    "goal_verification": false,
    "integration_verification": false,
    "context_isolation": true,
    "atomic_commits": true,
    "research_phase": false,
    "plan_checking": false
  },
  "gates": {
    "confirm_project": false,
    "confirm_roadmap": false,
    "confirm_plan": false,
    "confirm_execute": false,
    "confirm_transition": false,
    "issues_review": false
  },
  "git": {
    "branching": "none",
    "mode": "enabled"
  }
}
```

### Comprehensive Team Workflow

Full verification, team discussions, parallel execution, and all gates enabled. Good for multi-phase projects with code review requirements.

```json
{
  "version": 2,
  "depth": "comprehensive",
  "mode": "interactive",
  "features": {
    "structured_planning": true,
    "goal_verification": true,
    "integration_verification": true,
    "context_isolation": true,
    "atomic_commits": true,
    "research_phase": true,
    "plan_checking": true,
    "tdd_mode": true,
    "inline_verify": true,
    "team_discussions": true
  },
  "parallelization": {
    "enabled": true,
    "plan_level": true,
    "max_concurrent_agents": 3,
    "use_teams": true
  },
  "teams": {
    "planning_roles": ["architect", "security-reviewer", "test-designer"],
    "review_roles": ["functional-reviewer", "security-auditor", "performance-analyst"],
    "coordination": "file-based"
  },
  "gates": {
    "confirm_project": true,
    "confirm_roadmap": true,
    "confirm_plan": true,
    "confirm_execute": true,
    "confirm_transition": true,
    "issues_review": true
  },
  "git": {
    "branching": "phase",
    "mode": "enabled"
  }
}
```

### Autonomous CI/CD Mode

Hands-free execution with no gates and automatic phase chaining. Suitable for CI pipelines or unattended runs.

```json
{
  "version": 2,
  "depth": "standard",
  "mode": "autonomous",
  "features": {
    "structured_planning": true,
    "goal_verification": true,
    "integration_verification": true,
    "context_isolation": true,
    "atomic_commits": true,
    "research_phase": true,
    "plan_checking": true,
    "auto_continue": true,
    "auto_advance": true
  },
  "gates": {
    "confirm_project": false,
    "confirm_roadmap": false,
    "confirm_plan": false,
    "confirm_execute": false,
    "confirm_transition": false,
    "issues_review": false
  },
  "git": {
    "branching": "phase",
    "mode": "enabled"
  },
  "planning": {
    "commit_docs": true
  }
}
```

---

## Troubleshooting

### Validation Errors

Run validation with: `node plugins/pbr/scripts/pbr-tools.js config validate`

**"config.json not found"** -- No `.planning/config.json` exists. Run `/pbr:begin` to create one, or create the file manually.

**"config.json is not valid JSON"** -- Syntax error in the JSON file. Check for trailing commas, missing quotes, or unescaped characters.

**"mode=autonomous with active gates: gates are unreachable in autonomous mode"** -- You set `mode: autonomous` but left one or more gates enabled. Autonomous mode never pauses for confirmation, so enabled gates are contradictory. Set all gates to `false` or switch back to `mode: interactive`.

**"parallelization.max_concurrent_agents=1 with teams.coordination set: teams require concurrent agents to be useful"** -- Teams need multiple agents running in parallel. Either increase `max_concurrent_agents` above 1 or remove the `teams` configuration.

### Validation Warnings

**"features.auto_continue=true with mode=interactive"** -- `auto_continue` only fires in autonomous mode. It has no effect in interactive mode. Either switch to `mode: autonomous` or disable `auto_continue`.

**"parallelization.enabled=false with plan_level=true"** -- `plan_level` is ignored when parallelization is disabled. Either enable parallelization or remove the `plan_level` setting.

### Contradictory Configurations to Avoid

| Configuration | Problem |
|---------------|---------|
| `mode: autonomous` + any gate `true` | Gates never fire in autonomous mode (validation error) |
| `max_concurrent_agents: 1` + `teams.coordination` set | Teams cannot coordinate with only one agent (validation error) |
| `auto_continue: true` + `mode: interactive` | auto_continue is ignored in interactive mode (warning) |
| `parallelization.enabled: false` + `plan_level: true` | plan_level has no effect when parallelization is off (warning) |
| `auto_advance: true` + `mode: interactive` | auto_advance requires autonomous mode to chain phases |
| `tdd_mode: true` + `depth: quick` | quick depth skips verification, which conflicts with TDD's verify-first approach |
| `git.mode: disabled` + `atomic_commits: true` | atomic_commits has no effect when git is disabled |
| `git.branching: phase` + `git.mode: disabled` | Branching settings are ignored when git is disabled |
