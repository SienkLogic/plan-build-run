# Changelog

All notable changes to Plan-Build-Run will be documented in this file.

## [2.0.0] - 2026-03-16

### Rebranded
- Forked from GSD (Get Shit Done) v1.22.4 and renamed to PBR (Plan-Build-Run)
- New package identity: `@sienklogic/plan-build-run`
- Directory structure: `get-shit-done/` -> `plan-build-run/`
- Command prefix: `/gsd:` -> `/pbr:`
- Agent names: `gsd-*` -> `pbr-*`
- CLI tool: `gsd-tools.cjs` -> `pbr-tools.cjs`

### Commands & Skills
- 41 slash commands (expanded from 28)
- 14 agents with color-coded frontmatter
- Step progress indicators in skills
- Status line with agent display, context tier, 11 configurable sections

### Infrastructure
- 49 hook scripts with dispatch architecture
- Branded hook statusMessages
- CI: Node 18/20/22 on Windows, macOS, and Linux with lint and dashboard tests
- Cross-platform path handling throughout
- Test coverage raised to 70%+ (3650 tests, 138 suites)

### Dashboard
- Vite + React 18 + Express web dashboard for browsing `.planning/` state
- File watching with chokidar and WebSocket live updates
- Path traversal security guards

### Derivative Plugins
- 4 derivative plugins: pbr, cursor-pbr, copilot-pbr, codex-pbr
- Automated sync generation and verification (`npm run sync:generate/verify`)
