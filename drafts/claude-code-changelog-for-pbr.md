# Claude Code Changelog — PBR-Relevant Features and Opportunities

**Date:** 2026-02-22
**Source:** github.com/anthropics/claude-code CHANGELOG.md (v2.0.74 through v2.1.50)
**Purpose:** Identify new Claude Code capabilities PBR should leverage, integrate, or adapt to.

---

## Executive Summary

Claude Code has shipped aggressively since December 2025. The most impactful changes for PBR fall into three categories: (1) hook system maturation — new events, new return capabilities, longer timeouts; (2) agent/Task system upgrades — worktree isolation, memory fields, metrics; and (3) plugin system improvements — skills loading correctly, session IDs available, argument syntax changes. Several features PBR already uses informally are now officially supported API.

---

## High-Impact Changes PBR Should Act On

### 1. PreToolUse Hooks Can Now Return `additionalContext` (v2.1.9)

**What changed:** Previously, PreToolUse hooks could only `block` (exit 2) or `allow` (exit 0). Now they can return `{ additionalContext: "..." }` to inject guidance without blocking.

**PBR opportunity:** `pre-bash-dispatch.js` and `pre-write-dispatch.js` currently only block bad actions. They could also inject contextual warnings — e.g., "You're about to edit a file outside the current phase scope" without blocking the edit. This is the "soft enforcement" layer GSD proposed in Issue #678.

**Priority:** High — enables a new class of non-blocking guidance hooks.

---

### 2. `last_assistant_message` in Stop/SubagentStop Inputs (v2.1.47)

**What changed:** Stop and SubagentStop hook inputs now include the final assistant response text.

**PBR opportunity:**
- `auto-continue.js` (Stop hook) can read the agent's final message to make smarter decisions about what to suggest next, rather than relying solely on signal files.
- `check-subagent-output.js` (PostToolUse on Task) could be complemented by a SubagentStop hook that reads the final message to check for error patterns or incomplete work.
- `event-handler.js` (SubagentStop) can parse the final message for verification results instead of reading VERIFICATION.md from disk.

**Priority:** High — direct improvement to existing hooks.

---

### 3. Task Tool Returns Metrics (v2.1.30)

**What changed:** Task tool results now include `token_count`, `tool_uses`, and `duration_ms`.

**PBR opportunity:** The build skill and executor could capture these metrics and write them to SUMMARY.md frontmatter. This gives free, accurate per-plan execution metrics without needing to parse JSONL logs. Complements the token efficiency metrics idea from GSD's PR #647.

**Example SUMMARY.md frontmatter addition:**
```yaml
execution_metrics:
  tokens: 45230
  tool_uses: 87
  duration_ms: 234000
```

**Priority:** High — zero-cost data collection, just wire the return values.

---

### 4. `isolation: worktree` in Agent Frontmatter (v2.1.50)

**What changed:** Agents can declaratively request git worktree isolation by adding `isolation: worktree` to their frontmatter. The worktree is created automatically and cleaned up if no changes are made.

**PBR opportunity:** The executor agent could optionally run in an isolated worktree, preventing partial writes from corrupting the main working tree if the agent crashes or runs out of context. The verifier agent could run in a worktree to avoid any accidental writes to the main tree.

**Considerations:** Worktree isolation means the agent works on a copy — changes need to be merged back. This adds complexity. Best suited for agents that produce atomic, well-defined output (verifier reads, executor writes to specific files).

**Priority:** Medium — powerful for reliability, but needs careful integration design.

---

### 5. New Hook Events: WorktreeCreate/Remove, ConfigChange, TaskCompleted (v2.1.33–v2.1.50)

**What changed:** Four new hook events available.

**PBR opportunity:**
- **`TaskCompleted`**: PBR already has `task-completed.js` — confirm it's wired to this official event (vs. custom implementation). This is the clean way to trigger post-agent actions.
- **`ConfigChange`**: Could trigger `check-state-sync.js` if config.json changes, ensuring STATE.md stays consistent.
- **`WorktreeCreate/Remove`**: If PBR adopts worktree isolation for agents, these hooks could set up/tear down phase-specific working environments.

**Priority:** Medium — TaskCompleted alignment is a quick check; others are future-facing.

---

### 6. Hook Timeout Extended to 10 Minutes (v2.1.3)

**What changed:** Was 60 seconds, now 10 minutes.

**PBR opportunity:** Hooks that do heavy validation (plan-checker pre-checks, integration-checker analysis) no longer risk timeout. This removes a constraint on hook complexity — PBR could add more thorough validation without worrying about the 60s wall.

**Priority:** Low (removes a constraint rather than enabling a feature) — but good to document.

---

### 7. Windows Hooks Now Execute via Git Bash (v2.1.47)

