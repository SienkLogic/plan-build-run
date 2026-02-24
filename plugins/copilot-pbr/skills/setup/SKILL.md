---
name: setup
description: "Onboarding wizard. Initialize project, select models, verify setup."
---

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► SETUP                                      ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

# /pbr:setup — Plan-Build-Run Setup Wizard

You are running the **setup** skill. This is an interactive onboarding wizard that guides users through Plan-Build-Run project setup. Use AskUserQuestion at each step for clear choices.

---

## Step 1: Detect Project State — Idempotency Guard

Check if `.planning/` directory exists in the current working directory.

**If `.planning/` exists**:
- Check for existing core files: `STATE.md`, `ROADMAP.md`, `config.json`
- If ANY of these exist, present a checkpoint:

  Use AskUserQuestion:
    question: "Existing project detected with {list of found files}. How should we proceed?"
    header: "Setup"
    options:
      - label: "Resume"       description: "Keep existing .planning/ and review configuration (recommended)"
      - label: "Reset"        description: "Archive current .planning/ to .planning.bak/ and start fresh"
      - label: "Abort"        description: "Cancel setup — keep everything as-is"

  - If "Resume": Tell the user: "Keeping existing project. Reviewing configuration." Skip to Step 3 (model selection)
  - If "Reset": Run `mv .planning .planning.bak` (creating a backup), then proceed with fresh setup below
  - If "Abort": Display "Setup cancelled. Run `/pbr:status` to see current project state." and stop

- If `.planning/` exists but has NONE of the core files (empty or only has subdirs):
  - Tell the user: "Found empty .planning/ directory. Proceeding with initialization."
  - Continue to fresh setup below

**If `.planning/` does NOT exist**:
- Ask the user:

```
AskUserQuestion:
  question: "No Plan-Build-Run project found. Would you like to initialize one?"
  header: "Initialize"
  options:
    - label: "Yes, initialize here"
      description: "Creates .planning/ directory with default config, STATE.md, and ROADMAP.md"
    - label: "No, just exploring"
      description: "Exit the wizard — you can run /pbr:begin later for full project setup"
```

If "No", display: "Run `/pbr:begin` when you're ready to start a project. It includes deep requirements gathering and roadmap creation." Then stop.

If "Yes", create the minimal `.planning/` structure:

**CRITICAL: Create .planning/ directory structure NOW. Do NOT skip this step.**

```bash
mkdir -p .planning/phases .planning/todos/pending .planning/todos/done .planning/logs .planning/research
```

**CRITICAL: Write .planning/config.json NOW. Do NOT skip this step.**

Create `.planning/config.json` with defaults:
```json
{
  "version": 2,
  "context_strategy": "aggressive",
  "mode": "interactive",
  "depth": "standard",
  "features": {
    "structured_planning": true,
    "goal_verification": true,
    "integration_verification": true,
    "context_isolation": true,
    "atomic_commits": true,
    "session_persistence": true,
    "research_phase": true,
    "plan_checking": true,
    "tdd_mode": false,
    "status_line": true,
    "auto_continue": false,
    "auto_advance": false,
    "team_discussions": false,
    "inline_verify": false
  },
  "models": {
    "researcher": "sonnet",
    "planner": "inherit",
    "executor": "inherit",
    "verifier": "sonnet",
    "integration_checker": "sonnet",
    "debugger": "inherit",
    "mapper": "sonnet",
    "synthesizer": "sonnet"
  },
  "parallelization": {
    "enabled": true,
    "plan_level": true,
    "task_level": false,
    "max_concurrent_agents": 3,
    "min_plans_for_parallel": 2,
    "use_teams": false
  },
  "planning": {
    "commit_docs": true,
    "max_tasks_per_plan": 3,
    "search_gitignored": false
  },
  "git": {
    "branching": "none",
    "commit_format": "{type}({phase}-{plan}): {description}",
    "phase_branch_template": "plan-build-run/phase-{phase}-{slug}",
    "milestone_branch_template": "plan-build-run/{milestone}-{slug}",
    "mode": "enabled"
  },
  "gates": {
    "confirm_project": true,
    "confirm_roadmap": true,
    "confirm_plan": true,
    "confirm_execute": false,
    "confirm_transition": true,
    "issues_review": true
  },
  "safety": {
    "always_confirm_destructive": true,
    "always_confirm_external_services": true
  }
}
```

**CRITICAL: Write .planning/STATE.md NOW. Do NOT skip this step.**

Create `.planning/STATE.md`:
```markdown
---
version: 2
current_phase: 0
total_phases: 0
status: "initialized"
progress_percent: 0
last_activity: "{today's date}"
last_command: "/pbr:setup"
blockers: []
---
# Project State

## Current Position
Phase: 0 of 0
Status: initialized

Plan-Build-Run project initialized via /pbr:setup. Run /pbr:begin to start requirements gathering and roadmap creation.
```

