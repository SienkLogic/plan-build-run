# Official Claude Code Hooks Documentation Research

> Research conducted: 2026-02-10
> Research date: 2026-02-10
> Mode: project-research
> Confidence: HIGH
> Sources consulted: 5 official Anthropic sources + GitHub repo

## Executive Summary

This document provides a comprehensive reference for Claude Code hooks based on official Anthropic documentation. All hook capabilities, event schemas, configuration patterns, and best practices documented here are verified against the official hooks reference at code.claude.com and the Claude Code GitHub repository.

**Key Findings**:
- 14 total hook events (Towline uses 8)
- 3 hook handler types: command, prompt, agent (Towline uses only command)
- Exit code behavior: 0 = allow, 2 = block, others = non-blocking error
- JSON output enables fine-grained control beyond simple allow/block
- Recent additions: TeammateIdle, TaskCompleted (multi-agent workflows), Setup hook
- Hook timeout increased from 60s to 10 minutes (600s) in recent versions

## 1. Complete Hook Event Reference

### Event Lifecycle Overview

Hooks fire at specific points in Claude Code's lifecycle. Some fire once per session (SessionStart, SessionEnd), while others fire repeatedly in the agentic loop (PreToolUse, PostToolUse, Stop).

```
SessionStart
    ↓
UserPromptSubmit → PreToolUse → [PermissionRequest] → PostToolUse/PostToolUseFailure
    ↑                ↓              ↓                         ↓
    ←────────────── Stop ←─────────┴────────────────────────┘

SubagentStart → [subagent agentic loop] → SubagentStop
Notification (fires anytime Claude needs attention)
TeammateIdle (agent teams only)
TaskCompleted (agent teams only)
PreCompact → [compaction] → SessionStart(compact)
SessionEnd
```

[S1: code.claude.com/docs/en/hooks]

---

### 1.1 SessionStart

**When it fires**: When a session begins or resumes.

**Matcher field**: `source` (how the session started)

**Matcher values**:
- `startup` — New session
- `resume` — `--resume`, `--continue`, or `/resume`
- `clear` — `/clear` command
- `compact` — Auto or manual compaction

**Can block?**: No (shows stderr to user only)

**Common use cases**: Load development context (open issues, recent commits), set environment variables, inject project conventions.

**Stdin schema**:
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/project",
  "permission_mode": "default",
  "hook_event_name": "SessionStart",
  "source": "startup",
  "model": "claude-sonnet-4-5-20250929",
  "agent_type": "optional-agent-name"
}
```

**Decision control** (exit 0 with JSON):
```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "String added to Claude's context"
  }
}
```

**Special capabilities**:
- **Plain text stdout** is added as context (JSON not required for simple cases)
- **`CLAUDE_ENV_FILE` environment variable**: Path to a file where hooks can persist environment variables for subsequent Bash commands

**Environment variable persistence example**:
```bash
#!/bin/bash
if [ -n "$CLAUDE_ENV_FILE" ]; then
  echo 'export NODE_ENV=production' >> "$CLAUDE_ENV_FILE"
  echo 'export DEBUG_LOG=true' >> "$CLAUDE_ENV_FILE"
fi
exit 0
```

[S1: code.claude.com/docs/en/hooks#sessionstart]

---

### 1.2 UserPromptSubmit

**When it fires**: When the user submits a prompt, before Claude processes it.

**Matcher field**: None (always fires on every occurrence)

**Can block?**: Yes (exit 2 or `decision: "block"`)

**Common use cases**: Add context based on prompt content, validate prompts, block certain types of requests.

**Stdin schema**:
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/project",
  "permission_mode": "default",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "Write a function to calculate factorial"
}
```

**Decision control** (exit 0 with JSON):
```json
{
  "decision": "block",
  "reason": "Explanation shown to user (not added to context)",
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "String added to Claude's context"
  }
}
```

**Special capabilities**:
- **Plain text stdout** is added as context (shown as hook output in transcript)
- **JSON `additionalContext`** is added more discretely
- Blocking erases the prompt from context entirely

[S1: code.claude.com/docs/en/hooks#userpromptsubmit]

---

### 1.3 PreToolUse

**When it fires**: After Claude creates tool parameters, before processing the tool call.

**Matcher field**: `tool_name`

**Matcher values**: `Bash`, `Edit`, `Write`, `Read`, `Glob`, `Grep`, `Task`, `WebFetch`, `WebSearch`, plus MCP tools (`mcp__<server>__<tool>`)

**Can block?**: Yes (exit 2 or `permissionDecision: "deny"`)

**Common use cases**: Validate commands, block dangerous operations, modify tool input, auto-approve safe actions.

**Stdin schema** (common fields + tool-specific fields):
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/project",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "npm test",
    "description": "Run test suite",
    "timeout": 120000,
    "run_in_background": false
  },
  "tool_use_id": "toolu_01ABC123..."
}
```

**Tool-specific input schemas**:

| Tool | Fields |
|------|--------|
| **Bash** | `command`, `description`, `timeout`, `run_in_background` |
| **Write** | `file_path`, `content` |
| **Edit** | `file_path`, `old_string`, `new_string`, `replace_all` |
| **Read** | `file_path`, `offset`, `limit` |
| **Glob** | `pattern`, `path` |
| **Grep** | `pattern`, `path`, `glob`, `output_mode`, `-i`, `multiline` |
| **WebFetch** | `url`, `prompt` |
| **WebSearch** | `query`, `allowed_domains`, `blocked_domains` |
| **Task** | `prompt`, `description`, `subagent_type`, `model` |

**Decision control** (exit 0 with JSON):
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow" | "deny" | "ask",
    "permissionDecisionReason": "Explanation",
    "updatedInput": {
      "field_to_modify": "new value"
    },
    "additionalContext": "Context added before tool executes"
  }
}
```

