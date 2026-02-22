# Learnings from get-shit-done (GSD) for Plan-Build-Run

**Date:** 2026-02-22
**Source:** github.com/gsd-build/get-shit-done (17k stars, created 2025-12-14)
**Purpose:** Extract actionable insights from GSD's issues, PRs, and community patterns that could benefit PBR.

---

## Executive Summary

GSD and PBR solve the same core problem — context rot in AI coding assistants — with remarkably similar architectures (orchestrator + subagents, file-based state, atomic commits, phase-based planning). GSD has 10x the community (17k stars, 177 open issues, active PR stream) which means they're hitting bugs and edge cases at scale that PBR will eventually face. This document distills their pain points and innovations into PBR-relevant takeaways.

---

## 1. STATE.md is a Liability at Scale

### What GSD Hit

**Issue #692 (CRITICAL):** STATE.md grew from 20KB to **470MB** (6.8M lines). The Decisions section duplicated exponentially because executor commits used `String.replace()` with `$` in user content interpreted as regex backreferences. A single dollar sign in a decision line (`$0.50`, `$2.00`) corrupted the replacement.

**Issue #657:** `/gsd:health` nearly emptied STATE.md during regeneration — no backup was made first.

**PR #636:** Proposed YAML frontmatter on STATE.md so hooks/scripts can read structured data instead of regex-parsing free-form markdown.

### PBR Takeaways

- **PBR already has `check-state-sync.js`** but doesn't guard against exponential growth. A size check (warn if STATE.md exceeds N KB) would be trivial and catch runaway duplication early.
- **Regex replacement with user content is dangerous.** PBR's hook scripts should audit any `String.replace()` calls where the replacement string contains user-generated content. Use callback replacers (`str.replace(regex, () => newContent)`) instead of string replacers.
- **STATE.md frontmatter is worth stealing.** PBR's `check-plan-format.js` already validates frontmatter on PLAN/SUMMARY/VERIFICATION. Adding machine-readable frontmatter to STATE.md would let hooks read state without brittle regex parsing. GSD's approach: strip and rebuild frontmatter idempotently on every write.
- **Always backup before regeneration.** PBR's health skill should create timestamped backups before any destructive STATE.md operation.

---

## 2. Auto-Advance Chains Are Fragile

### What GSD Hit

**Issue #668 + PR #669:** The auto-advance chain (`discuss → plan → execute`) was **completely broken** because `Task(prompt="Run /gsd:plan-phase")` doesn't work — Skills don't resolve inside Task subagents. The chain silently did nothing. Source code commits from deeply nested executors were lost.

**Issue #686:** Auto-advance freezes at execute-phase with nested Claude Code session errors.

**v1.20.1:** Auto-mode flag (`--auto`) was lost during context compaction because it lived only in the conversation context, not on disk.

### PBR Takeaways

- **PBR's `auto-continue.js` Stop hook uses the same pattern** — it writes a `.planning/.auto-next` signal file and uses `decision: "block"` with the next command in `reason`. This is more robust than GSD's original Task-spawning approach, but still fragile.
- **Never rely on conversation-only state for workflow flags.** PBR already persists to `config.json` and `.auto-next`, which is correct. But any new workflow flags should follow the same pattern — disk-first, conversation-second.
- **Deeply nested subagent chains lose commits.** GSD found that `orchestrator → Task(plan) → Task(execute) → Task(executor)` at 3+ levels deep can silently drop git commits. PBR's architecture is flatter (skill → single Task), which avoids this, but it's worth documenting as an anti-pattern.
- **Skills don't resolve inside Task subagents** — this is a Claude Code platform limitation. PBR already knows this (agents use `subagent_type`, not skill invocation), but it should be documented as a hard constraint in the agent authoring guide.

---

## 3. Subagent Context Isolation Bites Everyone

### What GSD Hit

**Issue #671:** Subagents didn't receive the project's CLAUDE.md — skills were invisible to executors.

**Issue #672:** Subagents didn't discover `.agents/skills/` — custom skill rules invisible.

**Issue #695:** Quality profile silently downgraded researcher/planner to Sonnet because `model: 'inherit'` inherits from the *orchestrator's runtime model*, not the configured profile. If the user runs Claude Code on Sonnet, `inherit` = Sonnet regardless of what the config says.

### PBR Takeaways

