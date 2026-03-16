<p align="center">
  <img src="./docs/assets/pbr_banner_logo.png" alt="Plan-Build-Run Logo" width="550" />
</p>

<p align="center">
  <strong>Context-engineered development workflow for Claude Code, Cursor, GitHub Copilot CLI, OpenAI Codex, and OpenCode.</strong>
  <br />
  Build ambitious multi-phase software without quality degradation.
  <br />
  Works with any Claude Code plan. Shines on Max.
</p>

<p align="center">
  <a href="https://github.com/SienkLogic/plan-build-run/actions"><img src="https://img.shields.io/github/actions/workflow/status/SienkLogic/plan-build-run/test.yml?branch=main&style=for-the-badge&logo=github&label=CI" alt="CI Status" /></a>
  <a href="#install"><img src="https://img.shields.io/badge/Claude_Code-Plugin-7C3AED?style=for-the-badge&logo=anthropic&logoColor=white" alt="Claude Code Plugin" /></a>
  <a href="https://github.com/SienkLogic/plan-build-run/wiki/Cursor-IDE"><img src="https://img.shields.io/badge/Cursor-Plugin-00A67E?style=for-the-badge&logo=cursor&logoColor=white" alt="Cursor Plugin" /></a>
  <a href="https://github.com/SienkLogic/plan-build-run/wiki/Copilot-CLI"><img src="https://img.shields.io/badge/Copilot_CLI-Plugin-1F6FEB?style=for-the-badge&logo=github&logoColor=white" alt="Copilot CLI Plugin" /></a>
  <br />
  <a href="https://www.npmjs.com/package/@sienklogic/plan-build-run"><img src="https://img.shields.io/npm/v/@sienklogic/plan-build-run?style=for-the-badge&logo=npm&logoColor=white&color=CB3837" alt="npm version" /></a>
  <img src="https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js 18+" />
  <a href="https://github.com/SienkLogic/plan-build-run"><img src="https://img.shields.io/github/stars/SienkLogic/plan-build-run?style=for-the-badge&logo=github&color=181717" alt="GitHub stars" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/SienkLogic/plan-build-run?style=for-the-badge" alt="License" /></a>
</p>

<p align="center">
  <a href="#the-problem">The Problem</a> &bull;
  <a href="#getting-started">Getting Started</a> &bull;
  <a href="#how-it-works">How It Works</a> &bull;
  <a href="#commands">Commands</a> &bull;
  <a href="#why-it-works">Why It Works</a> &bull;
  <a href="#deep-dive">Deep Dive</a> &bull;
  <a href="docs/USER-GUIDE.md">User Guide</a>
</p>

---

## The Problem

Claude Code is remarkably capable...until your context window fills up. As tokens accumulate during a long session, reasoning quality degrades, hallucinations increase, and the model starts losing track of earlier decisions. This is **context rot**, and it's the primary failure mode when building anything beyond a single-session project.

**Plan-Build-Run solves this.** It keeps your main orchestrator under ~15% context usage by delegating heavy work to fresh subagent contexts, each getting a clean 200k token window. All state lives on disk. Sessions are killable at any second without data loss. Whether you're on a free tier or Max 5x, wasted context means wasted budget, and context rot is the biggest source of waste.

<p align="center">
  <img src="./docs/assets/pbr-demo.gif" alt="Plan-Build-Run workflow demo" width="800" />
</p>

Other spec-driven development tools exist, but they tend to either introduce unnecessary ceremony (sprint ceremonies, story points, stakeholder syncs) or lack real understanding of what you're building. PBR takes a different approach: the complexity is in the system, not in your workflow. Behind the scenes: context engineering, XML prompt formatting, subagent orchestration, state management. What you see: a few commands that just work.

> **When to use Plan-Build-Run:** Multi-phase projects where quality matters. New features spanning 5+ files, large refactors, greenfield builds, anything that would take more than one Claude Code session to complete. Use `depth: quick` or `depth: standard` to control agent spawn count per phase.
>
> **When to skip it:** Single-file fixes, quick questions, one-off scripts. Use `/pbr:quick` for atomic commits without full workflow overhead: single executor spawn, no research or verification agents.

Works on every Claude Code plan. Use `depth: quick` on Free/Pro, `depth: standard` on Max, `depth: comprehensive` on Max 5x.

