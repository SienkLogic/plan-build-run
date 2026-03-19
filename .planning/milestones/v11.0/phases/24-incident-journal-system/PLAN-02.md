---
phase: "24-incident-journal-system"
plan: "24-02"
wave: 2
speculative: true
depends_on: ["24-01"]
files_modified:
  - "hooks/record-incident.js"
  - "hooks/pre-bash-dispatch.js"
  - "hooks/post-write-dispatch.js"
  - "hooks/log-tool-failure.js"
must_haves:
  truths:
    - "When pre-bash-dispatch.js blocks a command, an incident entry is auto-recorded with type: block"
    - "When post-write-dispatch.js emits a warning, an incident entry is auto-recorded with type: warn"
    - "When log-tool-failure.js fires, an incident entry is auto-recorded with type: error"
    - "All hook incident recording is fire-and-forget — hook exit code and output are unaffected"
    - "record-incident.js provides a single shared helper all hooks use to call incidents.cjs"
  artifacts:
    - "hooks/record-incident.js exports recordIncident(entry, opts) — shared hook helper"
  key_links:
    - "pre-bash-dispatch.js requires record-incident.js and calls recordIncident after block decisions"
    - "post-write-dispatch.js requires record-incident.js and calls recordIncident after warn decisions"
    - "log-tool-failure.js requires record-incident.js and calls recordIncident for every failure"
    - "record-incident.js resolves planningDir from the hook context (cwd or PBR_PROJECT_ROOT)"
implements: []
provides:
  - "record-incident.js shared hook helper"
  - "hook integration: blocks + warnings + tool failures auto-recorded"
consumes:
  - "incidents.cjs library (from 24-01)"
---

<task id="24-02-T1" type="auto" tdd="false" complexity="simple">
<name>Create record-incident.js shared hook helper</name>
<read_first>
plan-build-run/bin/lib/incidents.cjs
hooks/hook-logger.js
hooks/log-tool-failure.js
</read_first>
<files>
hooks/record-incident.js
</files>
<action>
Create `hooks/record-incident.js` — a thin CommonJS helper that hooks require to record incidents. It must never throw or affect hook output.

1. Create the file with this structure:
   ```js
   #!/usr/bin/env node
   /**
    * record-incident.js — Shared hook helper for incident journal recording.
    *
    * All hooks require this module and call recordIncident() after block/warn
    * decisions. Never throws — all errors are silently swallowed so hook
    * behavior is unaffected.
    *
    * Exit-code contract: This module has no effect on hook exit codes.
    */
   'use strict';

   const path = require('path');

   let incidents;
   try {
     // Resolve relative to plugin root — hooks run from the hooks/ directory
     incidents = require('../plan-build-run/bin/lib/incidents.cjs');
   } catch (_e) {
     incidents = null;
   }

   /**
    * Record an incident to the journal. Fire-and-forget.
    *
    * @param {Object} entry - Incident fields (see incidents.cjs entry format)
    * @param {Object} [opts] - { cwd, planningDir }
    */
   function recordIncident(entry, opts) {
     if (!incidents) return;
     try {
       incidents.record(entry, opts || {});
     } catch (_e) {
       // Silently swallow — never affect hook behavior
     }
   }

   module.exports = { recordIncident };
   ```

2. The relative path `'../plan-build-run/bin/lib/incidents.cjs'` resolves correctly when the hook is loaded from `hooks/` directory. The try/catch on require() ensures graceful fallback if the module is missing (e.g., before Plan-01 is executed in speculative mode).

3. No other logic. Keep this file minimal — it is purely a bridge.
</action>
<acceptance_criteria>
grep -q "recordIncident" hooks/record-incident.js
grep -q "try {" hooks/record-incident.js
grep -q "module.exports" hooks/record-incident.js
grep -q "incidents.record" hooks/record-incident.js
node -e "const r = require('./hooks/record-incident.js'); console.log(typeof r.recordIncident);" 2>/dev/null | grep -q "function"
</acceptance_criteria>
<verify>
node -e "const { recordIncident } = require('./hooks/record-incident.js'); recordIncident({ type: 'test', issue: 'verify' }); console.log('ok');"
</verify>
<done>
Running the verify command prints "ok" with exit code 0. No crash even if incidents.cjs is present or absent.
</done>
</task>

<task id="24-02-T2" type="auto" tdd="false" complexity="medium">
<name>Wire incident recording into pre-bash-dispatch, post-write-dispatch, and log-tool-failure hooks</name>
<read_first>
hooks/record-incident.js
hooks/pre-bash-dispatch.js
hooks/post-write-dispatch.js
hooks/log-tool-failure.js
</read_first>
<files>
hooks/pre-bash-dispatch.js
hooks/post-write-dispatch.js
hooks/log-tool-failure.js
</files>
<action>
Add incident recording to three existing hook files. All additions must be fire-and-forget and must NOT change hook exit codes or output.

