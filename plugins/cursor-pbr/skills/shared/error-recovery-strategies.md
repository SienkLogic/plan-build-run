# Error Recovery Strategies Fragment

Standard recovery patterns for skills and agents when operations fail. Reference `error-reporting.md` for display formats.

## Strategy 1: Retry with Backoff

For transient failures (file locks, network timeouts, tool failures):

1. Wait briefly, then retry the same operation (max 2 retries)
2. If still failing after retries, fall through to Strategy 2

Use for: git operations, file writes blocked by antivirus, API calls.

## Strategy 2: Degrade Gracefully

When a non-critical step fails, skip it and continue:

1. Log a warning using the recoverable error format
2. Note the skipped step in SUMMARY.md `deferred` field
3. Continue with remaining work

Use for: optional validations, dashboard launch, hook logger writes, note/todo updates.

## Strategy 3: Escalate to User

When a critical step fails and no automated fix exists:

1. Display the fatal error format with actionable suggestions
2. Do NOT attempt workarounds that could corrupt state
3. Suggest `/pbr:health` as the first diagnostic step
4. If in an agent context, return the error in the agent's output so the orchestrator can relay it

Use for: STATE.md corruption, missing phase directories, config parse failures, git conflicts.

## Strategy 4: Checkpoint and Abort

When a multi-step operation partially fails:

1. Commit any completed work (don't lose progress)
2. Update STATE.md with accurate status (not the target status)
3. Write a `.continue-here.md` breadcrumb if mid-phase
4. Report what completed and what remains

Use for: build phase with mixed plan results, verification with partial failures.

## Anti-Patterns

- **Never silently swallow errors** in catch blocks — at minimum call `logHook()` with the error message
- **Never retry destructive operations** (deletes, force-pushes, state resets)
- **Never auto-fix by deleting user artifacts** — only delete PBR internal state files (.active-skill, .context-tracker, .auto-next)
- **Never continue building after STATE.md write failure** — state integrity is non-negotiable
