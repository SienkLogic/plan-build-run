# Audit: /pbr:continue

## Skill Overview
- Lines: 166 | CRITICAL markers: 0 | STOP markers: 1 (line 7)
- Agents spawned: None directly -- delegates via `Skill()` to other skills
- Hook coverage: None specific to continue. Delegated skills have their own hook coverage.

## Workflow Step Analysis
| Step | Description | Enforcement | Skip Risk | Hook Coverage |
|------|-------------|-------------|-----------|---------------|
| 0 | Display banner | None | Low | None |
| 1 | Read STATE.md | None | Low | None |
| 1-guard | Context budget guard (3 consecutive) | None | Medium | None |
| 2 | Scan priority hierarchy (8 conditions) | None | Medium | None |
| 3 | Execute via Skill() | None | Low | Delegated skill's hooks |
| 4 | Report and chain | None | Low | None |
| 4-chain | Auto-advance re-loop | None | Medium | None |

## Enforcement Gaps

1. **No .active-skill registration.** Continue never writes `.planning/.active-skill`. Since it delegates to other skills, this is less critical -- the delegated skill should write its own. However, during the gap between Steps 1-2 (state analysis) and Step 3 (delegation), there's no active-skill enforcement.
   - **Fix**: Low priority. The window is small and continue doesn't spawn agents directly.

2. **Priority hierarchy (Step 2) has no hook validation.** The 8-condition priority scan is purely prompt-based. If the LLM evaluates conditions incorrectly (e.g., misreads STATE.md format), it could delegate to the wrong skill. There's no hook that validates the continue decision.
   - **Fix**: Consider a lightweight validation script (e.g., `pbr-tools.js next-action`) that determines the correct next action from state files, reducing LLM interpretation error.

3. **Context budget guard relies on `last_command` field in STATE.md.** Lines 69-74 describe fallback detection when `last_command` is missing. The guard could false-negative if neither `.active-skill` nor `last_action` tracks "continue" -- the skill proceeds without warning.
   - **Fix**: Write `last_command: /pbr:continue` to STATE.md or a separate tracking file at the start of the skill.

4. **Auto-advance re-loop (Step 4) has no hard iteration limit.** Line 142: "Continue chaining until a hard stop is reached." Combined with the 3-consecutive guard, this means up to 3 full cycles before any warning. In autonomous mode with auto_advance, this could consume the entire context window.
   - **Fix**: Add a hard limit (e.g., 5 total chains per session) in addition to the 3-consecutive warning.

5. **No CRITICAL markers anywhere.** While continue is a thin routing skill, the delegation decision in Step 3 is consequential -- wrong delegation wastes an entire skill invocation.
   - **Fix**: Add CRITICAL marker to the "determine next action" logic in Step 2.

## User-Facing Workflow Gaps

1. **No preview of what will be executed.** The skill jumps straight from state analysis to delegation. The user sees "Delegating to /pbr:{skill}..." but has no opportunity to confirm before execution begins.
   - **Fix**: In interactive mode, add a confirmation gate before delegation. In autonomous mode, this is by design.

2. **Between-milestones detection (Step 2, condition 8) gives no actionable guidance.** Line 99: "Run `/pbr:milestone new` to start the next milestone." But if the user doesn't know what the next milestone should be, this is a dead end.
   - **Fix**: Suggest `/pbr:discuss` for open-ended exploration of next steps.

3. **Error recovery is undefined.** If the delegated skill fails, continue has no error handling -- the failure bubbles up as-is. There's no mechanism to retry or try an alternative.
   - **Fix**: Add post-delegation error checking. If the delegated skill failed, present options rather than showing the raw error.

## Agent Instruction Gaps

1. **Continue delegates via `Skill()` not `Task()`.** This means the delegated skill runs in the SAME context window, not a fresh one. For long skills like build, this means the continue skill's context (state analysis, priority evaluation) competes with the build skill's context.
   - **Fix**: This is by design for Skill() invocation. Document the context cost (~500 tokens for continue overhead).

2. **No validation that delegated skill completed successfully.** Step 4 assumes the delegated skill completed and shows a completion banner. If the skill was interrupted or partially completed, the banner is misleading.
   - **Fix**: Check STATE.md after delegation to verify the expected state change occurred.

## Mermaid Workflow Flowchart
```mermaid
flowchart TD
  S0[Step 0: Banner] --> S1[Step 1: Read STATE.md]
  S1 -->|No STATE.md| ERR[ERROR: Run /pbr:begin]
  S1 -->|Found| GUARD{3rd consecutive?}
  GUARD -->|Yes| WARN[WARNING + choice]
  WARN -->|Pause| PAUSE[/pbr:pause]
  WARN -->|Continue| S2
  GUARD -->|No| S2[Step 2: Priority Scan]

  S2 -->|Gaps found| D1[Delegate: /pbr:plan --gaps]
  S2 -->|Checkpoint pending| D2[Delegate: /pbr:build resume]
  S2 -->|Continue-here file| D3[Follow .continue-here.md]
  S2 -->|Incomplete build| D4[Delegate: /pbr:build]
  S2 -->|Unverified| D5[Delegate: /pbr:review]
  S2 -->|Phase complete| D6[Delegate: /pbr:plan N+1]
  S2 -->|Milestone complete| STOP1[STOP: Suggest milestone audit]
  S2 -->|Between milestones| STOP2[STOP: Suggest milestone new]

  D1 & D2 & D3 & D4 & D5 & D6 --> S4[Step 4: Report]
  S4 -->|Auto-advance| S1
  S4 -->|Done| DONE[Show next step]
```

## Priority Fixes
- [ ] P1: Add `pbr-tools.js next-action` script to validate continue decision (reduce LLM interpretation error)
- [ ] P2: Add hard iteration limit (e.g., 5 chains per session) for auto-advance re-loop
- [ ] P2: Add post-delegation validation (check STATE.md for expected changes)
- [ ] P3: Add confirmation gate in interactive mode before delegation
- [ ] P3: Improve between-milestones guidance (suggest /pbr:discuss)
