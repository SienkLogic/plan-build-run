---
name: list-phase-assumptions
description: "Surface Claude's assumptions about a phase before planning begins."
allowed-tools: Read, Glob, Grep, Bash, AskUserQuestion
argument-hint: "<phase-number>"
---

**STOP -- DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes tokens. Begin executing Step 0 immediately.**

## Step 0 -- Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► ASSUMPTIONS                                ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

# /pbr:list-phase-assumptions -- Surface Assumptions Before Planning

**References:** `@references/ui-brand.md`

You are running the **list-phase-assumptions** skill. Your job is to surface Claude's assumptions about a phase BEFORE planning begins. This helps users catch misconceptions early, before they propagate into plans and code.

**Key difference from `/pbr:discuss`:** This skill is ANALYSIS of what Claude thinks, not INTAKE of what the user knows. No file output -- purely conversational to prompt discussion.

This skill runs **inline** (no Task delegation).

---

## Step 1 -- Parse Arguments

Extract the phase number from `$ARGUMENTS`.

**If argument missing:**

```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Phase number required.

Usage: /pbr:list-phase-assumptions <phase-number>
Example: /pbr:list-phase-assumptions 3
```

Exit the skill.

**If argument provided:**

Validate the phase exists in `.planning/ROADMAP.md`:

```bash
grep -i "Phase ${PHASE}" .planning/ROADMAP.md
```

**If phase not found:**

```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Phase {N} not found in roadmap.

Available phases:
{list phases from ROADMAP.md}
```

Exit the skill.

---

## Step 2 -- Load Phase Context

Read the following files to understand what this phase needs to accomplish:

1. **ROADMAP.md** -- Find the phase entry. Extract:
   - Phase name and description
   - Goal / objective
   - Requirements to satisfy
   - Success criteria
   - Dependencies on prior phases

2. **STATE.md** -- Read `.planning/STATE.md` for current project position and accumulated context.

3. **Phase CONTEXT.md** (if exists) -- Check `.planning/phases/{NN}-*/CONTEXT.md` for any prior discussion decisions about this phase. If found, note the locked decisions -- your assumptions should respect them.

4. **Prior SUMMARY.md files** -- Scan `.planning/phases/` for completed phases with lower numbers. Read their frontmatter to understand what has already been built (`provides` field).

---

## Step 3 -- Generate Assumptions

Analyze the phase goal, project context, and what has been built so far. Present your assumptions across **5 categories**. For each assumption, mark a confidence level:

- **Confident** -- clear from the roadmap or prior decisions
- **Likely** -- reasonable inference from context
- **Unclear** -- could go multiple ways

Present the assumptions in this format:

```
## My Assumptions for Phase {N}: {Phase Name}

### Technical Approach
- {What libraries, frameworks, patterns you would use and why}
- {How you would structure the implementation}
- Mark each: [Confident] / [Likely] / [Unclear]

### Implementation Order
- {What to build first, second, third and why}
- {What is foundational vs dependent}
- Mark each: [Confident] / [Likely] / [Unclear]

### Scope Boundaries
**In scope:** {what is included}
**Out of scope:** {what is excluded}
**Ambiguous:** {what could go either way}
- Mark each boundary: [Confident] / [Likely] / [Unclear]

### Risk Areas
- {Where you expect complexity or challenges}
- {Potential issues and why they concern you}
- Mark each: [Confident] / [Likely] / [Unclear]

### Dependencies
**From prior phases:** {what you assume exists from earlier work}
**External:** {third-party libraries, APIs, services needed}
**Feeds into:** {what future phases will need from this}
- Mark each: [Confident] / [Likely] / [Unclear]
```

**Rules for generating assumptions:**

- Be honest about uncertainty -- do not fake confidence
- **Cite evidence**: For each assumption, reference the file path and what you found. Example: "[Confident] Use Express 5.x (per package.json:4 — already installed as ^5.0.0)"
- If CONTEXT.md has locked decisions, your assumptions MUST respect them
- Focus on assumptions that MATTER -- skip obvious ones
- Aim for 3-5 assumptions per category (fewer if the phase is simple)
- State what goes wrong if each assumption is incorrect

**Confidence-based skip gate**: If ALL assumptions across all categories are marked [Confident], the skill can skip the correction step. Display: "All assumptions are high-confidence — proceeding without correction." Still give the user a chance to interrupt if needed.

---

## Step 4 -- Solicit Feedback

After presenting assumptions, use AskUserQuestion to gather feedback:

```
AskUserQuestion:
  question: "Are these assumptions accurate? What did I get right, wrong, or miss?"
  header: "What do you think?"
  options:
    - label: "Looks right"       description: "Assumptions are accurate, proceed"
    - label: "Some corrections"  description: "I have corrections or additions"
    - label: "Way off"           description: "Major misconceptions to address"
```

---

## Step 5 -- Incorporate Corrections

**If "Looks right":**

```
Assumptions validated. Your phase context is well-understood.
```

Proceed to Step 6.

**If "Some corrections" or "Way off":**

Let the user provide their corrections in freeform text. Do NOT use AskUserQuestion for the corrections themselves -- this is a conversation.

After receiving corrections, summarize the updated understanding:

```
Key corrections:
- {correction 1}
- {correction 2}

Updated understanding: {summarize how your view of the phase has changed}
```

Then ask if there is anything else to correct before proceeding to Step 6.

---

## Step 6 -- Offer Next Steps

Present next steps based on what was discussed:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► ASSUMPTIONS REVIEWED                       ║
╚══════════════════════════════════════════════════════════════╝

Phase {N}: {name} -- assumptions {validated / updated}

╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**Discuss this phase** -- capture decisions in CONTEXT.md

`/pbr:discuss {N}`

<sub>`/clear` first -> fresh context window</sub>

**Also available:**
- `/pbr:plan {N}` -- proceed directly to planning
- `/pbr:list-phase-assumptions {N}` -- re-examine with corrections applied
- `/pbr:progress` -- see project status
```

---

## Anti-Patterns

1. **DO NOT** write any files -- this skill is read-only analysis
2. **DO NOT** make decisions for the user -- surface YOUR assumptions for THEIR review
3. **DO NOT** skip confidence markers -- every assumption needs [Confident], [Likely], or [Unclear]
4. **DO NOT** ignore locked decisions from CONTEXT.md -- respect prior discussion outcomes
5. **DO NOT** present obvious assumptions -- focus on areas where misconceptions would be costly
6. **DO NOT** bias assumptions toward a particular approach -- present what you genuinely think
