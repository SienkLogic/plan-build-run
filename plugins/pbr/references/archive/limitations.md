# Accepted Limitations

Known constraints in PBR's hook and CLI architecture. Each section explains
the limitation, why it exists, and the recommended workaround.

---

## PostToolUse Hooks Are Warn-Only

**Limitation**: PostToolUse hooks fire AFTER the tool has already executed. They
can return `{ additionalContext: "..." }` to surface warnings, but they CANNOT
block or undo the tool call.

**Contrast with PreToolUse**: PreToolUse hooks fire BEFORE execution and can
return `{ decision: "block", reason: "..." }` to prevent the action entirely.

**Why it matters**: Validation that lives in a PostToolUse hook (e.g.,
`check-plan-format.js` warning about malformed frontmatter) is advisory. The
malformed file is already written to disk by the time the warning appears.

**What to do instead**:

- For critical enforcement (phase boundary, dangerous commands, format gates),
  use **PreToolUse** hooks that block before execution.
- Use PostToolUse only for telemetry, context injection, and soft advisories
  where the cost of a bad write is recoverable.
- Example: `check-phase-boundary.js` runs as PreToolUse to block cross-phase
  writes. `post-write-quality.js` runs as PostToolUse because a missed
  formatting warning is not destructive.

---

## CLI Commands in Prompts Are Best-Effort

**Limitation**: When skill or agent prompts instruct the LLM to run CLI
commands (e.g., `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state advance-plan`), the LLM may skip
them under cognitive load. Prompt instructions are suggestions, not guarantees.

**Why it matters**: State updates, progress tracking, and roadmap syncing that
rely on agents calling CLI commands will be missed when the agent's context is
saturated or it encounters deviations.

**What to do instead**:

- For critical state updates, use **hooks that fire automatically**. For
  example, `check-state-sync.js` auto-syncs STATE.md on ROADMAP.md writes
  without any agent cooperation.
- Reserve CLI commands in prompts for actions where skipping is tolerable or
  where hook-level enforcement is impractical.
- Design principle: "Push intelligence into CODE (hooks/scripts), not PROMPTS
  (markdown)."

---

## Hook Execution Order Is Not Guaranteed

**Limitation**: When multiple hooks register on the same Claude Code event
(e.g., two PostToolUse hooks on `Write`), their execution order is undefined.
They may run sequentially in any order, or concurrently.

**Why it matters**: If Hook A writes a file that Hook B reads, the result
depends on which runs first -- producing nondeterministic behavior.

**What to do instead**:

- Design hooks to be **independent**: no hook should depend on another hook
  having already run on the same event.
- Hooks on the same event must not write to the same file. Use append-only
  patterns (`fs.open` with `'a'` flag) for shared log files.
- Each hook must be **idempotent** -- calling it twice with the same input
  produces the same result.
- See `references/hook-ordering.md` for the Known Safe Pairs table and
  conflict-checking procedure when adding new hooks.

---

## Session State Flows via stdin, Not Shared Memory

**Limitation**: Each hook invocation receives session context (`session_id`,
`tool_name`, tool input) as a JSON blob on stdin. There is no persistent
in-process state between hook calls -- every invocation is a fresh Node.js
process.

**Why it matters**: Hooks cannot accumulate state across calls without writing
to disk. Any cross-call coordination requires file I/O (e.g., `.active-skill`
files, mtime comparisons).

**What to do instead**:

- Accept the per-invocation cost of stdin parsing. It is fast (< 1ms) and
  reliable.
- For state that must persist across hook calls, use well-defined files with
  clear ownership (one writer, many readers).
- For session-scoped state, use the `session_id` from stdin to namespace files
  (e.g., `.active-skill-{session_id}`).

---

## Summary Table

| Limitation | Risk | Mitigation |
|-----------|------|------------|
| PostToolUse warn-only | Bad writes not blocked | Use PreToolUse for critical checks |
| CLI in prompts skipped | State updates missed | Use auto-firing hooks instead |
| Hook order undefined | Race conditions | Design hooks to be independent |
| stdin-only session state | No cross-call memory | Use namespaced files for persistence |
