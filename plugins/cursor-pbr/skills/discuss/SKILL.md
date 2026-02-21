---
name: discuss
description: "Talk through a phase before planning. Identifies gray areas and captures your decisions."
argument-hint: "<phase-number>"
---

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► DISCUSSION                                 ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

# /pbr:discuss — Pre-Planning Discussion

You are running the **discuss** skill. Your job is to help the user think through a phase BEFORE planning begins. You identify gray areas where the user's preference matters, ask structured questions, and capture every decision in a CONTEXT.md file that the planner must honor.

This skill runs **inline** (no Task delegation).

---

## Core Principle

**Decisions made here are LOCKED.** The planner cannot override them, even if research suggests a different approach. The planner must implement the locked decision and may note the discrepancy, but must follow the user's choice exactly.

---

## Flow

### Step 1: Parse Phase Number and Check for Existing Plans

Parse `$ARGUMENTS` to get the phase number.

**Validation:**
- Must be a valid phase number (integer or decimal like `3.1`)
- If no argument provided, read STATE.md to get the current phase
- If no current phase and no argument: "Which phase do you want to discuss? Run `/pbr:status` to see available phases."

**Phase directory resolution:**
1. List directories in `.planning/phases/`
2. Find directory matching pattern `{NN}-*` where NN matches the phase number
3. If not found, check ROADMAP.md for the phase name
4. If still not found, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Phase {N} not found.