---

## Getting Started

### Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed &nbsp;(`claude --version`)
- Node.js 18+

### Install

**Claude Code Plugin (recommended):**

```bash
claude plugin marketplace add SienkLogic/plan-build-run
claude plugin install pbr@plan-build-run
```

All `/pbr:*` commands are now available globally.

<details>
<summary><strong>Install scopes</strong></summary>

| Scope | Command | Effect |
|-------|---------|--------|
| **Global** (default) | `claude plugin install pbr@plan-build-run` | Available in all projects |
| **Project only** | `claude plugin install pbr@plan-build-run --scope local` | This project only, gitignored |
| **Team project** | `claude plugin install pbr@plan-build-run --scope project` | Shared via git, teammates get prompted |

</details>

**npx (alternative):**

```bash
npx @sienklogic/plan-build-run@latest
```

The installer prompts you to choose:
1. **Runtime** -- Claude Code, OpenCode, Gemini, Codex, or all
2. **Location** -- Global (all projects) or local (current project only)

<details>
<summary><strong>Non-interactive Install (Docker, CI, Scripts)</strong></summary>

```bash
# Claude Code
npx @sienklogic/plan-build-run --claude --global   # Install to ~/.claude/
npx @sienklogic/plan-build-run --claude --local    # Install to ./.claude/

# OpenCode (open source, free models)
npx @sienklogic/plan-build-run --opencode --global # Install to ~/.config/opencode/

# Gemini CLI
npx @sienklogic/plan-build-run --gemini --global   # Install to ~/.gemini/

# Codex (skills-first)
npx @sienklogic/plan-build-run --codex --global    # Install to ~/.codex/
npx @sienklogic/plan-build-run --codex --local     # Install to ./.codex/

# All runtimes
npx @sienklogic/plan-build-run --all --global      # Install to all directories
```

Use `--global` (`-g`) or `--local` (`-l`) to skip the location prompt.
Use `--claude`, `--opencode`, `--gemini`, `--codex`, or `--all` to skip the runtime prompt.

</details>

<details>
<summary><strong>Install for Cursor IDE</strong></summary>

Plan-Build-Run also works in Cursor. The setup script symlinks rules and agents into your project's `.cursor/` directory.

**macOS / Linux:**
```bash
cd /path/to/your/project
bash /path/to/plan-build-run/plugins/cursor-pbr/setup.sh
```

**Windows (PowerShell):**
```powershell
cd C:\path\to\your\project
powershell -ExecutionPolicy Bypass -File C:\path\to\plan-build-run\plugins\cursor-pbr\setup.ps1
```

Both plugins share the same `.planning/` directory -- start a project in Claude Code, continue in Cursor, or vice versa. See [`plugins/cursor-pbr/README.md`](plugins/cursor-pbr/README.md) for full details.

</details>

<details>
<summary><strong>Install for GitHub Copilot CLI</strong></summary>

Plan-Build-Run also works in GitHub Copilot CLI. The setup script installs PBR as a Copilot CLI plugin and symlinks agents into your project.

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

All plugins share the same `.planning/` directory -- start in any tool, continue in another. See [`plugins/copilot-pbr/README.md`](plugins/copilot-pbr/README.md) for full details.

</details>

<details>
<summary><strong>Install for OpenAI Codex CLI</strong></summary>

Plan-Build-Run also works in OpenAI Codex CLI. Skills and agents are available via the `plugins/codex-pbr/` plugin. No hooks (Codex CLI does not support lifecycle hooks).

**macOS / Linux:**
```bash
cd /path/to/your/project
bash /path/to/plan-build-run/plugins/codex-pbr/setup.sh
```

**Windows (PowerShell):**
```powershell
cd C:\path\to\your\project
powershell -ExecutionPolicy Bypass -File C:\path\to\plan-build-run\plugins\codex-pbr\setup.ps1
```

See [`plugins/codex-pbr/README.md`](plugins/codex-pbr/README.md) for full details.

</details>

<details>
<summary><strong>Development Installation</strong></summary>

Clone the repository and run the installer locally:

```bash
git clone https://github.com/SienkLogic/plan-build-run.git
cd plan-build-run
node bin/install.js --claude --local
```

Installs to `./.claude/` for testing modifications before contributing.

Or load as a local plugin for development:
```bash
claude --plugin-dir .
```

