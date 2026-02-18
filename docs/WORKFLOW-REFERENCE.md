# Workflow Reference

A complete guide to Towline's 21 skills and how they fit together.

---

## The Big Picture

Towline manages multi-phase software projects through a repeating cycle:

```
/dev:begin          Plan the project, create a roadmap
    |
    v
/dev:plan N         Plan a phase (research, create task plans, verify)
    |
    v
/dev:build N        Build it (parallel agents execute tasks, make commits)
    |
    v
/dev:review N       Verify it works (automated checks + your review)
    |
    |--- gaps? ---> /dev:plan N --gaps  (fix plans) --> /dev:build N --gaps-only
    |
    v
/dev:plan N+1       Next phase...
    |
    v
/dev:milestone      Archive when done
```

Most of the other commands are utilities that support this core loop: exploring ideas before committing, debugging problems, managing todos, and controlling session state.

---

## All Commands

### Core Workflow

These four commands are the main loop. You will use them on every project.

#### `/dev:begin` -- Start a New Project

Initializes a Towline project through deep questioning, domain research, requirements scoping, and roadmap generation.

```
/dev:begin
```

**When to use**: At the start of any new project. Creates the `.planning/` directory and all foundational files.

**What it does**: Asks about your project, spawns researcher agents to investigate the domain, helps you scope requirements (v1 / v2 / out-of-scope), and generates a phased roadmap.

**Agent cost**: High (4-6 agents depending on depth setting).

---

#### `/dev:plan` -- Plan a Phase

Creates executable task plans for a phase, optionally with research.

```
/dev:plan 1                    # Plan phase 1
/dev:plan 3 --skip-research    # Plan phase 3 without research (faster)
/dev:plan 2 --assumptions      # Surface Claude's assumptions first (free)
/dev:plan 2 --gaps             # Create plans to fix verification failures
/dev:plan add                  # Append a new phase to the roadmap
/dev:plan insert 3.1           # Insert a phase between 3 and 4
/dev:plan remove 5             # Remove phase 5 and renumber
```

**When to use**: After `/dev:begin` creates your roadmap, or after `/dev:review` passes for the previous phase.

**What it does**: Optionally researches the phase's domain, generates plan files with concrete tasks, and validates them through a plan checker.

**Agent cost**: Medium (2-3 agents). Zero cost for `--assumptions`.

---

#### `/dev:build` -- Build a Phase

Executes all plans in a phase by spawning executor agents.

```
/dev:build 1                   # Build phase 1
/dev:build 3 --gaps-only       # Build only the gap-closure plans
/dev:build 2 --team            # Use Agent Teams for complex coordination
```

**When to use**: After plans are approved for a phase.

**What it does**: Spawns executor agents that work through tasks, make atomic commits, and write summary files. Plans with no conflicts run in parallel (same wave); dependent plans wait.

**Agent cost**: High (2-4 agents).

---

#### `/dev:review` -- Verify a Phase

Automated verification plus conversational acceptance testing.

```
/dev:review 1                  # Review phase 1
/dev:review 2 --auto-fix       # Automatically diagnose and fix failures
```

**When to use**: After a phase is built. This is how you know whether the build succeeded.

**What it does**: Three-layer verification (existence, substantiveness, wiring) against the plan's must-have declarations, then walks you through each deliverable for your review.

**Agent cost**: Low (1 agent). Medium with `--auto-fix`.

---

### Planning and Discovery

Use these before the plan/build/review cycle to explore ideas and make decisions.

#### `/dev:explore` -- Explore Ideas

Open-ended Socratic conversation to think through ideas.

```
/dev:explore                    # General exploration
/dev:explore caching strategy   # Explore a specific topic
```

**When to use**: When you have an idea that is not ready to become a requirement or phase yet. Useful for thinking through approaches, weighing trade-offs, or brainstorming.

**What it does**: Guided conversation that can optionally spawn a researcher mid-discussion. At the end, routes your insights to the right place: a todo, requirement, phase decision, note, or seed file for future planning.

---

#### `/dev:discuss` -- Pre-Planning Discussion

Talk through a specific phase before planning to lock decisions.

```
/dev:discuss 2
```

**When to use**: When a phase has gray areas -- UI choices, architecture questions, scope boundaries -- that you want settled before the planner runs.

**What it does**: Identifies 3-4 gray areas, presents concrete options for each, and records your decisions as "locked" (planner must honor), "deferred" (planner must skip), or "Claude's discretion."

