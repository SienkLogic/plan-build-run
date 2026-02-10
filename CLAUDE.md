# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Towline is a **Claude Code plugin** that provides a structured development workflow. It solves context rot — quality degradation as Claude's context window fills up — through disciplined subagent delegation, file-based state, and goal-backward verification. Users invoke `/dev:*` slash commands (skills) that orchestrate specialized agents via `Task()`.

## Commands

```bash
npm test              # Run all Jest tests
npm run lint          # ESLint on plugins/dev/scripts/ and tests/
npm run validate      # Validate plugin directory structure (skills, agents, hooks)
```

Run a single test file:
```bash
npx jest tests/validate-commit.test.js
```

Load the plugin locally for manual testing:
```bash
claude --plugin-dir .
```

CI runs on Node 18/20/22 across Windows, macOS, and Linux. All three platforms must pass.

## Architecture

Towline has three layers, all under `plugins/dev/`:

### Skills (`skills/{name}/SKILL.md`)
Markdown files with YAML frontmatter that define slash commands (`/dev:begin`, `/dev:plan`, etc.). Each SKILL.md is a complete prompt — it tells the orchestrator (main Claude session) what to do when the user invokes the command. Skills are the entry points; they read state, interact with the user, and spawn agents.

20 skills exist: begin, build, config, continue, debug, discuss, explore, health, help, import, milestone, note, pause, plan, quick, resume, review, scan, status, todo.

### Agents (`agents/towline-{name}.md`)
Markdown files with YAML frontmatter that define specialized subagent prompts. Agents run in fresh `Task()` contexts with clean 200k token windows. They are spawned by skills via `subagent_type: "dev:towline-{name}"` — agent definitions are **auto-loaded** by Claude Code from this directory; never inline agent prompts into skill files.

10 agents: researcher, planner, plan-checker, executor, verifier, integration-checker, debugger, codebase-mapper, synthesizer, general.

### Scripts (`scripts/*.js`)
Node.js hook scripts that fire on Claude Code lifecycle events. Configured in `hooks/hooks.json`. All scripts use CommonJS (`require`), must be cross-platform (use `path.join()`, not hardcoded separators), and log via `logHook()` from `hook-logger.js`.

| Hook Event | Script | Purpose |
|------------|--------|---------|
| SessionStart | progress-tracker.js | Inject project state into new sessions |
| PostToolUse (Write/Edit) | check-plan-format.js | Validate PLAN.md/SUMMARY.md structure |
| PostToolUse (Write/Edit) | check-roadmap-sync.js | Check roadmap consistency |
| PreToolUse (Bash) | validate-commit.js | Enforce commit message format, block sensitive files |
| PreCompact | context-budget-check.js | Preserve STATE.md before context compression |
| Stop | auto-continue.js | Chain next command when auto_continue is enabled |
| SubagentStart/Stop | log-subagent.js | Track agent lifecycle |
| SessionEnd | session-cleanup.js | Clean up session state |

### Supporting directories

- **`references/`** — Shared reference docs loaded by skills (plan format, commit conventions, UI formatting, etc.)
- **`templates/`** — EJS-style `.tmpl` files for generated markdown (VERIFICATION.md, SUMMARY.md, etc.)
- **`commands/`** — Command registration files (one `.md` per command mapping to its skill)
- **`skills/shared/`** — Shared skill fragments (phase argument parsing, UI formatting)

## Key Conventions

**Commit format**: `{type}({scope}): {description}` — enforced by the PreToolUse hook. Types: feat, fix, refactor, test, docs, chore, wip. Scopes: `{NN}-{MM}` (phase-plan), `quick-{NNN}`, `planning`.

**Skill frontmatter** (SKILL.md):
```yaml
---
name: skill-name
description: "What this skill does"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task
argument-hint: "<N> [--flag]"
---
```

**Agent frontmatter** (towline-{name}.md):
```yaml
---
name: towline-agent-name
description: "What this agent does"
model: sonnet|inherit|haiku
memory: none|user|project
tools:
  - Read
  - Write
  - Bash
---
```

**Hook exit codes**: 0 = success/pass, 2 = block (for PreToolUse hooks that reject a tool call).

**`${CLAUDE_PLUGIN_ROOT}`**: Used in hooks.json to reference script paths. Claude Code expands this internally before execution — no shell expansion needed, works on all platforms.

## Data Flow

Skills and agents communicate through files on disk, not through messages:

```
.planning/STATE.md      ← source of truth for current position
.planning/ROADMAP.md    ← phase structure, goals, dependencies
.planning/config.json   ← all workflow settings (16 feature toggles, models, gates, git)
.planning/phases/NN-slug/
  PLAN.md               ← written by planner agent, read by executor agent
  SUMMARY.md            ← written by executor agent, read by orchestrator
  VERIFICATION.md       ← written by verifier agent, read by review skill
```

The main orchestrator stays lean (~15% context usage) by delegating heavy work to agents. Each agent gets a fresh context window.

## Testing

Tests live in `tests/` and use Jest. Integration tests use a fixture project at `tests/fixtures/fake-project/.planning/`. Test files mirror script names: `validate-commit.test.js` tests `validate-commit.js`.

The `towline-tools.js` script is a shared utility library (stateLoad, configLoad, etc.) used by multiple hook scripts — its tests are in both `towline-tools.test.js` and `integration.test.js`.

When adding a new hook script, create a corresponding test file.
