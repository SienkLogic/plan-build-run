---
name: help
description: "Command reference and workflow guide for Plan-Build-Run."
---

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► COMMAND REFERENCE                          ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

# /pbr:help — Plan-Build-Run Command Reference

## Contextual Help

If `$ARGUMENTS` contains a command name (e.g., `plan`, `build`, `review`, `config`, `quick`), show detailed help for just that command instead of the full reference. Match the argument against the command tables below and display only the matching section with its subcommands and flags. If the argument doesn't match any command, show the full reference.

Examples:
- `/pbr:help plan` → Show only the plan command and its flags (--assumptions, --skip-research, --gaps, add, insert, remove)
- `/pbr:help build` → Show only the build command and its flags (--gaps-only, --team)
- `/pbr:help` → Show the full reference below

## Full Reference

Display the following reference to the user:

---

## Plan-Build-Run Commands

### Core Workflow (the main loop)

| Command | Description | Cost |
|---------|-------------|------|
| `/pbr:begin` | Start a new project. Deep questioning, research, requirements, roadmap. | High (4-6 agents) |
| `/pbr:plan <N>` | Plan a phase. Research, create plans, verify before building. | Medium (2-3 agents) |
| `/pbr:build <N>` | Build a phase. Execute plans in parallel waves, verify results. | High (2-4 agents) |
| `/pbr:review <N>` | Review what was built. Automated verification + walkthrough with you. | Low (1 agent) |

### Planning & Discovery

| Command | Description |
|---------|-------------|
| `/pbr:explore [topic]` | Explore ideas, think through approaches. No phase number needed. |
| `/pbr:discuss <N>` | Talk through a phase before planning. Captures decisions. |
| `/pbr:plan <N> --assumptions` | Surface Claude's assumptions before planning. Zero cost. |
| `/pbr:plan <N> --skip-research` | Plan without research phase. Faster. |
| `/pbr:plan <N> --gaps` | Create gap-closure plans from verification failures. |
| `/pbr:plan add` | Append a new phase to the roadmap. |
| `/pbr:plan insert <N>` | Insert a phase using decimal numbering. |
| `/pbr:plan remove <N>` | Remove a future phase and renumber. |

### Execution

| Command | Description |
|---------|-------------|
| `/pbr:build <N>` | Execute all plans in a phase. |
| `/pbr:build <N> --gaps-only` | Execute only gap-closure plans. |
| `/pbr:build <N> --team` | Use Agent Teams for complex inter-agent coordination. |
| `/pbr:quick` | Quick ad-hoc task with atomic commit. Low cost. |
| `/pbr:continue` | Execute the next logical step automatically. No prompts. |

### Verification & Debugging

| Command | Description |
|---------|-------------|
| `/pbr:review <N>` | Verify phase + conversational UAT. |
| `/pbr:review <N> --auto-fix` | Auto-diagnose and fix verification failures. |
| `/pbr:debug` | Systematic debugging with hypothesis testing. |
| `/pbr:scan` | Analyze existing codebase (brownfield). |

### Session Management

| Command | Description |
|---------|-------------|
| `/pbr:status` | Where am I? Shows progress and suggests next action. |
| `/pbr:health` | Check planning directory integrity. Find and fix corrupted state. |
| `/pbr:pause` | Save session state for later. |
| `/pbr:pause --checkpoint` | Save with a named checkpoint for easier resumption. |
| `/pbr:resume` | Pick up where you left off. |

### Project Management

| Command | Description |
|---------|-------------|
| `/pbr:milestone new` | Start a new milestone cycle. |
| `/pbr:milestone complete` | Archive completed milestone. |
| `/pbr:milestone audit` | Verify milestone completion. |
| `/pbr:milestone gaps` | Create phases to close audit gaps. |
| `/pbr:todo add\|list\|done` | Persistent file-based todos. |
| `/pbr:todo work <NNN>` | Work on a specific todo by ID. |
| `/pbr:note <text>\|list\|promote` | Zero-friction idea capture. Quick notes that persist across sessions. |
| `/pbr:note --global` | Save note to global notes directory (shared across projects). |
| `/pbr:config` | Configure workflow settings. |
| `/pbr:import <N>` | Import external plans (design docs, RFCs) into PBR format. |
| `/pbr:import --from <path>` | Import from a specific file path. |
| `/pbr:import --skip-checker` | Skip plan-checker validation on import. |
| `/pbr:setup` | Interactive onboarding wizard for new projects. |

