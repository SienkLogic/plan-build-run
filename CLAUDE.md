# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Plan-Build-Run is a **Claude Code plugin** that provides a structured development workflow. It solves context rot — quality degradation as Claude's context window fills up — through disciplined subagent delegation, file-based state, and goal-backward verification. Users invoke `/pbr:*` slash commands (skills) that orchestrate specialized agents via `Task()`.

## Critical Rules

- **NEVER add AI co-author lines** to git commits or PRs. No `Co-Authored-By: Claude` or similar. Only add co-author lines referencing actual human contributors.
- **NEVER inline agent definitions** into skill prompts. Use `subagent_type: "pbr:{name}"` — Claude Code auto-loads agent definitions from `agents/`. Reading agent `.md` files wastes main context.
- **Always use PBR workflow commands** (`/pbr:*` skills) for development work, not ad-hoc manual fixes. PBR skills enforce state tracking, verification, and artifact creation that manual edits skip. When hooks don't fire (e.g., direct file edits outside Claude Code), workflow integrity degrades silently.
- **Post-work checklist** — before finishing any task or session, verify: (1) `npm test` passes, (2) no uncommitted changes (`git status` is clean), (3) file paths in artifacts are correct and files exist. This catches drift that accumulates during long sessions.

## Commands

```bash
npm test                    # Run all Jest tests
npm run test:coverage       # Jest with coverage enforcement
npm run test:dashboard      # Vitest dashboard tests
npm run lint                # ESLint on hooks and tests
npm run build:hooks         # Bundle hooks for distribution
npm run sync:generate       # Generate derivative plugins
npm run sync:verify         # Verify derivative consistency
npm run dashboard           # Launch dashboard UI
npm run dashboard:install   # Install dashboard dependencies
```

Coverage thresholds (enforced in `jest.config.cjs`): 70% statements, 68% branches, 70% functions, 70% lines.

Dashboard (separate dependency tree):
```bash
npm run dashboard:install                   # One-time install of dashboard deps
npm run dashboard -- --dir /path/to/project # Launch dashboard for a project
```

Load the plugin locally for manual testing:
```bash
claude --plugin-dir .
```

CI runs on Node 18/20/22 across Windows, macOS, and Linux. All three platforms must pass.

## Architecture

Three layers:

### Skills (`plan-build-run/skills/{name}/SKILL.md`)

Markdown files with YAML frontmatter defining slash commands (`/pbr:new-project`, `/pbr:plan-phase`, etc.). Each SKILL.md is a complete prompt that tells the orchestrator what to do. Skills read state, interact with the user, and spawn agents.

34 skills: audit, begin, build, config, continue, dashboard, debug, discuss, do, explore, health, help, import, intel, milestone, note, pause, plan, profile, quick, resume, review, scan, setup, status, statusline, test, todo, undo, and more.

### Agents (`agents/{name}.md`)

Markdown files with YAML frontmatter defining specialized subagent prompts. Agents run in fresh `Task()` contexts with clean 200k token windows. Spawned via `subagent_type: "pbr:{name}"` — auto-loaded by Claude Code.

17 agents: audit, codebase-mapper, debugger, dev-sync, executor, general, integration-checker, intel-updater, nyquist-auditor, plan-checker, planner, researcher, roadmapper, synthesizer, ui-checker, ui-researcher, verifier.

### Hook Scripts (`hooks/*.js`)

50 Node.js hook scripts that fire on Claude Code lifecycle events. Configured in `hooks/hooks.json`. All use CommonJS, must be cross-platform (`path.join()`, not hardcoded separators), and log via `logHook()` from `hook-logger.js`.

**Dispatch pattern**: Several hooks use dispatch scripts that fan out to sub-scripts based on the file being written/read:

| Hook Event | Entry Script | Delegates To |
|------------|-------------|-------------|
| SessionStart | progress-tracker.js | — (injects project state) |
| PostToolUse (Write\|Edit) | post-write-dispatch.js | check-plan-format.js, check-roadmap-sync.js, check-state-sync.js |
| PostToolUse (Write\|Edit) | post-write-quality.js | — (autoFormat, typeCheck, detectConsoleLogs) |
| PostToolUse (Task) | check-subagent-output.js | — (validates agent output) |
| PostToolUse (Write\|Edit) | suggest-compact.js | — (context budget warnings) |
| PostToolUse (Read) | track-context-budget.js | — (tracks reads for budget) |
| PostToolUseFailure | log-tool-failure.js | — (logs failures) |
| PreToolUse (Bash) | pre-bash-dispatch.js | validate-commit.js, check-dangerous-commands.js |
| PreToolUse (Write\|Edit) | pre-write-dispatch.js | check-skill-workflow.js, check-summary-gate.js, check-doc-sprawl.js |
| PreCompact | context-budget-check.js | — (preserves STATE.md) |
| Stop | auto-continue.js | — (chains next command) |
| SubagentStart/Stop | log-subagent.js | — (tracks lifecycle) |
| SubagentStop | event-handler.js | — (auto-verification trigger) |
| TaskCompleted | task-completed.js | — (processes task completion) |
| InstructionsLoaded | hook-server-client.js | — (detects instruction reload) |
| ConfigChange | hook-server-client.js | — (config change detection) |
| WorktreeCreate | hook-server-client.js | — (worktree setup) |
| WorktreeRemove | hook-server-client.js | — (worktree cleanup) |
| Notification | log-notification.js | — (notification logging) |
| UserPromptSubmit | prompt-routing.js | — (prompt routing) |
| SessionEnd | session-cleanup.js | — (cleanup) |

