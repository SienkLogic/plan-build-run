---
name: do
description: "Route freeform text to the right PBR skill automatically."
allowed-tools: Read, Skill, AskUserQuestion
argument-hint: "<freeform description of what you want to do>"
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes ~3,000 tokens. Begin executing Step 1 immediately.**

# /pbr:do — Freeform Task Router

You are running the **do** skill. Your job is to analyze freeform text from the user and route it to the most appropriate PBR skill. You are a dispatcher, not an executor — you never do the work yourself.

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► ROUTING                                    ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

## Step 1 — Validate Input

If `$ARGUMENTS` is empty, ask the user what they want to do via AskUserQuestion:
```
What would you like to do? Describe the task, bug, or idea and I'll route it to the right skill.
```

## Step 2 — Analyze and Route

Evaluate `$ARGUMENTS` against these routing criteria. Apply the **first matching** rule:

| If the text describes... | Route to | Why |
|--------------------------|----------|-----|
| A bug, error, crash, failure, or something broken | `/pbr:debug` | Needs systematic investigation |
| Exploration, research, comparison, or "how does X work" | `/pbr:explore` | Open-ended investigation |
| A complex task: refactoring, migration, multi-file architecture, system redesign | `/pbr:plan add` | Needs a full phase with research/plan/build cycle |
| A review or quality concern about existing work | `/pbr:review` | Needs verification against plan |
| A note, idea, or "remember to..." | `/pbr:note` | Capture for later |
| A specific, actionable task (add feature, fix typo, update config, write test) | `/pbr:quick` | Self-contained, single executor |

**Ambiguity handling**: If the text could reasonably match multiple routes, ask the user via AskUserQuestion with the top 2-3 options. For example:

```
"Refactor the authentication system" could be:
- /pbr:plan add — Full planning cycle (recommended for multi-file refactors)
- /pbr:quick — Quick execution (if scope is small and clear)
```

## Step 3 — Confirm and Dispatch

Display the routing decision:

```
**Input:** {first 80 chars of arguments}
**Routing to:** {chosen skill}
**Reason:** {one-line explanation}
```

Then invoke the chosen skill via the Skill tool, passing `$ARGUMENTS` as the args.

**Special case for `/pbr:plan add`**: When routing to plan, check if `.planning/ROADMAP.md` exists first (via Read). If it doesn't, suggest `/pbr:begin` instead — the user needs to set up the project before they can add phases.

## Step 4 — No Follow-Up

After invoking the skill, your job is done. The dispatched skill handles everything from here (execution, commits, state updates). Do not add any additional output after the Skill tool call.
