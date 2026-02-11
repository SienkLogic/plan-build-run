<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-Plugin-7C3AED?style=for-the-badge&logo=anthropic&logoColor=white" alt="Claude Code Plugin" />
  <img src="https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js 18+" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License" />
  <img src="https://img.shields.io/badge/Tests-540_passing-brightgreen?style=for-the-badge" alt="540 Tests" />
</p>

<h1 align="center">Towline</h1>

<p align="center">
  <strong>Context-engineered development workflow for Claude Code.</strong>
  <br />
  Build ambitious multi-phase software without quality degradation.
  <br />
  <br />
  <a href="#why-towline">Why Towline?</a> &bull;
  <a href="#getting-started">Getting Started</a> &bull;
  <a href="#commands">Commands</a> &bull;
  <a href="#how-it-works">How It Works</a> &bull;
  <a href="#configuration">Configuration</a> &bull;
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

## The Problem

Claude Code is remarkably capable — until your context window fills up. As tokens accumulate during a long session, reasoning quality degrades, hallucinations increase, and the model starts losing track of earlier decisions. This is **context rot**, and it's the primary failure mode when building anything beyond a single-session project.

**Towline solves this.** It keeps your main orchestrator under ~15% context usage by delegating heavy work to fresh subagent contexts, each getting a clean 200k token window. All state lives on disk. Sessions are killable at any second without data loss.

## Why Towline?

Most AI coding tools treat context as infinite — they index your codebase, track your edits, and hope the model keeps up. That works for single-file changes. It falls apart when you're building something that takes days, spans dozens of files, and requires decisions made on Monday to still hold on Friday.

Towline takes a different approach: **structured context isolation**. Instead of stuffing everything into one session, it delegates each operation to a fresh subagent with a clean 200k token window and coordinates through files on disk.

### What sets it apart

| Capability | IDE Assistants | Other Workflow Plugins | **Towline** |
|:-----------|:--------------:|:----------------------:|:-----------:|
| Solves context rot | Indexing / tracking | Conversation segmentation | Fresh 200k context per agent |
| Multi-phase projects | No structure | Phase-based | Phase + wave + milestone |
| Verification | Developer reviews diffs | Atomic commits | Dedicated verifier agent with 3-layer checks |
| Quality gates | Manual | Commit enforcement | 8 lifecycle hooks + configurable gates |
| State persistence | Lost on session end | File-based state | File-based state + crash-safe locking |
| Parallelism | Up to 8 agents (Cursor) | Sequential | Dependency-aware wave-based parallelism |
| Configurability | Opinionated | Limited toggles | 12 config keys, 16+ feature toggles |

<details>
<summary><strong>Key differentiators in detail</strong></summary>

**Goal-backward verification** — After a phase is built, a dedicated read-only verifier agent checks your actual codebase against declared must-haves. It doesn't ask "did the tasks complete?" — it asks "does the codebase now satisfy the requirements?" Three layers: existence (file exists), substance (not a stub), wiring (connected to the system).

**Lifecycle hooks** — Eight hook scripts fire on Claude Code events to enforce discipline automatically: commit format validation, plan structure checks, roadmap sync verification, context budget warnings before compaction, and auto-chaining between workflow steps. No other tool polices itself this way.

**Wave-based parallelism** — Plans declare dependencies. Plans with no conflicts run in parallel (same wave); dependent plans wait. This isn't "throw 8 agents at it" — it's structured, dependency-aware concurrent execution.

**Kill-safe state** — Every piece of project state lives in `.planning/` on disk. You can kill your terminal mid-build, reboot your machine, come back a week later, and `/dev:resume` picks up exactly where you left off. No session state to lose.

**Token-saving CLI** — A deterministic Node.js CLI handles mechanical operations (YAML parsing, state updates, must-have collection) so agents don't waste tokens on file parsing. Saves ~4,000-11,000 tokens per phase.

</details>

> **When to use Towline:** Multi-phase projects where quality matters — new features spanning 5+ files, large refactors, greenfield builds, anything that would take more than one Claude Code session to complete.
>
> **When to skip it:** Single-file fixes, quick questions, one-off scripts. Use `/dev:quick` if you still want atomic commits without the full workflow.

---

## Getting Started

### Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 1.0.33+ &nbsp;(`claude --version`)
- Node.js 18+

### Install

```bash
# From your terminal
claude plugin marketplace add SienkLogic/towline
claude plugin install dev@towline

# Or from inside a Claude Code session
/plugin marketplace add SienkLogic/towline
/plugin install dev@towline
```

