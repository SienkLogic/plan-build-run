---
phase: "21-autonomous-hook-compatibility"
plan: "21-03"
wave: 2
speculative: true
depends_on: ["21-01", "21-02"]
files_modified:
  - "plugins/pbr/skills/autonomous/SKILL.md"
  - "hooks/log-notification.js"
  - "hooks/lib/config.js"
must_haves:
  truths:
    - "Autonomous skill reads gates.checkpoint_auto_resolve from config and passes it to build skill invocations"
    - "Notification volume in autonomous mode is throttled — routine hook progress notifications are suppressed"
  artifacts:
    - "autonomous/SKILL.md Step 3c references checkpoint_auto_resolve config value when invoking build"
    - "log-notification.js suppresses duplicate notifications within a configurable debounce window in autonomous mode"
    - "config.js schema includes autonomous.notification_throttle_ms field (default: 5000)"
  key_links:
    - "autonomous SKILL.md reads gates.checkpoint_auto_resolve and injects it via --checkpoint-resolve flag to build skill"
    - "log-notification.js checks mode=autonomous and debounces identical notification types"
implements: []
provides:
  - "checkpoint_auto_resolve: autonomous loop respects configured resolve policy"
  - "notification throttling: autonomous mode suppresses duplicate hook notifications"
consumes:
  - "speculative planner flag: --speculative suppresses .active-skill and STATE.md side effects"
---

