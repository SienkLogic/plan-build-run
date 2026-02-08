# Towline

**Context-engineered development workflow for Claude Code.**

Towline solves **context rot** — the quality degradation that occurs as Claude's 200k token context window fills up during complex, multi-phase projects. It does this through disciplined subagent delegation, structured planning, atomic execution, and goal-backward verification. The result: you can build ambitious software without quality dropping off a cliff halfway through.

## The Problem

Claude Code is remarkably capable — until your context window fills up. As tokens accumulate across a long session, reasoning quality degrades, hallucinations increase, and the model starts losing track of earlier decisions. This is **context rot**, and it's the primary failure mode when building anything beyond a single-session project. Standard usage hits a wall: the more complex your project, the worse the output gets over time.

## Philosophy

Towline is built on five principles:

- **Context is Currency** — The main orchestrator stays under 15-20% of the context window. Heavy lifting happens in fresh subagent contexts via `Task()`, each getting a clean 200k window.
- **State > Memory** — If it isn't in `.planning/STATE.md`, it didn't happen. Sessions are killable at any second without data loss. All project state lives on disk.
- **Fan-Out / Fan-In** — Spawn parallel agents for throughput, aggregate results back. Three researchers running simultaneously beats one researcher running three times.
- **Trust but Verify** — A dedicated read-only verifier agent checks what was actually built against requirements. It reads the codebase, not Claude's claims about the codebase.
- **Build Houses, Don't Swat Flies** — Towline's structured workflow pays off for complex multi-phase work. For simple tasks, use `/dev:quick` and skip the ceremony.

## Quick Start

```bash
# Install the plugin
claude plugin add towline

# Start a new project — deep questioning, research, requirements, roadmap
/dev:begin

# Plan the first phase — research, create plans, verify before building
/dev:plan 1

# Build it — execute plans in parallel waves with atomic commits
/dev:build 1

# Verify it works — automated checks + conversational walkthrough
/dev:review 1
```

Then repeat `plan → build → review` for each phase until you're done.

## Typical Workflow

A realistic day-to-day session looks like this:

```
/dev:begin              ← Start project, define requirements, create roadmap
/dev:discuss 1          ← (optional) Talk through phase details
/dev:plan 1             ← Plan the first phase
/dev:build 1            ← Build it
/dev:review 1           ← Verify it works
/dev:plan 2             ← Plan the next phase
...                     ← Repeat plan → build → review
/dev:milestone complete ← Archive when done
```

**Other entry points:**

- `/dev:explore` — Think through ideas and approaches before committing to a direction. No phase number needed.
- `/dev:continue` — Execute the next logical step automatically. No prompts, no decisions — just do it.
- `/dev:quick` — Fast ad-hoc task with atomic commit. Skip the structured workflow for simple stuff.
- `/dev:status` — Lost? Check where you are and what to do next.

## Commands

### Core Workflow

| Command | Description | Cost |
|---------|-------------|------|
| `/dev:begin` | Start a new project. Deep questioning, research, requirements, roadmap. | High (4-6 agents) |
| `/dev:plan <N>` | Plan a phase. Research, create plans, verify before building. | Medium (2-3 agents) |
| `/dev:build <N>` | Build a phase. Execute plans in parallel waves, verify results. | High (2-4 agents) |
| `/dev:review <N>` | Review what was built. Automated verification + walkthrough with you. | Low (1 agent) |

### Planning & Discovery

| Command | Description |
|---------|-------------|
| `/dev:explore [topic]` | Explore ideas, think through approaches. No phase number needed. |
| `/dev:discuss <N>` | Talk through a phase before planning. Captures decisions. |
| `/dev:plan <N> --assumptions` | Surface Claude's assumptions before planning. Zero cost. |
| `/dev:plan <N> --skip-research` | Plan without research phase. Faster. |
| `/dev:plan <N> --gaps` | Create gap-closure plans from verification failures. |
| `/dev:plan add` | Append a new phase to the roadmap. |
| `/dev:plan insert <N>` | Insert a phase using decimal numbering. |
| `/dev:plan remove <N>` | Remove a future phase and renumber. |

### Execution

| Command | Description |
|---------|-------------|
| `/dev:build <N>` | Execute all plans in a phase. |
| `/dev:build <N> --gaps-only` | Execute only gap-closure plans. |
| `/dev:build <N> --team` | Use Agent Teams for complex inter-agent coordination. |
| `/dev:quick` | Quick ad-hoc task with atomic commit. Low cost. |
| `/dev:continue` | Execute the next logical step automatically. No prompts. |

### Verification & Debugging

| Command | Description |
|---------|-------------|
| `/dev:review <N>` | Verify phase + conversational UAT. |
| `/dev:review <N> --auto-fix` | Auto-diagnose and fix verification failures. |
| `/dev:debug` | Systematic debugging with hypothesis testing. |
| `/dev:scan` | Analyze existing codebase (brownfield). |

### Session Management

| Command | Description |
|---------|-------------|
| `/dev:status` | Where am I? Shows progress and suggests next action. |
| `/dev:health` | Check planning directory integrity. Find and fix corrupted state. |
| `/dev:pause` | Save session state for later. |
| `/dev:resume` | Pick up where you left off. |

### Project Management