**Three permission decisions**:
- `"allow"` — Bypass permission system, auto-approve
- `"deny"` — Block tool call, feed reason to Claude
- `"ask"` — Show permission prompt to user (default behavior)

**IMPORTANT**: PreToolUse uses `hookSpecificOutput` (not top-level `decision`). Deprecated top-level `decision: "approve"` and `decision: "block"` still work but should not be used.

[S1: code.claude.com/docs/en/hooks#pretooluse]

---

### 1.4 PermissionRequest

**When it fires**: When a permission dialog is about to be shown to the user.

**Matcher field**: `tool_name` (same values as PreToolUse)

**Can block?**: Yes (exit 2 or `decision.behavior: "deny"`)

**Common use cases**: Auto-approve safe operations, auto-deny dangerous operations, modify tool input before approval.

**Difference from PreToolUse**: PermissionRequest fires only when a permission dialog would be shown. PreToolUse fires before every tool call regardless of permission status.

**Stdin schema**:
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/project",
  "permission_mode": "default",
  "hook_event_name": "PermissionRequest",
  "tool_name": "Bash",
  "tool_input": {
    "command": "rm -rf node_modules"
  },
  "permission_suggestions": [
    { "type": "toolAlwaysAllow", "tool": "Bash" }
  ]
}
```

**Decision control** (exit 0 with JSON):
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow" | "deny",
      "updatedInput": { "command": "npm run lint" },
      "updatedPermissions": [ /* permission rule updates */ ],
      "message": "For deny only: reason shown to Claude",
      "interrupt": false
    }
  }
}
```

**LIMITATION**: PermissionRequest hooks do not fire in non-interactive mode (`-p`). Use PreToolUse hooks for automated permission decisions.

[S1: code.claude.com/docs/en/hooks#permissionrequest]

---

### 1.5 PostToolUse

**When it fires**: Immediately after a tool completes successfully.

**Matcher field**: `tool_name` (same values as PreToolUse)

**Can block?**: No (tool already ran, but can provide feedback to Claude)

**Common use cases**: Run linters/formatters, log tool usage, validate output, send notifications.

**Stdin schema**:
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/project",
  "permission_mode": "default",
  "hook_event_name": "PostToolUse",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/path/to/file.txt",
    "content": "file content"
  },
  "tool_response": {
    "filePath": "/path/to/file.txt",
    "success": true
  },
  "tool_use_id": "toolu_01ABC123..."
}
```

**Decision control** (exit 0 with JSON):
```json
{
  "decision": "block",
  "reason": "Explanation shown to Claude",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Additional context for Claude",
    "updatedMCPToolOutput": "For MCP tools only: replaces tool output"
  }
}
```

**Note**: `decision: "block"` does NOT undo the tool action (it already happened). It prompts Claude with the reason so Claude can take corrective action.

[S1: code.claude.com/docs/en/hooks#posttooluse]

---

### 1.6 PostToolUseFailure

**When it fires**: When a tool execution fails (throws error or returns failure result).

**Matcher field**: `tool_name` (same values as PreToolUse)

**Can block?**: No (tool already failed, but can provide additional context)

**Common use cases**: Log failures, send alerts, provide corrective feedback.

**Stdin schema**:
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/project",
  "permission_mode": "default",
  "hook_event_name": "PostToolUseFailure",
  "tool_name": "Bash",
  "tool_input": {
    "command": "npm test"
  },
  "tool_use_id": "toolu_01ABC123...",
  "error": "Command exited with non-zero status code 1",
  "is_interrupt": false
}
```

**Decision control** (exit 0 with JSON):
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUseFailure",
    "additionalContext": "Additional context about the failure"
  }
}
```

[S1: code.claude.com/docs/en/hooks#posttoolusefailure]

---

### 1.7 Notification

**When it fires**: When Claude Code sends a notification.

**Matcher field**: `notification_type`

**Matcher values**:
- `permission_prompt` — Claude needs permission
- `idle_prompt` — Claude is idle waiting for input
- `auth_success` — Authentication succeeded
- `elicitation_dialog` — User feedback dialog

**Can block?**: No (cannot block or modify notifications)

**Common use cases**: Desktop notifications, Slack/Discord alerts, mobile push notifications.

**Stdin schema**:
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/project",
  "permission_mode": "default",
  "hook_event_name": "Notification",
  "message": "Claude needs your permission to use Bash",
  "title": "Permission needed",
  "notification_type": "permission_prompt"
}
```

**Decision control** (exit 0 with JSON):
```json
{
  "hookSpecificOutput": {
    "hookEventName": "Notification",
    "additionalContext": "String added to conversation"
  }
}
```

