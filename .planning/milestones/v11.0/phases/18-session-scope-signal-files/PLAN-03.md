---
phase: "session-scope-signal-files"
plan: "18-03"
wave: 2
depends_on: ["18-01", "18-02"]
files_modified:
  - "plugins/pbr/scripts/session-cleanup.js"
  - "plugins/pbr/scripts/log-subagent.js"
implements: []
must_haves:
  truths:
    - "Session cleanup removes .context-tracker on SessionEnd"
    - "Session cleanup removes session-scoped .active-agent on SessionEnd"
    - "log-subagent.js passes session_id to logHook and logEvent calls"
  artifacts:
    - "session-cleanup.js cleans .context-tracker signal file"
  key_links:
    - "log-subagent.js logHook/logEvent calls include sessionId parameter"
    - "session-cleanup.js handles session-scoped .active-agent cleanup"
provides:
  - "Complete session cleanup for all signal files"
  - "Session-tagged agent lifecycle logging"
consumes:
  - "Session-scoped .active-agent (from 18-01)"
  - "Session-tagged logHook/logEvent (from 18-02)"
---

<task id="18-03-T1" type="auto" tdd="false" complexity="simple">
<name>Add .context-tracker and session-scoped .active-agent cleanup to session-cleanup.js</name>
<read_first>
  - plugins/pbr/scripts/session-cleanup.js (lines 330-400 for main cleanup logic)
</read_first>
<files>
  - plugins/pbr/scripts/session-cleanup.js
</files>
<action>
1. In `main()`, after the existing `.active-plan` cleanup (line 393), add cleanup for `.context-tracker`:
   ```js
   if (tryRemove(path.join(planningDir, '.context-tracker'))) {
     cleaned.push('.context-tracker');
   }
   ```

2. Also add cleanup for global `.active-agent` (legacy fallback, in case it was written without session scoping):
   ```js
   if (tryRemove(path.join(planningDir, '.active-agent'))) {
     cleaned.push('.active-agent');
   }
   ```

3. The session-scoped `.active-agent` is already handled: `removeSessionDir(planningDir, sessionId)` at line 366 deletes the entire `.sessions/{id}/` directory, which includes `.active-agent` if it was session-scoped. No additional code needed for session-scoped cleanup.

4. In `handleHttp()`, add the same two cleanup items after the existing `.active-plan` cleanup (line 532):
   ```js
   if (tryRemove(path.join(planningDir, '.context-tracker'))) cleaned.push('.context-tracker');
   if (tryRemove(path.join(planningDir, '.active-agent'))) cleaned.push('.active-agent');
   ```

5. Verify that `.session.json` is already cleaned at line 381 (it is).
</action>
<acceptance_criteria>
grep -q "context-tracker" plugins/pbr/scripts/session-cleanup.js
grep -q "active-agent" plugins/pbr/scripts/session-cleanup.js
</acceptance_criteria>
<verify>
node -e "const m = require('./plugins/pbr/scripts/session-cleanup.js'); console.log(typeof m.tryRemove, typeof m.handleHttp)"
</verify>
<done>session-cleanup.js removes .context-tracker and global .active-agent on SessionEnd; session-scoped .active-agent is handled by removeSessionDir; module loads without error</done>
</task>

<task id="18-03-T2" type="auto" tdd="false" complexity="simple">
<name>Wire session_id into log-subagent.js logHook and logEvent calls</name>
<read_first>
  - plugins/pbr/scripts/log-subagent.js
  - plugins/pbr/scripts/hook-logger.js (line 95 for logHook signature)
  - plugins/pbr/scripts/event-logger.js (line 62 for logEvent signature)
</read_first>
<files>
  - plugins/pbr/scripts/log-subagent.js
</files>
<action>
1. In `main()`, `sessionId` is already extracted at line 49. Pass it to all `logHook` and `logEvent` calls:

   - Line 52: `logHook('log-subagent', 'SubagentStart', 'spawned', {...}, undefined, undefined, sessionId)`
   - Line 57: `logEvent('agent', 'spawn', {...}, sessionId)`
   - Line 80: `logHook('log-subagent', 'SubagentStop', 'completed', {...}, undefined, undefined, sessionId)`
   - Line 85: `logEvent('agent', 'complete', {...}, sessionId)`

2. In `handleHttp()`, extract session ID and pass to log calls:
   - `const httpSessionId = data.session_id || null;` (already exists for start at line 205)
   - Pass `httpSessionId` as last arg to all 4 logHook/logEvent calls in handleHttp

3. The `logHook` signature is: `logHook(hookName, eventType, decision, details, startTime, source, sessionId)`. Since `startTime` and `source` are not used in these calls, pass `undefined` for both.
</action>
<acceptance_criteria>
grep -c "sessionId" plugins/pbr/scripts/log-subagent.js | grep -q "[3-9]"
</acceptance_criteria>
<verify>
node -e "const m = require('./plugins/pbr/scripts/log-subagent.js'); console.log('OK')"
</verify>
<done>All logHook and logEvent calls in log-subagent.js pass sessionId; JSONL entries from agent lifecycle events will include sid field for multi-session debugging</done>
</task>

## Summary

**Plan 18-03** (Wave 2): Session cleanup completeness and logging integration.

1. **T1**: Add `.context-tracker` and global `.active-agent` cleanup to `session-cleanup.js` (both `main()` and `handleHttp()`). Session-scoped `.active-agent` is already handled by `removeSessionDir()`.
2. **T2**: Wire `sessionId` into all `logHook()` and `logEvent()` calls in `log-subagent.js` so agent lifecycle events are tagged with session ID.

**Key files**: `session-cleanup.js`, `log-subagent.js`
**Must-haves**: Complete signal file cleanup on SessionEnd; session-tagged agent logs
**Provides**: Complete session cleanup, session-tagged agent lifecycle logging
**Consumes**: Session-scoped `.active-agent` (PLAN-01), session-tagged logHook/logEvent (PLAN-02)
