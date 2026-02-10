# Todo 009: Hooks Research — Synthesis

> Synthesized: 2026-02-10
> Sources: 009-hooks-mastery-patterns.md, 009-official-hooks-docs.md, 009-towline-hooks-audit.md

---

## Executive Summary

Towline uses **8 of 14** available hook events, **1 of 3** hook handler types (command only), and leverages almost **none** of the JSON decision control capabilities. The research reveals three major opportunity areas:

1. **Workflow Enforcement** — Hooks can prevent the class of bugs where skills skip their workflows (like the `/dev:quick` failure). This is currently handled only by prompt language, which is fragile.
2. **Context Preservation** — The PreCompact hook barely preserves state. After compaction, Claude loses critical context that hooks could inject back automatically.
3. **Observability** — Tool failures aren't logged, workflow milestones aren't tracked, and there's no error recovery path. A single PostToolUseFailure hook would dramatically improve debugging.

---

## Current State vs Available Capabilities

### Hook Events: 8 used / 6 unused

| Event | Towline Status | Opportunity |
|-------|---------------|-------------|
| SessionStart | **Used** (progress-tracker.js) | Enhance: add git context, customize for compact recovery |
| UserPromptSubmit | **Unused** | Medium: inject phase reminders, validate workflow commands |
| PreToolUse | **Used** (validate-commit.js) | Enhance: block sensitive files, add .env protection |
| PermissionRequest | **Unused** | Low: auto-approve read-only operations |
| PostToolUse | **Used** (check-plan-format.js, check-roadmap-sync.js) | Enhance: use blocking `decision: "block"` instead of warnings |
| PostToolUseFailure | **Unused** | **HIGH**: log failures, suggest /dev:debug, error tracking |
| Notification | **Unused** | Low: external alerts (Slack, desktop) |
| SubagentStart | **Used** (log-subagent.js) | Enhance: inject phase context into subagents |
| SubagentStop | **Used** (log-subagent.js) | Enhance: extract task context from transcript |
| Stop | **Used** (auto-continue.js) | Enhance: check `stop_hook_active` (currently ignored) |
| TeammateIdle | **Unused** | Future: agent teams adoption |
| TaskCompleted | **Unused** | Future: task tracking integration |
| PreCompact | **Used** (context-budget-check.js) | **HIGH**: inject ROADMAP summary, phase context, config |
| SessionEnd | **Used** (session-cleanup.js) | Minor: customize by exit reason |

### Hook Types: 1 used / 2 unused

| Type | Description | Towline Status | Use Case |
|------|-------------|---------------|----------|
| **Command** | Shell script, deterministic | **All 8 hooks** | Current approach — fast, predictable |
| **Prompt** | Single-turn LLM yes/no | **Unused** | Stop hook: "Are all tasks complete?" |
| **Agent** | Multi-turn subagent with tools | **Unused** | Complex verification (overkill for now) |

### JSON Decision Control: Barely used

| Capability | Available In | Towline Usage |
|-----------|-------------|---------------|
| `additionalContext` injection | PreToolUse, PostToolUse, SessionStart, SubagentStart | Only progress-tracker (top-level, not hookSpecificOutput) |
| `permissionDecision` (allow/deny/ask) | PreToolUse | Not used (validate-commit uses exit 2) |
| `decision: "block"` (post-action feedback) | PostToolUse, Stop, SubagentStop | Not used |
| `updatedInput` (modify tool input) | PreToolUse, PermissionRequest | Not used |
| `statusMessage` (custom spinner) | All command hooks | Not used |
| `async: true` (background execution) | All command hooks | Not used |

---

## Prioritized Recommendations

### Tier 1: Quick Wins (15-45 min each, high value)

#### 1. Block sensitive files in validate-commit.js
**Effort**: 15 min | **Value**: High (safety)
**Current**: Warns on `.env`, credentials but allows commit (exit 0)
**Change**: Exit 2 (block) when sensitive files detected
**Why**: This is a one-line change with immediate safety value. The warn-only behavior is a known gap.

#### 2. Add git context to progress-tracker.js (SessionStart)
**Effort**: 15 min | **Value**: High (context)
**Current**: Injects STATE.md summary only
**Change**: Add `git rev-parse --abbrev-ref HEAD`, `git status --porcelain` count, `git log -5 --oneline`
**Why**: Claude starts every session without knowing the git state. This is 5 lines of code.
**Pattern**: Proven in claude-code-hooks-mastery repo.

#### 3. Add `statusMessage` to all hooks
**Effort**: 20 min | **Value**: Medium (UX)
**Current**: No spinner text — hooks run silently
**Change**: Add `"statusMessage": "Validating commit..."` etc. to hooks.json
**Why**: Users see blank spinner during hook execution. Named spinners improve transparency.

#### 4. Add PostToolUseFailure hook (log-tool-failure.js)
**Effort**: 45 min | **Value**: High (debugging)
**Current**: Tool failures aren't logged anywhere
**Change**: New hook that logs to events.jsonl + suggests `/dev:debug` on Bash failures
**Why**: When executor agents fail, there's no audit trail. This is the single highest-value new hook.

### Tier 2: Medium Effort (1-2 hours each, high value)

#### 5. Enhance PreCompact context injection
**Effort**: 1 hour | **Value**: High (context preservation)
**Current**: Only saves timestamp to STATE.md Session Continuity section
**Change**: Also save ROADMAP summary (phase list, progress %), current plan, config highlights. Customize progress-tracker.js to inject richer context when `source === "compact"`.
**Why**: After compaction, Claude loses critical context. The SessionStart hook already fires after compaction — if we save richer state in PreCompact and load it in SessionStart(compact), recovery is seamless.

