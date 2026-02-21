---
name: statusline
description: "Install or configure the PBR status line in Claude Code."
argument-hint: "[install | uninstall | preview]"
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes ~3,000 tokens. Begin executing Step 0 immediately.**

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► STATUS LINE                                ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

# /pbr:statusline — Status Line Setup

The PBR status line displays live project state (phase, plan, status, git branch, context usage) in the Claude Code terminal status bar.

---

## Subcommand Parsing

Parse `$ARGUMENTS`:

| Argument | Action |
|----------|--------|
| `install` or empty | Install/enable the status line |
| `uninstall` or `remove` | Remove the status line configuration |
| `preview` | Show what the status line looks like without installing |

---

## Subcommand: install (default)

### Step 1: Locate the status-line script

**CRITICAL: You must resolve the correct absolute path to `status-line.js`. Do NOT hardcode paths.**

1. The script lives at `${PLUGIN_ROOT}/scripts/status-line.js`
2. Resolve `${PLUGIN_ROOT}` to its absolute path using `pwd` or by checking the plugin root
3. If running from a local plugin dir (`claude --plugin-dir .`), the path is the local repo's `plugins/pbr/scripts/status-line.js`
4. If running from the installed plugin cache (`~/.claude/plugins/cache/`), use that path
5. **Verify the script exists** with `ls` before proceeding. If it doesn't exist, show an error and stop.

Store the resolved absolute path as `SCRIPT_PATH`.

### Step 2: Read current settings

Read `~/.claude/settings.json` (or `$HOME/.claude/settings.json`).

- If the file doesn't exist: start with an empty object `{}`
- If it exists: parse the JSON content
- Check if `statusLine` key already exists:
  - If yes and points to the same script: inform user "PBR status line is already installed." and stop (unless they want to reconfigure)
  - If yes but points to a different command: warn user and ask if they want to replace it

### Step 3: Configure settings.json

Use AskUserQuestion:
  question: "Install the PBR status line? This adds a `statusLine` entry to ~/.claude/settings.json."
  header: "Install?"
  options:
    - label: "Install"  description: "Enable the PBR status line in Claude Code"
    - label: "Preview first"  description: "Show a preview before installing"
    - label: "Cancel"  description: "Don't install"
  multiSelect: false

If "Preview first": run the preview subcommand (show sample output), then ask again.
If "Cancel": stop.
If "Install":

**CRITICAL: Use Read tool to read the file, then Write to update it. Do NOT use sed or other text manipulation on JSON files.**

**CRITICAL: Back up settings.json NOW.** Write the original content to `~/.claude/settings.json.bak` before making any changes.

1. Read `~/.claude/settings.json`
2. Write the original content to `~/.claude/settings.json.bak`
3. Parse the JSON
4. Set `statusLine` to:
   ```json
   {
     "type": "command",
     "command": "node \"SCRIPT_PATH\""
   }
   ```
   Where `SCRIPT_PATH` is the resolved absolute path from Step 1. Use forward slashes even on Windows.
5. Write the updated JSON back (preserve all other settings, use 2-space indentation)

### Step 4: Verify and confirm

Display:
```
✓ PBR status line installed

  Script: {SCRIPT_PATH}
  Config: ~/.claude/settings.json

The status line will appear on your next Claude Code session.
Restart Claude Code or run `/clear` to activate it now.

Customize per-project via .planning/config.json:
  "status_line": {
    "sections": ["phase", "plan", "status", "git", "context"],
    "brand_text": "PBR"
  }
```

---

## Subcommand: uninstall

1. Read `~/.claude/settings.json`
2. If no `statusLine` key: inform user "No status line configured." and stop
3. **CRITICAL: Back up settings.json NOW.** Write the original content to `~/.claude/settings.json.bak` before making any changes.
4. Remove the `statusLine` key from the JSON
5. Write the updated file
5. Display: `✓ PBR status line removed. Restart Claude Code to take effect.`

---

## Subcommand: preview

1. Locate and run the status-line script: `node {SCRIPT_PATH}`
   - Pass sample stdin JSON: `{"context_window": {"used_percentage": 35}, "model": {"display_name": "Claude Opus 4.6"}, "cost": {"total_cost_usd": 0.42}}`
2. Display the raw output to the user
3. Also show a description of each section:
   - **Phase**: Current phase number and name from STATE.md
   - **Plan**: Plan progress (N of M)
   - **Status**: Phase status keyword (planning, building, built, etc.)
   - **Git**: Current branch + dirty indicator
   - **Context**: Unicode bar showing context window usage (green/yellow/red)

---

## Edge Cases

### No .planning/ directory
The status line works even without `.planning/` — it will show only git and context sections. Installation doesn't require a PBR project.

### Plugin installed from npm vs local
The script path differs between `~/.claude/plugins/cache/plan-build-run/pbr/{version}/scripts/status-line.js` and a local `plugins/pbr/scripts/status-line.js`. The install command must resolve the actual path at install time.

### Existing non-PBR status line
If `statusLine` already exists with a different command, warn the user and confirm before replacing.
