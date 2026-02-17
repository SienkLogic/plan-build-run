# Towline v2 Architecture Research

**Date**: 2026-02-17
**Status**: Research document — not a specification
**Audience**: Towline maintainers and contributors
**Sources**: Token efficiency audit, alternative paradigms research, tool landscape comparison, GSD competitive analysis, Claude Code changelog (v2.1.31–v2.1.44)

---

## 1. The Cost Problem

Every interaction with Towline costs tokens from the user's budget. For Claude Code MAX 5x subscribers, this budget is finite per 5-hour window with weekly caps. Understanding where tokens go is essential to making Towline cost-effective.

**Where tokens are spent:**

| Action | Token cost | Frequency |
|--------|-----------|-----------|
| Skill invocation | SKILL.md loaded + orchestrator reasoning | Every command |
| Agent spawn | Fresh 200k window, prompt filling, response generation | 1-8 per workflow |
| File reads | STATE.md, ROADMAP.md, PLAN.md, config.json | Multiple per spawn |
| Orchestrator reasoning | Routing logic, gate checks, error handling | Every command |

**Compound workflow costs:**

A full `/dev:plan` cycle spawns a minimum of 3 agents: researcher + planner + plan-checker. A full `/dev:build` phase spawns 2+: executor(s) + verifier. The compound `/dev:begin` workflow can spawn 5-8 agents across research, roadmap creation, and initial planning. Each spawn fills a fresh 200k context window — the prompt content alone consumes tokens from the user's MAX 5x allocation.

**Per-workflow cost breakdown:**

| Workflow | Agents spawned | Estimated prompt tokens |
|----------|---------------|------------------------|
| `/dev:begin` comprehensive | 4 researchers + synthesizer + planner (6) | ~12,000+ |
| `/dev:plan` (with discuss) | researcher + planner + checker (3) + CONTEXT.md loaded 3-4x | ~9,000+ |
| `/dev:build` | executor(s) + verifier (2+) + 4 hook spawns per write | ~6,000+ |
| `/dev:debug` | 1-5+ sequential debugger agents | ~3,000-15,000+ |
| `/dev:scan` | 4 parallel mapper agents (fixed) | ~8,000 |
| `/dev:resume` | None (inline) but 150-700 token resume tax | ~500 |

**The core tension**: Towline's subagent architecture is its greatest strength (clean context, specialized agents, fresh windows) and its largest cost center (each spawn has overhead). The orchestrator itself uses only 2-10% of its context — already near-optimal. The aggregate cost of a full milestone — across all spawns — is what matters to budget-conscious users.

**Design principle**: Every token is a user's dollar. Towline v2 should make cost-conscious choices by default while allowing power users to opt into comprehensive workflows.

---

## 2. Current State Assessment

> **Status (2026-02-17)**: Most inefficiencies listed below have been resolved. Agent compression (33-73%), shared fragments (14 extracted), output budgets (all 10 agents), and depth profiles are now implemented. See the V2 Token Efficiency Sweep notes in MEMORY.md for details.

### What Towline already does well

- **Lean orchestrator**: Skills are thin routing layers; the orchestrator stays at 2-10% context usage. This is excellent — most AI dev tools load far more into the main session.
- **Lazy-loading**: References and agent definitions are loaded on-demand, not eagerly. The `subagent_type` auto-loading means agent prompts never pollute the main context.
- **File-based state**: STATE.md, PLAN.md, ROADMAP.md live on disk. No context pollution across sessions, no state loss on compaction.
- **Goal-backward verification**: The verifier agent checks whether phase goals were actually achieved, not just whether tasks were completed. Most competing tools skip this entirely.
- **Plugin portability**: Clean Claude Code plugin architecture via `plugins/dev/`. No global installs, no hook patching.

### Where the inefficiencies are

- **75% boilerplate**: Analysis of SKILL.md files shows roughly 75% of content is routing logic, gate checks, error handling, and scaffolding. Only ~25% is actual work instructions that guide the agent.
- **PLAN.md full inlining**: The executor receives the complete PLAN.md content (~1,500 tokens for a typical phase). A structured summary could convey the same information in ~500 tokens.
- **Fixed spawn counts**: Every `/dev:plan` always spawns researcher + planner + plan-checker, even for well-understood phases where research is unnecessary.
- **No depth profiles**: Users cannot choose between "budget" (fewer spawns, shorter prompts) and "thorough" (full pipeline) modes.
- **No output length guidance**: Agent definitions constrain output *structure* via templates (SUMMARY.md.tmpl, VERIFICATION-DETAIL.md.tmpl) but never specify target output *size*. Agents like the mapper have "stop before 50% context usage" and the verifier has a "Context Budget Management" section — but these govern how much the agent *reads*, not how much it *writes*. SUMMARY.md, VERIFICATION.md, and research findings can grow unbounded within the 200k window.
- **CONTEXT.md loaded 3-4 times per plan cycle**: The discuss→plan handoff passes full CONTEXT.md content into each agent's fresh context separately. The plan skill reads it, inlines it into the researcher prompt, passes it to the planner's `<context>` block, and includes it in the plan-checker's compliance check. A structured decision summary (~300 tokens) could replace the full file (~1,200 tokens) in 2-3 of these agent prompts. Estimated redundant overhead: ~2,400-3,600 tokens per planning cycle.
- **Total codebase size**: ~6,800 lines of SKILL.md, ~4,000 lines of agent definitions, ~5,000 lines of hook scripts. If fully loaded this would be ~13,500 tokens — but lazy-loading means only a fraction is ever in context.

---

## 3. Alternative Paradigms Evaluated