All `/dev:*` commands are now available globally.

<details>
<summary><strong>Install scopes</strong></summary>

| Scope | Command | Effect |
|-------|---------|--------|
| **Global** (default) | `claude plugin install dev@towline` | Available in all projects |
| **Project only** | `claude plugin install dev@towline --scope local` | This project only, gitignored |
| **Team project** | `claude plugin install dev@towline --scope project` | Shared via git, teammates get prompted |

</details>

### Dashboard (Optional)

Towline ships with a companion web dashboard for browsing your project's planning state in a browser. To set it up:

```bash
# One-time install of dashboard dependencies
npm run dashboard:install

# Launch the dashboard for any project with a .planning/ directory
npm run dashboard -- --dir /path/to/your/project
# Opens at http://127.0.0.1:3000
```

Or run directly:

```bash
node dashboard/bin/cli.js --dir /path/to/your/project --port 3000
```

### Your First Project

```bash
cd your-project
claude
```

```
/dev:begin
```

Towline asks about your project, researches the domain, scopes requirements, and generates a phased roadmap. Everything lands in a `.planning/` directory.

From there, the cycle is:

```
/dev:plan 1       # Plan the first phase
/dev:build 1      # Build it (parallel agents)
/dev:review 1     # Verify it works
/dev:plan 2       # Next phase
...
```

### Quick Reference

| When you want to... | Run |
|---------------------|-----|
| Start a new project | `/dev:begin` |
| Plan a phase | `/dev:plan 1` |
| Build a phase | `/dev:build 1` |
| Verify a phase | `/dev:review 1` |
| Do something quick | `/dev:quick` |
| See where you are | `/dev:status` |
| Resume after restarting | `/dev:resume` |
| Auto-advance to next step | `/dev:continue` |
| Update settings | `/dev:config` |

---

## Philosophy

| Principle | What it means |
|-----------|---------------|
| **Context is Currency** | Main orchestrator stays under 15-20% usage. Heavy lifting happens in fresh subagent contexts via `Task()`. |
| **State > Memory** | If it isn't in `.planning/STATE.md`, it didn't happen. All project state lives on disk. |
| **Fan-Out / Fan-In** | Spawn parallel agents for throughput, aggregate results back. Three researchers beats one running three times. |
| **Trust but Verify** | A dedicated read-only verifier checks the actual codebase against requirements — not Claude's claims about it. |
| **Build Houses, Don't Swat Flies** | The structured workflow pays off for complex multi-phase work. For simple tasks, `/dev:quick` skips the ceremony. |

---

## Commands

### Core Workflow

| Command | Description | Agents |
|---------|-------------|--------|
| `/dev:begin` | Start a new project — questioning, research, requirements, roadmap | 4-6 |
| `/dev:plan <N>` | Plan a phase — research, plan creation, verification loop | 2-3 |
| `/dev:build <N>` | Build a phase — parallel execution in waves, atomic commits | 2-4 |
| `/dev:review <N>` | Verify a phase — automated 3-layer checks + conversational UAT | 1 |

### Planning & Discovery

| Command | Description |
|---------|-------------|
| `/dev:explore [topic]` | Explore ideas and think through approaches. No phase number needed. |
| `/dev:discuss <N>` | Talk through a phase before planning. Captures locked decisions. |
| `/dev:plan <N> --assumptions` | Surface Claude's assumptions before planning. Zero agent cost. |
| `/dev:plan <N> --skip-research` | Plan without the research step. Faster. |
| `/dev:plan <N> --gaps` | Create gap-closure plans from verification failures. |
| `/dev:plan add` | Append a new phase to the roadmap. |
| `/dev:plan insert <N>` | Insert a phase using decimal numbering (e.g., 3.1). |
| `/dev:plan remove <N>` | Remove a future phase and renumber. |

### Execution

| Command | Description |
|---------|-------------|
| `/dev:build <N> --gaps-only` | Execute only gap-closure plans. |
| `/dev:build <N> --team` | Use Agent Teams for inter-agent coordination. |
| `/dev:quick` | Quick ad-hoc task with atomic commit. Low cost. |
| `/dev:continue` | Execute the next logical step automatically. No prompts. |

### Verification & Debugging

| Command | Description |
|---------|-------------|
| `/dev:review <N> --auto-fix` | Auto-diagnose and create fix plans for verification failures. |
| `/dev:debug` | Systematic debugging with hypothesis testing and persistent state. |
| `/dev:scan` | Analyze an existing codebase (brownfield entry point). |

