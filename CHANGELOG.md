# Changelog

All notable changes to Plan-Build-Run will be documented in this file.

## [2.0.0] - 2026-03-16

### Initial Release
- Plan-Build-Run v2.0.0 — structured development workflow plugin for Claude Code
- Package: `@sienklogic/plan-build-run`
- Command prefix: `/pbr:`
- Agent naming: `pbr-*`
- CLI tool: `pbr-tools.cjs`

### Commands & Skills
- 41 slash commands covering the full development lifecycle
- 28 skills with YAML frontmatter, template directories, and shared fragments
- Core workflow: `/pbr:new-project` → `/pbr:discuss-phase` → `/pbr:plan-phase` → `/pbr:execute-phase` → `/pbr:verify-work`
- Quick mode: `/pbr:quick` for ad-hoc tasks with atomic commits
- Session management: `/pbr:pause-work`, `/pbr:resume-work`, `/pbr:continue`
- Milestone lifecycle: `/pbr:new-milestone`, `/pbr:audit-milestone`, `/pbr:complete-milestone`
- Phase management: `/pbr:add-phase`, `/pbr:insert-phase`, `/pbr:remove-phase`
- Utilities: `/pbr:progress`, `/pbr:health`, `/pbr:settings`, `/pbr:debug`, `/pbr:explore`

### Agent System
- 14 specialized agents with color-coded frontmatter for visual distinction
- Agents: planner, executor, verifier, researcher, synthesizer, plan-checker, integration-checker, codebase-mapper, roadmapper, debugger, auditor, nyquist-auditor, general, dev-sync
- Color scheme: green (strategic), yellow (execution), cyan (discovery), purple (synthesis), blue (integration), orange (investigation)
- Fresh 200k-token context per agent via Task() delegation

### Hook System
- 49 hook scripts with dispatch architecture
- Hook events: SessionStart, PostToolUse, PreToolUse, PreCompact, Stop, SubagentStart, SubagentStop, TaskCompleted, InstructionsLoaded, ConfigChange, WorktreeCreate, WorktreeRemove, Notification, UserPromptSubmit, SessionEnd
- Branded statusMessages with `◆ PBR:` prefix and semantic symbols
- Hook server with circuit breaker for latency optimization
- Cross-platform path handling throughout (path.join, no hardcoded separators)

### Status Line
- Configurable status bar with 12 sections: phase, plan, status, agent, git, hooks, milestone, model, cost, duration, context, llm
- Active agent display (reads `.active-agent`, shows in magenta when Task() running)
- Context budget tier warnings (DEGRADING/POOR/CRITICAL with color coding)
- ANSI color support with dynamic status coloring

### Dashboard
- Vite + React 18 + Express web dashboard for browsing `.planning/` state
- File watching with chokidar and WebSocket live updates (port 3141)
- Phase progress, roadmap overview, configuration editor
- Tabbed planning page with milestones, phases, todos, notes, quick tasks, research, decisions, files
- Path traversal security guards on all mutation routes
- Per-route optimistic locking middleware (checkMtime)

### Derivative Plugins
- 4 synchronized derivative plugins: pbr, cursor-pbr, copilot-pbr, codex-pbr
- Automated generation and drift verification (`npm run sync:generate/verify`)
- Platform-specific manifests (plugin.json, .cursor-plugin, .codex/config.toml)
- Platform-specific agent naming (.agent.md for Copilot)

### State Management
- File-based state in `.planning/` directory (local only, not committed to git)
- `STATE.md` — source of truth for current position, progress, decisions, history
- `PROJECT.md` — project vision, context, locked decisions, constraints
- `REQUIREMENTS.md` — scoped v1/v2 requirements with phase traceability
- `ROADMAP.md` — phase structure with dependency DAG and progress tracking
- `config.json` — workflow configuration with depth profiles, model assignments, feature flags

### Configuration
- Depth profiles: quick (skip research), standard (balanced), comprehensive (full research)
- Model profiles: quality (Opus), balanced (Sonnet), budget (Haiku)
- Feature flags: structured_planning, goal_verification, context_isolation, atomic_commits, tdd_mode, auto_continue, status_line
- Git branching strategies: none, phase, milestone
- Parallelization: wave-based execution with configurable concurrency

### Testing & Quality
- 138 test suites, 3650+ tests (Jest for hooks/CLI, Vitest for dashboard)
- Coverage thresholds enforced: 70% statements, 68% branches, 70% functions, 70% lines
- CI: Node 18/20/22 on Windows, macOS, and Linux with lint and dashboard tests
- ESLint v9 flat config for hooks and tests
- Agent prompt size guardrails (< 8000 tokens per agent)
- Plugin structure validation tests

### Documentation
- CLAUDE.md with complete architecture reference (skills, agents, hooks, dispatch table)
- 22 reference documents: plan format, verification patterns, wave execution, model selection, config reference, etc.
- CONTRIBUTING.md with branch naming, commit format, PR template
- PBR-STYLE.md with commit conventions and anti-patterns