Three research agents explored paradigms beyond Towline's current sequential plan-build-verify model. Each is assessed for applicability and token cost impact.

### Event-driven reactive workflows

**Concept**: File watchers and test triggers drive phase transitions instead of manual `/dev:continue` commands. The system reacts to events (test pass, file change, verification complete) rather than following a fixed sequence.

**Applicability**: Medium. Claude Code's new `TeammateIdle` and `TaskCompleted` hook events (v2.1.33) enable this without custom file watchers. The immediate win is auto-triggering verification after executor completion instead of requiring a separate `/dev:review` invocation.

**Token impact**: Neutral to positive — eliminates orchestrator reasoning for "what's next?" decisions, but event handlers still spawn agents.

### Spec-first development (TLA+/formal methods)

**Concept**: Write a formal specification (TLA+, Alloy) first, prove properties, then generate code from the verified spec. Eliminates classes of bugs by construction.

**Applicability**: Low. TLA+ requires expertise most users don't have. The specification language adds another artifact to maintain. The value proposition — fewer bugs through formal verification — is better served by Towline's existing goal-backward verification for most projects.

**Token impact**: Negative — adds a specification agent and a verification agent to the pipeline.

### Streaming/on-demand context (virtual memory for AI)

**Concept**: Instead of loading all context upfront, agents request artifacts on-demand as they work. Similar to Google's `LoadArtifactsTool` pattern — the agent starts with a manifest of available artifacts and pulls specific ones when needed.

**Applicability**: High. This directly addresses the PLAN.md inlining problem. Instead of injecting 1,500 tokens of plan content into the executor prompt, the executor receives a plan summary (~500 tokens) and can request specific task details on-demand.

**Token impact**: Positive — reduces prompt size for agents that don't need full context. The trade-off is additional tool calls (each `Read` costs a small amount), but the net savings from smaller initial prompts typically dominate.

### DAG-based task execution

**Concept**: Model tasks as a directed acyclic graph with topological sort determining execution order. LangGraph and similar frameworks use this pattern for multi-step AI workflows.

**Applicability**: Medium. Towline already has wave-based parallelism (tasks with no dependencies execute in parallel waves). A full DAG would add more granular dependency tracking but the complexity increase is hard to justify for typical 5-15 task plans.

**Token impact**: Neutral — the scheduling logic runs in the orchestrator regardless of whether it uses waves or topological sort.

### Self-modifying workflows

**Concept**: Systems that restructure their own workflow based on performance metrics. If verification frequently fails after execution, the system inserts an additional review step. If research consistently produces low-value output, the system skips it.

**Applicability**: Low-Medium. The concept is sound but requires persistent performance data across many runs. Towline would need to track success/failure rates per workflow pattern and adjust spawn decisions accordingly. This is a longer-term investment.

**Token impact**: Positive long-term — the system learns to skip wasteful steps. Negative short-term — tracking infrastructure has its own cost.

### Hierarchical memory (SHIMI, Zep)

**Concept**: Replace flat STATE.md with a semantic tree where agents query only relevant branches. SHIMI uses hierarchical summarization; Zep uses temporal knowledge graphs with entity extraction.

**Applicability**: Medium. STATE.md is currently small (~50-100 lines) so the flat format isn't a bottleneck. For large multi-milestone projects, a hierarchical structure would help agents find relevant context faster. The immediate application is milestone-scoped memory — agents working on phase 15 don't need context from phases 1-5.

**Token impact**: Positive for large projects, negligible for small ones.

### Token compression (soft prompts, Acon)

**Concept**: Compress prompts into dense token representations that convey the same information in fewer tokens. Research shows 480x compression ratios are achievable in controlled settings.

**Applicability**: Very low. These techniques require model fine-tuning access or custom inference pipelines. Claude Code's API doesn't expose prompt compression. This is a research direction, not a practical improvement.

**Token impact**: Theoretical massive savings, but not implementable with current Claude Code capabilities.

---

## 4. Tool Landscape Comparison

### GSD (get-shit-done) — primary competitor

GSD is the closest competitor: same Claude Code plugin paradigm, same research-plan-build-verify workflow, similar agent architecture. The [full competitive analysis](gsd-analysis-feb2026.md) covers 22 releases (v1.11.2 to v1.20.3) in detail. Key architectural differences:

**Monolithic vs modular**: GSD's `gsd-tools.cjs` is a ~4,500-line monolithic CLI with 80+ commands. Towline uses modular hook scripts (~5,000 lines across 12 files) that fire on lifecycle events. GSD compensates for lacking hooks by moving deterministic work into CLI commands. Towline's hook system handles the same work with zero orchestrator token cost (though each hook fires a Node process spawn — latency, not tokens).

**Context loading**: GSD introduced "compound init" commands that return all context in a single JSON blob — replacing 5-10 sequential reads. Towline's `progress-tracker.js` (SessionStart hook) injects state automatically with zero explicit orchestrator calls. Towline's approach is more elegant but less flexible.

**Token efficiency**: GSD's `gsd-tools.cjs` is loaded into every agent spawn as a tool (~2,000 tokens). Towline's `towline-tools.js` is loaded only by hook scripts, never by agents — a structural token advantage.

**Testing**: Towline has 496 tests across 31 suites with 3-platform CI. GSD has a single test file for `gsd-tools`. This difference matters for reliability and regression prevention.

**Governance**: GSD has 14,931 stars but a single-maintainer bottleneck (60+ open PRs, mass-revert of 12 community PRs, AI bulk-closing of 66+ issues). Towline's open development model avoids these friction points.

**Spawn counts**: Both tools have similar spawn counts for equivalent workflows. Project init: 6 agents (GSD) vs similar (Towline). Phase planning: 3 agents each. Execution: 2+ agents each. The real efficiency difference isn't in spawn count but in per-spawn token overhead — where Towline's lazy-loading gives it an edge.