[S1: code.claude.com/docs/en/hooks#notification]

---

### 1.8 SubagentStart

**When it fires**: When a subagent is spawned via the Task tool.

**Matcher field**: `agent_type`

**Matcher values**: Built-in agents (`Bash`, `Explore`, `Plan`, `Debug`, `Edit`, `Research`, `Review`) or custom agent names from `.claude/agents/`

**Can block?**: No (cannot block subagent creation, but can inject context)

**Common use cases**: Log subagent activity, inject context, track agent usage.

**Stdin schema**:
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/project",
  "permission_mode": "default",
  "hook_event_name": "SubagentStart",
  "agent_id": "agent-abc123",
  "agent_type": "Explore"
}
```

**Decision control** (exit 0 with JSON):
```json
{
  "hookSpecificOutput": {
    "hookEventName": "SubagentStart",
    "additionalContext": "Context injected into subagent"
  }
}
```

[S1: code.claude.com/docs/en/hooks#subagentstart]

---

### 1.9 SubagentStop

**When it fires**: When a subagent has finished responding.

**Matcher field**: `agent_type` (same values as SubagentStart)

**Can block?**: Yes (exit 2 or `decision: "block"`)

**Common use cases**: Verify subagent work quality, enforce completion criteria, log completion.

**Stdin schema**:
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/main-transcript.jsonl",
  "cwd": "/path/to/project",
  "permission_mode": "default",
  "hook_event_name": "SubagentStop",
  "stop_hook_active": false,
  "agent_id": "def456",
  "agent_type": "Explore",
  "agent_transcript_path": "/path/to/subagents/agent-def456.jsonl"
}
```

**Decision control** (same as Stop hook):
```json
{
  "decision": "block",
  "reason": "Must be provided when subagent is blocked from stopping"
}
```

**Note**: `stop_hook_active: true` indicates SubagentStop is already continuing due to a hook. Check this to prevent infinite loops.

[S1: code.claude.com/docs/en/hooks#subagentstop]

---

### 1.10 Stop

**When it fires**: When Claude finishes responding (does NOT fire on user interrupt).

**Matcher field**: None (always fires on every occurrence)

**Can block?**: Yes (exit 2 or `decision: "block"`)

**Common use cases**: Auto-continue workflows, enforce completion criteria, verify all tasks done.

**Stdin schema**:
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/project",
  "permission_mode": "default",
  "hook_event_name": "Stop",
  "stop_hook_active": true
}
```

**Decision control** (exit 0 with JSON):
```json
{
  "decision": "block",
  "reason": "Required when decision is block. Tells Claude why it should continue."
}
```

**CRITICAL**: Check `stop_hook_active` to prevent infinite loops. If `true`, the hook already triggered a continuation. Exit 0 to allow Claude to stop.

```bash
#!/bin/bash
INPUT=$(cat)
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0  # Allow Claude to stop
fi
# ... rest of hook logic
```

[S1: code.claude.com/docs/en/hooks#stop]

---

### 1.11 TeammateIdle

**When it fires**: When an agent team teammate is about to go idle after finishing its turn.

**Matcher field**: None (always fires on every occurrence)

**Can block?**: Yes (exit 2 prevents teammate from going idle)

**Common use cases**: Enforce quality gates (lint checks, tests), verify output exists, ensure work complete.

**Stdin schema**:
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/project",
  "permission_mode": "default",
  "hook_event_name": "TeammateIdle",
  "teammate_name": "researcher",
  "team_name": "my-project"
}
```

**Decision control**: Exit code only (no JSON decision control)
- Exit 0 = allow teammate to go idle
- Exit 2 = prevent idle, stderr message is fed back to teammate as feedback

```bash
#!/bin/bash
if [ ! -f "./dist/output.js" ]; then
  echo "Build artifact missing. Run the build before stopping." >&2
  exit 2
fi
exit 0
```

**LIMITATION**: TeammateIdle does NOT support prompt-based or agent-based hooks (only command hooks).

[S1: code.claude.com/docs/en/hooks#teammateidle]

---

### 1.12 TaskCompleted

**When it fires**: When a task is being marked as completed (either explicitly via TaskUpdate tool or when an agent team teammate finishes with in-progress tasks).

**Matcher field**: None (always fires on every occurrence)

**Can block?**: Yes (exit 2 prevents task completion)

**Common use cases**: Enforce completion criteria (tests pass, lint clean), verify deliverables exist.

**Stdin schema**:
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/project",
  "permission_mode": "default",
  "hook_event_name": "TaskCompleted",
  "task_id": "task-001",
  "task_subject": "Implement user authentication",
  "task_description": "Add login and signup endpoints",
  "teammate_name": "implementer",
  "team_name": "my-project"
}
```

**Decision control**: Exit code only (no JSON decision control)
- Exit 0 = allow task completion
- Exit 2 = prevent completion, stderr message is fed back to model as feedback

```bash
#!/bin/bash
INPUT=$(cat)
TASK_SUBJECT=$(echo "$INPUT" | jq -r '.task_subject')

if ! npm test 2>&1; then
  echo "Tests not passing. Fix failing tests before completing: $TASK_SUBJECT" >&2
  exit 2
fi
exit 0
```

**LIMITATION**: TaskCompleted does NOT support prompt-based or agent-based hooks (only command hooks).

[S1: code.claude.com/docs/en/hooks#taskcompleted]

---

### 1.13 PreCompact

**When it fires**: Before Claude Code runs a compaction operation.

**Matcher field**: `trigger`

**Matcher values**:
- `manual` — `/compact` command
- `auto` — Auto-compact when context window is full

**Can block?**: No (cannot block compaction, but can inject context)

**Common use cases**: Preserve critical state before compaction, log compaction events, prepare context for post-compact injection.

**Stdin schema**:
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/project",
  "permission_mode": "default",
  "hook_event_name": "PreCompact",
  "trigger": "manual",
  "custom_instructions": ""
}
```

