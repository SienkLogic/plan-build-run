# Progress Display Fragment

Standard progress display formats for all skills. Reference `references/ui-formatting.md` for the full brand guide.

## Progress Bar

Always 20 characters wide using `█` (filled) and `░` (empty):

```
Progress: [████████████░░░░░░░░] 60%
```

Calculate: `filled = Math.round(percent / 5)`, `empty = 20 - filled`

## Phase Table

Use when displaying multiple phases (status, milestone skills):

```
| Phase | Name             | Status    | Plans | Progress |
|-------|------------------|-----------|-------|----------|
| 01    | Setup            | ✓ complete | 2/2   | 100%     |
| 02    | Authentication   | ◐ building | 1/3   | 33%      |
| 03    | Dashboard        | ○ pending  | 0/4   | 0%       |
```

## Status Indicators

| Symbol | Meaning | When to use |
|--------|---------|-------------|
| `✓` | Complete | Phase/plan/task finished |
| `✗` | Failed | Verification failed |
| `○` | Pending | Not started |
| `◐` | In Progress | Currently executing |
| `?` | Needs Human | Checkpoint requiring user action |
| `⚠` | Warning | Non-blocking issue |
| `⊘` | Blocked | Waiting on dependency |

## Wave Progress (build skill)

```
Wave 1: ✓ Plan 01, ✓ Plan 02
Wave 2: ◐ Plan 03 (executing)
Wave 3: ○ Plan 04, ○ Plan 05
```

## Compact Status Line

For inline status updates:

```
Phase 3 of 8 (Auth) — building — [████████░░░░░░░░░░░░] 40%
```