### Session & Project Management

| Command | Description |
|---------|-------------|
| `/dev:status` | Shows progress and suggests next action. |
| `/dev:health` | Check planning directory integrity. Find and fix corrupted state. |
| `/dev:pause` / `/dev:resume` | Save and restore session state across context resets. |
| `/dev:milestone new\|complete\|audit\|gaps` | Milestone lifecycle management. |
| `/dev:todo add\|list\|done` | Persistent file-based todos that survive across sessions. |
| `/dev:note` | Zero-friction idea capture. Append, list, or promote to todos. |
| `/dev:config` | Configure workflow settings interactively. |
| `/dev:import` | Import an external plan document into the Towline format. |
| `/dev:help` | Command reference and workflow guide. |

---

## How It Works

Towline is a **thin orchestrator** that delegates heavy work to fresh subagent contexts via `Task()`. Data flows through files on disk, not through messages.

```
Main Session (~15% context)
  │
  ├── Task(researcher)  ──▶  writes .planning/research/
  ├── Task(planner)     ──▶  writes PLAN.md files
  ├── Task(executor)    ──▶  builds code, creates commits
  ├── Task(executor)    ──▶  (parallel — same wave)
  └── Task(verifier)    ──▶  checks codebase against must-haves
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Context isolation** | Each subagent gets a fresh 200k context window. The orchestrator stays lean. |
| **Goal-backward verification** | The verifier checks codebase reality against must-have declarations, not task completion. |
| **Three-layer checks** | Every artifact is verified for existence, substantiveness (not a stub), and wiring (connected to the system). |
| **Atomic commits** | Each task produces one commit: `{type}({phase}-{plan}): description` |
| **Wave-based parallelism** | Plans in the same wave execute in parallel; waves execute sequentially. |
| **Persistent state** | All project state lives in `.planning/` and survives context resets, session kills, and crashes. |
| **Seeds** | `/dev:explore` can create seed files with trigger conditions that automatically inject into planning. |
| **CLI tooling** | Deterministic Node.js CLI offloads mechanical parsing from agents, saving ~4,000-11,000 tokens per phase. |

### Token-Saving CLI

Towline includes a built-in CLI (`towline-tools.js`) that agents call to avoid wasting tokens on mechanical file parsing:

```bash
# Read-only commands
towline-tools.js state load                        # Full project state as JSON
towline-tools.js frontmatter <filepath>            # Parse any .md YAML frontmatter
towline-tools.js must-haves <phase>                # Collect all must-haves from phase plans
towline-tools.js phase-info <phase>                # Comprehensive single-phase status
towline-tools.js plan-index <phase>                # Plan inventory grouped by wave

# Mutation commands (atomic, lockfile-protected)
towline-tools.js state update <field> <value>      # Update STATE.md fields
towline-tools.js roadmap update-status <N> <status> # Update ROADMAP.md status column
towline-tools.js roadmap update-plans <N> <done> <total> # Update ROADMAP.md plans column
```

---

## Agents

Towline ships with 10 specialized agents, each with a focused role and appropriate tool access:

| Agent | Role | Default Model |
|-------|------|---------------|
| **Researcher** | Domain research, implementation approaches, synthesis | Sonnet |
| **Planner** | Executable plans, roadmaps, wave assignment, must-have declarations | Inherit |
| **Plan Checker** | Pre-execution plan quality validation across 10 dimensions | Sonnet |
| **Executor** | Code implementation with atomic commits, TDD, self-verification | Inherit |
| **Verifier** | Goal-backward 3-layer verification (existence, substance, wiring) | Sonnet |
| **Integration Checker** | Cross-phase E2E flow and export/import verification | Sonnet |
| **Debugger** | Systematic hypothesis-based debugging with checkpoints | Inherit |
| **Codebase Mapper** | Brownfield codebase analysis (tech, arch, quality, concerns) | Sonnet |
| **Synthesizer** | Multi-source research synthesis and contradiction resolution | Haiku |
| **General** | Lightweight Towline-aware agent for ad-hoc tasks | Inherit |

---

## Project Structure

Towline creates a `.planning/` directory in your project:

```
.planning/
├── PROJECT.md              # Project vision and scope
├── REQUIREMENTS.md         # Scoped requirements with REQ-IDs
├── ROADMAP.md              # Phase structure with status tracking
├── STATE.md                # Current position (auto-updated)
├── config.json             # Workflow preferences (12 top-level keys)
├── CONTEXT.md              # Locked decisions and constraints
├── phases/
│   ├── 01-foundation/
│   │   ├── 01-01-PLAN.md       # Executable plan with must-haves
│   │   ├── SUMMARY-01-01.md    # Execution results
│   │   └── VERIFICATION.md     # 3-layer verification report
│   └── 02-auth/
│       ├── ...
├── research/               # Phase research outputs
├── seeds/                  # Future-phase idea triggers
└── todos/
    ├── pending/            # Active todo items
    └── done/               # Completed todos