**Decision control**: No decision control (exit 0 only)

**Note**: For manual compaction, `custom_instructions` contains what the user passed to `/compact`. For auto-compaction, it's empty.

[S1: code.claude.com/docs/en/hooks#precompact]

---

### 1.14 SessionEnd

**When it fires**: When a session terminates.

**Matcher field**: `reason`

**Matcher values**:
- `clear` — Session cleared with `/clear`
- `logout` — User logged out
- `prompt_input_exit` — User exited while prompt input was visible
- `bypass_permissions_disabled` — Bypass permissions mode disabled
- `other` — Other exit reasons

**Can block?**: No (cannot block session termination)

**Common use cases**: Cleanup tasks, log session statistics, save session state.

**Stdin schema**:
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/project",
  "permission_mode": "default",
  "hook_event_name": "SessionEnd",
  "reason": "other"
}
```

**Decision control**: No decision control (exit 0 only)

[S1: code.claude.com/docs/en/hooks#sessionend]

---

### 1.15 Setup (NEW)

**When it fires**: Triggered via CLI flags for repository setup and maintenance operations.

**CLI triggers**:
- `claude --init` — Initial setup
- `claude --init-only` — Setup without starting a session
- `claude --maintenance` — Maintenance operations

**Matcher field**: Not documented (likely `trigger` or similar)

**Can block?**: Not documented

**Common use cases**: Repository initialization, dependency installation, configuration validation.

**Note**: Added in version 2.1.10. Full documentation not yet available in the hooks reference.

[S4: github.com/anthropics/claude-code CHANGELOG.md, claudelog.com]

---

## 2. Hook Capabilities

### 2.1 What Hooks Can Do

1. **Execute shell commands** with full user permissions
2. **Read tool input** before execution (PreToolUse)
3. **Block tool calls** (PreToolUse, PermissionRequest)
4. **Modify tool input** before execution (PreToolUse, PermissionRequest)
5. **Provide feedback to Claude** after tool execution (PostToolUse, PostToolUseFailure)
6. **Inject context** into conversation (SessionStart, UserPromptSubmit, SubagentStart)
7. **Prevent Claude from stopping** (Stop, SubagentStop)
8. **Validate and block prompts** (UserPromptSubmit)
9. **Send notifications** to external systems (Notification event)
10. **Persist environment variables** (SessionStart via `CLAUDE_ENV_FILE`)
11. **Run in background** (async hooks with `"async": true`)
12. **Use LLM for decisions** (prompt-based and agent-based hooks)

[S1: code.claude.com/docs/en/hooks]

---

### 2.2 What Hooks Cannot Do

1. **Cannot trigger slash commands or tool calls directly** — hooks communicate only through stdin/stdout/stderr
2. **Cannot undo actions in PostToolUse** — tool already executed
3. **Cannot modify tool output** (except MCP tools via `updatedMCPToolOutput`)
4. **Cannot access Claude's internal state** beyond what's in stdin JSON
5. **Cannot fire in non-interactive mode for PermissionRequest** — use PreToolUse instead
6. **Cannot block SessionStart, SessionEnd, PreCompact, Notification** — these are informational only
7. **Cannot use prompt/agent hooks for TeammateIdle or TaskCompleted** — command hooks only
8. **Async hooks cannot return decisions** — action already proceeded by the time hook completes

[S1: code.claude.com/docs/en/hooks#limitations]

---

### 2.3 Hook Handler Types

Claude Code supports three types of hook handlers:

#### Command Hooks (`type: "command"`)

Run a shell command. Script receives JSON on stdin, returns via exit code and stdout.

```json
{
  "type": "command",
  "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/validate.js",
  "async": false,
  "timeout": 600
}
```

**Fields**:
- `command` (required): Shell command to execute
- `async` (optional): If true, runs in background without blocking (default: false)
- `timeout` (optional): Seconds before canceling (default: 600 for command, 30 for prompt, 60 for agent)
- `statusMessage` (optional): Custom spinner message while hook runs
- `once` (optional): If true, runs only once per session then removed (skills only)

[S1: code.claude.com/docs/en/hooks#command-hook-fields]

---

#### Prompt Hooks (`type: "prompt"`)

Send prompt to Claude model for single-turn yes/no decision.

```json
{
  "type": "prompt",
  "prompt": "Evaluate if Claude should stop: $ARGUMENTS. Check if all tasks complete.",
  "model": "haiku",
  "timeout": 30
}
```

**Fields**:
- `prompt` (required): Prompt text, use `$ARGUMENTS` placeholder for hook input JSON
- `model` (optional): Model for evaluation (default: fast model)
- `timeout` (optional): Seconds before canceling (default: 30)

**Response schema**:
```json
{
  "ok": true | false,
  "reason": "Required when ok=false. Explanation for decision."
}
```

**Supported events**: PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, UserPromptSubmit, Stop, SubagentStop, TaskCompleted

**NOT supported**: TeammateIdle

[S1: code.claude.com/docs/en/hooks#prompt-based-hooks]

---

#### Agent Hooks (`type: "agent"`)

Spawn subagent with tool access (Read, Grep, Glob) for multi-turn verification (up to 50 turns).

```json
{
  "type": "agent",
  "prompt": "Verify all unit tests pass. Run test suite and check results. $ARGUMENTS",
  "model": "sonnet",
  "timeout": 120
}
```

**Fields**: Same as prompt hooks

**Response schema**: Same as prompt hooks (`ok`/`reason`)

**When to use**: Verification requires inspecting actual files or running commands

**Supported events**: Same as prompt hooks

[S1: code.claude.com/docs/en/hooks#agent-based-hooks]

---

### 2.4 Async Hooks (Background Execution)

Set `"async": true` on command hooks to run in background without blocking Claude.

**Key limitations**:
- Only `type: "command"` supports async (not prompt or agent hooks)
- Async hooks **cannot block or control behavior** (action already proceeded)
- Response fields (`decision`, `permissionDecision`, `continue`) have no effect
- Output delivered on next conversation turn

**Use cases**: Long-running tests, deployments, external API calls, logging

**Example**:
```json
{
  "type": "command",
  "command": "/path/to/run-tests.sh",
  "async": true,
  "timeout": 300
}
```

**Output delivery**: When hook finishes, `systemMessage` or `additionalContext` from JSON output is delivered to Claude on next turn.

[S1: code.claude.com/docs/en/hooks#run-hooks-in-the-background]

---

## 3. Configuration Reference

### 3.1 Configuration Structure

Three levels of nesting:

1. **Hook event** — lifecycle point (PreToolUse, Stop, etc.)
2. **Matcher group** — filter when it fires (tool name, agent type, etc.)
3. **Hook handlers** — command/prompt/agent that runs

```json
{
  "hooks": {
    "PreToolUse": [                    // 1. Event
      {
        "matcher": "Bash",             // 2. Matcher (optional)
        "hooks": [                     // 3. Handlers
          {
            "type": "command",
            "command": "./validate.sh"
          }
        ]
      }
    ]
  }
}
```

[S1: code.claude.com/docs/en/hooks#configuration]

---

### 3.2 Hook Locations (Scope)

| Location | Scope | Shareable | Priority |
|----------|-------|-----------|----------|
| `~/.claude/settings.json` | All projects (user-wide) | No | 3 |
| `.claude/settings.json` | Single project | Yes (commit to repo) | 2 |
| `.claude/settings.local.json` | Single project | No (gitignored) | 1 (highest) |
| Managed policy | Organization-wide | Yes (admin-controlled) | 4 |
| Plugin `hooks/hooks.json` | When plugin enabled | Yes (bundled) | Merged |
| Skill/agent frontmatter | Component active only | Yes (in component file) | Merged |

**Settings resolution**: All locations are merged, with `.local.json` overriding project settings, which override user settings, which override managed policy.

[S1: code.claude.com/docs/en/hooks#hook-locations]

---

### 3.3 Matcher Patterns

Matcher is a **regex string** that filters when hooks fire. Use `"*"`, `""`, or omit `matcher` to match all.

| Event | Matcher field | Example values |
|-------|--------------|----------------|
| PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest | `tool_name` | `Bash`, `Edit\|Write`, `mcp__.*` |
| SessionStart | `source` | `startup`, `resume`, `clear`, `compact` |
| SessionEnd | `reason` | `clear`, `logout`, `prompt_input_exit`, `other` |
| Notification | `notification_type` | `permission_prompt`, `idle_prompt` |
| SubagentStart, SubagentStop | `agent_type` | `Bash`, `Explore`, `Plan`, custom names |
| PreCompact | `trigger` | `manual`, `auto` |
| UserPromptSubmit, Stop, TeammateIdle, TaskCompleted | No matcher support | Always fires |

**Regex examples**:
- `Edit|Write` — matches either tool
- `Notebook.*` — matches any tool starting with Notebook
- `mcp__github__.*` — matches all GitHub MCP server tools
- `mcp__.*__write.*` — matches any MCP tool containing "write"

[S1: code.claude.com/docs/en/hooks#matcher-patterns]

---

### 3.4 MCP Tool Matchers

MCP tools follow naming pattern: `mcp__<server>__<tool>`

Examples:
- `mcp__memory__create_entities` — Memory server's create entities tool
- `mcp__filesystem__read_file` — Filesystem server's read file tool
- `mcp__github__search_repositories` — GitHub server's search tool

**Matcher patterns**:
- `mcp__memory__.*` — all tools from memory server
- `mcp__.*__write.*` — any tool containing "write" from any server

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__memory__.*",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Memory operation' >> mcp.log"
          }
        ]
      }
    ]
  }
}
```