- **PBR agents use `model: sonnet|inherit|haiku` in frontmatter.** The `inherit` trap applies equally: if someone runs PBR from a Haiku-tier orchestrator, all `inherit` agents silently downgrade. PBR should document this clearly and consider whether critical agents (planner, verifier) should use explicit model names instead of `inherit`.
- **CLAUDE.md propagation is automatic in Claude Code** for `subagent_type` agents (they get project context). GSD's bug was because they used raw `Task(prompt=...)` without `subagent_type`. PBR's architecture avoids this by design — worth noting as a validation of the `subagent_type` approach.

---

## 4. Rogue Edit Prevention (Write Guards)

### What GSD Hit

**Issue #678:** In yolo/auto-approve mode, Claude bypasses GSD entirely and makes direct file edits. STATE.md goes out of sync, work runs in the orchestrator context instead of being delegated, and there's no record of what changed.

**Proposed solution:** PreToolUse hook on Edit/Write that blocks when no active GSD task is detected. Detection via lock file (`.planning/.gsd-active`).

### PBR Takeaways

- **PBR already has `pre-write-dispatch.js`** and the `.active-skill` mechanism — this is ahead of GSD. The `.active-skill` file is PBR's version of GSD's proposed `.gsd-active` lock file.
- **But PBR's `.active-skill` has known issues** (documented in MEMORY.md): other sessions can set it, causing conflicts. GSD's proposal adds a session ID to the lock file to disambiguate — worth considering for PBR.
- **The opt-in → default promotion path is smart.** Ship write guards as opt-in first, promote to default once validated. PBR could adopt this for any aggressive new hooks.

---

## 5. Context Window Awareness for Agents

### What GSD Hit

**PR #638 (merged):** A PostToolUse hook that reads context metrics from a bridge file and injects two-tier warnings:
- **WARNING (≤35% remaining):** Wrap up current task, avoid new complex work
- **CRITICAL (≤25% remaining):** Stop immediately, save state with pause command

Smart debounce: first warning fires immediately, subsequent warnings debounce for 5 tool uses, severity escalation bypasses debounce.

### PBR Takeaways

- **PBR has `suggest-compact.js` and `track-context-budget.js`** which track reads and suggest compaction. But PBR doesn't inject context-aware warnings into the agent conversation the way GSD does.
- **The two-tier alert with debounce is a refined pattern.** PBR's current approach warns based on cumulative reads, but GSD's approach uses actual remaining context percentage. If Claude Code exposes context metrics (or PBR can estimate from token counts), this would be more accurate.
- **Bridge file pattern:** GSD uses `/tmp/claude-ctx-{session_id}.json` as a communication channel between the statusline and the hook. PBR could adopt a similar pattern for any cross-hook data sharing that doesn't fit in `.planning/` files.

---

## 6. Token Efficiency Metrics

### What GSD Hit

**PR #647 (open):** Parses Claude Code's `~/.claude/projects/` JSONL session logs to provide verifiable per-phase token usage: API calls per model, input/output/cache breakdown, cache efficiency ratio, tokens per commit, phase-over-phase comparison. Snapshots saved to `.planning/metrics/`.

### PBR Takeaways

- **PBR's `/pbr:audit` already reads JSONL session logs** for compliance analysis. Extending it (or creating a sibling `/pbr:metrics` skill) to extract token efficiency data would be natural.
- **Cache efficiency ratio is a valuable signal.** High cache-read ratios mean the agent is re-reading context efficiently; low ratios suggest redundant work. This could inform PBR's context budget recommendations.
- **Phase boundary detection via git commits** is clever but has the "no commits = no metrics" gap. PBR could use STATE.md timestamps as an alternative boundary marker.

---

## 7. Automatic Code Review Post-Execution

### What GSD Hit

**PR #661 (open, approved):** After executor completion, spawns a `code-reviewer` agent that reviews only source files changed during the phase. Checks for security, data loss, logic errors, silent failures. Autofix loop (up to 3 iterations) commits fixes as `fix(phase-{X}): code review autofix`.

### PBR Takeaways

- **PBR's `/pbr:review` skill is manual.** Adding an optional automatic code review step between executor completion and verification would catch issues earlier.
- **The "scoped diff" approach is key** — only review files changed in this phase, excluding `.planning/` artifacts. This keeps the review focused and cheap.
- **Config-gated with opt-out** (`workflow.code_review: false`) is the right pattern for something that adds cost/time. PBR could add `auto_review: true|false` to `config.json`.
- **PBR already has `pbr:code-reviewer` agent type** registered in Claude Code — this is mostly wiring it into the build skill's post-execution flow.

