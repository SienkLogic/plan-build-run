---
name: dashboard
description: "Launch the PBR web dashboard for the current project."
allowed-tools: Bash, Read
argument-hint: "[--port N]"
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Begin executing immediately.**

## Behavior

1. **Parse arguments**: Extract `--port N` from the user's input. Default to `3000`.

2. **Check dependencies**: Check if `${CLAUDE_PLUGIN_ROOT}/dashboard/node_modules/` exists. If not, run:
   ```
   npm install --prefix ${CLAUDE_PLUGIN_ROOT}/dashboard
   ```

3. **Launch dashboard**: Run in background via Bash:
   ```
   node ${CLAUDE_PLUGIN_ROOT}/dashboard/bin/cli.js --dir <cwd> --port <port> &
   ```
   Use `&` to background the process so it doesn't block the session.

4. **Output to user**:
   ```
   Dashboard running at http://localhost:<port>
   Open this URL in your browser to view your project's planning state.
   ```

## Notes

- If the port is already in use, the dashboard will fail to start — suggest the user try a different port with `--port`.
- The dashboard watches `.planning/` for live updates via SSE.
