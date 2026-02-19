---
name: dashboard
description: "Launch the PBR web dashboard for the current project."
argument-hint: "[--port N]"
---

## Behavior

1. **Parse arguments**: Extract `--port N` from the user's input. Default to `3000`.

2. **Check dependencies**: Check if the dashboard `node_modules/` exists in the plugin's dashboard directory. If not, run `npm install` in that directory.

3. **Launch dashboard**: Run in background:
   ```
   node <plugin-root>/dashboard/bin/cli.js --dir <cwd> --port <port> &
   ```

4. **Output to user**:
   ```
   Dashboard running at http://localhost:<port>
   Open this URL in your browser to view your project's planning state.
   ```
