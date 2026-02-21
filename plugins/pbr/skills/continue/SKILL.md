---
name: continue
description: "Execute the next logical step automatically. No prompts, no decisions — just do it."
allowed-tools: Read, Write, Bash, Glob, Grep, Task
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes ~7,600 tokens. Begin executing Step 1 immediately.**

# /pbr:continue — Action-Oriented Resumption

You are running the **continue** skill. Unlike `/pbr:resume` which shows status and suggests actions, `/pbr:continue` determines and EXECUTES the next logical step automatically.

This skill runs **inline** and may delegate to other skills via Task().

---

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► NEXT STEP                                  ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

## Context Budget

Reference: `skills/shared/context-budget.md` for the universal orchestrator rules.

Additionally for this skill:
- **Minimize** state reads — read only STATE.md lines 1-20 to determine next action
- **Delegate** execution to the appropriate skill via Skill() or Task()

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

If STATE.md doesn't exist, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

No project state found.

**To fix:** Run `/pbr:begin` first.
```

#### Context Budget Guard

Before proceeding to priority evaluation, check for runaway continue chains:

1. Read `last_command` from STATE.md. **If `last_command` is missing, empty, or the field does not exist, skip directly to the fallback detection** — do NOT error or warn.
2. If `last_command` is present and equals `/pbr:continue`, this is a chained continue. Check session context for consecutive `/pbr:continue` invocations.
3. **Fallback detection** — if `last_command` is not available or not present in STATE.md:
   - Check `.planning/.active-skill` file — if it contains `continue`, treat as a chained continue
   - Check STATE.md `last_action` field — if it contains `continue`, treat as a chained continue
   - If neither source is available, assume this is the first invocation (do not warn)
4. **If this is the 3rd consecutive `/pbr:continue` in a row**, display:

```
WARNING: Context budget warning: 3 consecutive auto-continues detected.
Recommend running /pbr:pause then resuming in a fresh session.
```

Then present the user with a choice:
- **"Continue"** — proceed with the next action
- **"Pause"** — run `/pbr:pause` logic to save state and stop

This prevents runaway chains that fill the context window without a human checkpoint.

### Step 2: Scan for Priority Items

Check the resumption priority hierarchy (same as /pbr:resume):

1. **UAT Blockers**: VERIFICATION.md with `status: gaps_found` → Execute `/pbr:plan {N} --gaps`
2. **Checkpoint pending**: `.checkpoint-manifest.json` with pending items → Resume the build
3. **Continue-here file**: `.continue-here.md` exists → Follow its next step
4. **Incomplete build**: PLAN.md files without SUMMARY.md → Execute `/pbr:build {N}`
5. **Unverified phase**: All plans complete, no VERIFICATION.md → Execute `/pbr:review {N}`
6. **Phase complete, more phases exist**: Verification passed → Execute `/pbr:plan {N+1}`
7. **Last phase in current milestone complete**: Verification passed on the last phase of the current milestone's phase range → Stop. Display: "Milestone complete! Run `/pbr:milestone audit` to verify cross-phase integration, then `/pbr:milestone complete` to archive."
8. **Between milestones**: Current milestone is marked complete in STATE.md, but more milestones exist or user needs to create the next one → Stop. Display: "Current milestone is complete. Run `/pbr:milestone new` to start the next milestone, or `/pbr:milestone audit` if not yet audited."

### Step 3: Execute

Based on the determined action, display the delegation indicator to the user:
```
◐ Delegating to /pbr:{skill} {args}...
```

Then invoke the appropriate skill via the Skill tool. **NEVER read SKILL.md files into your context** — this wastes the main context budget with 500+ lines of instructions. Instead, use the Skill tool which runs the skill in a clean invocation:

| Situation | Action | How |
|-----------|--------|-----|
| Gaps need closure | Plan gap closure | `Skill({ skill: "pbr:plan", args: "{N} --gaps" })` |
| Build incomplete | Continue build | `Skill({ skill: "pbr:build", args: "{N}" })` |
| Review needed | Run review | `Skill({ skill: "pbr:review", args: "{N}" })` |
| Next phase needed | Plan next phase | `Skill({ skill: "pbr:plan", args: "{N+1}" })` |
| Project not started | Plan phase 1 | `Skill({ skill: "pbr:plan", args: "1" })` |

Where `{N}` is the current phase number determined from STATE.md in Step 1.

### Step 4: Report and Chain

After execution completes, display a branded completion:
```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► STEP COMPLETE ✓                            ║
╚══════════════════════════════════════════════════════════════╝

✓ Completed: {what was done}



## ▶ Next Up

**{Next action description}**

`/pbr:continue` or `{specific command}`


```

**If `features.auto_advance` is `true` AND `mode` is `autonomous`:**
After the delegated skill completes, immediately re-run Step 1-3 to determine and execute the NEXT action. Continue chaining until a hard stop is reached. This enables hands-free phase cycling: build→review→plan→build→...

---

## Hard Stops

Do NOT auto-continue when:
- `config.mode` is NOT `autonomous` and a gate confirmation is needed
- A checkpoint requires human input (decision, verify, action)
- An error occurred during execution
- The milestone is complete
- Verification found gaps (need user review before advancing)

In these cases, explain why auto-continue stopped and what the user needs to do.

---

## Anti-Patterns

1. **DO NOT** ask the user what to do — determine it from state
2. **DO NOT** skip error handling — if something fails, stop and report
3. **DO NOT** continue past checkpoints that need human input
4. **DO NOT** auto-continue into a new milestone — that needs user initiation
5. **DO NOT** modify STATE.md directly — let the delegated skill handle it
