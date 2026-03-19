---
title: PreToolUse JSONL Behavior
description: Documents why PreToolUse hook decisions appear in PBR hook logs but not Claude Code session JSONL
---

# PreToolUse JSONL Behavior

## Behavior

PreToolUse hooks log decisions to PBR's hook logs but **NOT** to Claude Code's session JSONL.

- **PBR hook logs**: `.planning/logs/hooks-YYYY-MM-DD.jsonl` — contains all PreToolUse decisions (allow, block, warn)
- **Session JSONL**: `~/.claude/projects/{path}/*.jsonl` — does NOT contain PreToolUse hook decisions

## Why

Claude Code session JSONL records conversations, tool calls, and tool results. PreToolUse hooks are middleware that runs *before* the tool executes:

- If the hook **allows** the tool: the tool runs and its result appears in session JSONL normally
- If the hook **blocks** the tool: the tool never executes, so there is no tool result to record

In either case, the hook's own decision is not surfaced as a separate entry in session JSONL. This is by-design behavior in Claude Code's hook architecture.

## Where to Find PreToolUse Logs

Filter PBR hook logs for PreToolUse events:

```bash
grep '"event":"PreToolUse"' .planning/logs/hooks-$(date +%Y-%m-%d).jsonl
```

Each entry includes:

- `hook`: the hook script name (e.g., `validate-task`)
- `event`: `PreToolUse`
- `decision`: `allow`, `block`, or `warn`
- `source`: the originating hook script
- `details`: tool name, input parameters, block reason (if blocked)

## Hook Scripts That Log PreToolUse Events

| Script | Purpose |
|--------|---------|
| `validate-commit.js` | Validates commit message format |
| `validate-task.js` | Gates executor/planner/verifier spawns |
| `check-dangerous-commands.js` | Blocks destructive shell commands |
| `check-doc-sprawl.js` | Blocks excessive documentation creation |
| `check-skill-workflow.js` | Enforces skill workflow ordering |
| `check-summary-gate.js` | Validates SUMMARY.md before state updates |
| `pre-bash-dispatch.js` | Dispatch for Bash PreToolUse checks |
| `pre-write-dispatch.js` | Dispatch for Write/Edit PreToolUse checks |
| `block-skill-self-read.js` | Prevents skills from reading their own SKILL.md |
| `enforce-pbr-workflow.js` | Advisory PBR workflow compliance |
| `intercept-plan-mode.js` | Intercepts plan mode entry |
| `validate-skill-args.js` | Validates skill argument format |

## Audit Implications

The `/pbr:audit` agent must check PBR hook logs (`.planning/logs/hooks-*.jsonl`), not session JSONL, for PreToolUse evidence. Session JSONL cannot confirm whether PreToolUse hooks fired or what decisions they made.