</details>

Verify with:
- Claude Code / Gemini: `/pbr:help`
- OpenCode: `/pbr-help`
- Codex: `$pbr-help`

### Quick Start (Max / Max 5x)

Full pipeline with parallel research and multi-agent builds. Best experience.

```bash
cd your-project && claude
```
```
/pbr:new-project          # PBR asks about your project, researches the domain,
                          # scopes requirements, and generates a phased roadmap

/pbr:plan-phase 1         # Research + plan the first phase
/pbr:execute-phase 1      # Build it with parallel agents, atomic commits
/pbr:verify-work 1        # Confirm the codebase matches requirements
/pbr:plan-phase 2         # Repeat for next phase
```

That's the whole cycle. Everything lands in a `.planning/` directory. Kill your terminal anytime, `/pbr:resume-work` picks up where you left off.

### Quick Start (Pro / Free)

Lighter workflow that still gives you structured state tracking and clean commits.

```bash
cd your-project && claude
```
```
/pbr:new-project                   # Lightweight init
/pbr:plan-phase 1 --skip-research  # Plan without spawning a research agent
/pbr:execute-phase 1               # Build it
/pbr:quick                         # For one-off tasks: single agent, atomic commit
```

Set `depth: quick` in `/pbr:settings` to reduce agent spawns across all workflows.

### Quick Reference

| What you want | Command |
|---------------|---------|
| Start a new project | `/pbr:new-project` |
| Map existing codebase | `/pbr:map-codebase` |
| Shape implementation decisions | `/pbr:discuss-phase 1` |
| Plan a phase | `/pbr:plan-phase 1` |
| Build a phase | `/pbr:execute-phase 1` |
| Verify a phase | `/pbr:verify-work 1` |
| Do something quick | `/pbr:quick` |
| See where you are | `/pbr:progress` |
| Resume after restart | `/pbr:resume-work` |
| Auto-advance | `/pbr:continue` |
| Change settings | `/pbr:settings` |

### Recommended: Skip Permissions Mode

PBR is designed for frictionless automation. Run Claude Code with:

```bash
claude --dangerously-skip-permissions
```

> [!TIP]
> This is how PBR is intended to be used -- stopping to approve `date` and `git commit` 50 times defeats the purpose.

<details>
<summary><strong>Alternative: Granular Permissions</strong></summary>

If you prefer not to use that flag, add this to your project's `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(date:*)",
      "Bash(echo:*)",
      "Bash(cat:*)",
      "Bash(ls:*)",
      "Bash(mkdir:*)",
      "Bash(wc:*)",
      "Bash(head:*)",
      "Bash(tail:*)",
      "Bash(sort:*)",
      "Bash(grep:*)",
      "Bash(tr:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git status:*)",
      "Bash(git log:*)",
      "Bash(git diff:*)",
      "Bash(git tag:*)"
    ]
  }
}
```

</details>

---

## How It Works

Plan-Build-Run is a **thin orchestrator** that delegates heavy work to fresh subagent contexts via `Task()`. Data flows through files on disk, not through messages.

```
Main Session (~15% context)
  |
  +-- Task(researcher)  -->  writes .planning/research/
  +-- Task(planner)     -->  writes PLAN.md files
  +-- Task(executor)    -->  builds code, creates commits
  +-- Task(executor)    -->  (parallel, same wave)
  +-- Task(verifier)    -->  checks codebase against must-haves
```

> **Already have code?** Run `/pbr:map-codebase` first. It spawns parallel agents to analyze your stack, architecture, conventions, and concerns. Then `/pbr:new-project` knows your codebase -- questions focus on what you're adding, and planning automatically loads your patterns.

### 1. Initialize Project

```
/pbr:new-project
```

One command, one flow. The system:

1. **Questions** -- Asks until it understands your idea completely (goals, constraints, tech preferences, edge cases)
2. **Research** -- Spawns parallel agents to investigate the domain (optional but recommended)
3. **Requirements** -- Extracts what's v1, v2, and out of scope
4. **Roadmap** -- Creates phases mapped to requirements

You approve the roadmap. Now you're ready to build.

**Creates:** `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `.planning/research/`

---

### 2. Discuss Phase

```
/pbr:discuss-phase 1
```

**This is where you shape the implementation.**

