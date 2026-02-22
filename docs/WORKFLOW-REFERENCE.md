# Workflow Reference

A complete guide to Plan-Build-Run's 25 skills and how they fit together.

---

## The Big Picture

Plan-Build-Run manages multi-phase software projects through a repeating cycle:

```
/pbr:begin          Plan the project, create a roadmap
    |
    v
/pbr:plan N         Plan a phase (research, create task plans, verify)
    |
    v
/pbr:build N        Build it (parallel agents execute tasks, make commits)
    |
    v
/pbr:review N       Verify it works (automated checks + your review)
    |
    |--- gaps? ---> /pbr:plan N --gaps  (fix plans) --> /pbr:build N --gaps-only
    |
    v
/pbr:plan N+1       Next phase...
    |
    v
/pbr:milestone      Archive when done
```

Most of the other commands are utilities that support this core loop: exploring ideas before committing, debugging problems, managing todos, and controlling session state.

---

## All Commands

### Core Workflow

These four commands are the main loop. You will use them on every project.

#### `/pbr:begin` -- Start a New Project

Initializes a Plan-Build-Run project through deep questioning, domain research, requirements scoping, and roadmap generation.

```
/pbr:begin
```

**When to use**: At the start of any new project. Creates the `.planning/` directory and all foundational files.

**What it does**: Asks about your project, spawns researcher agents to investigate the domain, helps you scope requirements (v1 / v2 / out-of-scope), and generates a phased roadmap.

**Agent cost**: High (4-6 agents depending on depth setting).

---

#### `/pbr:plan` -- Plan a Phase

Creates executable task plans for a phase, optionally with research.

```
/pbr:plan 1                    # Plan phase 1
/pbr:plan 3 --skip-research    # Plan phase 3 without research (faster)
/pbr:plan 2 --assumptions      # Surface Claude's assumptions first (free)
/pbr:plan 2 --gaps             # Create plans to fix verification failures
/pbr:plan add                  # Append a new phase to the roadmap
/pbr:plan insert 3.1           # Insert a phase between 3 and 4
/pbr:plan remove 5             # Remove phase 5 and renumber
```

**When to use**: After `/pbr:begin` creates your roadmap, or after `/pbr:review` passes for the previous phase.

**What it does**: Optionally researches the phase's domain, generates plan files with concrete tasks, and validates them through a plan checker.

**Agent cost**: Medium (2-3 agents). Zero cost for `--assumptions`.

---

#### `/pbr:build` -- Build a Phase

Executes all plans in a phase by spawning executor agents.

```
/pbr:build 1                   # Build phase 1
/pbr:build 3 --gaps-only       # Build only the gap-closure plans
/pbr:build 2 --team            # Use Agent Teams for complex coordination
```

**When to use**: After plans are approved for a phase.

**What it does**: Spawns executor agents that work through tasks, make atomic commits, and write summary files. Plans with no conflicts run in parallel (same wave); dependent plans wait.

**Agent cost**: High (2-4 agents).

---

#### `/pbr:review` -- Verify a Phase

Automated verification plus conversational acceptance testing.

```
/pbr:review 1                  # Review phase 1
/pbr:review 2 --auto-fix       # Automatically diagnose and fix failures
```

**When to use**: After a phase is built. This is how you know whether the build succeeded.

**What it does**: Three-layer verification (existence, substantiveness, wiring) against the plan's must-have declarations, then walks you through each deliverable for your review.

**Agent cost**: Low (1 agent). Medium with `--auto-fix`.

---

### Planning and Discovery

Use these before the plan/build/review cycle to explore ideas and make decisions.

#### `/pbr:explore` -- Explore Ideas

Open-ended Socratic conversation to think through ideas.

```
/pbr:explore                    # General exploration
/pbr:explore caching strategy   # Explore a specific topic
```

**When to use**: When you have an idea that is not ready to become a requirement or phase yet. Useful for thinking through approaches, weighing trade-offs, or brainstorming.

**What it does**: Guided conversation that can optionally spawn a researcher mid-discussion. At the end, routes your insights to the right place: a todo, requirement, phase decision, note, or seed file for future planning.

---

#### `/pbr:discuss` -- Pre-Planning Discussion

Talk through a specific phase before planning to lock decisions.

```
/pbr:discuss 2
```

**When to use**: When a phase has gray areas -- UI choices, architecture questions, scope boundaries -- that you want settled before the planner runs.

**What it does**: Identifies 3-4 gray areas, presents concrete options for each, and records your decisions as "locked" (planner must honor), "deferred" (planner must skip), or "Claude's discretion."

---

#### `/pbr:scan` -- Analyze Existing Codebase

Map an existing codebase's structure, conventions, and concerns.

```
/pbr:scan
```

**When to use**: Before `/pbr:begin` on a brownfield project (one that already has code). The scan output gives Plan-Build-Run context about what exists so it can plan around it.

