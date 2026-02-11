# Changelog

All notable changes to Towline will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Token-saving CLI: 6 new commands in `towline-tools.js` — `frontmatter`, `must-haves`, `phase-info`, `state update`, `roadmap update-status`, `roadmap update-plans`
- Companion web dashboard (Express 5.x, EJS, Pico.css v2, HTMX 2.0) with overview, phase detail, roadmap, todos, and SSE live updates
- `/dev:import` skill — Import external plan documents into Towline format
- `/dev:note` skill — Zero-friction idea capture with promote-to-todo support
- `/dev:setup` skill — Interactive onboarding wizard for new installations
- `SECURITY.md` — Vulnerability reporting policy
- `CODE_OF_CONDUCT.md` — Contributor Covenant v2.1
- `ACKNOWLEDGMENTS` — Attribution to get-shit-done (MIT) by Lex Christopherson
- "Why Towline?" comparison section in README
- Markdownlint CI for planning document quality
- Hook spawn tests for all lifecycle hooks
- Iterative retrieval protocol for researcher agent
- Behavioral contexts for agent prompt refinement
- Plugin manifest documentation

### Changed
- Skill count increased from 18 to 21 (added import, note, setup)
- Hook scripts consolidated: Write/Edit dispatch reduced from 4 spawns to 2
- All hook scripts now use `logHook()` from `hook-logger.js` for unified logging
- Agents reference new CLI tooling shortcuts instead of manual YAML parsing
- README rewritten with polished formatting, badges, comparison table, and acknowledgments
- CONTRIBUTING.md expanded with commit format reference, security policy link, and code of conduct
- CHANGELOG updated to Keep a Changelog format with [Unreleased] section

### Fixed
- Context budget: main orchestrator no longer reads agent definitions (saves ~15% context)
- Hook logger rotation: `.hook-log` now caps at 200 entries with JSONL format
- Status line ANSI rendering on Windows terminals

## [2.0.0] - 2026-02-08

### Added
- `/dev:explore` skill — Socratic conversation for idea exploration before formalizing requirements
- `/dev:continue` skill — Execute the next logical step automatically without prompting
- `/dev:health` skill — Validate `.planning/` directory integrity with pass/fail diagnostics
- General agent — Lightweight Towline-aware agent for ad-hoc tasks that don't fit specialized roles
- `/dev:build <N> --team` variant — Agent Teams for complex inter-agent coordination
- `/dev:review <N> --auto-fix` variant — Auto-diagnose and fix verification failures
- Cost indicators on core workflow commands in help reference

### Changed
- README rewritten with philosophy, problem statement, typical workflow, and restructured layout
- Help skill expanded with full command reference, typical workflow, and quick reference section
- Agent count increased from 9 to 10 (added General agent)
- Skill count increased from 15 to 18 (added explore, continue, health)
- Configuration section documents 16 feature toggles

## [1.0.0] - 2025-02-07

### Added
- Initial release of Towline plugin for Claude Code
- 15 skills: begin, plan, build, review, discuss, quick, debug, status, pause, resume, milestone, scan, todo, config, help
- 9 specialized agents: researcher, planner, plan-checker, executor, verifier, integration-checker, debugger, codebase-mapper, synthesizer
- Hook-enforced quality gates: commit validation, plan format checking, session state injection, pre-compact preservation
- Wave-based parallel execution via Task() subagents
- Goal-backward verification at phase and milestone levels
- Persistent file-based state management (.planning/ directory)
- Configurable workflow: depth, models, gates, parallelization, git branching
- Cross-platform Node.js hook scripts (Windows + macOS + Linux)
- Plugin distribution via npm