```

---

## Dashboard

Towline includes a companion web dashboard (`dashboard/`) for browsing project state visually. See [Dashboard setup](#dashboard-optional) for installation.

| Feature | Description |
|---------|-------------|
| **Overview** | Current phase, progress bar, all-phases table |
| **Phase Detail** | Plans with status badges, key files, commits, duration metrics |
| **Roadmap** | Full phase list with dependencies and color-coded status |
| **Todos** | Pending list with priority badges, create form, mark-as-done |
| **Live Updates** | File watcher + SSE broadcasts + HTMX in-place refresh |

**Tech:** Express 5.x, EJS, Pico.css v2, HTMX 2.0, gray-matter + marked, chokidar 5.x, Helmet.

```bash
# From the repo root
npm run dashboard -- --dir /path/to/your/project

# Custom port
npm run dashboard -- --dir . --port 8080
```

---

## Configuration

Settings live in `.planning/config.json`. Run `/dev:config` to change them interactively.

| Setting | Options | Default |
|---------|---------|---------|
| `depth` | `quick` · `standard` · `comprehensive` | `standard` |
| `context_strategy` | `aggressive` · `balanced` · `minimal` | `aggressive` |
| `mode` | `interactive` · `autonomous` | `interactive` |
| `parallelization.enabled` | `true` · `false` | `true` |
| `git.branching` | `none` · `phase` · `milestone` | `none` |
| `features.goal_verification` | `true` · `false` | `true` |
| `features.plan_checking` | `true` · `false` | `true` |
| `features.atomic_commits` | `true` · `false` | `true` |
| `features.auto_continue` | `true` · `false` | `false` |
| `features.auto_advance` | `true` · `false` | `false` |

<details>
<summary><strong>All configuration options</strong></summary>

There are 12 top-level configuration keys covering:

- **Depth & strategy** — How thorough research and planning should be
- **Models** — Which Claude model agents use (inherit, sonnet, haiku)
- **Quality gates** — Confirm before plan, execute, and transition
- **Parallelization** — Max concurrent agents, plan-level parallelism
- **Git workflow** — Commit format, branching strategy, doc commits
- **Features** — 10+ toggles for verification, TDD, auto-advance, etc.

</details>

---

## Hooks

Towline uses Claude Code lifecycle hooks to enforce workflow discipline:

| Hook Event | Script | Purpose |
|------------|--------|---------|
| `SessionStart` | `progress-tracker.js` | Inject project state into new sessions |
| `PostToolUse` (Write/Edit) | `post-write-dispatch.js` | Validate plan format, check roadmap sync |
| `PreToolUse` (Bash) | `validate-commit.js` | Enforce commit format, block sensitive files |
| `PreCompact` | `context-budget-check.js` | Preserve STATE.md before compression |
| `Stop` | `auto-continue.js` | Chain next command when auto_continue enabled |
| `SubagentStart/Stop` | `log-subagent.js` | Track agent lifecycle |
| `SessionEnd` | `session-cleanup.js` | Clean up session state |

---

## Local Development

```bash
# Clone and install
git clone https://github.com/SienkLogic/towline.git
cd towline
npm install

# Run tests (540 tests, 31 suites)
npm test

# Lint
npm run lint

# Validate plugin structure
npm run validate

# Load locally for manual testing
claude --plugin-dir .
```

CI runs on Node 18/20/22 across Windows, macOS, and Linux. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## Stats

| Metric | Count |
|--------|-------|
| Skills (slash commands) | 21 |
| Specialized agents | 10 |
| Hook scripts | 25 |
| Tests | 540 |
| Test suites | 31 |
| Config toggles | 12 top-level keys |

---

## Acknowledgments

Towline was initially inspired by and built upon concepts from [get-shit-done](https://github.com/glittercowboy/get-shit-done) by [Lex Christopherson](https://github.com/glittercowboy), licensed under MIT. We took the foundation, had a different vision for where it should go, and built something with its own identity. See [ACKNOWLEDGMENTS](ACKNOWLEDGMENTS) for the original license.

## License

[MIT](LICENSE)
