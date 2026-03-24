---
component: assumptions
version: 1
last_updated: 2026-03-24
---

# Load-Bearing Assumption Registry

This document catalogs the assumptions behind every hook and gate in PBR's harness.
Each entry represents a failure mode that the corresponding component was built to prevent.

**Staleness rule**: Entries with Last Validated = `-` have never been stress-tested.
Run `checkAssumptionStaleness()` from `lib/verify.js` to detect stale entries (>90 days).

## Assumptions

| Component | Type | Assumption | Added | Model | Last Validated |
|---|---|---|---|---|---|
| validate-commit.js | PreToolUse | LLM skips conventional commit format without enforcement; produces freeform messages | 2026-01 | Sonnet 3.5 | - |
| check-skill-workflow.js | PreToolUse | LLM writes files outside the active skill's declared scope | 2026-01 | Sonnet 3.5 | - |
| check-summary-gate.js | PreToolUse | LLM writes SUMMARY.md before verification has run, skipping the verify step | 2026-02 | Sonnet 3.5 | - |
| check-doc-sprawl.js | PreToolUse | LLM creates excessive documentation files (README, GUIDE, etc.) beyond what is requested | 2026-02 | Sonnet 3.5 | - |
| check-dangerous-commands.js | PreToolUse | LLM runs destructive git operations (force push, reset --hard, clean -f) without user confirmation | 2026-01 | Sonnet 3.5 | - |
| pre-task-dispatch.js | PreToolUse | LLM spawns build executor agents without a PLAN.md existing first | 2026-02 | Sonnet 3.5 | - |
| block-skill-self-read.js | PreToolUse | LLM reads its own SKILL.md prompt file, wasting context on content already loaded | 2026-03 | Opus 4 | - |
| check-plan-format.js | PostToolUse | LLM omits required frontmatter fields in PLAN.md, SUMMARY.md, and VERIFICATION.md | 2026-01 | Sonnet 3.5 | - |
| check-subagent-output.js | PostToolUse | LLM produces empty or incomplete agent output, failing silently without artifacts | 2026-02 | Sonnet 3.5 | - |
| architecture-guard.js | PostToolUse | LLM creates circular dependencies or violates declared architecture boundaries | 2026-02 | Sonnet 3.5 | - |
| check-state-sync.js | PostToolUse | LLM lets STATE.md drift from ROADMAP.md after builds complete; status becomes stale | 2026-01 | Sonnet 3.5 | - |
| check-roadmap-sync.js | PostToolUse | ROADMAP.md progress table diverges from actual phase completion state | 2026-02 | Sonnet 3.5 | - |
| suggest-compact.js | PostToolUse | LLM ignores context budget warnings and continues reading after thresholds are crossed | 2026-02 | Sonnet 3.5 | - |
| track-context-budget.js | PostToolUse | LLM over-reads files without awareness of cumulative context consumption | 2026-02 | Sonnet 3.5 | - |
| post-bash-triage.js | PostToolUse | LLM ignores test failures in bash output and continues building on broken code | 2026-03 | Opus 4 | - |
| checkBuildExecutorGate | gate | LLM starts building without a PLAN.md file existing in the phase directory | 2026-01 | Sonnet 3.5 | - |
| checkQuickExecutorGate | gate | LLM skips quick task setup (missing .planning/quick/{NNN}-{slug}/ directory or PLAN.md) | 2026-02 | Sonnet 3.5 | - |
| checkPlanExecutorGate | gate | LLM creates plans without completing research first (missing RESEARCH.md when research is enabled) | 2026-02 | Opus 4 | - |
| checkReviewPlannerGate | gate | LLM re-plans a phase without running verification on the previous build first | 2026-03 | Opus 4 | - |
| checkMilestoneCompleteGate | gate | LLM completes milestone while phases are still pending or unverified | 2026-02 | Sonnet 3.5 | - |
| trust-tracker.js | PostToolUse | LLM-reported confidence scores do not correlate with actual verification outcomes | 2026-03 | Opus 4 | - |
| intercept-plan-mode.js | PreToolUse | LLM enters Claude Code plan mode instead of using PBR planning workflow | 2026-03 | Opus 4 | - |
| auto-continue.js | Stop | LLM stops execution mid-workflow when auto-continue signal (.auto-next) is present | 2026-02 | Sonnet 3.5 | - |
| progress-tracker.js | SessionStart | LLM loses project context between sessions; needs STATE.md injection at start | 2026-01 | Sonnet 3.5 | - |
