---
name: discuss
description: "Talk through a phase before planning. Identifies gray areas and captures your decisions."
allowed-tools: Read, Write, Glob, Grep
argument-hint: "<phase-number>"
---

# /dev:discuss — Pre-Planning Discussion

You are running the **discuss** skill. Your job is to help the user think through a phase BEFORE planning begins. You identify gray areas where the user's preference matters, ask structured questions, and capture every decision in a CONTEXT.md file that the planner must honor.

This skill runs **inline** (no Task delegation).

---

## Core Principle

**Decisions made here are LOCKED.** The planner cannot override them, even if research suggests a different approach. The planner must implement the locked decision and may note the discrepancy, but must follow the user's choice exactly.

---

## Flow

### Step 1: Parse Phase Number

Parse `$ARGUMENTS` to get the phase number.

**Validation:**
- Must be a valid phase number (integer or decimal like `3.1`)
- If no argument provided, read STATE.md to get the current phase
- If no current phase and no argument: "Which phase do you want to discuss? Run `/dev:status` to see available phases."

**Phase directory resolution:**
1. List directories in `.planning/phases/`
2. Find directory matching pattern `{NN}-*` where NN matches the phase number
3. If not found, check ROADMAP.md for the phase name
4. If still not found: "Phase {N} not found. Run `/dev:status` to see available phases."

### Step 2: Load Phase Context

Read the following files to understand what this phase needs to accomplish:

1. **ROADMAP.md** — Find the phase entry. Extract:
   - Phase name and description
   - Goal / objective
   - Requirements to satisfy
   - Success criteria
   - Dependencies on prior phases

2. **Prior SUMMARY.md files** — Scan `.planning/phases/` for phases with lower numbers that have SUMMARY.md files. Read their frontmatter to understand:
   - What's already been built (`provides` field)
   - What technologies are in use (`tech_stack` field)
   - What patterns have been established (`patterns` field)
   - What decisions were already made (`key_decisions` field)

3. **REQUIREMENTS.md** (if exists) — Read project requirements relevant to this phase

4. **CONTEXT.md** (if exists in the phase directory) — Check if a prior discussion already happened
   - If CONTEXT.md exists, inform the user: "Phase {N} already has a CONTEXT.md from a prior discussion. Continue and overwrite, or append new decisions?"
   - Use AskUserQuestion to let the user choose

### Step 3: Identify Gray Areas

Analyze the phase goal, requirements, and what's already built. Identify **3-4 gray areas** where the user's preference matters. Gray areas fall into these categories:

| Category | Example Gray Areas |
|----------|-------------------|
| **UI/UX choices** | Layout approach, component library, responsive strategy, accessibility level |
| **Architecture decisions** | State management approach, API design style, database schema trade-offs |
| **Edge case behavior** | What happens on failure, empty states, concurrent access, rate limiting |
| **Technology selections** | Which library for X, build tool choice, testing framework preference |
| **Feature scope boundaries** | MVP vs full feature, what to include vs defer, depth of implementation |

**How to identify gray areas:**
1. Look at the phase requirements — where are there multiple valid approaches?
2. Look at prior phase decisions — where might this phase need to diverge?
3. Look at the success criteria — what's ambiguous about how to satisfy them?
4. Consider the user's likely pain points — what would they want a say in?

**Important:** Do NOT identify gray areas that are purely implementation details (e.g., variable naming, file organization). Focus on areas that affect user experience, system behavior, or long-term maintainability.

### Step 4: Present Gray Areas

Present each gray area to the user with 2-4 concrete options. Use AskUserQuestion for each.

**Format for each gray area:**

```
Gray Area {N}: {Title}

Context: {Why this matters for the phase}

Options:
1. {Option A} — {Pros: ..., Cons: ...}
2. {Option B} — {Pros: ..., Cons: ...}
3. {Option C} — {Pros: ..., Cons: ...}
4. Let Claude decide (this becomes a "Claude's Discretion" item)
```

