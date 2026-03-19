---
phase: "session-scope-signal-files"
plan: "18-02"
wave: 1
depends_on: []
files_modified:
  - "plugins/pbr/scripts/lib/config.js"
  - "plugins/pbr/scripts/lib/state.js"
  - "plugins/pbr/scripts/hook-logger.js"
  - "plugins/pbr/scripts/event-logger.js"
implements: []
must_haves:
  truths:
    - "configWrite() uses lockedFileUpdate() wrapping atomicWrite() for crash-safe concurrent writes"
    - "stateAdvancePlan() performs both plan count and progress updates in a single lockedFileUpdate() call"
    - "Log entries include session_id for multi-session debugging"
  artifacts:
    - "configWrite() in config.js wraps write in lockedFileUpdate with atomicWrite inside"
    - "stateAdvancePlan() in state.js uses single lockedFileUpdate call"
  key_links:
    - "logHook() accepts and includes session_id in JSONL entries"
    - "logEvent() accepts and includes session_id in JSONL entries"
provides:
  - "Locked config writes"
  - "Atomic stateAdvancePlan"
  - "Session-tagged log entries"
consumes: []
---

<task id="18-02-T1" type="auto" tdd="false" complexity="medium">
<name>Wrap configWrite() with lockedFileUpdate + atomicWrite</name>
<read_first>
  - plugins/pbr/scripts/lib/config.js (lines 865-877 for configWrite)
  - plugins/pbr/scripts/lib/core.js (lines 371-458 for lockedFileUpdate)
  - plugins/pbr/scripts/lib/core.js (lines 309-360 for atomicWrite)
</read_first>
<files>
  - plugins/pbr/scripts/lib/config.js
</files>
<action>
1. Import `lockedFileUpdate` from `./core` at the top of config.js. Check existing imports — if `core.js` functions are already imported, add to that require. If not, add: `const { lockedFileUpdate } = require('./core');`

