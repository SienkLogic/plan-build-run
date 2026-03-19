# Phase 18 Discussion Context

> Captured: 2026-03-18

## Decision Summary

**Locked:** Config write locking uses `lockedFileUpdate()` wrapping `atomicWrite()` (full protection). `stateAdvancePlan()` uses single `lockedFileUpdate()` call (keeps `stateUpdate()` unchanged). Session ID sourced from stdin `data.session_id` (always present in `BaseHookInput`).
**Deferred:** Make `stateUpdate()` itself lockable (long-term improvement). `CLAUDE_SESSION_ID` env var (pending upstream feature request).
**Discretion:** Session ID fallback strategy when stdin unavailable.

## Locked Decisions

### 1. Config Write Locking Strategy

**Decision:** Use both `lockedFileUpdate()` AND `atomicWrite()` — full protection.

- Wrap `configWrite()` in `lockedFileUpdate()` to prevent concurrent sessions from clobbering each other
- Use `atomicWrite()` inside the locked update for crash-safe file replacement
- This is the maximum safety approach: lock prevents contention, atomic write prevents corruption

**Scope:** Only `configWrite()` in `lib/config.js` needs modification. The existing `lockedFileUpdate()` and `atomicWrite()` from `lib/core.js` are used as-is.
**Quality:** Production-grade — this protects shared config from concurrent session writes.
**Integration:** `lockedFileUpdate()` already handles retries, stale lock detection, and timeout. No new locking primitives needed.
**Future-proofing:** Keep it simple for now. The existing retry/timeout defaults in `lockedFileUpdate()` are sufficient.

### 2. `stateAdvancePlan()` Atomicity Approach

**Decision:** Single `lockedFileUpdate()` call within `stateAdvancePlan()` itself.

- Read STATE.md once under lock, compute both `plans_complete` and `progress_percent`, write once
- Keep `stateUpdate()` unchanged for other callers — the atomicity is in the compound operation, not the primitive
- This avoids a larger refactor while fixing the specific race condition

**Scope:** Only `stateAdvancePlan()` in `lib/state.js` is modified.
**Quality:** Must handle the case where STATE.md frontmatter format varies (some fields may be missing).
**Integration:** Other callers of `stateUpdate()` are unaffected — they continue using single-field updates.
**Future-proofing:** Keep simple for now. Long-term, making `stateUpdate()` itself lockable is a better approach (see Deferred Ideas).

### 3. Session ID Source & Format

**Decision:** Claude's discretion, informed by research.

**Research findings:**
- `session_id` is ALWAYS available in hook stdin as part of `BaseHookInput` — it's a UUID matching the session JSONL filename
- No `CLAUDE_SESSION_ID` environment variable exists (open feature requests: GitHub issues #25642, #13733, #17188)
- `transcript_path` field also contains the UUID in the filename as a fallback
- Most hooks already extract it with `data.session_id || null`

**Recommended approach:** Use `data.session_id` from stdin (always present). For hooks that don't read stdin (rare edge case), fall back to extracting UUID from `data.transcript_path`. Do NOT generate synthetic IDs — the real session ID is always available.

## Deferred Ideas

| Idea | Why Deferred |
|------|-------------|
| Make `stateUpdate()` itself lockable | Bigger refactor — save for a future "state system v2" phase. Note: this would make ALL state mutations atomic, not just compound operations. |
| `CLAUDE_SESSION_ID` env var | Upstream feature request (GitHub issues #25642, #13733). Once available, hooks could get session ID without parsing stdin. |
| Read-modify-write config merging | Current `configWrite()` replaces the full object. A future improvement could merge partial updates to avoid losing concurrent changes to different keys. |

## Claude's Discretion

| Area | What Claude Can Choose |
|------|----------------------|
| Session ID fallback when stdin unavailable | Use `transcript_path` UUID extraction, `sessionLoad()`, or `null` — whatever is most robust |
| `.active-agent` file format | Mirror `.active-skill` exactly or adapt the format if agent metadata needs differ |
| Log entry format for `session_id` field | String field placement in JSONL entries — consistent with existing patterns |

## User's Vision

The user wants maximum safety for concurrent sessions without over-engineering. The approach is: use existing primitives (`lockedFileUpdate`, `atomicWrite`) to wrap the unprotected writes, and lean on Claude Code's reliable `session_id` in stdin rather than inventing new ID sources. Keep changes surgical — fix the specific race conditions identified in the concurrency audit without redesigning the state system.

## Concerns

| Concern | Context |
|---------|---------|
| Lock contention under high concurrency | `lockedFileUpdate()` has 3 retries with 100ms delay — may need tuning if many sessions compete |
| Backward compatibility | Readers must check session-scoped path first, fall back to global — dual-path reading adds complexity |
