# PBR Commands

Complete reference for all 71 `/pbr:*` slash commands. Each command maps to a skill in `plugins/pbr/skills/`.

---

## Core Workflow

| Command | Description | Arguments |
|---------|-------------|-----------|
| `/pbr:begin` | Start a new project with deep questioning, research, and roadmap | |
| `/pbr:new-project` | Initialize a new project with deep context gathering | `[--auto]` |
| `/pbr:discuss` | Talk through a phase before planning | `<phase-number> [--auto] \| --project` |
| `/pbr:discuss-phase` | Gather phase context through adaptive questioning | `<phase>` |
| `/pbr:plan` | Create a detailed plan for a phase | `<phase-number> [--skip-research] [--assumptions] [--gaps] [--model <model>] [--auto] [--through <N>] [--prd <file>]` |
| `/pbr:plan-phase` | Create detailed execution plan (PLAN.md) with verification | `[phase] [--research] [--skip-research] [--gaps] [--skip-verify]` |
| `/pbr:build` | Execute all plans in a phase | `<phase-number> [--gaps-only] [--team] [--model <model>] [--auto]` |
| `/pbr:execute-phase` | Execute all plans with wave-based parallelization | `<phase-number> [--gaps-only]` |
| `/pbr:review` | Verify the build matched the plan | `<phase-number> [--auto-fix] [--teams] [--model <model>] [--auto]` |
| `/pbr:verify-work` | Validate built features through conversational UAT | `[phase number]` |
| `/pbr:continue` | Execute the next logical step automatically | `[--auto]` |
| `/pbr:autonomous` | Run multiple phases hands-free | `[--from <N>] [--through <N>] [--speculative-depth <N>] [--dry-run]` |

## Planning

| Command | Description | Arguments |
|---------|-------------|-----------|
| `/pbr:quick` | Execute an ad-hoc task with atomic commits | |
| `/pbr:fast` | Execute a trivial task inline (no subagent) | `<task description>` |
| `/pbr:do` | Route freeform text to the right skill | `<freeform description>` |
| `/pbr:import` | Import external plans or PRDs | `<phase-number> [--from <filepath>] [--skip-checker] \| --prd <filepath>` |
| `/pbr:explore` | Explore ideas and route insights | `[topic]` |
| `/pbr:research-phase` | Research phase implementation (standalone) | `[phase]` |
| `/pbr:list-phase-assumptions` | Surface assumptions about a phase | `<phase-number>` |

## Phase Management

| Command | Description | Arguments |
|---------|-------------|-----------|
| `/pbr:add-phase` | Add phase to end of current milestone | `<description>` |
| `/pbr:insert-phase` | Insert urgent work as decimal phase | `<after> <description>` |
| `/pbr:remove-phase` | Remove a future phase and renumber | `<phase-number>` |
| `/pbr:validate-phase` | Post-build quality gate with test gap analysis | `<phase-number> [--auto]` |

## Quality Assurance

| Command | Description | Arguments |
|---------|-------------|-----------|
| `/pbr:health` | Check planning directory integrity | `[--repair]` |
| `/pbr:scan` | Analyze existing codebase structure | |
| `/pbr:map-codebase` | Parallel codebase mapping agents | `[specific area]` |
| `/pbr:forensics` | Post-mortem investigation for failures | `[description]` |
| `/pbr:audit` | Review sessions for workflow compliance | `[--from DATE] [--to DATE] [--today] [--mode compliance\|ux\|full]` |
| `/pbr:audit-fix` | Audit + auto-fix findings | `[--max N] [--severity high\|medium\|all] [--dry-run]` |
| `/pbr:test` | Generate tests for completed phase code | `<phase-number>` |

## Context & Session

| Command | Description | Arguments |
|---------|-------------|-----------|
| `/pbr:status` | Show project status and suggest next action | |
| `/pbr:statusline` | Install/configure PBR status line | `[install \| uninstall \| preview]` |
| `/pbr:progress` | Check progress and route to next action | `[--next]` |
| `/pbr:pause` | Save session state for later | |
| `/pbr:pause-work` | Create context handoff mid-phase | |
| `/pbr:resume` | Restore context and suggest next action | |
| `/pbr:resume-work` | Resume from previous session | |
| `/pbr:profile` | Switch model profile | `[quality\|balanced\|budget\|adaptive\|<custom>]` |
| `/pbr:set-profile` | Switch model profile (alias) | `<profile>` |
| `/pbr:profile-user` | Generate developer behavioral profile | |
| `/pbr:session-report` | Post-session summary with outcomes | `[--since <time>] [--save]` |

## Utility

| Command | Description | Arguments |
|---------|-------------|-----------|
| `/pbr:debug` | Systematic hypothesis-based debugging | `[issue description]` |
| `/pbr:todo` | File-based persistent todos | `add <desc> \| list [theme] \| done <NNN> \| work <NNN>` |
| `/pbr:add-todo` | Capture idea as todo from context | `[description]` |
| `/pbr:check-todos` | List pending todos and select one | `[area filter]` |
| `/pbr:note` | Zero-friction idea capture | `<text> \| list \| promote <index> [--global]` |
| `/pbr:seed` | Plant forward-looking ideas | `<idea description>` |
| `/pbr:plant-seed` | Plant seed (alias) | `<idea description>` |
| `/pbr:backlog` | Manage backlog items | `add <desc> \| review \| promote <N>` |
| `/pbr:thread` | Persistent cross-session threads | `[name \| list \| resume <name>]` |
| `/pbr:undo` | Revert PBR-generated commits | `[--last N] [--phase NN] [--plan NN-MM] [--range HASH..HASH]` |
| `/pbr:stats` | Display project statistics | `[--json]` |
| `/pbr:milestone-summary` | Generate milestone onboarding summary | `[version]` |

## Infrastructure

| Command | Description | Arguments |
|---------|-------------|-----------|
| `/pbr:config` | Configure PBR settings | |
| `/pbr:settings` | Configure workflow toggles and profiles | |
| `/pbr:setup` | Reconfigure existing PBR project | |
| `/pbr:dashboard` | Launch web dashboard | `[--port N]` |
| `/pbr:ship` | Create rich PR from planning artifacts | `[--base <branch>] [--draft]` |
| `/pbr:release` | Generate changelog and release notes | `[version] [--draft\|--update\|--clean]` |
| `/pbr:help` | Command reference and workflow guide | |
| `/pbr:intel` | Refresh or query codebase intelligence | `[query <term>\|refresh\|status\|diff]` |
| `/pbr:update` | Update PBR to latest version | |
| `/pbr:reapply-patches` | Reapply local mods after update | |
| `/pbr:join-discord` | Join PBR Discord community | |

## Milestone Management

| Command | Description | Arguments |
|---------|-------------|-----------|
| `/pbr:milestone` | Manage milestones | `new\|complete\|audit\|gaps [version]` |
| `/pbr:new-milestone` | Start new milestone cycle | `[milestone name]` |
| `/pbr:complete-milestone` | Archive completed milestone | `<version>` |
| `/pbr:audit-milestone` | Audit milestone against original intent | `[version]` |
| `/pbr:plan-milestone-gaps` | Create phases for audit gaps | |

## UI

| Command | Description | Arguments |
|---------|-------------|-----------|
| `/pbr:ui-phase` | Generate UI-SPEC.md design contracts | `<phase-number> [--url <dev-server-url>]` |
| `/pbr:ui-review` | Visual audit of UI implementation | `<phase-number> [--url <dev-server-url>]` |