Your roadmap has a sentence or two per phase. That's not enough context to build something the way *you* imagine it. This step captures your preferences before anything gets researched or planned.

The system analyzes the phase and identifies gray areas based on what's being built:

- **Visual features** -- Layout, density, interactions, empty states
- **APIs/CLIs** -- Response format, flags, error handling, verbosity
- **Content systems** -- Structure, tone, depth, flow
- **Organization tasks** -- Grouping criteria, naming, duplicates, exceptions

The deeper you go here, the more the system builds what you actually want. Skip it and you get reasonable defaults. Use it and you get *your* vision.

**Creates:** `{phase_num}-CONTEXT.md`

---

### 3. Plan Phase

```
/pbr:plan-phase 1
```

The system:

1. **Researches** -- Investigates how to implement this phase, guided by your CONTEXT.md decisions
2. **Plans** -- Creates 2-3 atomic task plans with XML structure
3. **Verifies** -- Checks plans against requirements, loops until they pass

Each plan is small enough to execute in a fresh context window. No degradation, no "I'll be more concise now."

**Creates:** `{phase_num}-RESEARCH.md`, `{phase_num}-{N}-PLAN.md`

---

### 4. Execute Phase

```
/pbr:execute-phase 1
```

The system:

1. **Runs plans in waves** -- Parallel where possible, sequential when dependent
2. **Fresh context per plan** -- 200k tokens purely for implementation, zero accumulated garbage
3. **Commits per task** -- Every task gets its own atomic commit
4. **Verifies against goals** -- Checks the codebase delivers what the phase promised

Walk away, come back to completed work with clean git history.

**How Wave Execution Works:**

Plans are grouped into "waves" based on dependencies. Within each wave, plans run in parallel. Waves run sequentially.

