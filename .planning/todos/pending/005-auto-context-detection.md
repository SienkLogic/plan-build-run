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

### Near-term: Task() continuation handoff (RECOMMENDED — feasible now)

**Key insight**: Each Task() agent gets a fresh context window. This is effectively a new session with disk as shared memory. Instead of telling the user to restart, the orchestrator can spawn a continuation agent to finish remaining work.

**Pattern**:
1. Orchestrator detects context is getting heavy (long conversation, many tool calls)
2. Orchestrator writes current progress to STATE.md (what's done, what remains)
3. Orchestrator spawns: `Task({ subagent_type: "dev:towline-general", prompt: "Continue the workflow. Read STATE.md for current position. Remaining steps: ..." })`
4. Continuation agent gets FRESH context, reads everything from disk
5. Continuation agent finishes the work, writes results to disk
6. Orchestrator receives brief summary, reports to user

**Where to add this**:
- All orchestrator skills (begin, build, plan, review) should have a "context escape hatch"
- Workflow rule already tells orchestrator to be proactive — add the Task() handoff as the specific mechanism
- Could formalize as a `/dev:handoff` pattern in the skill instructions

**Why this works**:
- No Claude Code API changes needed
- No new session needed — user stays in same conversation
- Fresh context for the heavy work
- Disk (STATE.md, PLAN.md, SUMMARY.md) is already the shared state protocol
- This is what `/dev:build` already does for executors — just extend the pattern to orchestration itself

### Other approaches (complementary)

**Heuristic detection**:
- Skill instructions: "if more than 20 tool calls or conversation is very long, consider handoff"
- PreCompact hook: aggressive state save (already done)

**Medium-term (needs Claude Code changes)**:
- `context_usage_percent` field in hook input data
- `SessionBudgetLow` event type for hooks

**Long-term (aspirational)**:
- Multi-session orchestration with work queues
- Context budget allocation per skill

## Impact

This is the #1 UX problem with Towline. Context rot is what Towline exists to solve, yet the tool itself can cause context rot in the main session during heavy workflows.
