# UI Formatting Reference

Consistent output formatting for all Towline skills.

## Headers

Use these patterns for consistent visual hierarchy:

```
## Phase 3: Authentication        ← Phase-level header
### Plan 01: Database Schema      ← Plan-level header
#### Task 1: Create User Table    ← Task-level header
```

## Status Indicators

| Status | Indicator | Usage |
|--------|-----------|-------|
| Complete | `✓` | Completed items |
| Failed | `✗` | Failed verification items |
| Pending | `○` | Not yet started |
| In Progress | `◐` | Currently executing |
| Needs Human | `?` | Requires human verification |
| Warning | `⚠` | Warnings, non-blocking issues |
| Blocked | `⊘` | Blocked by dependency |

## Progress Display

For phase progress:
```
Phase 3 of 5: Authentication
Progress: [████████░░░░░░░░░░░░] 40%
Plans: 2/5 complete
```

For build progress:
```
Wave 1: ✓ Plan 01, ✓ Plan 02
Wave 2: ◐ Plan 03 (executing)
Wave 3: ○ Plan 04
```

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

## Routing Suggestions

After completing a workflow step, suggest the next action:

```
What's next?
→ /dev:plan 4 — plan the next phase
→ /dev:review 3 — review what was just built
→ /dev:status — see full project status
```

## Error Presentation

```
⚠ Issue found:
  Plan 03-01, Task 2: <verify> element missing
  Hint: Add a verification command to confirm the task worked
```

## Cost/Token Warnings

```
⚠ Budget check: This operation will spawn 4 agents (~400k tokens)
  Estimated: ~20% of 5-hour window
  Continue? [/dev:config to adjust depth first]
```