**Rules for presenting options:**
- Each option must be concrete and implementable
- Include honest pros/cons (don't bias toward one option)
- "Let Claude decide" should always be available as a choice
- If the user gives a preference not in the options, accept it
- If the user says "I don't care", mark it as Claude's Discretion

### Step 5: Deep-Dive Each Selected Area

For each gray area where the user made a decision (not "Let Claude decide"), ask **4 follow-up questions** to fully capture their intent.

**Follow-up question types:**

1. **Scope boundary**: "Should {feature} also handle {edge case}?"
2. **Quality level**: "How polished should this be? Quick and functional, or production-ready?"
3. **Integration**: "How should this interact with {existing component}?"
4. **Future-proofing**: "Should we design this to support {potential future need}, or keep it simple for now?"

**Rules for follow-ups:**
- Ask all 4 questions for each area
- Use AskUserQuestion for each
- Record exact answers (don't paraphrase)
- If the user gives a short answer, that's fine — capture it as-is
- If the user says "you decide" on a follow-up, move that specific sub-decision to Claude's Discretion

### Step 6: Capture Deferred Ideas

During the conversation, the user may mention ideas they want but not in this phase. Track these separately:
- Ideas explicitly deferred by the user ("let's do that later")
- Ideas that are out of scope for this phase based on ROADMAP.md
- Ideas the user considered but rejected

### Step 7: Write CONTEXT.md

Write the CONTEXT.md file to the phase directory:

**Path:** `.planning/phases/{NN}-{phase-name}/CONTEXT.md`

**Content:**

```markdown
# Phase {N} Context

**Created by:** /dev:discuss {N}
**Date:** {ISO date}

## Decisions (LOCKED -- must implement exactly as specified)

These decisions are NON-NEGOTIABLE during planning. If research suggests a different approach,
the planner must use the locked decision and note the discrepancy in the plan.

- [ ] **{Decision title}** -- {User's exact choice and reasoning}
  - Scope: {Any scope boundaries from follow-ups}
  - Quality: {Quality level from follow-ups}
  - Integration: {Integration notes from follow-ups}
  - Notes: {Any additional context}

- [ ] **{Decision title}** -- {User's exact choice and reasoning}
  ...

## Deferred Ideas (EXCLUDED -- do not plan these)

These ideas were discussed but explicitly excluded from this phase.
They may be addressed in future phases or milestones.

- **{Idea}** -- {Why deferred}
- **{Idea}** -- {Why deferred}

## Claude's Discretion (OPEN -- Claude decides during planning)

These areas were identified as gray areas but the user chose to let Claude decide.
The planner has freedom here but should document their choices.

- **{Area}** -- {What Claude can choose, any constraints mentioned}
- **{Area}** -- {What Claude can choose, any constraints mentioned}

## User's Vision Summary

{2-3 sentences capturing how the user imagines this phase. This should reflect
the user's mental model, not a technical specification. Write in the user's voice
where possible, quoting key phrases they used.}
```

### Step 8: Confirm and Route

After writing CONTEXT.md:
1. Display a summary of what was captured:
   - Number of locked decisions
   - Number of deferred ideas
   - Number of discretion areas
2. Suggest next action: "Run `/dev:plan {N}` to plan this phase. Your decisions will be honored."

---

## Decision Categories Reference

### LOCKED Decisions

These come from:
- User selecting a specific option (not "Let Claude decide")
- User answering follow-up questions with specific preferences
- User volunteering a strong opinion during discussion

**The planner MUST:**
- Implement exactly as the user specified
- Not modify, optimize, or "improve" the decision
- Note in the plan if research suggests a different approach
- Still follow the locked decision regardless

### DEFERRED Ideas

These come from:
- User explicitly saying "not now" or "later"
- Ideas that are out of scope per ROADMAP.md
- User rejecting an option but saying it's a good idea for later

**The planner MUST NOT:**
- Include deferred ideas in the plan
- Sneak deferred ideas in as "nice to have" tasks
- Combine deferred ideas with in-scope work

### CLAUDE'S DISCRETION

These come from:
- User selecting "Let Claude decide"
- User saying "I don't care" or "whatever you think"
- Follow-up questions answered with "you decide"

**The planner MAY:**
- Choose any reasonable approach
- Use research results to inform the choice
- Change their mind during planning if they learn something new
- Must document their choice and rationale in the plan

---

## Edge Cases

### Phase already has CONTEXT.md
- Ask user: "Overwrite or append?" via AskUserQuestion
- If overwrite: replace entirely
- If append: add new decisions below existing ones, marking them as "Amendment"

### Phase already has plans
- Warn: "Phase {N} already has plans. Decisions from this discussion won't retroactively change existing plans. Consider re-planning with `/dev:plan {N}`."
- Still allow the discussion to proceed

### User wants to discuss multiple phases
- Handle one at a time
- After completing one, suggest: "Want to discuss Phase {N+1} too? Run `/dev:discuss {N+1}`."

### User disagrees with all options
- Ask: "What would you prefer instead?" via AskUserQuestion
- Accept any answer and lock it as a decision
- The options were suggestions, not constraints

### User wants to skip follow-ups
- If user says "that's enough" or "skip the details", respect that
- Write what you have — partial follow-ups are fine
- Mark missing follow-up areas as Claude's Discretion

---

## State Integration

This skill does NOT update STATE.md. The discuss step is optional and doesn't change project position. STATE.md is updated when `/dev:plan` runs.

---

## Git Integration

If `planning.commit_docs: true` in config.json:
- Commit CONTEXT.md: `docs(planning): capture phase {N} discussion decisions`

---

## Anti-Patterns

1. **DO NOT** bias the user toward a particular option
2. **DO NOT** skip the follow-up questions (unless the user asks to skip)
3. **DO NOT** paraphrase the user's decisions — capture them verbatim
4. **DO NOT** add your own opinions to LOCKED decisions
5. **DO NOT** mark something as Claude's Discretion unless the user explicitly chose that
6. **DO NOT** include implementation details in CONTEXT.md — it captures WHAT, not HOW
7. **DO NOT** skip the deferred ideas section — this prevents scope creep later
8. **DO NOT** present more than 4 options per gray area — decision fatigue is real