### Analysis & Utilities

| Command | Description |
|---------|-------------|
| `/pbr:audit` | Review past sessions for PBR workflow compliance and UX quality. |
| `/pbr:audit --today` | Audit today's sessions (default). |
| `/pbr:audit --from DATE --to DATE` | Audit a specific date range. |
| `/pbr:audit --mode compliance\|ux` | Run compliance-only or UX-only audit. |
| `/pbr:do <description>` | Route freeform text to the right PBR skill automatically. |
| `/pbr:dashboard` | Launch the web dashboard for the current project. |
| `/pbr:dashboard --port <N>` | Launch dashboard on a specific port. |
| `/pbr:statusline` | Install or configure the PBR status line in Claude Code. |

## Typical Workflow

```
/pbr:begin              ← Start project, define requirements, create roadmap
/pbr:discuss 1          ← (optional) Talk through phase details
/pbr:plan 1             ← Plan the first phase
/pbr:build 1            ← Build it
/pbr:review 1           ← Verify it works
/pbr:plan 2             ← Plan the next phase
...                     ← Repeat plan → build → review
/pbr:milestone complete ← Archive when done
```

## Quick Reference

- **Context strategy**: `aggressive` (delegate everything) | `balanced` | `minimal` (run inline)
- **Depth**: `quick` (skip research, ~50% cheaper) | `standard` | `comprehensive` (~2x cost)
- **State files**: `.planning/STATE.md` (position), `.planning/ROADMAP.md` (phases), `.planning/config.json` (settings)
- **Configure**: `/pbr:config` to change depth, models, gates, parallelization
- **List agents**: Run `claude agents` in your terminal to see all registered PBR agents and verify loading
- **Tip**: Use `/pbr:quick` for creative/visual work where structured planning adds overhead without benefit.
- **PR hygiene**: When creating PRs from a Plan-Build-Run project, `.planning/` commits can be filtered using phase branching (`git.branching: phase`) which squash-merges code-only changes to main.
- **Seeds**: `/pbr:explore` can create seed files (`.planning/seeds/`) with trigger conditions. Seeds auto-inject into planning when their trigger phase is reached.

## Behavioral Contexts

Plan-Build-Run includes three behavioral contexts in `contexts/` that adjust how Claude operates:

- **dev** — Active development: write code first, low verbosity, medium risk tolerance
- **research** — Exploration mode: read widely, no code writing, high verbosity, evidence-based
- **review** — Code review: read thoroughly, prioritize by severity, report don't fix

Skills automatically activate the appropriate context: `/pbr:build` uses dev context, `/pbr:discuss` uses research context, `/pbr:review` uses review context.

## When to Use Quick vs Plan+Build

| Use `/pbr:quick` when... | Use `/pbr:plan` + `/pbr:build` when... |
|--------------------------|----------------------------------------|
| Change touches ≤3 files | Change touches 4+ files |
| ≤100 lines of code | 100+ lines of code |
| Single subsystem | Multiple subsystems or cross-cutting |
| No architectural decisions | Requires design choices |
| Bug fix, small feature, docs | New feature, refactor, migration |

## Setup vs Begin

- **`/pbr:begin`** — Use this to start a new project. It handles everything: questioning, research, requirements, roadmap, AND config initialization. This is the standard entry point.
- **`/pbr:setup`** — Use this only to reconfigure an existing project's settings (model profiles, gates, depth, parallelization) without re-running the full begin flow.

If you're unsure, start with `/pbr:begin`. It will detect existing config and offer to reuse or overwrite.

## Team Discussions

The `features.team_discussions` config flag (and `/pbr:build --team`) enables **Agent Teams** for complex builds. When enabled, executor agents can coordinate with each other during parallel wave execution — sharing context about what they've built, resolving interface conflicts, and avoiding duplicate work. Best for phases where multiple plans have shared dependencies. Configure via `/pbr:config`.

## Getting Started

```

╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

→ `/pbr:begin` — start a new project
→ `/pbr:status` — check current project status
→ `/pbr:config` — configure workflow settings
→ `/pbr:help <command>` — detailed help for a specific command

```

## Getting Help

- GitHub Issues: https://github.com/SienkLogic/plan-build-run/issues
- README: https://github.com/SienkLogic/plan-build-run
