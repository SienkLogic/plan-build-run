# Agent Type Resolution

PBR agents register under two naming formats depending on how the plugin loads:

- **Plugin format**: `pbr:{name}` (e.g., `pbr:executor`) — when Claude Code loads agents from the plugin's `agents/` directory
- **Standalone format**: `pbr-{name}` (e.g., `pbr-executor`) — when agents load from a root `agents/` directory

**Resolution rule**: Always use `pbr:{name}` first. If the Task() spawn fails with "Agent type not found", retry the same Task() call with `pbr-{name}`. Do not change anything else in the prompt — only the `subagent_type` value.

Example:

```
# First attempt (plugin format)
Task({ subagent_type: "pbr:executor", prompt: ... })

# If "Agent type not found" error, retry with:
Task({ subagent_type: "pbr-executor", prompt: ... })
```

This applies to ALL `pbr:*` agent spawns: executor, verifier, planner, researcher, synthesizer, debugger, codebase-mapper, plan-checker, integration-checker, intel-updater, audit, general, ui-checker, ui-researcher.

---

## Individual Spawn Rule

When spawning multiple agents in parallel, each agent MUST be a separate Task() tool call in a single response message.

**Why:** Claude Code assigns colored name badges and independent ctrl+o expansion to each individual Task() call. When multiple agents are described in prose ("launched 5 executors"), they appear as flat text without badges or expandable status.

**Rule:** Make N separate Task() tool calls — do NOT describe the batch in prose. Multiple Task() calls in one message still run concurrently. No parallelism is lost.

**Exception:** Bare `Task()` calls without `subagent_type` (e.g., context-loader briefings per `context-loader-task.md`) are exempt — they are lightweight read-only tasks that do not benefit from colored badges.
