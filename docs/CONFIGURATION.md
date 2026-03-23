# PBR Configuration

All PBR settings live in `.planning/config.json`. Created by `/pbr:begin`, modifiable via `/pbr:config` or direct editing. Validated against `config-schema.json`.

---

## Top-Level Settings

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `version` | integer | `2` | Schema version |
| `mode` | string | `interactive` | `interactive` (pauses for input) or `autonomous` (hands-free) |
| `depth` | string | `standard` | `quick`, `standard`, or `comprehensive` -- controls thoroughness |
| `context_strategy` | string | `aggressive` | `aggressive`, `balanced`, or `conservative` context management |
| `context_window_tokens` | integer | `200000` | Context window size (100k-2M). Set `1000000` for 1M models |
| `agent_checkpoint_pct` | integer | `50` | Context % at which agents checkpoint (40-80). Use `65` for 1M |
| `ceremony_level` | string | `auto` | `auto` (risk-classifier), `low`, `medium`, or `high` |
| `orchestrator_budget_pct` | integer | `25` | Context % reserved for orchestrator (15-50) |
| `session_phase_limit` | integer | `3` | Max phases per session before auto-pause (0 = disabled) |
| `session_cycling` | string | `compact` | `tmux`, `compact-first`, `compact`, or `manual` |
| `skip_rag_max_lines` | integer | `50000` | Max LOC for Skip-RAG eligibility |

### Depth Profiles

Each depth level overrides specific features:

| Setting | quick | standard | comprehensive |
|---------|-------|----------|---------------|
| Research phase | off | on | on |
| Plan checking | off | on | on |
| Goal verification | off | on | on |
| Inline verify | off | off | on |
| Mapper areas | 2 | 4 | 4 |
| Debug rounds | 3 | 5 | 10 |

Override built-in defaults via `depth_profiles` in config.json.

---

## Features

Boolean toggles for workflow capabilities.

| Property | Default | Description |
|----------|---------|-------------|
| `structured_planning` | `true` | Phased planning with ROADMAP and plan files |
| `goal_verification` | `true` | Verifier agent runs after builds |
| `integration_verification` | `true` | Cross-phase integration checks |
| `context_isolation` | `true` | Heavy work isolated into subagents |
| `atomic_commits` | `true` | One commit per task |
| `session_persistence` | `true` | State persists via STATE.md |
| `research_phase` | `true` | Researcher runs before planning |
| `plan_checking` | `true` | Plan-checker validates before execution |
| `tdd_mode` | `false` | Red-Green-Refactor (3 commits per task) |
| `status_line` | `true` | Status line in session UI |
| `auto_continue` | `false` | Chain phases via `.auto-next` signal |
| `auto_advance` | `false` | Auto-chain build/review/plan (requires `mode: autonomous`) |
| `inline_verify` | `false` | Per-task verification after each commit |
| `extended_context` | `false` | Aggressive 1M optimizations (5 agents vs 3) |

---

## Models

Per-agent model selection. Values: `sonnet`, `opus`, `haiku`, `inherit`.

| Agent | Default | Description |
|-------|---------|-------------|
| `researcher` | `sonnet` | Research agent model |
| `planner` | `inherit` | Planning agent model |
| `executor` | `inherit` | Execution agent model |
| `verifier` | `sonnet` | Verification agent model |
| `integration_checker` | `sonnet` | Integration check model |
| `debugger` | `inherit` | Debug agent model |
| `mapper` | `sonnet` | Codebase mapper model |
| `synthesizer` | `haiku` | Multi-output synthesis model |

### Complexity Map

Auto-select models by task difficulty:

| Complexity | Default Model |
|-----------|---------------|
| `simple` | `haiku` |
| `medium` | `sonnet` |
| `complex` | `inherit` |

### Custom Profiles

Define named profiles in `model_profiles`:

```json
{
  "model_profiles": {
    "budget": {
      "researcher": "haiku",
      "planner": "sonnet",
      "executor": "sonnet",
      "verifier": "haiku"
    }
  }
}
```

Switch with `/pbr:profile budget`.

---

## Parallelization

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable parallel plan execution |
| `plan_level` | boolean | `true` | Parallelize at plan level |
| `task_level` | boolean | `false` | Parallelize within a plan |
| `max_concurrent_agents` | integer | `3` | Max simultaneous executors (1-10) |
| `min_plans_for_parallel` | integer | `2` | Min plans in wave to trigger parallel |
| `use_teams` | boolean | `false` | Agent Teams for discussion coordination |