---

## 8. Validation Contracts Per Phase (Nyquist Layer)

### What GSD Hit

**PR #687 (merged):** Every phase plan must include automated verify commands. The plan-checker blocks approval when tasks lack verification steps. Creates `{phase}-VALIDATION.md` as a per-phase validation contract.

**PR #699 (open):** Compresses the Nyquist additions by 37% — the original was over-documented for a meta-prompt context.

### PBR Takeaways

- **PBR's plan-checker agent already validates plans** but doesn't specifically enforce that every task has a verify step. Adding a "verification completeness" dimension to plan-checker would catch plans that skip testability.
- **The compression follow-up is instructive:** meta-prompt content should be at *prompt density*, not *documentation density*. Theory explanations and aspirational tracking add token overhead without behavioral benefit. PBR skills should be audited for similar bloat.
- **Per-phase VALIDATION.md is interesting but may be overkill** for PBR. The existing VERIFICATION.md (post-build) + plan-level verify steps may be sufficient. Worth monitoring whether GSD's community finds the separate file useful.

---

## 9. Smart Routing Based on Phase State

### What GSD Hit

**PR #649 (open):** Replace static "next step" suggestions with dynamic routing based on actual phase artifacts:
- No CONTEXT.md → route to discuss
- Has context but no plans → route to plan
- Has plans → route to execute
- Last phase complete → route to milestone

### PBR Takeaways

- **PBR's `/pbr:continue` and `/pbr:status` already do artifact-based routing.** This validates the approach.
- **But PBR's `progress-tracker.js` SessionStart hook** could be smarter about suggesting the next action. Currently it injects project state; it could also inject a "suggested next command" based on the same artifact detection logic.
- **Three-state detection** (no context / has context no plans / has plans) maps cleanly to PBR's discuss → plan → build flow. Worth verifying PBR's routing covers all three states correctly.

---

## 10. Debugger Autonomy Limits

### What GSD Hit

**Issue #630:** Debugger agent autonomously moved a debug document to `resolved/` without user verification. User went AFK and returned to find the bug marked as fixed based on a single curl test passing.

### PBR Takeaways

- **PBR's debugger agent should never auto-close.** The debugger should propose resolution and present evidence, but moving to resolved should require user confirmation.
- **Intermediate states are useful.** GSD proposes `self-verified/` as a middle ground between `active/` and `resolved/`. PBR could adopt a similar pattern for debug sessions — "agent thinks it's fixed, awaiting user confirmation."
- **General principle:** Any agent action that changes workflow state (closing a task, completing a phase, resolving a bug) should gate on user approval unless explicitly configured otherwise.

---

## 11. Monolith Decomposition

### What GSD Hit

**PR #691 (merged):** Split 5,324-line `gsd-tools.cjs` into 11 domain modules. Thin CLI router remained at ~550 lines.

### PBR Takeaways

