# Configuration Reference

Complete reference for `.planning/config.json` -- the file that controls all Plan-Build-Run workflow behavior. Created by `/pbr:new-project`, modifiable via `/pbr:settings` or direct editing. Validated against `config-schema.json`.

---

## Top-Level Fields

| Property | Type | Allowed Values | Default | Description |
|----------|------|---------------|---------|-------------|
| `version` | integer | `1`, `2` | `2` | Schema version; v1 configs are auto-migrated to v2 on load |
| `schema_version` | integer | `1`, `2` | `2` | Config schema version for migration detection |
| `context_strategy` | string | `aggressive`, `conservative`, `balanced` | `aggressive` | How aggressively PBR manages the context budget |
| `mode` | string | `interactive`, `autonomous` | `interactive` | Whether PBR pauses for user input or runs hands-free |
| `depth` | string | `quick`, `standard`, `comprehensive` | `standard` | Controls thoroughness of research, planning, and verification |
| `session_phase_limit` | integer | `0`-`20` | `3` | Maximum phases to complete per session before auto-pause. `0` = disabled |

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

## Phase 14: Quality & Safety

Phase 14 adds three configurable quality and safety features to the build workflow.

### features (Phase 14 toggles)

| Property | Default | Description |
|----------|---------|-------------|
| `features.multi_layer_validation` | `false` | Enables parallel multi-layer review passes (BugBot-style). When true, build skill spawns one reviewer Task() per pass listed in `validation_passes`. Default false to preserve budget. Set to true for quality profile. |
| `features.regression_prevention` | `true` | Enables smart test selection — maps changed files to affected test files by naming convention. When enabled, build skill scopes test runs to relevant files instead of always running the full suite. |
| `features.security_scanning` | `true` | Enables OWASP-style security scanning of changed files during build. Checks for hardcoded secrets, eval usage, shell injection, path traversal, prototype pollution, unsafe regex, and other vulnerabilities. |

### validation_passes

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `validation_passes` | string[] | `["correctness", "security"]` | Ordered list of pass names run when `features.multi_layer_validation` is true. |

**Available pass names:**

| Pass | Focus | Severity |
|------|-------|----------|
| `correctness` | Logic errors, edge cases, off-by-one, null handling | high |
| `security` | Injection, auth bypass, secrets exposure, OWASP Top 10 | high |
| `performance` | O(n²) loops, unnecessary allocations, blocking I/O | medium |
| `style` | Naming conventions, code organization, consistency | low |
| `tests` | Missing test coverage, weak assertions, flaky patterns | medium |
| `accessibility` | ARIA labels, keyboard nav, screen reader compat | medium |
| `docs` | Missing JSDoc, outdated comments, README drift | low |
| `deps` | Outdated deps, unused imports, license conflicts, CVEs | medium |

**Profile defaults:**

| Setting | quick | standard | comprehensive |
|---------|-------|----------|---------------|
| `features.multi_layer_validation` | `false` | `false` | `true` |
| `features.regression_prevention` | `true` | `true` | `true` |
| `features.security_scanning` | `true` | `true` | `true` |
| `validation_passes` | `["correctness"]` | `["correctness", "security"]` | `["correctness", "security", "performance", "tests"]` |

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
| `inline_verify` | `false` | Per-task verification after each executor commit |

**Notable interactions:**
- `goal_verification: false` skips post-build verification; the build skill suggests running `/pbr:verify-work` manually.
- `auto_continue: true` writes `.planning/.auto-next` containing the next command.
- `auto_advance: true` requires `mode: autonomous`. Hard stops at checkpoints, verification gaps, errors, and milestone boundaries.
- `inline_verify: true` spawns a haiku-model verifier after each plan within a wave.
- `session_phase_limit` (top-level) triggers auto-pause after N phases when `auto_continue: true`.

---

## models

Per-agent model selection. Valid values: `sonnet`, `opus`, `haiku`, `inherit`.

| Property | Default | Description |
|----------|---------|-------------|
| `researcher` | `sonnet` | Model for the researcher agent |
| `planner` | `inherit` | Model for the planner agent |
| `executor` | `inherit` | Model for the executor agent |
| `verifier` | `sonnet` | Model for the verifier agent |
| `integration_checker` | `sonnet` | Model for the integration-checker agent |
| `debugger` | `inherit` | Model for the debugger agent |
| `mapper` | `sonnet` | Model for the codebase-mapper agent |
| `synthesizer` | `haiku` | Model for the synthesizer agent |