```
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE EXECUTION                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  WAVE 1 (parallel)          WAVE 2 (parallel)          WAVE 3       │
│  ┌─────────┐ ┌─────────┐    ┌─────────┐ ┌─────────┐    ┌─────────┐ │
│  │ Plan 01 │ │ Plan 02 │ →  │ Plan 03 │ │ Plan 04 │ →  │ Plan 05 │ │
│  │         │ │         │    │         │ │         │    │         │ │
│  │ User    │ │ Product │    │ Orders  │ │ Cart    │    │ Checkout│ │
│  │ Model   │ │ Model   │    │ API     │ │ API     │    │ UI      │ │
│  └─────────┘ └─────────┘    └─────────┘ └─────────┘    └─────────┘ │
│       │           │              ↑           ↑              ↑       │
│       └───────────┴──────────────┴───────────┘              │       │
│              Dependencies: Plan 03 needs Plan 01            │       │
│                          Plan 04 needs Plan 02              │       │
│                          Plan 05 needs Plans 03 + 04        │       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Why waves matter:**
- Independent plans → Same wave → Run in parallel
- Dependent plans → Later wave → Wait for dependencies
- File conflicts → Sequential plans or same plan

This is why "vertical slices" (Plan 01: User feature end-to-end) parallelize better than "horizontal layers" (Plan 01: All models, Plan 02: All APIs).

**Creates:** `{phase_num}-{N}-SUMMARY.md`, `{phase_num}-VERIFICATION.md`

---

### 5. Verify Work

```
/pbr:verify-work 1
```

**This is where you confirm it actually works.**

Automated verification checks that code exists and tests pass. But does the feature *work* the way you expected? This is your chance to use it.

The system:

1. **Extracts testable deliverables** -- What you should be able to do now
2. **Walks you through one at a time** -- "Can you log in with email?" Yes/no, or describe what's wrong
3. **Diagnoses failures automatically** -- Spawns debug agents to find root causes
4. **Creates verified fix plans** -- Ready for immediate re-execution

If everything passes, you move on. If something's broken, you don't manually debug -- you just run `/pbr:execute-phase` again with the fix plans it created.

**Creates:** `{phase_num}-UAT.md`, fix plans if issues found

---

### 6. Repeat → Complete → Next Milestone

```
/pbr:discuss-phase 2
/pbr:plan-phase 2
/pbr:execute-phase 2
/pbr:verify-work 2
...
/pbr:complete-milestone
/pbr:new-milestone
```

Loop **discuss → plan → execute → verify** until milestone complete.

Each phase gets your input (discuss), proper research (plan), clean execution (execute), and human verification (verify). Context stays fresh. Quality stays high.

When all phases are done, `/pbr:complete-milestone` archives the milestone and tags the release. Then `/pbr:new-milestone` starts the next version -- same flow as `new-project` but for your existing codebase.

---

### Quick Mode

```
/pbr:quick
```

**For ad-hoc tasks that don't need full planning.**

Quick mode gives you PBR guarantees (atomic commits, state tracking) with a faster path:

- **Same agents** -- Planner + executor, same quality
- **Skips optional steps** -- No research, no plan checker, no verifier
- **Separate tracking** -- Lives in `.planning/quick/`, not phases

Use for: bug fixes, small features, config changes, one-off tasks.

```
/pbr:quick
> What do you want to do? "Add dark mode toggle to settings"
```

**Creates:** `.planning/quick/001-add-dark-mode-toggle/PLAN.md`, `SUMMARY.md`

---

## Commands

### Core Workflow

| Command | What it does | Agents |
|---------|--------------|--------|
| `/pbr:new-project [--auto]` | Full initialization: questions → research → requirements → roadmap | 4-6 (quick: 2-3) |
| `/pbr:discuss-phase [N] [--auto]` | Capture implementation decisions before planning | 0 |
| `/pbr:plan-phase [N] [--auto]` | Research + plan + verify for a phase | 2-3 (quick: 1-2) |
| `/pbr:execute-phase <N>` | Execute all plans in parallel waves, verify when complete | 2-4 (quick: 1-2) |
| `/pbr:verify-work [N]` | Manual user acceptance testing | 1 |
| `/pbr:audit-milestone` | Verify milestone achieved its definition of done | 1 |
| `/pbr:complete-milestone` | Archive milestone, tag release | 0 |
| `/pbr:new-milestone [name]` | Start next version: questions → research → requirements → roadmap | 4-6 |

See the **[User Guide](docs/USER-GUIDE.md)** for all commands with flags, cost-by-depth tables, and detailed descriptions.

### Navigation

| Command | What it does |
|---------|--------------|
| `/pbr:progress` | Where am I? What's next? |
| `/pbr:help` | Show all commands and usage guide |
| `/pbr:update` | Update PBR with changelog preview |
| `/pbr:continue` | Auto-advance to the next logical step |

### Brownfield

| Command | What it does |
|---------|--------------|
| `/pbr:map-codebase` | Analyze existing codebase before new-project |

### Phase Management

| Command | What it does |
|---------|--------------|
| `/pbr:add-phase` | Append phase to roadmap |
| `/pbr:insert-phase [N]` | Insert urgent work between phases |
| `/pbr:remove-phase [N]` | Remove future phase, renumber |
| `/pbr:list-phase-assumptions [N]` | See Claude's intended approach before planning |
| `/pbr:plan-milestone-gaps` | Create phases to close gaps from audit |

### Session

| Command | What it does |
|---------|--------------|
| `/pbr:pause-work` | Create handoff when stopping mid-phase |
| `/pbr:resume-work` | Restore from last session |

### Utilities

| Command | What it does |
|---------|--------------|
| `/pbr:settings` | Configure model profile and workflow agents |
| `/pbr:set-profile <profile>` | Switch model profile (quality/balanced/budget) |
| `/pbr:add-todo [desc]` | Capture idea for later |
| `/pbr:check-todos` | List pending todos |
| `/pbr:note [text]` | Quick idea capture with optional promotion to todo |
| `/pbr:debug [desc]` | Systematic debugging with persistent state |
| `/pbr:quick [--full] [--discuss]` | Ad-hoc task with PBR guarantees (`--full` adds plan-checking and verification, `--discuss` gathers context first) |
| `/pbr:health [--repair]` | Validate `.planning/` directory integrity, auto-repair with `--repair` |
| `/pbr:audit [--today]` | Review past sessions for workflow compliance and UX quality |
| `/pbr:dashboard` | Launch web dashboard for browsing `.planning/` state |
| `/pbr:statusline` | Install terminal status line showing phase, agent, context budget |
| `/pbr:explore [topic]` | Think through approaches and route insights to artifacts |

---

## Configuration

PBR stores project settings in `.planning/config.json`. Configure during `/pbr:new-project` or update later with `/pbr:settings`. For the full config schema, workflow toggles, git branching options, and per-agent model breakdown, see the [User Guide](docs/USER-GUIDE.md#configuration-reference).

### Core Settings

| Setting | Options | Default | What it controls |
|---------|---------|---------|------------------|
| `mode` | `autonomous`, `interactive` | `interactive` | Auto-approve vs confirm at each step |
| `depth` | `quick`, `standard`, `comprehensive` | `standard` | Planning depth -- research scope and phase granularity |

### Model Profiles

Control which Claude model each agent uses. Balance quality vs token spend.

| Profile | Planning | Execution | Verification |
|---------|----------|-----------|--------------|
| `quality` | Opus | Opus | Sonnet |
| `balanced` (default) | Opus | Sonnet | Sonnet |
| `budget` | Sonnet | Sonnet | Haiku |

Switch profiles:
```
/pbr:set-profile budget
```

### Workflow Agents

These spawn additional agents during planning/execution. They improve quality but add tokens and time.

| Setting | Default | What it does |
|---------|---------|--------------|
| `workflow.research` | `true` | Researches domain before planning each phase |
| `workflow.plan_check` | `true` | Verifies plans achieve phase goals before execution |
| `workflow.verifier` | `true` | Confirms must-haves were delivered after execution |
| `workflow.auto_advance` | `false` | Auto-chain discuss → plan → execute without stopping |

Override per-invocation:
- `/pbr:plan-phase --skip-research`
- `/pbr:plan-phase --skip-verify`

### Git Branching

| Setting | Options | Default | What it does |
|---------|---------|---------|--------------|
| `git.branching_strategy` | `none`, `phase`, `milestone` | `none` | Branch creation strategy |
| `git.phase_branch_template` | string | `pbr/phase-{phase}-{slug}` | Template for phase branches |
| `git.milestone_branch_template` | string | `pbr/{milestone}-{slug}` | Template for milestone branches |

**Strategies:**
- **`none`** -- Commits to current branch (default)
- **`phase`** -- Creates a branch per phase, merges at phase completion
- **`milestone`** -- Creates one branch for entire milestone, merges at completion

---

## Why It Works

### Context Engineering

Claude Code is incredibly powerful *if* you give it the context it needs. Most people don't. PBR handles it for you:

| File | What it does |
|------|--------------|
| `PROJECT.md` | Project vision, always loaded |
| `research/` | Ecosystem knowledge (stack, features, architecture, pitfalls) |
| `REQUIREMENTS.md` | Scoped v1/v2 requirements with phase traceability |
| `ROADMAP.md` | Where you're going, what's done |
| `STATE.md` | Decisions, blockers, position -- memory across sessions |
| `PLAN.md` | Atomic task with XML structure, verification steps |
| `SUMMARY.md` | What happened, what changed, committed to history |
| `todos/` | Captured ideas and tasks for later work |

### XML Prompt Formatting

Every plan is structured XML optimized for Claude:

```xml
<task type="auto">
  <name>Create login endpoint</name>
  <files>src/app/api/auth/login/route.ts</files>
  <action>
    Use jose for JWT (not jsonwebtoken - CommonJS issues).
    Validate credentials against users table.
    Return httpOnly cookie on success.
  </action>
  <verify>curl -X POST localhost:3000/api/auth/login returns 200 + Set-Cookie</verify>
  <done>Valid credentials return cookie, invalid return 401</done>