#### 6. Make check-plan-format.js blocking
**Effort**: 1 hour | **Value**: High (quality enforcement)
**Current**: Validates PLAN.md/SUMMARY.md structure, outputs warning, exits 0
**Change**: Use `{"decision": "block", "reason": "..."}` to force Claude to fix and retry
**Why**: The "gradual enforcement" pattern from hooks-mastery — let the write happen, then force correction. Better UX than PreToolUse blocking, but still enforces quality.
**Pattern**: Directly from ruff_validator.py in hooks-mastery repo.

#### 7. Add workflow event logging to events.jsonl
**Effort**: 2 hours | **Value**: Medium (observability + dashboard)
**Current**: events.jsonl only logs agent spawn/complete
**Change**: Log phase-start, plan-complete, verification-pass/fail to events.jsonl via existing hooks
**Why**: Dashboard integration needs these events. Analytics need them. Debugging needs them.

### Tier 3: Larger Efforts (4+ hours, medium value)

#### 8. Workflow enforcement via active-skill tracking
**Effort**: 4 hours | **Value**: High (prevents /dev:quick-class bugs)
**Current**: No way to detect which skill is running from a hook
**Change**: Skills write `.planning/.active-skill` file on start. PreToolUse Write|Edit hook checks if active skill is `/dev:quick` and PLAN.md doesn't exist yet — blocks source code writes.
**Why**: This is the definitive fix for the `/dev:quick` workflow-skip bug. Prompt language is defense-in-depth, but a hook is a hard gate.
**Challenge**: Requires skill changes (write .active-skill), not just hook changes.

#### 9. SubagentStart context injection
**Effort**: 2 hours | **Value**: Medium (agent effectiveness)
**Current**: log-subagent.js only logs, doesn't inject context
**Change**: Use `hookSpecificOutput.additionalContext` to inject current phase, plan, and config into subagents at spawn time
**Why**: Agents start cold — injecting context via hook means skills don't need to repeat it in every spawn prompt, saving main context budget.

#### 10. Phase boundary enforcement
**Effort**: 3 hours | **Value**: Medium (safety)
**Current**: Nothing prevents editing wrong phase's files
**Change**: PreToolUse Write|Edit hook that warns/blocks if editing phase NN files when STATE.md shows phase M is active
**Config**: `safety.enforce_phase_boundaries: true` (opt-in)
**Why**: Prevents accidental cross-phase work, but needs to be opt-in to avoid blocking legitimate multi-phase operations.

### Tier 4: Future / Research

#### 11. Prompt-based Stop hook
**Effort**: 4 hours | **Value**: Speculative
**What**: `type: "prompt"` hook that asks LLM "Are all tasks complete?" before allowing stop
**Why**: More intelligent than `auto_continue` flag, but adds LLM latency/cost to every stop

#### 12. Agent-based verification hooks
**Effort**: 8 hours | **Value**: Speculative
**What**: `type: "agent"` hook that spawns verifier to check must_haves before marking task complete
**Why**: Deep verification at the hook level, but very expensive (agent can take 30+ seconds)

#### 13. PermissionRequest auto-approval
**Effort**: 2 hours | **Value**: Low
**What**: Auto-approve Read/Glob/Grep, require permission for Write/Edit/Bash
**Why**: Only useful if Towline moves to non-dontAsk permission mode

---

## Key Architectural Insights

### 1. Exit Code 2 is the Hard Gate

All three sources agree: exit code 2 from PreToolUse hooks is the fundamental enforcement mechanism. It's deterministic, fast, and doesn't require LLM involvement. Towline should use exit 2 more aggressively for critical violations (sensitive files, missing PLAN.md).

### 2. PostToolUse "Block" is Gradual Enforcement

The hooks-mastery repo demonstrates a powerful pattern: let the write happen (PostToolUse fires after the tool), then return `{"decision": "block"}` to force Claude to fix it. This is better UX than PreToolUse blocking because Claude sees its work, then gets feedback. Towline's check-plan-format.js is perfectly positioned for this upgrade.

### 3. additionalContext is the Context Saver

Multiple events support `additionalContext` injection — content that goes to Claude without consuming main context budget. This is the mechanism for:
- Injecting git state at SessionStart
- Injecting phase context into SubagentStart
- Injecting recovery hints after PreCompact
- Adding warnings after PostToolUse validation

### 4. Hooks in Skill Frontmatter is Underexplored

Official docs confirm hooks can be defined per-skill in YAML frontmatter. This means `/dev:quick` could have its own PreToolUse hook that ONLY fires when the quick skill is active — no `.active-skill` file needed. This is potentially the cleanest solution for workflow enforcement.

```yaml
---
name: quick
hooks:
  PreToolUse:
    - matcher: "Write|Edit"
      hooks:
        - type: command
          command: "node ${CLAUDE_PLUGIN_ROOT}/scripts/quick-workflow-guard.js"
---
```

### 5. Async Hooks Enable Non-Blocking Quality Checks

For operations that take time (test suites, linting, type checking), async hooks run in the background and deliver results on the next conversation turn. Towline doesn't use any async hooks, but this could be valuable for running `npm test` after executor commits without blocking.

---

## Research Sources

| Document | Focus | Key Contribution |
|----------|-------|-----------------|
| 009-hooks-mastery-patterns.md | Community patterns (disler repo) | Gradual enforcement, git context injection, builder/validator pairing |
| 009-official-hooks-docs.md | Official Anthropic docs | Complete event catalog, JSON schema, hook types, new features |
| 009-towline-hooks-audit.md | Towline's current hooks | Per-hook deep dive, gap analysis, workflow enforcement opportunities |
