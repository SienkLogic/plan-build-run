# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Plan-Build-Run is a **Claude Code plugin** that provides a structured development workflow. It solves context rot — quality degradation as Claude's context window fills up — through disciplined subagent delegation, file-based state, and goal-backward verification. Users invoke `/pbr:*` slash commands (skills) that orchestrate specialized agents via `Task()`.

## Critical Rules

- **NEVER add AI co-author lines** to git commits or PRs. No `Co-Authored-By: Claude` or similar. Only add co-author lines referencing actual human contributors.
- **NEVER inline agent definitions** into skill prompts. Use `subagent_type: "pbr:{name}"` — Claude Code auto-loads agent definitions from `agents/`. Reading agent `.md` files wastes main context.

## Commands

```bash
npm test                                    # Run all Jest tests (~1666 tests, 57 suites)
npm run lint                                # ESLint on plugins/pbr/scripts/ and tests/
npm run validate                            # Validate plugin directory structure
npx jest tests/validate-commit.test.js      # Run a single test file
npx jest --coverage                         # Run with coverage report
```

Coverage thresholds (enforced in `package.json`): 70% statements, 70% branches, 70% functions, 70% lines.

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

All plugin code lives under `plugins/pbr/`. Three layers:

### Skills (`skills/{name}/SKILL.md`)
Markdown files with YAML frontmatter defining slash commands (`/pbr:begin`, `/pbr:plan`, etc.). Each SKILL.md is a complete prompt that tells the orchestrator what to do. Skills read state, interact with the user, and spawn agents.

21 skills: begin, build, config, continue, debug, discuss, explore, health, help, import, milestone, note, pause, plan, quick, resume, review, scan, setup, status, todo.

### Agents (`agents/{name}.md`)
Markdown files with YAML frontmatter defining specialized subagent prompts. Agents run in fresh `Task()` contexts with clean 200k token windows. Spawned via `subagent_type: "pbr:{name}"` — auto-loaded by Claude Code.

10 agents: researcher, planner, plan-checker, executor, verifier, integration-checker, debugger, codebase-mapper, synthesizer, general.

### Scripts (`scripts/*.js`)
28 Node.js hook scripts that fire on Claude Code lifecycle events. Configured in `hooks/hooks.json`. All use CommonJS, must be cross-platform (`path.join()`, not hardcoded separators), and log via `logHook()` from `hook-logger.js`.

**Dispatch pattern**: Several hooks use dispatch scripts that fan out to sub-scripts based on the file being written/read:

| Hook Event | Entry Script | Delegates To |
|------------|-------------|-------------|
| SessionStart | progress-tracker.js | — (injects project state) |
| PostToolUse (Write\|Edit) | post-write-dispatch.js | check-plan-format.js, check-roadmap-sync.js, check-state-sync.js |
| PostToolUse (Write\|Edit) | post-write-quality.js | check-doc-sprawl.js, check-skill-workflow.js |
| PostToolUse (Task) | check-subagent-output.js | — (validates agent output) |
| PostToolUse (Write\|Edit) | suggest-compact.js | — (context budget warnings) |
| PostToolUse (Read) | track-context-budget.js | — (tracks reads for budget) |
| PostToolUseFailure | log-tool-failure.js | — (logs failures) |
| PreToolUse (Bash) | pre-bash-dispatch.js | validate-commit.js, check-dangerous-commands.js, check-phase-boundary.js |
| PreToolUse (Write\|Edit) | pre-write-dispatch.js | — (write guards) |
| PreCompact | context-budget-check.js | — (preserves STATE.md) |
| Stop | auto-continue.js | — (chains next command) |
| SubagentStart/Stop | log-subagent.js | — (tracks lifecycle) |
| SubagentStop | event-handler.js | — (auto-verification trigger) |
| TaskCompleted | task-completed.js | — (processes task completion) |
| SessionEnd | session-cleanup.js | — (cleanup) |

**Hook exit codes**: 0 = success, 2 = block (PreToolUse hooks that reject a tool call).

**`${CLAUDE_PLUGIN_ROOT}`**: Used in hooks.json to reference script paths. Claude Code expands this internally — works on all platforms without shell expansion.

### Supporting directories

- **`references/`** — Shared reference docs loaded by skills (plan format, commit conventions, UI formatting, deviation rules)
- **`templates/`** — EJS-style `.tmpl` files for generated markdown (VERIFICATION.md, SUMMARY.md, etc.)
- **`commands/`** — Command registration files (one `.md` per command mapping to its skill)
- **`skills/shared/`** — 14 shared skill fragments extracted from repeated patterns across skills (config-loading, digest-select, revision-loop, context-loader-task, universal-anti-patterns, phase-argument-parsing, gate-prompts, state-loading, state-update, commit-planning-docs, context-budget, domain-probes, progress-display, error-reporting)

## Key Conventions

**Commit format**: `{type}({scope}): {description}` — enforced by PreToolUse hook. Types: feat, fix, refactor, test, docs, chore, wip. Scopes: `{NN}-{MM}` (phase-plan), `quick-{NNN}`, `planning`, `tools`, or descriptive word.

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
tools:
  - Read
  - Write
  - Bash
---
```

## Data Flow

Skills and agents communicate through files on disk, not messages:

```
.planning/STATE.md      ← source of truth for current position
.planning/ROADMAP.md    ← phase structure, goals, dependencies
.planning/config.json   ← workflow settings (~62 properties across 12 top-level keys)
.planning/phases/NN-slug/
  PLAN.md               ← written by planner, read by executor
  SUMMARY.md            ← written by executor, read by orchestrator
  VERIFICATION.md       ← written by verifier, read by review skill
```

The orchestrator stays lean (~15% context) by delegating heavy work to agents. Each agent gets a fresh context window.

**Utility library**: `pbr-tools.js` is a shared Node.js library (stateLoad, configLoad, frontmatterParse, mustHavesCollect, etc.) used by multiple hook scripts. It provides CLI subcommands that agents call to avoid wasting tokens on file parsing.

## Testing

Tests live in `tests/` using Jest. Test files mirror script names: `validate-commit.test.js` tests `validate-commit.js`.

**Fixture project**: `tests/fixtures/fake-project/.planning/` provides read-only fixture data for tests.

**Mutation tests**: Use `fs.mkdtempSync()` to create temporary directories — never mutate the fixture project.

**`pbr-tools.js` tests** span both `pbr-tools.test.js` and `integration.test.js`.

When adding a new hook script, create a corresponding test file. Tests must pass on Windows, macOS, and Linux.

## Dashboard

The dashboard (`dashboard/`) is a separate Express.js application with its own dependency tree (`dashboard/package.json`). It provides a web UI for browsing `.planning/` state. Tech: Express 5.x, EJS, Pico.css, HTMX 2.0, chokidar for file watching, SSE for live updates.

Dashboard tests use Vitest (not Jest) and live in `dashboard/tests/`. Run with `npm --prefix dashboard test`.