</task>
```

Precise instructions. No guessing. Verification built in.

### Multi-Agent Orchestration

Every stage uses the same pattern: a thin orchestrator spawns specialized agents, collects results, and routes to the next step.

| Stage | Orchestrator does | Agents do |
|-------|------------------|-----------|
| Research | Coordinates, presents findings | 4 parallel researchers investigate stack, features, architecture, pitfalls |
| Planning | Validates, manages iteration | Planner creates plans, checker verifies, loop until pass |
| Execution | Groups into waves, tracks progress | Executors implement in parallel, each with fresh 200k context |
| Verification | Presents results, routes next | Verifier checks codebase against goals, debuggers diagnose failures |

The orchestrator never does heavy lifting. It spawns agents, waits, integrates results.

**The result:** You can run an entire phase -- deep research, multiple plans created and verified, thousands of lines of code written across parallel executors, automated verification against goals -- and your main context window stays at 30-40%. The work happens in fresh subagent contexts. Your session stays fast and responsive.

### Atomic Git Commits

Each task gets its own commit immediately after completion:

```bash
abc123f docs(08-02): complete user registration plan
def456g feat(08-02): add email confirmation flow
hij789k feat(08-02): implement password hashing
lmn012o feat(08-02): create registration endpoint
```

> [!NOTE]
> **Benefits:** Git bisect finds exact failing task. Each task independently revertable. Clear history for Claude in future sessions. Better observability in AI-automated workflow.

### Modular by Design

- Add phases to current milestone
- Insert urgent work between phases
- Complete milestones and start fresh
- Adjust plans without rebuilding everything

You're never locked in. The system adapts.

---

## Platform Compatibility

Plan-Build-Run works across multiple platforms with varying levels of hook support. Hooks power commit format enforcement, context budget tracking, workflow gates, and local LLM offloading.

| Feature | Claude Code | Copilot CLI | Cursor IDE | Codex CLI |
|---------|:-----------:|:-----------:|:----------:|:---------:|
| Skills (slash commands) | All 29 | All 29 | All 29 | All 29 |
| Agents (subagent delegation) | All 14 | All 14 | All 14 | All 14 |
| `.planning/` state management | Full | Full | Full | Full |
| **Hook support** | **Full (14 events)** | **Partial (4 events)** | **Unverified** | **None** |
| Commit format enforcement | Hook-enforced | Hook-enforced | Manual | Manual |
| Context budget tracking | Automatic (hook) | Not available | Not available | Not available |
| Auto-continue between skills | Automatic (hook) | Not available | Not available | Not available |
| Subagent lifecycle logging | Automatic (hook) | Not available | Not available | Not available |

**Key differences:**
- **Claude Code** has full hook support -- all operations fire automatically on every tool call
- **Copilot CLI** supports `sessionStart`, `preToolUse`, `postToolUse`, and `sessionEnd` -- covers most validation but misses lifecycle events
- **Cursor IDE** hook support is unverified -- hooks.json is configured but may not fire
- **Codex CLI** does not support hooks -- skills and agents only

All platforms share the same `.planning/` directory -- start a project in Claude Code, continue in Cursor, or vice versa.

---

## Dashboard

PBR includes a web dashboard for browsing `.planning/` state visually:

```
/pbr:dashboard
```

The dashboard (Vite + React 18 + Express) provides:
- Phase progress and roadmap overview
- State visualization with live WebSocket updates
- Todo and note management
- Configuration editor

Default port: 3141.

<details>
<summary><strong>Dashboard setup</strong></summary>

```bash
# One-time install of dashboard dependencies
npm run dashboard:install

