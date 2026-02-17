# GSD Competitive Analysis — February 2026

**Date**: 2026-02-16
**Scope**: GSD v1.11.2 through v1.20.3 (Feb 5-16, 2026)
**Repository**: [gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done) (14,931 stars)
**Package**: `get-shit-done-cc` v1.20.3

---

## 1. New GSD Features Since Last Review

GSD shipped **22 releases in 11 days** (v1.11.2 to v1.20.3). The velocity is impressive but raises quality questions (see Section 5). Key additions:

### 1.1 gsd-tools.cjs — Centralized CLI Utility

**PRs**: #463, #468, #472, #473, #485
**Impact**: High

The single biggest architectural change. A monolithic CommonJS CLI (~4,500 lines) that replaces inline bash patterns across 50+ workflow files. 80+ commands organized into categories:

| Category | Commands | Example |
|----------|----------|---------|
| State management | 12 | `state load`, `state patch --field val` |
| Phase operations | 5 | `phase complete`, `phase insert` |
| Roadmap operations | 3 | `roadmap analyze`, `roadmap get-phase` |
| Milestone operations | 1 | `milestone complete --archive-phases` |
| Verification suite | 6 | `verify plan-structure`, `verify artifacts` |
| Frontmatter CRUD | 4 | `frontmatter get/set/merge/validate` |
| Template fill | 3 | `template fill summary --phase N` |
| State progression | 7 | `state advance-plan`, `state record-metric` |
| Compound init | 12 | `init execute-phase`, `init plan-phase` |
| Scaffolding | 4 | `scaffold context --phase N` |
| Todos | 1 | `todo complete` |

**Key design decision**: All deterministic operations moved from LLM-orchestrated steps to Node.js CLI. This reduces token usage, eliminates LLM variability in mechanical tasks, and enables compound init commands.

**Towline comparison**: Our `towline-tools.js` covers ~12 commands (state load/update, config validate, plan-index, frontmatter, must-haves, phase-info, roadmap updates). GSD's scope is 6-7x larger. However, much of GSD's tooling exists because they lack hooks — their CLI compensates for what our hook system handles natively.

### 1.2 Compound Init Commands

**PR**: #468 (Feb 7)
**Impact**: Medium-High

12 `init` commands that return all context a workflow needs in a single JSON blob, replacing 5-10 sequential `Read`/`Bash` calls per workflow invocation. Updated 24 workflow files and 6 agent files.

```
init execute-phase <phase>    # models, config, phase info, plan inventory
init plan-phase <phase>       # models, workflow flags, existing artifacts
init new-project              # models, brownfield detection, state checks
init quick <description>      # models, next task number, timestamps
```

**Claimed savings**: ~200 lines of bash setup per invocation.

