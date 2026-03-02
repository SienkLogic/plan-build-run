---
name: setup
description: "Reconfigure an existing Plan-Build-Run project (models, features, CLAUDE.md)."
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes tokens. Begin executing Step 1 immediately.**

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► RECONFIGURE                                ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

# $pbr-setup — Plan-Build-Run Reconfigure

You are running the **setup** skill in **reconfigure mode**. This wizard lets existing Plan-Build-Run projects change model profiles, workflow features, and CLAUDE.md integration. It does NOT re-initialize or overwrite project state.

---

## Step 1: Detect Project State

Check if `.planning/config.json` exists.

**If `.planning/config.json` does NOT exist:**
Display:
```
No Plan-Build-Run project found in this directory.

$pbr-setup is for reconfiguring existing projects.
To start a new project, run: $pbr-begin

$pbr-begin includes everything $pbr-setup used to do, plus deep requirements gathering and roadmap creation.
```
Stop. Do not proceed further.

**If `.planning/config.json` exists:**
- Read `.planning/config.json`
- Display the current settings summary:
  ```
  Current configuration:
  - Model profile: {derived from models block — balanced/quality/budget or custom}
  - Depth: {depth}
  - Mode: {mode}
  - Auto-continue: {features.auto_continue}
  - TDD mode: {features.tdd_mode}
  - Git branching: {git.branching}
  ```
- Proceed to Step 2.

---

## Step 2: Model Selection

Use AskUserQuestion:
  question: "Which model profile should agents use?"
  header: "Models"
  options:
    - label: "Balanced (Recommended)"
      description: "Sonnet for most agents, Haiku for synthesizer. Good quality/cost tradeoff."
    - label: "Quality"
      description: "Opus for executor and planner, Sonnet for others. Best results, highest cost."
    - label: "Budget"
      description: "Haiku for most agents. Fastest and cheapest, but lower quality."
    - label: "Keep current"
      description: "Leave model settings unchanged."

Apply the selected profile to the models block in config.json:
- **Balanced**: executor=sonnet, researcher=sonnet, planner=sonnet, verifier=sonnet, synthesizer=haiku
- **Quality**: executor=opus, researcher=sonnet, planner=opus, verifier=sonnet, synthesizer=sonnet
- **Budget**: executor=haiku, researcher=haiku, planner=sonnet, verifier=haiku, synthesizer=haiku
- **Keep current**: no change to models block

---

## Step 3: Workflow Features

Use AskUserQuestion:
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

Apply selections (others unchanged):
- **Auto-continue**: Set `features.auto_continue: true`
- **TDD mode**: Set `features.tdd_mode: true`
- **Strict gates**: Set `gates.verification: true`, `gates.review: true`, `gates.plan_approval: true`
- **Git branching**: Set `git.branching: "phase"`

---

## Step 4: CLAUDE.md Integration

Check if a `CLAUDE.md` file exists in the project root.

**If it exists**: Read it. If it does NOT already contain a "Plan-Build-Run" section, offer to append the integration block.
**If it does NOT exist**: Offer to create `CLAUDE.md` with the integration block.

Use AskUserQuestion:
  question: "Update CLAUDE.md with Plan-Build-Run integration notes?"
  header: "CLAUDE.md"
  options:
    - label: "Yes"
      description: "Add or update the Plan-Build-Run section in CLAUDE.md"
    - label: "No"
      description: "Skip — leave CLAUDE.md as-is"

If "Yes", append/create:
```markdown
## Plan-Build-Run

This project uses [Plan-Build-Run](https://github.com/SienkLogic/plan-build-run) for structured development.

- Project state: `.planning/STATE.md` (source of truth for current phase and progress)
- Configuration: `.planning/config.json`
- Run `$pbr-status` to see current project state and suggested next action.

**After compaction or context recovery**: Read `.planning/STATE.md` (especially the `## Session Continuity` section) before proceeding with any work. The PreCompact hook writes recovery state there automatically.
```

---

## Step 5: Write Updated Config

**CRITICAL: Write `.planning/config.json` NOW with all changes from Steps 2-3. Do NOT skip this step.**

Write the updated config.json to disk with all applied changes.

---

## Step 6: Verification

Run a quick check:
1. Verify `.planning/config.json` is valid JSON (read it back)
2. Display updated settings summary

Display:
```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► RECONFIGURE COMPLETE ✓                     ║
╚══════════════════════════════════════════════════════════════╝

Updated:
- Model profile: {new profile}
- Features changed: {list or "none"}
- CLAUDE.md: {updated/skipped}

Run $pbr-status to see current project state.
```

---

## Error Handling

- If config.json parse fails: Display the raw content and ask user to fix it manually, then retry
- If config.json write fails: Display the JSON content and ask user to save it manually
