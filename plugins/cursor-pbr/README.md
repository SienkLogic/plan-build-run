# Plan-Build-Run for Cursor

A structured development workflow plugin for Cursor that solves context rot through disciplined subagent delegation, file-based state, and goal-backward verification.

## Installation

1. Clone or download this repository
2. In Cursor, load the plugin directory: `plugins/cursor-pbr/`
3. The plugin registers `/pbr:*` slash commands automatically

## Quick Start

```
/pbr:begin     — Define your project: requirements, research, roadmap
/pbr:plan 1    — Create a detailed plan for phase 1
/pbr:build 1   — Execute the plan with atomic commits
/pbr:review 1  — Verify the build matched the plan
```

Repeat `plan` / `build` / `review` for each phase in your roadmap.

## Skills (21)

| Skill | Description |
|-------|-------------|
| begin | Start a new project. Deep questioning, research, requirements, and roadmap. |
| build | Execute all plans in a phase. Spawns agents to build in parallel, commits atomically. |
| config | Configure settings: depth, model profiles, features, git, and gates. |
| continue | Execute the next logical step automatically. No prompts, no decisions. |
| debug | Systematic debugging with hypothesis testing. Persistent across sessions. |
| discuss | Talk through a phase before planning. Identifies gray areas and captures decisions. |
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
| todo | File-based persistent todos. Add, list, complete — survives sessions. |

## Agents (10)

| Agent | Description |
|-------|-------------|
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

## Cross-Plugin Compatibility

This plugin works alongside the Claude Code version of Plan-Build-Run. Both plugins share the same `.planning/` directory and file formats, so you can switch between Cursor and Claude Code without losing state. Hook scripts under `plugins/pbr/scripts/` are shared between both plugins.

## Links

- Repository: [https://github.com/SienkLogic/plan-build-run](https://github.com/SienkLogic/plan-build-run)
- License: MIT
