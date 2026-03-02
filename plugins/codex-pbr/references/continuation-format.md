# Continuation Protocol

How to spawn a fresh executor agent to continue from a checkpoint or partial completion.

---

## Why Fresh Agents

When an executor hits a checkpoint, it STOPS and returns. A new, fresh agent must be spawned to continue because:
1. The checkpoint may require user input that changes the execution path
2. Context isolation prevents accumulated state from causing issues
3. Fresh agents have full context budget for remaining work

---

## Lean Continuation State File

Instead of inlining all prior context into the continuation prompt, the build skill writes a compact state file to disk. The continuation executor reads this file + the original PLAN.md, keeping the prompt lean.

### File Location

```
.planning/phases/{NN}-{slug}/.continuation-state.json
```

### Schema

```json
{
  "plan_id": "02-01",
  "completed_tasks": [
    {
      "id": "02-01-T1",
      "commit": "abc1234",
      "files": ["src/auth/discord.ts", "src/auth/types.ts"]
    },
    {
      "id": "02-01-T2",
      "commit": "def5678",
      "files": ["src/middleware/auth.ts"]
    }
  ],
  "checkpoint": {
    "task": "02-01-T3",
    "type": "human-verify",
    "resolution": "passed"
  },
  "resume_at": "02-01-T3"
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `plan_id` | string | The plan being executed |
| `completed_tasks` | array | Tasks completed before checkpoint. Each has `id`, `commit` hash, and `files` changed. |
| `checkpoint` | object | The checkpoint that triggered continuation. `task` = task ID, `type` = checkpoint type, `resolution` = user's response. |
| `resume_at` | string | Task ID to resume execution from |

### How the Build Skill Uses It

**Writing** (when executor hits a checkpoint):
1. Executor returns checkpoint info to the build orchestrator
2. Build orchestrator writes `.continuation-state.json` with completed tasks, checkpoint details, and resume point
3. Build orchestrator prompts user for checkpoint resolution
4. Build orchestrator updates `checkpoint.resolution` with user's response

**Reading** (when spawning continuation executor):
1. Build orchestrator reads `.continuation-state.json` from disk
2. Build orchestrator reads the original PLAN.md from disk
3. Build orchestrator constructs a lean continuation prompt referencing both files
4. Continuation executor reads `.continuation-state.json` itself to verify prior commits

This approach replaces inlining the full completed-tasks table into the prompt, saving significant context budget on plans with many tasks or multiple checkpoints.

---

## Continuation Context Structure

The continuation prompt must include:

### 1. Completed Tasks Table

A table of all tasks completed before the checkpoint, with their commit hashes:

```markdown
| Task ID | Task Name | Commit | Files Changed | Status |
|---------|-----------|--------|---------------|--------|
| 02-01-T1 | Create auth module | abc1234 | src/auth/discord.ts, src/auth/types.ts | complete |
| 02-01-T2 | Add auth middleware | def5678 | src/middleware/auth.ts | complete |
| 02-01-T3 | Wire OAuth callback | — | — | checkpoint |
```

### 2. Resume Task Number

Which task to resume from:
- If the checkpoint task needs to be RE-EXECUTED with user input: resume at the checkpoint task
- If the checkpoint task was completed and the next task is blocked: resume at the NEXT task

### 3. User Response

The user's response to the checkpoint:
- For `decision`: which option they chose
- For `human-verify`: whether they passed or failed each item
- For `human-action`: confirmation that the action was taken

---

## Continuation Prompt Template

```
You are the executor agent. Continue executing a plan from a checkpoint.

<plan>
[Inline the FULL PLAN.md content — all tasks, not just remaining ones]
</plan>

<completed_tasks>
The following tasks have already been completed. DO NOT re-execute them.
Verify their commits exist before proceeding.

| Task ID | Task Name | Commit | Status |
|---------|-----------|--------|--------|
| {id} | {name} | {hash} | complete |
| {id} | {name} | {hash} | complete |
| {id} | {name} | — | checkpoint |
</completed_tasks>

<checkpoint_resolution>
Checkpoint type: {human-verify | decision | human-action | architectural-change}
User response: {the user's response to the checkpoint}

{For decision: "User chose Option {X}: {description}"}
{For human-verify: "User confirmed: {pass/fail per item}"}
{For human-action: "User confirms action completed: {what they did}"}
{For architectural-change: "User approved approach: {new approach}"}
</checkpoint_resolution>

<resume_instructions>
Resume execution at Task {N}.
{If checkpoint task should be re-executed: "Re-execute Task {N} with the user's input."}
{If checkpoint task is done: "Skip Task {N} and continue from Task {N+1}."}
</resume_instructions>

<project_context>
[Same project context as original spawn — config, CONTEXT.md, STATE.md]
</project_context>

<prior_work_this_phase>
[Include all SUMMARY.md files from other completed plans in this phase]
</prior_work_this_phase>

Instructions:
1. Verify completed task commits exist: git log --oneline -n {count}
2. If commits are missing, STOP and return error
3. Resume execution at Task {N}
4. Create atomic commits for each remaining task
5. Write SUMMARY.md when complete (include ALL tasks — completed and newly executed)
6. Run self-check
```

---

## Verification Before Resuming

The continuation agent MUST verify prior work before continuing:

```bash
# Check that expected commits exist
git log --oneline -n {expected_commit_count}

# Check that expected files exist
ls -la {each file from completed tasks}
```

If verification fails:
- STOP immediately
- Report which commits/files are missing
- DO NOT attempt to re-create them (that's the orchestrator's job)

---

## SUMMARY.md for Continued Plans

The final SUMMARY.md must include ALL tasks — both pre-checkpoint and post-checkpoint:

```markdown
## Task Results

### Task 1: {name}
- **Commit**: `{hash}` - {message}
- **Status**: complete (pre-checkpoint)

### Task 2: {name}
- **Commit**: `{hash}` - {message}
- **Status**: complete (pre-checkpoint)

### Task 3: {name} (checkpoint: {type})
- **Checkpoint resolution**: {user response}
- **Commit**: `{hash}` - {message}
- **Status**: complete (post-checkpoint)
```

---

## Multiple Checkpoints

If a plan has multiple checkpoint tasks:
- Each checkpoint requires a separate continuation agent spawn
- The completed_tasks table grows with each continuation
- Each continuation verifies ALL prior commits, not just the most recent
