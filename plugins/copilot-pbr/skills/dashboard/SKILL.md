---
name: dashboard
description: "Launch the PBR web dashboard for the current project."
---

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► DASHBOARD                                  ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

## Behavior

1. **Parse arguments**: Extract `--port N` from the user's input. Default to `3000`.

2. **Locate dashboard**: The dashboard lives at `../../dashboard/` relative to this plugin's root directory (i.e. two levels up from `plugins/copilot-pbr/`). Resolve the absolute path.

3. **Check dependencies**: Check if `node_modules/` exists in the dashboard directory. If not, run:
   ```
   npm install --prefix <dashboard-dir>
   ```

4. **Launch dashboard**: Run in background:
   ```
   node <dashboard-dir>/bin/cli.js --dir <cwd> --port <port> &
   ```

5. **Output to user**:
   ```
   Dashboard running at http://localhost:<port>
   Open this URL in your browser to view your project's planning state.
   ```

## Notes

- If the port is already in use, the dashboard will fail to start — suggest the user try a different port with `--port`.
- The dashboard watches `.planning/` for live updates via SSE.
