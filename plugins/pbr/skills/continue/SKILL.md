---
name: continue
description: "Execute the next logical step automatically. No prompts, no decisions — just do it."
allowed-tools: Read, Write, Bash, Glob, Grep, Task, Skill, AskUserQuestion
argument-hint: "[--auto]"
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes ~7,600 tokens. Begin executing Step 1 immediately.**

# /pbr:continue — Action-Oriented Resumption

You are running the **continue** skill. Unlike `/pbr:progress` which shows the dashboard and suggests the next action, `/pbr:continue` determines and EXECUTES the next logical step automatically. Stops safely at milestones, checkpoints, errors, and verification gaps.

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
- **At context >= 500k (context_window_tokens >= 500000)**: Read full ROADMAP.md (already required), glob phase frontmatters, read PROJECT.md out-of-scope section. Total additional reads: ~10-30 small frontmatter reads.
- **At context < 500k (context_window_tokens < 500000)**: No change — reads only STATE.md lines 1-20 as before.

---

## Core Principle

**Do, don't ask.** Read STATE.md, determine the next action, and execute it. The user wants hands-off forward progress.

---

## Flow

### Step 1: Read State

Parse `$ARGUMENTS`:
- If `--auto` is present in `$ARGUMENTS`: set `auto_mode = true`. Log: "Auto mode enabled — passing --auto to delegated skills"

| Argument | Meaning |
|----------|---------|
| `--auto` | Pass --auto flag to all delegated skills, increase consecutive chain limit from 6 to 20 |

**CRITICAL — Run init command FIRST before any manual file reads:**

```bash
node plugins/pbr/scripts/pbr-tools.js init continue
```

Store the JSON result as `blob`. This single call replaces multiple file reads with a pre-computed payload containing state, config, routing, drift, and signal file data.

Use blob fields for all downstream state references:
- `blob.state` — STATE.md frontmatter (status, current_phase, plans_complete, last_command, etc.)
- `blob.current_phase.num`, `blob.current_phase.name`, `blob.current_phase.status` — current phase details
- `blob.auto_next` — .auto-next file content (or null)
- `blob.continue_here` — .continue-here file content (or null)
- `blob.active_skill` — .active-skill file content (or null)
- `blob.routing` — suggestNext output with `blob.routing.command` and `blob.routing.reason`
- `blob.drift` — drift detection result (`blob.drift.drift_detected`, `blob.drift.stale_fields`)
- `blob.config.mode`, `blob.config.features`, `blob.config.gates` — config checks

If `blob.error` is set, display the error banner and stop (no project found).

Then read `.planning/ROADMAP.md` to identify the current milestone boundary (initContinue does not include roadmap data):
- Find which `## Milestone:` section contains the current phase
- Determine if the current phase is the **last phase** in that milestone section
- If this is the last phase and it is verified/complete, warn: "This is the final phase of milestone {name}. After verification, run `/pbr:milestone` to complete it."
- If the current phase's `Depends on` references a phase from the **previous** milestone that is not yet complete, warn: "Cross-milestone dependency: Phase {N} depends on Phase {M} from milestone {prev}, which is not yet complete."

#### Lookahead Mode (context >= 500k)

Before proceeding to Step 2, check the configured context window from `blob.config` or:

```bash
pbr-tools config get context_window_tokens
```

If the returned value is **>= 500000**, perform the following lookahead reads before moving to Step 2. If the value is **< 500000** (or the command fails), skip this section entirely and proceed to Step 2 with no changes to behavior.

**Lookahead analysis:**

```bash
pbr-tools roadmap analyze --lookahead
```

Parse the JSON output which includes:
- `parallel_candidates`: array of phase pairs that can run concurrently (display at most 3)
- `dependency_inversions`: array of phases where dependency phase number > current phase number
- `deferred_unblocked`: array of out-of-scope items whose blocking phase is now complete (display at most 2)

Display all findings BEFORE proceeding to Step 2. If no findings exist, display nothing.

If the CLI fails, skip lookahead silently — lookahead is advisory, not blocking.