2. Replace the `configWrite()` function body (lines 872-877):
   **Before:**
   ```js
   function configWrite(planningDir, config) {
     const configPath = path.join(planningDir, 'config.json');
     fs.writeFileSync(configPath, configFormat(config), 'utf8');
     configClearCache();
   }
   ```
   **After:**
   ```js
   function configWrite(planningDir, config) {
     const configPath = path.join(planningDir, 'config.json');
     const formatted = configFormat(config);
     const result = lockedFileUpdate(configPath, () => formatted);
     if (!result.success) {
       // Fallback: write without lock (availability over consistency)
       fs.writeFileSync(configPath, formatted, 'utf8');
     }
     configClearCache();
   }
   ```
   Note: `lockedFileUpdate` already uses `atomicWrite()` internally (line 438 of core.js), so wrapping with `lockedFileUpdate` gives both lock AND atomic write. The `updateFn` ignores the current content because `configFormat(config)` produces the full file — this is a full-replace, not a merge (per locked decision: no read-modify-write merging, that's deferred).

3. Verify import works: `lockedFileUpdate` is exported from `core.js` module.exports.
</action>
<acceptance_criteria>
grep -q "lockedFileUpdate" plugins/pbr/scripts/lib/config.js
grep -q "configWrite" plugins/pbr/scripts/lib/config.js
</acceptance_criteria>
<verify>
node -e "const c = require('./plugins/pbr/scripts/lib/config.js'); console.log(typeof c.configWrite, typeof c.configLoad)"
</verify>
<done>configWrite() uses lockedFileUpdate() which internally calls atomicWrite(); fallback to direct write on lock failure; module loads without error</done>
</task>

<task id="18-02-T2" type="auto" tdd="false" complexity="medium">
<name>Make stateAdvancePlan() atomic with single lockedFileUpdate call</name>
<read_first>
  - plugins/pbr/scripts/lib/state.js (lines 340-370 for stateUpdate)
  - plugins/pbr/scripts/lib/state.js (lines 428-441 for stateAdvancePlan)
  - plugins/pbr/scripts/lib/core.js (lines 371-458 for lockedFileUpdate)
</read_first>
<files>
  - plugins/pbr/scripts/lib/state.js
</files>
<action>
1. Import `lockedFileUpdate` from `./core` at the top of state.js. Check existing imports — add to existing require if present.

2. Replace `stateAdvancePlan()` (lines 428-441) to use a single `lockedFileUpdate()` call that reads STATE.md once, computes both new values, and writes once:

```js
function stateAdvancePlan(planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const statePath = path.join(dir, 'STATE.md');
  if (!fs.existsSync(statePath)) return { success: false, error: "STATE.md not found" };

  let resultData = {};
  const result = lockedFileUpdate(statePath, (content) => {
    const planMatch = content.match(/Plan:\s*(\d+)\s+of\s+(\d+)/);
    if (!planMatch) {
      resultData = { error: "Could not find Plan: N of M in STATE.md" };
      return content; // Return unchanged
    }
    const current = parseInt(planMatch[1], 10);
    const total = parseInt(planMatch[2], 10);
    const next = Math.min(current + 1, total);
    const progressPct = total > 0 ? Math.round((next / total) * 100) : 0;

    resultData = { previous_plan: current, current_plan: next, total_plans: total, progress_percent: progressPct };

    // Update plans_complete field
    let updated = content.replace(
      /^(\s*plans_complete:\s*)(\d+)/m,
      `$1${next}`
    );
    // Update progress_percent field
    updated = updated.replace(
      /^(\s*progress_percent:\s*)(\d+)/m,
      `$1${progressPct}`
    );
    // Update the "Plan: N of M" display line
    updated = updated.replace(
      /Plan:\s*\d+\s+of\s+\d+/,
      `Plan: ${next} of ${total}`
    );
    return updated;
  });

  if (!result.success) {
    return { success: false, error: result.error || resultData.error || "Lock failed" };
  }
  if (resultData.error) {
    return { success: false, error: resultData.error };
  }
  return { success: true, ...resultData };
}
```

3. This replaces the two sequential `stateUpdate()` calls with a single locked read-modify-write. The `stateUpdate()` function itself remains unchanged (per locked decision).
</action>
<acceptance_criteria>
grep -q "lockedFileUpdate" plugins/pbr/scripts/lib/state.js
grep -c "stateUpdate" plugins/pbr/scripts/lib/state.js | grep -q "[0-9]"
</acceptance_criteria>
<verify>
node -e "const s = require('./plugins/pbr/scripts/lib/state.js'); console.log(typeof s.stateAdvancePlan, typeof s.stateUpdate)"
</verify>
<done>stateAdvancePlan() uses a single lockedFileUpdate() call to atomically update both plans_complete and progress_percent; stateUpdate() is unchanged; module loads without error</done>
</task>

<task id="18-02-T3" type="auto" tdd="false" complexity="simple">
<name>Add session_id to logHook() and logEvent() entries</name>
<read_first>
  - plugins/pbr/scripts/hook-logger.js
  - plugins/pbr/scripts/event-logger.js
</read_first>
<files>
  - plugins/pbr/scripts/hook-logger.js
  - plugins/pbr/scripts/event-logger.js
</files>
<action>
1. **hook-logger.js** — Modify `logHook()` signature (line 95):
   - Add `sessionId` parameter after `source`: `function logHook(hookName, eventType, decision, details = {}, startTime, source, sessionId)`
   - After building the `entry` object (line 99-105), add: `if (sessionId) entry.sid = sessionId;`
   - Use short key `sid` to keep JSONL lines compact

2. **event-logger.js** — Modify `logEvent()` signature (line 62):
   - Add `sessionId` parameter: `function logEvent(category, event, details = {}, sessionId)`
   - After building the `entry` object (line 66-71), add: `if (sessionId) entry.sid = sessionId;`

3. Both changes are backward-compatible — existing callers that don't pass `sessionId` will simply not include it in log entries. Callers will be updated incrementally as session_id becomes available in their context.
</action>
<acceptance_criteria>
grep -q "sessionId" plugins/pbr/scripts/hook-logger.js
grep -q "sid" plugins/pbr/scripts/hook-logger.js
grep -q "sessionId" plugins/pbr/scripts/event-logger.js
grep -q "sid" plugins/pbr/scripts/event-logger.js
</acceptance_criteria>
<verify>
node -e "const h = require('./plugins/pbr/scripts/hook-logger.js'); console.log(typeof h.logHook)" && node -e "const e = require('./plugins/pbr/scripts/event-logger.js'); console.log(typeof e.logEvent)"
</verify>
<done>logHook() and logEvent() accept optional sessionId parameter and include sid field in JSONL entries when provided; backward-compatible with existing callers</done>
</task>

## Summary

**Plan 18-02** (Wave 1): Fix config write safety, stateAdvancePlan atomicity, and log session tagging.

1. **T1**: Wrap `configWrite()` in `lockedFileUpdate()` (which uses `atomicWrite()` internally) per locked decision. Fallback to direct write on lock failure.
2. **T2**: Replace `stateAdvancePlan()` two-call pattern with single `lockedFileUpdate()` that reads STATE.md once, computes both fields, writes once.
3. **T3**: Add optional `sessionId` parameter to `logHook()` and `logEvent()`, writing `sid` field to JSONL entries when provided.

**Key files**: `lib/config.js`, `lib/state.js`, `hook-logger.js`, `event-logger.js`
**Must-haves**: Locked config writes, atomic plan advancement, session-tagged logs
**Provides**: Locked config writes, atomic stateAdvancePlan, session-tagged log entries
**Consumes**: `lockedFileUpdate` and `atomicWrite` from `lib/core.js`