### Other AI development tools

**Aider**: Git-centric CLI with explicit file selection. Its "repo map" concept uses ~7% of context to provide structural awareness of the full codebase. Relevant to Towline: a lightweight codebase summary injected into agent prompts could improve file selection without full codebase scanning. Aider's approach is complementary — it optimizes within a single context window rather than delegating to subagents.

**Cline**: Human-in-the-loop approval at every step. The opposite philosophy from Towline's autonomous agent delegation. Useful as a reference point: Cline users accept higher latency (approval delays) for tighter control. Towline could offer a "supervised mode" where agents pause for approval at checkpoints, but this should remain opt-in.

**Continue.dev**: IDE-embedded with 4-mode architecture (Chat, Edit, Agent, Autocomplete). The most notable pattern is mode-specific context loading — different modes load different amounts of codebase context. This reinforces the case for Towline's configurable depth profiles.

**Cursor 2.0**: Multi-agent with background indexing. Cursor's background indexing maintains a persistent codebase understanding that agents can query cheaply. Towline's `/dev:scan` creates similar artifacts (codebase maps) but they're one-shot rather than continuously updated. Continuous indexing would require a persistent process — not feasible in Claude Code's plugin model.

**Copilot Workspace**: Spec-as-intermediate representation. Users write a natural language spec, the system generates an implementation plan, then code. The spec acts as a shared understanding between human and AI. Towline's PLAN.md serves a similar role but is generated by agents rather than co-written with the user. The `/dev:discuss` skill bridges this gap by capturing user decisions before planning.

---

## 5. What Towline Already Does Better

These advantages should be preserved in any redesign:

- **Clean orchestrator/agent separation**: Each agent gets a fresh 200k context window. No cross-contamination between planning and execution contexts. This is architecturally superior to tools that run everything in one session.
- **File-based state**: PLAN.md, STATE.md, ROADMAP.md are human-readable, git-trackable, and portable. They work across sessions, survive context compaction, and can be inspected without running Towline.
- **Goal-backward verification**: The verifier agent checks outcomes against phase goals — "did we actually achieve what we set out to do?" — rather than just confirming tasks were completed. Most tools check task completion; Towline checks goal achievement.
- **Hook ecosystem**: 12 hook entries across 8 event types dispatch to ~12 distinct scripts, providing safety gates (commit validation, dangerous command blocking), context management (budget tracking, compaction preservation), and workflow automation (auto-continue, progress injection) — all at zero orchestrator *token* cost. However, hooks do incur process spawn overhead: 4 spawns per Write/Edit call (1 PreToolUse + 3 PostToolUse), 1 per Read, 1 per Bash, 2 per agent lifecycle (start + stop). A large build with 50 writes + 30 reads + 20 bash calls + 3 agent spawns = ~250 process spawns. Each spawn is milliseconds, but the latency compounds. This is a latency cost, not a token cost — and still a net positive given the safety and tracking benefits.
- **Wave-based parallelism**: Plans with independent tasks execute in parallel waves. GSD and most competitors execute tasks sequentially.
- **Test coverage**: 496 tests across 31 suites with cross-platform CI (Windows, macOS, Linux). This is unusually high for AI workflow tools and provides confidence for refactoring.

---

## 6. High-Impact Improvements — Prioritized

Ranked by token savings for MAX 5x users. Each recommendation includes effort estimate and implementation notes.

### TIER 1: Direct token savings (HIGH impact, LOW-MEDIUM effort)

#### 1.1 Agent spawn reduction

**The single biggest cost lever.** Each avoided spawn saves the entire prompt + response token cost.

| Optimization | Savings | Effort | Implementation |
|-------------|---------|--------|---------------|
| Make plan-checker optional | 1 spawn per phase | Low | Config gate `gates.plan_check: true/false`, default `true` for thorough, `false` for budget/balanced depth |
| Combine research + planning | 1 spawn for well-understood phases | Medium | When `/dev:plan` detects existing codebase context (scan artifacts, prior phase summaries), skip separate research agent and inject context directly into planner prompt |
| Skip verifier for trivial phases | 1 spawn for < 3 tasks | Low | Config gate `gates.verify_trivial: false`, auto-skip when plan has fewer than 3 tasks |
| Extend `/dev:quick` pattern | N/A | Low | `/dev:quick` already skips research, plan-checking, and verification. Document this as the "budget mode" pattern and make it easier to apply to regular phases |
| Scan depth profiles | 2 spawns saved in budget mode | Low | Budget mode spawns 2 mapper agents (tech + architecture only). Thorough mode spawns all 4 (tech, architecture, quality, concerns). Currently always 4. |
| Debug hypothesis cap | Variable (prevent runaway) | Low | Configurable max hypothesis rounds (default 5) to prevent unbounded sequential debugger agent spawns |

**Estimated savings**: 1-3 fewer spawns per phase. For a 5-phase milestone, this could save 5-15 agent spawns — a significant portion of a MAX 5x budget window.

#### 1.2 PLAN.md summary injection

**Current**: The executor receives the full PLAN.md inlined into its prompt (~1,500 tokens for a typical plan).

**Proposed**: Generate a structured summary when writing PLAN.md (task list with one-line descriptions, key file paths, must-haves) and inject only the summary (~500 tokens). The executor can `Read` the full plan if it needs details for a specific task.

**Savings**: ~1,000 tokens per executor spawn. For phases with multiple executor spawns (large builds), the savings compound.

**Effort**: Low. Modify the planner agent to emit a `## Summary` section in PLAN.md. Modify the build skill to inject only the summary section instead of the full plan.

