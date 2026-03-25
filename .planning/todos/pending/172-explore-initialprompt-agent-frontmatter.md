---
id: "172"
title: "Explore initialPrompt for planner/executor/verifier agents"
priority: medium
source: "/pbr:explore session"
created: 2026-03-25
---

# Explore initialPrompt Agent Frontmatter

Claude Code v2.1.83 added `initialPrompt` in agent frontmatter — agents can auto-submit a first turn without the skill providing it.

## Opportunity
PBR skills currently build elaborate `prompt:` strings for Task() calls that include `<files_to_read>` blocks and bootstrap instructions. With `initialPrompt`, the bootstrap could move INTO the agent definition.

## Best Candidates
- **planner** — always reads STATE.md, ROADMAP.md, config.json first
- **executor** — always reads PLAN.md, STATE.md first
- **verifier** — always reads PLAN.md, SUMMARY.md first

## Trade-off
Simplifies skills but makes agents less flexible (hardcoded first action vs. skill-driven). Need to check if `initialPrompt` can coexist with skill-provided prompts or if it replaces them.

## Research Findings

Researched 2026-03-25 (see `.planning/notes/2026-03-25-initialprompt-research-findings.md`).

**Key finding: `initialPrompt` only fires when an agent runs as the MAIN SESSION agent (via `claude --agent`), NOT when spawned as a subagent via `Task()`.** Since PBR spawns all agents as subagents, `initialPrompt` would be silently ignored.

- It is prepended to user-provided prompt (coexists, does not override)
- Commands and skills are processed within initialPrompt text
- PBR's existing `files_to_read` + skill-constructed prompts are the correct approach for subagent bootstrapping

## Action

1. ~~Read Claude Code docs on `initialPrompt` behavior~~ DONE — not applicable to PBR's subagent model
2. ~~Prototype on one agent (verifier is simplest)~~ SKIPPED — no benefit since it only works in `--agent` mode
3. ~~Measure if it reduces skill complexity meaningfully~~ N/A
4. **Close this todo** — `initialPrompt` is not useful for PBR's current architecture. Revisit only if PBR adds a headless `--agent` mode