**What it does**: Spawns 4 parallel analysis agents that produce 8 output files covering technology stack, architecture, directory structure, coding conventions, test infrastructure, and concerns.

---

#### `/pbr:import` -- Import an External Plan

Convert an existing design document into Plan-Build-Run's planning format.

```
/pbr:import 3 --from design-doc.md
```

**When to use**: When you have an existing RFC, design document, or AI-generated plan that you want to execute through Plan-Build-Run's workflow.

**What it does**: Parses the document, validates it against your project context, detects conflicts with locked decisions, and generates properly formatted plan files.

---

### Execution

#### `/pbr:quick` -- Quick Ad-Hoc Task

Execute a small task outside the full plan/build/review cycle.

```
/pbr:quick fix the login button color
/pbr:quick add a health check endpoint
```

**When to use**: For small, well-defined changes that would take 1-3 tasks. If the work is bigger than that, use the full plan/build cycle.

**What it does**: Creates a minimal plan, spawns one executor agent, and produces an atomic commit. Tracked in `.planning/quick/` so nothing is lost.

---

#### `/pbr:continue` -- Auto-Advance

Determine and execute the next logical step automatically.

```
/pbr:continue
```

**When to use**: When you want Plan-Build-Run to figure out what comes next and just do it, without asking you which command to run.

**What it does**: Reads STATE.md and the file system, determines the highest-priority next action (checkpoint resume, gap closure, next phase, etc.), and executes it. Hard-stops at milestone completion, errors, and human-input checkpoints.

---

### Verification and Debugging

#### `/pbr:debug` -- Systematic Debugging

Hypothesis-driven debugging with persistent state.

```
/pbr:debug                              # Start a new debug session
/pbr:debug the auth redirect loops      # Start with a specific issue
```

**When to use**: When something is broken and you want structured investigation rather than ad-hoc poking.

**What it does**: Follows OBSERVE-HYPOTHESIZE-PREDICT-TEST-EVALUATE protocol. Debug session files persist across conversations, so you never lose investigation progress.

---

#### `/pbr:health` -- Planning Directory Diagnostics

Check the integrity of your `.planning/` directory.

```
/pbr:health
```

**When to use**: When something feels wrong -- commands are behaving unexpectedly, state seems stale, or you just want to verify everything is consistent.

**What it does**: Runs 6 diagnostic checks (structure, config validity, phase consistency, plan/summary pairing, STATE.md accuracy, frontmatter validity) and reports PASS/WARN/FAIL for each.

---

### Session Management

#### `/pbr:status` -- Current Position

Show project progress and suggest what to do next.

```
/pbr:status
```

**When to use**: Whenever you are unsure where the project stands or what to do next.

**What it does**: Reads STATE.md and the file system, calculates phase statuses, shows a progress bar, and suggests the best next command.

---

#### `/pbr:pause` -- Save Session State

Capture current session state for later resumption.

```
/pbr:pause
/pbr:pause --checkpoint    # Lightweight dump, skip analysis
```

**When to use**: When you are ending a session and want a clean handoff for next time.

**What it does**: Creates a handoff file with your current position, completed work, remaining work, decisions, blockers, and next steps. Makes a WIP commit so nothing is lost.

---

#### `/pbr:resume` -- Resume Previous Session

Find the last pause point and suggest what to do next.

```
/pbr:resume
```

**When to use**: When starting a new Claude Code session and you want to pick up where you left off.

**What it does**: Reads the handoff file from `/pbr:pause` (or infers state from STATE.md), validates the resume point, and suggests the next action.

---

### Project Management

#### `/pbr:milestone` -- Milestone Lifecycle

Manage project milestones.

```
/pbr:milestone new             # Start a new milestone cycle
/pbr:milestone complete        # Archive the current milestone, create git tag
/pbr:milestone audit           # Verify milestone completion against requirements
/pbr:milestone gaps            # Create phases to close audit gaps
```

**When to use**: When all phases in the current roadmap are complete and you want to archive the work, or when starting a new set of phases.

---

#### `/pbr:todo` -- Persistent Todos

File-based todos that survive across sessions.

```
/pbr:todo add implement rate limiting for the API
/pbr:todo list
/pbr:todo list auth           # Filter by area
/pbr:todo done 20260210-003  # Mark a todo complete
```

**When to use**: For tracking work items that do not belong to any specific phase -- bugs found during review, ideas to revisit, technical debt to address.

---

#### `/pbr:note` -- Quick Note Capture

Zero-friction idea capture.

```
/pbr:note consider using Redis for session storage
/pbr:note list
/pbr:note promote 3          # Promote a note to a todo
```

**When to use**: When you have a thought you want to record without the overhead of creating a todo. Notes are quick and informal; promote them to todos when they become actionable.

---

#### `/pbr:config` -- Configure Workflow

Read and modify workflow settings.