| Command | Description |
|---------|-------------|
| `/dev:milestone new` | Start a new milestone cycle. |
| `/dev:milestone complete` | Archive completed milestone. |
| `/dev:milestone audit` | Verify milestone completion. |
| `/dev:milestone gaps` | Create phases to close audit gaps. |
| `/dev:todo add\|list\|done` | Persistent file-based todos. |
| `/dev:config` | Configure workflow settings (16 toggles). |

## How It Works

Towline is a **thin orchestrator** that keeps your main Claude Code context window lean (~15% usage) by delegating heavy work to fresh subagent contexts via `Task()`.

```
Main Session (stays lean)
  |
  |--- Task(researcher) ---> writes .planning/research/
  |--- Task(planner) ------> writes PLAN.md files
  |--- Task(executor) -----> builds code, creates commits
  |--- Task(verifier) -----> checks what was actually built
```

Each subagent gets a fresh 200k context window. Data flows through files on disk, not through messages. The orchestrator's only job is sequencing and user interaction.

### Key Concepts

- **Context isolation** — Heavy work happens in fresh subagent contexts, not your main window
- **Goal-backward verification** — Checks codebase reality against phase goals, not Claude's claims
- **Atomic commits** — Each task produces one commit in format `{type}({phase}-{plan}): description`
- **Wave-based parallelism** — Plans in the same wave execute in parallel
- **Persistent state** — All project state lives in `.planning/` and survives context resets
- **Auto-continue** — `/dev:continue` determines and executes the next step without prompting

## Agents

Towline includes 10 specialized agents:

| Agent | Role | Model |
|-------|------|-------|
| Researcher | Domain research, phase implementation approaches, synthesis | Sonnet |
| Planner | Plans, roadmaps, requirements, wave assignment | Inherit |
| Plan Checker | Validates plans against phase goals before execution | Sonnet |
| Executor | Builds code with atomic commits, TDD, self-verification | Inherit |
| Verifier | Goal-backward verification of built work | Sonnet |
| Integration Checker | Cross-phase E2E flow verification | Sonnet |
| Debugger | Systematic hypothesis-based debugging with checkpoints | Inherit |
| Codebase Mapper | Existing codebase analysis (tech, arch, quality, concerns) | Sonnet |
| Synthesizer | Research output synthesis and contradiction resolution | Haiku |
| General | Lightweight Towline-aware agent for ad-hoc tasks | Inherit |

## Project Structure

Towline creates a `.planning/` directory in your project:

```
.planning/
  PROJECT.md          # Project vision and scope
  REQUIREMENTS.md     # Scoped requirements with REQ-IDs
  ROADMAP.md          # Phase structure
  STATE.md            # Current position (auto-updated)
  config.json         # Workflow preferences
  phases/
    01-foundation/
      01-01-PLAN.md     # Executable plan
      01-01-SUMMARY.md  # Execution results
      VERIFICATION.md   # Verification report
```

## Towline Dashboard

The Towline Dashboard is a companion web application that provides a visual interface for browsing your project's `.planning/` state. It reads planning files from disk and renders them as an interactive dashboard with live updates.

### Features

- **Dashboard** — Project overview with current phase, overall progress bar, and all-phases table
- **Phase Detail** — Plans with status badges, key decisions, key files, duration metrics, and commit history
- **Roadmap** — Full phase list with descriptions, plan counts, dependencies, and color-coded status
- **Todos** — Pending todo list with priority badges, create form, mark-as-done, and detail view
- **Live Updates** — chokidar watches `.planning/**/*.md`; SSE broadcasts changes; HTMX refreshes content in-place
- **HTMX Navigation** — SPA-like sidebar navigation without full page reloads
- **Error Handling** — Global error handler, 404 pages, HTMX fragment support, dev-only stack traces
- **Security** — Helmet headers, CSP, path traversal protection, 127.0.0.1-only binding

### Tech Stack

Express 5.x, EJS templates, Pico.css v2, HTMX 2.0.8, gray-matter + marked, chokidar 5.x, Helmet, Vitest (154 tests).

### Usage

```bash
# Start the dashboard pointing at any Towline project
node /path/to/towline-dashboard/bin/cli.js --dir /path/to/your/project

# Custom port (default: 3000)
node /path/to/towline-dashboard/bin/cli.js --dir /path/to/your/project --port 8080
```

Opens at `http://127.0.0.1:3000`. The dashboard auto-refreshes when planning files change on disk.

**Requirements:** Node.js 18+ and a project with a `.planning/` directory (created by `/dev:begin`).

## Configuration

Settings live in `.planning/config.json`. Key options:

| Setting | Options | Default |
|---------|---------|---------|
| `depth` | quick, standard, comprehensive | standard |
| `context_strategy` | aggressive, balanced, minimal | aggressive |
| `mode` | interactive, autonomous | interactive |
| `parallelization.enabled` | true, false | true |
| `git.branching` | none, phase, milestone | none |

Run `/dev:config` to change settings interactively. There are 16 feature toggles covering depth, models, quality gates, parallelization, and git workflow.

## Installation

```bash
claude plugin add towline
```

Or load locally during development:

```bash
claude --plugin-dir /path/to/towline
```

Requires Claude Code CLI and Node.js 18+.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
