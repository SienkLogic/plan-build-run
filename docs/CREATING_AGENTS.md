# Creating Agents

A guide for adding or modifying specialized agents in Plan-Build-Run.

## What Is an Agent?

An agent is a markdown file (`{name}.md`) that defines a prompt for a subagent spawned via `Task()`. Each agent runs in a fresh 200k token context window, isolated from the main orchestrator. Agents are auto-loaded by Claude Code when referenced via `subagent_type: "pbr:{name}"`.

## File Location

```
plugins/pbr/agents/{name}.md
```

All agent files must be in `plugins/pbr/agents/` and follow the naming convention `{name}.md`.

## Agent Frontmatter

```yaml
---
name: {name}
description: "What this agent does"
model: sonnet
memory: none
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---
```

### Fields

| Field | Required | Values | Description |
|-------|----------|--------|-------------|
| `name` | Yes | `{name}` | Must match filename |
| `description` | Yes | String | Shown in agent listings |
| `model` | Yes | `sonnet`, `inherit`, `haiku` | Which model to use |
| `memory` | Yes | `none`, `user`, `project` | Memory scope |
| `tools` | Yes | List | Tools available to the agent |

### Model Selection

| Model | When to use |
|-------|-------------|
| `inherit` | Agent should use whatever the orchestrator uses (executor, planner, debugger, general) |
| `sonnet` | Read-heavy analysis work where speed matters more than creativity (researcher, verifier, plan-checker, integration-checker, codebase-mapper) |
| `haiku` | Lightweight synthesis or summarization (synthesizer) |

### Memory Settings

| Value | Meaning |
|-------|---------|
| `none` | No memory persistence — fresh each time (most agents) |
| `user` | Access to user-level memory (researcher — for domain context) |
| `project` | Access to project-level memory |

### Common Tool Sets

- **Read-only agents** (verifier, plan-checker): `Read, Glob, Grep, Bash`
- **Write agents** (executor, planner): `Read, Write, Edit, Bash, Glob, Grep`
- **Research agents** (researcher): `Read, Glob, Grep, WebFetch, WebSearch, Bash`

## Spawning Agents

From a skill's orchestrator, spawn agents using `Task()` with `subagent_type`:

```
Use Task() with:
  subagent_type: "pbr:researcher"
  prompt: "Research authentication approaches for this Node.js project..."
```

**Critical**: Never inline agent definitions into skill prompts. The `subagent_type` field tells Claude Code to auto-load the agent's `.md` file. Inlining wastes main context tokens.

## Agent Body Structure

After frontmatter, write the agent's prompt:

```markdown
# Plan-Build-Run {Name}

You are **{name}**, the {role} agent for the Plan-Build-Run development system.
{One paragraph explaining the agent's purpose.}

## When You're Used
{Context about when this agent is spawned}

## Methodology
{Step-by-step instructions for the agent's work}

## Output Budget
| Artifact | Target | Hard Limit |
|----------|--------|------------|
| {output type} | ≤ N tokens | M tokens |

## Interaction with Other Agents
Reference: `DEVELOPMENT-GUIDE.md` (repo root) — Agent Interaction Map section

## Anti-Patterns
Reference: `references/agent-anti-patterns.md`
{Agent-specific anti-patterns}
```

### Key Sections

- **Output Budget**: Target token sizes for each artifact the agent produces. Prevents unbounded output.
- **Self-Escalation**: When the agent should stop and recommend a different agent instead.
- **Anti-Patterns**: What the agent must NOT do (references shared doc plus agent-specific rules).

## Validation

```bash
npm run validate    # Checks agent frontmatter and structure
npm test            # Structural tests verify all agents
```

## Worked Example: A "reviewer" Agent

```yaml
---
name: reviewer
description: "Reviews code changes for quality, security, and convention adherence"
model: sonnet
memory: none
tools:
  - Read
  - Glob
  - Grep
  - Bash
---

# Plan-Build-Run Reviewer

You are **reviewer**, a code review agent for the Plan-Build-Run development system.
You review code changes for bugs, security issues, and project convention adherence.

## Methodology

1. Read the PLAN.md to understand intended changes
2. Use `git diff` to see actual changes
3. Check each change against project conventions (CLAUDE.md)
4. Report findings with confidence levels

## Output Budget

| Artifact | Target | Hard Limit |
|----------|--------|------------|
| Review report | ≤ 800 tokens | 1,500 tokens |

## Anti-Patterns

Reference: `references/agent-anti-patterns.md` for universal rules.

Additionally:
1. **DO NOT** make changes — review only
2. **DO NOT** nitpick style when conventions aren't documented
```

## Tips

- Agents get a fresh 200k context — they can afford to read more files than the orchestrator
- Always include an Output Budget table to prevent unbounded responses
- Reference shared docs (`agent-anti-patterns.md`, `DEVELOPMENT-GUIDE.md`) rather than duplicating
- Test cross-platform: use `path.join()` in any Node.js code, avoid hardcoded path separators
