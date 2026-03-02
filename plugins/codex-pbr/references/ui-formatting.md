# Plan-Build-Run UI Brand & Formatting Reference

Consistent output formatting for all Plan-Build-Run skills. Every skill that produces user-facing output should follow these patterns.

## Stage Banners

Use for major workflow transitions. Always use `PLAN-BUILD-RUN` prefix.

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► {STAGE NAME}                              ║
╚══════════════════════════════════════════════════════════════╝
```

**Stage names (uppercase):**
- `QUESTIONING`
- `RESEARCHING`
- `DEFINING REQUIREMENTS`
- `CREATING ROADMAP`
- `PLANNING PHASE {N}`
- `EXECUTING WAVE {N}`
- `VERIFYING`
- `PHASE {N} COMPLETE ✓`
- `MILESTONE COMPLETE`
- `SCANNING CODEBASE`
- `DEBUGGING`

---

## Invocation Banners

**Every skill MUST display a branded banner as its very first output, BEFORE any file reads, state loading, or processing.** This is the user's immediate confirmation that their command was received.

Format:
```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► {SKILL NAME}                              ║
╚══════════════════════════════════════════════════════════════╝
```

**Skill names (uppercase):**
- `STARTING PROJECT` (begin)
- `PLANNING PHASE {N}` (plan)
- `BUILDING PHASE {N}` (build)
- `REVIEWING PHASE {N}` (review)
- `QUICK TASK` (quick)
- `NEXT STEP` (continue)
- `PROJECT STATUS` (status)
- `RESUMING SESSION` (resume)
- `PAUSING SESSION` (pause)
- `HEALTH CHECK` (health)
- `SETUP` (setup)
- `CONFIGURATION` (config)
- `COMMAND REFERENCE` (help)
- `DISCUSSION` (discuss)
- `EXPLORING` (explore)
- `NOTE` (note)
- `TODO` (todo)
- `DEBUGGING` (debug)
- `SCANNING CODEBASE` (scan)
- `MILESTONE` (milestone)
- `IMPORTING PLAN` (import)

**Rules:**
1. The banner MUST be output BEFORE any tool calls (Read, Glob, Bash, Task)
2. The banner MUST be the first text the user sees
3. After the banner, optionally show a 1-line context summary (e.g., "Phase 3 of 7 — API Layer")
4. Then proceed to Step 1 (state loading, argument parsing, etc.)

---

## Headers

Use these patterns for consistent visual hierarchy within sections:

```
## Phase 3: Authentication        <- Phase-level header
### Plan 01: Database Schema      <- Plan-level header
#### Task 1: Create User Table    <- Task-level header
```

---

## Status Indicators

| Status | Indicator | Usage |
|--------|-----------|-------|
| Complete | `✓` | Completed items, passed checks |
| Failed | `✗` | Failed verification, missing items |
| Pending | `○` | Not yet started |
| In Progress | `◐` | Currently executing |
| Needs Human | `?` | Requires human verification |
| Warning | `⚠` | Warnings, non-blocking issues |
| Blocked | `⊘` | Blocked by dependency |
| Auto-approved | `⚡` | Automatically approved (gates) |

---

## Progress Display

**Phase/milestone level:**
```
Progress: ████████░░ 80%
```

**Phase progress (detailed):**
```
Phase 3 of 5: Authentication
Progress: [████████░░░░░░░░░░░░] 40%
Plans: 2/5 complete
```

**Build progress (wave tracking):**
```
Wave 1: ✓ Plan 01, ✓ Plan 02
Wave 2: ◐ Plan 03 (executing)
Wave 3: ○ Plan 04
```

**Task level:**
```
Tasks: 2/4 complete
```

---

## Spawning Indicators

Show when agents are being launched:

```
◐ Spawning executor...

◐ Spawning 4 executors in parallel...
  → Plan 01: Database Schema
  → Plan 02: Auth Service
  → Plan 03: API Routes
  → Plan 04: Test Suite

✓ Plan 01 complete (2m 14s)
```

For research agents:
```
◐ Spawning 4 researchers in parallel...
  → Stack research
  → Features research
  → Architecture research
  → Pitfalls research

✓ Researcher complete: STACK.md written
```

---

## Checkpoint Boxes

User action required. Use double-line box drawing, 62-character inner width.

```
╔══════════════════════════════════════════════════════════════╗
║  CHECKPOINT: {Type}                                          ║
╚══════════════════════════════════════════════════════════════╝

{Content}

→ {ACTION PROMPT}
```

**Types:**
- `CHECKPOINT: Verification Required` → `→ Type "approved" or describe issues`
- `CHECKPOINT: Decision Required` → `→ Select: option-a / option-b`
- `CHECKPOINT: Action Required` → `→ Type "done" when complete`

---

## AskUserQuestion Patterns

Structured prompts for user decision points. All gate checks use AskUserQuestion instead of
plain-text "Type approved" prompts. See `skills/shared/gate-prompts.md` for the full
pattern catalog (21 named AskUserQuestion patterns).

### Structure

```
AskUserQuestion:
  question: "{contextual question}"
  header: "{max 12 chars}"
  options:
    - label: "{Option 1}"  description: "{What happens}"
    - label: "{Option 2}"  description: "{What happens}"
  multiSelect: false
