# Changelog

All notable changes to Plan-Build-Run will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.4.1](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.4.0...plan-build-run-v2.4.1) (2026-02-19)


### Bug Fixes

* **tools:** add pull_request trigger to CI so branch protection checks pass ([6e7ada4](https://github.com/SienkLogic/plan-build-run/commit/6e7ada4cf1e24e05ddace4706d7ddee527bde81a))

## [2.4.0](https://github.com/SienkLogic/plan-build-run/compare/plan-build-run-v2.3.1...plan-build-run-v2.4.0) (2026-02-19)


### Features

* **tools:** add GitHub Copilot CLI plugin port ([3977261](https://github.com/SienkLogic/plan-build-run/commit/39772618479551a58123d08d99cbcb1178a0cd2a))
* **tools:** archive milestones into versioned directories with phase migration ([206b925](https://github.com/SienkLogic/plan-build-run/commit/206b925dd6692131f0d9127d10cd07208c777e40))


### Bug Fixes

* **tools:** parse simple two-column roadmap table in dashboard ([f881004](https://github.com/SienkLogic/plan-build-run/commit/f8810045739ffeaf29a495f824bc34828c8e6c4d))
* **tools:** resolve lint errors in cross-plugin compat tests ([731efb2](https://github.com/SienkLogic/plan-build-run/commit/731efb221cf630a697a48bf732eed736b9514b1c))
* **tools:** sync dashboard skill paths and missing templates across all plugins ([ee7d770](https://github.com/SienkLogic/plan-build-run/commit/ee7d770c09f8dd7da1b1b9f76d162f0e87fc58a5))


### Documentation

* **tools:** add /pbr:dashboard command to README dashboard section ([e1d3a60](https://github.com/SienkLogic/plan-build-run/commit/e1d3a60e0f8cffcd2f093725e73a0eca0a6c67ad))
* **tools:** add missing 2.3.0 and 2.3.1 changelog entries ([82c5cb2](https://github.com/SienkLogic/plan-build-run/commit/82c5cb21a741be4bfe13613debdeb54f862ce1f3))
* **tools:** make platform badges clickable links to install pages ([a1f6b68](https://github.com/SienkLogic/plan-build-run/commit/a1f6b68a786458a6040d0fa50a99e01431016332))
* **tools:** update README with Copilot CLI support and current stats ([edad2d9](https://github.com/SienkLogic/plan-build-run/commit/edad2d924198d6598eed1fb0b0a23c164617e5b6))

## [Unreleased]

## [2.3.1] - 2026-02-19

### Added
- **GitHub Copilot CLI plugin** (`plugins/copilot-pbr/`) — complete port with 22 skills, 10 agents (`.agent.md` format), and Copilot CLI hook configuration
- Setup scripts (`setup.sh`, `setup.ps1`) for Copilot CLI plugin installation with `copilot plugin install` support
- Cross-plugin compatibility tests now cover all three plugins (Claude Code, Cursor, Copilot CLI) — 164 tests via data-driven `describe.each`
- New cross-plugin guard tests: `references/ files match PBR` and `templates/ files match PBR` catch drift automatically
- Dashboard skill now works from Copilot CLI sessions (`/pbr:dashboard`)
- Platform badges in README link to install pages (wiki or anchor)

### Fixed
- Synced 13 missing template files (`codebase/`, `research/`, `research-outputs/`) to Cursor and Copilot plugins
- Dashboard skill in derivative plugins now references correct relative path (`../../dashboard/`) instead of nonexistent `<plugin-root>/dashboard/`
- Cross-plugin frontmatter parser now handles both `\r\n` and `\n` line endings (was silently failing on Windows-style files)
- Test count: 1219 tests across 44 suites (up from 1134)

## [2.3.0] - 2026-02-19

### Added
- `/pbr:do` freeform router — routes natural language input to the right PBR skill automatically
- Smart skill suggestions in hook feedback when freeform text is detected
- Freeform text guard hook for `/pbr:plan` and todo work subcommand

### Fixed
- Dashboard skill `argument-hint` synced to Cursor plugin

## [2.2.0] - 2026-02-19

### Added
- Milestone integration into workflow lifecycle — milestones are now created automatically during `/pbr:begin` roadmap generation
- Planner agent generates milestone-grouped roadmaps (single milestone for standard projects, multiple for 8+ phase comprehensive projects)
- Milestone-aware boundary detection in `/pbr:build` and `/pbr:review` — reads ROADMAP.md phase ranges instead of just "last phase overall"
- Between-milestones state handling in `/pbr:continue`
- Audit report detection in `/pbr:status` — suggests the correct next action based on whether an audit exists and its result

### Fixed
- "Skip audit" option in build/review completion banners now correctly says "archive milestone after audit passes" (consistent with milestone anti-pattern rules)
- `auto_advance` hard-stop message at milestone boundaries now explains why it paused

## [2.1.0] - 2026-02-19

### Added
- **Cursor IDE plugin** (`plugins/cursor-pbr/`) — complete port with 21 skills, 10 agents, and `.mdc` workflow rules
- Cross-plugin compatibility: shared `.planning/` state between Claude Code and Cursor plugins
- Setup scripts (`setup.sh` for macOS/Linux, `setup.ps1` for Windows) for easy Cursor plugin installation
- Summary gate hook (`check-summary-gate.js`) — enforces SUMMARY file before phase state can advance
- Cross-plugin compatibility test suite (7 tests)
- Cursor plugin validation test suite (92 tests)
- Companion web dashboard improvements: service and route enhancements

### Changed
- Agent definitions optimized — 48% average size reduction across all 10 agents
- Hook scripts improved with better error handling and dispatch logic
- Test count increased from 758 to 1008 across 42 suites
- Removed `.gitkeep` placeholder files from `cursor-pbr/` (replaced by real content)

## [2.0.0] - 2026-02-17

### Added
- Token-saving CLI: 6 new commands in `towline-tools.js` — `frontmatter`, `must-haves`, `phase-info`, `state update`, `roadmap update-status`, `roadmap update-plans`
- Companion web dashboard (Express 5.x, EJS, Pico.css v2, HTMX 2.0) with overview, phase detail, roadmap, todos, and SSE live updates
- `/dev:import` skill — Import external plan documents into Towline format
- `/dev:note` skill — Zero-friction idea capture with promote-to-todo support
- `/dev:setup` skill — Interactive onboarding wizard for new installations
- `/dev:explore` skill — Socratic conversation for idea exploration
- `/dev:continue` skill — Execute the next logical step automatically
- `/dev:health` skill — Validate `.planning/` directory integrity
- General agent — Lightweight Towline-aware agent for ad-hoc tasks
- `/dev:build <N> --team` variant — Agent Teams for complex inter-agent coordination
- `/dev:review <N> --auto-fix` variant — Auto-diagnose and fix verification failures
- Hook spawn tests for all lifecycle hooks
- Iterative retrieval protocol for researcher agent
- Behavioral contexts for agent prompt refinement
- Published to npm with OIDC trusted publishing

### Changed
- Skill count increased from 15 to 21
- Agent count increased from 9 to 10 (added General agent)
- Hook scripts consolidated: Write/Edit dispatch reduced from 4 spawns to 2
- All hook scripts now use `logHook()` from `hook-logger.js` for unified logging
- Agents reference new CLI tooling shortcuts instead of manual YAML parsing
- README rewritten with badges, comparison table, and acknowledgments
- Package tarball trimmed from 1.9MB to 305KB via explicit `files` field

### Fixed
- Windows CI: `parseMustHaves` now trims CRLF line endings
- Context budget: main orchestrator no longer reads agent definitions (saves ~15% context)
- Hook logger rotation: `.hook-log` now caps at 200 entries with JSONL format
- Status line ANSI rendering on Windows terminals

## [1.0.0] - 2025-02-07

### Added
- Initial release of Plan-Build-Run plugin for Claude Code
- 15 skills: begin, plan, build, review, discuss, quick, debug, status, pause, resume, milestone, scan, todo, config, help
- 9 specialized agents: researcher, planner, plan-checker, executor, verifier, integration-checker, debugger, codebase-mapper, synthesizer
- Hook-enforced quality gates: commit validation, plan format checking, session state injection, pre-compact preservation
- Wave-based parallel execution via Task() subagents
- Goal-backward verification at phase and milestone levels
- Persistent file-based state management (.planning/ directory)
- Configurable workflow: depth, models, gates, parallelization, git branching
- Cross-platform Node.js hook scripts (Windows + macOS + Linux)
- Plugin distribution via npm
