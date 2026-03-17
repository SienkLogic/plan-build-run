---
name: intel
description: "Refresh or query codebase intelligence (file graph, APIs, dependencies, architecture)."
allowed-tools: Read, Write, Bash, Glob, Grep, Task, AskUserQuestion
argument-hint: "[query <term>|refresh|status|diff]"
---

**STOP -- DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes tokens. Begin executing Step 0 immediately.**

## Step 0 -- Banner

**Before ANY tool calls**, display this banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 PBR ► INTEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Then proceed to Step 1.

## Step 1 -- Config Gate

Check if intel is enabled by reading `.planning/config.json` directly (do NOT use Bash for this -- `config get` throws on missing keys):

1. Read `.planning/config.json`
2. Check if `intel.enabled` is explicitly `false`
3. If `false`, display:

```
Intel system is disabled. Enable with: /pbr:config set intel.enabled true
```

Then **STOP**. Do not proceed further.

If enabled, not present, or no config file exists (all default to enabled), proceed to Step 2.

---

## Step 2 -- Parse Argument

Parse the user's argument to determine the operation mode:

| Argument | Action |
|----------|--------|
| `query <term>` | Run inline query (Step 2a) |
| `status` | Run inline status check (Step 2b) |
| `diff` | Run inline diff check (Step 2c) |
| `refresh` or no argument | Spawn intel-updater agent (Step 3) |

### Step 2a -- Query

Run:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js intel query <term>
```

Format and display the results. Show matching entries grouped by intel file. If no results found, suggest running `refresh` first.

**STOP** after displaying results. Do not spawn an agent.

### Step 2b -- Status

Run:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js intel status
```

Format and display staleness info for each intel file. Show last update times and whether files exist.

**STOP** after displaying status. Do not spawn an agent.

### Step 2c -- Diff

Run:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js intel diff
```

Format and display changes since the last full refresh. Show which files have changed and summary of differences.

**STOP** after displaying diff. Do not spawn an agent.

---

## Step 3 -- Refresh (Agent Spawn)

**CRITICAL: Agent type rule** -- ALWAYS use `subagent_type: "pbr:intel-updater"`. NEVER use `general-purpose` or other non-PBR agent types. The PreToolUse hook will block non-PBR agents.

Resolve the pbr-tools path for the agent. Use the plugin root or known path:
```
pbr-tools path: ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js
```

Spawn a Task with:
- `subagent_type: "pbr:intel-updater"`
- Spawn prompt containing:
  - `pbr-tools path: ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js` (resolved path to CLI tool)
  - `focus: full` (default) or `focus: partial --files <paths>` if user specified particular files
  - Project root path (current working directory)
  - Any existing `.planning/intel/stack.json` content (if it exists) for context

Wait for agent completion.

---

## Step 4 -- Post-Refresh Summary

After the agent completes, run:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js intel status
```

Display a summary showing:
- Which intel files were written/updated
- Last update timestamps
- Brief overview of what was discovered

---

## Anti-Patterns

1. DO NOT spawn an agent for query/status/diff operations -- these are inline CLI calls
2. DO NOT read agent .md files -- auto-loaded via subagent_type
3. DO NOT modify intel files directly -- the agent handles writes
4. DO NOT skip the config gate check
5. DO NOT use general-purpose agents -- always use `pbr:intel-updater`
