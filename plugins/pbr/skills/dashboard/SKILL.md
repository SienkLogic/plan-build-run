---
name: dashboard
description: "Launch the PBR web dashboard for the current project."
allowed-tools: Bash, Read
argument-hint: "[--port N]"
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Begin executing immediately.**

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► DASHBOARD                                  ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

## Behavior

1. **Parse arguments**: Extract `--port N` from the user's input. Default to `3141`.

2. **Locate dashboard**: The dashboard lives at the **repository root** `dashboard/` directory (NOT under `${CLAUDE_PLUGIN_ROOT}`). Resolve the repo root from `<cwd>` — for PBR's own repo this is the project root; for installed plugins, use `git rev-parse --show-toplevel` or walk up from `${CLAUDE_PLUGIN_ROOT}` to find `dashboard/`.

3. **Check dependencies**: Check if `<repo-root>/dashboard/server/node_modules/` exists. If not, run:

   ```bash
   npm run dashboard:install --prefix <repo-root>
   ```

4. **Launch dashboard**: Run in background via Bash:

   ```bash
   node <repo-root>/dashboard/bin/cli.cjs --dir <cwd> --port <port> &
   ```

   Use `&` to background the process so it doesn't block the session.

5. **Verify startup**: After launching, check the process is responding:

   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>/
   ```

6. **Output to user**:

   ```text
   Dashboard running at http://localhost:<port>
   Open this URL in your browser to view your project's planning state.
   ```

## Notes

- If the port is already in use, the dashboard will fail to start — suggest the user try a different port with `--port`.
- The dashboard watches `.planning/` for live updates via WebSockets.