### models.complexity_map

Maps task complexity to model tiers for auto-selection.

| Property | Default | Description |
|----------|---------|-------------|
| `simple` | `haiku` | Model for simple tasks |
| `medium` | `sonnet` | Model for medium-complexity tasks |
| `complex` | `inherit` | Model for high-complexity tasks |

### model_profiles

User-defined custom model profiles. Each key is a profile name; value maps agent names to model strings. Partial profiles allowed -- omitted agents fall back to the active profile defaults.

---

## parallelization

Controls whether and how plans execute concurrently within a wave.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable parallel plan execution |
| `plan_level` | boolean | `true` | Parallelize at plan level (multiple plans in same wave) |
| `task_level` | boolean | `false` | Parallelize at task level within a plan |
| `max_concurrent_agents` | integer | `3` | Maximum simultaneous executor subagents (1-10) |
| `min_plans_for_parallel` | integer | `2` | Minimum plans in a wave to trigger parallel execution |
| `use_teams` | boolean | `false` | Use Agent Teams for coordination |

---

## teams

Configures Agent Teams for multi-perspective planning and review discussions.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `planning_roles` | string[] | `["architect", "security-reviewer", "test-designer"]` | Roles for team planning discussions |
| `review_roles` | string[] | `["functional-reviewer", "security-auditor", "performance-analyst"]` | Roles for team review discussions |
| `synthesis_model` | string | `sonnet` | Model for the synthesizer agent that combines team outputs |
| `coordination` | string | `file-based` | How team members coordinate: `file-based` or `sequential` |

---

## planning

Controls planning behavior and documentation.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `commit_docs` | boolean | `true` | Commit planning docs after builds |
| `max_tasks_per_plan` | integer | `3` | Maximum tasks per plan (1-10) |
| `search_gitignored` | boolean | `false` | Include gitignored files in codebase scanning |

---

## git

Controls git integration and branching strategy.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `branching` | string | `none` | Strategy: `none`, `phase`, `milestone`, `disabled` |
| `commit_format` | string | `{type}({scope}): {description}` | Commit message template |
| `phase_branch_template` | string | `plan-build-run/phase-{phase}-{slug}` | Phase branch name pattern |
| `milestone_branch_template` | string | `plan-build-run/{milestone}-{slug}` | Milestone branch name pattern |
| `mode` | string | `enabled` | Git mode: `enabled` or `disabled` |

---

## gates

Confirmation gates that pause execution for user approval. Setting to `false` makes that step automatic.

| Property | Default | When Triggered |
|----------|---------|----------------|
| `confirm_project` | `true` | Before creating a new PBR project |
| `confirm_roadmap` | `true` | Before finalizing a roadmap |
| `confirm_plan` | `true` | Before finalizing plans for a phase |
| `confirm_execute` | `false` | Before starting phase execution |
| `confirm_transition` | `true` | Before transitioning to the next phase |
| `issues_review` | `true` | Before proceeding when issues are detected |
| `confirm_research` | `true` | Before research phase |
| `confirm_seeds` | `true` | Before seed selection |
| `confirm_deferred` | `true` | Before deferred item review |
| `confirm_commit_docs` | `true` | Before committing planning docs |
| `auto_checkpoints` | `false` | Auto-resolve `checkpoint:human-verify` tasks if automated verify passes |

---

## safety

Safety controls for destructive or external operations.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `always_confirm_destructive` | boolean | `true` | Always ask before destructive git operations |
| `always_confirm_external_services` | boolean | `true` | Always ask before calling external APIs |
| `enforce_phase_boundaries` | boolean | `true` | Prevent agents from working outside assigned phase scope |

---

## timeouts

Controls execution timeouts.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `task_default_ms` | integer | `300000` | Default timeout per task in milliseconds (5 min) |
| `build_max_ms` | integer | -- | Maximum time for entire build command |
| `verify_max_ms` | integer | -- | Maximum time for verification |

---

## hooks

