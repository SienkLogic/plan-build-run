<!-- canonical: ../../pbr/references/checkpoints.md -->
# Checkpoints Reference

How Plan-Build-Run uses checkpoint tasks to pause execution and involve the human.

---

## What Are Checkpoints?

Checkpoints are special task types that cause the executor agent to **stop execution** and return control to the orchestrator (or the human). They exist because some tasks require human judgment, manual action, or verification that cannot be automated.

Checkpoints are defined in plan task XML via the `type` attribute. When the executor encounters a checkpoint task, it follows a specific protocol depending on the checkpoint type.

---

## Checkpoint Types

Plan-Build-Run supports three checkpoint types:

### checkpoint:human-verify

**Purpose**: The executor has completed work, but a human needs to visually inspect or manually test the result before proceeding.

**Executor behavior**:
1. Execute the task's `<action>` steps normally
2. Commit the changes
3. **STOP execution**
4. Return a structured `CHECKPOINT: HUMAN-VERIFY` response containing:
   - What was done (summary of action taken)
   - What to verify (from the task's `<done>` condition)
   - How to verify (instructions derived from `<verify>`)
   - Completed tasks table
   - Remaining tasks list

**Use when**: The result requires subjective judgment (UI looks correct, behavior feels right, output makes sense) that automated verification cannot cover.

**Example scenario**: A template was created and needs visual review in the browser, or an API integration needs manual testing with real credentials.

### checkpoint:decision

**Purpose**: The plan reaches a point where a human decision is needed before the executor can continue. The task is NOT executed — execution pauses before the task starts.

**Executor behavior**:
1. **STOP before executing the task**
2. Return a structured `CHECKPOINT: DECISION` response containing:
   - The decision that needs to be made (from `<action>`)
   - Available options
   - Context to help the human decide
   - Completed tasks table

**Use when**: The plan has a fork point where different approaches are possible and the right choice depends on human preference, business context, or information the planner could not determine.

**Example scenario**: Choosing between two authentication providers, deciding whether to use a specific third-party library or build in-house.

### checkpoint:human-action

**Purpose**: The task requires something the executor cannot do — a manual step that involves the human interacting with external systems, creating accounts, or performing physical actions.

**Executor behavior**:
1. **STOP before executing the task**
2. Return a structured `CHECKPOINT: HUMAN-ACTION` response containing:
   - What the human needs to do (from `<action>`)
   - Step-by-step instructions
   - Prompt to tell the executor when done
   - Completed tasks table

**Use when**: External setup is required — creating API keys, configuring DNS, setting up OAuth applications, or any action that requires credentials or permissions the agent does not have.

**Example scenario**: The human needs to create a Discord application in the Developer Portal and paste the client ID and secret into `.env`.

---

## Checkpoint in Plan Format

Checkpoints are declared in the task's `type` attribute in the plan XML:

```xml
<task id="02-01-T3" type="checkpoint:human-verify" tdd="false">
  <name>Verify OAuth login flow in browser</name>
  <files>...</files>
  <action>...</action>
  <verify>Open browser to localhost:3000/auth/login and complete the flow</verify>
  <done>User can log in via Discord OAuth and see their profile</done>
</task>
```

Valid checkpoint type values:
- `checkpoint:human-verify`
- `checkpoint:decision`
- `checkpoint:human-action`

Non-checkpoint task types use `type="auto"`.

---

## Autonomous vs Non-Autonomous Plans

The plan frontmatter field `autonomous: true|false` indicates whether a plan contains checkpoint tasks:

| Value | Meaning |
|-------|---------|
| `autonomous: true` | No checkpoint tasks. The executor can complete all tasks without human intervention. |
| `autonomous: false` | Contains at least one checkpoint task. Execution will pause at some point. |

The build orchestrator uses this field to determine execution strategy:
- Autonomous plans can be executed in parallel with other autonomous plans in the same wave
- Non-autonomous plans may block the wave while waiting for human input
- The orchestrator tracks checkpoint state in `.checkpoint-manifest.json`

---

## Continuation Protocol

After a checkpoint is resolved (human provides their answer, completes their action, or confirms verification), the orchestrator spawns a **fresh continuation executor** to resume from where the checkpoint paused.

The continuation executor receives:
1. The full plan content
2. A table of completed tasks with their commit hashes
3. The checkpoint resolution (what the human decided or confirmed)
4. The task number to resume from
5. The same project context as the original executor

**Key rules for continuation**:
- The continuation executor does NOT re-execute completed tasks
- It reads the partial SUMMARY.md if one exists
- It verifies prior commits exist via `git log`
- It resumes from the next uncompleted task after the checkpoint

---

## Authentication Gate (Implicit Checkpoint)

The executor also supports an implicit checkpoint for authentication failures. If the executor encounters an authentication error (missing API key, expired token, invalid credentials) during any task, it immediately stops and returns a `CHECKPOINT: AUTH-GATE` response.

This is not declared in the plan — it triggers automatically when an auth error is detected. The response includes:
- Which task was blocked
- What credential is needed
- Where to configure it
- The actual error message

---

## Architectural Deviation (Implicit Checkpoint)

Similarly, if the executor discovers that the plan's approach cannot work (API changed, framework limitation, dependency conflict), it stops with a `CHECKPOINT: ARCHITECTURAL-DEVIATION` response. This follows Deviation Rule 4 from the executor's deviation handling protocol.

---

## Best Practices for Planners

When creating plans that include checkpoints:

1. **Minimize checkpoint tasks** — each one pauses execution and requires human attention
2. **Place checkpoints at natural boundaries** — after a feature is complete, not in the middle of wiring
3. **Group manual actions** — combine related human actions into a single checkpoint rather than multiple stops
4. **Provide clear instructions** — the `<action>` and `<verify>` elements should give the human everything they need
5. **Consider autonomous alternatives** — if a task CAN be verified automatically, prefer `type="auto"` with a robust `<verify>` command
6. **Set `autonomous: false`** in the plan frontmatter when any task is a checkpoint
