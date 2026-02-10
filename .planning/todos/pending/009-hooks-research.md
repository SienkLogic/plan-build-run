---
title: "Research Claude Code Hooks for maximum Towline benefit"
status: pending
priority: P1
source: user-request
created: 2026-02-10
---

## Goal

Comprehensively research how to get the most benefit from Claude Code Hooks, with focus on:
- **Context management** — Can hooks reduce context usage or inject only what's needed?
- **Debugging** — How can hooks surface what went wrong during agent execution?
- **Observability** — Full visibility into what happens during Towline workflows
- **Verifiability** — Hooks that confirm artifacts were created, gates passed, etc.
- **Workflow confirmation** — Ensuring skills follow their defined step sequences
- **User experience** — Neat tricks to improve the developer experience

Since Towline is building a better version of GSD, both the developer and user need to see everything that happens so problems can be diagnosed. Hooks may also enable context-saving techniques or UX improvements.

## Research Sources

1. **Claude Code Hooks Mastery**: https://github.com/disler/claude-code-hooks-mastery
   - Study all hook examples and patterns
   - Identify techniques not yet used in Towline
2. **Anthropic Claude Code GitHub repo** — Official hook documentation and examples
3. **Anthropic documentation** — Hook lifecycle events, exit codes, capabilities
4. **Towline's existing hooks** — `plugins/dev/scripts/` (7 hooks currently)

## Current Towline Hooks

| Hook | Event | Purpose |
|------|-------|---------|
| progress-tracker.js | SessionStart | Inject project state |
| check-plan-format.js | PostToolUse (Write/Edit) | Validate PLAN.md/SUMMARY.md |
| check-roadmap-sync.js | PostToolUse (Write/Edit) | Check roadmap consistency |
| validate-commit.js | PreToolUse (Bash) | Enforce commit format |
| context-budget-check.js | PreCompact | Preserve STATE.md |
| auto-continue.js | Stop | Chain next command |
| log-subagent.js | SubagentStart/Stop | Track agent lifecycle |
| session-cleanup.js | SessionEnd | Clean up session state |

## Key Questions

- What hook events exist that Towline isn't using yet?
- Can hooks inject context summaries to reduce what the main orchestrator reads?
- Can hooks enforce skill workflow compliance (e.g., block executor spawn if no PLAN.md)?
- What patterns from claude-code-hooks-mastery apply to Towline's use case?
- Are there hook patterns that could replace or augment current skill gate checks?

## Acceptance Criteria

- [ ] All hook events catalogued with applicability to Towline
- [ ] Specific recommendations with implementation sketches
- [ ] Prioritized list (quick wins vs larger efforts)
- [ ] Comparison with what GSD does with hooks
- [ ] Notes on any limitations or gotchas discovered
