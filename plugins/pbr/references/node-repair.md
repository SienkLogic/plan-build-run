# Node Repair System

When a task fails during execution, the executor follows this repair taxonomy:

## RETRY (Attempt 1)

**Trigger**: Task verification fails (test error, lint error, missing artifact).
**Action**: Re-attempt with adjustment based on the error.
**Budget**: 1 retry per task (2 total attempts before escalating).
**What changes**: Fix the specific error, don't restructure.

## DECOMPOSE (Attempt 2)

**Trigger**: Retry failed. Task may be too complex.
**Action**: Split the task into 2-3 sub-tasks and execute them sequentially.
**Budget**: Sub-tasks get 1 attempt each (no recursion).
**What changes**: Break down, don't change approach.

## PRUNE (Skip with justification)

**Trigger**: Decomposed sub-tasks also fail. Task is not critical-path.
**Action**: Skip the task, document in SUMMARY.md deviations (Rule 3).
**Condition**: Only if task is NOT in must_haves. Must-have tasks cannot be pruned.
**What changes**: Remove from execution, add to deferred.

## ESCALATE (Ask user)

**Trigger**: Must-have task failed after retry+decompose, OR task requires decisions outside plan scope.
**Action**: Stop execution. Present the failure with context. Ask user for direction.
**What changes**: Nothing -- user decides next step.

## Budget Summary

- 2 attempts per task (original + 1 retry)
- 1 decompose pass (2-3 sub-tasks, 1 attempt each)
- Then PRUNE or ESCALATE
- Total max attempts before giving up: ~5 per original task

## Executor Integration

The executor reads this reference before execution. For each task:

1. Execute task
2. Verify task (run tests, check artifacts)
3. If verification fails -> RETRY
4. If retry fails -> DECOMPOSE
5. If sub-tasks fail -> PRUNE (if not must-have) or ESCALATE (if must-have)
6. Record repair actions in SUMMARY.md deviations