<task id="21-03-T1" type="auto" tdd="false" complexity="medium">
<name>Wire checkpoint_auto_resolve config into autonomous SKILL.md build invocations</name>
<read_first>
plugins/pbr/skills/autonomous/SKILL.md
plugins/pbr/skills/build/SKILL.md
hooks/lib/config.js
</read_first>
<files>
plugins/pbr/skills/autonomous/SKILL.md
</files>
<action>
1. Read `plugins/pbr/skills/autonomous/SKILL.md`. Note that config.json already has `gates.checkpoint_auto_resolve` with value `"verify-only"` (from the project's config.json). The autonomous skill currently never reads this config key, so build skill invocations in Step 3c always use build's own default.

2. In Step 1 (Config Gate and Parse Arguments), after the existing config reads, add:
   ```
   4. Read `gates.checkpoint_auto_resolve` from config.json. Valid values: `none`, `verify-only`, `verify-and-decision`, `all`. Store as `checkpointAutoResolve`.
      - If not set in config, default to `verify-and-decision` (appropriate for autonomous mode).
      - If `--auto` is implied by autonomous mode, `none` is NOT appropriate — override `none` to `verify-and-decision`.
   ```

3. In Step 3c (Build Phase), update the Skill() invocation:
   ```
   - Invoke: `Skill({ skill: "pbr:build", args: "{N} --auto --checkpoint-resolve {checkpointAutoResolve}" })`
   ```
   Note: The build skill already reads `checkpoint_auto_resolve` from config internally, but the autonomous skill should pass the resolved value explicitly via `--checkpoint-resolve` so the build skill does not need to re-read config and both are in sync.

4. Also add a note in the Step 3c block:
   ```
   Note: `checkpoint_auto_resolve` is read once at Step 1 and applied to every build invocation.
   Changing it mid-run has no effect until the next autonomous run.
   ```

5. Verify the build skill accepts `--checkpoint-resolve` flag. In `plugins/pbr/skills/build/SKILL.md`, search for the argument parsing section and confirm `--checkpoint-resolve` is handled or add a note that the autonomous skill passes it as an additional arg for the build skill to parse.
</action>
<acceptance_criteria>
grep -q "checkpoint_auto_resolve\|checkpointAutoResolve" plugins/pbr/skills/autonomous/SKILL.md
grep -q "checkpoint-resolve" plugins/pbr/skills/autonomous/SKILL.md
</acceptance_criteria>
<verify>
grep -n "checkpoint_auto_resolve\|checkpoint-resolve\|checkpointAutoResolve" plugins/pbr/skills/autonomous/SKILL.md | head -15
</verify>
<done>
`plugins/pbr/skills/autonomous/SKILL.md` Step 1 reads `gates.checkpoint_auto_resolve` from config and stores it as `checkpointAutoResolve`. Step 3c build invocation passes `--checkpoint-resolve {checkpointAutoResolve}`. A note explains the value is read once at startup.
</done>
</task>

<task id="21-03-T2" type="auto" tdd="false" complexity="medium">
<name>Add notification throttling for autonomous mode in log-notification.js and config schema</name>
<read_first>
hooks/log-notification.js
hooks/lib/config.js
</read_first>
<files>
hooks/log-notification.js
hooks/lib/config.js
</files>
<action>
1. Read `hooks/log-notification.js` and `hooks/lib/config.js`.

2. In `hooks/lib/config.js`, add `notification_throttle_ms` to the autonomous/workflow defaults section. Find where `autonomous: false` is defined (around line 181) and add to the same defaults object or wherever `workflow` defaults live:
   ```js
   // In the defaultConfig or schema section:
   notification_throttle_ms: 5000,  // ms — suppress duplicate notification types within this window (autonomous mode only)
   ```
   Also add a guide entry in the `_guide_hooks` or `_guide_workflow` group (whichever is documented in config.js schema):
   ```
   'hooks.notification_throttle_ms: 0-60000 — suppress duplicate notification types within this window in autonomous mode (0 = disabled)'
   ```

3. In `hooks/log-notification.js`, add debouncing for autonomous mode. After the existing `const planningDir = ...` line, add:

   ```js
   // Throttle duplicate notifications in autonomous mode
   const stateFile = path.join(planningDir, 'STATE.md');
   let isAutonomous = false;
   try {
     const stateContent = fs.existsSync(stateFile) ? fs.readFileSync(stateFile, 'utf8') : '';
     isAutonomous = /mode:\s*autonomous/i.test(stateContent);
   } catch (_e) { /* ignore */ }

   const throttleMs = 5000; // default; TODO: read from config when config is cheap to load
   const dedupeFile = path.join(planningDir, '.notification-dedupe.json');

   if (isAutonomous && throttleMs > 0) {
     let dedupe = {};
     try { dedupe = JSON.parse(fs.readFileSync(dedupeFile, 'utf8')); } catch (_e) { dedupe = {}; }
     const key = notificationType;
     const now = Date.now();
     if (dedupe[key] && now - dedupe[key] < throttleMs) {
       process.exit(0); // suppress duplicate notification
     }
     dedupe[key] = now;
     // Prune entries older than throttleMs * 10 to prevent unbounded growth
     for (const k of Object.keys(dedupe)) {
       if (now - dedupe[k] > throttleMs * 10) delete dedupe[k];
     }
     try { fs.writeFileSync(dedupeFile, JSON.stringify(dedupe), 'utf8'); } catch (_e) { /* ignore */ }
   }
   ```

   Place this block AFTER `notificationType` and `message` are extracted from `data`, and BEFORE `logHook` and `logEvent` calls.

4. Add `dedupeFile` cleanup in `session-cleanup.js` if it already handles `.planning/` cleanup — search for `.autonomous-state.json` removal and add `.notification-dedupe.json` alongside it.

5. Add `.notification-dedupe.json` to the signal files reference doc `plugins/pbr/references/signal-files.md`:
   | `.planning/.notification-dedupe.json` | log-notification.js | session-cleanup.js | Notification deduplication state for autonomous mode. |

6. Verify no tests reference `log-notification.js` in ways that would break with the new code path. The new code only activates when `isAutonomous` is true AND throttleMs > 0 — in tests, STATE.md likely won't have `mode: autonomous`, so tests are unaffected.
</action>
<acceptance_criteria>
grep -q "throttleMs\|notification-dedupe\|isAutonomous" hooks/log-notification.js
grep -q "notification_throttle_ms" hooks/lib/config.js
grep -q "notification-dedupe" plugins/pbr/references/signal-files.md
</acceptance_criteria>
<verify>
grep -n "throttle\|dedupe\|isAutonomous" hooks/log-notification.js
grep -n "notification_throttle" hooks/lib/config.js
</verify>
<done>
`hooks/log-notification.js` has autonomous-mode throttling that suppresses duplicate notification types within 5000ms by writing to `.notification-dedupe.json`. `hooks/lib/config.js` documents `notification_throttle_ms`. `plugins/pbr/references/signal-files.md` lists the dedupe file. The throttle is a no-op in non-autonomous mode.
</done>
</task>

## Summary

**Plan ID:** 21-03 | **Wave:** 2 | **Speculative:** true

**Tasks:**
1. `21-03-T1` — Wire `gates.checkpoint_auto_resolve` config read into autonomous SKILL.md Step 1 + inject it into every build invocation
2. `21-03-T2` — Add notification debouncing to `log-notification.js` for autonomous mode; document in config schema and signal-files reference

**Key files:**
- `plugins/pbr/skills/autonomous/SKILL.md` — reads `checkpoint_auto_resolve` at startup, passes `--checkpoint-resolve` to each build Skill() call
- `hooks/log-notification.js` — autonomous-mode dedupe: suppress duplicate notification types within 5s window
- `hooks/lib/config.js` — `notification_throttle_ms` default (5000ms)

**Must-haves:**
- Autonomous loop respects `checkpoint_auto_resolve` config rather than relying on build's own default
- Notification volume reduced in autonomous mode via type-based deduplication

**Provides:** `checkpoint_auto_resolve wiring` + `notification throttling`
**Consumes:** `speculative planner flag` from PLAN-01 (Wave 1 must complete first)
