# Towline UI Brand & Formatting Reference

Consistent output formatting for all Towline skills. Every skill that produces user-facing output should follow these patterns.

## Stage Banners

Use for major workflow transitions. Always use `TOWLINE` prefix.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TOWLINE ► {STAGE NAME}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
- `MILESTONE COMPLETE 🎉`
- `SCANNING CODEBASE`
- `DEBUGGING`

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

User action required. Use double-line box drawing, 62-character width.

```
╔══════════════════════════════════════════════════════════════╗
║  CHECKPOINT: {Type}                                          ║
╚══════════════════════════════════════════════════════════════╝

{Content}

──────────────────────────────────────────────────────────────
→ {ACTION PROMPT}
──────────────────────────────────────────────────────────────
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
- **multiSelect: false** always. Towline gates require single selection.
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
  - label: "/dev:build 3"    description: "Execute phase 3 plans"
  - label: "/dev:review 2"   description: "Verify phase 2 results"
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
───────────────────────────────────────────────────────────────

## ▶ Next Up

**{Identifier}: {Name}** — {one-line description}

`{copy-paste command}`

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- `/dev:alternative-1` — description
- `/dev:alternative-2` — description

───────────────────────────────────────────────────────────────
```

**Shorter routing (for minor completions):**
```
What's next?
→ /dev:plan 4 — plan the next phase
→ /dev:review 3 — review what was just built
→ /dev:status — see full project status
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
  Continue? [/dev:config to adjust depth first]
```

---

## Completion Summary Templates

### Phase Complete

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TOWLINE ► PHASE {N} COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase {N}: {Name}**

{X} plans executed
Goal verified ✓

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Phase {N+1}: {Name}** — {Goal from ROADMAP.md}

/dev:discuss {N+1} — gather context and clarify approach

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- /dev:plan {N+1} — skip discussion, plan directly
- /dev:review {N} — manual acceptance testing before continuing

───────────────────────────────────────────────────────────────
```

### Milestone Complete

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TOWLINE ► MILESTONE COMPLETE 🎉
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**{version}**

{N} phases completed
All phase goals verified ✓

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Audit milestone** — verify requirements, cross-phase integration, E2E flows

/dev:milestone audit

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- /dev:review — manual acceptance testing
- /dev:milestone complete — skip audit, archive directly

───────────────────────────────────────────────────────────────
```

### Gaps Found

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TOWLINE ► PHASE {N} GAPS FOUND ⚠
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase {N}: {Name}**

Score: {X}/{Y} must-haves verified
Report: .planning/phases/{phase_dir}/VERIFICATION.md

### What's Missing

{Extract gap summaries from VERIFICATION.md}

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Plan gap closure** — create additional plans to complete the phase

/dev:plan {N} --gaps

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- cat .planning/phases/{phase_dir}/VERIFICATION.md — see full report
- /dev:review {N} — manual testing before planning

───────────────────────────────────────────────────────────────
```

---

## Anti-Patterns

Do NOT:
- Use varying box/banner widths
- Mix banner styles (`===`, `---`, `***`) with `━━━` banners
- Skip `TOWLINE ►` prefix in stage banners
- Use random emoji (only `🎉` for milestone complete, `✓` for phase complete)
- Skip the "Next Up" block after major completions
- Reference GSD commands (always use `/dev:*` commands)
- Use `GSD ►` or any GSD branding
