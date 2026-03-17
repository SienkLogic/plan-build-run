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