**Hook exit codes**: 0 = success, 2 = block (PreToolUse hooks that reject a tool call).

**Hook ordering**: When multiple PostToolUse hooks fire on the same event (e.g., Write|Edit), execution order is not guaranteed. See `references/hook-ordering.md` for ordering expectations, design rules, and known safe pairs.

**`${CLAUDE_PLUGIN_ROOT}`**: Used in hooks.json to reference script paths. Claude Code expands this internally — works on all platforms without shell expansion.

### Supporting Directories

- **`plan-build-run/bin/`** — CLI tools (`pbr-tools.js` + `lib/` modules)
- **`plan-build-run/references/`** — Shared reference docs loaded by skills (plan format, commit conventions, UI formatting, deviation rules)
- **`plan-build-run/templates/`** — EJS-style `.tmpl` files for generated markdown (VERIFICATION.md, SUMMARY.md, etc.)
- **`plugins/pbr/commands/`** — 63 command registration files (one `.md` per command mapping to its skill)
- **`plan-build-run/skills/shared/`** — 12 shared skill fragments extracted from repeated patterns across skills
- **`plugins/`** — Derivative plugins (codex-pbr, cursor-pbr, copilot-pbr)
- **`dashboard/`** — Vite + React 18 dashboard with Express backend

## Key Conventions

**Commit format**: `{type}({scope}): {description}` — enforced by PreToolUse hook. Types: feat, fix, refactor, test, docs, chore, wip, revert, perf, ci, build. Scopes should be **component names**: `hooks`, `skills`, `agents`, `cli`, `dashboard`, `templates`, `plugin`, `ci`, `config`, `tests`, `commands`, `refs`. Also accepts `quick-{NNN}`, `planning`, or descriptive words.

**Releases**: Run `node scripts/release.js` to bump version, generate changelog (via git-cliff), tag, push, and create GitHub Release. The changelog groups entries by component (Hooks, Skills, Agents, etc.) based on commit scope and message keywords.

**Skill frontmatter** (SKILL.md):
```yaml
---
name: skill-name
description: "What this skill does"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task
argument-hint: "<N> [--flag]"
---
```

**Agent frontmatter** ({name}.md):
```yaml
---
name: agent-name
description: "What this agent does"
model: sonnet|inherit|haiku
memory: none|user|project
isolation: worktree        # Run agent in isolated git worktree (optional)
color: <name|hex>          # Terminal color for agent output (optional)
tools:
  - Read
  - Write
  - Bash
---
```

## Data Flow

Skills and agents communicate through files on disk, not messages:

```
.planning/STATE.md      <- source of truth for current position
.planning/ROADMAP.md    <- phase structure, goals, dependencies
.planning/config.json   <- workflow settings
.planning/phases/NN-slug/
  PLAN.md               <- written by planner, read by executor
  SUMMARY.md            <- written by executor, read by orchestrator
  VERIFICATION.md       <- written by verifier, read by review skill
```

The orchestrator stays lean (~15% context) by delegating heavy work to agents. Each agent gets a fresh context window.

**Utility library**: `plan-build-run/bin/pbr-tools.js` is a shared Node.js library (stateLoad, configLoad, frontmatterParse, mustHavesCollect, etc.) used by multiple hook scripts. It provides CLI subcommands that agents call to avoid wasting tokens on file parsing.

## Testing

Tests live in `tests/` using Jest. Test files mirror script names: `validate-commit.test.js` tests `validate-commit.js`.

Dashboard tests live in `dashboard/tests/` using Vitest (not Jest). Run with `npm run test:dashboard`.

**Fixture project**: `tests/fixtures/fake-project/.planning/` provides read-only fixture data for tests.

**Mutation tests**: Use `fs.mkdtempSync()` to create temporary directories — never mutate the fixture project.

When adding a new hook script, create a corresponding test file. Tests must pass on Windows, macOS, and Linux.

## Dashboard

The dashboard (`dashboard/`) is a Vite + React 18 application with a separate Express backend (`dashboard/server/`). It provides a web UI for browsing `.planning/` state. Frontend: React 18, recharts, lucide-react. Backend: Express server with chokidar for file watching, WebSockets for live updates. CLI entry point: `dashboard/bin/cli.cjs` (default port 3141).
