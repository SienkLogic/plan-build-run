---
phase: "session-scope-signal-files"
plan: "18-01"
wave: 1
depends_on: []
files_modified:
  - "plugins/pbr/scripts/log-subagent.js"
  - "plugins/pbr/scripts/check-skill-workflow.js"
  - "plugins/pbr/scripts/check-agent-state-write.js"
  - "plugins/pbr/scripts/status-line.js"
implements: []
must_haves:
  truths:
    - "Two concurrent sessions running subagents do not corrupt each other's .active-agent signals"
  artifacts:
    - "log-subagent.js exports session-aware writeActiveAgent and removeActiveAgent"
  key_links:
    - "check-skill-workflow.js reads session-scoped .active-agent first, falls back to global"
    - "check-agent-state-write.js reads session-scoped .active-agent first, falls back to global"
    - "status-line.js reads session-scoped .active-agent first, falls back to global"
provides:
  - "Session-scoped .active-agent signal file"
consumes: []
---

<task id="18-01-T1" type="auto" tdd="false" complexity="medium">
<name>Session-scope .active-agent writes in log-subagent.js</name>
<read_first>
  - plugins/pbr/scripts/log-subagent.js
  - plugins/pbr/scripts/lib/core.js (lines 460-510 for resolveSessionPath, ensureSessionDir)
  - plugins/pbr/scripts/lib/core.js (lines 617-690 for writeActiveSkill pattern)
</read_first>
<files>
  - plugins/pbr/scripts/log-subagent.js
</files>
<action>
1. In `writeActiveAgent(agentType)`, add `sessionId` parameter. Mirror the `writeActiveSkill` pattern from `core.js`:
   - Import `ensureSessionDir` from `./lib/core` (already imports `resolveSessionPath`)
   - If `sessionId` is provided: call `ensureSessionDir(planningDir, sessionId)`, then resolve path via `resolveSessionPath(planningDir, '.active-agent', sessionId)`
   - If no `sessionId`: use global path `path.join(planningDir, '.active-agent')` (backward compat)
   - Use `fs.writeFileSync(filePath, agentType, 'utf8')` (same as current)
   - Derive `planningDir` from `path.join(process.cwd(), '.planning')` inside the function

2. In `removeActiveAgent()`, add `sessionId` parameter:
   - If `sessionId`: resolve via `resolveSessionPath(planningDir, '.active-agent', sessionId)` and delete
   - If no `sessionId`: delete global path (backward compat)

3. In `main()`, pass `sessionId` (already extracted at line 49) to both `writeActiveAgent` and `removeActiveAgent`:
   - Line 64: `writeActiveAgent(agentType || 'unknown', sessionId)`
   - Line 79: `removeActiveAgent(sessionId)`

4. In `handleHttp(reqBody)`, session-scope the writes:
   - Extract `const httpSessionId = data.session_id || null;` (already exists at line 205 for start)
   - For SubagentStart (line 194-203): use `resolveSessionPath` when `httpSessionId` is available
   - For SubagentStop (line 218-226): use `resolveSessionPath` when session ID is available
   - Keep global fallback when `planningDir` is missing

5. Update `require` at top: add `ensureSessionDir` to the destructured import from `./lib/core`
</action>
<acceptance_criteria>
grep -q "resolveSessionPath.*\.active-agent" plugins/pbr/scripts/log-subagent.js
grep -q "ensureSessionDir" plugins/pbr/scripts/log-subagent.js
grep -q "sessionId" plugins/pbr/scripts/log-subagent.js
</acceptance_criteria>
<verify>
node -e "const m = require('./plugins/pbr/scripts/log-subagent.js'); console.log(typeof m.buildAgentContext, typeof m.resolveAgentType, typeof m.handleHttp)"
</verify>
<done>writeActiveAgent and removeActiveAgent use resolveSessionPath when sessionId is provided; handleHttp does the same; module loads without error</done>
</task>

