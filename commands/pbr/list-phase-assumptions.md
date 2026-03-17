---
description: "Surface Claude's assumptions about a phase approach before planning"
argument-hint: "[phase]"
allowed-tools:
  - Read
  - Bash
  - Grep
  - Glob
---

<objective>
Analyze a phase and present Claude's assumptions about technical approach, implementation order, scope boundaries, risk areas, and dependencies.

Purpose: Help users see what Claude thinks BEFORE planning begins — enabling course correction early when assumptions are wrong.
Output: Conversational output only (no file creation) — ends with "What do you think?" prompt.
</objective>

<context>
Phase number: $ARGUMENTS (required)

@.planning/STATE.md
@.planning/ROADMAP.md
</context>

<process>
## 1. Validate Phase

```bash
PHASE_INFO=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.cjs roadmap get-phase "$ARGUMENTS")
```

Error if phase not found.

## 2. Gather Context

Read:
- Phase goal and description from ROADMAP.md
- Research files if they exist (`.planning/phases/{NN}-*/RESEARCH.md`)
- Requirements mapped to this phase
- Prior phase decisions from STATE.md

## 3. Surface Assumptions

Present assumptions across five areas:

### Technical Approach
What libraries, patterns, and architecture you'd use.

### Implementation Order
What you'd build first and why.

### Scope Boundaries
What's included vs what you'd deliberately exclude.

### Risk Areas
What could go wrong and what's uncertain.

### Dependencies
What this phase needs from prior phases and what it provides to later ones.

## 4. Invite Feedback

End with: "What do you think? Any of these assumptions wrong?"

Offer next steps:
- `/pbr:discuss-phase {N}` — discuss context before planning
- `/pbr:plan-phase {N}` — proceed to planning
- Correct specific assumptions here
</process>
