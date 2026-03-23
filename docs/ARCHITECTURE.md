# PBR Architecture

Plan-Build-Run (PBR) is a Claude Code plugin that solves context rot through disciplined subagent delegation, file-based state, and goal-backward verification.

---

## System Overview

PBR has three layers that work together:

```
User
 |
 v
Skills (slash commands)     -- /pbr:plan, /pbr:build, etc.
 |                            Orchestrate workflows, read state, spawn agents
 v
Agents (subagents)          -- planner, executor, verifier, etc.
 |                            Fresh 200k context windows per invocation
 v
Hooks (lifecycle scripts)   -- PreToolUse, PostToolUse, Stop, etc.
                              Enforce rules, validate output, track state
```

All three layers communicate through **files on disk** in `.planning/`, not through messages or shared memory.

---

## Component Architecture

### Skills (44 skills)

Skills are markdown files at `plugins/pbr/skills/{name}/SKILL.md` with YAML frontmatter. Each skill defines a slash command (`/pbr:{name}`) that orchestrates a workflow.

Skills are **thin orchestrators** -- they read state, interact with the user, and spawn agents for heavy work. A skill typically consumes 15-25% of the context window, delegating the rest to agents.

| Category | Skills | Purpose |
|----------|--------|---------|
| Core Workflow | begin, plan, build, review, continue | Full project lifecycle |
| Planning | discuss, quick, fast, autonomous, import, do | Various planning modes |
| Quality | health, validate-phase, scan, forensics | Integrity and validation |
| Context | profile, status, statusline, pause, resume | Session management |
| Brownfield | intel, scan, explore | Existing codebase analysis |
| Utility | debug, todo, note, seed, backlog, thread | Developer tools |
| Infrastructure | config, setup, dashboard, ship, release | Project management |

### Agents (17 agents)

Agents are markdown files at `plugins/pbr/agents/{name}.md` with YAML frontmatter. Each runs in a fresh `Task()` context with a clean 200k token window.

Skills spawn agents via `subagent_type: "pbr:{name}"` -- Claude Code auto-loads the agent definition from `agents/`. Agent definitions are never inlined into skill prompts (this wastes main context).

| Agent | Role | Model |
|-------|------|-------|
| researcher | Research implementation approaches | sonnet |
| planner | Create executable phase plans | inherit |
| executor | Execute plans with atomic commits | inherit |
| verifier | Goal-backward verification | inherit |
| plan-checker | Validate plan quality (10 dimensions) | inherit |
| codebase-mapper | Map existing codebase structure | sonnet |
| intel-updater | Write persistent codebase intelligence | sonnet |
| debugger | Systematic hypothesis-based debugging | inherit |
| integration-checker | Cross-phase integration verification | sonnet |
| nyquist-auditor | Fill test coverage gaps | inherit |
| audit | Session compliance analysis | inherit |
| synthesizer | Combine multi-agent outputs | haiku |
| general | Ad-hoc tasks | inherit |
| roadmapper | Create project roadmaps | inherit |
| ui-checker | Visual UI verification | inherit |
| ui-researcher | UI pattern analysis | inherit |
| dev-sync | Cross-plugin synchronization | inherit |

### Hook Scripts (65+ scripts)

Hook scripts at `plugins/pbr/scripts/` fire on Claude Code lifecycle events. Configured in `hooks.json`.

| Event | Scripts | Purpose |
|-------|---------|---------|
| PreToolUse (Bash) | pre-bash-dispatch, validate-commit, check-dangerous-commands | Block bad commands |
| PreToolUse (Write/Edit) | pre-write-dispatch, check-skill-workflow, check-summary-gate, check-doc-sprawl | Gate file writes |
| PreToolUse (Task) | validate-task, pre-task-dispatch | Gate subagent spawning |
| PostToolUse (Write/Edit) | post-write-dispatch, check-plan-format, check-roadmap-sync, check-state-sync | Validate written files |
| PostToolUse (Write/Edit) | post-write-quality | Auto-format, type-check |
| PostToolUse (Task) | check-subagent-output | Validate agent results |
| PostToolUse (Read) | track-context-budget | Monitor context usage |
| Stop | auto-continue | Chain next command |
| SessionStart | progress-tracker | Inject project state |
| SubagentStart/Stop | log-subagent | Track agent lifecycle |

Hook exit codes: `0` = success, `2` = block (PreToolUse hooks that reject a tool call).

### CLI Tools (`pbr-tools.js`)

A 2000+ line Node.js utility at `plugins/pbr/scripts/pbr-tools.js` with 80+ lib modules in `scripts/lib/`. Provides CLI subcommands that agents call to avoid wasting tokens on file parsing.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js <command> [args]
```

See [CLI-TOOLS.md](CLI-TOOLS.md) for the full command reference.

### Commands (70 commands)

Command registration files at `plugins/pbr/commands/*.md` map slash command names to skills. Many skills expose multiple commands (e.g., `plan` skill handles `plan-phase`, `add-phase`, `insert-phase`, `remove-phase`).

### References

Shared reference docs at `plugins/pbr/references/` loaded by multiple skills: config schema, commit conventions, deviation rules, plan format, UI formatting, TDD workflow.

### Templates

EJS-style `.tmpl` files at `plugins/pbr/templates/` for generated markdown: SUMMARY.md, VERIFICATION.md, CONTEXT.md, etc.

---

## Data Flow

Skills and agents communicate through files on disk:

```
.planning/
  STATE.md          <- Source of truth for current position (phase, status, progress)
  ROADMAP.md        <- Phase structure, goals, dependencies, milestone tracking
  PROJECT.md        <- Project requirements, context, and decisions
  config.json       <- Workflow settings (depth, mode, features, models)
  KNOWLEDGE.md      <- Accumulated rules, patterns, lessons learned

  phases/{NN}-{slug}/
    PLAN-{NN}.md    <- Written by planner, read by executor
    SUMMARY-{NN}.md <- Written by executor, read by verifier
    VERIFICATION.md <- Written by verifier, read by review skill
    CONTEXT.md      <- Phase discussion context and decisions

  quick/{NNN}-{slug}/
    PLAN.md         <- Quick task plan
    SUMMARY.md      <- Quick task result

  intel/            <- Persistent codebase intelligence
  codebase/         <- Codebase mapping output
  research/         <- Research results
  notes/            <- User notes (individual files)
  todos/            <- File-based todos (pending/ and done/)
  logs/             <- Hook logs (hooks.jsonl)
```

### State Machine

```
not_started -> discussed -> planned -> building -> built -> verified -> complete
                                    \-> partial (failed build)
                                         \-> needs_fixes (failed verification)
```

The orchestrator (skill) stays lean by delegating heavy work to agents. Each agent gets a fresh context window, preventing context rot.

---

## Design Principles

1. **Fresh context per agent** -- Each agent spawns with a clean 200k token window. No accumulated garbage from prior work.

2. **Thin orchestrators** -- Skills use 15-25% of context for coordination. Heavy lifting goes to agents.

3. **File-based state** -- All communication through `.planning/` files. No shared memory, no message passing. Any agent can read any state file.

4. **Defense in depth** -- Hooks enforce rules that agents skip under cognitive load. PreToolUse hooks block bad actions; PostToolUse hooks warn on bad output.

5. **Goal-backward verification** -- Verifiers check what was BUILT against what was PLANNED, not just that tests pass.

6. **Atomic commits** -- One task = one commit. Every commit must pass verification. Broken code never enters the history.

7. **Push intelligence into code, not prompts** -- CLI tools (`pbr-tools.js`) handle state parsing, file operations, and validation. Agents call CLI commands instead of implementing logic inline.
