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

## Milestone C: Context Optimization — COMPLETE

| Todo | Description | Status |
|------|-------------|--------|
| 042 | Create PLAN.md template (extract ~100 lines from planner agent) | Done |
| 043 | Create plan authoring reference (extract ~150 lines from planner) | Done |
| 016 | Verifier reads SUMMARY frontmatter only | Done |
| 020 | Context budget tracking PostToolUse hook on Read | Done |
| 044 | Create subagent coordination reference (8 skills benefit) | Done |
| 045 | Create state-loading shared fragment (17 skills benefit) | Done |
| 024 | Block orchestrator from writing artifacts directly | Done |
| 038 | Plan skill reads dependency SUMMARYs as frontmatter only | Done |
| 053 | Standardize agent spawning syntax across all skills | Done |
| 054 | Add Context Budget section validation to plugin validator | Done |

## Milestone D: State & Workflow Reliability — COMPLETE

| Todo | Description | Status |
|------|-------------|--------|
| 017 | YAML frontmatter for STATE.md (structured parsing) | Done |
| 018 | Auto-advance autonomous mode (build→review→plan chaining) | Done |
| 023 | Config JSON schema validation | Done |
| 022 | Inline auto-fix as default in review skill | Done |
| 025 | Verification escalation after repeated failures | Done |
| 029 | File locking for concurrent STATE.md/ROADMAP.md writes | Done |
| 046 | STATE.md update shared pattern (5 skills duplicate logic) | Done |
| 037 | Auto-reconcile STATE.md against filesystem on resume | Done |
| 031 | Verification override mechanism for false positives | Done |

## Milestone E: Hook Hardening & Session Continuity — COMPLETE

| Todo | Description | Status |
|------|-------------|--------|
| 026 | Subagent output validation PostToolUse hook | Done |
| 027 | Better PreCompact state preservation | Done |
| 028 | Executor partial task recovery | Done |
| 030 | Dangerous command protection PreToolUse hook | Done |
| 035 | Session cleanup improvements (stale checkpoints, log rotation) | Done |
| 036 | Session history log in SessionEnd hook | Done |
| 055 | Document hook statusMessage field and Windows retry patterns | Done |

## Milestone F: Documentation & Polish — COMPLETE

| Todo | Description | Status |
|------|-------------|--------|
| 032 | Extract stub patterns to reference doc | Done |
| 033 | Improve general agent (towline-general) | Done |
| 047 | Create wave execution reference | Done |
| 048 | Standardize template variable syntax (EJS vs Mustache) | Done |
| 049 | User-facing verification guide | Done |
| 050 | Progress display and error reporting shared fragments | Done |

## Backlog (separate effort)

010-015: GSD gap analyses from prior review — not part of these milestones.

## Stats

- Total todos created: 40 (016-055)
- Completed: 40 (016-055)
- Remaining: 0
- Milestones complete: A, B, C, D, E, F
- Milestones remaining: none — all complete