```
/pbr:config                                # Show current settings
/pbr:config depth comprehensive            # Set depth level
/pbr:config model executor sonnet          # Set model for one agent
/pbr:config model-profile quality          # Set all agent models via preset
/pbr:config gate confirm_execute on        # Toggle a gate
/pbr:config feature tdd_mode on            # Toggle a feature
/pbr:config git branching phase            # Set git branching strategy
```

**When to use**: To tune Plan-Build-Run's behavior for your project -- speed vs. thoroughness, model quality vs. cost, confirmation prompts vs. autonomous execution.

---

#### `/pbr:setup` -- Onboarding Wizard

Interactive setup wizard for new projects.

```
/pbr:setup
```

**When to use**: As an alternative to `/pbr:begin` when you want guided step-by-step configuration. The wizard walks through initialization, model selection, feature toggles, and verification.

---

#### `/pbr:help` -- Command Reference

Display a quick reference of all commands.

```
/pbr:help
```

---

## Common Workflows

### New Greenfield Project

```
/pbr:begin                    # Define project, research, roadmap
/pbr:plan 1                   # Plan phase 1
/pbr:build 1                  # Build it
/pbr:review 1                 # Verify it
/pbr:plan 2                   # Plan phase 2
/pbr:build 2                  # Build it
/pbr:review 2                 # Verify it
...                           # Repeat for all phases
/pbr:milestone complete       # Archive and tag
```

### Brownfield Project (Existing Code)

```
/pbr:scan                     # Analyze existing codebase first
/pbr:begin                    # Define what you want to add/change
/pbr:plan 1                   # Plan around existing code
...
```

### Quick One-Off Task

```
/pbr:quick fix the 404 page styling
```

No planning overhead. One agent, one commit, done.

### Resume After a Break

```
/pbr:resume                   # See where you left off
/pbr:continue                 # Or just auto-execute the next step
```

### Debugging a Problem

```
/pbr:debug the API returns 500 on login
```

Structured investigation with persistent notes. Come back tomorrow and the debug state is still there.

### Exploring Before Committing

```
/pbr:explore should we use WebSockets or SSE for real-time updates?
```

Socratic discussion that can spawn research. Routes conclusions to todos, requirements, or decisions.

### Fixing Verification Failures

```
/pbr:review 3                 # Review finds gaps
/pbr:plan 3 --gaps            # Create targeted fix plans
/pbr:build 3 --gaps-only      # Build only the fixes
/pbr:review 3                 # Re-verify
```

### Hands-Free Execution

```
/pbr:config feature auto_continue on
/pbr:continue                 # Plan-Build-Run chains commands automatically
```

Hard-stops at milestone completion, errors, and points that need your input.

---

## Configuration Summary

All settings live in `.planning/config.json`. Use `/pbr:config` to change them.

| Setting | Default | Options |
|---------|---------|---------|
| `depth` | `standard` | `quick`, `standard`, `comprehensive` |
| `context_strategy` | `aggressive` | `aggressive`, `balanced`, `minimal` |
| `mode` | `interactive` | `interactive`, `autonomous` |
| `parallelization.enabled` | `true` | `true`, `false` |
| `git.branching` | `none` | `none`, `phase`, `milestone`, `disabled` |

### Feature Toggles

| Feature | Default | What It Does |
|---------|---------|--------------|
| `goal_verification` | `true` | Run verifier agent after each build |
| `plan_checking` | `true` | Validate plans before building |
| `atomic_commits` | `true` | One commit per task |
| `research_phase` | `true` | Research before planning |
| `tdd_mode` | `false` | Red/green/refactor commit pattern |
| `auto_continue` | `false` | Auto-chain workflow commands |
| `status_line` | `true` | Show progress in Claude Code status bar |

### Model Profiles

| Profile | Best For |
|---------|----------|
| `balanced` (default) | Most projects -- good quality at reasonable cost |
| `quality` | Critical projects where accuracy matters most |
| `budget` | Prototyping and experimentation |
| `adaptive` | Front-loads intelligence in research/planning |

---

## Behavioral Contexts

Plan-Build-Run includes three behavioral contexts that adjust how Claude operates during different workflow stages:

| Context | Activated By | Behavior |
|---------|-------------|----------|
| `dev` | `/pbr:build`, `/pbr:quick` | Write code first, low verbosity, medium risk tolerance |
| `research` | `/pbr:explore`, `/pbr:discuss` | Read widely, no code writing, high verbosity, evidence-based |
| `review` | `/pbr:review` | Read thoroughly, prioritize by severity, report without fixing |

Contexts activate automatically -- you do not need to configure them.

---

## Further Reading

- [Getting Started](GETTING-STARTED.md) -- Installation and first project walkthrough
- [Creating Skills](CREATING-SKILLS.md) -- Extend Plan-Build-Run with custom slash commands
- [Creating Agents](CREATING-AGENTS.md) -- Add specialized agents for your domain
- [Full Documentation](DOCS.md) -- Comprehensive reference for every skill, agent, and config option
- [Architecture](ARCHITECTURE.md) -- Internal orchestration diagrams
