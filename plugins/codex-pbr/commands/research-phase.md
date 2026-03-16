---
description: "Research how to implement a phase (standalone — usually use /pbr:plan-phase instead)"
argument-hint: "[phase]"
allowed-tools:
  - Read
  - Bash
  - Task
---

<objective>
Research how to implement a phase. Spawns researcher agent with phase context.

**Note:** This is a standalone research command. For most workflows, use `/pbr:plan-phase` which integrates research automatically.

**Use this command when:**
- You want to research without planning yet
- You want to re-research after planning is complete
- You need to investigate before deciding if a phase is feasible
</objective>

<context>
Phase number: $ARGUMENTS (required)

@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<process>
## 1. Validate Phase

```bash
PHASE_INFO=$(node $HOME/.claude/plan-build-run/bin/pbr-tools.cjs roadmap get-phase "$ARGUMENTS")
```

Error if phase not found. Extract phase_number, phase_name, goal.

## 2. Check Existing Research

Look for `.planning/phases/{NN}-*/RESEARCH.md`.
If exists, offer: 1) Update research, 2) View existing, 3) Skip.

## 3. Gather Context

Read phase description, requirements, and prior decisions.

## 4. Spawn Researcher

```
Task({
  subagent_type: "pbr:researcher",
  prompt: "Research implementation approach for Phase {N}: {name}\n\nPhase goal: {goal}\nRequirements: {requirements}\nPrior decisions: {decisions}\n\nWrite to: .planning/phases/{NN}-{slug}/{NN}-RESEARCH.md"
})
```

## 5. Handle Return

- `## RESEARCH COMPLETE`: Display summary, offer `/pbr:plan-phase {N}`
- `## RESEARCH INCONCLUSIVE`: Show what was attempted, offer options
</process>
