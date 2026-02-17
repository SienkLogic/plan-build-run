---
name: setup
description: "Onboarding wizard. Initialize project, select models, verify setup."
allowed-tools: Read, Write, Bash, Glob, AskUserQuestion
---

# /dev:setup — Towline Setup Wizard

You are running the **setup** skill. This is an interactive onboarding wizard that guides users through Towline project setup. Use AskUserQuestion at each step for clear choices.

---

## Step 1: Detect Project State

Check if `.planning/` directory exists in the current working directory.

**If `.planning/` exists**:
- Read `.planning/config.json` to check current settings
- Tell the user: "Existing Towline project detected. This wizard will review your configuration."
- Skip to Step 3 (model selection)

**If `.planning/` does NOT exist**:
- Ask the user:

```
AskUserQuestion:
  question: "No Towline project found. Would you like to initialize one?"
  header: "Initialize"
  options:
    - label: "Yes, initialize here"
      description: "Creates .planning/ directory with default config, STATE.md, and ROADMAP.md"
    - label: "No, just exploring"
      description: "Exit the wizard — you can run /dev:begin later for full project setup"
```

If "No", display: "Run `/dev:begin` when you're ready to start a project. It includes deep requirements gathering and roadmap creation." Then stop.

If "Yes", create the minimal `.planning/` structure:

```bash
mkdir -p .planning/phases .planning/todos/pending .planning/todos/done .planning/logs .planning/research
```

Create `.planning/config.json` with defaults:
```json
{
  "version": 2,
  "depth": "standard",
  "mode": "guided",
  "features": {
    "structured_planning": true,
    "goal_verification": true,
    "integration_verification": false,
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
    "executor": "sonnet",
    "researcher": "sonnet",
    "planner": "sonnet",
    "verifier": "sonnet",
    "synthesizer": "haiku"
  },
  "parallelization": {
    "max_concurrent_agents": 3,
    "allow_parallel_plans": true
  },
  "planning": {
    "max_plans_per_phase": 4,
    "min_must_haves": 3
  },
  "git": {
    "auto_commit": true,
    "commit_format": "conventional",
    "branching_strategy": "none"
  },
  "gates": {
    "verification": true,
    "review": true,
    "plan_approval": false,
    "pre_build_checklist": false
  },
  "safety": {
    "block_sensitive_files": true,
    "require_tests": false
  },
  "hooks": {}
}
```

Create `.planning/STATE.md`:
```markdown
---
version: 2
current_phase: 0
total_phases: 0
status: "initialized"
progress_percent: 0
last_activity: "{today's date}"
last_command: "/dev:setup"
blockers: []
---
# Project State

## Current Position
Phase: 0 of 0
Status: initialized

Towline project initialized via /dev:setup. Run /dev:begin to start requirements gathering and roadmap creation.
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
      description: "Adding Towline to an existing project — run /dev:scan first"
    - label: "Prototype/experiment"
      description: "Quick iteration — lighter workflow with fewer gates"
```

Based on selection:
- **Greenfield**: Keep defaults (full gates, structured planning)
- **Existing codebase**: Suggest running `/dev:scan` after setup to map the codebase
- **Prototype**: Set `depth: "quick"`, disable `gates.verification`, disable `gates.review`, set `features.research_phase: false`

Update config.json with any changes.

---

## Step 3: Model Selection

```
AskUserQuestion:
  question: "Which model profile should Towline use for agents?"
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
- **Git branching**: Set `git.branching_strategy: "phase"`

---

## Step 5: Verification

Run a quick health check:

1. Verify `.planning/config.json` is valid JSON
2. Verify `.planning/STATE.md` exists and is parseable
3. Verify hook scripts are accessible: `node ${CLAUDE_PLUGIN_ROOT}/scripts/progress-tracker.js` from the project directory
4. Check that `npm test` works (if package.json exists)

Display results:

```
Setup Complete!

Project: {cwd basename}
Model profile: {balanced/quality/budget}
Depth: {quick/standard/comprehensive}
Features: {list of enabled non-default features}

Next steps:
  /dev:begin  — Full project setup with requirements and roadmap
  /dev:scan   — Analyze existing codebase (if adding to existing project)
  /dev:help   — Command reference
  /dev:config — Fine-tune individual settings
```

---

## Error Handling

- If `.planning/` creation fails (permissions): Tell user to create it manually and retry
- If config.json write fails: Display the JSON content and ask user to save it manually
- If health check fails: Display specific failure and suggest `/dev:health` for diagnostics