#### 1.3 Skill template compression

**Current**: 75% of SKILL.md content is routing, gates, error handling, and boilerplate shared across skills.

**Progress**: Shared fragments are already ~60% extracted — 12 fragments exist in `skills/shared/` totaling 1,253 lines (`config-loading.md`, `digest-select.md`, `revision-loop.md`, `context-loader-task.md`, `universal-anti-patterns.md`, etc.).

**Remaining candidates** (~400 lines of extractable boilerplate):
- Argument parsing pattern — used by 6 skills
- State reconciliation logic — used by 5 skills
- Agent spawn scaffold — used by 6 skills
- Commit workflow pattern — used by 8 skills

**Template deduplication**: Researcher/planner/checker prompt templates in `templates/` share ~30-40% scaffolding (context blocks, output format headers, quality criteria). Consolidating shared template partials could reduce total template volume.

**Savings**: Difficult to quantify precisely — skill loading is already efficient due to Claude Code's 2% budget scaling. But smaller skills mean faster parsing and less orchestrator reasoning about routing logic.

**Effort**: Medium. Requires careful extraction to ensure fragments are truly shared and don't introduce coupling between skills.

#### 1.4 Configurable depth profiles

**Current**: All workflows run at full depth — research + plan + check + build + verify.

**Proposed**: Three depth profiles that affect agent count and prompt verbosity:

| Profile | Research | Plan-check | Verifier | Prompt style |
|---------|----------|------------|----------|-------------|
| Budget | Skip if context exists | Skip | Skip if < 3 tasks | Concise |
| Balanced | Conditional | Run | Run | Standard |
| Thorough | Always | Run | Always | Comprehensive |

**Savings**: Budget mode saves 1-3 spawns per phase. Thorough mode is the current default.

**Effort**: Low-Medium. The config infrastructure exists (`/dev:config` already manages model profiles). Add depth profile selection that maps to gate configurations.

**Config complexity warning**: ~62 config properties already exist across 11 top-level sections (version, context_strategy, mode, depth, features, models, parallelization, planning, git, gates, safety, hooks, status_line). Depth profiles should REPLACE granular toggles (features.plan_checking, features.research_phase, gates.*), not add to them. Implementation: profile presets that configure 10-15 properties at once, hiding complexity behind a single `depth` setting. Goal: reduce effective user-facing complexity from ~62 properties to ~20 user-facing + ~42 managed-by-presets.

#### 1.5 Agent output budgets

**The easiest HIGH-impact improvement — pure prompt changes, zero code.**

Agent definitions constrain output *structure* via templates but never specify target output *size*. Adding explicit output budgets to each agent definition could reduce output tokens by 20-40% with no code changes.

| Agent | Output artifact | Current size | Target | Guidance to add |
|-------|----------------|-------------|--------|-----------------|
| Executor | SUMMARY.md | Unbounded | ≤ 800 tokens | "Focus on what was built and key decisions. Omit per-task narration." |
| Verifier | VERIFICATION.md | Unbounded | ≤ 1,200 tokens | "One evidence row per must-have. Anti-pattern scan: blockers only." |
| Researcher | Research findings | Unbounded | ≤ 1,500 tokens/dimension | "Prioritize verified facts. Skip background context the planner already has." |
| Planner | PLAN.md | Unbounded | ≤ 2,000 tokens | "One-line task descriptions. File paths, not explanations." |
| Synthesizer | SUMMARY.md | Unbounded | ≤ 1,000 tokens | "Matrix + recommendation. No restating inputs." |

**Savings**: Estimated 20-40% output reduction across all agent spawns. No code changes required — add an "Output Budget" section to each agent definition in `agents/towline-*.md`.

**Effort**: Low. Pure prompt engineering.

#### 1.6 CONTEXT.md summary extraction

**Current**: The full CONTEXT.md (~1,200 tokens) is loaded into 3-4 separate agent contexts during each planning cycle — researcher, planner, and plan-checker each receive the complete file in their fresh 200k window.

**Proposed**: The discuss skill generates a `## Decision Summary` section in CONTEXT.md containing only locked decisions (~300 tokens). The plan skill injects only this summary section into agent prompts instead of the full CONTEXT.md.

**Savings**: ~2,400-3,600 tokens per planning cycle (eliminate 2-3 redundant full CONTEXT.md loads across agents).

**Effort**: Low. Modify discuss/SKILL.md to emit a summary section, then modify plan/SKILL.md context assembly to extract and inject only the summary.

### TIER 2: Smarter context loading (HIGH impact, MEDIUM effort)

#### 2.1 Streaming context loader

**Current**: Agent prompts are fully assembled before spawning — all context is injected upfront.

**Proposed**: Agents start with a manifest of available artifacts and request specific ones on-demand. The spawn prompt includes only: phase goal, task summary, key constraints. Detailed context (full plan, codebase map, prior phase summaries) is pulled via `Read` calls when the agent determines it needs them.

**Implementation**: Modify agent prompts to include a "Available artifacts" section listing file paths and one-line descriptions. Agents already have `Read` in their tool set — they just need guidance to use it for context loading rather than receiving everything upfront.

**Savings**: Reduces initial prompt size by 30-50% for agents that don't need all available context. The trade-off is additional `Read` tool calls, but these are cheap compared to prompt tokens.

**Effort**: Medium. Requires changes to how skills assemble agent prompts and how agents are instructed to load context.

#### 2.2 Hierarchical memory

**Current**: STATE.md is a flat file tracking current position, recent history, and active config.

**Proposed**: Structure state hierarchically by milestone and phase. Agents working on phase 15 receive only milestone-level summary + phase 15 details, not the full history of phases 1-14.

