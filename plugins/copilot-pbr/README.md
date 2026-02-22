# Plan-Build-Run for GitHub Copilot CLI

A structured development workflow plugin for GitHub Copilot CLI that solves context rot through disciplined agent delegation, file-based state, and goal-backward verification.

## Installation

### Automated Setup (Recommended)

The setup script installs PBR as a Copilot CLI plugin and symlinks agents into your project.

**macOS / Linux:**
```bash
cd /path/to/your/project
bash /path/to/plan-build-run/plugins/copilot-pbr/setup.sh
```

**Windows (PowerShell):**
```powershell
cd C:\path\to\your\project
powershell -ExecutionPolicy Bypass -File C:\path\to\plan-build-run\plugins\copilot-pbr\setup.ps1
```

This installs:
- The PBR plugin (globally via `copilot plugin install` or symlink to `~/.copilot/installed-plugins/`)
- `.github/agents/*.agent.md` — 10 specialized agent definitions (project-scoped)

### Manual Setup

If you prefer not to use the setup script:

1. Run `copilot plugin install --local /path/to/plugins/copilot-pbr`
2. Copy or symlink all files from `agents/` into your project's `.github/agents/` directory
3. Skills (in `skills/`) are prompt templates — paste a skill's `SKILL.md` content into Copilot CLI chat to invoke it, or use `/pbr:*` slash commands if the plugin is installed

### Uninstall

```bash
copilot plugin uninstall pbr
rm .github/agents/*.agent.md
```

## Quick Start

The core workflow follows four steps per phase:

```
/pbr:begin     — Define your project: requirements, research, roadmap
/pbr:plan 1    — Create a detailed plan for phase 1
/pbr:build 1   — Execute the plan with atomic commits
/pbr:review 1  — Verify the build matched the plan
```

Repeat `plan` / `build` / `review` for each phase in your roadmap.

## Skills (25)

| Skill | Description |
|-------|-------------|
| audit | Review past Claude Code sessions for PBR workflow compliance and UX quality. |
| begin | Start a new project. Deep questioning, research, requirements, and roadmap. |
| build | Execute all plans in a phase. Spawns agents to build in parallel, commits atomically. |
| config | Configure settings: depth, model profiles, features, git, and gates. |
| continue | Execute the next logical step automatically. No prompts, no decisions. |
| dashboard | Launch the PBR web dashboard for the current project. |
| debug | Systematic debugging with hypothesis testing. Persistent across sessions. |
| discuss | Talk through a phase before planning. Identifies gray areas and captures decisions. |
| do | Route freeform text to the right PBR skill automatically. |
| explore | Explore ideas, think through approaches, and route insights to the right artifacts. |
| health | Check planning directory integrity. Find and fix corrupted state. |
| help | Command reference and workflow guide. |
| import | Import external plans. Validates context, detects conflicts, generates PLAN.md. |
| milestone | Manage milestones: new, complete, audit, gaps. |
| note | Zero-friction idea capture. Append, list, or promote notes to todos. |
| pause | Save your current session state for later resumption. |
| plan | Create a detailed plan for a phase. Research, plan, and verify before building. |
| quick | Execute an ad-hoc task with atomic commits. Skips full plan/review. |
| resume | Pick up where you left off. Restores context and suggests next action. |
| review | Verify the build matched the plan. Automated checks plus walkthrough. |
| scan | Analyze an existing codebase. Maps structure, architecture, conventions, and concerns. |
| setup | Onboarding wizard. Initialize project, select models, verify setup. |
| status | Show current project status and suggest what to do next. |
| statusline | Install or configure the PBR status line in Claude Code. |
| todo | File-based persistent todos. Add, list, complete — survives sessions. |

## Agents (11)

| Agent | Description |
|-------|-------------|
| audit | Analyzes Claude Code session logs for PBR workflow compliance and UX quality. |
| codebase-mapper | Explores codebases and writes structured analysis across four focus areas. |
| debugger | Systematic debugging using scientific method with hypothesis testing and evidence tracking. |
| executor | Executes plan tasks with atomic commits, deviation handling, and self-verification. |
| general | Lightweight agent for ad-hoc tasks that don't fit specialized roles. |
| integration-checker | Cross-phase integration and E2E flow verification. |
| plan-checker | Verifies plans will achieve phase goals before execution via goal-backward analysis. |
| planner | Creates executable phase plans with task breakdown, dependency analysis, and wave assignment. |
| researcher | Unified research agent for project domains and implementation approaches. |
| synthesizer | Fast synthesis of multiple research outputs into coherent recommendations. |
| verifier | Goal-backward phase verification against the real codebase. |

## Configuration

Plan-Build-Run stores all state in a `.planning/` directory at your project root:

- `.planning/config.json` — Workflow settings (~62 properties across 12 keys)
- `.planning/STATE.md` — Current position and status
- `.planning/ROADMAP.md` — Phase structure, goals, and dependencies
- `.planning/phases/NN-slug/` — Per-phase plans, summaries, and verification reports

Run `/pbr:config` to interactively adjust settings like depth, model profiles, and gate behavior.

## Hook Compatibility

Copilot CLI supports 6 hook events vs Claude Code's full set. The following hooks are active in this port:

| Event | Scripts |
|-------|---------|
| sessionStart | progress-tracker.js |
| postToolUse | post-write-dispatch.js, post-write-quality.js, check-subagent-output.js, suggest-compact.js, track-context-budget.js |
| preToolUse | pre-bash-dispatch.js, pre-write-dispatch.js, validate-task.js, validate-skill-args.js |
| sessionEnd | session-cleanup.js |

**Not available** in Copilot CLI (present in Claude Code/Cursor ports): `SubagentStart`, `SubagentStop`, `TaskCompleted`, `PostToolUseFailure`, `PreCompact`, `Stop`.

**Impact of missing hooks:**

- No auto-continue between skills (`Stop` hook) — you must manually run the next command
- No tool failure logging (`PostToolUseFailure`) — silent failures won't be recorded to `.planning/logs/`
- No context budget preservation on compaction (`PreCompact`) — STATE.md won't be auto-preserved when context is compressed
- No subagent lifecycle tracking (`SubagentStart`/`SubagentStop`/`TaskCompleted`) — agent spawn/completion events aren't logged

## Cross-Plugin Compatibility

This plugin works alongside the Claude Code and Cursor versions of Plan-Build-Run. All three plugins share the same `.planning/` directory and file formats, so you can switch between tools without losing state. Hook scripts under `plugins/pbr/scripts/` are shared between all plugins via relative paths.

## Links

- Repository: [https://github.com/SienkLogic/plan-build-run](https://github.com/SienkLogic/plan-build-run)
- License: MIT