**Towline comparison**: Our `progress-tracker.js` (SessionStart hook) injects project state automatically — no explicit init calls needed. Our approach is more elegant (zero orchestrator tokens) but less flexible (can't customize what context to load per-workflow).

### 1.3 Auto-Advance Pipeline

**Introduced**: v1.19.1 (Feb 15)
**Impact**: Medium

The `--auto` flag and `workflow.auto_advance` config setting chain phases without human intervention:

- `--auto` on `discuss-phase` chains: discuss -> plan -> execute
- Auto-mode persists to `config.json` to survive context compaction (v1.20.1)
- Checkpoints auto-approve in auto mode (human-verify auto-approves, decision auto-selects first option)
- `human-action` checkpoints still stop for auth gates
- Auto-advance clears on milestone complete

**Towline comparison**: We have `/dev:continue` + `auto-continue.js` hook. Similar concept, but GSD's implementation is more mature — they persist the flag to disk and handle checkpoint bypass explicitly. Our auto-continue hook is simpler but functional.

### 1.4 Phase Archival

**PR**: closes #489 (Feb 15)
**Impact**: Medium

When a milestone completes, phase directories can be moved to `.planning/milestones/v{X.Y}-phases/`:

- `--archive-phases` flag on `milestone complete`
- New `/gsd:cleanup` command for retroactive archival
- `findPhaseInternal()` searches archives when phase not found in current directory
- `cmdHistoryDigest()` scans both current and archived phases

**Towline comparison**: We don't archive phases — they remain in `.planning/phases/`. This is fine for single-milestone projects but becomes cluttered with multi-milestone work. **Recommendation**: Consider adding optional archival.

### 1.5 3-State Todos

**PR**: #543 by EmreErdogan (Feb 12)
**Impact**: Low-Medium

Adds "in-progress" state: `pending -> in-progress -> done`. However, this PR was part of the 12-PR mass revert on Feb 14 (see Section 5.1). Status unclear — may have been re-implemented in later releases or deferred.

**Towline comparison**: Our todos use 2 states (`pending/` and `done/` directories). An in-progress state would be useful for multi-session tasks. Low priority.

### 1.6 Roadmapper Agent

**File**: `agents/gsd-roadmapper.md`
**Impact**: Medium

A dedicated agent for creating roadmaps with:

- Requirement-to-phase mapping with 100% coverage validation
- Goal-backward success criteria derivation (2-5 observable behaviors per phase)
- Depth calibration (Quick: 3-5 phases, Standard: 5-8, Comprehensive: 8-12)
- Anti-enterprise philosophy: no team coordination, sprint ceremonies, or PM theater

**Towline comparison**: Our `towline-planner` handles both planning and roadmap creation. GSD separated these into distinct agents. Their roadmapper is more opinionated about coverage validation — requiring explicit 100% requirement mapping. We should evaluate whether separating roadmap creation from plan creation improves output quality.

### 1.7 Project Researcher Agent

**File**: `agents/gsd-project-researcher.md`
**Impact**: Medium

Research agent with three modes (Ecosystem, Feasibility, Comparison):

- Tool priority: Context7 (MCP) -> Official Docs (WebFetch) -> WebSearch
- Brave Search integration when configured
- Confidence levels: HIGH (Context7/official), MEDIUM (verified WebSearch), LOW (unverified)
- Outputs 5-7 files in `.planning/research/`
- Treats training data as hypothesis to verify, not fact

**Towline comparison**: Our `towline-researcher` already has source-hierarchy methodology and confidence levels. GSD's version is similar but adds Brave Search as an explicit integration and structures output into more granular files. Our researcher is already comparable.

### 1.8 Requirements Tracking

**Versions**: v1.20.0-1.20.3
**Impact**: Medium-High

Full requirement-to-phase-to-verification traceability chain:

- `REQUIREMENTS.md` template with `[CATEGORY]-[NUMBER]` IDs (e.g., AUTH-01)
- Traceability table maps each requirement to exactly one phase
- IDs flow through: researcher -> planner -> checker -> executor -> verifier
- Plan checker **blocks** when any roadmap requirement is absent from all plans
- Milestone audit cross-references three sources: VERIFICATION.md + SUMMARY frontmatter + REQUIREMENTS.md

**Towline comparison**: We have `REQUIREMENTS.md` support but the traceability chain is less rigorous. GSD's blocking enforcement in the plan checker is notable. Our plan-checker validates across 10 quality dimensions but doesn't explicitly enforce requirement coverage.

### 1.9 Verification Patterns Reference

**File**: `get-shit-done/references/verification-patterns.md`
**Impact**: Low

Comprehensive reference for detecting stubs vs real implementations:

- 4 verification levels: Exists -> Substantive -> Wired -> Functional
- Patterns for React components, API routes, database schemas, hooks
- Stub detection patterns, wiring verification

**Towline comparison**: We already have `references/verification-patterns.md` with three-layer verification (existence, substantiveness, wiring) plus `references/stub-patterns.md`. Our coverage is equivalent or better.

### 1.10 Other Notable Additions

| Feature | PR/Version | Towline Status |
|---------|-----------|---------------|
| `/gsd:health` command | v1.20.0 | We have `/dev:health` with 8-point checks |
| User-level defaults (`~/.gsd/defaults.json`) | v1.19.2 | We don't have cross-project defaults |
| Per-agent model overrides | v1.19.2 | We have this via `/dev:config` |
| Multi-runtime (Claude Code + OpenCode + Gemini) | v1.19.0 | N/A — Towline is Claude Code only |
| Local patch preservation | v1.17.0 | N/A — not applicable to plugin architecture |
| Brave Search integration | v1.19.0 | We added Context7 MCP tools to researcher |
| Renamed to `.cjs` (ESM conflict fix) | v1.19.2 | Our scripts are already CommonJS |

---

## 2. Towline vs GSD Comparison

### 2.1 What We Already Have That GSD Added

| Capability | Towline | GSD |
|------------|---------|-----|
| Goal-backward verification | Three-layer (existence, substantiveness, wiring) with must_haves | Four-level (Exists, Substantive, Wired, Functional) — essentially the same |
| Source hierarchy research | Confidence levels in towline-researcher | S0-S6 hierarchy in gsd-project-researcher (PR #590, not yet merged) |
| Wave-based parallelization | Built into planner + executor with `depends_on` | Not implemented — plans execute sequentially |
| Plan pre-validation | towline-plan-checker (10 quality dimensions) | gsd-plan-checker (similar, adds PROJECT.md cross-check) |
| Hook system | 25 hooks via hooks.json lifecycle events | 2 hooks (statusline, check-update) — minimal |
| Status line | ANSI-colored with context budget bar | Basic status display |
| Health command | 8-point integrity checks | 5 error codes + 7 warnings |
| Auto-continue | auto-continue.js hook + `/dev:continue` | `--auto` flag + `auto_advance` config |
| Checkpoint protocols | human-verify, decision, continuation state | Similar checkpoint system |
| Persistent todos | File-based with themes and priorities | File-based with pending/done directories |
| Model profiles | quality/balanced/budget/adaptive presets | quality/balanced/budget presets |
| Integration checking | Dedicated integration-checker agent | gsd-integration-checker agent |
| Codebase mapping | `/dev:scan` with 4 focus areas | `/gsd:map-codebase` with 7 focus templates |

### 2.2 What We're Missing

| GSD Feature | Priority | Notes |
|-------------|----------|-------|
| Compound init commands (12 JSON blobs) | Low | Our hook injection is more elegant |
| Phase archival to milestone directories | Medium | Useful for multi-milestone projects |
| Requirements traceability chain with blocking enforcement | Medium | We have requirements but weaker enforcement |
| User-level defaults (`~/.towline/defaults.json`) | Low | Nice-to-have for multi-project users |
| Scaffolding commands (scaffold context/uat/verification) | Low | We use templates directly |
| Frontmatter CRUD via CLI | Low | Our towline-tools.js handles frontmatter reads |
| Multi-runtime support (OpenCode, Gemini) | Low | Not a priority for Towline |
| Brave Search integration | Low | We have Context7 MCP; Brave would be additive |

### 2.3 What We Do Better

| Area | Towline Advantage |
|------|-------------------|
| **Hook ecosystem** | 25 hooks vs GSD's 2. Quality gates, safety checks, context tracking, and budget management all run automatically. GSD compensates with CLI commands that must be called explicitly. |
| **Wave-based parallelization** | Automatic dependency-ordered parallel execution. GSD plans run sequentially. |
| **Context budget management** | Real-time tracking via status line, PreCompact state preservation, proactive compaction suggestions. GSD has no equivalent. |
| **Test coverage** | 643 tests, 32 suites, 3-platform CI. GSD has a single test file for gsd-tools. |
| **Plugin architecture** | Clean Claude Code plugin via `plugins/dev/`. GSD uses npm install with hook patching. |
| **Lean orchestrator** | Skills are thin orchestrators; agents are auto-loaded. GSD inlines workflow logic in 50+ files. |
| **Agent specialization** | 10 focused agents with dedicated models. GSD has 11 agents but less model differentiation. |
| **Safety hooks** | validate-commit, check-dangerous-commands, check-phase-boundary block harmful actions. GSD relies on the LLM not making mistakes. |

---

## 3. Community PRs Worth Watching

### 3.1 Analysis Paralysis Guard (PR #618 by CyPack)

**Status**: Open | **Lines**: +228/-14

Detects when the executor makes 5+ consecutive read calls without writing and forces action or blocked status report. Also adds `ToolSearch` for runtime MCP tool discovery.

**Recommendation**: **Medium priority**. The concept is sound — agents sometimes spin in research loops. Consider adding a similar counter to our executor agent prompt rather than a hook (less overhead).

### 3.2 Selectable Research Dimensions (PR #610 by yoshi280)

**Status**: Open | **Lines**: +581/-59

Makes research dimensions user-selectable via multi-select prompt instead of always spawning 4 hardcoded researchers. Adds "Best Practices" and "Data Structures" as new dimensions.

**Recommendation**: **Low priority**. Our researcher already handles dimension selection through the skill's questioning flow. The concept of letting users skip irrelevant research is good but we achieve this through the `/dev:plan --research` flag.

### 3.3 S0-S6 Source Hierarchy (PR #590 by davesienkowski)

**Status**: Open | **Lines**: large consolidation PR

Formalizes source hierarchy: S0=codebase through S6=LLM reasoning. Includes deferred-items template for executor agents.

**Recommendation**: **Already implemented**. Our towline-researcher has confidence levels that map to a similar hierarchy. No action needed.

### 3.4 Agent Teams (PR #591 by davesienkowski, Issue #604)

**Status**: Open (PR) / Closed (Issue)

Red team / blue team debugging with research cross-pollination. Config-gated (`agent_teams: false`).

**Recommendation**: **Low priority — watch only**. Interesting concept but adds complexity. The maintainer indicated GSD will use Claude Code's native team infrastructure (`TeamCreate`/`SendMessage`) if available. We should wait for Claude Code's native team support before building custom.

### 3.5 TDD Enforcement (PRs #513, #554, #618)

**Status**: Multiple open PRs with overlapping scope

Three approaches proposed:
- **#513** (siraj-samsudeen): Three-tier — off, basic (prompt-based), full (hook-enforced with coverage gates)
- **#554** (Tithanium): Pytest-specific integration
- **#618** (CyPack): Mandatory for `type="auto"` tasks with `<behavior>` blocks

**Recommendation**: **Medium priority**. Our config already has `tdd_mode` toggle but it's off by default. The prompt-based approach (basic tier) is low-cost to implement. Consider adding TDD enforcement to our executor prompt when `tdd_mode: true`.

### 3.6 Lightweight Phase Listing (PR #623 by lafraia)

**Status**: Open | **Lines**: +124

Read-only `/gsd:list-phases` command showing all phases with status icons and plan counts. Only two shell calls — positioned as lighter alternative to the heavyweight `/gsd:progress`.

**Recommendation**: **Low priority**. Our `/dev:status` already shows phase overview. But the specific UX (status icons like `✓`, `◐`, `○`) is nice — consider adopting for our status display.

---

## 4. Issues Relevant to Towline

### 4.1 Regex Interpolation Crashes (Issue #621, PR #624)

**Status**: Open, confirmed, priority: high

`gsd-tools.cjs phase complete "03.2.1"` crashes with `SyntaxError: Invalid regular expression`. Two compounding bugs:

1. `normalizePhaseName()` regex `(\d+(?:\.\d+)?)` only supports one decimal level — truncates `03.2.1` to `03.2`
2. `cmdPhaseComplete()` interpolates raw requirement text into `new RegExp()` without escaping — text like `(items` creates unterminated groups

**Towline relevance**: Our `towline-tools.js` doesn't do regex-based roadmap parsing — we use structured YAML frontmatter. However, any code that interpolates user-provided strings into `new RegExp()` is vulnerable. **Action**: Audit our codebase for unescaped regex interpolation.

### 4.2 Model Mapping (Issue #558)

**Status**: Closed (fixed)

When GSD resolved `"opus"`, Claude Code internally mapped it to `claude-opus-4-1` instead of the latest. Orgs blocking 4-1 but allowing 4-6 got silent fallback to sonnet.

**Towline relevance**: Our model profiles use `"inherit"`, `"sonnet"`, `"haiku"`, `"opus"` strings in agent frontmatter. The `model:` field is passed directly to `subagent_type` — Claude Code handles resolution. We should verify our agents don't hit this same issue. Fix: prefer `"inherit"` over `"opus"` in agent definitions.

### 4.3 Context7 Skip Config (Issue #163)

**Status**: Open

Request for `research.skipContext7` config array for frameworks with unreliable Context7 data (e.g., ProcessWire: 712 snippets indexed but benchmark score of 0 with broken attribution).

**Towline relevance**: We recently added Context7 MCP tools to towline-researcher (PR #420cd35). We should consider a skip list in config. **Recommendation**: Low priority — address if users report bad Context7 data.

### 4.4 /gsd:quick Too Expensive (Issue #609)

**Status**: Open

Users report `/gsd:quick` uses Opus for trivial tasks, consuming excessive tokens. Suggestion: default to cheaper models for truly quick work.

**Towline relevance**: Our `/dev:quick` uses the executor agent with its configured model. If users set `balanced` profile, quick tasks use `inherit` (session model). This is already reasonable. No action needed.

### 4.5 .planning Files in Wrong Directory (Issue #622)

**Status**: Open

`.planning/` files created in `/home/ubuntu/.planning` instead of `cwd()` on Alpine Linux.

**Towline relevance**: Our scripts always use `process.cwd()` or the project path from STATE.md. This shouldn't affect us, but worth noting as a pattern to avoid.

### 4.6 /gsd:update Not Installing (Issue #619)

**Status**: Open, confirmed

`/gsd:update` reports success but doesn't actually install the new version. User had to run `npx get-shit-done-cc@latest` manually.

**Towline relevance**: Not applicable — Towline is a git-cloned plugin, not an npm package. Our update path is `git pull`.

---

## 5. Maintainer Behavior Analysis

### 5.1 The 12-PR Revert Incident (Feb 14)

On February 14, 12 community PRs were merged and then **mass-reverted** with the message:

> "Revert 12 PRs merged without authorization"

The reverted PRs included legitimate bug fixes and feature additions from multiple contributors (#413, #396, #543, #532, #519, #512, #505, #502, #497, #545, #389, #288). Several features were later re-implemented by the maintainer in official releases (phase archival, verifier Write tool fix, feature branch creation).

**Pattern**: Community contributions are accepted selectively — the maintainer prefers to re-implement features under their own authorship rather than merge community PRs directly.

### 5.2 The AI Mass-Closure Incident (Feb 14)

On the same day, an AI assistant (Claude) was used to review/close PRs and issues. The AI misinterpreted instructions and **closed at least 66 PRs/issues** with dismissive one-line comments. Examples:

- PR #513 (TDD enforcement): *"Thanks! TDD enforcement is too prescriptive for GSD's philosophy."*
- Issue #506 (dedicated team request): *"Closing -- out of scope for GSD's solo-dev philosophy."*

The maintainer posted a standard apology on each:

> "Apologies -- the previous closure was made by an AI assistant (Claude) that misinterpreted instructions and acted without authorization. This PR has been reopened and will be reviewed properly."

**Pattern**: The AI's closures revealed a "philosophy filter" — many PRs were closed because they didn't fit the maintainer's vision of GSD as a "solo dev + Claude" tool. The AI simply automated the maintainer's documented preferences more aggressively than intended.

### 5.3 "Philosophy Filter" Rejections

Even before the AI incident, PRs have been rejected on philosophical grounds:

- **Issue #118** (Plugin System): *"This adds complexity that doesn't fit GSD's 'solo dev + Claude' philosophy."* Contributor pushed back: *"You have to see that end to end project orchestration already has enterprise process dynamics."*
- **Issue #327** (Adapt for Senior Engineers): Closed as philosophy-incompatible.
- **Issue #506** (Dedicated Team): Multiple contributors volunteered to help manage the PR backlog. Maintainer acknowledged being overwhelmed: *"It's been overwhelming, but we're getting there."*

### 5.4 The davesienkowski (Rezolv) Case Study

The most prolific community contributor (`davesienkowski`) submitted 40+ PRs, including 19 in a single day (Feb 13, PRs #560-#576). They bundled features into PR #579, then restructured into #590, #591, #595-#597. Only 2 of their 40+ PRs have been merged (#420, #421). The contributor has been remarkably patient despite the AI closure incident.

### 5.5 PR Backlog

As of Feb 17: **60+ open PRs** with very few community merges. Only ~12 community PRs have been merged total vs. hundreds from the maintainer. The bottleneck is a single reviewer (the maintainer) who is clearly overwhelmed.

### 5.6 How Towline Differs

| Dimension | GSD | Towline |
|-----------|-----|---------|
| **Governance** | Single maintainer, philosophy filter | Open development, user-driven |
| **PR handling** | 60+ open, ~12 community merges ever | N/A (single developer project) |
| **AI usage in review** | Used AI to bulk-close PRs (incident) | AI assists development, never gates contributions |
| **Plugin extensibility** | No plugin system (Issue #118 rejected) | Built as a plugin from day one |
| **Configuration** | Opinionated defaults, limited toggles | 16 feature toggles, gates, model profiles |
| **Testing** | Single test file for gsd-tools | 643 tests, 32 suites, 3-platform CI |
| **Architecture transparency** | Monolithic gsd-tools.cjs (4,500 lines) | Modular scripts with hook dispatch |

---

## 6. Recommended Towline Enhancements

### High Priority

| # | Enhancement | Source | Effort | Rationale |
|---|-------------|--------|--------|-----------|
| 1 | **Requirement traceability enforcement** | GSD v1.20.0-1.20.3 | Medium | Add plan-checker validation that every ROADMAP requirement appears in at least one plan. Low-cost, high-value for catching silently dropped requirements. |
| 2 | **Analysis paralysis guard** | GSD PR #618 | Low | Add prompt-level guidance to executor agent: "If you've read 5+ files without writing, you must act or report blocked." No hook needed. |
| 3 | **Audit regex interpolation safety** | GSD Issue #621 | Low | Grep our codebase for `new RegExp` with template literals. Ensure all user-derived strings are escaped before interpolation. |

### Medium Priority

| # | Enhancement | Source | Effort | Rationale |
|---|-------------|--------|--------|-----------|
| 4 | **Phase archival** | GSD v1.19.2 | Medium | Add optional `--archive` flag to milestone completion that moves phase dirs to `.planning/milestones/v{X.Y}-phases/`. Keeps phases/ clean across milestones. |
| 5 | **TDD enforcement mode** | GSD PRs #513, #618 | Medium | When `tdd_mode: true`, executor prompt should include RED-GREEN-REFACTOR cycle requirement. Basic tier only — no hook enforcement. |
| 6 | **Persist auto-continue to disk** | GSD v1.20.1 | Low | Write `auto_continue` setting to config.json so it survives context compaction. Currently it's session-only. |
| 7 | **Status icons for phase display** | GSD PR #623 | Low | Use `✓` `◐` `○` `·` icons in `/dev:status` phase listings for quick visual scanning. |

### Low Priority

| # | Enhancement | Source | Effort | Rationale |
|---|-------------|--------|--------|-----------|
| 8 | **Cross-project defaults** | GSD v1.19.2 | Medium | `~/.towline/defaults.json` for users working on multiple Towline projects. Nice-to-have. |
| 9 | **Context7 skip list** | GSD Issue #163 | Low | Config option `research.skip_context7: ["framework-name"]` for frameworks with bad Context7 data. |
| 10 | **3-state todos** | GSD PR #543 | Low | Add optional `in-progress/` directory between `pending/` and `done/`. Low value for solo dev workflow. |
| 11 | **Scaffolding commands** | GSD gsd-tools | Low | `towline-tools.js scaffold context/uat/verification`. We already have templates — this just wraps them. |

### Explicitly Not Recommended

| Feature | Source | Why Not |
|---------|--------|---------|
| Monolithic CLI utility | gsd-tools.cjs | Our hook system handles this more elegantly. A 4,500-line CLI is a maintenance burden. |
| Multi-runtime support | GSD v1.19.0 | Towline is purpose-built for Claude Code. Supporting OpenCode/Gemini would dilute focus. |
| Agent teams | GSD PR #591 | Wait for Claude Code native team support. Building custom multi-agent coordination adds complexity without clear benefit for solo dev. |
| Compound init commands | GSD #468 | Our SessionStart hook injection is zero-token-cost. Init commands would be a regression. |

---

## 7. Key Takeaways

### GSD's Strengths

1. **Velocity**: 22 releases in 11 days demonstrates rapid iteration capability
2. **Community engagement**: 14,931 stars, 624+ issues/PRs show real adoption
3. **gsd-tools.cjs**: Despite being monolithic, it's comprehensive and well-organized
4. **Requirements traceability**: The full chain from requirements to verification is rigorous

### GSD's Weaknesses

1. **Single-maintainer bottleneck**: 60+ open PRs, overwhelmed reviewer
2. **Governance issues**: Mass revert of 12 PRs, AI bulk-closing 66+ issues
3. **Minimal testing**: One test file vs. Towline's 643 tests
4. **No hook system**: Relies on CLI commands instead of lifecycle hooks
5. **Monolithic architecture**: 4,500-line gsd-tools.cjs is hard to maintain
6. **Community frustration**: Top contributor has 2/40+ PRs merged

### Towline's Position

Towline is architecturally superior (hooks, tests, modularity, wave parallelization) but less feature-complete in specific areas (phase archival, requirement enforcement). The priority enhancements above would close the meaningful gaps while preserving our architectural advantages.

**Bottom line**: GSD is winning on adoption and feature breadth. Towline is winning on engineering quality, test coverage, and architectural soundness. The features worth adopting from GSD are incremental additions, not architectural changes.

---

## Appendix A: Claude Code Changelog Review (v2.1.31-v2.1.44)

Claude Code has shipped significant features since Towline was last updated. Several directly impact plugin development.

### A.1 New Hook Events (v2.1.33)

**`TeammateIdle`** and **`TaskCompleted`** hook events added for multi-agent workflows. These fire when agent team members become idle or complete tasks.

**Towline impact**: Not immediately useful (we don't use agent teams), but `TaskCompleted` could eventually replace our `SubagentStop` hook for more granular agent completion tracking. **Action**: Monitor — no changes needed now.

### A.2 Agent Memory Frontmatter (v2.1.33)

Agents now support a `memory` frontmatter field with `user`, `project`, or `local` scopes. This enables persistent memory across sessions.

**Towline impact**: We already use `memory:` in our agent frontmatter definitions (e.g., `memory: project` for executor, verifier; `memory: none` for synthesizer, plan-checker). **Action**: Verify our existing memory settings still work correctly. Consider whether any `memory: none` agents should be upgraded to `memory: project`.

### A.3 Sub-Agent Spawning Restrictions (v2.1.33)

Added support for restricting which sub-agents can be spawned via `Task(agent_type)` syntax in agent "tools" frontmatter. This allows agent definitions to declare exactly which other agents they can spawn.

**Towline impact**: This is relevant for security and preventing agent sprawl. Currently our agents can theoretically spawn any other agent. **Action**: **Medium priority** — add `allowed_agents` or restrict via `tools` frontmatter to prevent executor from spawning planner, verifier from spawning executor, etc. This enforces the intended agent coordination graph.

### A.4 Skill Character Budget Scaling (v2.1.32)

Skill character budget now scales with context window (2% of context). Users with larger context windows see more skill descriptions without truncation.

**Towline impact**: Our 21 skills may have been truncated for users with smaller context windows. With this change, skill descriptions are better surfaced. **Action**: No code changes needed, but review skill descriptions for conciseness — shorter descriptions benefit all users.

### A.5 Agent Teams (v2.1.32, v2.1.33)

Research preview agent teams feature for multi-agent collaboration (requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). Team members communicate via `TeamCreate`/`SendMessage`.

**Towline impact**: We don't use agent teams. Our architecture is deliberate — skills spawn agents via `Task()`, agents don't communicate laterally. If Claude Code stabilizes teams, we should evaluate whether research cross-pollination (our synthesizer pattern) could benefit from direct agent-to-agent messaging. **Action**: Watch only — experimental feature.

### A.6 Auto-Memories (v2.1.32)

Claude now automatically records and recalls memories as it works. This supplements the manual memory system.

**Towline impact**: This is the auto-memory system our MEMORY.md leverages. No changes needed — it's already integrated into our workflow.

### A.7 Fast Mode for Opus 4.6 (v2.1.36)

Fast mode uses the same Opus 4.6 model with faster output. Toggled with `/fast`.

**Towline impact**: Our model profiles don't account for fast mode. When users enable `/fast`, agents spawned with `model: "inherit"` will inherit the fast mode setting. **Action**: No changes needed — this is transparent to plugins.

### A.8 Hook Blocking Errors Show stderr (v2.1.41)

Fixed hook blocking errors (exit code 2) not showing stderr to the user. Previously, when a PreToolUse hook blocked an action, the user couldn't see why.

**Towline impact**: This directly benefits our `validate-commit.js` and `check-dangerous-commands.js` hooks, which use exit code 2 to block actions. Users will now see our error messages (e.g., "Commit message does not match format"). **Action**: Review our hook stderr messages for clarity now that users will actually see them.

### A.9 Heredoc Template Literal Fix (v2.1.32)

Bash tool no longer throws "Bad substitution" errors when heredocs contain JavaScript template literals like `${index + 1}`.

**Towline impact**: This may have caused issues with our commit hooks that use heredocs. **Action**: No changes needed — this is a Claude Code fix, not a Towline issue.

### A.10 Plugin Name in Skills Menu (v2.1.33)

Added plugin name to skill descriptions and `/skills` menu for better discoverability.

**Towline impact**: Our skills now show "dev" as the plugin name prefix in the skills menu (e.g., `dev:begin`, `dev:plan`). This improves discoverability when multiple plugins are loaded. **Action**: No changes needed.

### Recommended Claude Code Actions for Towline

| # | Action | Priority | Effort |
|---|--------|----------|--------|
| 1 | Add sub-agent spawning restrictions to agent `tools` frontmatter | Medium | Low |
| 2 | Review hook stderr messages for clarity (now user-visible) | Medium | Low |
| 3 | Verify agent `memory:` frontmatter settings are optimal | Low | Low |
| 4 | Review skill descriptions for conciseness (2% budget scaling) | Low | Low |
| 5 | Monitor agent teams feature stabilization | Watch | N/A |