**To fix:** Run `/pbr:status` to see available phases.
```

**Check for existing plans** (after resolving the phase directory):
1. Check for `PLAN.md` or `PLAN-*.md` files in the phase directory
2. If plan files exist:
   - Warn: "Phase {N} already has plans. Decisions from this discussion won't retroactively change them. Consider re-planning with `/pbr:plan {N}` after."
   - This is a **warning only** — do not block the discussion

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
   - If CONTEXT.md exists, inform the user and use the **context-handling** pattern from `skills/shared/gate-prompts.md`:
     question: "Phase {N} already has a CONTEXT.md from a prior discussion. How should we handle it?"

   Handle responses:
   - "Overwrite": Replace CONTEXT.md entirely with new decisions
   - "Append": Add new decisions below existing ones, marked as "Amendment ({date})"
   - "Cancel": Stop the discussion, keep existing CONTEXT.md

### Step 2.5: Open Exploration Phase

Before jumping into specific gray areas, give the user space to share their mental model unprompted.

1. **Present the phase goal** (from ROADMAP.md) and ask an open question:
   - "Before we get into specifics — what's your mental model of how this phase should work? What excites you about it? What concerns you?"

2. **Follow the user's response with 2-3 domain-aware follow-ups** from `skills/shared/domain-probes.md`:
   - Match what the user mentioned to the relevant domain tables
   - Pick the 2-3 most insightful probes based on what they said, not a generic checklist
   - Ask them conversationally, not as a numbered list

3. **Surface implications** from what the user shared:
   - "You mentioned X — that usually means we'd need Y. Is that part of your vision?"
   - Connect their ideas to concrete technical or design consequences
   - Flag anything that would affect scope, complexity, or dependencies

4. **Let the conversation reveal gray areas naturally.** The user's responses here often surface the real gray areas better than top-down analysis. Carry any themes, concerns, or preferences forward into Step 3.

### Step 3: Identify Gray Areas

Analyze the phase goal, requirements, and what's already built. Identify **3-4 gray areas** where the user's preference matters. Gray areas fall into these categories:

Read `skills/discuss/templates/decision-categories.md` for the category reference table.

**How to identify gray areas:**
1. Look at the phase requirements — where are there multiple valid approaches?
2. Look at prior phase decisions — where might this phase need to diverge?
3. Look at the success criteria — what's ambiguous about how to satisfy them?
4. Consider the user's likely pain points — what would they want a say in?

**Important:** Do NOT identify gray areas that are purely implementation details (e.g., variable naming, file organization). Focus on areas that affect user experience, system behavior, or long-term maintainability.

### Step 4: Present Gray Areas

Present each gray area to the user using the **gray-area-option** pattern from `skills/shared/gate-prompts.md`. For each gray area:

Use AskUserQuestion:
  question: "Gray Area {N}: {Title} — {Why this matters}"
  header: "Decision"
  options: (generate 2-4 concrete options from analysis, each with pros/cons in the description)
    - label: "{Option A}"       description: "{Pros: ..., Cons: ...}"
    - label: "{Option B}"       description: "{Pros: ..., Cons: ...}"
    - ...up to 4 options total, with "Let Claude decide" always as the last option
    - label: "Let Claude decide" description: "Mark as Claude's Discretion"
  multiSelect: false

If more than 3 concrete options exist for a gray area, present only the top 3 plus "Let Claude decide" (max 4 total). Mention the omitted option(s) in the question text.

**Rules for presenting options:**
- Each option must be concrete and implementable
- Include honest pros/cons (don't bias toward one option)
- "Let Claude decide" should always be available as a choice
- If the user gives a preference not in the options, accept it
- If the user says "I don't care", mark it as Claude's Discretion

### Step 5: Deep-Dive Each Selected Area

For each gray area where the user made a decision (not "Let Claude decide"), ask **4 follow-up questions** to fully capture their intent.

**CRITICAL — STOP: Do NOT skip ANY of the 4 follow-up areas below. All 4 MUST be asked for each gray area where the user made a decision.**

**Follow-up question types:**

**CRITICAL — STOP: Do NOT skip this follow-up area.**
1. **Scope boundary**: "Should {feature} also handle {edge case}?"
   Use the **yes-no** pattern — this is a binary decision.

**CRITICAL — STOP: Do NOT skip this follow-up area.**
2. **Quality level**: "How polished should this be?"
   Do NOT use AskUserQuestion — this is freeform. Let the user describe their quality expectations in their own words.

**CRITICAL — STOP: Do NOT skip this follow-up area.**
3. **Integration**: "How should this interact with {existing component}?"
   Do NOT use AskUserQuestion — this is freeform. The answer depends on the specific component and context.

**CRITICAL — STOP: Do NOT skip this follow-up area.**
4. **Future-proofing**: "Should we design this to support {potential future need}, or keep it simple?"
   Use the **yes-no** pattern:
     question: "Design {feature} to support {future need}, or keep it simple for now?"
     options:
       - label: "Future-proof"  description: "Add extensibility for {future need}"
       - label: "Keep simple"   description: "Build only what's needed now"

**Rules for follow-ups:**
- Ask all 4 questions for each area
- Record exact answers (don't paraphrase)
- If the user gives a short answer, capture it as-is
- If the user says "you decide" on a follow-up, move that specific sub-decision to Claude's Discretion

**Completion check:** After all follow-up questions for all gray areas, verify that all 4 follow-up areas produced output for each decided gray area. If any area was missed, go back and ask it before proceeding to Step 6.

### Step 6: Capture Deferred Ideas

During the conversation, the user may mention ideas they want but not in this phase. Track these separately:
- Ideas explicitly deferred by the user ("let's do that later")
- Ideas that are out of scope for this phase based on ROADMAP.md
- Ideas the user considered but rejected

### Step 7: Write CONTEXT.md

Write the CONTEXT.md file to the phase directory:

**Path:** `.planning/phases/{NN}-{phase-name}/CONTEXT.md`

**Content:**

Read `skills/discuss/templates/CONTEXT.md.tmpl` for the template structure.

**Placeholders to fill:**
- `{N}` -- the phase number
- `{ISO date}` -- today's date in ISO format
- `{Decision title}` / `{User's exact choice and reasoning}` -- from Step 4-5 decisions
- `{Idea}` / `{Why deferred}` -- from Step 6 deferred ideas
- `{Area}` / `{What Claude can choose}` -- items marked "Let Claude decide"
- `{2-3 sentences}` -- user's vision summary from the conversation
- `{Concern}` / `{Context}` -- concerns raised during discussion

**Decision Summary generation:** The `## Decision Summary` section at the top of CONTEXT.md is a compact digest (~300 tokens) of all decisions. For each locked decision, write only the title and the user's choice in one phrase (no scope/quality/integration details). List deferred and discretion items as comma-separated titles only. This summary is injected into agent prompts by the plan skill -- keep it concise.

### Step 7.5: Update STATE.md Pointer

Update `.planning/STATE.md`'s `## Accumulated Context` section to add a reference to the new CONTEXT.md:

Add under the `### Decisions` subsection:
```
Phase {N} discussion: .planning/phases/{NN}-{slug}/CONTEXT.md ({count} locked, {count} deferred, {count} discretion)
```

This creates a pointer so `/pbr:resume` and `progress-tracker.js` know that phase-specific decisions exist and where to find them.

### Step 8: Confirm and Route

After writing CONTEXT.md, display branded output:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► DISCUSSION CAPTURED ✓                      ║
╚══════════════════════════════════════════════════════════════╝

**Phase {N}: {name}**

Decisions: {count} locked, {count} deferred, {count} discretion



## ▶ Next Up

**Plan this phase** — your decisions will be honored

`/pbr:plan {N}`

<sub>`/clear` first → fresh context window</sub>



**Also available:**
- `/pbr:status` — see project status
- `/pbr:explore` — explore ideas further


```

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
- Use the **context-handling** pattern from `skills/shared/gate-prompts.md` (same as Step 2)
- If "Overwrite": replace entirely
- If "Append": add new decisions below existing ones, marking them as "Amendment"
- If "Cancel": stop the discussion, keep existing CONTEXT.md

### Phase already has plans
- Handled by Step 1 — warn but do not block
- See Step 1 "Check for existing plans" for the exact warning message

### User wants to discuss multiple phases
- Handle one at a time
- After completing one, suggest: "Want to discuss Phase {N+1} too? Run `/pbr:discuss {N+1}`."

### User disagrees with all options
- Ask: "What would you prefer instead?" — this is freeform text, do NOT use AskUserQuestion.
- Accept any answer and lock it as a decision.
- The options were suggestions, not constraints

### User wants to skip follow-ups
- If user says "that's enough" or "skip the details", respect that
- Write what you have — partial follow-ups are fine
- Mark missing follow-up areas as Claude's Discretion

---

## State Integration

This skill updates STATE.md's Accumulated Context section with a pointer to the phase CONTEXT.md file. It does NOT change the project position (current phase/plan). STATE.md position is updated when `/pbr:plan` runs.

---

## Git Integration

Reference: `skills/shared/commit-planning-docs.md` for the standard commit pattern.

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