**Implementation**: Split STATE.md into `STATE.md` (current position only) + `HISTORY.md` (milestone summaries) + per-phase `SUMMARY.md` (already exists). Agents receive STATE.md + relevant SUMMARY.md files, not the full history.

**Savings**: Proportional to project size. For a 20-phase project, an agent that previously received 20 phase summaries now receives 1-2. Negligible for small projects.

**Effort**: Medium. Requires changes to state management in `towline-tools.js` and agent prompt assembly.

#### 2.3 Claude Code v2.1.33 features adoption

Three features from recent Claude Code releases that Towline should adopt:

- **Agent `memory` frontmatter** (none/user/project): Already present in Towline agent definitions. Verify settings are optimal — agents that don't need cross-session memory should use `none` to avoid loading irrelevant memories.
- **Sub-agent spawning restrictions** via `tools` frontmatter: Prevent agent sprawl by declaring which agents each agent can spawn. Executors should not spawn planners; verifiers should not spawn executors. This enforces the intended coordination graph.
- **`TaskCompleted` hook event**: Could replace polling-based workflow chaining. When an executor completes, the hook fires and triggers verification automatically.

**Effort**: Low for each individual adoption. These are configuration changes, not architectural ones.

### TIER 3: Architectural improvements (MEDIUM impact, MEDIUM effort)

#### 3.1 Event-driven phase transitions

**Current**: Phase transitions require manual `/dev:continue` or explicit skill invocation.

**Proposed**: Use Claude Code's `TaskCompleted` hook event to auto-trigger the next workflow step. When an executor spawn completes, the hook detects whether verification is needed and triggers it. When verification completes, the hook updates STATE.md and surfaces the result to the user.

**Savings**: Eliminates orchestrator reasoning for "what's next?" decisions. Small per-transition saving but compounds across a multi-phase milestone.

**Effort**: Medium. Requires a new hook script and careful handling of error cases (what if the executor failed? what if verification should be skipped?).

#### 3.2 DAG-based task scheduling

**Current**: Wave-based parallelism groups tasks into sequential waves where all tasks in a wave can run in parallel.

**Proposed**: Model tasks as a DAG and use topological sort for finer-grained parallelism. A task starts as soon as its dependencies complete, not when its entire wave completes.

**Savings**: Reduces total wall-clock time for phases with uneven wave sizes. Token cost is unchanged — the same number of agents are spawned.

**Effort**: Medium. Requires changes to the planner's wave assignment logic and the build skill's execution loop.

#### 3.3 Adaptive agent model selection

**Current**: Agent models are set in frontmatter (e.g., `model: sonnet`) or inherited from the session.

**Proposed**: Choose the agent model based on task complexity. Simple tasks (< 3 files, well-defined) use Haiku. Complex tasks (architectural changes, multi-file refactoring) use Sonnet or Opus. The planner annotates each task with a complexity estimate.

**Savings**: Haiku is significantly cheaper than Sonnet/Opus. Using it for simple tasks within a phase reduces per-spawn cost.

**Effort**: Medium. Requires the planner to emit complexity annotations and the build skill to map complexity to model selection.

### TIER 4: Power user — Agent Teams

For users willing to spend more tokens for higher quality output.

**Concept**: Multiple specialized agents collaborate on a single phase simultaneously. Instead of the sequential researcher-planner-executor pipeline, spawn a "team" of 2-3 agents with complementary roles that work in parallel and cross-review.

**Where it helps most:**

- **Complex planning**: An architect agent + security reviewer + test designer produce a more robust plan than a single planner. The architect focuses on structure, the security reviewer identifies attack surfaces, the test designer ensures testability. Their outputs are synthesized into a single PLAN.md.
- **Large builds**: Multiple executors working on independent task groups simultaneously. Towline already supports wave-based parallelism — teams extend this to the planning stage.
- **Code review**: A functional reviewer + security auditor + performance analyst catch more issues than a single reviewer agent.

**Cost trade-off**: 2-3x more spawns per phase, but potentially higher quality output that avoids costly rework. A team-planned phase that builds correctly on first try may cost less total than a solo-planned phase that needs debugging and re-execution. Best for critical phases, security-sensitive code, and complex integrations. Not worth the cost for simple CRUD, config changes, or documentation updates.

**Implementation approach**: Configurable per-phase via `config.json` (`agent_teams: true`) or per-skill flag (`--teams`). Teams use Claude Code's experimental `TeamCreate`/`SendMessage` infrastructure when available, falling back to parallel `Task()` spawns with file-based coordination.

**Comparison with GSD**: GSD PR #591 proposes agent teams but hasn't been merged. The maintainer indicated GSD will wait for Claude Code's native team infrastructure. Towline could implement a pragmatic version using parallel spawns + synthesizer before native teams stabilize.

### TIER 5: Research-only (future exploration)

These paradigms showed theoretical promise but aren't practical for Towline today:

- **Spec-first formal verification** (TLA+): Requires expertise most users lack. Overkill for typical projects. Revisit if Claude Code adds formal specification support.
- **Self-modifying workflows**: Needs persistent performance data across many runs. The tracking infrastructure has its own cost. Revisit when Towline has enough usage data to make informed self-modifications.
- **Token compression via soft prompts**: Requires model fine-tuning access not available through Claude Code's API. Revisit if Anthropic exposes prompt compression capabilities.

---

## 7. GSD Token Cost Comparison

Direct comparison of per-workflow token costs between Towline and GSD:

| Workflow | GSD spawns | Towline spawns | Notes |
|----------|-----------|---------------|-------|
| Project init | 4 researchers + synthesizer + roadmapper (6) | researcher + planner (2-3) | GSD's 4 parallel researchers are thorough but expensive. Towline's `/dev:begin` with `depth: standard` is leaner. |
| Phase planning | researcher + planner + plan-checker (3) | researcher + planner + plan-checker (3) | Equivalent spawn count. Towline's lazy-loading reduces per-spawn prompt size. |
| Phase execution | executor + verifier (2+) | executor(s) + verifier (2+) | Equivalent. Towline's wave parallelism may spawn multiple executors for large phases. |
| Quick task | executor (1) | executor (1) | Both have "quick" modes that skip optional agents. |

**Per-spawn overhead comparison:**

- GSD loads `gsd-tools.cjs` (~2,000 tokens) into every agent as a tool. Towline's `towline-tools.js` is loaded only by hooks, never by agents. **Advantage: Towline.**
- GSD's compound init commands return ~500-1,000 tokens of context per agent. Towline's progress-tracker hook injects similar context at zero orchestrator cost. **Advantage: Towline.**
- GSD has no "budget mode" or configurable depth — it always runs the full pipeline. Towline's proposed depth profiles (Tier 1.4) would widen this gap. **Advantage: Towline (with depth profiles).**

**Key insight**: Both tools have similar spawn counts for equivalent workflows. The efficiency difference is in per-spawn overhead, where Towline's lazy-loading and hook-based injection provide a structural advantage. The real opportunity for both tools is making spawn count configurable — running fewer agents for simple work and more for complex work.

**Workflow-specific cost comparison:**

- **Debugging**: GSD has no dedicated debug agent or skill — debugging is ad-hoc within the executor or manual. Towline's `/dev:debug` provides structured hypothesis testing with persistent state across sessions, but can spawn 5+ sequential debugger agents for complex issues. Thorough but expensive; a hypothesis round cap (Tier 1.1) would bound this cost.
- **Codebase scanning**: GSD's `/gsd:map-codebase` uses 7 focus templates (tech, architecture, quality, concerns, domain, patterns, testing) — more granular than Towline's 4 mapper agents. Compare artifact sizes and utility: more templates don't necessarily mean better output if agents overlap.
- **Configuration**: GSD relies on opinionated defaults with fewer config options. Towline's ~62 config properties provide more flexibility but more friction. GSD's approach is simpler for new users; Towline's is more powerful for experienced users. Depth profiles (Tier 1.4) should close this gap by hiding complexity behind presets.

---

## 8. Claude Code Platform Evolution

### Already available (v2.1.31–v2.1.44) — adopt now

| Feature | Version | Towline action |
|---------|---------|---------------|
| `TeammateIdle` / `TaskCompleted` hook events | v2.1.33 | Enable event-driven phase transitions (Tier 3.1) |
| Agent `memory` frontmatter (none/user/project) | v2.1.33 | Verify current settings are optimal |
| Sub-agent spawning restrictions via `tools` | v2.1.33 | Add restrictions to prevent agent sprawl |
| Skill character budget scaling (2% of context) | v2.1.32 | Review skill descriptions for conciseness |
| Hook stderr visibility fix | v2.1.41 | Review hook error messages for clarity |
| Fast mode (same Opus 4.6, faster output) | v2.1.36 | Transparent — no changes needed |
| Plugin name in skills menu | v2.1.33 | Already working — `dev:*` prefix shows correctly |

### Anticipated Claude Code directions

Based on the trajectory of recent releases, these features are likely coming:

- **Native task/todo management**: Claude Code's built-in `TaskCreate`/`TaskUpdate` tools are maturing. If they gain persistence across sessions, Towline's file-based todo system could migrate to the native implementation. Towline's value-add (themes, priorities, promotion from notes) would layer on top.
- **Improved context compression**: Each release improves how Claude Code handles context limits. Better compression reduces the urgency of Towline's context budget management — but the workflow structure (research-plan-build-verify) remains valuable regardless.
- **Built-in agent orchestration**: If Claude Code adds native multi-step workflow support (e.g., "run agent A, then agent B if A succeeds"), Towline's skill-level orchestration could simplify significantly. Skills would become thinner — just declaring the workflow graph rather than implementing it.
- **MCP server improvements**: Richer tool integrations could enable streaming context loading (Tier 2.1) natively. If Claude Code supports artifact manifests in MCP, Towline's agents could request context on-demand without custom implementation.
- **Better subagent communication**: Currently agents communicate through files on disk. If Claude Code adds direct agent-to-agent messaging (beyond the experimental `SendMessage`), file-based state passing could become optional for some workflows.

### Towline's adaptation strategy

1. **Native replacement readiness scores**: Each Towline feature should be rated for how likely Claude Code is to nativize it. Features with high scores (todos, basic orchestration, context compression) should be implemented as thin wrappers. Features with low scores (goal-backward verification, wave parallelism, depth profiles) are Towline's durable value.

2. **Migration within one release cycle**: When Claude Code adds a native equivalent, Towline should migrate within one release. Config flags (`use_native_todos: true`) can ease the transition.

3. **Value in the workflow layer**: Towline's durable competitive advantage is the workflow orchestration layer — the research-plan-build-verify pipeline with configurable depth, gate controls, and goal-backward verification. Low-level plumbing (file reading, tool dispatch, context management) should defer to Claude Code whenever possible.

4. **Interface, don't replace**: Build on top of Claude Code's plugin API rather than working around it. Every workaround is technical debt that will break when the platform evolves.

---

## 9. Multi-LLM CLI Portability

Towline is currently Claude Code-only, but its core workflow patterns (research-plan-build-verify) are model-agnostic. A future Towline version should consider portability.

### Primary targets