---

## Git

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `branching` | string | `none` | `none`, `phase`, `milestone`, `disabled` |
| `commit_format` | string | `{type}({scope}): {description}` | Commit message template |
| `phase_branch_template` | string | `plan-build-run/phase-{phase}-{slug}` | Phase branch name |
| `milestone_branch_template` | string | `plan-build-run/{milestone}-{slug}` | Milestone branch name |
| `mode` | string | `enabled` | `enabled` or `disabled` |
| `auto_pr` | boolean | `false` | Auto-create GitHub PR after verification |

---

## Gates

Confirmation gates that pause execution.

| Property | Default | When Triggered |
|----------|---------|----------------|
| `confirm_project` | `true` | Before new project creation |
| `confirm_roadmap` | `true` | Before finalizing roadmap |
| `confirm_plan` | `true` | Before finalizing phase plans |
| `confirm_execute` | `false` | Before starting execution |
| `confirm_transition` | `true` | Before phase transition |
| `issues_review` | `true` | When issues are detected |

Gates are unreachable in `mode: autonomous`.

---

## Safety

| Property | Default | Description |
|----------|---------|-------------|
| `always_confirm_destructive` | `true` | Confirm before destructive git ops |
| `always_confirm_external_services` | `true` | Confirm before external API calls |
| `enforce_phase_boundaries` | `true` | Prevent agents from leaving scope |

Cannot be disabled via `/pbr:settings` -- requires direct config edit.

---

## Hooks

| Property | Default | Description |
|----------|---------|-------------|
| `autoFormat` | `false` | Auto-format after file writes |
| `typeCheck` | `false` | Type-check after file writes |
| `detectConsoleLogs` | `false` | Warn on console.log additions |
| `blockDocSprawl` | `false` | Block excessive doc file creation |
| `compactThreshold` | `50` | Context % to suggest compaction |

---

## Workflow

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `autonomous` | boolean | `false` | Enable autonomous multi-phase |
| `enforce_pbr_skills` | string | `advisory` | `advisory`, `block`, or `off` |
| `inline_execution` | boolean | `false` | Trivial plans execute inline |
| `inline_max_tasks` | integer | `2` | Max tasks for inline eligibility |
| `inline_max_files` | integer | `5` | Max files for inline eligibility |
| `speculative_planning` | boolean | `false` | Plan N+1 while executing N |
| `speculative_depth` | integer | `2` | Phases ahead to plan (1-5) |
| `phase_boundary_clear` | string | `off` | `recommend`, `enforce`, or `off` |
| `validate_phase` | boolean | `true` | Validate phase before execution |

---

## Verification

| Property | Default | Description |
|----------|---------|-------------|
| `confidence_gate` | `false` | Skip verification if executor reports 100% completion |
| `confidence_threshold` | `1.0` | Min confidence to skip (0.5-1.0) |

---

## CI

| Property | Default | Description |
|----------|---------|-------------|
| `ci.gate_enabled` | `false` | Block wave advancement until CI passes |
| `ci.wait_timeout_seconds` | `120` | Max seconds to wait for CI |

---

## Autonomy

| Property | Default | Description |
|----------|---------|-------------|
| `level` | `supervised` | `supervised`, `guided`, `collaborative`, or `adaptive` |
| `error_strategy` | `retry` | `retry` or `stop` |
| `max_retries` | `2` | Max autonomous retry attempts |

---

## Other Settings

| Section | Key Properties | Description |
|---------|---------------|-------------|
| `debug` | `max_hypothesis_rounds` (5) | Debug workflow limits |
| `deployment` | `smoke_test_command` | Post-milestone health check |
| `planning` | `commit_docs` (true), `max_tasks_per_plan` (3) | Planning behavior |
| `teams` | `planning_roles`, `review_roles`, `synthesis_model` | Agent Teams config |
| `spinner_tips` | `tips`, `exclude_defaults` | Custom spinner messages |
| `status_line` | `sections`, `brand_text`, `context_bar` | Status line appearance |
| `context_budget` | `threshold_curve` | Warning threshold scaling |
| `context_ledger` | `enabled` | Context composition tracking |
