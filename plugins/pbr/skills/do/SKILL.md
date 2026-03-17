---
name: do
description: "Route freeform text to the right PBR skill automatically."
allowed-tools: Read, Skill, AskUserQuestion
argument-hint: "<freeform description of what you want to do>"
---

**STOP -- DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes ~3,000 tokens. Begin executing Step 1 immediately.**

# /pbr:do -- Freeform Task Router

You are running the **do** skill. Your job is to analyze freeform text from the user and route it to the most appropriate PBR skill. You are a dispatcher, not an executor -- you never do the work yourself.

## Step 0 -- Immediate Output

**Before ANY tool calls**, display this banner:

```
+--------------------------------------------------------------+
|  PLAN-BUILD-RUN > ROUTING                                    |
+--------------------------------------------------------------+
```

Then proceed to Step 1.

## Step 1 -- Validate Input

If `$ARGUMENTS` is empty, ask the user what they want to do via AskUserQuestion:

```
What would you like to do? Describe the task, bug, or idea and I'll route it to the right skill.
```

## Step 2 -- Analyze and Route

### Step 2a -- Gather Context

1. Read `.planning/STATE.md` to get `current_phase`, `status`, `phase_slug`.
2. Check if `.planning/ROADMAP.md` exists (set `hasRoadmap`).
3. Build context object: `{ activePhase: phase_slug, hasRoadmap: boolean }`.

### Step 2b -- Check Config

1. Read `.planning/config.json` if it exists.
2. Check `features.natural_language_routing` (default: `true` if absent).
3. Check `features.adaptive_ceremony` (default: `true` if absent).
4. Check `ceremony_level` (default: `"auto"` if absent).

### Step 2c -- Intent Classification

**When NL routing is enabled** (`features.natural_language_routing` is true or absent):

Score `$ARGUMENTS` against these route keyword groups:

| Route | Keywords | Weight |
|-------|----------|--------|
| debug | bug, error, crash, fix, broken, failing, exception, stacktrace, debug | 1.0 |
| explore | explore, research, investigate, how does, how do, understand, analyze, compare | 1.0 |
| plan-phase | plan, architect, design, migrate, refactor across, redesign, system, new | 0.9 |
| quick | add, create, update, change, rename, remove, write test, implement, feature, refactor | 0.85 |
| note | remember, note, todo, idea, later, don't forget, remind | 1.0 |
| verify-work | review, check, verify, quality, looks right | 0.9 |

**Scoring algorithm:**

1. Count how many keywords from each route appear in the lowercased input.
2. Calculate confidence per route: `(0.5 + 0.5 * (1 - 1/(matches+1))) * weight`.
3. Apply context boosters:
   - If there's a recent error in context: boost debug by +0.3.
   - If an active phase exists: boost plan-phase by +0.1.
   - If no roadmap exists: reduce plan-phase by -0.2.
4. Clamp all scores to 0-1.

**Routing decision:**

- If top confidence >= 0.7: proceed with that route.
- If top confidence < 0.7: present top 2-3 candidates to user via AskUserQuestion. Example:

```
Your request could match several skills:
- /pbr:quick (confidence: 0.65) -- Self-contained task execution
- /pbr:debug (confidence: 0.55) -- Systematic bug investigation
Which would you prefer?
```

**When NL routing is disabled** (`features.natural_language_routing` is false):

Fall back to the original static table -- apply the **first matching** rule:

| If the text describes... | Route to |
|--------------------------|----------|
| A bug, error, crash, failure, or something broken | `/pbr:debug` |
| Exploration, research, comparison, or "how does X work" | `/pbr:explore` |
| A complex task: refactoring, migration, multi-file architecture, system redesign | `/pbr:plan-phase add` |
| A review or quality concern about existing work | `/pbr:verify-work` |
| A note, idea, or "remember to..." | `/pbr:note` |
| A specific, actionable task (add feature, fix typo, update config, write test) | `/pbr:quick` |

### Step 2d -- Risk Classification

**When adaptive ceremony is enabled** (`features.adaptive_ceremony` is true or absent):

Analyze `$ARGUMENTS` for risk signals:

| Risk Level | Signal Keywords |
|------------|----------------|
| HIGH | migrate, redesign, refactor across, architecture, security, database schema, breaking change, entire, across |
| MEDIUM | implement, create, integrate, add feature, new endpoint, write test, add, endpoint, api |
| LOW | typo, rename, config, update, fix typo, comment, readme, docs |

**Scoring:** HIGH signals add +3, MEDIUM signals add +1, LOW signals add -1 each. Additional context factors: 8+ files affected (+3), 3+ files (+1), 3+ subsystems (+5), no existing tests (+1).

**Risk thresholds:** score >= 4 is HIGH, score >= 1 is MEDIUM, otherwise LOW.

**Ceremony override:** If `ceremony_level` is NOT `"auto"`, skip risk classification and use the override directly:

| ceremony_level | Ceremony |
|----------------|----------|
| low | inline |
| medium | lightweight-plan |
| high | full-plan-build-verify |

**Risk-to-ceremony mapping** (when `ceremony_level` is `"auto"`):

| Risk | Ceremony | Dispatch |
|------|----------|----------|
| low | inline | Route to `/pbr:quick` (inline execution, no plan file) |
| medium | lightweight-plan | Route to `/pbr:quick` (with note to create a lightweight plan) |
| high | full-plan-build-verify | Route to `/pbr:plan-phase add` (full plan-build-verify cycle) |

**When adaptive ceremony is disabled** (`features.adaptive_ceremony` is false):

Use the route from Step 2c without ceremony adjustment.

## Step 3 -- Confirm and Dispatch

Display the routing decision:

```
**Input:** {first 80 chars of arguments}
**Intent:** {skill} (confidence: {score})
**Risk:** {low|medium|high} -- {top signal}
**Ceremony:** {inline|lightweight-plan|full-plan-build-verify}
**Routing to:** {chosen skill}
```

Then invoke the chosen skill via the Skill tool, passing `$ARGUMENTS` as the args.

**Special case for `/pbr:plan-phase add`**: When routing to plan, check if `.planning/ROADMAP.md` exists first (via Read). If it doesn't, suggest `/pbr:new-project` instead -- the user needs to set up the project before they can add phases.

## Step 4 -- No Follow-Up

After invoking the skill, your job is done. The dispatched skill handles everything from here (execution, commits, state updates). Do not add any additional output after the Skill tool call.

## Feature Toggles

These config properties in `.planning/config.json` control routing behavior:

- `features.natural_language_routing: false` -- disables smart intent detection, falls back to static keyword table.
- `features.adaptive_ceremony: false` -- disables risk-based ceremony selection, uses intent route directly.
- `ceremony_level: "high"` -- forces full ceremony on everything (overrides risk classification).
- `ceremony_level: "low"` -- forces inline ceremony on everything.
- `ceremony_level: "auto"` -- (default) uses risk classification to determine ceremony.