---

## Step 2: Project Type (new projects only)

```
AskUserQuestion:
  question: "What kind of project is this?"
  header: "Project type"
  options:
    - label: "Greenfield"
      description: "Starting from scratch — full planning cycle recommended"
    - label: "Existing codebase"
      description: "Adding Plan-Build-Run to an existing project — run /pbr:scan first"
    - label: "Prototype/experiment"
      description: "Quick iteration — lighter workflow with fewer gates"
```

Based on selection:
- **Greenfield**: Keep defaults (full gates, structured planning)
- **Existing codebase**: Suggest running `/pbr:scan` after setup to map the codebase
- **Prototype**: Set `depth: "quick"`, disable `gates.verification`, disable `gates.review`, set `features.research_phase: false`

Update config.json with any changes.

---

## Step 3: Model Selection

```
AskUserQuestion:
  question: "Which model profile should Plan-Build-Run use for agents?"
  header: "Models"
  options:
    - label: "Balanced (Recommended)"
      description: "Sonnet for most agents, Haiku for synthesizer. Good quality/cost tradeoff."
    - label: "Quality"
      description: "Opus for executor and planner, Sonnet for others. Best results, highest cost."
    - label: "Budget"
      description: "Haiku for most agents. Fastest and cheapest, but lower quality."
```

Apply the selected profile to `config.json`:
- **Balanced**: executor=sonnet, researcher=sonnet, planner=sonnet, verifier=sonnet, synthesizer=haiku
- **Quality**: executor=opus, researcher=sonnet, planner=opus, verifier=sonnet, synthesizer=sonnet
- **Budget**: executor=haiku, researcher=haiku, planner=sonnet, verifier=haiku, synthesizer=haiku

---

## Step 4: Workflow Preferences

```
AskUserQuestion:
  question: "Which workflow features do you want enabled?"
  header: "Features"
  multiSelect: true
  options:
    - label: "Auto-continue"
      description: "Automatically chain commands (build → review → next phase) without prompting"
    - label: "TDD mode"
      description: "Write tests before implementation in executor agents"
    - label: "Strict gates"
      description: "Require verification AND review to pass before advancing phases"
    - label: "Git branching"
      description: "Create a branch per phase for cleaner PR history"
```

Apply selections:
- **Auto-continue**: Set `features.auto_continue: true`
- **TDD mode**: Set `features.tdd_mode: true`
- **Strict gates**: Set `gates.verification: true`, `gates.review: true`, `gates.plan_approval: true`
- **Git branching**: Set `git.branching: "phase"`

---

## Step 4b: CLAUDE.md Integration

Check if a `CLAUDE.md` file exists in the project root.

**If it exists**: Read it. If it does NOT already contain a "Plan-Build-Run" section, append the block below.
**If it does NOT exist**: Create `CLAUDE.md` with the block below.

Append/create this content:

```markdown
## Plan-Build-Run

This project uses [Plan-Build-Run](https://github.com/SienkLogic/plan-build-run) for structured development.

- Project state: `.planning/STATE.md` (source of truth for current phase and progress)
- Configuration: `.planning/config.json`
- Run `/pbr:status` to see current project state and suggested next action.

**After compaction or context recovery**: Read `.planning/STATE.md` (especially the `## Session Continuity` section) before proceeding with any work. The PreCompact hook writes recovery state there automatically.
```

---

## Step 5: Verification

**CRITICAL: Run validation checks NOW to confirm setup succeeded. Do NOT skip this step.**

Run a quick health check:

1. Verify `.planning/config.json` is valid JSON
2. Verify `.planning/STATE.md` exists and is parseable
3. Verify hook scripts are accessible: `node ${PLUGIN_ROOT}/scripts/progress-tracker.js` from the project directory
4. Check that `npm test` works (if package.json exists)

Display results:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► SETUP COMPLETE ✓                           ║
╚══════════════════════════════════════════════════════════════╝

Project: {cwd basename}
Model profile: {balanced/quality/budget}
Depth: {quick/standard/comprehensive}
Features: {list of enabled non-default features}

╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**Start your project** — define requirements and create a roadmap

`/pbr:begin`

<sub>`/clear` first → fresh context window</sub>

**Also available:**
- `/pbr:scan` — analyze existing codebase (if adding to existing project)
- `/pbr:config` — fine-tune individual settings
- `/pbr:help` — command reference
```

---

## Error Handling

- If `.planning/` creation fails (permissions): Tell user to create it manually and retry
- If config.json write fails: Display the JSON content and ask user to save it manually
- If health check fails: Display specific failure and suggest `/pbr:health` for diagnostics
