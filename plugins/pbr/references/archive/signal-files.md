# Signal Files Reference

Signal files are ephemeral files in `.planning/` that coordinate state between hook scripts
and skills. They are scoped to either the current session or the current phase/plan.

## Session-Scoped Files

All 5 session signals are consolidated in `.planning/.session.json`. Scripts must read and write
`.session.json` via `pbr-tools session get|set|clear` — never read the raw `.session.json` file directly.
The `.session.json` schema is an object with the keys documented below.

| JSON Key | Former File | Written By | Read By | Semantics |
|----------|-------------|------------|---------|-----------|
| `activeSkill` | `.active-skill` | Skills (Write tool) | check-skill-workflow, enforce-pbr-workflow, check-subagent-output, log-subagent, block-skill-self-read | Which skill is active. Written at skill start, cleared at skill end (session-cleanup). |
| `compactCounter` | `.compact-counter` | suggest-compact.js | suggest-compact.js | Write count since last /compact. Resets on SessionStart. |
| `sessionStart` | `.session-start` | progress-tracker.js | local-llm metrics | ISO timestamp of session start. Used for LLM metrics correlation. |
| `activeOperation` | `.active-operation` | context-budget-check.js | context-budget-check.js | Current named operation for budget display. |
| `activePlan` | `.active-plan` | context-budget-check.js | context-budget-check.js | Current plan ID for budget display. |

**Atomic access**: Use `pbr-tools session get|set|clear` for safe reads/writes from hook scripts.

**Lifecycle**: Written during SessionStart (progress-tracker), cleared during SessionEnd (session-cleanup).
Stale sessions (> 60 min) are auto-cleaned by progress-tracker.js on next SessionStart.

## One-Shot Files

These files are NOT consolidated — they use write-once, delete-on-read semantics.

| File | Written By | Read By | Semantics |
|------|------------|---------|-----------|
| `.planning/.auto-next` | auto-continue.js | auto-continue.js (Stop hook) | Next command to run after session stops. Deleted after read. |
| `.planning/.auto-verify` | event-handler.js | event-handler.js (SubagentStop hook) | Trigger auto-verification after agent completes. Deleted after read. |

## Phase-Scoped Files

These files persist across sessions, scoped to a specific phase or plan.

| File Pattern | Written By | Read By | Semantics |
|-------------|------------|---------|-----------|
| `.planning/phases/{id}/.checkpoint-manifest.json` | build skill | validate-task.js, session-cleanup.js | Checkpoint state for a plan in progress. Cleaned up after 24h. |
| `.planning/phases/{id}/.PROGRESS-{taskId}` | executor agent | validate-task.js | Task progress marker for crash recovery. Orphaned files warn on SessionStart. |