# Launch the dashboard (defaults to current directory)
npm run dashboard

# Or specify a project directory and port
npm run dashboard -- --dir /path/to/your/project --port 3141
```

Or launch directly from a session: `/pbr:dashboard`

</details>

---

## Status Line

PBR can display a status line in your Claude Code terminal showing:
- Current phase and plan progress
- Active agent name (when a Task() is running)
- Git branch status
- Context budget with tier warnings (DEGRADING/POOR/CRITICAL)
- Model, cost, and duration

Install with `/pbr:statusline`. Configurable sections via `.planning/config.json`.

---

## Agent System

PBR uses 14 specialized agents, each with a dedicated role and color-coded terminal display:

| Agent | Color | Role |
|-------|-------|------|
| Planner | Green | Creates execution plans |
| Executor | Yellow | Implements plan tasks |
| Verifier | Green | Validates deliverables |
| Researcher | Cyan | Investigates domain context |
| Synthesizer | Purple | Combines research findings |
| Debugger | Orange | Systematic issue diagnosis |
| Plan Checker | Green | Validates plan quality |
| Integration Checker | Blue | Cross-phase verification |
| Codebase Mapper | Cyan | Analyzes existing code |
| Roadmapper | Purple | Creates phase roadmaps |
| Auditor | Purple | Reviews session quality |
| Nyquist Auditor | Green | Fills test coverage gaps |
| Dev Sync | Cyan | Syncs derivative plugins |
| General | Cyan | Ad-hoc tasks |

Agents run in fresh 200k-token context windows via `Task()`, keeping the orchestrator lean.

---

## Security

### Protecting Sensitive Files

PBR's codebase mapping and analysis commands read files to understand your project. **Protect files containing secrets** by adding them to Claude Code's deny list:

```json
{
  "permissions": {
    "deny": [
      "Read(.env)",
      "Read(.env.*)",
      "Read(**/secrets/*)",
      "Read(**/*credential*)",
      "Read(**/*.pem)",
      "Read(**/*.key)"
    ]
  }
}
```

> [!IMPORTANT]
> PBR includes built-in protections against committing secrets, but defense-in-depth is best practice. Deny read access to sensitive files as a first line of defense.

---

## Troubleshooting

**Commands not found after install?**
- Restart your runtime to reload commands/skills
- Plugin: verify with `claude plugin list`
- npx: verify files exist in `~/.claude/commands/pbr/` (global) or `./.claude/commands/pbr/` (local)

**Commands not working as expected?**
- Run `/pbr:help` to verify installation
- Plugin: `claude plugin install pbr@plan-build-run` to reinstall
- npx: `npx @sienklogic/plan-build-run@latest` to reinstall

**Using Docker or containerized environments?**

If file reads fail with tilde paths (`~/.claude/...`), set `CLAUDE_CONFIG_DIR` before installing:
```bash
CLAUDE_CONFIG_DIR=/home/youruser/.claude npx @sienklogic/plan-build-run --global
```

### Uninstalling

```bash
# Plugin uninstall
claude plugin uninstall pbr@plan-build-run