---

#### `/dev:scan` -- Analyze Existing Codebase

Map an existing codebase's structure, conventions, and concerns.

```
/dev:scan
```

**When to use**: Before `/dev:begin` on a brownfield project (one that already has code). The scan output gives Towline context about what exists so it can plan around it.

**What it does**: Spawns 4 parallel analysis agents that produce 8 output files covering technology stack, architecture, directory structure, coding conventions, test infrastructure, and concerns.

---

#### `/dev:import` -- Import an External Plan

Convert an existing design document into Towline's planning format.

```
/dev:import 3 --from design-doc.md
```

**When to use**: When you have an existing RFC, design document, or AI-generated plan that you want to execute through Towline's workflow.

**What it does**: Parses the document, validates it against your project context, detects conflicts with locked decisions, and generates properly formatted plan files.

---

### Execution

#### `/dev:quick` -- Quick Ad-Hoc Task

Execute a small task outside the full plan/build/review cycle.

```
/dev:quick fix the login button color
/dev:quick add a health check endpoint
```

**When to use**: For small, well-defined changes that would take 1-3 tasks. If the work is bigger than that, use the full plan/build cycle.

**What it does**: Creates a minimal plan, spawns one executor agent, and produces an atomic commit. Tracked in `.planning/quick/` so nothing is lost.

---

#### `/dev:continue` -- Auto-Advance

Determine and execute the next logical step automatically.

```
/dev:continue
```

**When to use**: When you want Towline to figure out what comes next and just do it, without asking you which command to run.

**What it does**: Reads STATE.md and the file system, determines the highest-priority next action (checkpoint resume, gap closure, next phase, etc.), and executes it. Hard-stops at milestone completion, errors, and human-input checkpoints.

---

### Verification and Debugging

#### `/dev:debug` -- Systematic Debugging

Hypothesis-driven debugging with persistent state.

```
/dev:debug                              # Start a new debug session
/dev:debug the auth redirect loops      # Start with a specific issue
```

**When to use**: When something is broken and you want structured investigation rather than ad-hoc poking.

**What it does**: Follows OBSERVE-HYPOTHESIZE-PREDICT-TEST-EVALUATE protocol. Debug session files persist across conversations, so you never lose investigation progress.

---

#### `/dev:health` -- Planning Directory Diagnostics

Check the integrity of your `.planning/` directory.

```
/dev:health
```

**When to use**: When something feels wrong -- commands are behaving unexpectedly, state seems stale, or you just want to verify everything is consistent.

**What it does**: Runs 6 diagnostic checks (structure, config validity, phase consistency, plan/summary pairing, STATE.md accuracy, frontmatter validity) and reports PASS/WARN/FAIL for each.

---

### Session Management

#### `/dev:status` -- Current Position

Show project progress and suggest what to do next.

```
/dev:status
```

**When to use**: Whenever you are unsure where the project stands or what to do next.

**What it does**: Reads STATE.md and the file system, calculates phase statuses, shows a progress bar, and suggests the best next command.

---

#### `/dev:pause` -- Save Session State

Capture current session state for later resumption.

```
/dev:pause
/dev:pause --checkpoint    # Lightweight dump, skip analysis
```

**When to use**: When you are ending a session and want a clean handoff for next time.

**What it does**: Creates a handoff file with your current position, completed work, remaining work, decisions, blockers, and next steps. Makes a WIP commit so nothing is lost.

---

#### `/dev:resume` -- Resume Previous Session

Find the last pause point and suggest what to do next.

```
/dev:resume
```

**When to use**: When starting a new Claude Code session and you want to pick up where you left off.

**What it does**: Reads the handoff file from `/dev:pause` (or infers state from STATE.md), validates the resume point, and suggests the next action.

---

### Project Management

#### `/dev:milestone` -- Milestone Lifecycle

Manage project milestones.

```
/dev:milestone new             # Start a new milestone cycle
/dev:milestone complete        # Archive the current milestone, create git tag
/dev:milestone audit           # Verify milestone completion against requirements
/dev:milestone gaps            # Create phases to close audit gaps
```

**When to use**: When all phases in the current roadmap are complete and you want to archive the work, or when starting a new set of phases.

---

#### `/dev:todo` -- Persistent Todos

File-based todos that survive across sessions.