If `blob.error` is set (STATE.md doesn't exist), display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

No project state found.

**To fix:** Run `/pbr:new-project` first.
```

#### Context Budget Guard

Before proceeding to priority evaluation, check for runaway continue chains:

1. Read `last_command` from `blob.state.last_command`. **If `last_command` is missing, empty, or the field does not exist, skip directly to the fallback detection** — do NOT error or warn.
2. If `blob.state.last_command` equals `/pbr:continue`, this is a chained continue. Check session context for consecutive `/pbr:continue` invocations.
3. **Fallback detection** — if `blob.state.last_command` is not available:
   - Check `blob.active_skill` — if it contains `continue`, treat as a chained continue
   - Check `blob.state.last_action` — if it contains `continue`, treat as a chained continue
   - If neither source is available, assume this is the first invocation (do not warn)
4. **If this is the 6th consecutive `/pbr:continue` in a row** (or 20th if `auto_mode` is true), display:

```
WARNING: Context budget warning: 6 consecutive auto-continues detected.
Recommend running /pbr:pause-work then resuming in a fresh session.
```

Then present the user with a choice:
- **"Continue"** — proceed with the next action
- **"Pause"** — run `/pbr:pause-work` logic to save state and stop

This prevents runaway chains that fill the context window without a human checkpoint.

### Step 2: Scan for Priority Items

Use `blob.routing.command` and `blob.routing.reason` from the init blob to determine the next action. The routing field contains the suggestNext output which implements the full priority hierarchy:

1. **UAT Blockers**: VERIFICATION.md with `status: gaps_found` → Execute `/pbr:plan-phase {N} --gaps`
2. **Checkpoint pending**: `.checkpoint-manifest.json` with pending items → Resume the build
3. **Continue-here file**: `blob.continue_here` is non-null → Follow its next step
4. **Incomplete build**: PLAN.md files without SUMMARY.md → Execute `/pbr:execute-phase {N}`
5. **Unverified phase**: All plans complete, no VERIFICATION.md → Execute `/pbr:verify-work {N}`
6. **Phase complete, more phases exist**: Verification passed → Execute `/pbr:plan-phase {N+1}`
7. **Last phase in current milestone complete**: Verification passed on the last phase of the current milestone's phase range → Stop. Display: "Milestone complete! Run `/pbr:audit-milestone` to verify cross-phase integration, then `/pbr:complete-milestone` to archive."
8. **Between milestones**: Current milestone is marked complete in STATE.md, but more milestones exist or user needs to create the next one → Stop. Display: "Current milestone is complete. Run `/pbr:new-milestone` to start the next milestone, or `/pbr:audit-milestone` if not yet audited."

#### Status-Based Routing (13 valid statuses)

When `blob.routing.command` doesn't match a priority item above, route based on `blob.current_phase.status`:

| Status | Next Action |
|--------|-------------|
| `not_started` | Suggest `/pbr:discuss-phase {N}` or `/pbr:plan-phase {N}` |
| `discussed` | Suggest `/pbr:plan-phase {N}` |
| `ready_to_plan` | Suggest `/pbr:plan-phase {N}` |
| `planning` | Wait for planner to complete, or re-run `/pbr:plan-phase {N}` |
| `planned` | Suggest `/pbr:build {N}` |
| `ready_to_execute` | Suggest `/pbr:build {N}` |
| `building` | Resume build with `/pbr:build {N}` |
| `built` | Read `workflow.validate_phase` from config.json (default: `true`). If true: suggest `/pbr:validate-phase {N}`. If false: suggest `/pbr:review {N}`. **Secondary:** If `workflow.suggest_test_generation` is `true` (default: `true`) AND the phase has no `TESTING.md` or test coverage is unknown, also display advisory: "Test coverage not tracked for this phase. Consider `/pbr:test {N}` to generate tests before review." |
| `partial` | Resume build with `/pbr:build {N}` |
| `verified` | Suggest `/pbr:plan-phase {N+1}` or milestone completion |
| `needs_fixes` | Suggest `/pbr:plan-phase {N} --gaps` |
| `complete` | Advance to next phase or milestone completion |
| `skipped` | Advance to next phase |

### Step 3: Execute

Based on the determined action, display the delegation indicator to the user:
```
◐ Delegating to /pbr:{skill} {args}...
```

Then invoke the appropriate skill via the Skill tool. **NEVER read SKILL.md files into your context** — this wastes the main context budget with 500+ lines of instructions. Instead, use the Skill tool which runs the skill in a clean invocation:

| Situation | Action | How |
|-----------|--------|-----|
| Gaps need closure | Plan gap closure | `Skill({ skill: "pbr:plan", args: "{N} --gaps" })` (append `--auto` if `auto_mode`) |
| Build incomplete | Continue build | `Skill({ skill: "pbr:build", args: "{N}" })` (append `--auto` if `auto_mode`) |
| Validate needed (`built` + `workflow.validate_phase: true`) | Run validate-phase | `Skill({ skill: "pbr:validate-phase", args: "{N}" })` (append `--auto` if `auto_mode`) |
| Test generation needed (built + `workflow.suggest_test_generation: true` + no TESTING.md) | Suggest test generation | Display: "Advisory: `/pbr:test {N}` — generate tests before review" (do NOT auto-delegate; leave as user-visible suggestion only) |
| Review needed (validate_phase disabled or already validated) | Run review | `Skill({ skill: "pbr:review", args: "{N}" })` (append `--auto` if `auto_mode`) |
| Next phase needed | Plan next phase | `Skill({ skill: "pbr:plan", args: "{N+1}" })` (append `--auto` if `auto_mode`) |
| Project not started | Plan phase 1 | `Skill({ skill: "pbr:plan", args: "1" })` (append `--auto` if `auto_mode`) |

Where `{N}` is `blob.current_phase.num` determined from the init blob in Step 1.

### Step 4: Report and Chain

After execution completes, display a branded completion:
```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► STEP COMPLETE ✓                            ║
╚══════════════════════════════════════════════════════════════╝

✓ Completed: {what was done}



╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**{Next action description}**

`/pbr:continue` or `{specific command}`


```

**If `blob.config.features.auto_advance` is `true` AND `blob.config.mode` is `autonomous`:**
After the delegated skill completes, immediately re-run Step 1-3 to determine and execute the NEXT action. Continue chaining until a hard stop is reached. This enables hands-free phase cycling: build→review→plan→build→...

---

## Hard Stops

Do NOT auto-continue when:
- `blob.config.mode` is NOT `autonomous` and a gate confirmation is needed
- A checkpoint requires human input (decision, verify, action)
- An error occurred during execution
- The milestone is complete
- Verification found gaps (need user review before advancing)

In these cases, explain why auto-continue stopped and what the user needs to do.

---

Reference: `skills/shared/error-reporting.md` for branded error output patterns.

## Anti-Patterns

1. **DO NOT** ask the user what to do — determine it from state
2. **DO NOT** skip error handling — if something fails, stop and report
3. **DO NOT** continue past checkpoints that need human input
4. **DO NOT** auto-continue into a new milestone — that needs user initiation
5. **DO NOT** modify STATE.md directly — let the delegated skill handle it
