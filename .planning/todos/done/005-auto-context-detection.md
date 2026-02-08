---
title: Investigate automatic context limit detection and session handoff
status: done
priority: P1
source: dogfood-testing
created: 2026-02-07
completed: 2026-02-08
resolution: Substantially addressed by Towline v2 comprehensive review
---

## Problem

Users hit context limits mid-workflow with no warning. At 71%+ usage the session becomes fragile — one large file read or tool call could trigger compaction and lose important conversation details.

## Resolution (v2 Review)

The Towline v2 comprehensive review (commit cd69b09) addressed this through multiple mechanisms:

1. **Lean continuation state file** (continuation-format.md): Instead of inlining full context into continuation prompts, writes compact `.continuation-state.json` to disk. Continuation executors read from disk.

2. **`/dev:continue` skill** (new): Action-oriented resumption that reads STATE.md and executes the next step automatically — no prompts, no decisions.

3. **Auto-continue mechanism** (auto-continue.js + Stop hook): Signal file `.planning/.auto-next` enables command chaining across sessions. One-shot read-and-delete prevents infinite loops.

4. **Checkpoint manifest** (build skill update): `.checkpoint-manifest.json` tracks execution progress for crash recovery. On resume after compaction, read manifest to determine where execution left off.

5. **PreCompact hook** (already existed): Aggressively saves state to STATE.md before lossy context compaction.

6. **Context Budget sections** (all skills): Rules to keep orchestrator lean — delegate to Task(), read frontmatter not full files, never inline agent definitions.

## Remaining Gap

Programmatic context detection (exposing `context_usage_percent` to hooks) requires Claude Code API changes that don't exist yet. This is tracked as a future enhancement, not a blocker.
