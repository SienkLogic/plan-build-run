# PBR Features

A categorized overview of Plan-Build-Run capabilities. Each feature maps to one or more `/pbr:*` commands.

---

## Core Workflow

The full project lifecycle: begin, plan, build, verify.

### New Project (`/pbr:begin`)

Deep questioning, research, requirements gathering, and roadmap creation. Produces `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, and `config.json` in `.planning/`.

### Phase Discussion (`/pbr:discuss`)

Talk through a phase before planning. Identifies gray areas, captures decisions, and writes `CONTEXT.md`. Prevents wasted planning work by surfacing ambiguity early. Supports `--auto` for autonomous mode and `--project` for project-level discussion.

### Phase Planning (`/pbr:plan`)

Research-backed plan creation with multi-dimensional verification. Spawns researcher agent, planner agent, and plan-checker agent. Produces `PLAN-{NN}.md` files with XML task definitions. Supports `--skip-research`, `--assumptions`, `--gaps`, `--auto`, `--through N` for batch planning.

### Phase Execution (`/pbr:build`)

Execute all plans in a phase. Spawns executor agents in parallel (wave-based). Each executor gets a fresh context, makes atomic commits, handles deviations, and writes SUMMARY.md. Supports `--gaps-only`, `--team`, `--model`, `--auto`.

### Verification (`/pbr:review`)

Goal-backward verification: checks what was built against what was planned. Spawns verifier agent (optionally in isolated worktree). Produces `VERIFICATION.md` with pass/fail per must-have. Supports `--auto-fix`, `--teams`, `--model`.

### Continue (`/pbr:continue`)

Execute the next logical step automatically. Reads STATE.md, determines what's needed (discuss, plan, build, or review), and runs it. No prompts, no decisions.

### Autonomous (`/pbr:autonomous`)

Run multiple phases hands-free. Chains discuss, plan, build, and verify automatically across a range of phases. Supports `--from N`, `--through N`, `--speculative-depth N`, `--dry-run`.

---

## Planning Features

### Quick Task (`/pbr:quick`)

Execute an ad-hoc task with atomic commits. Creates a lightweight plan, spawns an executor, and commits. Tracks in `.planning/quick/{NNN}-{slug}/`. No full plan/review cycle.

### Fast Task (`/pbr:fast`)

Execute a trivial task inline without subagent overhead. No planning, no research -- just edit and commit. For changes that don't warrant a plan file.

### Freeform Routing (`/pbr:do`)

Route freeform text to the right PBR skill automatically. Describe what you want in natural language and PBR picks the appropriate workflow.

### Import Plans (`/pbr:import`)

Import external plans (from files or PRDs). Validates against project context, detects conflicts with existing plans, and generates PLAN.md files.

### Explore (`/pbr:explore`)

Open-ended exploration of ideas and approaches. Routes insights to the right artifacts (notes, todos, seeds, or plans).

---

## Quality Assurance

### Plan Checking (automatic)

Plan-checker agent validates plans across 10 dimensions before execution: goal coverage, task decomposition, dependency ordering, file scope, must-have clarity, verification commands, security, performance, CLAUDE.md compliance, and REQ coverage.

### Goal-Backward Verification (`/pbr:review`)

Verifier checks codebase reality against phase goals. For each must-have: does the file exist? Is it substantive (not a stub)? Is it wired (imported and called by consumers)?

### Nyquist Validation (`/pbr:validate-phase`)

Post-build quality gate. Identifies test gaps for phase deliverables and spawns nyquist-auditor agent to generate missing tests.

### Health Check (`/pbr:health`)

Check `.planning/` directory integrity. Finds corrupted state, orphaned files, missing artifacts, and stale references. Supports `--repair` for auto-fix.

### Forensics (`/pbr:forensics`)

Post-mortem investigation for failed or stuck workflows. Analyzes git history, planning artifacts, and hook logs to diagnose what went wrong.

### Scan (`/pbr:scan`)

Analyze an existing codebase. Maps structure, architecture, conventions, and concerns. Spawns mapper agents for parallel analysis.

### Session Audit (`/pbr:audit`)

Review past Claude Code sessions for PBR workflow compliance and UX quality. Analyzes session JSONL logs across ~88 dimensions in 9 categories.

### Audit Fix (`/pbr:audit-fix`)

Run audit, prioritize findings, auto-fix via quick tasks, test, and commit. End-to-end remediation pipeline.

---

## Context Engineering

### Model Profiles (`/pbr:profile`)

Switch active model profile: `quality` (opus, 1M context), `balanced` (sonnet, 200k), `budget` (haiku), `adaptive` (complexity-based). Profiles adjust context windows, parallelization limits, and agent models.

### Session Management (`/pbr:pause`, `/pbr:resume`)

Save and restore session state. Pause captures current position; resume restores context and suggests next action.

### Status (`/pbr:status`)

Show current project state and suggest next action. Reads STATE.md, ROADMAP.md, and pending todos.

### Status Line (`/pbr:statusline`)

Install a persistent status bar in Claude Code showing phase, status, and progress.

### Context Monitoring (hooks)

Hooks track context budget usage. `suggest-compact.js` warns when approaching limits. `track-context-budget.js` monitors Read tool usage. `context-budget-check.js` preserves STATE.md during compaction.

### Thread (`/pbr:thread`)

Persistent context threads for cross-session work spanning phases. Lighter than pause/resume for tracking ongoing concerns.

---

## Brownfield Support

### Codebase Intelligence (`/pbr:intel`)

Refresh or query persistent codebase intelligence. Spawns intel-updater agent to analyze file graphs, APIs, dependencies, and architecture. Results persist in `.planning/intel/` for use by planners and executors.

### Codebase Mapping (`/pbr:scan`, `/pbr:map-codebase`)

Parallel mapper agents analyze: tech stack, architecture, code quality, and concerns. Output persists in `.planning/codebase/`.

### Phase Assumptions (`/pbr:list-phase-assumptions`)

Surface Claude's assumptions about a phase before planning. Prevents assumption-driven errors in brownfield codebases.

---

## Utility Features

### Debug (`/pbr:debug`)

Systematic debugging using scientific method. Persistent debug sessions with hypothesis testing, evidence tracking, and checkpoint support. Survives session restarts.

### Todo (`/pbr:todo`)

File-based persistent todos in `.planning/todos/`. Add, list, complete, or work on todos. Survives sessions. Todos auto-close when their deliverables are built.

### Note (`/pbr:note`)

Zero-friction idea capture. Individual files in `.planning/notes/` with YAML frontmatter. Supports `list`, `promote` (to todo), and `--global` for cross-project notes.

### Seed (`/pbr:seed`)

Plant forward-looking ideas with trigger conditions. Seeds auto-surface at the right milestone when their conditions match.

### Backlog (`/pbr:backlog`)

Manage ideas not ready for active planning. Add, review, and promote backlog items to active phases when ready.

---

## Infrastructure

### Git Integration

- Atomic commits: one task = one commit with conventional format `{type}({scope}): {description}`
- Branching strategies: `none`, `phase`, `milestone`, `disabled`
- Pre-commit validation via hooks (format, scope, message length)
- Undo support: `git revert` based, never force-push
- PR creation: `/pbr:ship` generates rich PRs from planning artifacts

### CLI Tools (`pbr-tools.js`)

80+ subcommands for state management, config, roadmap operations, phase lifecycle, todo management, learnings, incidents, and more. See [CLI-TOOLS.md](CLI-TOOLS.md).

### Hook System (65+ scripts)

Lifecycle hooks enforce workflow rules:
- **PreToolUse**: Block dangerous commands, validate commits, gate file writes
- **PostToolUse**: Validate plan format, sync state files, check subagent output
- **Lifecycle**: Track sessions, manage context budget, auto-continue chains

### Dashboard (`/pbr:dashboard`)

Web UI for browsing `.planning/` state. Vite + React 18 frontend with Express backend, WebSocket live updates, and recharts visualizations. Default port: 3141.

### Milestone Management (`/pbr:milestone`)

Create, complete, audit, and analyze milestones. Archives phase directories with stats. Supports gap analysis between milestones.

### Release (`/pbr:release`)

Generate or update changelog and release notes from project history. Component-grouped entries based on commit scopes.
