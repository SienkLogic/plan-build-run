# Config Reference Guide

Complete reference for `.planning/config.json` -- the file that controls all Plan-Build-Run workflow behavior. Created by `/pbr:new-project`, modifiable via `/pbr:settings` or direct editing. Validated against `config-schema.json`.

---

## Top-Level Fields

| Property | Type | Allowed Values | Default | Description |
|----------|------|---------------|---------|-------------|
| `version` | integer | `1`, `2` | `2` | Schema version; v1 configs are auto-migrated to v2 on load |
| `context_strategy` | string | `aggressive`, `conservative`, `balanced` | `aggressive` | How aggressively PBR manages the context budget |
| `mode` | string | `interactive`, `autonomous` | `interactive` | Whether PBR pauses for user input or runs hands-free |
| `depth` | string | `quick`, `standard`, `comprehensive` | `standard` | Controls thoroughness of research, planning, and verification |
| `session_phase_limit` | integer | `0`-`20` | `3` | Maximum phases to complete per session before auto-pause. Set to `0` to disable. Only effective when `features.auto_continue` is `true`. |
| `context_window_tokens` | integer | `100000`-`2000000` | `200000` | Context window size in tokens for the active Claude model. Scales hook thresholds and agent budgets. Set to `1000000` for 1M-context models. |
| `agent_checkpoint_pct` | integer | `40`-`80` | `50` | Context usage % at which agents checkpoint. Set to `65` for 1M-context models. |
| `ceremony_level` | string | `auto`, `low`, `medium`, `high` | `auto` | Override risk-based ceremony. `auto` = classifier decides per task. |
| `orchestrator_budget_pct` | integer | `15`-`50` | `25` | Percentage of context window reserved for the orchestrator. Higher values enable more inline work. |
| `session_cycling` | string | `tmux`, `compact-first`, `compact`, `manual` | `compact` | What happens when session phase limit is reached. `tmux` auto-cycles via tmux send-keys; `compact-first` tries `/compact` before cycling (recommended for 1M); `compact` instructs user to compact and resume; `manual` shows a banner only. |
| `skip_rag_max_lines` | integer | `1000`-`500000` | `50000` | Maximum project LOC for Skip-RAG eligibility. Projects under this threshold can load entire codebase into context when `features.skip_rag` is enabled. |

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

### context_window_tokens

Sets the active model's context window size in tokens. This is the single source of truth for context scaling across all PBR subsystems.

| Value | Meaning |
|-------|---------|
| `200000` | Default — Claude Sonnet, Haiku, and most standard models |
| `1000000` | Claude models with 1M extended context (set by `quality` model profile) |

Arbitrary integer values between `100000` and `2000000` are valid. Set to your model's actual context window size for accurate threshold scaling.

### agent_checkpoint_pct

The context usage percentage at which agents should stop work and return output (checkpoint). Higher values let agents do more work per invocation at the cost of less headroom before context compaction.

| Value | Meaning |
|-------|---------|
| `50` | Default — agents checkpoint at 50% usage (standard for 200k models) |
| `65` | Recommended for 1M-context models — agents can safely work to 65% |

Valid range: `40`–`80`. Values outside this range are rejected by schema validation. Set by the `quality` profile to `65`; all other profiles default to `50`.

### ceremony_level

| Value | Behavior |
|-------|----------|
| `auto` | Risk-classifier decides ceremony per task (default) |
| `low` | Inline execution, no plan file generated |
| `medium` | Lightweight plan, minimal verification |
| `high` | Full plan-build-verify cycle for every task |

### orchestrator_budget_pct

Controls how much of the context window the orchestrator (main skill) reserves for its own use before delegating to subagents. Higher values allow more inline work; lower values force earlier delegation.

| Value | Meaning |
|-------|---------|
| `25` | Default for 200k models -- delegates early |
| `35` | Recommended for 1M models -- more inline work before delegation |

### session_cycling

Controls the behavior when the session reaches its `session_phase_limit`.

