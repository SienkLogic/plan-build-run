---
name: continue
description: "Execute the next logical step automatically. No prompts, no decisions — just do it."
allowed-tools: Read, Write, Bash, Glob, Grep, Task
---

# /dev:continue — Action-Oriented Resumption

You are running the **continue** skill. Unlike `/dev:resume` which shows status and suggests actions, `/dev:continue` determines and EXECUTES the next logical step automatically.

This skill runs **inline** and may delegate to other skills via Task().

---

## Core Principle

**Do, don't ask.** Read STATE.md, determine the next action, and execute it. The user wants hands-off forward progress.

---

## Flow

### Step 1: Read State

Read `.planning/STATE.md` and determine current position:
- Current phase number and name
- Current plan progress
- Phase status (planning, building, reviewing, complete)

If STATE.md doesn't exist: "No project state found. Run `/dev:begin` first."

### Step 2: Scan for Priority Items

Check the resumption priority hierarchy (same as /dev:resume):

1. **UAT Blockers**: VERIFICATION.md with `status: gaps_found` → Execute `/dev:plan {N} --gaps`
2. **Checkpoint pending**: `.checkpoint-manifest.json` with pending items → Resume the build
3. **Continue-here file**: `.continue-here.md` exists → Follow its next step
4. **Incomplete build**: PLAN.md files without SUMMARY.md → Execute `/dev:build {N}`
5. **Unverified phase**: All plans complete, no VERIFICATION.md → Execute `/dev:review {N}`
6. **Phase complete, more phases exist**: Verification passed → Execute `/dev:plan {N+1}`
7. **All phases complete**: Verification passed on final phase, no more phases in ROADMAP.md → Stop. Display: "All phases are complete. Run `/dev:milestone audit` to verify cross-phase integration, or `/dev:milestone complete` to archive this milestone."

### Step 3: Execute

Based on the determined action:

| Situation | Action | How |
|-----------|--------|-----|
| Gaps need closure | Plan gap closure | Read the plan skill instructions from `skills/plan/SKILL.md` and execute the `--gaps` flow |
| Build incomplete | Continue build | Read the build skill instructions from `skills/build/SKILL.md` and execute |
| Review needed | Run review | Read the review skill instructions from `skills/review/SKILL.md` and execute |
| Next phase needed | Plan next phase | Read the plan skill instructions from `skills/plan/SKILL.md` and execute |
| Project not started | Plan phase 1 | Read the plan skill instructions and execute for phase 1 |

### Step 4: Report

After execution completes, display a brief summary:
```
✓ Completed: {what was done}
  Next: {suggested next action or "Run /dev:continue again"}
```

---

## Hard Stops

Do NOT auto-continue when:
- `config.mode` is NOT `autonomous` and a gate confirmation is needed
- A checkpoint requires human input (decision, verify, action)
- An error occurred during execution
- The milestone is complete

In these cases, explain why auto-continue stopped and what the user needs to do.

---

## Anti-Patterns

1. **DO NOT** ask the user what to do — determine it from state
2. **DO NOT** skip error handling — if something fails, stop and report
3. **DO NOT** continue past checkpoints that need human input
4. **DO NOT** auto-continue into a new milestone — that needs user initiation
5. **DO NOT** modify STATE.md directly — let the delegated skill handle it
