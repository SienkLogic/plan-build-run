# Towline: Rebuild & Enhancement Plan

## Context

**Towline** is a rebuilt and enhanced Claude Code plugin inspired by the original [get-shit-done](https://github.com/glittercowboy/get-shit-done) (GSD, 11.9k stars) - a pure-markdown meta-prompting system that solves "context rot" (quality degradation as Claude's 200k context window fills up). The original GSD uses 25 slash commands, 11 agents, 12 workflows, 19 templates, and 9 reference docs installed via `npx get-shit-done-cc`.

**Why rebuild as Towline?** Claude Code has evolved dramatically since GSD was created. Native features now exist for things GSD hand-rolled: the Skills system replaces the old commands format, Hooks replace fragile shell-based validation, native Task management replaces grep/sed state parsing, the Plugin system enables clean distribution, and Agent Teams provide opt-in collaborative coordination. The original has known bugs (fragile JSON parsing via grep/sed, hardcoded paths, inconsistent error handling). Towline is a ground-up rebuild that leverages these native primitives rather than working around their absence.

**Why a framework still matters:** The target user is on Claude Code Max 5x plan with a **200k token context window** (the 1M extended context is API-only, not available in standard Claude Code today). Context rot remains the #1 problem - quality degrades noticeably above ~100k tokens (50% fill). The core insight from GSD - spawn fresh subagent contexts for heavy work to keep the main window lean - is **more relevant than ever**, not less. Native features like auto-compaction (triggers at 95%) are a safety net, not a strategy: compaction is lossy and drops important details. A disciplined framework that enforces context isolation by default gives users better results than relying on manual `/clear` and `/compact` habits.

**Designing for evolution:** Claude Code is evolving fast. 1M context windows may come to all users. Agent Teams may stabilize. New native features will emerge. Towline must be **adaptable by design** - easy to dial down when native capabilities catch up, easy to extend when new primitives appear. The architecture uses configuration-driven behavior, feature flags, thin skill wrappers over native primitives, and clean separation of concerns so individual components can be swapped, disabled, or simplified without rewriting the whole system.

---

## Design Philosophy

### Why Not "Just Use Native Claude Code"?

Anthropic's docs recommend Plan Mode + subagents + hooks. This works for experienced users who build practices organically. But for most developers:

1. **Context rot is invisible** - Users don't notice quality degrading until results are wrong. By then, the context is polluted. Towline's Task() delegation on all heavy skills prevents this by design - work happens in fresh subagent contexts, not the main window.
2. **Discipline requires enforcement** - "Plan before you code" is good advice. `/dev:plan` makes it the default path, not an optional habit.
3. **200k fills fast today** - A single research-plan-execute cycle can consume 150k+ tokens in one session. Without forced context isolation, users hit degradation within one phase. (When 1M context arrives, the `context_strategy` config lets users dial this down.)
4. **Native features are primitives, not workflows** - Task() subagents, Hooks, Skills are building blocks. Towline assembles them into a tested, opinionated workflow with proven context management patterns. The difference between having Lego bricks and having an assembled model.
5. **Verification catches lies** - Claude frequently claims task completion without finishing. Goal-backward verification (checking codebase reality, not Claude's claims) catches this reliably.
6. **Frameworks should get thinner over time, not thicker** - As Claude Code matures, Towline should gracefully delegate to native features. Every component is designed to be disabled when the platform catches up.

### What We Keep from v1
- Context engineering via fresh subagent windows (the core value)
- Spec-driven development with XML task prompts (proven effective)
- Progressive workflow: discuss -> plan -> execute -> verify
- State on disk surviving context resets
- Goal-backward verification
- Atomic commits per task
- Model routing per agent role

### What We Fix from v1
- Fragile grep/sed JSON parsing → proper scripts
- Hardcoded paths → `${CLAUDE_PLUGIN_ROOT}` references
- 25 commands → 14 skills (consolidation, not loss)
- 11 agents → 8 agents (merge related roles)
- No cross-session memory → persistent agent memory
- Prompt-only quality gates → platform-level hooks
- npx installer → native plugin distribution
- Manual parallel spawning → wave-based Task() subagents with disk-based state handoff

### What's New in v2
- **Persistent agent memory** - agents learn project patterns across sessions
- **Hook-enforced quality gates** - commit validation, task verification at platform level
- **SessionStart auto-detection** - Towline projects get state injected automatically
- **PreCompact state preservation** - state saved before lossy compaction
- **Wave-based parallel execution** - Task() subagents with disk-based state handoff (Agent Teams available as opt-in for specific scenarios)
- **Plugin distribution** - clean install/update/uninstall via marketplace

---

## Adaptability & Future-Proofing

Claude Code is a fast-moving platform. The framework must adapt to three evolution scenarios without rewrites:

### Scenario 1: 1M Context Comes to Claude Code Users
**Impact:** Context rot becomes less urgent. Aggressive Task() delegation on every skill may become unnecessary overhead.
**Adaptation:**
- `config.json` gains a `context_strategy` field: `"aggressive"` (current - delegate everything to subagents), `"balanced"` (delegate only execute/research), `"minimal"` (run everything inline, trust large context)
- Skills check this setting and conditionally spawn Task() subagents vs running work inline
- Default ships as `"aggressive"` - users opt into lighter modes as context grows

### Scenario 2: Claude Code Absorbs More Towline Features
**Impact:** If native plan management, phase tracking, or structured verification become built-in, Towline skills wrapping them become redundant.
**Adaptation:**
- Each skill is a **thin wrapper** over native primitives, not a reimplementation. If Claude Code adds native phase planning, the `/dev:plan` skill delegates to it with Towline-specific configuration rather than doing its own thing.
- Skills are independently disableable via `config.json` feature flags:
  ```json
  "features": {
    "structured_planning": true,
    "goal_verification": true,
    "context_isolation": true,
    "atomic_commits": true,
    "session_persistence": true
  }
  ```
- Hooks are opt-in/opt-out. If Claude Code adds native commit validation, the PreToolUse hook can be disabled without touching anything else.

### Scenario 3: New Primitives We Can't Predict
**Impact:** New tools, new agent types, new lifecycle events will appear.
**Adaptation:**
- **Plugin architecture** means Towline updates independently of user projects - `claude plugin update towline`
- **Agent definitions are markdown** - adding a new agent or modifying an existing one is a single file change
- **Skills reference agents by name** not by implementation - swapping an agent's internals doesn't break skills
- **Hooks use matcher patterns** - new tool names automatically get caught by existing patterns (e.g., `Write|Edit` matches future edit tools too)
- **Config is additive** - new settings get defaults, old configs keep working

### Design Principles for Adaptability
1. **Wrap, don't reimplement** - Use native features through thin skill/hook wrappers
2. **Feature flags over removal** - Disable features via config, don't delete code
3. **Agents are the stable unit** - Skills and hooks change; agent roles (research, plan, execute, verify) are durable
4. **State format is versioned** - `config.json` has a `version` field; migrations handle format changes
5. **Cross-platform from day 1** - Node.js scripts, not bash. Works on Windows, Mac, Linux.

---

## Architecture: Claude Code Plugin

### Plugin Structure

```
towline/
├── .claude-plugin/
│   └── plugin.json                 # Plugin manifest (name: "dev")
├── skills/                         # 14 skills (consolidated from 25 commands)
│   ├── begin/
│   │   ├── SKILL.md               # /dev:begin - project initialization
│   │   ├── questioning-guide.md   # Deep questioning techniques
│   │   └── templates/
│   │       ├── PROJECT.md.tmpl
│   │       ├── REQUIREMENTS.md.tmpl
│   │       ├── ROADMAP.md.tmpl
│   │       ├── STATE.md.tmpl
│   │       └── config.json.tmpl
│   ├── plan/
│   │   ├── SKILL.md               # /dev:plan - phase planning + management
│   │   ├── plan-format.md         # XML task spec reference
│   │   └── deviation-rules.md     # How executors handle unexpected situations
│   ├── build/
│   │   ├── SKILL.md               # /dev:build - phase execution
│   │   └── commit-conventions.md  # Atomic commit format reference
│   ├── review/SKILL.md            # /dev:review - verification + UAT
│   ├── discuss/SKILL.md           # /dev:discuss - pre-plan discussion
│   ├── quick/SKILL.md             # /dev:quick - ad-hoc tasks
│   ├── status/SKILL.md            # /dev:status - status & routing
│   ├── debug/SKILL.md             # /dev:debug - systematic debugging
│   ├── pause/SKILL.md             # /dev:pause - session handoff
│   ├── resume/SKILL.md            # /dev:resume - session restore
│   ├── milestone/SKILL.md         # /dev:milestone [new|complete|audit]
│   ├── scan/SKILL.md              # /dev:scan - brownfield analysis
│   ├── config/SKILL.md            # /dev:config - configure Towline
│   └── help/SKILL.md              # /dev:help - command reference
├── agents/                         # 8 specialized agents
│   ├── towline-researcher.md          # Unified research (project + phase + synthesis)
│   ├── towline-planner.md             # Plans + roadmaps
│   ├── towline-plan-checker.md        # Plan validation
│   ├── towline-executor.md            # Executes plans with atomic commits + TDD + deviations
│   ├── towline-verifier.md            # Goal-backward verification (read-only)
│   ├── towline-debugger.md            # Systematic debugging
│   ├── towline-codebase-mapper.md     # Existing codebase analysis
│   └── towline-synthesizer.md         # Research synthesis
├── hooks/
│   └── hooks.json                  # Quality gates & automation
├── scripts/                        # Hook scripts (Node.js, cross-platform)
│   ├── validate-commit.js         # Atomic commit format enforcement
│   ├── check-plan-format.js       # Plan XML validation (async)
│   ├── progress-tracker.js        # SessionStart state injection
│   ├── context-budget-check.js    # PreCompact state preservation
│   └── status-line.js             # Status line with phase/progress display
├── tests/                          # Plugin self-tests
│   ├── validate-commit.test.js
│   ├── check-plan-format.test.js
│   └── config-migration.test.js
├── README.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
└── package.json                    # npm distribution + test scripts
```

**Note:** Scripts use `.js` (Node.js) instead of `.sh` for Windows compatibility - the target user base includes Windows developers.

---

## Agent Definitions (8 agents)

All agents use YAML frontmatter with `model:`, `memory:`, `tools:`, and optional `hooks:` fields.

| Agent | Model | Memory | Tools | Key Role |
|-------|-------|--------|-------|----------|
| `towline-researcher` | sonnet | user | Read, Glob, Grep, WebFetch, WebSearch, Bash | All research: project, phase, and synthesis modes |
| `towline-planner` | inherit | project | Read, Write, Bash, Glob, Grep, WebFetch | Plans, roadmaps, requirements |
| `towline-plan-checker` | sonnet | none | Read, Bash, Glob, Grep | Validates plans achieve phase goals |
| `towline-executor` | inherit | project | Read, Write, Edit, Bash, Glob, Grep | Executes plans with atomic commits |
| `towline-verifier` | sonnet | project | Read, Bash, Glob, Grep | Goal-backward verification (NO Write/Edit) |
| `towline-debugger` | inherit | project | Read, Write, Edit, Bash, Glob, Grep | Scientific debugging with persistent state |
| `towline-codebase-mapper` | sonnet | project | Read, Bash, Glob, Grep, Write | Brownfield codebase analysis |
| `towline-synthesizer` | haiku | none | Read, Write, Bash | Fast synthesis of research outputs |

**Key design decisions:**
- `memory: user` on researcher = cross-project learning (knows patterns from all your projects)
- `memory: project` on executor/planner/verifier/debugger = per-project pattern accumulation
- `model: sonnet` on read-heavy agents (researcher, verifier, checker, mapper) = faster + cheaper
- `model: inherit` on write-heavy agents (planner, executor, debugger) = uses whatever the user runs (Opus on Max 5x)
- Verifier has NO Write/Edit tools = cannot "fix" issues it finds, only report them (prevents the v1 problem of verifiers making changes)
- Executor has frontmatter `hooks:` for PreToolUse commit validation at platform level

---

## Agent Coordination Model

### Why Task() Subagents, Not Agent Teams

GSD uses Task() subagents with wave-based parallelization - and **this is the right pattern** for Towline. After deep analysis of Agent Teams mechanics, costs, and failure modes, Teams are the wrong default:

| Factor | Task() Subagents | Agent Teams |
|--------|-----------------|-------------|
| **Token overhead** | ~20k startup per agent | ~7x single-session cost (coordination messages, idle notifications, task management) |
| **Data flow** | Disk-based: agents write to `.planning/` files, next agent reads them | Message-based: SendMessage between teammates + shared TaskList |
| **Context isolation** | Fresh 200k per spawn, clean slate | Fresh 200k per teammate, but lead's context fills with coordination overhead |
| **Failure handling** | Agent fails → returns error → orchestrator handles | Agent fails → messages may be lost, task status can lag 10-15s, no guaranteed delivery |
| **Session resume** | No issue - spawned per-operation | `/resume` and `/rewind` don't restore teammates |
| **File conflicts** | Orchestrator controls which agent touches which files | No built-in locking - last write wins |
| **Max 5x budget** | 3-5 spawns per workflow = manageable | Team of 5 = burns 5x token budget, limits daily throughput to 1-2 cycles |

**The core insight:** Towline's workflows are **structured and wave-sequential**, not collaborative. Research agents don't need to talk to each other. Executors working on different plans don't need peer-to-peer coordination. The orchestrator (skill) knows the dependency graph and controls spawning order. This is a **fan-out/fan-in** pattern, not a **collaborative** pattern - and Task() is built for fan-out/fan-in.

### How Data Flows Between Agents

```
Main Session (orchestrator skill, stays LEAN at ~10-15% context)
  │
  │ [Fan-out: parallel Task() spawns]
  ├── Task(researcher-1) → writes .planning/research/STACK.md
  ├── Task(researcher-2) → writes .planning/research/FEATURES.md
  ├── Task(researcher-3) → writes .planning/research/ARCHITECTURE.md
  ├── Task(researcher-4) → writes .planning/research/PITFALLS.md
  │
  │ [Fan-in: orchestrator reads results from disk]
  │ [Fan-out: synthesis]
  ├── Task(synthesizer) → reads research/*.md → writes SUMMARY.md
  │
  │ [Fan-in: orchestrator reads SUMMARY.md]
  │ [Orchestrator presents to user for requirements scoping]
  │
  ├── Task(planner) → reads SUMMARY.md + user decisions → writes ROADMAP.md
  │
  │ [Fan-in: orchestrator presents roadmap for approval]
  Done. Main session context used: ~15% (spawning + user interaction only)
```

**Key pattern: Data flows through files on disk, not through messages.** Each agent writes its output to a known `.planning/` path. The next agent reads from those paths. The orchestrator's only job is sequencing and user interaction. This keeps the main context lean and makes the flow debuggable (all intermediate state is on disk).

### Fresh Agents with Inlined State (Not Resumed)

When spawning an agent via Task(), the orchestrator **inlines all necessary state** into the spawn prompt. No `@` file references (these don't cross Task() boundaries). No serialized context. Explicit state only:

```markdown
<execution_context>
[Full workflow instructions for this agent role]
</execution_context>

<context>
Plan: [inline full PLAN.md content]
Project state: [inline relevant STATE.md section]
Config: [inline config.json]
Prior work: [table of completed tasks with commit hashes]
</context>
```

**Why fresh, not resumed:**
- Task() serialization can lose state unpredictably
- Explicit inlined state is verifiable - agent can confirm prior commits exist
- Clean 200k context = no accumulated noise from prior failed attempts
- If a checkpoint pauses execution, the continuation agent starts fresh with the completed-tasks table + user's checkpoint response

### Wave-Based Parallel Execution

Plans within a phase are pre-assigned **wave numbers** during planning. The orchestrator executes waves sequentially, but plans within a wave run in parallel:

```
Phase 3: Authentication
  Wave 1: [Plan-01: DB schema, Plan-02: API routes]     ← parallel
  Wave 2: [Plan-03: Frontend forms]                       ← depends on Wave 1
  Wave 3: [Plan-04: Integration tests]                    ← depends on Wave 2
```

**Parallelization rules:**
- Plans in the same wave MUST NOT modify the same files (enforced during planning)
- If `parallelization.enabled: false` → plans within a wave run sequentially (prevents test/build conflicts)
- Each plan's executor gets: its PLAN.md + phase CONTEXT.md + STATE.md + prior SUMMARY.md files from same phase
- Orchestrator blocks until all agents in a wave complete, then proceeds to next wave

### Context Budget Per Agent

Each subagent targets **~50% context usage** (100k of 200k). This is enforced through plan structure:
- Max 2-3 tasks per plan (keeps executor context focused)
- Each task has explicit `<files>`, `<action>`, `<verify>`, `<done>` elements (no ambiguity = less back-and-forth)
- Executor writes SUMMARY.md at completion (captures decisions for continuity, not a full replay)

### When Agent Teams ARE Appropriate (Opt-In)

Agent Teams become valuable when agents genuinely need **peer-to-peer collaboration** - not just parallel execution. Specific scenarios:

1. **Competing-hypothesis debugging** (`/dev:debug --team`): Spawn 3 debugger teammates each investigating a different theory. They can challenge each other's findings via messages. Much faster root cause than sequential investigation.
2. **Adversarial code review**: Frontend, backend, and security reviewers examining the same code from different angles, able to discuss findings.
3. **Complex integration work**: When two executors must coordinate on a shared interface definition (rare - good planning avoids this).

These are opt-in via `parallelization.use_teams: true` in config or `--team` flag on specific commands. Default is `false`.

---

## Token Budget & Session Management

### Max 5x Plan Reality

| Constraint | Value | Impact |
|-----------|-------|--------|
| Context window | 200k tokens | Auto-compaction at ~80-95% (lossy) |
| Messages per window | ~225 per 5-hour rolling reset | Each Task() spawn counts as messages |
| Agent startup overhead | ~20k tokens per Task() spawn | 4 parallel researchers = ~80k overhead alone |
| Agent work budget | ~100-200k tokens per spawn | Depends on task complexity + model |
| Weekly ceiling | Scaled proportional to plan tier | Hard limit, resets weekly |

### Token Cost Per Workflow

| Workflow | Agent Spawns | Est. Token Cost | % of 5-Hour Window |
|----------|-------------|----------------|-------------------|
| `/dev:begin` (full) | 4 researchers + 1 synthesizer + 1 planner = 6 | ~600-900k | 30-40% |
| `/dev:begin` (quick depth) | 2 researchers + 1 planner = 3 | ~300-450k | 15-20% |
| `/dev:plan` (full) | 1 researcher + 1 planner + 1 checker = 3 | ~300-400k | 15-20% |
| `/dev:plan` (skip-research) | 1 planner + 1 checker = 2 | ~200-300k | 10-15% |
| `/dev:build` (3-plan phase) | 3 executors + 1 verifier = 4 | ~500-700k | 25-30% |
| `/dev:build` (1-plan phase) | 1 executor + 1 verifier = 2 | ~200-350k | 10-15% |
| `/dev:review` | 1 verifier = 1 | ~100-150k | 5-8% |
| `/dev:quick` | 1 executor = 1 | ~100-200k | 5-10% |
| Full cycle (plan + build + review) | ~6-8 spawns | ~800-1,200k | 40-55% |

**Practical daily throughput on Max 5x:** 2-4 full plan→build→review cycles per 5-hour window with standard depth. More with `depth: quick` or Sonnet-only model routing.

### Cost Optimization Levers

1. **`depth` setting** (biggest lever):
   - `"quick"`: Skip research, skip plan-checking, single-pass → ~50% cost reduction
   - `"standard"`: Full pipeline (default)
   - `"comprehensive"`: Extra research, max iterations → ~2x cost

2. **Model routing** (second biggest lever):
   - Default: Sonnet for read-heavy agents, inherit (Opus) for write-heavy
   - Budget mode: `executor: "sonnet"` saves ~3x per execution agent
   - Ultra-budget: `planner: "sonnet", executor: "sonnet"` (still effective, just less creative)

3. **Researcher count** (configurable in `/dev:begin` and `/dev:plan`):
   - `depth: quick` → 0 researchers (skip)
   - `depth: standard` → 2 researchers (stack + features)
   - `depth: comprehensive` → 4 researchers (full coverage)

4. **Parallelization toggle**: `parallelization.enabled: false` → sequential execution prevents token waste from parallel failures

### Session Budget Awareness

The status line hook displays current session budget usage. Before each major operation, the skill estimates cost and warns if it would consume >50% of remaining 5-hour window budget. Users can then:
- Switch to `depth: quick` for this operation
- Downgrade models via `/dev:config`
- Proceed anyway (informed choice)

---

## Skills Design (14 skills)

### Command Consolidation (25 → 14)

| Original GSD Command(s) | New Towline Command | Why |
|--------------------------|-------------------|-----|
| `new-project` | `/dev:begin` | Clearer verb |
| `plan-phase` | `/dev:plan` | Shorter |
| `execute-phase` | `/dev:build` | Natural language |
| `verify-work` | `/dev:review` | Less formal |
| `discuss-phase` | `/dev:discuss` | Same |
| `map-codebase` | `/dev:scan` | Shorter, action-oriented |
| `quick` | `/dev:quick` | Same |
| `debug` | `/dev:debug` | Same |
| `progress` | `/dev:status` | Universal term |
| `settings`, `set-profile` | `/dev:config` | Merged, standard term |
| `pause-work` | `/dev:pause` | Shorter |
| `resume-work` | `/dev:resume` | Shorter |
| `new/complete/audit-milestone` | `/dev:milestone` | Subcommands |
| `help` | `/dev:help` | Same |
| `add-todo`, `check-todos` | *(removed)* | Native TaskCreate/TaskList |
| `update` | *(removed)* | `claude plugin update` |
| `add/insert/remove-phase` | `/dev:plan add\|insert\|remove` | Subcommands |
| `research-phase` | `/dev:plan --research` | Flag |

### Core Skills (the main loop)

**Every core skill runs as a thin inline orchestrator** that immediately delegates heavy work to Task() subagents. The user's main 200k context window stays lean (~15% usage) because skill prompts are small and all heavy lifting happens in fresh subagent contexts.

**Why not `context: fork`?** The `context: fork` skill frontmatter field is [currently not honored](https://github.com/anthropics/claude-code/issues/17283) when skills are invoked via the Skill tool - skills always run inline. Rather than depending on a broken feature, Towline skills use the **proven GSD pattern**: the skill itself is the orchestrator running in the main context, and it uses Task() to spawn subagents for all substantial work. This is actually more reliable and gives the orchestrator explicit control over context isolation. When `context: fork` is eventually fixed, skills can be migrated to use it - but the Task() delegation pattern works today and is the right default.

#### `/dev:begin` - Start a New Project
```yaml
name: begin
description: Start a new project. Deep questioning, research, requirements, and roadmap.
allowed-tools: Read, Write, Bash, Glob, Grep, WebFetch, WebSearch, Task
disable-model-invocation: true
```
**Orchestration flow** (runs inline, delegates via Task()):
1. **Deep questioning** (inline) - understand vision, detect brownfield → offers `/dev:scan`
2. **Workflow preferences** (inline via AskUserQuestion) - mode, depth, parallel, git → writes config.json
3. **Research decision** (inline) - ask if user wants domain research
4. **Research** (if yes) - spawn 2-4 parallel `Task(towline-researcher)` agents (count based on depth)
5. **Synthesis** - spawn `Task(towline-synthesizer)` → reads research → writes SUMMARY.md
6. **Requirements scoping** (inline) - interactive v1/v2/out-of-scope with REQ-IDs
7. **Roadmap generation** - spawn `Task(towline-planner)` → writes ROADMAP.md
8. **State initialization** (inline) - writes PROJECT.md, STATE.md from templates

Config.json is created in step 2 (BEFORE research), so depth/model settings are available for researcher spawning. Templates in `skills/begin/templates/`.

#### `/dev:plan` - Plan the Next Phase
```yaml
name: plan
description: Create a detailed plan for a phase. Research, plan, and verify before building.
allowed-tools: Read, Write, Bash, Glob, Grep, WebFetch, WebSearch, Task
argument-hint: "<phase-number> [--skip-research] | add | insert <N> | remove <N>"
```
**Orchestration flow** (runs inline, delegates via Task()):
1. **Load context** (inline) - read ROADMAP.md, REQUIREMENTS.md, CONTEXT.md, prior SUMMARYs
2. **Research** (if not `--skip-research`) - spawn `Task(towline-researcher)` → writes RESEARCH.md
3. **Planning** - spawn `Task(towline-planner)` with research + context → writes PLAN.md files
4. **Validation** - spawn `Task(towline-plan-checker)` → reviews plans → returns issues
5. **Revision loop** (max 3 iterations) - if issues found, re-spawn planner with feedback
6. **User approval** (inline, if `gates.confirm_plan: true`) - present plans for review

XML task format preserved from v1. Each plan has max 2-3 tasks to keep executor context focused. Subcommands for phase management: `add`, `insert N`, `remove N`.

#### `/dev:build` - Build a Phase
```yaml
name: build
description: Execute all plans in a phase. Spawns agents to build in parallel, commits atomically.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task
argument-hint: "<phase-number> [--gaps-only] [--team]"
```
**Orchestration flow** (runs inline, delegates via Task()):
1. **Discover plans** (inline) - read `.planning/phases/{NN}/*-PLAN.md`, extract wave numbers from frontmatter
2. **Wave loop** - for each wave in order:
   a. Spawn parallel `Task(towline-executor)` per plan in the wave (or sequential if `parallelization.enabled: false`)
   b. Each executor gets **inlined context**: full PLAN.md + CONTEXT.md + STATE.md + prior SUMMARY.md (no `@` refs - don't cross Task() boundaries)
   c. Block until all executors in wave complete
   d. Read SUMMARY.md from each executor, check for failures
   e. **Update STATE.md** after each wave (not just at end - enables crash recovery)
   f. Handle failures: prompt user to retry, skip, or abort
3. **Verify** - spawn `Task(towline-verifier)` for automated goal-backward verification
4. **Finalize** (inline) - update STATE.md, commit planning docs

**Checkpoint handling**: When an executor hits a checkpoint task, it returns a structured checkpoint response (with completed-tasks table + commit hashes) to the orchestrator. The orchestrator presents the checkpoint to the user via AskUserQuestion, then spawns a **fresh continuation executor** with the completed-tasks table + user's response. Fresh agents (not resumed) to ensure clean context.

**`--team` flag**: Opt-in Agent Teams mode for complex phases requiring inter-agent coordination.

#### `/dev:review` - Review What Was Built
```yaml
name: review
description: Verify the build matched the plan. Automated checks + walkthrough with you.
allowed-tools: Read, Bash, Glob, Grep, Task
```
**Orchestration flow** (runs inline, delegates via Task()):
1. **Check existing verification** (inline) - if VERIFICATION.md exists from `/dev:build`'s auto-verify, skip to step 3
2. **Automated verification** - spawn `Task(towline-verifier)` → goal-backward checks (existence → substantiveness → wiring) → writes VERIFICATION.md
3. **Conversational UAT** (inline) - walk user through each deliverable, pass/fail per item
4. **Gap handling** - on failure, suggest `/dev:plan {N} --gaps` for gap closure plans

### Supporting Skills

| Skill | Key Behavior |
|-------|-------------|
| `/dev:discuss` | Talk through a phase before planning. Identifies gray areas, captures your decisions in CONTEXT.md. |
| `/dev:quick` | Just do something quick. Atomic commits + state tracking but skips the full plan/review cycle. |
| `/dev:debug` | Systematic debugging. Hypothesis → test → observe → conclude. Persistent across sessions. |
| `/dev:status` | Where am I? Shows current phase, what's done, what's next. Routes to the right command. |
| `/dev:pause` | Save your place. Captures position, decisions, blockers, next steps for later. |
| `/dev:resume` | Pick up where you left off. Restores context and suggests what to do next. |
| `/dev:milestone` | Manage milestones: `new`, `complete`, `audit`. |
| `/dev:scan` | Analyze an existing codebase. Spawns 4 agents to map structure, architecture, conventions, concerns. |
| `/dev:config` | Configure Towline. Model selection, workflow toggles, depth, gates. |
| `/dev:help` | What commands are available? Usage examples and workflow guide. |

---

## Hooks & Scripts

### Hooks (`hooks/hooks.json`)

| Event | Purpose | Type | Blocking? |
|-------|---------|------|-----------|
| `SessionStart` | Auto-detect `.planning/` dir, inject STATE.md summary as `additionalContext` | command | No |
| `PostToolUse` (Write\|Edit on *PLAN.md) | Async validate plan XML structure | command (async) | No |
| `PreToolUse` (Bash on `git commit`) | Validate commit message follows atomic format `{type}({phase}-{plan}-{task}): {desc}` | command | Yes |
| `SubagentStop` | When executor subagent completes, validate expected SUMMARY.md + commits exist | command | No |
| `PreCompact` | Persist current state to STATE.md before lossy compaction | command | No |

### Scripts (Node.js for cross-platform)

- **`validate-commit.js`** - Reads `tool_input.command` from stdin, checks if it's a `git commit`, validates message format `{type}({phase}-{plan}): {description}`, exits 2 if invalid
- **`check-plan-format.js`** - Validates PLAN.md XML structure: each task has `<name>`, `<files>`, `<action>`, `<verify>`, `<done>`; max 3 tasks per plan
- **`progress-tracker.js`** - Reads `.planning/STATE.md`, outputs JSON with `additionalContext` containing concise project state
- **`context-budget-check.js`** - Reads and updates `.planning/STATE.md` with timestamp and last action before compaction

---

## State Management

### Hybrid: Disk State (Persistent) + Native Tasks (Session-Scoped)

**STATE.md** = persistent source of truth (survives across sessions):
- Current position ("Phase 3 of 5: Authentication")
- Key decisions made during session
- Active blockers and concerns
- Phase/plan completion status
- Session continuity information (for `/dev:pause` and `/dev:resume`)
- Next suggested action
- Max 100 lines (concise, not a full log)

**Native Tasks** = session-scoped coordination (within a single skill execution):
- During `/dev:build`: orchestrator creates native tasks per plan in the wave
- Tracks in-flight execution status with dependency chains (blockedBy/blocks)
- Assignment to specific executor agents during parallel execution
- **NOT persistent** - native tasks are lost when the session ends
- Used for real-time coordination, not cross-session state

**SUMMARY.md files** = ground truth for completed work (persistent on disk):
- Each executor writes a SUMMARY.md when it completes
- Contains: tasks completed, commit hashes, files modified, deviations noted
- Crash recovery reads SUMMARY.md files to determine what actually completed
- Verifier reads SUMMARY.md files to check claims vs codebase reality

**Update flow**: After each wave completes, the orchestrator:
1. Reads SUMMARY.md files from completed executors
2. Updates STATE.md with latest progress
3. Commits STATE.md to git (if `planning.commit_docs: true`)

No grep/sed parsing - STATE.md is written by the orchestrator skill using Write tool, not parsed from native tasks.

### `.planning/` Directory Structure
```
.planning/
├── PROJECT.md              # Vision & scope (written once)
├── REQUIREMENTS.md         # Scoped requirements with REQ-IDs
├── ROADMAP.md              # Phase structure with requirement mappings
├── STATE.md                # Auto-generated current position (max 100 lines)
├── config.json             # Towline workflow preferences
├── research/               # Optional domain research
│   ├── STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md
│   └── SUMMARY.md
├── codebase/               # Optional brownfield analysis
│   ├── STRUCTURE.md, ARCHITECTURE.md, CONVENTIONS.md
│   ├── TESTING.md, INTEGRATIONS.md, CONCERNS.md
│   └── STACK.md
└── phases/
    └── {NN}/               # Zero-padded phase directories
        ├── CONTEXT.md      # User decisions for this phase
        ├── RESEARCH.md     # Phase-specific research (optional)
        ├── {MM}-PLAN.md    # Executable plan with XML tasks
        ├── {MM}-SUMMARY.md # Execution results
        └── VERIFICATION.md # Goal-backward verification report
```

---

## Configuration

`.planning/config.json` - project-scoped, versioned settings:

```json
{
  "version": 2,
  "context_strategy": "aggressive",
  "mode": "interactive",
  "depth": "standard",
  "features": {
    "structured_planning": true,
    "goal_verification": true,
    "context_isolation": true,
    "atomic_commits": true,
    "session_persistence": true,
    "research_phase": true,
    "plan_checking": true,
    "tdd_mode": false,
    "status_line": true
  },
  "models": {
    "researcher": "sonnet",
    "planner": "inherit",
    "executor": "inherit",
    "verifier": "sonnet",
    "debugger": "inherit",
    "mapper": "sonnet",
    "synthesizer": "haiku"
  },
  "parallelization": {
    "enabled": true,
    "max_concurrent_agents": 3,
    "use_teams": false
  },
  "planning": {
    "commit_docs": true,
    "max_tasks_per_plan": 3
  },
  "git": {
    "branching": "none",
    "commit_format": "{type}({phase}-{plan}-{task}): {description}"
  },
  "gates": {
    "confirm_project": true,
    "confirm_roadmap": true,
    "confirm_plan": true,
    "confirm_execute": false
  }
}
```

**Key design decisions:**
- `version` field enables config migrations as the framework evolves
- `context_strategy`: `"aggressive"` (delegate everything to subagents - default for 200k), `"balanced"` (delegate only execute/research), `"minimal"` (run inline, trust large context - for future 1M users)
- `features` section = individual feature flags. Every major capability can be toggled off as native Claude Code catches up. Skills check these flags and adapt behavior.
- `models` with per-agent control replaces the v1 profile abstraction
- `gates` controls which steps require user confirmation
- Proper JSON → read/write via Node.js scripts, never grep/sed

---

## Error Recovery & Fallbacks

### Agent Failure Recovery
- If an executor agent fails mid-task: its SUMMARY.md is written with `status: failed` and the error. The orchestrator marks the task as blocked and continues with independent tasks. User is prompted to retry or skip.
- If plan-checker exhausts 3 iterations: the plan is presented to the user with warnings. User can approve anyway, revise manually, or abandon.
- If a researcher agent fails (e.g., WebSearch blocked): the orchestrator continues with remaining researchers. Missing research dimensions are noted in SUMMARY.md.

### Agent Teams (Opt-In, Not Default)
Task() subagents are the default coordination model. Agent Teams are available as an opt-in upgrade for specific scenarios:
- **Default (`use_teams: false`)**: Wave-based Task() spawning. Plans in the same wave run as parallel Task() calls. Orchestrator blocks until wave completes, proceeds to next. Simple, reliable, cost-effective.
- **Opt-in (`use_teams: true` or `--team` flag)**: Creates Agent Team for the phase. Useful for competing-hypothesis debugging, adversarial review, or complex integration work requiring inter-agent communication.
- **Teams fallback**: If `TeamCreate` fails (experimental API), automatically degrades to Task() subagent approach. No user intervention needed.
- Agent Teams add ~7x token overhead vs single sessions. On Max 5x, this means 1-2 team sessions per 5-hour window vs 3-4 Task() sessions. Users should be aware of this tradeoff.

### Cost/Token Awareness
Max 5x users get ~225 messages per 5-hour rolling window. Each Task() spawn has ~20k token startup overhead. The framework must be cost-conscious:
- `config.json` `depth` setting controls agent spawning intensity:
  - `"quick"`: skip research, skip plan-checking, single-pass execution (~50% cost reduction)
  - `"standard"`: research + plan + execute + verify (default, 2-4 cycles per 5-hour window)
  - `"comprehensive"`: full research, max iterations, parallel mapping (~2x cost)
- `/dev:quick` exists specifically for low-cost ad-hoc tasks (1 agent spawn)
- Agent model selection (`sonnet` vs `inherit` vs `haiku`) directly controls per-agent cost. Budget mode: `executor: "sonnet"` saves ~3x per execution agent vs Opus.
- Status line shows estimated session budget remaining. Skills warn before spawning if operation would consume >50% of remaining budget.
- See "Token Budget & Session Management" section for detailed cost estimates per workflow.

---

## Git Integration

### Branching Strategy
Configurable via `config.json` `git.branching` field:
- `"none"` (default): All work on current branch. Simplest for solo developers.
- `"phase"`: Create `towline/phase-{NN}-{name}` branch per phase. Merge to main after verification.
- `"milestone"`: Create `towline/milestone-{name}` branch for entire milestone. Phases are commits on this branch.

### Atomic Commits
Each task in a plan produces one commit: `{type}({phase}-{plan}-{task}): {description}`
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
- Enforced by `validate-commit.js` PreToolUse hook
- Rollback: if a task fails after commit, the executor runs `git revert` for that commit

### `.gitignore` Setup
`/dev:begin` configures `.gitignore` based on `planning.commit_docs`:
- If `true`: `.planning/` is committed (team collaboration)
- If `false`: `.planning/` added to `.gitignore` (solo, keep planning private)

---

## Checkpoint Protocol

Preserved from v1 with three checkpoint types embedded in plan XML:

```xml
<task type="checkpoint:human-verify">
  <!-- Pauses execution, shows user what to verify, waits for confirmation -->
</task>

<task type="checkpoint:decision">
  <!-- Pauses execution, presents options, user picks, execution continues with choice -->
</task>

<task type="checkpoint:human-action">
  <!-- Pauses execution, tells user what to do manually (e.g., create API key), waits -->
</task>
```

**Checkpoint flow** (orchestrator-mediated, not direct):
1. Executor detects checkpoint task → **stops immediately** (does not continue)
2. Executor returns structured checkpoint response with:
   - Completed tasks table (task name, commit hash, files modified)
   - Checkpoint type and details
   - What the user needs to do/verify/decide
3. Orchestrator (the `/dev:build` skill) receives checkpoint response
4. Orchestrator presents checkpoint to user via AskUserQuestion
5. User responds (approves, decides, confirms manual action)
6. Orchestrator spawns **fresh continuation executor** with:
   - Completed tasks table from checkpoint response
   - User's checkpoint response
   - Full PLAN.md context
7. Fresh executor verifies prior commits exist (`git log`), then continues from next task

**Why fresh agent, not resumed:** Resume relies on Claude Code's internal serialization which can break with parallel tool calls. Fresh agents with explicit state (completed-tasks table + commit hashes) are more reliable and have clean 200k context.

Checkpoints are NOT skipped in any mode (they represent genuine human-required actions).

---

## Deviation Rules

Formalized rules for when executors encounter unexpected situations during plan execution:

| Deviation Type | Action | Approval Needed? |
|---------------|--------|-----------------|
| Bug discovered | Auto-fix, add test, commit separately | No |
| Missing dependency | Auto-install, continue | No |
| Critical gap (error handling, validation) | Auto-add, commit separately | No |
| Architectural change (schema, framework, new service) | Stop, ask user via AskUserQuestion | Yes |
| Scope creep (nice-to-have, optimization) | Log to deferred ideas, continue | No |

Encoded in the `towline-executor.md` agent system prompt.

---

## Additional Components

### Status Line Hook
A `SubagentStart`/`Stop` hook that updates the Claude Code status line with:
- Current phase and plan being executed
- Progress (e.g., "Phase 3/5 - Plan 2/3 - Task 1/2")
- Active agent count

### CLAUDE.md / Rules Integration
The plugin includes `.claude/rules/towline-workflow.md` (via the plugin's rules support) that injects Towline discipline into ALL Claude interactions, not just `/dev:*` skills:
- "Check `.planning/STATE.md` for current project context before starting work"
- "Prefer atomic commits per logical change"
- "When working on a Towline project, suggest `/dev:plan` before implementing multi-step changes"
- Scoped with `paths: [".planning/**"]` so it only activates in Towline projects

### TDD Support
The `towline-executor` agent's system prompt includes TDD mode (triggered by `<task type="tdd">`):
1. RED: Write failing test first, commit
2. GREEN: Write minimal code to pass, commit
3. REFACTOR: Clean up, commit
Each step is a separate atomic commit.

---

## End-to-End Workflow Walkthrough: Gaps Found & Addressed

A comprehensive trace through every step of the user journey revealed the following gaps. Each has been addressed in the plan sections above or noted here with mitigations.

### Gap 1: `context: fork` Doesn't Work (CRITICAL)
**Found:** The `context: fork` skill frontmatter field is [currently not honored](https://github.com/anthropics/claude-code/issues/17283) when skills are invoked via the Skill tool. Skills always run inline.
**Impact:** Our entire "fork everything" context isolation strategy would fail.
**Fix:** Redesigned all core skills as thin inline orchestrators that use Task() for delegation (the GSD pattern). This is actually more reliable. See "Core Skills" section above.

### Gap 2: Checkpoint Handling Must Be Orchestrator-Mediated
**Found:** GSD executors do NOT use AskUserQuestion directly. They return structured checkpoint responses to the orchestrator, who mediates user interaction and spawns fresh continuation agents.
**Impact:** Direct AskUserQuestion from executors works but loses the benefits of fresh context for continuation.
**Fix:** Adopted GSD's proven pattern: executor returns checkpoint → orchestrator presents to user → fresh continuation agent with explicit state. See "Checkpoint Protocol" section.

### Gap 3: Config Bootstrap During `/dev:begin`
**Found:** The depth/model config lives in `.planning/config.json` which doesn't exist yet when `/dev:begin` starts. GSD solves this by creating config.json BEFORE the research phase via interactive questioning.
**Impact:** Skills wouldn't know how many researchers to spawn or which models to use.
**Fix:** `/dev:begin` creates config.json in step 2 (workflow preferences) before research in step 4.

### Gap 4: STATE.md Must Update Per-Wave, Not Just Per-Phase
**Found:** If the orchestrator only updates STATE.md after all waves complete, a mid-build crash loses all progress information. GSD updates after each plan completes.
**Impact:** Crash recovery would think no build progress was made.
**Fix:** `/dev:build` updates STATE.md after each wave completes. SUMMARY.md files on disk serve as ground truth for crash recovery regardless.

### Gap 5: Supporting Skills Should NOT Fork
**Found:** Lightweight skills (pause, resume, status, help, config) don't need context isolation. They read/write small files and interact briefly with the user.
**Impact:** Unnecessary token overhead from forking lightweight operations.
**Fix:** Clarified in the plan: core skills (begin, plan, build, review, scan, debug) use Task() delegation. Supporting skills (pause, resume, status, help, config, discuss, quick, milestone) run inline. `/dev:discuss` and `/dev:quick` are borderline - discuss captures decisions (small, inline OK), quick does one task (spawns single Task() executor).

### Gap 6: Git Race Conditions in Parallel Execution
**Found:** Parallel Task() executors sharing the same git working directory could have commit race conditions.
**Impact:** One executor's `git commit` could fail with a lock error if another is committing simultaneously.
**Mitigation:** Plans in the same wave MUST modify disjoint files (enforced during planning). Git handles disjoint commits from the same branch without conflicts. Executor agents include retry logic: "If git commit fails with a lock error, wait 2 seconds and retry (max 3 attempts)." This matches GSD's approach - no explicit locking needed.

### Gap 7: Cross-Phase Re-Planning Warning
**Found:** If Phase 3 was planned before Phase 2 was built, Phase 3's plans may be based on assumed (not actual) Phase 2 outputs.
**Impact:** Plans could be invalid when executed.
**Fix:** `/dev:status` includes a check: "Phase N was planned before dependency Phase M was built. Consider re-planning with `/dev:plan N`."

### Gap 8: Test Suite Execution Responsibility
**Found:** Unclear whether executors or verifiers run the full test suite.
**Fix:** Executors run task-specific `<verify>` commands (focused). Verifiers run the full test suite as part of goal-backward verification (comprehensive). This separation keeps executor context focused while ensuring thorough testing.

### Gap 9: `/dev:review` Redundancy with Auto-Verification
**Found:** `/dev:build` already spawns a verifier at the end. Running `/dev:review` would repeat automated verification.
**Fix:** `/dev:review` checks for existing VERIFICATION.md. If present, skips automated checks and focuses on conversational UAT with the user.

### Gap 10: `CLAUDE_PLUGIN_ROOT` Doesn't Work in Markdown
**Found:** `${CLAUDE_PLUGIN_ROOT}` works in JSON configs (hooks, MCP servers) but NOT in markdown skill files.
**Impact:** Skills can't reference bundled templates/reference docs by absolute path.
**Fix:** Skills reference supporting files by relative path within their directory (e.g., `[reference.md](reference.md)`). Claude loads these when needed. For hook scripts, use `${CLAUDE_PLUGIN_ROOT}/scripts/...` in hooks.json.

---

## Open Source & Contribution Design

Towline is designed from day one for community contribution and easy maintenance.

### Repository Structure for Contributors

```
towline/                            # GitHub: towline-dev/towline (or similar)
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   ├── feature_request.md
│   │   └── new_skill_proposal.md
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/
│       ├── ci.yml                  # Cross-platform test matrix (Windows + macOS + Linux)
│       ├── release.yml             # Automated npm publish on tag
│       └── plugin-validation.yml   # Validates plugin structure (skills, agents, hooks format)
├── .claude-plugin/
│   └── plugin.json
├── skills/                         # Each skill is self-contained in its directory
├── agents/                         # Each agent is a single markdown file
├── hooks/
├── scripts/
├── tests/
├── docs/                           # Detailed documentation beyond README
│   ├── ARCHITECTURE.md             # How Towline works internally
│   ├── CREATING_SKILLS.md          # Guide: add a new skill
│   ├── CREATING_AGENTS.md          # Guide: add or modify an agent
│   ├── WORKFLOW_REFERENCE.md       # Detailed workflow documentation
│   └── MIGRATION.md               # Upgrading between versions
├── CONTRIBUTING.md
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── LICENSE                         # MIT
├── README.md
└── package.json
```

### Contribution-Friendly Design Principles

1. **Skills are self-contained**: Each skill is a directory with SKILL.md + supporting files. Adding a new skill means adding a new directory - no changes to existing files. Contributors can propose new skills via PRs without touching the core.

2. **Agents are single files**: Each agent is one markdown file with YAML frontmatter. Modifying an agent's behavior means editing one file. Adding a new agent means adding one file + referencing it from relevant skills.

3. **Hooks are declarative JSON**: `hooks.json` is a single file mapping events to scripts. Adding a new hook means adding a script + one entry in `hooks.json`.

4. **Scripts are independent Node.js files**: Each script is self-contained with its own imports. No shared state between scripts. Easy to test individually. Cross-platform (Node.js, not bash).

5. **Tests per component**: Each script has a corresponding `.test.js` file. CI runs `npm test` which executes all tests. Contributors must add tests for new scripts.

### CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
- Test matrix: Windows + macOS + Linux (Node.js 18, 20, 22)
- Lint: ESLint on scripts + markdownlint on skills/agents
- Unit tests: npm test (Jest)
- Plugin structure validation: custom script that verifies:
  - Every skill directory has SKILL.md
  - Every agent file has valid YAML frontmatter (name, description)
  - hooks.json references existing scripts
  - No broken relative links in markdown files
- Cross-platform path validation: verify no hardcoded Unix/Windows paths
```

```yaml
# .github/workflows/release.yml (on tag push)
- Run full CI
- Publish to npm: `npm publish`
- Create GitHub Release with changelog
```

### Branching & PR Strategy

- `main` branch: stable, always passes CI
- Feature branches: `feature/skill-name` or `fix/issue-number`
- PRs require: passing CI + 1 review
- Changelog: maintained manually in CHANGELOG.md (not auto-generated)
- Semantic versioning: major (breaking skill changes), minor (new skills/agents), patch (bug fixes)

### Making It Easy to Contribute

| Contribution Type | What to Do | Files Touched |
|-------------------|-----------|---------------|
| New skill | Create `skills/my-skill/SKILL.md` + supporting files | 1 directory (no existing files changed) |
| New agent | Create `agents/towline-my-agent.md` | 1 file |
| New hook | Add script to `scripts/`, add entry to `hooks.json` | 2 files |
| Bug fix in skill | Edit the specific `SKILL.md` | 1 file |
| Bug fix in script | Edit script + update test | 2 files |
| Documentation | Edit `docs/*.md` or `README.md` | 1 file |

### Issue Labels

- `good-first-issue` - Simple skill improvements or documentation
- `skill-proposal` - New skill ideas for community discussion
- `agent-improvement` - Agent prompt refinements
- `platform-update` - Changes needed when Claude Code adds new features
- `breaking-change` - Requires major version bump

---

## Repository Migration Plan

The project currently lives in `D:\Repos\GETTING-SHIT-DONE` (GitHub: the current repo). It needs to move to a properly named repository.

### Migration Steps
1. Create new GitHub organization or use personal account: `towline-dev` (or similar)
2. Create new repo: `towline-dev/towline` (or `{username}/towline`)
3. Copy all source files (not git history from planning phase - start fresh for the public repo)
4. Set up GitHub repo settings: description, topics, license
5. Initialize with clean first commit containing the full plugin
6. Set up branch protection on `main`
7. Configure CI/CD workflows
8. Update `package.json` with correct `name`, `repository`, `homepage` fields
9. Publish initial npm package
10. Archive or redirect the old `GETTING-SHIT-DONE` repo

### package.json for npm Distribution
```json
{
  "name": "towline",
  "version": "1.0.0",
  "description": "Context-engineered development workflow for Claude Code",
  "keywords": ["claude-code", "plugin", "development-workflow", "context-engineering"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/towline-dev/towline"
  },
  "scripts": {
    "test": "jest",
    "lint": "eslint scripts/ tests/",
    "validate": "node scripts/validate-plugin-structure.js"
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "eslint": "^9.0.0"
  }
}
```

---

## Build Sequence

1. **Plugin scaffold**: `.claude-plugin/plugin.json`, `package.json`, `LICENSE`, `CONTRIBUTING.md`
2. **Agent definitions** (all 8 - referenced by skills, must exist first)
3. **Core skills**: `begin` → `plan` → `build` → `review` (the main workflow loop)
4. **Hook scripts** (Node.js, cross-platform): `validate-commit.js`, `check-plan-format.js`, `progress-tracker.js`, `context-budget-check.js`, `status-line.js`
5. **`hooks/hooks.json`** (registers scripts at lifecycle events)
6. **Supporting skills**: `discuss`, `quick`, `debug`, `status`, `pause`, `resume`, `milestone`, `scan`
7. **Deviation rules + checkpoint protocol** (reference docs in `skills/plan/`)
8. **Config & help** skills
9. **Templates** (supporting files in skill directories, including config.json.tmpl with defaults)
10. **Script unit tests** (`tests/` directory with test runner in `package.json`)
11. **Git integration** (branching strategy logic in execute skill, `.gitignore` setup in start skill)
12. **README.md** (installation, quickstart, command reference, architecture overview)
13. **End-to-end testing** with a real project via `claude --plugin-dir .`

---

## Verification Plan

### Automated Tests
1. **Script unit tests**: `npm test` runs tests for `validate-commit.js`, `check-plan-format.js`, `config-migration.js`
2. **Cross-platform**: Tests pass on both Windows and macOS/Linux

### Manual Integration Tests
3. **Plugin loads**: `claude --plugin-dir .` recognizes all 14 skills and 8 agents
4. **Skill invocation**: Each `/dev:*` command triggers correctly with `$ARGUMENTS` passing
5. **Context isolation**: Verify core skills delegate to Task() subagents (main window stays lean after skill completes)
6. **Agent spawning**: Skills successfully delegate to agents with correct model/memory/tools
7. **Hooks fire**: SessionStart injects state, TaskCompleted validates, PreCompact saves
8. **Wave execution**: `/dev:build` with multi-plan waves spawns parallel Task() subagents per wave, blocks, proceeds
9. **Teams opt-in**: With `--team` flag or `use_teams: true`, execution uses Agent Teams; automatically falls back to Task() on failure
10. **State flow**: Native tasks created during execution, STATE.md generated from them
11. **Persistent memory**: Agents accumulate and recall project knowledge across sessions
12. **Git integration**: Branching strategy creates/merges branches correctly; `.gitignore` set up properly
13. **Checkpoints**: Execution pauses at checkpoint tasks and waits for user input
14. **Deviation handling**: Executor auto-fixes bugs, asks about architectural changes
15. **Error recovery**: Executor failure produces `status: failed` SUMMARY, orchestrator continues
16. **End-to-end**: `begin` → `discuss` → `plan` → `build` → `review` completes a full phase cycle
17. **Config**: `/dev:config` reads/writes config.json, model overrides propagate to agents
18. **Feature flags**: Disabling features in config.json actually changes behavior (e.g., `research_phase: false` skips research)
19. **Checkpoint flow**: Executor returns structured checkpoint → orchestrator presents to user → fresh continuation agent resumes correctly
20. **CI pipeline**: GitHub Actions runs tests on Windows + macOS + Linux with Node.js 18/20/22
21. **Plugin structure validation**: `npm run validate` confirms all skills have SKILL.md, agents have valid frontmatter, hooks reference existing scripts
22. **Crash recovery**: After simulated mid-build crash, `/dev:resume` detects completed work from SUMMARY.md files and STATE.md