**OpenCode** — Open-source CLI supporting 75+ LLM providers including local models. The most natural fit: it already has a plugin/extension model, and Towline's file-based state and agent-spawning pattern could map directly. The challenge is OpenCode's different tool-calling conventions and hook system.

**Aider** — Git-centric CLI with multi-file coordination. Towline's commit conventions and atomic commit patterns align well. Aider's repo map concept (~7% context) could enhance Towline's codebase scanning. The challenge is Aider's different agent model (single session, explicit file selection).

**Codex CLI** (OpenAI) — Strong code generation with subscription-based pricing. Would need an adapter for OpenAI's function-calling API vs Claude's tool-use format.

**Gemini CLI** (Google) — The most interesting target due to the 1M token context window. This fundamentally changes the context budget calculus: Towline's aggressive context management becomes less critical, but its workflow structure (research-plan-build-verify with verification) is still valuable. A Gemini adapter could potentially run the full workflow in a single context window without subagent delegation.

**Amazon Q Developer CLI** — Enterprise-focused, could be relevant for team/corporate adoption.

### Portability layers needed

| Layer | Portability | Notes |
|-------|------------|-------|
| `Task()` spawning | Adapter needed | Each CLI has different subagent APIs |
| Tool names (Read, Write, Edit, Bash, Grep, Glob) | Adapter needed | Most CLIs have equivalents with different names |
| Hook system | Adapter needed | `hooks.json` is Claude Code-specific |
| File-based state (PLAN.md, STATE.md, ROADMAP.md) | Inherently portable | Plain markdown — readable by any LLM |
| Workflow logic (research-plan-build-verify) | Inherently portable | Conceptual pipeline, not tied to Claude Code |
| Skill frontmatter (YAML) | Adapter needed | Skill registration differs per CLI |

### Realistic assessment

Full portability is a significant engineering effort — probably a v3 goal, not v2. However, designing v2 with a clean adapter boundary makes future portability much cheaper. The architecture should separate:

- **Towline Core**: Workflow logic, state management, depth profiles, gate controls. No Claude Code-specific APIs.
- **Claude Code Adapter**: Hooks, skill frontmatter, tool names, `Task()` spawning. All Claude Code-specific code lives here.

The immediate win for v2: ensure Towline's workflow files (PLAN.md, STATE.md, ROADMAP.md, config.json) are documented well enough that any LLM could read and act on them — not just Claude. This is already mostly true since these are plain markdown and JSON.

---

## 10. Conceptual Towline v2 Architecture

A vision combining Towline's proven strengths with cost-aware improvements.

### Keep (proven strengths)

- **Subagent delegation** with fresh 200k windows — the foundation of context hygiene
- **File-based state** — portable, debuggable, git-trackable
- **Goal-backward verification** — checking outcomes, not just task completion
- **Plugin architecture** — portable across projects, clean installation
- **Hook ecosystem** — zero orchestrator token cost lifecycle automation (process spawn latency is the trade-off)
- **Wave-based parallelism** — concurrent execution of independent tasks

### Add (new capabilities)

- **Configurable depth profiles** (budget/balanced/thorough) — the single most impactful addition. Budget mode saves 1-3 spawns per phase, making Towline viable for MAX 5x users with tight budgets.
- **PLAN.md summary injection** — reduce executor prompt size by ~1,000 tokens per spawn
- **Streaming context loading** — agents request artifacts on-demand instead of receiving everything upfront
- **Event-driven phase transitions** — auto-trigger verification after execution via `TaskCompleted` hooks
- **Adaptive model selection** — Haiku for simple tasks, Sonnet for complex ones, within a single phase

### Reduce (unnecessary costs)

- **Optional agents behind gates** — plan-checker off by default for budget/balanced depth, verifier skipped for trivial phases
- **Compressed skill templates** — extract 75% shared boilerplate into reusable fragments
- **Summary-based plan injection** — structured summary instead of full PLAN.md inlining
- **Milestone-scoped memory** — agents receive only relevant phase context, not full project history

### Evolve (architectural improvements)

- **Event-driven transitions** — `TaskCompleted` hooks replacing manual `/dev:continue`
- **Agent spawning restrictions** — prevent agents from spawning inappropriate sub-agents
- **Adaptive workflows** — system learns which phases benefit from full pipeline vs quick execution (long-term)

### Power mode (opt-in)

- **Agent Teams** — parallel specialists that cross-review for critical phases. Higher spawn cost but potentially lower total cost if it avoids rework.
- **Thorough depth** — always run full pipeline (research + plan-check + verify). For users who prioritize quality over budget.

### Portable (future-proofing)

- **Clean adapter boundary** separating Towline Core (workflow + state) from CLI Adapter (Claude Code hooks, tool names, spawning)
- **Self-documenting workflow files** — PLAN.md, STATE.md, ROADMAP.md readable by any LLM
- **Future adapters** for OpenCode, Aider, Gemini CLI — enabled by the adapter boundary but not built in v2

### Native-first (platform alignment)

- **Prefer Claude Code native features** over custom implementations
- **Native replacement readiness scores** for each Towline feature
- **Migration within one release cycle** when Claude Code adds an equivalent
- **Config flags** (`use_native_X: true`) for transition periods

### Philosophy

**"Every token is a user's dollar."** Towline v2 makes cost-conscious choices by default: fewer spawns, smaller prompts, lazy-loaded context, configurable depth. Power users opt into comprehensive workflows (teams, thorough depth, full verification). The system is transparent about costs — users can see how many spawns each workflow will trigger before committing to it.

---

## Appendix A: Implementation Priority Matrix

