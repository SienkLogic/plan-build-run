---
name: continue
description: "Execute the next logical step automatically. No prompts, no decisions — just do it."
allowed-tools: Read, Write, Bash, Glob, Grep, Task, Skill
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

Read `.planning/STATE.md` and determine current position:
- Current phase number and name
- Current plan progress
- Phase status (planning, building, reviewing, complete)

Then read `.planning/ROADMAP.md` to identify the current milestone boundary:
- Find which `## Milestone:` section contains the current phase
- Determine if the current phase is the **last phase** in that milestone section
- If this is the last phase and it is verified/complete, warn: "This is the final phase of milestone {name}. After verification, run `/pbr:milestone` to complete it."
- If the current phase's `Depends on` references a phase from the **previous** milestone that is not yet complete, warn: "Cross-milestone dependency: Phase {N} depends on Phase {M} from milestone {prev}, which is not yet complete."

#### Lookahead Mode (context >= 500k)

Before proceeding to Step 2, check the configured context window:

```bash
node scripts/pbr-tools.cjs config get context_window_tokens
```

If the returned value is **>= 500000**, perform the following lookahead reads before moving to Step 2. If the value is **< 500000** (or the command fails), skip this section entirely and proceed to Step 2 with no changes to behavior.

**Lookahead reads:**

1. You have already read full ROADMAP.md (required above). Extract every phase entry:
   - Phase number (NN from slug)
   - Phase slug
   - `Depends on:` list

2. Glob all phase summary and state frontmatters:
   - `Glob({ pattern: ".planning/phases/*/SUMMARY-*.md" })` — read frontmatter only (lines 1-20) for each result
   - `Glob({ pattern: ".planning/phases/*/STATE.md" })` — read frontmatter only (lines 1-10) for each result
   - Build a map: `{ phase_slug -> { status, provides, requires } }`

3. Read `PROJECT.md` section `## Out of Scope` (or `### Out of Scope`) — extract deferred items as a list.

**Lookahead analysis (perform after reads above):**

**A. Parallel phase candidates**

For each pair of phases that are both Pending/Planning status:
- Extract their `Depends on:` sets
- If their dependency sets are **disjoint** (no shared dependency, and neither depends on the other), they are parallel candidates
- Display:
  ```
  ► Parallel opportunity: Phase {A} and Phase {B} have no shared dependencies — they can be planned and built concurrently.
  ```
  Show at most 3 parallel pairs to avoid noise.

**B. Dependency inversion warnings**

For each phase entry in ROADMAP.md, for each item in its `Depends on:` list:
- Extract the phase number of the dependency (parse `NN` from the slug prefix)
- If dependency phase number > current phase number → dependency inversion detected
- Display:
  ```
  ⚠ Dependency inversion: Phase {N} ({slug}) lists Phase {M} ({dep-slug}) as a dependency, but Phase M > Phase N. Check roadmap ordering.
  ```

**C. Deferred item surfacing**

For each item in the PROJECT.md out-of-scope list:
- Check if the item mentions a phase or capability that is now shown as Complete in the phase map
- If so, display:
  ```
  ► Deferred item may be unblocked: "{item}" — the phase it depends on is now complete. Consider adding it to the next milestone.
  ```
  Surface at most 2 items to avoid noise.

Display all findings BEFORE proceeding to Step 2. If no findings exist (no parallel pairs, no inversions, no unblocked deferred items), display nothing — do not add noise when there is nothing to report.

If STATE.md doesn't exist, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

No project state found.

**To fix:** Run `/pbr:new-project` first.
```

#### Context Budget Guard

Before proceeding to priority evaluation, check for runaway continue chains:

1. Read `last_command` from STATE.md. **If `last_command` is missing, empty, or the field does not exist, skip directly to the fallback detection** — do NOT error or warn.
2. If `last_command` is present and equals `/pbr:continue`, this is a chained continue. Check session context for consecutive `/pbr:continue` invocations.
3. **Fallback detection** — if `last_command` is not available or not present in STATE.md:
   - Check `.planning/.active-skill` file — if it contains `continue`, treat as a chained continue
   - Check STATE.md `last_action` field — if it contains `continue`, treat as a chained continue
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

Check the resumption priority hierarchy (same as /pbr:resume-work):

1. **UAT Blockers**: VERIFICATION.md with `status: gaps_found` → Execute `/pbr:plan-phase {N} --gaps`
2. **Checkpoint pending**: `.checkpoint-manifest.json` with pending items → Resume the build
3. **Continue-here file**: `.continue-here.md` exists → Follow its next step
4. **Incomplete build**: PLAN.md files without SUMMARY.md → Execute `/pbr:execute-phase {N}`
5. **Unverified phase**: All plans complete, no VERIFICATION.md → Execute `/pbr:verify-work {N}`
6. **Phase complete, more phases exist**: Verification passed → Execute `/pbr:plan-phase {N+1}`
7. **Last phase in current milestone complete**: Verification passed on the last phase of the current milestone's phase range → Stop. Display: "Milestone complete! Run `/pbr:audit-milestone` to verify cross-phase integration, then `/pbr:complete-milestone` to archive."
8. **Between milestones**: Current milestone is marked complete in STATE.md, but more milestones exist or user needs to create the next one → Stop. Display: "Current milestone is complete. Run `/pbr:new-milestone` to start the next milestone, or `/pbr:audit-milestone` if not yet audited."

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
| Review needed | Run review | `Skill({ skill: "pbr:review", args: "{N}" })` (append `--auto` if `auto_mode`) |
| Next phase needed | Plan next phase | `Skill({ skill: "pbr:plan", args: "{N+1}" })` (append `--auto` if `auto_mode`) |
| Project not started | Plan phase 1 | `Skill({ skill: "pbr:plan", args: "1" })` (append `--auto` if `auto_mode`) |

Where `{N}` is the current phase number determined from STATE.md in Step 1.

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

Reference: `skills/shared/error-reporting.md` for branded error output patterns.

## Anti-Patterns

1. **DO NOT** ask the user what to do — determine it from state
2. **DO NOT** skip error handling — if something fails, stop and report
3. **DO NOT** continue past checkpoints that need human input
4. **DO NOT** auto-continue into a new milestone — that needs user initiation
5. **DO NOT** modify STATE.md directly — let the delegated skill handle it