```
/dev:todo add implement rate limiting for the API
/dev:todo list
/dev:todo list auth           # Filter by area
/dev:todo done 20260210-003  # Mark a todo complete
```

**When to use**: For tracking work items that do not belong to any specific phase -- bugs found during review, ideas to revisit, technical debt to address.

---

#### `/dev:note` -- Quick Note Capture

Zero-friction idea capture.

```
/dev:note consider using Redis for session storage
/dev:note list
/dev:note promote 3          # Promote a note to a todo
```

**When to use**: When you have a thought you want to record without the overhead of creating a todo. Notes are quick and informal; promote them to todos when they become actionable.

---

#### `/dev:config` -- Configure Workflow

Read and modify workflow settings.

```
/dev:config                                # Show current settings
/dev:config depth comprehensive            # Set depth level
/dev:config model executor sonnet          # Set model for one agent
/dev:config model-profile quality          # Set all agent models via preset
/dev:config gate confirm_execute on        # Toggle a gate
/dev:config feature tdd_mode on            # Toggle a feature
/dev:config git branching phase            # Set git branching strategy
```

**When to use**: To tune Towline's behavior for your project -- speed vs. thoroughness, model quality vs. cost, confirmation prompts vs. autonomous execution.

---

#### `/dev:setup` -- Onboarding Wizard

Interactive setup wizard for new projects.

```
/dev:setup
```

**When to use**: As an alternative to `/dev:begin` when you want guided step-by-step configuration. The wizard walks through initialization, model selection, feature toggles, and verification.

---

#### `/dev:help` -- Command Reference

Display a quick reference of all commands.

```
/dev:help
```

---

## Common Workflows

### New Greenfield Project

```
/dev:begin                    # Define project, research, roadmap
/dev:plan 1                   # Plan phase 1
/dev:build 1                  # Build it
/dev:review 1                 # Verify it
/dev:plan 2                   # Plan phase 2
/dev:build 2                  # Build it
/dev:review 2                 # Verify it
...                           # Repeat for all phases
/dev:milestone complete       # Archive and tag
```

### Brownfield Project (Existing Code)

```
/dev:scan                     # Analyze existing codebase first
/dev:begin                    # Define what you want to add/change
/dev:plan 1                   # Plan around existing code
...
```

### Quick One-Off Task

```
/dev:quick fix the 404 page styling
```

No planning overhead. One agent, one commit, done.

### Resume After a Break

```
/dev:resume                   # See where you left off
/dev:continue                 # Or just auto-execute the next step
```

### Debugging a Problem

```
/dev:debug the API returns 500 on login
```

Structured investigation with persistent notes. Come back tomorrow and the debug state is still there.

### Exploring Before Committing

```
/dev:explore should we use WebSockets or SSE for real-time updates?
```

Socratic discussion that can spawn research. Routes conclusions to todos, requirements, or decisions.

### Fixing Verification Failures

```
/dev:review 3                 # Review finds gaps
/dev:plan 3 --gaps            # Create targeted fix plans
/dev:build 3 --gaps-only      # Build only the fixes
/dev:review 3                 # Re-verify
```

### Hands-Free Execution

```
/dev:config feature auto_continue on
/dev:continue                 # Towline chains commands automatically
```

Hard-stops at milestone completion, errors, and points that need your input.

---

## Configuration Summary

All settings live in `.planning/config.json`. Use `/dev:config` to change them.

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

Towline includes three behavioral contexts that adjust how Claude operates during different workflow stages:

| Context | Activated By | Behavior |
|---------|-------------|----------|
| `dev` | `/dev:build`, `/dev:quick` | Write code first, low verbosity, medium risk tolerance |
| `research` | `/dev:explore`, `/dev:discuss` | Read widely, no code writing, high verbosity, evidence-based |
| `review` | `/dev:review` | Read thoroughly, prioritize by severity, report without fixing |

Contexts activate automatically -- you do not need to configure them.

---

## Further Reading

- [Getting Started](GETTING-STARTED.md) -- Installation and first project walkthrough
- [Creating Skills](CREATING-SKILLS.md) -- Extend Towline with custom slash commands
- [Creating Agents](CREATING-AGENTS.md) -- Add specialized agents for your domain
- [Full Documentation](DOCS.md) -- Comprehensive reference for every skill, agent, and config option
- [Architecture](ARCHITECTURE.md) -- Internal orchestration diagrams
