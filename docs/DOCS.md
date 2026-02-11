# Towline Documentation

Comprehensive reference for Towline v2. For an overview and quick start, see [README.md](README.md).

---

## Table of Contents

- [Skills Reference](#skills-reference)
  - [Core Workflow](#core-workflow)
  - [Planning & Discovery](#planning--discovery)
  - [Execution](#execution)
  - [Verification & Debugging](#verification--debugging)
  - [Session Management](#session-management)
  - [Project Management](#project-management)
- [Agents Reference](#agents-reference)
- [Configuration Reference](#configuration-reference)
- [Hooks Reference](#hooks-reference)
- [Project Structure](#project-structure)
- [Shared Conventions](#shared-conventions)

---

## Skills Reference

### Core Workflow

#### `/dev:begin` — Project Initialization

Start a new project through deep questioning, domain research, requirements scoping, and roadmap generation.

**Syntax**: `/dev:begin`

**Agents spawned**: 2-4 `towline-researcher` (parallel, count based on depth) + 1 `towline-synthesizer` + 1 `towline-planner`

**Cost**: High (4-6 agents)

**Files created**:
- `.planning/config.json` — workflow configuration
- `.planning/PROJECT.md` — project vision and scope
- `.planning/REQUIREMENTS.md` — scoped requirements with REQ-IDs
- `.planning/ROADMAP.md` — phase structure with goals and dependencies
- `.planning/STATE.md` — current position tracker
- `.planning/CONTEXT.md` — decisions and constraints
- `.planning/research/` — domain research outputs + SUMMARY.md synthesis
- `.planning/phases/{NN}-{slug}/` — empty phase directories

**Behavior**:
- Detects existing code (brownfield) and suggests `/dev:scan` first
- Adaptive questioning — deeper at `comprehensive` depth, lighter at `quick`
- Research depth scales: `quick` skips research, `standard` spawns 2 researchers, `comprehensive` spawns 4
- Interactive requirements scoping classifies each requirement as v1 / v2 / out-of-scope
- Assigns REQ-IDs in format `{CATEGORY}-{NN}` (e.g., `AUTH-01`, `UI-03`)
- Creates phase directories immediately after roadmap approval

---

#### `/dev:plan` — Phase Planning

Research the phase, create executable plans, and verify them before building.

**Syntax**: `/dev:plan <N> [flags]`

| Argument | Meaning |
|----------|---------|
| `3` | Plan phase 3 |
| `3 --skip-research` | Plan without research (faster, cheaper) |
| `3 --assumptions` | Surface Claude's assumptions before planning (zero cost, inline only) |
| `3 --gaps` | Create gap-closure plans from VERIFICATION.md failures |
| `add` | Append a new phase to the end of the roadmap |
| `insert 3.1` | Insert a phase between 3 and 4 using decimal numbering |
| `remove 5` | Remove phase 5 and renumber subsequent phases |
| (no number) | Use current phase from STATE.md |

**Agents spawned**: 1 `towline-researcher` (conditional) + 1 `towline-planner` + 1 `towline-plan-checker` (conditional)

**Cost**: Medium (2-3 agents)

**Files created/updated**:
- `.planning/phases/{NN}-{slug}/RESEARCH.md` — phase-specific research
- `.planning/phases/{NN}-{slug}/{phase}-{NN}-PLAN.md` — executable plan(s)
- `.planning/CONTEXT.md` — updated with assumption corrections

**Behavior**:
- Plans contain 2-3 tasks each, targeting 5-8 files per plan
- Each plan gets a wave assignment for parallel execution ordering
- Plan checker runs a revision loop (max 3 iterations) if issues found
- Skips research when `features.research_phase` is `false` or `--skip-research` passed
- Skips plan checking when `features.plan_checking` is `false`
- `--assumptions` is free — runs inline without spawning any agents

---

#### `/dev:build` — Phase Execution

Execute all plans in a phase by spawning executor agents in parallel waves.

**Syntax**: `/dev:build <N> [flags]`

| Argument | Meaning |
|----------|---------|
| `3` | Build phase 3 |
| `3 --gaps-only` | Execute only gap-closure plans |
| `3 --team` | Use Agent Teams for complex inter-agent coordination |
| (no number) | Use current phase from STATE.md |

**Agents spawned**: Multiple `towline-executor` (parallel within waves) + 1 `towline-verifier` (conditional)

**Cost**: High (2-4 agents)

**Files created/updated**:
- `.planning/phases/{NN}-{slug}/{plan}-SUMMARY.md` — per-plan execution results
- `.planning/phases/{NN}-{slug}/VERIFICATION.md` — verification report
- `.planning/phases/{NN}-{slug}/.checkpoint-manifest.json` — execution progress
- `.planning/phases/{NN}-{slug}/.continuation-state.json` — checkpoint resume state
- Project source files via executors

**Behavior**:
- Wave-based execution: plans in the same wave run in parallel, waves run sequentially
- Each task produces one atomic commit in format `{type}({phase}-{plan}): {description}`
- Crash recovery via checkpoint manifest — can resume from last successful task
- SUMMARY gate blocks STATE.md update until SUMMARY exists, is non-empty, and has valid frontmatter
- Spot-checks executor claims (file existence, commit counts)
- Verification runs automatically when `features.goal_verification` is `true`
- Creates phase branch if `git.branching` is set to `phase`

---

#### `/dev:review` — Phase Review

Verify what was built matches what was planned through automated checks and conversational UAT.

**Syntax**: `/dev:review <N> [flags]`

| Argument | Meaning |
|----------|---------|
| `3` | Review phase 3 |
| `3 --auto-fix` | Auto-diagnose failures and create gap-closure plans |
| (no number) | Use current phase from STATE.md |

**Agents spawned**: 1 `towline-verifier` (if needed) + 1 `towline-debugger` + 1 `towline-planner` (both conditional on `--auto-fix`)

**Cost**: Low (1 agent) or Medium with `--auto-fix`

**Files created/updated**:
- `.planning/phases/{NN}-{slug}/VERIFICATION.md` — verification report with UAT results
- Gap-closure PLAN.md files (if `--auto-fix`)

**Behavior**:
- Three-layer verification: Existence (files exist) -> Substantiveness (not stubs) -> Wiring (connected correctly)
- Conversational UAT walks through each deliverable with the user
- `--auto-fix` spawns debugger for root cause analysis, then planner for gap-closure plans
- Integration verification checks cross-phase dependencies when `features.integration_verification` is `true`

---

### Planning & Discovery

#### `/dev:explore` — Idea Exploration

Socratic conversation to explore ideas that might become todos, requirements, phases, or decisions.

**Syntax**: `/dev:explore [topic]`

**Agents spawned**: 1 `towline-researcher` (conditional, mid-conversation if knowledge gap found)

**Behavior**:
- No phase number needed — open-ended discovery
- Uses domain-aware probing from 12 technology domains (auth, real-time, API, database, etc.)
- Spawns a researcher mid-conversation if a knowledge gap emerges
- At conversation end, routes output to one of 7 destinations: todo, requirement, phase decision, research question, new phase, note, or seed
- Never creates artifacts until user approves proposals

---

#### `/dev:discuss` — Pre-Planning Discussion

Talk through a phase before planning to identify gray areas and capture locked decisions.

**Syntax**: `/dev:discuss <N>`

**Agents spawned**: None (runs inline)

**Files created**: `.planning/phases/{NN}-{slug}/CONTEXT.md` — locked decisions, deferred ideas, Claude's discretion

**Behavior**:
- Identifies 3-4 gray areas per phase (UI/UX, architecture, edge cases, tech choices, scope)
- Presents 2-4 concrete options per gray area plus "Let Claude decide"
- Three decision categories: **Locked** (planner must honor exactly), **Deferred** (planner must NOT include), **Claude's Discretion**
- Warns if phase already has plans (decisions won't retroactively apply)

---

#### `/dev:scan` — Codebase Analysis

Analyze an existing codebase (brownfield). Maps structure, architecture, conventions, and concerns.

**Syntax**: `/dev:scan`

**Agents spawned**: 4 parallel `towline-codebase-mapper` agents (tech, architecture, quality, concerns)

**Files created**:
- `.planning/codebase/RECON.md` — initial reconnaissance
- `.planning/codebase/STACK.md` — technology inventory
- `.planning/codebase/INTEGRATIONS.md` — external connections
- `.planning/codebase/ARCHITECTURE.md` — high-level architecture
- `.planning/codebase/STRUCTURE.md` — directory organization
- `.planning/codebase/CONVENTIONS.md` — coding standards
- `.planning/codebase/TESTING.md` — test infrastructure
- `.planning/codebase/CONCERNS.md` — concerns by severity

**Behavior**:
- Read-only analysis — no code modification, no dependency installation
- Detects project scale (small <50 files to large 1000+ files) and adapts sampling strategy
- Detects monorepos and offers to scope the scan

---

### Execution

#### `/dev:quick` — Quick Ad-Hoc Task

Execute a small, well-defined task outside the plan/build/review cycle with an atomic commit.

**Syntax**: `/dev:quick [description]`

**Agents spawned**: 1 `towline-executor`

**Cost**: Low

**Files created**:
- `.planning/quick/{NNN}-{slug}/PLAN.md` — minimal plan
- `.planning/quick/{NNN}-{slug}/SUMMARY.md` — execution results

**Behavior**:
- Sequential IDs starting at 001
- Generates 1-3 tasks maximum; warns if scope is too large
- Commit format: `{type}(quick-{NNN}): {description}`

---

#### `/dev:continue` — Auto-Continue

Determine and execute the next logical step automatically. No prompts, no decisions.

**Syntax**: `/dev:continue`

**Agents spawned**: Delegates to the appropriate skill

**Behavior**:
- Reads STATE.md and file system to determine what's next
- Resumption priority hierarchy (6 levels): UAT blockers > checkpoint resume > gap closure > normal workflow > next phase > milestone
- Hard stops: non-autonomous mode with gates, human-input checkpoints, errors, milestone complete
- Differs from `/dev:resume`: continue **executes** the action; resume **shows status and suggests**

---

### Verification & Debugging

#### `/dev:debug` — Systematic Debugging

Hypothesis-driven debugging with persistent state across sessions.

**Syntax**: `/dev:debug [issue description]`

**Agents spawned**: 1+ `towline-debugger`

**Files created**:
- `.planning/debug/{NNN}-{slug}.md` — debug session file

**Behavior**:
- Protocol: OBSERVE -> HYPOTHESIZE -> PREDICT -> TEST -> EVALUATE
- Debug files persist across sessions (never deleted)
- Status lifecycle: active -> resolved (or stale after 7 days)
- Max 5 hypotheses before checkpointing
- 8 investigation techniques: stack trace analysis, code path tracing, log injection, binary search, isolation, comparison, dependency audit, config diff

---

#### `/dev:health` — Planning Directory Diagnostics

Validate `.planning/` integrity, report problems, suggest fixes.

**Syntax**: `/dev:health`

**Agents spawned**: None (read-only, inline)

**Behavior**:
- 6 checks: Structure, Config Validity, Phase Consistency, Plan/Summary Pairing, STATE.md Accuracy, Frontmatter Validity
- Each check produces PASS / WARN / FAIL
- No auto-repair — presents targeted fix suggestions

---

### Session Management

#### `/dev:status` — Project Status

Show current project status and suggest what to do next.

**Syntax**: `/dev:status`

**Agents spawned**: None (read-only, inline)

**Behavior**:
- Calculates phase status from file system state (8 states from "not started" to "needs fixes")
- Progress bar with Unicode block characters
- Smart routing decision tree suggests the best next action
- Fast execution — reads frontmatter only, no full file reads

---

#### `/dev:pause` — Save Session

Capture current session state for resumption in a future conversation.

**Syntax**: `/dev:pause [--checkpoint]`

| Flag | Meaning |
|------|---------|
| `--checkpoint` | Lightweight state dump, skip detailed analysis |

**Agents spawned**: None (inline)

**Files created**: `.planning/phases/{NN}-{slug}/.continue-here.md` — handoff file

**Behavior**:
- Estimates session duration from git timestamps
- Creates handoff with: position, completed work, remaining work, decisions, blockers, next steps
- WIP commit: `wip: pause at phase {N} plan {M}`

---

#### `/dev:resume` — Resume Previous Session

Find last pause point, restore context, and suggest next action.

**Syntax**: `/dev:resume`

**Agents spawned**: None (inline)

**Behavior**:
- Three resume modes: Normal (from `.continue-here.md`), Inferred (from STATE.md), Recovery (file system scan)
- Validates resume point (files exist, commits exist)
- Staleness detection — warns if pause is 7+ days old
- Does NOT delete `.continue-here.md` during resume

---

### Project Management

#### `/dev:milestone` — Milestone Management

Manage milestone lifecycle.

**Syntax**: `/dev:milestone <subcommand> [args]`

| Subcommand | Description |
|------------|-------------|
| `new [name]` | Start a new milestone cycle |
| `complete [version]` | Archive completed milestone, create git tag |
| `audit [version]` | Verify milestone completion, check requirements coverage |
| `gaps` | Create phases to close gaps found by audit |

**Agents spawned**: 1 `towline-integration-checker` (during `audit`)

**Files created** (varies by subcommand):
- `.planning/milestones/{version}-ROADMAP.md` — archived roadmap snapshot
- `.planning/milestones/{version}-REQUIREMENTS.md` — archived requirements
- `.planning/milestones/{version}-STATS.md` — milestone statistics
- `.planning/{version}-MILESTONE-AUDIT.md` — audit report

---

#### `/dev:todo` — Persistent Todos

File-based todos that survive across sessions (unlike Claude Code's session-scoped Tasks).

**Syntax**: `/dev:todo <subcommand>`

| Subcommand | Description |
|------------|-------------|
| `add <description>` | Create a new todo |
| `list [area]` | Show pending todos, optionally filtered by area |
| `done <id>` | Mark a todo complete (moves from `pending/` to `done/`) |

**Files**: `.planning/todos/pending/{id}.md` and `.planning/todos/done/{id}.md`

**ID format**: `{YYYYMMDD}-{NNN}` (sequential within day)

---

#### `/dev:config` — Configure Workflow

Read and modify `.planning/config.json` settings.

**Syntax**: `/dev:config [subcommand]`

| Subcommand | Example | Description |
|------------|---------|-------------|
| `show` (default) | `/dev:config` | Display current config |
| `depth` | `/dev:config depth comprehensive` | Set depth level |
| `model` | `/dev:config model executor sonnet` | Set model for specific agent |
| `model-profile` | `/dev:config model-profile quality` | Set all models via preset |
| `gate` | `/dev:config gate confirm_execute on` | Toggle a confirmation gate |
| `feature` | `/dev:config feature tdd_mode on` | Toggle a feature |
| `git branching` | `/dev:config git branching phase` | Set git branching strategy |
| `git mode` | `/dev:config git mode disabled` | Disable git integration |

---

#### `/dev:help` — Command Reference

Display command reference and workflow guide. No agents, no file I/O.

**Syntax**: `/dev:help`

---

## Agents Reference

Towline includes 10 specialized agents. Each runs in a fresh `Task()` context with a clean 200k token window.

| Agent | File | Role | Model | Read-Only | Key Output |
|-------|------|------|-------|-----------|------------|
| Researcher | `towline-researcher` | Domain research, phase approaches, ecosystem analysis | Sonnet | Yes | `RESEARCH.md`, research files |
| Planner | `towline-planner` | Plans, roadmaps, requirements, wave assignment | Inherit | Yes (writes plans only) | `PLAN.md`, `ROADMAP.md` |
| Plan Checker | `towline-plan-checker` | Validates plans against phase goals before execution | Sonnet | Yes | Revision feedback |
| Executor | `towline-executor` | Builds code with atomic commits and self-verification | Inherit | No (full write access) | Source code, `SUMMARY.md` |
| Verifier | `towline-verifier` | Goal-backward verification of built work | Sonnet | Yes (no source writes) | `VERIFICATION.md` |
| Integration Checker | `towline-integration-checker` | Cross-phase E2E flow verification | Sonnet | Yes | Integration report |
| Debugger | `towline-debugger` | Systematic hypothesis-based debugging with checkpoints | Inherit | No (can apply fixes) | Debug session files |
| Codebase Mapper | `towline-codebase-mapper` | Brownfield codebase analysis (tech, arch, quality, concerns) | Sonnet | Yes | `.planning/codebase/*.md` |
| Synthesizer | `towline-synthesizer` | Research output synthesis and contradiction resolution | Haiku | Yes | `SUMMARY.md` |
| General | `towline-general` | Lightweight Towline-aware agent for ad-hoc tasks | Inherit | Varies | Varies |

**Model values**: `sonnet` = Claude Sonnet, `inherit` = same model as parent session, `haiku` = Claude Haiku, `opus` = Claude Opus. Configurable via `/dev:config model <agent> <model>` or `/dev:config model-profile <preset>`.

---

## Configuration Reference

All settings live in `.planning/config.json`. Created by `/dev:begin`, modified by `/dev:config`.

### Top-Level Settings

| Key | Type | Default | Options | Description |
|-----|------|---------|---------|-------------|
| `version` | number | `2` | — | Config schema version. Auto-migrated from v1 |
| `context_strategy` | enum | `aggressive` | `aggressive`, `balanced`, `minimal` | How aggressively to delegate to subagents |
| `mode` | enum | `interactive` | `interactive`, `autonomous` | Whether to prompt for confirmations at gates |
| `depth` | enum | `standard` | `quick`, `standard`, `comprehensive` | Research and planning thoroughness |

### Features

Boolean toggles for workflow behavior.

| Key | Default | Description |
|-----|---------|-------------|
| `features.structured_planning` | `true` | Use structured plan format with tasks |
| `features.goal_verification` | `true` | Run verifier agent after build |
| `features.integration_verification` | `true` | Run cross-phase integration checks |
| `features.context_isolation` | `true` | Delegate heavy work to subagents |
| `features.atomic_commits` | `true` | Require one atomic commit per task |
| `features.session_persistence` | `true` | Persist state to `.planning/STATE.md` |
| `features.research_phase` | `true` | Run research before planning |
| `features.plan_checking` | `true` | Validate plans before building |
| `features.tdd_mode` | `false` | Use TDD workflow (3 commits per task: red/green/refactor) |
| `features.status_line` | `true` | Show phase/progress in Claude Code status line |
| `features.auto_continue` | `false` | Auto-spawn continuation agents without user prompt |
| `features.team_discussions` | `false` | Enable team-based discussion workflows |

### Models

Per-agent model assignments. Values: `sonnet`, `inherit`, `haiku`, `opus`.

| Key | Default | Description |
|-----|---------|-------------|
| `models.researcher` | `sonnet` | Model for research agents |
| `models.planner` | `inherit` | Model for planning agents |
| `models.executor` | `inherit` | Model for execution agents |
| `models.verifier` | `sonnet` | Model for verification agents |
| `models.integration_checker` | `sonnet` | Model for integration checking |
| `models.debugger` | `inherit` | Model for debugging agents |
| `models.mapper` | `sonnet` | Model for codebase mapping |
| `models.synthesizer` | `haiku` | Model for research synthesis |

**Model Profile Presets** (set all at once with `/dev:config model-profile <name>`):

| Profile | researcher | planner | executor | verifier | int-checker | debugger | mapper | synthesizer |
|---------|-----------|---------|----------|----------|-------------|----------|--------|-------------|
| `quality` | opus | opus | opus | opus | sonnet | opus | sonnet | sonnet |
| `balanced` | sonnet | inherit | inherit | sonnet | sonnet | inherit | sonnet | haiku |
| `budget` | haiku | haiku | haiku | haiku | haiku | haiku | haiku | haiku |
| `adaptive` | sonnet | sonnet | inherit | sonnet | haiku | inherit | haiku | haiku |

`balanced` is the default. `adaptive` front-loads intelligence in research/planning.

### Parallelization

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `parallelization.enabled` | bool | `true` | Enable parallel agent execution |
| `parallelization.plan_level` | bool | `true` | Run plans within a wave in parallel |
| `parallelization.task_level` | bool | `false` | Run tasks within a plan in parallel |
| `parallelization.max_concurrent_agents` | number | `3` | Maximum simultaneous agents |
| `parallelization.min_plans_for_parallel` | number | `2` | Minimum plans needed to trigger parallelism |
| `parallelization.use_teams` | bool | `false` | Use Agent Teams for coordination |

### Planning

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `planning.commit_docs` | bool | `true` | Commit planning docs to git |
| `planning.max_tasks_per_plan` | number | `3` | Maximum tasks per plan |
| `planning.search_gitignored` | bool | `false` | Include gitignored files in searches |

### Git

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `git.branching` | enum | `none` | `none`, `phase`, `milestone`, `disabled` |
| `git.commit_format` | string | `{type}({phase}-{plan}): {description}` | Commit message template |
| `git.phase_branch_template` | string | `towline/phase-{phase}-{slug}` | Branch name for phase branching |
| `git.milestone_branch_template` | string | `towline/{milestone}-{slug}` | Branch name for milestone branching |

When `git.branching` is `disabled`, all git commands are skipped entirely.

### Gates

Confirmation gates pause for user approval. Set `mode: autonomous` or toggle individual gates.

| Key | Default | Description |
|-----|---------|-------------|
| `gates.confirm_project` | `true` | Confirm PROJECT.md before proceeding |
| `gates.confirm_roadmap` | `true` | Confirm ROADMAP.md before proceeding |
| `gates.confirm_plan` | `true` | Confirm each PLAN.md before building |
| `gates.confirm_execute` | `false` | Confirm before spawning each executor |
| `gates.confirm_transition` | `true` | Confirm phase transitions |
| `gates.issues_review` | `true` | Review issues found during verification |

### Safety

| Key | Default | Description |
|-----|---------|-------------|
| `safety.always_confirm_destructive` | `true` | Always confirm destructive operations |
| `safety.always_confirm_external_services` | `true` | Always confirm calls to external services |

---

## Hooks Reference

Towline registers 5 hooks via `hooks/hooks.json`. Hooks are Node.js scripts that fire automatically on Claude Code lifecycle events.

### 1. Progress Tracker — `SessionStart`

**Script**: `scripts/progress-tracker.js`

**When**: Every new Claude Code session starts in a directory with `.planning/`

**What it does**: Reads STATE.md and injects a concise project summary as `additionalContext`. Shows current position, blockers, paused work, and config summary. Also detects `.continue-here.md` files and suggests `/dev:resume`.

**Exits silently** if no `.planning/` directory exists.

### 2. Plan Format Validator — `PostToolUse` (Write/Edit on PLAN.md or SUMMARY.md)

**Script**: `scripts/check-plan-format.js`

**When**: After any Write or Edit tool modifies a file matching `*PLAN*.md` or `*SUMMARY*.md`

**What it does**: Validates document structure:
- **PLAN.md**: checks for required task elements (`<name>`, `<files>`, `<action>`, `<verify>`, `<done>`), max 3 tasks, YAML frontmatter with required fields (`phase`, `plan`, `wave`, `must_haves`)
- **SUMMARY.md**: checks YAML frontmatter (`phase`, `plan`, `status`, `provides`, `requires`, `key_files`), verifies `key_files` paths exist on disk

Runs asynchronously (non-blocking). Issues are reported as warnings.

### 3. Commit Validator — `PreToolUse` (git commit)

**Script**: `scripts/validate-commit.js`

**When**: Before any `git commit` command executes

**What it does**: Validates commit message format matches `{type}({scope}): {description}`. Valid types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `wip`. Also accepts merge commits and checks for sensitive files in staging (`.env`, `.key`, `.pem`, credentials).

**Blocks the commit** (exit code 2) if the format is invalid.

### 4. Context Budget Preserver — `PreCompact`

**Script**: `scripts/context-budget-check.js`

**When**: Before Claude Code compacts the conversation (lossy compression)

**What it does**: Updates STATE.md with a compaction timestamp so post-compaction context knows state was preserved. Ensures critical project state survives context compression.

### 5. Auto-Continue — `Stop`

**Script**: `scripts/auto-continue.js`

**When**: Claude Code session stops (completes a response)

**What it does**: When `features.auto_continue` is `true`, checks for `.planning/.auto-next` signal file. If present, reads the next command and injects it to continue the workflow automatically. Signal file is **one-shot** — read and deleted to prevent infinite loops.

**Hard stops** (signal file NOT written): milestone completion, `human_needed` flag, execution errors, gap closure attempted 3+ times.

---

## Project Structure

Towline creates and manages a `.planning/` directory in your project root.

```
.planning/
  PROJECT.md              # Project vision, scope, and milestone history
  REQUIREMENTS.md         # Scoped requirements with REQ-IDs and traceability
  ROADMAP.md              # Phase structure with goals, dependencies, success criteria
  STATE.md                # Current position — auto-updated, source of truth
  CONTEXT.md              # Project-level decisions and constraints
  config.json             # Workflow configuration (all settings)

  research/               # Domain research from /dev:begin
    STACK.md              # Technology research
    FEATURES.md           # Feature research
    ARCHITECTURE.md       # Architecture research
    PITFALLS.md           # Common pitfalls research
    SUMMARY.md            # Synthesized research summary

  phases/
    01-foundation/
      CONTEXT.md          # Phase-level locked decisions (from /dev:discuss)
      RESEARCH.md         # Phase-specific research (from /dev:plan)
      01-01-PLAN.md       # Executable plan (wave 1)
      01-02-PLAN.md       # Executable plan (wave 1 or 2)
      01-01-SUMMARY.md    # Execution results for plan 01
      01-02-SUMMARY.md    # Execution results for plan 02
      VERIFICATION.md     # Phase verification report
      .checkpoint-manifest.json   # Execution progress tracker
      .continuation-state.json    # Checkpoint resume state
      .continue-here.md           # Pause/resume handoff file
    02-auth/
      ...

  codebase/               # From /dev:scan (brownfield analysis)
    RECON.md              # Initial reconnaissance
    STACK.md              # Technology inventory
    ARCHITECTURE.md       # High-level architecture
    STRUCTURE.md          # Directory organization
    CONVENTIONS.md        # Coding standards
    TESTING.md            # Test infrastructure
    CONCERNS.md           # Issues by severity
    INTEGRATIONS.md       # External connections

  quick/                  # From /dev:quick
    001-fix-typo/
      PLAN.md
      SUMMARY.md

  debug/                  # From /dev:debug
    001-auth-crash.md     # Debug session file

  todos/
    pending/              # Active todos
      20260208-001.md
    done/                 # Completed todos
      20260207-001.md

  milestones/             # From /dev:milestone complete
    v1.0-ROADMAP.md       # Archived roadmap snapshot
    v1.0-REQUIREMENTS.md  # Archived requirements
    v1.0-STATS.md         # Milestone statistics

  seeds/                  # Deferred implementation hints
    SEED-001-caching.md

  notes/                  # From /dev:explore
    performance-ideas.md

  logs/                   # Hook audit trail
    hooks.jsonl
```

---

## Shared Conventions

### Commit Format

All Towline commits follow conventional commit format:

```
{type}({phase}-{plan}): {description}
```

**Types**: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`

**Examples**:
- `feat(02-01): implement Discord OAuth client`
- `fix(02-01): handle null user profile from API`
- `test(02-01): add failing tests for auth middleware`
- `chore(01-01): configure TypeScript and ESLint`

**Special scopes**:
- `quick-{NNN}` — quick tasks: `feat(quick-001): add logout button`
- `planning` — planning doc commits: `docs(planning): update roadmap`
- `wip` — pause commits: `wip: pause at phase 3 plan 2`

**TDD mode** produces 3 commits per task: `test(...)` (red), `feat(...)` (green), `refactor(...)` (refactor).

### Phase Argument Parsing

Most skills accept a phase number argument. Parsing rules:

| Input | Normalized | Directory |
|-------|-----------|-----------|
| `3` | 3 | `03-{slug}` |
| `03` | 3 | `03-{slug}` |
| `3.1` | 3.1 | `03.1-{slug}` |
| (empty) | current | Read from STATE.md |

Phase must exist in ROADMAP.md and be in the expected state for the operation.

### Status Indicators

| Symbol | Meaning |
|--------|---------|
| `✓` | Complete / Pass |
| `◐` | In progress |
| `○` | Not started |
| `⚠` | Warning / Needs attention |
| `✗` | Failed |
| `⊘` | Blocked |
| `?` | Unknown |

Progress bars use 20-character Unicode block characters: `████████████░░░░░░░░ 60%`

### Domain Probes

Towline includes domain-aware probing patterns for 12 technology areas: Authentication, Real-Time Updates, Dashboard, API Design, Database, Search, File Upload/Storage, Caching, Testing, and Deployment. These are used by `/dev:explore`, `/dev:begin`, and `/dev:discuss` to ask insightful follow-up questions — not as checklists, but as 2-3 targeted probes based on what the user mentions.
