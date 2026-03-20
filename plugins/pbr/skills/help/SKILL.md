---
name: help
description: "Command reference and workflow guide for Plan-Build-Run."
allowed-tools: Read
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes ~7,600 tokens. Begin executing Step 1 immediately.**

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
| `/pbr:new-project` | Start a new project. Deep questioning, research, requirements, roadmap. | High (4-6 agents) |
| `/pbr:plan-phase <N>` | Plan a phase. Research, create plans, verify before building. | Medium (2-3 agents) |
| `/pbr:execute-phase <N>` | Build a phase. Execute plans in parallel waves, verify results. | High (2-4 agents) |
| `/pbr:verify-work <N>` | Review what was built. Automated verification + walkthrough with you. | Low (1 agent) |
| `/pbr:test <N>` | Generate tests for completed phase code. Detects framework automatically. | Medium (1-3 agents) |

### Planning & Discovery

| Command | Description |
|---------|-------------|
| `/pbr:explore [topic]` | Explore ideas, think through approaches. No phase number needed. |
| `/pbr:discuss-phase <N>` | Talk through a phase before planning. Captures decisions. |
| `/pbr:plan-phase <N> --assumptions` | Surface Claude's assumptions before planning. Zero cost. |
| `/pbr:plan-phase <N> --skip-research` | Plan without research phase. Faster. |
| `/pbr:plan-phase <N> --gaps` | Create gap-closure plans from verification failures. |
| `/pbr:plan-phase add` | Append a new phase to the roadmap. |
| `/pbr:plan-phase insert <N>` | Insert a phase using decimal numbering. |
| `/pbr:plan-phase remove <N>` | Remove a future phase and renumber. |
| `/pbr:ui-phase <N>` | Generate UI-SPEC.md design contracts for frontend-heavy phases. |

### Execution

| Command | Description |
|---------|-------------|
| `/pbr:execute-phase <N>` | Execute all plans in a phase. |
| `/pbr:execute-phase <N> --gaps-only` | Execute only gap-closure plans. |
| `/pbr:execute-phase <N> --team` | Use Agent Teams for complex inter-agent coordination. |
| `/pbr:quick` | Quick ad-hoc task with atomic commit. Low cost. |
| `/pbr:continue` | Execute the next logical step automatically. No prompts. |
| `/pbr:autonomous` | Run multiple phases hands-free. Chains discuss, plan, build, verify. |

### Verification & Debugging

| Command | Description |
|---------|-------------|
| `/pbr:verify-work <N>` | Verify phase + conversational UAT. |
| `/pbr:verify-work <N> --auto-fix` | Auto-diagnose and fix verification failures. |
| `/pbr:test <N>` | Generate tests for completed phase code. Detects framework, targets key files. |
| `/pbr:debug` | Systematic debugging with hypothesis testing. |
| `/pbr:ui-review <N>` | Retroactive visual audit of UI implementation with scoring. |
| `/pbr:map-codebase` | Analyze existing codebase (brownfield). |

### Session Management

| Command | Description |
|---------|-------------|
| `/pbr:progress` | Where am I? Shows progress and suggests next action. |
| `/pbr:health` | Check planning directory integrity. Find and fix corrupted state. |
| `/pbr:pause-work` | Save session state for later. |
| `/pbr:pause-work --checkpoint` | Save with a named checkpoint for easier resumption. |
| `/pbr:resume-work` | Pick up where you left off. |
| `/pbr:undo` | Revert recent PBR-generated commits by phase/plan using git revert. |

### Project Management

| Command | Description |
|---------|-------------|
| `/pbr:new-milestone` | Start a new milestone cycle. |
| `/pbr:complete-milestone` | Archive completed milestone. |
| `/pbr:milestone preview` | Dry-run of complete — show what would happen. |
| `/pbr:audit-milestone` | Verify milestone completion. |
| `/pbr:plan-milestone-gaps` | Create phases to close audit gaps. |
| `/pbr:add-todo\|list\|done` | Persistent file-based todos. |
| `/pbr:todo work <NNN>` | Work on a specific todo by ID. |
| `/pbr:note <text>\|list\|promote` | Zero-friction idea capture. Quick notes that persist across sessions. |
| `/pbr:note --global` | Save note to global notes directory (shared across projects). |
| `/pbr:settings session_phase_limit <N>` | Set max phases per session before auto-pause (0 = disabled, default 3). |
| `/pbr:settings` | Configure workflow settings. |
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
| `/pbr:intel` | Refresh or query codebase intelligence (file graph, APIs, architecture). |
| `/pbr:release` | Generate or update changelog and release notes from project history. |
| `/pbr:session-report` | Generate post-session summary with work performed and outcomes. |
| `/pbr:ship` | Create a rich PR from planning artifacts (SUMMARYs, requirements, verification). |
| `/pbr:profile-user` | Analyze session history to generate a developer behavioral profile. |
| `/pbr:statusline` | Install or configure the PBR status line in Claude Code. |

## Choose Your Command

Not sure which command to use? Follow this guide:

| I want to... | Command |
|--------------|---------|
| Start a new project | `/pbr:new-project` |
| Fix a bug or investigate an error | `/pbr:debug` |
| Think through an idea or approach | `/pbr:explore` |
| Do a small task (≤3 files) | `/pbr:quick` |
| Plan a complex change (4+ files) | `/pbr:plan-phase <N>` |
| See where I am and what's next | `/pbr:progress` |
| Auto-execute the next step | `/pbr:continue` |
| Describe something and let PBR route it | `/pbr:do <description>` |
| Lock decisions for a specific phase | `/pbr:discuss-phase <N>` |
| Check project health | `/pbr:health` |

## Typical Workflow

```
/pbr:new-project              ← Start project, define requirements, create roadmap
/pbr:discuss-phase 1          ← (optional) Talk through phase details
/pbr:plan-phase 1             ← Plan the first phase
/pbr:execute-phase 1            ← Build it
/pbr:verify-work 1           ← Verify it works
/pbr:plan-phase 2             ← Plan the next phase
...                     ← Repeat plan → build → review
/pbr:complete-milestone ← Archive when done
```

**Shortcut**: After `/pbr:new-project`, run `/pbr:continue` repeatedly — it auto-advances through plan → build → review → next phase, stopping at milestones and errors.

## status vs continue vs do

| | `/pbr:progress` | `/pbr:continue` | `/pbr:do <text>` |
|-|---------------|-----------------|-------------------|
| **Purpose** | Dashboard — show progress, suggest next | Auto-execute the next logical step | Route freeform text to a skill |
| **Reads state?** | Yes (full scan) | Yes (minimal) | No |
| **Modifies files?** | Never | Yes (via delegation) | Depends on routed skill |
| **Asks questions?** | If multiple options | Never — fully automatic | Only if ambiguous |
| **Use when...** | You want to see where you are before deciding | You trust PBR to pick and run the next step | You'd rather describe a task in plain English |
| **Hard stops** | N/A | Milestones, checkpoints, errors, verification gaps, session phase limit | N/A |

## Quick Reference

- **Context strategy**: `aggressive` (delegate everything) | `balanced` | `minimal` (run inline)
- **Depth**: `quick` (skip research, ~50% cheaper) | `standard` | `comprehensive` (~2x cost)
- **State files**: `.planning/STATE.md` (position), `.planning/ROADMAP.md` (phases), `.planning/config.json` (settings)
- **Configure**: `/pbr:settings` to change depth, models, gates, parallelization
- **List agents**: Run `claude agents` in your terminal to see all registered PBR agents and verify loading
- **Tip**: Use `/pbr:quick` for creative/visual work where structured planning adds overhead without benefit.
- **PR hygiene**: When creating PRs from a Plan-Build-Run project, `.planning/` commits can be filtered using phase branching (`git.branching: phase`) which squash-merges code-only changes to main.
- **Session cycling**: After `session_phase_limit` phases (default 3), PBR auto-pauses and resumes with a fresh context. In TMUX, this is seamless. Configure via `/pbr:settings session_phase_limit <N>`.
- **Seeds**: `/pbr:explore` can create seed files (`.planning/seeds/`) with trigger conditions. Seeds auto-inject into planning when their trigger phase is reached.

## Behavioral Contexts

Reference: `@references/behavioral-contexts.md` for full context profile definitions.

Plan-Build-Run includes three behavioral contexts in `contexts/` that adjust how Claude operates:

- **dev** — Active development: write code first, low verbosity, medium risk tolerance
- **research** — Exploration mode: read widely, no code writing, high verbosity, evidence-based
- **review** — Code review: read thoroughly, prioritize by severity, report don't fix

Skills automatically activate the appropriate context: `/pbr:execute-phase` uses dev context, `/pbr:discuss-phase` uses research context, `/pbr:verify-work` uses review context.

## When to Use Quick vs Plan+Build

| Use `/pbr:quick` when... | Use `/pbr:plan-phase` + `/pbr:execute-phase` when... |
|--------------------------|----------------------------------------|
| Change touches ≤3 files | Change touches 4+ files |
| ≤100 lines of code | 100+ lines of code |
| Single subsystem | Multiple subsystems or cross-cutting |
| No architectural decisions | Requires design choices |
| Bug fix, small feature, docs | New feature, refactor, migration |

## Setup vs Begin

- **`/pbr:new-project`** — Use this to start a new project. It handles everything: questioning, research, requirements, roadmap, AND config initialization. This is the standard entry point.
- **`/pbr:setup`** — Use this only to reconfigure an existing project's settings (model profiles, gates, depth, parallelization) without re-running the full begin flow.

If you're unsure, start with `/pbr:new-project`. It will detect existing config and offer to reuse or overwrite.

## Team Discussions

The `features.team_discussions` config flag (and `/pbr:execute-phase --team`) enables **Agent Teams** for complex builds. When enabled, executor agents can coordinate with each other during parallel wave execution — sharing context about what they've built, resolving interface conflicts, and avoiding duplicate work. Best for phases where multiple plans have shared dependencies. Configure via `/pbr:settings`.

## Getting Started

```


╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

- `/pbr:new-project` — start a new project
- `/pbr:progress` — check current project status
- `/pbr:settings` — configure workflow settings
- `/pbr:help <command>` — detailed help for a specific command


```

## Getting Help

- GitHub Issues: https://github.com/SienkLogic/plan-build-run/issues
- README: https://github.com/SienkLogic/plan-build-run
