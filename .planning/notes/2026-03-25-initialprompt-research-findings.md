---
created: 2026-03-25
source: "/pbr:quick 032 research"
topic: "Claude Code initialPrompt agent frontmatter"
---

# Claude Code `initialPrompt` Agent Frontmatter Research

## Source

Official Claude Code documentation at `code.claude.com/docs/en/sub-agents` [S2], retrieved 2026-03-25. The frontmatter field reference table and `--agents` CLI flag documentation both describe `initialPrompt`.

## Question 1: Does initialPrompt run BEFORE or AFTER the skill-provided prompt?

**Answer: PREPENDED to user-provided prompt.** [S2-HIGH]

The official docs state:

> `initialPrompt` — Auto-submitted as the first user turn when this agent runs as the main session agent (via `--agent` or the `agent` setting). Commands and skills are processed. **Prepended to any user-provided prompt.**

This means `initialPrompt` content comes first, then any user/skill-provided prompt follows.

## Question 2: Can initialPrompt and a skill-provided prompt coexist?

**Answer: Only when running as main session agent, NOT as a subagent.** [S2-HIGH]

Critical constraint: `initialPrompt` only fires "when this agent runs as the main session agent (via `--agent` or the `agent` setting)." PBR spawns agents via `Task()` (subagent invocation), not via `--agent`. Therefore **`initialPrompt` would NOT execute when PBR spawns planner/executor/verifier as subagents.**

When it does fire (main session agent mode), it coexists with user input — it is prepended, not replacing.

## Question 3: What is the exact YAML frontmatter schema?

**Answer:** [S2-HIGH]

```yaml
---
name: agent-name
description: "What this agent does"
initialPrompt: "Text auto-submitted as first user turn"
# ... other fields
---
```

The field accepts a string value. Commands (`/slash-commands`) and skills are processed within the initialPrompt text. It is listed alongside these other optional fields: `tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `effort`, `background`, `isolation`.

## Question 4: What use cases does Anthropic recommend?

**Answer:** [S2-MEDIUM]

The docs do not provide explicit use-case recommendations for `initialPrompt` specifically. However, based on the documented behavior (main session agent only, prepended to user prompt, commands/skills processed), the intended use cases are:

- **Session-level agents** launched via `claude --agent my-agent` that need bootstrap actions (loading context, running setup commands)
- **Default workflows** where an agent should always start with a specific action before handling the user's request
- **Skill injection** — since skills are processed in `initialPrompt`, it can load domain knowledge automatically

## Recommendation for PBR

**DO NOT adopt `initialPrompt` for planner/executor/verifier agents.** [S2-HIGH confidence in reasoning]

### Why Not

1. **Wrong invocation mode.** PBR agents are spawned as subagents via `Task()`. The docs explicitly state `initialPrompt` only fires when the agent "runs as the main session agent (via `--agent` or the `agent` setting)." It would be silently ignored in PBR's current architecture.

2. **PBR already has a superior mechanism.** Skills construct dynamic prompts for `Task()` that include phase-specific context (phase number, file paths, config values). `initialPrompt` is static text in frontmatter — it cannot adapt to the current phase or workflow state.

3. **No benefit even if it worked.** The `files_to_read` protocol already handles bootstrap file reads, and skill prompts already inject the correct context. Moving bootstrap logic into `initialPrompt` would split the prompt construction across two locations (skill + agent frontmatter) with no gain.

### When PBR COULD Use It

If PBR ever supports a "headless agent mode" where `claude --agent pbr:executor` launches an executor as the main session agent (not as a subagent), `initialPrompt` could bootstrap it. This is not a current use case.

### Alternative That Is Better

Continue using skill-constructed `Task()` prompts with `files_to_read` blocks. This gives:
- Dynamic, phase-aware context injection
- Centralized prompt logic in the skill
- Works with the subagent invocation model PBR uses