| Value | Behavior |
|-------|----------|
| `tmux` | Auto-cycle via tmux `send-keys` (requires TMUX environment) |
| `compact-first` | Try `/compact` before cycling; recommended for 1M context models |
| `compact` | Instruct user to run `/compact` then `/pbr:resume-work` (default) |
| `manual` | Show banner only; user decides next action |

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
| `extended_context` | `false` | Enable aggressive 1M context optimizations: higher concurrency (5 agents vs 3), default team review, always-parallel scan, pre-load build steps. Auto-set by quality profile. Safe optimizations (parallel research, full SUMMARY reads) use `context_window_tokens >= 500000` instead. |

**Notable interactions:**
- `goal_verification: false` skips post-build verification; the build skill suggests running `/pbr:verify-work` manually.
- `auto_continue: true` writes `.planning/.auto-next` containing the next command (e.g., `/pbr:plan-phase 4`).
- `auto_advance: true` requires `mode: autonomous` to function. Hard stops at checkpoints, verification gaps, errors, and milestone boundaries.
- `inline_verify: true` spawns a haiku-model verifier after each plan within a wave, catching issues before dependent plans run.
- `session_phase_limit: N` (top-level) triggers auto-pause after N phases when `auto_continue: true`. In TMUX, the pause auto-cycles to a fresh session.
- `extended_context: true` enables aggressive parallelization and deeper context usage. Requires `context_window_tokens >= 500000` to have any effect. Automatically set by the `quality` model profile. Safe optimizations (parallel researcher+seed-scan, full SUMMARY reads, pre-load steps) remain gated on `context_window_tokens >= 500000` only — they do not require this flag.

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

**Auto-detection:** If `.planning/` is gitignored, `commit_docs` is automatically `false` regardless of `config.json`. This prevents git errors when users have `.planning/` in `.gitignore`.

### search_gitignored Behavior

When `false` (default): Standard ripgrep behavior respects `.gitignore`. Direct path searches (`rg "pattern" .planning/`) still work, but broad searches (`rg "pattern"`) skip gitignored directories. When `true`: Adds `--no-ignore` to broad searches that should include `.planning/`.

### Uncommitted Mode Setup

To keep planning artifacts out of version control:

1. Set `"planning": { "commit_docs": false, "search_gitignored": true }` in config
2. Add `.planning/` to `.gitignore`
3. If `.planning/` was previously tracked: `git rm -r --cached .planning/ && git commit -m "chore: stop tracking planning docs"`

---

## git

Controls git integration and branching strategy.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `branching` | string | `none` | Branching strategy: `none`, `phase`, `milestone`, `disabled`. Recommended: `phase` -- enables safe undo via phase manifests and clean PR history |
| `commit_format` | string | `{type}({scope}): {description}` | Commit message template. Use a short descriptive word as the scope (e.g., `auth`, `config`, `executor`) rather than phase-plan numbers. |
| `phase_branch_template` | string | `plan-build-run/phase-{phase}-{slug}` | Phase branch name pattern |
| `milestone_branch_template` | string | `plan-build-run/{milestone}-{slug}` | Milestone branch name pattern |
| `mode` | string | `enabled` | Git mode: `enabled` or `disabled` |
| `auto_pr` | boolean | `false` | Create a GitHub PR after successful phase verification when branching is enabled |

When `git.mode` is `disabled`, no git commands run at all -- no commits, branching, or hook validation. Useful for prototyping or non-git projects. See `references/git-integration.md` for full branching strategy details.

---

## ci

Controls CI integration for build gates.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `ci.gate_enabled` | boolean | `false` | Block wave advancement until CI passes |
| `ci.wait_timeout_seconds` | number | `120` | Max seconds to wait for CI completion |

---

## gates

Confirmation gates that pause execution to ask the user before proceeding. Setting a gate to `false` makes that step automatic.

| Property | Default | When Triggered |
|----------|---------|----------------|
| `confirm_project` | `true` | Before creating a new PBR project (`/pbr:new-project`) |
| `confirm_roadmap` | `true` | Before finalizing a roadmap |
| `confirm_plan` | `true` | Before finalizing plans for a phase |
| `confirm_execute` | `false` | Before starting phase execution (`/pbr:execute-phase`) |
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