Controls behavior of hook scripts.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `autoFormat` | boolean | `false` | Run auto-formatting after file writes |
| `typeCheck` | boolean | `false` | Run type checking after file writes |
| `detectConsoleLogs` | boolean | `false` | Warn when console.log statements are added |
| `blockDocSprawl` | boolean | `false` | Block excessive documentation file creation |
| `compactThreshold` | integer | `50` | Context budget % at which to suggest compaction (10-200) |

---

## debug

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `max_hypothesis_rounds` | integer | `5` | Maximum hypothesis-test cycles the debugger runs (1-20) |

---

## depth_profiles

Override built-in depth profile defaults. Each key (`quick`, `standard`, `comprehensive`) maps to settings that take effect when that depth is active.

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

---

## prd

Settings for PRD import via `/pbr:import --prd`.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `auto_extract` | boolean | `false` | Skip confirmation gate during PRD import |

---

## spinner_tips

Custom spinner tips shown during agent execution (Claude Code 2.1.45+).

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `tips` | string[] | `[]` | Custom tip strings to display |
| `exclude_defaults` | boolean | `false` | Only show custom tips, suppress defaults |

---

## dashboard

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `auto_launch` | boolean | `false` | Auto-launch dashboard on session start |
| `port` | integer | `3141` | Dashboard server port (1024-65535) |

---

## status_line

Controls the status line displayed in session UI.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `sections` | string[] | `["phase", "plan", "status", "context"]` | Which sections to display |
| `brand_text` | string | -- | Custom brand text |
| `max_status_length` | integer | -- | Max character length for status section (10-200) |

### status_line.context_bar

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `width` | integer | -- | Width in characters (1-50) |
| `thresholds.green` | integer | -- | Green threshold (0-100) |
| `thresholds.yellow` | integer | -- | Yellow threshold (0-100) |
| `chars.filled` | string | -- | Filled bar character |
| `chars.empty` | string | -- | Empty bar character |

---

## workflow

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enforce_pbr_skills` | string | `advisory` | Enforcement level: `advisory`, `block`, `off` |

---

## hook_server

Persistent HTTP hook server settings.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | boolean | `false` | Route hook events to persistent server |
| `port` | integer | `19836` | TCP port (127.0.0.1 only, 1024-65535) |
| `event_log` | boolean | `true` | Append events to `.planning/.hook-events.jsonl` |

---

## local_llm

Offloads selected inference tasks to a locally running Ollama instance.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable local LLM offloading |
| `provider` | string | `ollama` | Backend provider (only `ollama` supported) |
| `endpoint` | string | `http://localhost:11434` | Ollama API base URL |
| `model` | string | `qwen2.5-coder:7b` | Model tag for local inference |
| `timeout_ms` | integer | `3000` | Per-request timeout (>= 500ms) |
| `max_retries` | integer | `1` | Retry attempts before fallback |
| `fallback` | string | `frontier` | Fallback on failure: `frontier` or `skip` |
| `routing_strategy` | string | `local_first` | `local_first` or `frontier_first` |

### local_llm.features

| Property | Default | Description |
|----------|---------|-------------|
| `artifact_classification` | `true` | Classify artifact types locally |
| `task_validation` | `true` | Validate task scope locally |
| `plan_adequacy` | `false` | Check plan adequacy locally |
| `gap_detection` | `false` | Detect gaps locally |
| `context_summarization` | `false` | Summarize context windows locally |
| `source_scoring` | `false` | Score source files locally |
| `commit_classification` | `false` | Classify commit types locally |
| `test_triage` | `false` | Triage test failures locally |
| `file_intent_classification` | `false` | Classify file intent locally |

### local_llm.metrics

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable metrics logging |
| `log_file` | string | -- | Custom log file path |
| `show_session_summary` | boolean | `false` | Show summary at session end |
| `frontier_token_rate` | number | -- | Estimated frontier token cost rate |

### local_llm.advanced

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `confidence_threshold` | number | `0.9` | Minimum confidence for local output (0-1) |
| `max_input_tokens` | integer | `2000` | Truncate inputs longer than this |
| `keep_alive` | string | `30m` | How long Ollama keeps model loaded |
| `num_ctx` | integer | `4096` | Context window size (must be 4096 on Windows) |
| `disable_after_failures` | integer | `3` | Auto-disable after N consecutive failures |
| `shadow_mode` | boolean | `false` | Run local in parallel with frontier but discard results |