<task id="18-01-T2" type="auto" tdd="false" complexity="medium">
<name>Update .active-agent readers to try session-scoped path first</name>
<read_first>
  - plugins/pbr/scripts/check-skill-workflow.js (lines 150-172 for checkArtifactRules)
  - plugins/pbr/scripts/check-agent-state-write.js (lines 33-50)
  - plugins/pbr/scripts/status-line.js (lines 590-605)
</read_first>
<files>
  - plugins/pbr/scripts/check-skill-workflow.js
  - plugins/pbr/scripts/check-agent-state-write.js
  - plugins/pbr/scripts/status-line.js
</files>
<action>
1. **check-skill-workflow.js** — `checkArtifactRules()` (line 164):
   - The function receives `planningDir`. Add `sessionId` parameter (callers pass `data.session_id`).
   - Replace `const activeAgentFile = path.join(planningDir, '.active-agent');` with a session-first check:
     ```
     let agentExists = false;
     if (sessionId) {
       const sessionPath = resolveSessionPath(planningDir, '.active-agent', sessionId);
       agentExists = fs.existsSync(sessionPath);
     }
     if (!agentExists) {
       agentExists = fs.existsSync(path.join(planningDir, '.active-agent'));
     }
     if (agentExists) return null;
     ```
   - Import `resolveSessionPath` from `./lib/core` if not already imported.
   - Update the caller of `checkArtifactRules` to pass `sessionId` (check the `main` or `checkAgentStateWrite` function that calls it).

2. **check-agent-state-write.js** — `checkAgentStateWrite()` (line 42):
   - Add session-scoped read: try `resolveSessionPath(planningDir, '.active-agent', sessionId)` first
   - Session ID source: `data.session_id` from the hook input (already in `data` parameter)
   - Fall back to global `path.join(cwd, '.planning', '.active-agent')`
   - Import `resolveSessionPath` from `./lib/core`

3. **status-line.js** — agent section (line 594):
   - Try session-scoped path first if `sessionId` is available in the rendering context
   - Fall back to global `path.join(planningDir, '.active-agent')`
   - Import `resolveSessionPath` from `./lib/core` if not already imported
   - Session ID source: check if `data.session_id` is available in the status-line rendering context; if not, just add the global fallback pattern (session-scoped read when possible)
</action>
<acceptance_criteria>
grep -q "resolveSessionPath.*\.active-agent" plugins/pbr/scripts/check-agent-state-write.js
grep -q "resolveSessionPath.*\.active-agent" plugins/pbr/scripts/check-skill-workflow.js
grep -c "active-agent" plugins/pbr/scripts/status-line.js | grep -q "[2-9]"
</acceptance_criteria>
<verify>
node -e "require('./plugins/pbr/scripts/check-agent-state-write.js')" && echo "check-agent-state-write loads OK"
node -e "require('./plugins/pbr/scripts/check-skill-workflow.js')" && echo "check-skill-workflow loads OK"
node -e "require('./plugins/pbr/scripts/status-line.js')" && echo "status-line loads OK"
</verify>
<done>All three readers try session-scoped .active-agent path first via resolveSessionPath, fall back to global; all modules load without error</done>
</task>

## Summary

**Plan 18-01** (Wave 1): Session-scope the `.active-agent` signal file — the highest-risk concurrency gap.

1. **T1**: Modify `log-subagent.js` writer functions (`writeActiveAgent`, `removeActiveAgent`, `handleHttp`) to use `resolveSessionPath` when `sessionId` is available, mirroring the existing `writeActiveSkill` pattern.
2. **T2**: Update all three `.active-agent` readers (`check-skill-workflow.js`, `check-agent-state-write.js`, `status-line.js`) to try the session-scoped path first, falling back to global.

**Key files**: `log-subagent.js`, `check-skill-workflow.js`, `check-agent-state-write.js`, `status-line.js`
**Must-haves**: Session-scoped `.active-agent` writes and reads; no cross-session signal corruption
**Provides**: Session-scoped `.active-agent` signal file pattern
**Consumes**: `resolveSessionPath`, `ensureSessionDir` from `lib/core.js`