The `always_confirm_destructive` and `always_confirm_external_services` flags cannot be disabled via `/pbr:settings`; they require direct editing of `config.json` as a deliberate action.

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

## deployment

Controls post-milestone deployment verification.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `deployment.smoke_test_command` | string | `""` | Bash command to run after milestone completion (e.g., `"curl -sf https://myapp.com/health"`) |

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

## session_phase_limit

Controls how many phases PBR completes in a single session before suggesting a pause-and-resume cycle. This prevents context degradation in long autonomous runs.

| Value | Behavior |
|-------|----------|
| `0` | Disabled -- PBR never auto-pauses for session cycling |
| `1`-`20` | After completing this many phases, PBR writes `/pbr:pause-work` to `.auto-next` and triggers a session cycle |

**Interaction with TMUX:** When running inside a TMUX session, the auto-pause automatically sends `/clear` and `/pbr:resume-work` to the current pane after a 3-second delay, creating a seamless session cycle. Outside TMUX, a banner instructs the user to manually run `/clear` then `/pbr:resume-work`.

**Tracking:** Phase completions are tracked in `.planning/.session-tracker` (reset each session start). The counter increments when an executor subagent completes successfully.

See `references/archive/tmux-setup.md` for TMUX environment setup.

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

## autonomy

Progressive autonomy control for agent behavior.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `level` | string | `supervised` | Autonomy level: `supervised` (human approves all), `guided` (AI acts, human reviews async), `collaborative` (AI handles routine, escalates novel), `adaptive` (AI adjusts own autonomy per task confidence) |
| `error_strategy` | string | `retry` | How agents handle errors: `retry` or `stop` |
| `max_retries` | integer | `2` | Maximum retry attempts for autonomous error recovery |

---

## model_profiles

User-defined custom model profiles. Each key is a profile name (e.g., `budget`, `quality`); the value maps agent names to model strings (`sonnet`, `opus`, `haiku`, `inherit`). Partial profiles are allowed -- omitted agents fall back to the active profile defaults.

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

Agent keys match the `models` section: `researcher`, `planner`, `executor`, `verifier`, `integration_checker`, `debugger`, `mapper`, `synthesizer`.

---

## workflow

Controls workflow-level execution behavior including inline execution, speculative planning, and phase boundaries.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `autonomous` | boolean | `false` | Enable `/pbr:autonomous` for hands-free multi-phase execution |
| `enforce_pbr_skills` | string | `advisory` | PBR workflow compliance enforcement: `advisory` (warn), `block` (prevent non-PBR edits), `off` (disabled) |
| `inline_execution` | boolean | `false` | Trivial plans execute inline without spawning a subagent |
| `inline_max_tasks` | integer | `2` | Maximum tasks for inline execution eligibility (1-5) |
| `inline_max_files` | integer | `5` | Maximum files for inline execution eligibility (1-20) |
| `inline_max_lines` | integer | `50` | Maximum estimated lines of change for inline execution (10-500) |
| `inline_context_cap_pct` | integer | `40` | Context usage % above which always spawn subagent (10-80) |
| `max_phases_in_context` | integer | `3` | Max phase plans held simultaneously by orchestrator (1-10) |
| `phase_boundary_clear` | string | `off` | `/clear` at phase boundaries: `recommend` (advisory), `enforce` (block without `/clear`), `off` |
| `phase_replay` | boolean | `false` | Failed verification triggers replay with enriched context |
| `speculative_planning` | boolean | `false` | Plan phase N+1 while executor runs phase N |
| `speculative_depth` | integer | `2` | How many phases ahead to speculatively plan (1-5) |
| `validate_phase` | boolean | `true` | Validate phase structure before execution |

---

## verification