- **PBR's `pbr-tools.js` is currently manageable** but growing. The GSD experience suggests proactive decomposition before the file becomes unwieldy. Domain boundaries that make sense for PBR: state, config, frontmatter, roadmap, phase, verify, template.
- **PBR already has good separation** (28 hook scripts vs. GSD's monolith), but `pbr-tools.js` could benefit from the same modularization if it continues to grow.

---

## 12. Community and Ecosystem Patterns

### What GSD's Scale Reveals

- **Multi-runtime demand is real.** GSD has community ports for OpenCode, Cursor, Gemini, and Codex — eventually absorbed into the main repo. PBR already has cursor-pbr and copilot-pbr derivatives.
- **The cross-plugin sync problem is universal.** GSD's Gemini port had TOML conversion bugs (PR #693). PBR's `cross-plugin-compat.test.js` is ahead of GSD here — automated sync verification prevents this class of bug.
- **Statusline migration is tricky.** GSD's PR #670 found that statusline migration regex was too broad and clobbered third-party statuslines. PBR should be careful with any hook migration logic that pattern-matches on filenames.
- **`"type": "module"` breaks CommonJS hooks.** GSD Issue #602 — when the user's project has `"type": "module"` in package.json, all GSD's `.js` files tried to load as ESM and failed. PBR's hooks use `.js` extension with CommonJS — this same bug could hit PBR if a user's project sets `"type": "module"`. The fix is using `.cjs` extension or ensuring hook scripts are loaded with explicit CommonJS resolution.

---

## 13. TDD Enforcement and Gap Analysis

### What GSD Hit

**PR #698 (open):** Three community-contributed commands:
1. **TDD enforcement** — validates that code-producing tasks have test specs, test files in the plan, and verify commands
2. **Deep-debug** — 4-phase systematic debugging with a 3-fix-attempt rule before escalating
3. **Validate-gap** — analyzes implementation gap between requirements and codebase at milestone boundaries

### PBR Takeaways

- **TDD enforcement in plan-checker** is low-hanging fruit. PBR's plan-checker could add a dimension checking that code-producing tasks include test expectations.
- **The 3-fix rule for debugging** is a good heuristic. PBR's debugger agent could adopt: after 3 failed fix attempts, escalate to user rather than continuing to iterate.
- **Gap analysis at milestone boundaries** is interesting. PBR's `/pbr:milestone audit` does requirement cross-referencing, but a dedicated gap analysis between REQUIREMENTS.md and actual codebase state could catch drift earlier.

---

## Priority Recommendations for PBR

### Quick Wins (Low effort, high value)

1. **STATE.md size guard** — Add a size check to `check-state-sync.js` warning if STATE.md exceeds 50KB
2. **Audit `String.replace()` calls** — Ensure no hook script passes user content as a replacement string without using callback form
3. **Document `model: inherit` trap** — Note in agent authoring docs that `inherit` resolves to the orchestrator's runtime model, not config
4. **Backup before STATE.md regeneration** — Add timestamped backup to health skill's repair flow

### Medium-Term Enhancements

5. **STATE.md YAML frontmatter** — Machine-readable header synced on every write, eliminating regex parsing in hooks
6. **Context-aware agent warnings** — Two-tier WARNING/CRITICAL alerts injected via PostToolUse based on remaining context
7. **Automatic post-build code review** — Optional `code-reviewer` agent step between executor completion and verification
8. **Session ID in `.active-skill`** — Disambiguate multi-session conflicts

### Strategic Considerations

9. **Token efficiency metrics** — Extend `/pbr:audit` or create `/pbr:metrics` to parse JSONL for per-phase token usage
10. **TDD enforcement dimension** in plan-checker — verify code tasks include test expectations
11. **Debugger autonomy limits** — Never auto-close; require user confirmation for state transitions
12. **`"type": "module"` compatibility** — Test PBR hooks in a project with `"type": "module"` in package.json; consider `.cjs` extensions if broken

---

## Appendix: GSD vs PBR Feature Comparison

| Capability | GSD | PBR | Notes |
|-----------|-----|-----|-------|
| Subagent delegation | Yes (Task) | Yes (Task + subagent_type) | PBR's subagent_type is more robust |
| File-based state | STATE.md, ROADMAP.md | STATE.md, ROADMAP.md, config.json | Very similar |
| Hook enforcement | Growing (~10 hooks) | Mature (28 hooks) | PBR significantly ahead |
| Cross-plugin sync tests | None | Automated (cross-plugin-compat.test.js) | PBR ahead |
| Multi-runtime support | Claude, OpenCode, Gemini, Codex | Claude, Cursor, Copilot | Different targets |
| Context budget tracking | Bridge file + PostToolUse alerts | Read tracking + suggest-compact | GSD's alerts more actionable |
| Auto-advance | Fragile (multiple breakages) | Signal file + Stop hook | PBR more cautious |
| Token metrics | PR open (JSONL parsing) | Audit skill (compliance focus) | GSD broader metrics scope |
| Code review post-build | PR open (approved) | Manual (/pbr:review) | GSD automating this |
| Plan validation | Nyquist layer (merged) | plan-checker agent | Similar coverage |
| Write guards | Proposed (issue #678) | Shipped (.active-skill) | PBR ahead |
| Community size | 17k stars, 177 issues | Smaller | GSD stress-tests at scale |
| npm installable | Yes (npx) | Plugin directory | GSD easier to install |
| Crypto/memecoin tie-in | Yes ($GSD token) | No | Drives GSD's viral growth |
