# Statusline Bridge File Evaluation

**Date**: 2026-03-18
**Status**: Research (non-binding recommendation)

---

## Problem Statement

How should session context (session_id, active skill, context budget) flow from
Claude Code to PBR hook scripts? Two patterns exist: stdin parsing (PBR's
current approach) and bridge files (GSD's approach). This document evaluates
both and recommends a path forward.

---

## Current Approach: stdin Parsing

Every PBR hook receives a JSON blob on stdin from Claude Code containing
`session_id`, `tool_name`, `tool_input`, and other event-specific fields.

**How it works**: Each hook script reads `process.stdin`, parses the JSON, and
extracts the fields it needs. 28+ hook scripts all follow this pattern.

**Strengths**:
- Zero file I/O for context delivery -- stdin is in-process
- No stale data risk -- every invocation gets fresh context from Claude Code
- No cleanup needed -- stdin is ephemeral
- Simple ownership model -- Claude Code is the sole producer

**Weaknesses**:
- Every hook must independently parse stdin (boilerplate, though `run-hook.js`
  bootstrap mitigates this)
- No persistence between hook calls -- cross-call state requires explicit file
  writes (`.active-skill`, mtime files)
- stdin blob is limited to what Claude Code provides; hooks cannot enrich it
  for downstream hooks

---

## Alternative Approach: Bridge File (GSD Pattern)

GSD's `gsd-statusline.js` writes session state to a file that
`gsd-context-monitor.js` reads on subsequent hook calls.

**How it works**: A Statusline hook writes a JSON file (e.g.,
`.statusline-bridge.json`) with context usage, model info, and task state.
Other hooks read this file instead of tracking state independently.

**Strengths**:
- Richer context available -- can include computed fields (context percentage,
  elapsed time, accumulated warnings) beyond what stdin provides
- Persistent across hook calls -- no need for each hook to re-derive state
- Single writer, many readers -- clean data flow

**Weaknesses**:
- File I/O on every hook call (read) and every statusline update (write)
- Stale data risk -- if the statusline hook fails or lags, readers get outdated
  context
- Cleanup complexity -- file must be removed on session end; orphaned files on
  crash
- Cross-platform path issues -- Windows MSYS path expansion (`/d/Repos/...`)
  can break `${CLAUDE_PLUGIN_ROOT}` references in file paths
- Adds a coupling point -- all hooks now depend on the bridge file's schema

---

## Evaluation Criteria

| Criterion | stdin (PBR) | Bridge File (GSD) |
|-----------|-------------|-------------------|
| **Reliability** | High -- Claude Code always provides stdin | Medium -- depends on statusline hook running first |
| **Performance** | Fast (< 1ms parse) | Slower (file read per hook, ~2-5ms) |
| **Complexity** | Low -- each hook self-contained | Medium -- schema management, cleanup, error handling |
| **Cross-platform** | No issues -- stdin is OS-agnostic | Risk -- Windows path expansion issues known |
| **Richness** | Limited to Claude Code-provided fields | Extensible -- any computed state |
| **Staleness** | None -- always fresh | Possible -- depends on write frequency |

---

## PBR-Specific Considerations

1. **PBR already has 28+ hooks**. Adding a bridge file means 28+ hooks now have
   a file dependency. A single broken write affects the entire hook fleet.

2. **PBR uses session-scoped files already** (`.active-skill-{session_id}`).
   These are narrowly scoped -- one file per concern. A monolithic bridge file
   would centralize risk.

3. **GSD has only 3 hooks**. The bridge pattern works well when few hooks read
   it. At PBR's scale, the coupling cost is higher.

4. **Context budget tracking** is the main use case where cross-call state
   would help. PBR's `track-context-budget.js` already handles this with its
   own file (`context-budget.json`), avoiding the need for a general bridge.

5. **Windows MSYS path issue** is a known PBR pain point. Adding another file
   path dependency increases the surface area for path expansion bugs.

---

## Recommendation

**Keep stdin parsing as the primary context delivery mechanism. Do not adopt the
bridge file pattern.**

**Rationale**:
- PBR's hook count (28+) makes centralized file coupling riskier than in GSD
  (3 hooks).
- stdin is reliable, fast, cross-platform, and requires no cleanup.
- The specific use cases where cross-call state helps (context budget, active
  skill) are already handled by purpose-built files with narrow scope.
- The bridge pattern solves a problem PBR does not have -- GSD needs it because
  its context monitor hook reads from the statusline hook, but PBR's hooks are
  designed to be independent.

**If cross-call state needs grow**, prefer the existing pattern of
single-purpose scoped files (e.g., `context-budget.json`,
`.active-skill-{session_id}`) over a monolithic bridge file. This keeps failure
domains isolated.