> **Status (2026-02-17)**: Items 1 (depth profiles), 2 (spawn reduction), 4 (skill compression), 6 (Claude Code adoption — now at v2.1.45), 11 (agent output budgets), and 12 (CONTEXT.md extraction) are DONE. Items 3 (PLAN.md summary), 5 (streaming context), 8 (adaptive model), and 13 (config presets) are PARTIAL or deferred. Item 10 (multi-LLM) is deferred indefinitely.

| # | Improvement | Impact | Effort | Tier | Token savings |
|---|------------|--------|--------|------|--------------|
| 1 | Configurable depth profiles | HIGH | LOW-MED | 1 | 1-3 spawns/phase |
| 2 | Agent spawn reduction (optional gates) | HIGH | LOW | 1 | 1-3 spawns/phase |
| 3 | PLAN.md summary injection | HIGH | LOW | 1 | ~1,000 tokens/executor |
| 4 | Skill template compression | MED | MED | 1 | Variable |
| 5 | Streaming context loader | HIGH | MED | 2 | 30-50% prompt reduction |
| 6 | Claude Code v2.1.33 adoption | MED | LOW | 2 | Indirect (safety, efficiency) |
| 7 | Event-driven phase transitions | MED | MED | 3 | Small per-transition |
| 8 | Adaptive model selection | MED | MED | 3 | Variable (Haiku vs Sonnet) |
| 9 | Agent Teams (power mode) | MED | MED | 4 | Negative (more spawns) but quality ROI |
| 10 | Multi-LLM adapter boundary | LOW (v2) | MED | — | Future-proofing only |
| 11 | Agent output budgets | HIGH | LOW | 1 | 20-40% output reduction |
| 12 | CONTEXT.md summary extraction | HIGH | LOW | 1 | ~2,400-3,600 tokens/plan cycle |
| 13 | Config simplification (presets) | MED | MED | 1 | Indirect (user friction reduction) |

## Appendix B: Towline Feature — Native Replacement Readiness

| Feature | Readiness | Claude Code trajectory | Towline action |
|---------|-----------|----------------------|---------------|
| File-based todos | HIGH | TaskCreate/TaskUpdate maturing | Thin wrapper, prepare to migrate |
| Context budget tracking | HIGH | Context compression improving | Monitor, keep as safety net |
| Basic orchestration | MEDIUM | No native workflow engine yet | Keep, but keep skills thin |
| Auto-continue | MEDIUM | Could become native hook pattern | Keep current implementation |
| Goal-backward verification | LOW | No equivalent on horizon | Durable Towline value |
| Wave-based parallelism | LOW | No equivalent on horizon | Durable Towline value |
| Depth profiles | LOW | No equivalent on horizon | Durable Towline value |
| Commit validation hooks | LOW | Unlikely to be nativized | Durable Towline value |

## Appendix C: Source Attribution

| Finding | Source |
|---------|--------|
| Orchestrator at 2-10% context | Token efficiency audit (research agent 1) |
| 75% skill content is boilerplate | Token efficiency audit (research agent 1) |
| PLAN.md inlining ~1,500 tokens | Token efficiency audit (research agent 1) |
| Event-driven, spec-first, streaming paradigms | Alternative paradigms research (research agent 2) |
| SHIMI hierarchical memory, Zep knowledge graphs | Alternative paradigms research (research agent 2) |
| 480x token compression ratios | Alternative paradigms research (research agent 2) |
| Aider repo map (7% context) | Tool comparison research (research agent 3) |
| Cline human-in-loop, Cursor multi-agent | Tool comparison research (research agent 3) |
| GSD architecture, gsd-tools.cjs, spawn counts | [GSD competitive analysis](gsd-analysis-feb2026.md) |
| Claude Code v2.1.31-v2.1.44 features | [GSD competitive analysis](gsd-analysis-feb2026.md), Appendix A |
| GSD governance issues, PR backlog | [GSD competitive analysis](gsd-analysis-feb2026.md), Section 5 |
| Agent output verbosity gap | Gap analysis (explore agents, 2026-02-17) |
| CONTEXT.md redundant loading | Gap analysis (explore agents, 2026-02-17) |
| Cold start / onboarding cost | Gap analysis (explore agents, 2026-02-17) |
| Config property count (~62) | Gap analysis (explore agents, verified manually) |
| Hook process spawn counts | Gap analysis (explore agents, corrected manually) |

## Appendix D: Cost Centers Requiring Measurement

Consolidated from the gap analysis. These are areas where costs are real but unmeasured — optimization should be preceded by baseline measurement.

| Cost center | Current cost | Measured? | Proposed optimization |
|-------------|-------------|-----------|----------------------|
| Agent output verbosity | Unbounded (200k max per agent) | No | Output budgets in agent definitions (Tier 1.5) |
| CONTEXT.md per plan cycle | ~3,600-4,800 tokens (3-4 redundant loads) | No | Summary extraction (Tier 1.6) |
| `/dev:begin` comprehensive | 6 agents, ~12,000+ prompt tokens | Partially | Depth profiles (Tier 1.4) |
| `/dev:debug` per session | 1-5+ agents, highly variable | No | Hypothesis round cap (Tier 1.1) |
| `/dev:scan` | 4 agents fixed, ~8,000 tokens | No | Scan depth profiles (Tier 1.1) |
| Resume tax per invocation | 150-700 tokens | No | State caching / leaner resume |
| Hooks per Write/Edit | 4 process spawns (latency, not tokens) | No | Further dispatch consolidation possible |
| Template redundant reads | 150-600 tokens per skill invocation | No | Template deduplication (Tier 1.3) |
| Shared fragment coverage | ~60% extracted, ~400 lines remain | Partially | Complete extraction (Tier 1.3) |
