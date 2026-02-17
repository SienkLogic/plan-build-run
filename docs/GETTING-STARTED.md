# Getting Started with Towline

This guide walks you through installing Towline and completing your first project workflow.

---

## Prerequisites

- **Claude Code** 1.0.33 or later ([installation guide](https://docs.anthropic.com/en/docs/claude-code))
- **Node.js** 18 or later

Verify both are installed:

```bash
claude --version    # Should be 1.0.33+
node --version      # Should be v18+
```

---

## Installation

### From the Claude Code Marketplace

```bash
# From your terminal
claude plugin marketplace add SienkLogic/towline
claude plugin install dev@towline

# Or from inside a Claude Code session
/plugin marketplace add SienkLogic/towline
/plugin install dev@towline
```

All `/dev:*` commands are now available in every Claude Code session.

### Install Scopes

| Scope | Command | Effect |
|-------|---------|--------|
| **Global** (default) | `claude plugin install dev@towline` | Available in all projects |
| **Project only** | `claude plugin install dev@towline --scope local` | This project only, gitignored |
| **Team project** | `claude plugin install dev@towline --scope project` | Shared via git; teammates get prompted to approve |

### Local Development Install

If you cloned the Towline repository and want to test it locally:

```bash
git clone https://github.com/SienkLogic/towline.git
cd towline
npm install
claude --plugin-dir .
```

---

## Your First Project

This walkthrough takes you from an empty project to a built-and-verified first phase.

### Step 1: Start a New Project

Open Claude Code in your project directory and run:

```
/dev:begin
```

Towline will:

1. **Ask about your project** -- What are you building? Who is it for? What tech stack?
2. **Research the domain** -- Spawns researcher agents to investigate your tech stack, common pitfalls, and best practices.
3. **Scope requirements** -- Presents discovered requirements and asks you to classify each as v1, v2, or out-of-scope.
4. **Generate a roadmap** -- Creates a phased development plan with goals and dependencies.

Everything is saved to a `.planning/` directory in your project root. This directory is Towline's persistent state -- it survives across sessions, context resets, and crashes.

> **Tip**: If you already have code in the project, Towline will detect it and suggest running `/dev:scan` first to analyze your existing codebase.

### Step 2: Plan the First Phase

```
/dev:plan 1
```

This spawns agents to:

1. Research the specific technologies needed for phase 1
2. Create executable plan files with concrete tasks
3. Verify the plans are complete and consistent

You will be asked to approve the plans before proceeding. Review them, request changes if needed, or approve to continue.

> **Faster planning**: Use `/dev:plan 1 --skip-research` to skip the research step if you already know the approach.

### Step 3: Build It

```
/dev:build 1
```

Executor agents work through the plan tasks:

- Each task produces one atomic git commit
- Plans in the same "wave" run in parallel
- Progress is checkpointed, so you can kill the session and resume later

When building completes, a verifier agent checks the actual codebase against the plan's declared requirements.

### Step 4: Review the Results

```
/dev:review 1
```

The review skill:

1. Runs three-layer verification: Do the files **exist**? Are they **substantive** (not stubs)? Are they **wired** into the system correctly?
2. Walks you through each deliverable for conversational acceptance testing.
3. If gaps are found, suggests `/dev:plan 1 --gaps` to create targeted fix plans.

### Step 5: Continue to the Next Phase

After review passes:

```
/dev:plan 2
/dev:build 2
/dev:review 2
```

Repeat until all phases are complete, then archive the milestone:

```
/dev:milestone complete
```

---

## Configuration Basics

Towline creates a `config.json` in your `.planning/` directory with sensible defaults. To adjust settings:

```
/dev:config
```

This opens an interactive configuration menu. Common settings to tweak:

### Depth

Controls how thorough research and planning are.

| Depth | Behavior | Cost |
|-------|----------|------|
| `quick` | Minimal research, smaller plans, faster execution | Low |
| `standard` | Balanced research and plan detail | Medium |
| `comprehensive` | Deep multi-source research, detailed plans | High |

Change it directly:

```
/dev:config depth quick
```

### Model Profiles

Control which Claude models agents use. Presets apply to all agents at once:

```
/dev:config model-profile balanced    # Default -- Sonnet for research, inherit for execution
/dev:config model-profile budget      # Haiku everywhere -- fast and cheap
/dev:config model-profile quality     # Opus where it matters most
```

Or set individual agents:

```
/dev:config model executor sonnet
```

### Feature Toggles

Toggle specific workflow features:

```
/dev:config feature research_phase off     # Skip research during planning
/dev:config feature plan_checking off      # Skip plan validation before building
/dev:config feature tdd_mode on            # Use TDD workflow (red/green/refactor commits)
```

---

## Useful Commands to Know

| When you want to... | Run |
|---------------------|-----|
| See where you are | `/dev:status` |
| Resume after restarting Claude | `/dev:resume` |
| Auto-advance to the next step | `/dev:continue` |
| Do a quick task outside the workflow | `/dev:quick` |
| Explore an idea before committing to it | `/dev:explore` |
| Talk through a phase before planning | `/dev:discuss 1` |
| Debug a failing test or broken build | `/dev:debug` |
| Capture a quick note | `/dev:note remember to add rate limiting` |
| Check planning directory health | `/dev:health` |
| See all commands | `/dev:help` |

---

## What Gets Created

After `/dev:begin`, your project will have a `.planning/` directory:

```
.planning/
  PROJECT.md          # Project vision and scope
  REQUIREMENTS.md     # Scoped requirements with IDs
  ROADMAP.md          # Phase structure with goals
  STATE.md            # Current position (auto-updated)
  CONTEXT.md          # Locked decisions and constraints
  config.json         # Workflow settings
  research/           # Domain research outputs
  phases/             # One directory per phase
  todos/              # Persistent todo items
```

This directory is the source of truth. You can kill your terminal, reboot, come back days later, and `/dev:resume` will pick up exactly where you left off.

---

## Tips

- **Use `/dev:quick` for small tasks.** If something would take one commit and five minutes, skip the full plan/build/review cycle.
- **Don't fight the gates.** The approval prompts exist to catch mistakes before they become expensive. Review plans before building.
- **Kill sessions freely.** All state is on disk. There is no penalty for closing Claude Code mid-operation.
- **Check `/dev:status` when confused.** It shows your current position and suggests what to do next.

---

## Next Steps

- [Workflow Reference](WORKFLOW-REFERENCE.md) -- All 21 commands with descriptions and common workflows
- [Creating Skills](CREATING-SKILLS.md) -- Extend Towline with custom slash commands
- [Creating Agents](CREATING-AGENTS.md) -- Add specialized agents for your domain
- [Full Documentation](DOCS.md) -- Comprehensive reference for every skill, agent, and config option
