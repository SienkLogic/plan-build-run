# Towline

Context-engineered development workflow for Claude Code.

Towline solves **context rot** — the quality degradation that occurs as Claude's 200k token context window fills up. It does this through disciplined subagent delegation, structured planning, atomic execution, and goal-backward verification.

## Installation

```bash
claude plugin add towline
```

Or load locally during development:
```bash
claude --plugin-dir /path/to/towline
```

## Quick Start

```bash
# Start a new project
/dev:begin

# Plan a phase
/dev:plan 1

# Build it
/dev:build 1

# Verify it works
/dev:review 1

# Repeat for each phase
/dev:plan 2
/dev:build 2
/dev:review 2

# Complete the milestone
/dev:milestone complete v1.0
```

## Commands

### Core Workflow

| Command | Description |
|---------|-------------|
| `/dev:begin` | Start a new project with deep questioning, research, requirements, and roadmap |
| `/dev:plan <N>` | Plan a phase — research, create plans, verify before building |
| `/dev:build <N>` | Build a phase — execute plans in parallel waves with atomic commits |
| `/dev:review <N>` | Verify the build — automated checks + conversational walkthrough |

### Planning

| Command | Description |
|---------|-------------|
| `/dev:discuss <N>` | Talk through a phase before planning |
| `/dev:plan <N> --assumptions` | Surface Claude's assumptions before planning |
| `/dev:plan <N> --skip-research` | Plan without research (faster) |
| `/dev:plan <N> --gaps` | Create gap-closure plans from verification failures |
| `/dev:plan add` | Append a new phase |
| `/dev:plan insert <N>` | Insert a phase with decimal numbering |
| `/dev:plan remove <N>` | Remove a future phase |

### Execution

| Command | Description |
|---------|-------------|
| `/dev:build <N> --gaps-only` | Execute only gap-closure plans |
| `/dev:quick` | Quick ad-hoc task with atomic commit |
| `/dev:debug` | Systematic debugging with hypothesis testing |
| `/dev:scan` | Analyze an existing codebase |

### Session Management

| Command | Description |
|---------|-------------|
| `/dev:status` | Show progress and suggest next action |
| `/dev:pause` | Save session state |
| `/dev:resume` | Pick up where you left off |

### Project Management

| Command | Description |
|---------|-------------|
| `/dev:milestone new\|complete\|audit\|gaps` | Manage milestones |
| `/dev:todo add\|list\|done` | Persistent file-based todos |
| `/dev:config` | Configure workflow settings |
| `/dev:help` | Command reference |

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

- **Context isolation**: Heavy work happens in fresh subagent contexts, not your main window
- **Goal-backward verification**: Checks codebase reality, not Claude's claims
- **Atomic commits**: Each task produces one commit in format `{type}({phase}-{plan}): description`
- **Wave-based parallelism**: Plans in the same wave execute in parallel
- **Persistent state**: All project state lives in `.planning/` and survives context resets

## Configuration

Settings live in `.planning/config.json`. Key options:

| Setting | Options | Default |
|---------|---------|---------|
| `depth` | quick, standard, comprehensive | standard |
| `context_strategy` | aggressive, balanced, minimal | aggressive |
| `mode` | interactive, autonomous | interactive |
| `parallelization.enabled` | true, false | true |
| `git.branching` | none, phase, milestone | none |

Run `/dev:config` to change settings interactively.

## Agents

Towline includes 9 specialized agents:

| Agent | Role | Model |
|-------|------|-------|
| Researcher | Domain research and discovery | Sonnet |
| Planner | Plans, roadmaps, requirements | Inherit |
| Plan Checker | Validates plans before execution | Sonnet |
| Executor | Builds code with atomic commits | Inherit |
| Verifier | Goal-backward verification | Sonnet |
| Integration Checker | Cross-phase E2E flow verification | Sonnet |
| Debugger | Systematic hypothesis-based debugging | Inherit |
| Codebase Mapper | Existing codebase analysis | Sonnet |
| Synthesizer | Research output synthesis | Haiku |

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