# npx uninstall (global)
npx @sienklogic/plan-build-run --claude --global --uninstall
npx @sienklogic/plan-build-run --opencode --global --uninstall
npx @sienklogic/plan-build-run --codex --global --uninstall

# npx uninstall (local)
npx @sienklogic/plan-build-run --claude --local --uninstall
npx @sienklogic/plan-build-run --opencode --local --uninstall
npx @sienklogic/plan-build-run --codex --local --uninstall
```

---

## Deep Dive

| Topic | Description |
|-------|-------------|
| **[User Guide](docs/USER-GUIDE.md)** | Full configuration reference, all command flags, cost-by-depth tables |
| **[Agents](https://github.com/SienkLogic/plan-build-run/wiki/Agents)** | 14 specialized agents with configurable model profiles and file-based communication |
| **[Configuration](https://github.com/SienkLogic/plan-build-run/wiki/Configuration)** | Config keys, depth/model profiles, feature toggles |
| **[Hooks](https://github.com/SienkLogic/plan-build-run/wiki/Hooks)** | 49 hook scripts that enforce discipline at zero token cost |
| **[Project Structure](https://github.com/SienkLogic/plan-build-run/wiki/Project-Structure)** | The `.planning/` directory layout, key files, and file ownership |
| **[Dashboard](https://github.com/SienkLogic/plan-build-run/wiki/Dashboard)** | Web UI with live updates for browsing project state |
| **[Cursor IDE](https://github.com/SienkLogic/plan-build-run/wiki/Cursor-IDE)** | Cursor plugin installation and cross-IDE workflow |
| **[Copilot CLI](https://github.com/SienkLogic/plan-build-run/wiki/Copilot-CLI)** | GitHub Copilot CLI plugin: installation, hooks, and differences |
| **[Philosophy](https://github.com/SienkLogic/plan-build-run/wiki/Philosophy)** | Design principles and platform alignment strategy |
| **[Contributing](.github/CONTRIBUTING.md)** | Development setup, testing, and contribution guidelines |

---

## Local Development

```bash
# Clone and install
git clone https://github.com/SienkLogic/plan-build-run.git
cd plan-build-run
npm install

# Run tests
npm test

# Lint
npm run lint

# Load locally for manual testing
claude --plugin-dir .
```

CI runs on Node 18/20/22 across Windows, macOS, and Linux. See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for guidelines.

---

## Stats

| Metric | Count |
|--------|-------|
| Skills (slash commands) | 29 |
| Specialized agents | 14 |
| Hook scripts | 49 |
| Commands | 41 |
| Supported platforms | 4 (Claude Code, Cursor, Copilot CLI, Codex) |
| Shared skill fragments | 12 |
| Templates | 10+ |
| References | 19 |

---

## License

[MIT](LICENSE)

---

<div align="center">

**Claude Code is powerful. PBR makes it reliable.**

</div>