**What changed:** Previously, hooks on Windows were executed via cmd.exe and silently failed. Now they use Git Bash.

**PBR impact:** This is a **critical reliability fix** for PBR on Windows. PBR's hooks.json uses `-e` bootstrap commands with Unix syntax. Before v2.1.47, these may have been silently failing on Windows for some users.

**Action:** Document minimum Claude Code version requirement (v2.1.47+) for reliable Windows operation. Review if any PBR hooks were working around this limitation in ways that can now be simplified.

**Priority:** High — affects all Windows users.

---

### 8. `${CLAUDE_SESSION_ID}` Available in Skills (v2.1.9)

**What changed:** Skills can now reference the current session ID via string substitution.

**PBR opportunity:**
- Session-scoped lock files: `.active-skill` could include the session ID to disambiguate multi-session conflicts (the same issue GSD hit in Issue #678).
- Session-scoped logging: Skills that write logs or state could tag entries with session ID for debugging.
- Audit trail: `/pbr:audit` could correlate `.planning/` file changes with specific sessions.

**Priority:** Medium — solves the known `.active-skill` multi-session conflict.

---

### 9. `$ARGUMENTS[0]` Bracket Syntax and `$0`/`$1` Shorthand (v2.1.19)

**What changed:** Skill argument access syntax changed from `$ARGUMENTS.0` to `$ARGUMENTS[0]`. Shorthand `$0`, `$1` etc. now available.

**PBR impact:** Check if any PBR skills use the old dot syntax. If so, they'll break on newer Claude Code versions.

**Priority:** High — potential breaking change. Audit all SKILL.md files for `$ARGUMENTS` usage patterns.

---

### 10. Skill `allowed-tools` Now Actually Enforced (v2.0.74)

**What changed:** Previously, the `allowed-tools` frontmatter in SKILL.md files was not being applied — skills could use any tool regardless of restrictions.

**PBR impact:** PBR skills have `allowed-tools` in every SKILL.md. Now that enforcement is real, verify that every skill has the correct tool set. Missing tools will cause silent failures.

**Priority:** High — audit all skills' `allowed-tools` against their actual tool usage.

---

### 11. Large Tool Outputs Saved to Disk (v2.1.2)

**What changed:** Instead of truncating large bash/tool outputs, they're persisted to disk and Claude can read the full content via file reference.

**PBR impact:** Executor agents running builds or test suites no longer lose output to truncation. PBR's `suggest-compact.js` tracking may need to account for these disk-referenced outputs differently than inline outputs.

**Priority:** Low — mostly a reliability improvement that works automatically.

---

### 12. Agent `memory` Frontmatter Field Officially Supported (v2.1.33)

**What changed:** Agent `.md` files now officially support `memory: user|project|local`.

**PBR impact:** PBR already uses `memory: none|user|project` in agent frontmatter. Confirm `none` maps to the absence of the field (or `local`). This validates PBR's existing convention.

**Priority:** Low — validation of existing approach, but worth confirming `none` vs `local` semantics.

---

### 13. Restricting Sub-Agent Spawning via Tools Frontmatter (v2.1.33)

**What changed:** Agent tools frontmatter can specify which sub-agents are allowed to be spawned.

**PBR opportunity:** The executor agent could be restricted from spawning arbitrary agents — only `pbr:debugger` for fix attempts. The planner could be restricted to only `pbr:researcher`. This prevents agents from going rogue and spawning unexpected sub-agents.

**Priority:** Medium — defense-in-depth for agent behavior.

---

### 14. `context_window.used_percentage` and `remaining_percentage` in Statusline (v2.1.6)

**What changed:** Statusline JSON now includes context window usage metrics.

**PBR opportunity:** PBR's `suggest-compact.js` and `track-context-budget.js` could read these official metrics instead of estimating from cumulative read sizes. Much more accurate context budget tracking.

**Note:** These are in the statusline JSON, not directly in hook inputs. PBR would need to read the statusline output or use a bridge file (like GSD's approach in PR #638).

**Priority:** Medium — would significantly improve context budget accuracy.

---

### 15. `plansDirectory` Setting (v2.1.9)

**What changed:** New setting to customize where plan files are stored.

**PBR consideration:** PBR uses `.planning/` hardcoded throughout skills, hooks, and scripts. If a user sets `plansDirectory` to something else, PBR's `.planning/` convention could conflict. For now, document that PBR uses its own `.planning/` directory independently of Claude Code's `plansDirectory`.

**Priority:** Low — informational, no action needed unless conflicts reported.

---

### 16. `agent_type` in SessionStart Input (v2.1.2)

**What changed:** SessionStart hook receives `agent_type` when launched with `--agent`.

**PBR opportunity:** `progress-tracker.js` (SessionStart hook) could detect if the session was launched as a specific agent type and adjust its behavior — e.g., skip injecting project state for non-PBR agents.

**Priority:** Low — minor optimization.

---

## Memory/Performance Fixes Worth Noting

These aren't features PBR needs to integrate, but they explain behaviors PBR users may have encountered:

| Fix | Version | Impact |
|-----|---------|--------|
| O(n²) message accumulation in agent sessions | v2.1.47 | Long executor runs no longer degrade |
| Completed task state memory leak | v2.1.50 | Build skill spawning many agents won't leak |
| Compaction strips PDFs | v2.1.47 | Agents reading PDFs won't fail on compaction |
| Plan mode preserved through compaction | v2.1.47 | Plan skill won't drop out of plan mode |
| Internal caches cleared after compaction | v2.1.50 | Better memory utilization post-compact |

---

## Security Fixes to Be Aware Of

| Fix | Version | Relevance |
|-----|---------|-----------|
| Wildcard permission rules match compound commands | v2.1.7 | PBR's permission rules in hooks.json |
| Command injection in bash input | v2.1.2 | PBR validates bash commands in pre-bash |
| Shell line continuation bypass | v2.1.6 | PBR's dangerous-command checker |
| Heredoc delimiter parsing | v2.1.38 | PBR's commit validation |
| Bash permission classifier hallucination | v2.1.47 | PBR relies on Claude Code's permission system |
| `content-level ask` overrides `tool-level allow` | v2.1.27 | PBR's permission model |

---

## Breaking or Behavioral Changes

| Change | Version | PBR Impact |
|--------|---------|------------|
| `$ARGUMENTS.0` → `$ARGUMENTS[0]` syntax | v2.1.19 | **Audit all skills** |
| `CLAUDE_CODE_SIMPLE` disables hooks | v2.1.50 | PBR won't work in simple mode |
| `disableAllHooks` no longer overrides managed | v2.1.49 | Enterprise deployments |
| Hook timeout 60s → 10 minutes | v2.1.3 | Removes constraint |
| Skill character budget now 2% of context | v2.1.32 | Longer skills OK on larger context |

---

## Priority Action Items for PBR

### Immediate (Audit / Verify)

1. **Audit `$ARGUMENTS` syntax** in all SKILL.md files — ensure using `$ARGUMENTS[0]` not `$ARGUMENTS.0`
2. **Audit `allowed-tools`** in all SKILL.md files — enforcement is now real, missing tools = silent failure
3. **Document minimum Claude Code version** — v2.1.47+ for reliable Windows hooks
4. **Verify `memory: none`** maps correctly to the official `memory` field semantics

### Short-Term (Wire New Capabilities)

5. **Capture Task metrics** in SUMMARY.md — tokens, tool_uses, duration_ms from Task return values
6. **Use `last_assistant_message`** in auto-continue.js and event-handler.js Stop/SubagentStop hooks
7. **Add session ID to `.active-skill`** using `${CLAUDE_SESSION_ID}` to fix multi-session conflicts
8. **Use `additionalContext` in PreToolUse hooks** for soft warnings (not just blocking)

### Medium-Term (New Features)

9. **Read statusline context metrics** for accurate context budget tracking
10. **Explore `isolation: worktree`** for verifier and optionally executor agents
11. **Restrict sub-agent spawning** via tools frontmatter to prevent agent sprawl
12. **Wire `ConfigChange` hook** to trigger config.json → STATE.md consistency checks

---

## Appendix: Full Hook Event Inventory (as of v2.1.50)

| Event | When | PBR Usage | New? |
|-------|------|-----------|------|
| SessionStart | Session begins | progress-tracker.js | No |
| SessionEnd | Session ends | session-cleanup.js | No |
| PreToolUse | Before tool execution | pre-bash-dispatch.js, pre-write-dispatch.js, validate-task.js | No |
| PostToolUse | After tool execution | post-write-dispatch.js, post-write-quality.js, check-subagent-output.js, suggest-compact.js, track-context-budget.js | No |
| PostToolUseFailure | Tool execution failed | log-tool-failure.js | No |
| PreCompact | Before context compaction | context-budget-check.js | No |
| Stop | Agent stops | auto-continue.js | No |
| SubagentStart | Subagent spawned | log-subagent.js | No |
| SubagentStop | Subagent finished | log-subagent.js, event-handler.js | No |
| TaskCompleted | Background task done | task-completed.js | v2.1.33 |
| WorktreeCreate | Worktree created | (unused) | v2.1.50 |
| WorktreeRemove | Worktree removed | (unused) | v2.1.50 |
| ConfigChange | Config file changed | (unused) | v2.1.49 |
| TeammateIdle | Teammate agent idle | (unused) | v2.1.33 |
