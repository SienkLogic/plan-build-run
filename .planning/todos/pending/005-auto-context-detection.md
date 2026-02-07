---
title: Investigate automatic context limit detection and session handoff
status: open
priority: P1
source: dogfood-testing
created: 2026-02-07
---

## Problem

Users hit context limits mid-workflow with no warning. At 71%+ usage the session becomes fragile — one large file read or tool call could trigger compaction and lose important conversation details.

Current mitigations (added in this session):
- Workflow rule telling orchestrator to proactively suggest `/dev:pause`
- Context Budget sections in skill files
- Subagent delegation to keep main context lean

## What's Missing

1. **No programmatic detection**: Claude Code doesn't expose context usage % to hooks or scripts. The LLM can sense it but hooks can't.

2. **No automatic handoff**: Ideally, when context gets critically full, Towline would:
   - Auto-run `/dev:pause` to save state
   - Tell the user to start a new session
   - Or even better: trigger a new session automatically

3. **No per-skill budget estimation**: Before spawning 4 parallel researchers, the orchestrator can't estimate "this will use ~30% of remaining context."

## Possible Approaches

### Near-term (feasible now)
- Add a `Notification` hook event (if Claude Code supports it) to inject context warnings
- Use the `PreCompact` hook to do a more aggressive state save (already partially done)
- Add skill-level heuristics: "if more than 20 tool calls have been made, suggest pause"

### Medium-term (needs Claude Code changes)
- Request a `context_usage_percent` field in hook input data
- Request a `SessionBudgetLow` event type for hooks
- Build a `/dev:handoff` skill that creates a continuation prompt and suggests `/dev:resume`

### Long-term (aspirational)
- Multi-session orchestration: Towline manages a queue of work across sessions
- Automatic session rotation: finish current task, pause, new session, resume
- Context budget allocation: "Phase 3 planning needs ~40% context, you have 55% left — proceed"

## Impact

This is the #1 UX problem with Towline. Context rot is what Towline exists to solve, yet the tool itself can cause context rot in the main session during heavy workflows.
