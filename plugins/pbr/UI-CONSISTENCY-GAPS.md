# UI Consistency Gaps — Audit Round 2

Created: 2026-02-17
Tracks remaining gaps found after initial UI consistency pass.

## Category 1: Spawning Indicators

| # | Skill | Issue | Status |
|---|-------|-------|--------|
| 1.1 | build | Executor, verifier, inline verifier, mapper spawns ALL missing `◐` | DONE |
| 1.2 | debug | 3 Task() calls (new session, resume, checkpoint) — ALL missing | DONE |
| 1.3 | scan | Parallel mapper spawn — no pre-spawn `◐` indicator | DONE |
| 1.4 | milestone | Audit integration-checker Task() — no indicator | DONE |
| 1.5 | quick | Executor Task() — no indicator | DONE |
| 1.6 | plan | Team mode: 3 planners + synthesizer spawned with no indicators | DONE |
| 1.7 | review | Team mode: 3 verifiers + synthesizer spawned with no indicators | DONE |
| 1.8 | begin | Researchers use wrong format ("Launched" post-spawn vs `◐` pre-spawn) | DONE |
| 1.9 | explore | Mid-conversation research Task() — no indicator | DONE |

## Category 2: Error Boxes

| # | Skill | Issue | Status |
|---|-------|-------|--------|
| 2.1 | import | 5 error paths in Error Handling section all use plain text | DONE |
| 2.2 | resume | "No project" and "empty project" paths use plain text | DONE |
| 2.3 | todo | No error box for write failures | DONE |
| 2.4 | plan | Checker-loop-forever failure has no error box | DONE |

## Category 3: Completion Banners

| # | Skill | Issue | Status |
|---|-------|-------|--------|
| 3.1 | build | References ui-formatting.md templates but never shows banner inline | DONE |
| 3.2 | discuss | No completion banner at all | DONE |
| 3.3 | debug | No banner for resolved case | DONE |
| 3.4 | todo | Plain `✓` lines, no branded banner | DONE |
| 3.5 | review | Verified/milestone paths reference templates instead of showing them | DONE |

## Category 4: Next Up Routing

| # | Skill | Issue | Status |
|---|-------|-------|--------|
| 4.1 | build | No Next Up block anywhere | DONE |
| 4.2 | discuss | Plain text suggestion only | DONE |
| 4.3 | debug | Plain text only | DONE |
| 4.4 | resume | Plain text / bare AskUserQuestion | DONE |
| 4.5 | status | Plain text routing (no branded block) | DONE |
| 4.6 | todo | Plain `→` arrow lines, no branded wrapper | DONE |
| 4.7 | scan | No backticks, no bold ID, no `/clear` note | DONE |
| 4.8 | health | Wrong bold format, no `/clear` note; FAIL case no Next Up | DONE |
| 4.9 | config | Wrong bold format, no `/clear` note | DONE |
| 4.10 | quick | Arrow list format, no bold ID, no `/clear` note | DONE |
| 4.11 | milestone | Audit paths: wrong format; new/gaps/complete: missing entirely | DONE |
| 4.12 | begin | Command not in backticks | DONE |
| 4.13 | explore | No bold primary route, no `/clear` note, no closing separator | DONE |

## Summary

- Total gaps: 31
- Fixed: 31
- Remaining: 0