```

### Rules

- **Max 4 options** per call. Split into 2-step flow if more are needed.
- **Header max 12 characters.** Single word preferred (e.g., "Approve?", "Confirm", "Scope").
- **multiSelect: false** always. Plan-Build-Run gates require single selection.
- **Handle "Other"**: Users may type freeform text instead of selecting. Skills must handle this gracefully.
- **Orchestrator only**: AskUserQuestion cannot be called from subagents.

### Common Patterns

**Approval gate** (approve-revise-abort):
```
question: "Approve these plans?"
header: "Approve?"
options:
  - label: "Approve"          description: "Proceed with execution"
  - label: "Request changes"  description: "Discuss adjustments before proceeding"
  - label: "Abort"            description: "Cancel this operation"
```

**Simple confirmation** (yes-no):
```
question: "Re-plan this phase with gap context?"
header: "Confirm"
options:
  - label: "Yes"  description: "Create gap-closure plans"
  - label: "No"   description: "Skip re-planning"
```

**Category selection** (settings-category-select):
```
question: "What would you like to configure?"
header: "Configure"
options:
  - label: "Depth"          description: "quick/standard/comprehensive"
  - label: "Model profile"  description: "quality/balanced/budget/adaptive"
  - label: "Features"       description: "Toggle workflow features and gates"
  - label: "Git settings"   description: "branching strategy, commit mode"
```

**Dynamic routing** (action-routing):
```
question: "What would you like to do next?"
header: "Next Step"
options:
  - label: "/pbr:build 3"    description: "Execute phase 3 plans"
  - label: "/pbr:review 2"   description: "Verify phase 2 results"
  - label: "Something else"  description: "Enter a different command"
```

### When NOT to Use

Do not use AskUserQuestion for:
- Freeform text input (symptom descriptions, task descriptions, open questions)
- Socratic discussion (explore, discuss follow-ups)
- Situations with unbounded response space

Use plain conversational prompts for these cases instead.

---

## Next Up Block

Always present at end of major completions (phase complete, milestone complete, project init).

```
╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**{Identifier}: {Name}** — {one-line description}

`{copy-paste command}`

<sub>`/clear` first → fresh context window</sub>
```

**Also available:**
- `/pbr:alternative-1` — description
- `/pbr:alternative-2` — description

**Shorter routing (for minor completions):**
```
What's next?
→ /pbr:plan 4 — plan the next phase
→ /pbr:review 3 — review what was just built
→ /pbr:status — see full project status
```

---

## Error Box

```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

{Error description}

**To fix:** {Resolution steps}
```

---

## Tables

Use tables for structured data:

```markdown
| Phase | Status | Plans | Progress |
|-------|--------|-------|----------|
| 1. Foundation | ✓ Complete | 3/3 | 100% |
| 2. Database | ✓ Complete | 2/2 | 100% |
| 3. Auth | ◐ Building | 1/3 | 33% |
| 4. Frontend | ○ Pending | 0/4 | 0% |
```

---

## Cost/Token Warnings

```
⚠ Budget check: This operation will spawn 4 agents (~400k tokens)
  Estimated: ~20% of 5-hour window
  Continue? [/pbr:config to adjust depth first]
```

---

## Completion Summary Templates

### Phase Complete

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► PHASE {N} COMPLETE ✓                      ║
╚══════════════════════════════════════════════════════════════╝

**Phase {N}: {Name}**

{X} plans executed
Goal verified ✓

╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**Phase {N+1}: {Name}** — {Goal from ROADMAP.md}

/pbr:discuss {N+1} — gather context and clarify approach

<sub>/clear first → fresh context window</sub>

**Also available:**
- /pbr:plan {N+1} — skip discussion, plan directly
- /pbr:review {N} — manual acceptance testing before continuing
```

### Milestone Complete

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► MILESTONE COMPLETE                         ║
╚══════════════════════════════════════════════════════════════╝

**{version}**

{N} phases completed
All phase goals verified ✓

╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**Audit milestone** — verify requirements, cross-phase integration, E2E flows

/pbr:milestone audit

<sub>/clear first → fresh context window</sub>

**Also available:**
- /pbr:review — manual acceptance testing
- /pbr:milestone complete — archive milestone after audit passes
```

### Gaps Found

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► PHASE {N} GAPS FOUND ⚠                    ║
╚══════════════════════════════════════════════════════════════╝

**Phase {N}: {Name}**

Score: {X}/{Y} must-haves verified
Report: .planning/phases/{phase_dir}/VERIFICATION.md

### What's Missing

{Extract gap summaries from VERIFICATION.md}

╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**Plan gap closure** — create additional plans to complete the phase

/pbr:plan {N} --gaps

<sub>/clear first → fresh context window</sub>

**Also available:**
- cat .planning/phases/{phase_dir}/VERIFICATION.md — see full report
- /pbr:review {N} — manual testing before planning
```

---

## Session Banners

Use for session lifecycle transitions (pause/resume):

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► SESSION RESTORED ✓                         ║
╚══════════════════════════════════════════════════════════════╝

Position: Phase {N} — {phase name}, Plan {M}
Paused: {ISO datetime}
Duration: {time since pause}

{Summary of where work left off}
```

Other session banners: `SESSION SAVED ✓` (pause), `RESUMING SESSION` (resume start).

---

## Anti-Patterns

Do NOT:
- Use varying box/banner widths — always 62-character inner width
- Use `━━━` heavy bars or `───` thin dividers for banners/sections — use `╔═╗║╚═╝` boxes
- Mix banner styles (`===`, `---`, `***`) with double-line boxes
- Skip `PLAN-BUILD-RUN ►` prefix in stage banners
- Use random emoji (only for milestone complete, `✓` for phase complete)
- Skip the "Next Up" block after major completions
- Reference non-Plan-Build-Run commands (always use `/pbr:*` commands)
- Use non-Plan-Build-Run branding in banners
