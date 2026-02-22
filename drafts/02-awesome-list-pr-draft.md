# Awesome List PR Drafts

## Target 1: hesreallyhim/awesome-claude-code (Best Fit)

**Category**: Tooling > Orchestrators

**PR Title**: Add Plan-Build-Run — context-engineered development workflow plugin

**Entry to add** (under the Orchestrators section):

```markdown
- [Plan-Build-Run](https://github.com/SienkLogic/plan-build-run) by [SienkLogic](https://github.com/SienkLogic) - Context-engineered development workflow that solves context rot through subagent delegation. Keeps your orchestrator under ~15% context by delegating heavy work to fresh 200k-token agent windows. 21 slash commands, 10 specialized agents, 15 lifecycle hooks, wave-based parallel execution, goal-backward verification, and kill-safe file-based state. Works on every Claude Code tier — `depth: quick` for Free/Pro, `depth: comprehensive` for Max 5x.
```

**PR Body**:

```markdown
## Add Plan-Build-Run

Plan-Build-Run is a Claude Code plugin focused on solving **context rot** — quality degradation
as the context window fills during long sessions.

### What it does
- Keeps orchestrator at ~15% context via structured subagent delegation
- 21 `/pbr:*` slash commands covering the full dev lifecycle
- 10 specialized agents (researcher, planner, executor, verifier, etc.)
- 15 lifecycle hooks enforcing discipline at zero token cost
- Wave-based parallel execution with atomic commits
- Goal-backward verification (checks codebase against must-haves, not just task completion)
- File-based state — kill your terminal anytime, `/pbr:resume` picks up

### Why it fits this list
Plan-Build-Run is a full orchestration system for Claude Code, similar to the existing
entries in the Tooling/Orchestrators section. Its unique angle is context engineering —
designing the workflow around context window constraints rather than ignoring them.

### Stats
- 780+ tests across 36 suites
- CI on Node 18/20/22 across Windows, macOS, Linux
- MIT licensed
- Companion web dashboard for browsing planning state

**Repo**: https://github.com/SienkLogic/plan-build-run
```

---

## Target 2: ComposioHQ/awesome-claude-plugins (1.3k stars, highest visibility)

**Category**: Developer Productivity (or Backend & Architecture)

**PR Title**: Add Plan-Build-Run workflow orchestration plugin

This repo requires you to **add the actual plugin directory** to the repo, not just a README entry. The structure would be:

### File: `plan-build-run/README.md`

```markdown
# Plan-Build-Run

Context-engineered development workflow for Claude Code. Solves context rot through
disciplined subagent delegation, structured planning, atomic execution, and
goal-backward verification.

## What it does

- Keeps orchestrator at ~15% context by delegating to fresh subagent windows
- 21 `/pbr:*` slash commands (begin, plan, build, review, debug, resume, etc.)
- 10 specialized agents with configurable model profiles
- 15 lifecycle hooks enforcing commit format, context budget, plan compliance
- Wave-based parallel execution with atomic commits
- Kill-safe: all state lives on disk in `.planning/`

## Install

```bash
claude plugin marketplace add SienkLogic/plan-build-run
claude plugin install pbr@plan-build-run
```

## Links

- **Repository**: https://github.com/SienkLogic/plan-build-run
- **Wiki**: https://github.com/SienkLogic/plan-build-run/wiki
- **License**: MIT
```

### File: `plan-build-run/.claude-plugin/plugin.json`

```json
{
  "name": "pbr",
  "version": "2.0.0",
  "description": "Plan-Build-Run — Structured development workflow for Claude Code. Solves context rot through disciplined subagent delegation, structured planning, atomic execution, and goal-backward verification.",
  "author": {
    "name": "SienkLogic",
    "email": "dave@sienklogic.com"
  },
  "homepage": "https://github.com/SienkLogic/plan-build-run",
  "repository": "https://github.com/SienkLogic/plan-build-run",
  "license": "MIT",
  "keywords": ["claude-code", "context-engineering", "development-workflow", "subagent-delegation"]
}
```

### README.md entry (add under Developer Productivity)

```markdown
*   [plan-build-run](/ComposioHQ/awesome-claude-plugins/blob/master/plan-build-run) - Context-engineered development workflow that solves context rot. 21 commands, 10 agents, 15 hooks, wave-based parallel execution, and kill-safe state.
```

### PR Body

```markdown
## Add Plan-Build-Run

**Category**: Developer Productivity

Plan-Build-Run is a Claude Code plugin that solves context rot — quality degradation as
the context window fills during long sessions. It keeps the main orchestrator lean
(~15% context) by delegating work to fresh subagent contexts.

### Checklist
- [x] Addresses a real use case (context management during multi-phase development)
- [x] Doesn't duplicate existing functionality (no other plugin focuses on context rot)
- [x] Follows the template structure
- [x] Has been tested (780+ tests, CI on 3 OS x 3 Node versions)

**Repo**: https://github.com/SienkLogic/plan-build-run
```

---

## Target 3: ccplugins/awesome-claude-code-plugins

**Category**: Workflow Orchestration

**Entry**:

```markdown
*   [Plan-Build-Run](https://github.com/SienkLogic/plan-build-run) - Context-engineered development workflow. 21 slash commands, 10 agents, 15 hooks. Solves context rot through subagent delegation, wave-based parallel execution, and goal-backward verification. Works on every Claude Code tier.
```

---

## Submission Priority

1. **hesreallyhim/awesome-claude-code** — Best category fit (Orchestrators), active maintainer
2. **ComposioHQ/awesome-claude-plugins** — Highest stars (1.3k), more work to submit (requires plugin directory)
3. **ccplugins/awesome-claude-code-plugins** — Quick PR, good category match
4. All others (Chat2AnyLLM, jmanhype, jqueryscript, GiladShoham) — submit in batch after the first 3
