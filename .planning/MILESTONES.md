# Improvement Milestones

Grouped from 40 todos (016-055) produced by two-pass development guide review (2026-02-10).

## Milestone A: Quick Wins — COMPLETE

| Todo | Description | Status |
|------|-------------|--------|
| 019 | Upgrade synthesizer model haiku → sonnet | Done |
| 034 | Fix hardcoded year "2026" in researcher agent | Done |
| 051 | Fix 5 factual errors in DEVELOPMENT-GUIDE.md | Done |
| 052 | Fix sensitive file regex bug `[^.]*` → `[^.]+` | Done |

## Milestone B: Testing Foundation — COMPLETE

| Todo | Description | Status |
|------|-------------|--------|
| 039 | Add tests for 3 untested hooks (auto-continue, progress-tracker, session-cleanup) | Done |
| 040 | Add CI caching and coverage threshold enforcement | Done |
| 041 | Extract shared test helpers + complex fixture | Done |
| 021 | Block AI co-author lines in commit hook | Done |

## Milestone C: Context Optimization

| Todo | Description | Priority |
|------|-------------|----------|
| 042 | Create PLAN.md template (extract ~100 lines from planner agent) | P1 |
| 043 | Create plan authoring reference (extract ~150 lines from planner) | P1 |
| 016 | Verifier reads SUMMARY frontmatter only | P1 |
| 020 | Context budget tracking PostToolUse hook on Read | P1 |
| 044 | Create subagent coordination reference (8 skills benefit) | P2 |
| 045 | Create state-loading shared fragment (17 skills benefit) | P2 |
| 024 | Block orchestrator from writing artifacts directly | P2 |
| 038 | Plan skill reads dependency SUMMARYs as frontmatter only | P3 |
| 053 | Standardize agent spawning syntax across all skills | P2 |
| 054 | Add Context Budget section validation to plugin validator | P2 |

## Milestone D: State & Workflow Reliability

| Todo | Description | Priority |
|------|-------------|----------|
| 017 | YAML frontmatter for STATE.md (structured parsing) | P1 |
| 018 | Auto-advance autonomous mode (build→review→plan chaining) | P1 |
| 023 | Config JSON schema validation | P2 |
| 022 | Inline auto-fix as default in review skill | P2 |
| 025 | Verification escalation after repeated failures | P2 |
| 029 | File locking for concurrent STATE.md/ROADMAP.md writes | P2 |
| 046 | STATE.md update shared pattern (5 skills duplicate logic) | P2 |
| 037 | Auto-reconcile STATE.md against filesystem on resume | P3 |
| 031 | Verification override mechanism for false positives | P3 |

## Milestone E: Hook Hardening & Session Continuity

| Todo | Description | Priority |
|------|-------------|----------|
| 026 | Subagent output validation PostToolUse hook | P2 |
| 027 | Better PreCompact state preservation | P2 |
| 028 | Executor partial task recovery | P2 |
| 030 | Dangerous command protection PreToolUse hook | P2 |
| 035 | Session cleanup improvements (stale checkpoints, log rotation) | P3 |
| 036 | Session history log in SessionEnd hook | P3 |
| 055 | Document hook statusMessage field and Windows retry patterns | P3 |

## Milestone F: Documentation & Polish

| Todo | Description | Priority |
|------|-------------|----------|
| 032 | Extract stub patterns to reference doc | P3 |
| 033 | Improve general agent (towline-general) | P3 |
| 047 | Create wave execution reference | P3 |
| 048 | Standardize template variable syntax (EJS vs Mustache) | P3 |
| 049 | User-facing verification guide | P3 |
| 050 | Progress display and error reporting shared fragments | P3 |

## Backlog (separate effort)

010-015: GSD gap analyses from prior review — not part of these milestones.

## Stats

- Total todos created: 40 (016-055)
- Completed: 8 (019, 021, 034, 039, 040, 041, 051, 052)
- Remaining: 32
- P1: 8 | P2: 15 | P3: 13