Controls post-build verification behavior.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `confidence_gate` | boolean | `false` | Skip verification if executor reports 100% must-have completion and tests pass |
| `confidence_threshold` | number | `1.0` | Minimum completion confidence (0.5-1.0) required to skip verification |
| `qa_rounds` | integer | `1` | Number of build-QA-build iteration rounds (1-5). 1 = current behavior (single build + verify). Higher values enable progressive deepening: round 1 standard (L1-L3), round 2 thorough (L1-L4), round 3+ thorough + live verification if enabled. |
| `live_tools` | string[] | `["chrome-mcp"]` | MCP tool providers for live interaction verification. Currently only `chrome-mcp` is supported. |
| `live_timeout_ms` | integer | `60000` | Maximum time in milliseconds for each live interaction verification check (minimum 5000). |

When `confidence_gate` is `true` and the executor SUMMARY reports all must-haves as DONE with commit SHAs, the build skill can auto-mark the phase as verified without spawning a verifier agent.

### features.live_verification

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `features.live_verification` | boolean | `false` | Opt-in flag to enable live browser/API testing during verification. Requires Chrome MCP tools to be configured. |

When enabled, the verifier agent gains access to `live_tools` (e.g., `chrome-mcp`) for browser automation during verification rounds. This is gated behind a feature flag because it requires external MCP tool providers and adds latency. Only effective when `verification.qa_rounds >= 3` or when explicitly requested by the plan.

---

## context_budget

Controls context budget warning thresholds.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `threshold_curve` | string | `linear` | Warning threshold scaling: `linear` (fixed 50/70/85%) or `adaptive` (shifts up for 1M context: 60/75/85%) |

Use `adaptive` with `context_window_tokens >= 500000` to reduce premature compaction warnings.

---

## context_ledger

Tracks what files are loaded in context and when they become stale.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable context composition tracking via `track-context-budget.js` |
| `stale_after_minutes` | integer | `60` | Minutes before a context read is considered stale for compact suggestions (5-1440) |

When enabled, the hook records file path, timestamp, estimated tokens, and active phase per Read call in `.planning/.context-ledger.json`.

---

## hook_server

Persistent HTTP hook server for faster hook execution. When enabled, hooks POST to the server instead of spawning per-hook Node.js processes.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | boolean | `false` | Route hooks through the persistent HTTP server |
| `port` | integer | `19836` | TCP port the hook server listens on (127.0.0.1 only, 1024-65535) |
| `event_log` | boolean | `true` | Append all hook events to `.planning/.hook-events.jsonl` |

---

## intel

Persistent codebase intelligence system providing architecture maps and file dependency graphs.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable the intel system. When `false`, all intel features are no-ops. |
| `auto_update` | boolean | `false` | PostToolUse hooks queue intel updates when code files change |
| `inject_on_start` | boolean | `false` | SessionStart hook injects `.planning/intel/arch.md` summary into context |

When fully enabled, the `/pbr:intel` skill generates architecture maps, module graphs, and convention summaries in `.planning/intel/`.

---

## learnings

Cross-phase knowledge transfer system. Executors write `LEARNINGS.md` files; planners read prior learnings for context.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable cross-phase learning |
| `read_depth` | integer | `3` | Number of prior phases' LEARNINGS.md files the planner reads (1-20) |
| `cross_project_knowledge` | boolean | `false` | Copy learnings marked `cross_project: true` to `~/.claude/pbr-knowledge/` for reuse across projects |

---

## dashboard

Web UI for browsing `.planning/` state.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `auto_launch` | boolean | `false` | Automatically launch dashboard when starting a PBR session |
| `port` | integer | `3141` | TCP port for the dashboard server (1024-65535) |

Launch manually with: `npm run dashboard -- --dir /path/to/project --port 3141`

---

## developer_profile

Behavioral profiling from session history with optional prompt injection for personalized agent communication.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable developer profiling. When `true`, `/pbr:profile-user` skill generates behavioral profiles. |
| `inject_prompts` | boolean | `false` | Inject `USER-PROFILE.md` summary into agent prompts for personalized communication |

---

## prd

Settings for PRD (Product Requirements Document) import via `/pbr:import --prd`.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `auto_extract` | boolean | `false` | Skip the confirmation gate during PRD import and write files immediately |

