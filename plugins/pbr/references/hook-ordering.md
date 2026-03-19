# Hook Ordering Reference

Claude Code does **not** guarantee execution order between separate hook entries
registered on the same event matcher. This document records the ordering
expectations and safety invariants that PBR hooks rely on.

## PostToolUse Write|Edit Hooks

Two independent hook entries fire on every `Write` or `Edit` tool use:

| Hook Script | Purpose |
|-------------|---------|
| `post-write-dispatch.js` | Validates plan format, roadmap sync, state sync |
| `post-write-quality.js` | Auto-format, type-check, detect console.log |

These hooks may execute in **any order** or even concurrently. They are safe
because they write to **different files** and do not share mutable state:

- `post-write-dispatch` writes to `STATE.md`, `ROADMAP.md`, and logs.
- `post-write-quality` only returns `additionalContext` warnings; it does not
  write files.

## PreToolUse Hooks

PreToolUse hooks match on distinct tool types, so ordering between them is
irrelevant:

| Hook Script | Tool Matcher |
|-------------|-------------|
| `pre-write-dispatch.js` | `Write`, `Edit` |
| `pre-bash-dispatch.js` | `Bash` |

Within each dispatch script, sub-checks run sequentially and results are
collected independently (no early returns).

## Design Rules

1. **No shared mutable state.** Hooks on the same event must not read/write the
   same in-memory variable or the same file without coordination. Use
   append-only patterns (e.g., `hook-logger.js` with `fs.open('a')`) for any
   file that multiple hooks touch.

2. **Idempotency.** Every hook must produce the same result if called twice with
   the same input. This guards against Claude Code retrying a hook or firing it
   redundantly.

3. **Independent error handling.** Each hook wraps its logic in try-catch. One
   hook crashing must not prevent others from running. Dispatch scripts
   (`post-write-dispatch.js`) run all sub-checks and merge results.

4. **Dirty flag protection.** `check-state-sync.js` uses mtime comparison to
   detect external edits to `STATE.md` and `ROADMAP.md`. If another process
   (or the user) modifies these files between hook invocations, the sync hook
   skips the overwrite and logs a `skip-dirty` entry.

## Known Safe Pairs

These hook combinations fire on the same event and have been verified to not
conflict:

| Event | Hook A | Hook B | Why Safe |
|-------|--------|--------|----------|
| PostToolUse Write | `post-write-dispatch` | `post-write-quality` | Write different files |
| PostToolUse Write | `post-write-dispatch` | `suggest-compact` | One writes state, other returns context |
| PostToolUse Read | `track-context-budget` | (sole hook) | No conflict |
| PostToolUse Task | `check-subagent-output` | (sole hook) | No conflict |

## Adding New Hooks

When registering a new hook on an existing event:

1. Check this table for conflicts with existing hooks on the same event.
2. Ensure your hook does not write to files that another hook on the same event
   also writes.
3. If you must share a file, use append-only writes (`fs.open` with `'a'` flag).
4. Add your hook to the "Known Safe Pairs" table above.

## PreToolUse and Session JSONL Logging

**[Todo 016] Investigation result: by design.**

Claude Code's session JSONL (at `~/.claude/projects/*/`) records tool calls, not hook decisions.

- When a PreToolUse hook **allows** (exit 0): the tool runs and a `tool_use` + `tool_result` pair appears in session JSONL. The hook decision itself is NOT separately logged in session JSONL — visible only in `.planning/logs/hooks-*.jsonl`.
- When a PreToolUse hook **blocks** (exit 2): the tool never runs, so no `tool_use` entry appears in session JSONL. The block IS recorded in `.planning/logs/hooks-*.jsonl`.

**Implication for audit analysis:** The `/pbr:audit` behavioral compliance dimensions that rely on session JSONL will not see PreToolUse hook decisions. Use `.planning/logs/hooks-*.jsonl` directly for hook enforcement evidence. The BC-04 dimension (block-skill-self-read enforcement) should be verified from the hooks log, not session JSONL.

**No code change required.** This is consistent with Claude Code's architecture.