CRITICAL RULE: Do not add any `await` — these hooks are synchronous. recordIncident() is synchronous. Do not change any existing output logic.

---

A. hooks/pre-bash-dispatch.js

1. At the top where other requires are, add:
   ```js
   const { recordIncident } = require('./record-incident');
   ```

2. Find the section where a block decision is made (where exitCode 2 is set or process.exit(2) is called, or where the result has `decision: 'block'`). After writing the block output but BEFORE `process.exit()`, add:
   ```js
   // Record incident (fire-and-forget — does not affect exit code)
   recordIncident({
     source: 'hook',
     type: 'block',
     severity: 'warning',
     issue: result.output.reason || 'PreToolUse block',
     context: { tool: data.tool_name, command: (data.tool_input && data.tool_input.command || '').slice(0, 200) }
   });
   ```

   Note: `data` is the parsed stdin object available throughout the main function. `result` is the check result object. Add this for EACH place where the hook blocks (there may be 2 checks: checkDangerous and checkCommit). Adapt variable names to match what the file actually uses.

---

B. hooks/post-write-dispatch.js

1. At the top where other requires are, add:
   ```js
   const { recordIncident } = require('./record-incident');
   ```

2. Find the section where `additionalContext` messages are collected or emitted (look for where results array is built or where `additionalContext` string is constructed). After collecting all results but before writing stdout, add a loop that records each warning. Read the file carefully and adapt to the actual variable names in use for the warning messages and the file path from hook input:
   ```js
   // Record warnings as incidents (fire-and-forget)
   for (const msg of allMessages) {
     if (!msg) continue;
     recordIncident({
       source: 'hook',
       type: 'warn',
       severity: 'warning',
       issue: typeof msg === 'string' ? msg.slice(0, 300) : JSON.stringify(msg).slice(0, 300),
       context: { file: filePath }
     });
   }
   ```

   Adapt `allMessages` and `filePath` to the actual variable names in post-write-dispatch.js. If results are collected into an array, iterate that array and record each non-null entry.

---

C. hooks/log-tool-failure.js

1. At the top where other requires are, add:
   ```js
   const { recordIncident } = require('./record-incident');
   ```

2. In the `main()` function, after `logEvent(...)` is called (around line 48), add:
   ```js
   // Record tool failure as incident (fire-and-forget)
   recordIncident({
     source: 'hook',
     type: 'error',
     severity: 'error',
     issue: `Tool failure: ${toolName} — ${typeof error === 'string' ? error.slice(0, 200) : JSON.stringify(error).slice(0, 200)}`,
     context: { tool: toolName, interrupt: isInterrupt }
   });
   ```

   This goes BEFORE the hint construction and BEFORE `process.stdout.write(...)`. The `toolName`, `error`, and `isInterrupt` variables are already defined earlier in `main()`.
</action>
<acceptance_criteria>
grep -q "recordIncident" hooks/pre-bash-dispatch.js
grep -q "recordIncident" hooks/post-write-dispatch.js
grep -q "recordIncident" hooks/log-tool-failure.js
grep -q "record-incident" hooks/pre-bash-dispatch.js
grep -q "record-incident" hooks/post-write-dispatch.js
grep -q "record-incident" hooks/log-tool-failure.js
grep -q "type: 'block'" hooks/pre-bash-dispatch.js
grep -q "type: 'error'" hooks/log-tool-failure.js
</acceptance_criteria>
<verify>
node -e "require('./hooks/pre-bash-dispatch.js')" 2>/dev/null; echo "pre-bash exit:$?"
node -e "require('./hooks/post-write-dispatch.js')" 2>/dev/null; echo "post-write exit:$?"
node -e "require('./hooks/log-tool-failure.js')" 2>/dev/null; echo "log-failure exit:$?"
</verify>
<done>
All three require() calls exit 0 (modules load without syntax errors). grep checks all pass. Hook behavior is unchanged — existing tests continue to pass.
</done>
</task>

## Summary

**Plan:** 24-02 | **Wave:** 2 | **Speculative:** true

**Tasks:**
1. T1 — Create `hooks/record-incident.js` shared hook helper (simple)
2. T2 — Wire recordIncident into pre-bash-dispatch, post-write-dispatch, log-tool-failure (medium)

**Key files:**
- `hooks/record-incident.js` (new)
- `hooks/pre-bash-dispatch.js` (modified — add recordIncident on block)
- `hooks/post-write-dispatch.js` (modified — add recordIncident on warn)
- `hooks/log-tool-failure.js` (modified — add recordIncident on failure)

**Must-haves covered:**
- Truths: block/warn/error events auto-recorded, fire-and-forget, hook exit codes unaffected
- Artifacts: record-incident.js with recordIncident() export
- Key links: all three dispatch hooks wired to record-incident.js

**Provides:** record-incident.js helper, hook-level auto-recording for blocks/warns/errors
**Consumes:** incidents.cjs library (24-01)