[S1: code.claude.com/docs/en/hooks#match-mcp-tools]

---

### 3.5 Environment Variables

**`$CLAUDE_PROJECT_DIR`**: Project root directory. Use for referencing project scripts.

```json
{
  "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/check.sh"
}
```

**`${CLAUDE_PLUGIN_ROOT}`**: Plugin's root directory. Use for plugin-bundled scripts.

```json
{
  "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/validate.js"
}
```

**`$CLAUDE_CODE_REMOTE`**: Set to `"true"` in remote web environments, not set in local CLI.

**`$CLAUDE_ENV_FILE`** (SessionStart only): Path to file where hooks can persist environment variables for subsequent Bash commands.

```bash
#!/bin/bash
if [ -n "$CLAUDE_ENV_FILE" ]; then
  echo 'export NODE_ENV=production' >> "$CLAUDE_ENV_FILE"
fi
```

[S1: code.claude.com/docs/en/hooks#reference-scripts-by-path]

---

### 3.6 Hooks in Skills and Agents

Hooks can be defined in skill/agent YAML frontmatter with same configuration format:

```yaml
---
name: secure-operations
description: Operations with security checks
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/security-check.sh"
---
```

**Scope**: Hooks only run when component is active, cleaned up when it finishes.

**For agents**: `Stop` hooks auto-convert to `SubagentStop` (since that's the event that fires).

[S1: code.claude.com/docs/en/hooks#hooks-in-skills-and-agents]

---

### 3.7 The /hooks Menu

Type `/hooks` in Claude Code for interactive hooks manager:

- View all hooks with source labels: `[User]`, `[Project]`, `[Local]`, `[Plugin]`
- Add new hooks without editing JSON
- Delete hooks
- Disable all hooks toggle

**Hot reload**: Hooks added via `/hooks` take effect immediately. Manual JSON edits require review in `/hooks` menu or session restart.

[S1: code.claude.com/docs/en/hooks#the-hooks-menu]

---

### 3.8 Disable Hooks

**Disable all hooks**: Set `"disableAllHooks": true` in settings or use toggle in `/hooks` menu.

**Disable individual hook**: Not supported. Delete it or use feature flag in your script.

**Disable background tasks**: Set environment variable `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` to disable all background tasks including hooks.

[S1: code.claude.com/docs/en/hooks#disable-or-remove-hooks]

---

## 4. Common Input/Output Fields

### 4.1 Universal Input Fields (All Events)

Every hook event receives these fields via stdin:

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/project",
  "permission_mode": "default" | "plan" | "acceptEdits" | "dontAsk" | "bypassPermissions",
  "hook_event_name": "PreToolUse"
}
```

[S1: code.claude.com/docs/en/hooks#common-input-fields]

---

### 4.2 Exit Code Behavior

| Exit Code | Meaning | Stdout/Stderr Handling |
|-----------|---------|------------------------|
| **0** | Success | Stdout parsed for JSON output. For UserPromptSubmit/SessionStart, plain stdout added to context. Stderr shown in verbose mode. |
| **2** | Blocking error | **Stdout and JSON ignored.** Stderr fed back to Claude (or user for non-blocking events). |
| **Other** | Non-blocking error | Stderr shown in verbose mode. Action proceeds. |

[S1: code.claude.com/docs/en/hooks#exit-code-output]

---

### 4.3 Exit Code 2 Behavior Per Event

| Event | Can block? | What happens on exit 2 |
|-------|-----------|------------------------|
| PreToolUse | Yes | Blocks tool call |
| PermissionRequest | Yes | Denies permission |
| UserPromptSubmit | Yes | Blocks prompt, erases it |
| Stop | Yes | Prevents stopping, continues |
| SubagentStop | Yes | Prevents stopping |
| TeammateIdle | Yes | Prevents idle (continues working) |
| TaskCompleted | Yes | Prevents completion |
| PostToolUse | No | Shows stderr to Claude (tool ran) |
| PostToolUseFailure | No | Shows stderr to Claude (tool failed) |
| Notification | No | Shows stderr to user only |
| SubagentStart | No | Shows stderr to user only |
| SessionStart | No | Shows stderr to user only |
| SessionEnd | No | Shows stderr to user only |
| PreCompact | No | Shows stderr to user only |

[S1: code.claude.com/docs/en/hooks#exit-code-2-behavior-per-event]

---

### 4.4 Universal JSON Output Fields

Available to all events when exiting 0:

```json
{
  "continue": true | false,
  "stopReason": "Message shown when continue=false (not to Claude)",
  "suppressOutput": false,
  "systemMessage": "Warning message shown to user"
}
```

- `continue: false` — Stops Claude entirely, overrides all other decision fields
- `stopReason` — User-facing message when stopping
- `suppressOutput: true` — Hides stdout from verbose mode
- `systemMessage` — Warning shown to user (not Claude)

[S1: code.claude.com/docs/en/hooks#json-output]

---

### 4.5 Decision Control Summary

Not every event supports blocking through JSON. Quick reference:

| Events | Decision pattern | Key fields |
|--------|------------------|------------|
| UserPromptSubmit, PostToolUse, PostToolUseFailure, Stop, SubagentStop | Top-level `decision` | `decision: "block"`, `reason` |
| TeammateIdle, TaskCompleted | Exit code only | Exit 2 blocks, stderr as feedback |
| PreToolUse | `hookSpecificOutput` | `permissionDecision` (allow/deny/ask), `permissionDecisionReason` |
| PermissionRequest | `hookSpecificOutput` | `decision.behavior` (allow/deny) |

[S1: code.claude.com/docs/en/hooks#decision-control]

---

## 5. Best Practices from Anthropic

### 5.1 Security Best Practices

1. **Validate and sanitize inputs** — never trust stdin data blindly
2. **Always quote shell variables** — use `"$VAR"` not `$VAR`
3. **Block path traversal** — check for `..` in file paths
4. **Use absolute paths** — specify full paths for scripts using `"$CLAUDE_PROJECT_DIR"`
5. **Skip sensitive files** — block `.env`, `.git/`, keys, credentials
6. **Review hook commands** before adding — hooks run with full user permissions
7. **Test hooks manually** before deploying:
   ```bash
   echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | ./hook.sh
   echo $?  # Check exit code
   ```

[S1: code.claude.com/docs/en/hooks#security-considerations]

---

### 5.2 Hook Development Best Practices

1. **Keep SessionStart hooks fast** — they run on every session
2. **Use matchers to reduce overhead** — don't fire on every event if you only need specific tools
3. **Check `stop_hook_active`** in Stop hooks to prevent infinite loops
4. **Use async hooks for long operations** — deployments, test suites, external APIs
5. **Exit 0 with JSON for structured control** — don't mix exit 2 and JSON (exit 2 ignores JSON)
6. **Write clear `statusMessage`** — helps user understand what hook is doing
7. **Log to files, not stdout** — stdout for JSON only (except UserPromptSubmit/SessionStart)
8. **Handle missing tools gracefully** — check if `jq` installed before using
9. **Use plugin hooks for shareable functionality** — bundle in `hooks/hooks.json`
10. **Test with `claude --debug`** — see which hooks matched, exit codes, and output

[S1: code.claude.com/docs/en/hooks-guide, S1: code.claude.com/docs/en/hooks]

---

### 5.3 Debugging Hooks

1. **Run with debug flag**: `claude --debug`
   ```
   [DEBUG] Executing hooks for PostToolUse:Write
   [DEBUG] Found 1 hook matchers in settings
   [DEBUG] Matched 1 hooks for query "Write"
   [DEBUG] Hook command completed with status 0
   ```

2. **Toggle verbose mode**: Press `Ctrl+O` to see hook progress in transcript

3. **Test hook scripts manually**:
   ```bash
   echo '{"tool_name":"Bash","tool_input":{"command":"npm test"}}' | ./hook.sh
   echo $?  # Check exit code
   ```

4. **Check JSON validity**:
   ```bash
   ./hook.sh < sample-input.json | jq .
   ```

5. **Watch hook log** (if using logHook utility):
   ```bash
   tail -f .planning/.hook-log
   ```

[S1: code.claude.com/docs/en/hooks#debug-hooks]

---

## 6. New/Recent Features (2025-2026)

### 6.1 Hook Timeout Increase

**Change**: Default timeout increased from 60 seconds to 10 minutes (600 seconds)

**When**: Recent releases (exact version TBD)

**Impact**: Hooks can now run longer operations without timing out. Custom timeout still configurable via `timeout` field.

[S4: Multiple sources indicate recent change]

---

### 6.2 Setup Hook Event

**Added**: Version 2.1.10

**Purpose**: Repository setup and maintenance operations

**Triggers**:
- `claude --init` — Initial setup
- `claude --init-only` — Setup without starting session
- `claude --maintenance` — Maintenance operations

**Use cases**: Dependency installation, configuration validation, repository initialization

**Note**: Full documentation not yet in hooks reference. Matcher field and stdin schema TBD.

[S4: github.com/anthropics/claude-code CHANGELOG.md]

---

### 6.3 Multi-Agent Workflow Events

**Added**: Version 2.1.33

**Events**:
- **TeammateIdle** — Teammate about to go idle
- **TaskCompleted** — Task being marked as completed

**Purpose**: Enforce quality gates in agent team workflows

**Requirements**: Agent teams feature (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)

**Limitations**: Only command hooks (no prompt/agent hooks)

[S4: github.com/anthropics/claude-code CHANGELOG.md, S1: code.claude.com/docs/en/hooks]

---

### 6.4 PreToolUse additionalContext

**Added**: Version 2.1.9

**Feature**: PreToolUse hooks can now return `additionalContext` to inject information before tool executes

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "additionalContext": "Current environment: production. Proceed with caution."
  }
}
```

[S4: github.com/anthropics/claude-code CHANGELOG.md]

---

### 6.5 Prompt and Agent Hook Types from Plugins

**Added**: Version 2.1.x (exact version TBD)

**Change**: Plugins can now define prompt and agent hooks (previously only command hooks supported)

**Impact**: Plugin authors can use LLM-based decision making in bundled hooks

[S4: github.com/anthropics/claude-code CHANGELOG.md]

---

### 6.6 Permission Rules Normalization

**Added**: Version 2.1.20

**Change**: Permission rules like `Bash(*)` now accepted and treated equivalent to `Bash`

**Impact**: Wildcard support for tool permissions

[S4: github.com/anthropics/claude-code CHANGELOG.md]

---

## 7. Gaps in Towline's Usage

### 7.1 Events Not Used by Towline

| Event | Use Case | Priority |
|-------|----------|----------|
| **UserPromptSubmit** | Add context based on prompt, validate requests, block certain patterns | MEDIUM |
| **PermissionRequest** | Auto-approve/deny specific operations, modify tool input before approval | LOW |
| **PostToolUseFailure** | Log failures, send alerts, provide corrective feedback | LOW |
| **Notification** | Desktop notifications, external alerts (Slack, Discord) | LOW |
| **TeammateIdle** | Quality gates for multi-agent workflows (requires agent teams) | LOW |
| **TaskCompleted** | Enforce completion criteria (requires agent teams) | LOW |
| **Setup** | Repository initialization, dependency installation | MEDIUM |

**Recommendation**: UserPromptSubmit could be valuable for validating workflow commands or injecting phase context. Setup hook could automate project initialization.

---

### 7.2 Hook Types Not Used

**Prompt Hooks** (`type: "prompt"`):
- Single-turn LLM evaluation for yes/no decisions
- Could be useful for Stop hook (verify all tasks complete)
- Lower overhead than spawning full subagent

**Agent Hooks** (`type: "agent"`):
- Multi-turn verification with tool access
- Could be useful for PostToolUse (verify file changes meet criteria)
- More powerful than simple command hooks for quality checks

**Recommendation**: Consider prompt-based Stop hook to verify workflow completion more intelligently than the current `auto_continue` flag.

---

### 7.3 Capabilities Not Used

1. **Async hooks** (`"async": true`):
   - Could run long checks (tests, linting) without blocking
   - Example: Run full test suite after phase completion

2. **`additionalContext` injection**:
   - PreToolUse can inject context before tool runs
   - SessionStart plain stdout for dynamic context
   - Could inject phase goals before executor runs

3. **`updatedInput` modification**:
   - PreToolUse can modify tool input before execution
   - Could rewrite dangerous commands to safer alternatives

4. **MCP tool hooks**:
   - No matchers for MCP tools (Towline doesn't use MCP yet)
   - Future consideration if MCP integration added

5. **Hooks in skill/agent frontmatter**:
   - Could scope hooks to specific skills
   - Example: Security checks only when certain agents run

**Recommendation**: Explore async hooks for non-blocking quality checks, and additionalContext for phase-specific context injection.

---

### 7.4 Configuration Features Not Used

1. **Matchers on SessionStart**:
   - Could inject different context for `startup` vs `resume` vs `compact`
   - Current `progress-tracker.js` runs on all SessionStart events

2. **`statusMessage` field**:
   - Custom spinner messages while hooks run
   - Could improve UX ("Checking roadmap sync...", "Validating commit message...")

3. **`once` field**:
   - Run hook once per session then remove
   - Useful for session initialization that shouldn't repeat

4. **`.claude/settings.local.json`**:
   - User-specific hooks that don't get committed
   - Could allow per-developer customization

5. **Plugin `description` field**:
   - Top-level description in `hooks/hooks.json`
   - Documents what the hook set does

**Recommendation**: Add `statusMessage` to hooks for better UX feedback, and consider SessionStart matchers for context-specific logic.

---

## 8. Version History (Hooks-Related Changes)

| Version | Date | Changes |
|---------|------|---------|
| 2.1.33 | Recent | Added TeammateIdle and TaskCompleted events for multi-agent workflows |
| 2.1.29 | Recent | Fixed startup performance with `saved_hook_context` |
| 2.1.20 | Recent | Permission rules normalization (Bash(*) → Bash) |
| 2.1.19 | Recent | Fixed backgrounded hook commands not returning early |
| 2.1.16 | Recent | New task management system integrating with hooks |
| 2.1.10 | Recent | Added Setup hook event (--init, --init-only, --maintenance) |
| 2.1.9 | Recent | PreToolUse hooks can return additionalContext |
| 2.1.4 | Recent | Added CLAUDE_CODE_DISABLE_BACKGROUND_TASKS environment variable |
| 2.1.x | Recent | Prompt and agent hook types support in plugins |
| Unknown | Recent | Hook timeout increased from 60s to 10 minutes |

[S4: github.com/anthropics/claude-code CHANGELOG.md]

---

## 9. Reference Implementation

Anthropic provides a complete reference implementation in the Claude Code GitHub repo:

**Bash Command Validator**: [bash_command_validator_example.py](https://github.com/anthropics/claude-code/blob/main/examples/hooks/bash_command_validator_example.py)

Features:
- Validates bash commands against security rules
- Blocks dangerous patterns (rm -rf, dd, mkfs, etc.)
- Checks path traversal attempts
- Protects sensitive files
- Provides detailed feedback to Claude

**Additional Examples**:
- `examples/hooks/` directory: Multiple hook examples
- `examples/settings/` directory: Configuration examples
- `plugins/plugin-dev/skills/hook-development/SKILL.md`: Hook development skill

[S1: github.com/anthropics/claude-code]

---

## 10. Additional Resources

### Official Documentation

- **Hooks Reference**: https://code.claude.com/docs/en/hooks
- **Hooks Guide**: https://code.claude.com/docs/en/hooks-guide
- **Plugins**: https://code.claude.com/docs/en/plugins
- **Skills**: https://code.claude.com/docs/en/skills
- **Sub-agents**: https://code.claude.com/docs/en/sub-agents
- **Agent Teams**: https://code.claude.com/docs/en/agent-teams

### GitHub Repository

- **Main Repo**: https://github.com/anthropics/claude-code
- **Hook Examples**: https://github.com/anthropics/claude-code/tree/main/examples/hooks
- **Changelog**: https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md

### Community Resources

- **Everything Claude Code**: https://github.com/affaan-m/everything-claude-code (battle-tested configs)
- **Hook Mastery**: https://github.com/disler/claude-code-hooks-mastery
- **Awesome Claude Code**: https://github.com/hesreallyhim/awesome-claude-code

---

## Sources

1. [Hooks Reference - Claude Code Docs](https://code.claude.com/docs/en/hooks) [S1-HIGH]
2. [Automate workflows with hooks - Guide](https://code.claude.com/docs/en/hooks-guide) [S1-HIGH]
3. [Claude Code GitHub Repository](https://github.com/anthropics/claude-code) [S3-HIGH]
4. [Claude Code Changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) [S3-HIGH]
5. [Hooks examples directory](https://github.com/anthropics/claude-code/tree/main/examples/hooks) [S3-HIGH]