---

## timeouts

Timeout limits for various operations in milliseconds.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `task_default_ms` | integer | `300000` | Default timeout per task (5 minutes). Minimum: 30000. |
| `build_max_ms` | integer | `600000` | Maximum time for entire build command (10 minutes). Minimum: 60000. |
| `verify_max_ms` | integer | `300000` | Maximum time for verification (5 minutes). Minimum: 30000. |

---

## ui

Controls the UI design pipeline for frontend projects.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable UI design pipeline. When `true`, `/pbr:ui-phase` and `/pbr:ui-review` skills are available. Auto-detected for frontend projects unless explicitly set. |

---

## worktree

Settings for agents running with `isolation: worktree` in their agent definition.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `sparse_paths` | string[] | `[]` | Glob patterns for sparse checkout in worktrees (e.g., `["src/**", "package.json", ".planning/**"]`). Empty array = full checkout. |

---

## audit

Audit system configuration for `/pbr:audit`. Controls which audit dimensions run and their thresholds.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `preset` | string | `standard` | Audit preset: `minimal`, `standard`, `comprehensive`, `custom` |
| `categories` | object | *(all true)* | Per-category enable/disable toggles (overrides preset defaults) |
| `overrides` | object | `{}` | Per-dimension enable/disable by ID (e.g., `"SI-01": false`) |
| `thresholds` | object | *(see below)* | Tunable numeric thresholds referenced by audit dimensions |

### audit.categories

| Property | Default | Description |
|----------|---------|-------------|
| `self_integrity` | `true` | Self-integrity checks |
| `infrastructure` | `true` | Infrastructure health checks |
| `error_analysis` | `true` | Error pattern analysis |
| `workflow_compliance` | `true` | PBR workflow compliance |
| `behavioral_compliance` | `true` | Agent behavioral compliance |
| `session_quality` | `true` | Session quality metrics |
| `feature_verification` | `true` | Feature flag verification |
| `quality_metrics` | `true` | Code quality metrics |

### audit.thresholds

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `hook_performance_ms` | integer | `500` | Hook execution time warning threshold |
| `session_duration_warn_ms` | integer | `3600000` | Session duration warning (1 hour) |
| `tool_failure_rate_warn` | number | `0.10` | Tool failure rate warning threshold (0-1) |
| `stale_file_age_hours` | integer | `24` | Hours before a planning file is considered stale |
| `retry_pattern_min_count` | integer | `3` | Minimum retries before flagging a retry pattern |
| `agent_timeout_ms` | integer | `600000` | Agent execution timeout (10 minutes) |
| `disk_usage_warn_mb` | integer | `50` | `.planning/` disk usage warning in MB |
| `log_rotation_max_days` | integer | `30` | Maximum age for log files before rotation |

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

## Global Defaults File

PBR supports user-level default preferences stored at `~/.claude/pbr-defaults.json`. When creating a new project via `/pbr:new-project` or `/pbr:settings` Quick Start, these defaults pre-populate configuration fields instead of hardcoded values.

**Location:** `~/.claude/pbr-defaults.json` (created by `config save-defaults`)

**Commands:**
- `pbr-tools.js config save-defaults` -- Save current project config as global defaults (only portable keys: mode, depth, features, models, parallelization, planning, git, gates, safety, hooks, dashboard, status_line)
- `pbr-tools.js config load-defaults` -- Load global defaults (returns JSON or `{ exists: false }`)

**Portable keys saved:** mode, depth, context_strategy, features, models, parallelization, planning, git, gates, safety, hooks, dashboard, status_line. Project-specific state (version, schema_version) is excluded.

**Precedence:** Global defaults < project config.json < CLI arguments. Global defaults only affect new project creation and Quick Start flow.

---

## Troubleshooting

### Validation Errors

Run validation with: `pbr-tools config validate`

**"config.json not found"** -- No `.planning/config.json` exists. Run `/pbr:new-project` to create one, or create the file manually.

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
