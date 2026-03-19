---
phase: "24-incident-journal-system"
plan: "24-01"
wave: 1
speculative: true
depends_on: []
files_modified:
  - "plan-build-run/bin/lib/incidents.cjs"
  - "plan-build-run/bin/pbr-tools.cjs"
must_haves:
  truths:
    - "incidents record CLI command appends a JSONL entry to .planning/incidents/incidents-YYYY-MM-DD.jsonl"
    - "incidents list CLI command returns the most recent N entries across daily files"
    - "incidents query CLI command filters by --type, --last Nd, --severity, --session"
    - "incidents summary CLI command returns aggregated counts by type and source"
    - "All incident writes are fire-and-forget with try/catch — exceptions are silently swallowed"
    - "features.incident_journal: false in config.json disables all writing"
  artifacts:
    - "plan-build-run/bin/lib/incidents.cjs exports record(), list(), query(), summary()"
    - "plan-build-run/bin/pbr-tools.cjs routes incidents subcommand to incidents.cjs"
  key_links:
    - "pbr-tools.cjs dispatches incidents record|list|query|summary to incidents.cjs"
    - "incidents.cjs reads features.incident_journal from config before writing"
implements: []
provides:
  - "incidents.cjs library with record/list/query/summary"
  - "pbr-tools incidents CLI commands"
consumes: []
---

<task id="24-01-T1" type="auto" tdd="false" complexity="medium">
<name>Create incidents.cjs library with record, list, query, summary operations</name>
<read_first>
plan-build-run/bin/lib/core.cjs
plan-build-run/bin/lib/config.cjs
plan-build-run/bin/lib/todo.cjs
</read_first>
<files>
plan-build-run/bin/lib/incidents.cjs
</files>
<action>
Create `plan-build-run/bin/lib/incidents.cjs` as a new CommonJS module. This is the core library for the incident journal system.

**Entry format** (one JSON object per line in JSONL files):
```json
{
  "timestamp": "2026-03-19T12:00:00.000Z",
  "session_id": "string|null",
  "source": "hook|skill|agent|cli",
  "type": "block|warn|error|retry|deviation|contention",
  "severity": "info|warning|error",
  "issue": "human-readable description",
  "context": { "phase": "24", "plan": "24-01", "task": null, "file": null },
  "auto_fixed": false,
  "resolution": null,
  "duration_ms": null
}
```

**Storage path**: `.planning/incidents/incidents-YYYY-MM-DD.jsonl` where YYYY-MM-DD is UTC date from `timestamp`.

1. At the top of the file, add the standard module header:
   ```js
   /**
    * lib/incidents.cjs — Incident journal for PBR workflow events.
    *
    * Append-only JSONL log capturing blocks, warnings, errors, retries,
    * deviations, and contention events. Never blocks workflow — all writes
    * are fire-and-forget with try/catch.
    */
   'use strict';
   const fs = require('fs');
   const path = require('path');
   ```

2. Resolve `planningDir` using the same pattern as other lib modules:
   ```js
   function getPlanningDir(cwd) {
     return path.join(cwd || process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
   }
   ```

3. Implement `getIncidentsDir(planningDir)` — returns `path.join(planningDir, 'incidents')`.

4. Implement `getDailyFile(planningDir, date)`:
   - `date` defaults to `new Date()`
   - Returns `path.join(getIncidentsDir(planningDir), 'incidents-' + dateStr + '.jsonl')`
   - Format dateStr as `YYYY-MM-DD` using UTC: `date.toISOString().slice(0, 10)`

5. Implement `isEnabled(planningDir)`:
   - Read `config.json` from planningDir using `fs.readFileSync` + `JSON.parse` inside a try/catch
   - If `config.features.incident_journal === false` return `false`
   - Default: return `true` (enabled when key is absent or true)
   - On any error (file missing, parse failure): return `true`

6. Implement `record(entry, opts)`:
   - `opts`: `{ planningDir, cwd }` — planningDir falls back to `getPlanningDir(opts.cwd)`
   - Entire function body wrapped in try/catch — on any exception, return silently (do NOT re-throw)
   - Check `isEnabled(planningDir)` — if false, return immediately
   - Build a complete entry object by merging defaults with caller-provided fields:
     ```js
     const full = {
       timestamp: new Date().toISOString(),
       session_id: null,
       source: 'hook',
       type: 'warn',
       severity: 'warning',
       issue: '',
       context: {},
       auto_fixed: false,
       resolution: null,
       duration_ms: null,
       ...entry
     };
     ```
   - Ensure `incidents/` directory exists: `fs.mkdirSync(incidentsDir, { recursive: true })`
   - Append `JSON.stringify(full) + '\n'` to the daily file using `fs.appendFileSync`
   - Return the written entry object

7. Implement `list(opts)`:
   - `opts`: `{ planningDir, cwd, limit, reverse }` — limit defaults to 50, reverse defaults to true (newest first)
   - Read all `incidents-*.jsonl` files from the incidents dir, sorted by filename (ascending)
   - Parse each line as JSON, skip blank lines and unparseable lines
   - If `reverse: true`, reverse the full array before slicing
   - Return first `limit` entries

8. Implement `query(filter, opts)`:
   - `filter`: `{ type, severity, source, session_id, last }` — all optional
   - `last`: string like `"7d"`, `"24h"`, `"30m"` — parse to milliseconds cutoff
   - Parse `last`: extract number + unit (`d`=days, `h`=hours, `m`=minutes), compute `cutoff = Date.now() - ms`
   - Load all entries via `list({ ...opts, limit: Infinity, reverse: false })`
   - Filter: if `filter.type` → `entry.type === filter.type`; if `filter.severity` → match; if `filter.source` → match; if `filter.session_id` → match; if `filter.last` → `new Date(entry.timestamp).getTime() >= cutoff`
   - Return filtered array (newest first)

9. Implement `summary(opts)`:
   - Load all entries via `list({ ...opts, limit: Infinity, reverse: false })`
   - Build result: `{ total, by_type: {}, by_source: {}, by_severity: {}, oldest: null, newest: null }`
   - Iterate entries: increment counts in `by_type[entry.type]`, `by_source[entry.source]`, `by_severity[entry.severity]`
   - Track `oldest` (min timestamp) and `newest` (max timestamp)
   - Return result object

10. Export all functions:
    ```js
    module.exports = { record, list, query, summary, isEnabled, getDailyFile, getIncidentsDir };
    ```
</action>
<acceptance_criteria>
grep -r "module.exports" plan-build-run/bin/lib/incidents.cjs | grep -q "record"
grep -r "module.exports" plan-build-run/bin/lib/incidents.cjs | grep -q "summary"
grep -q "try {" plan-build-run/bin/lib/incidents.cjs
grep -q "appendFileSync" plan-build-run/bin/lib/incidents.cjs
grep -q "incident_journal" plan-build-run/bin/lib/incidents.cjs
grep -q "mkdirSync" plan-build-run/bin/lib/incidents.cjs
</acceptance_criteria>
<verify>
node -e "const i = require('./plan-build-run/bin/lib/incidents.cjs'); console.log(typeof i.record, typeof i.list, typeof i.query, typeof i.summary);"
</verify>
<done>
Running the verify command prints "function function function function" with exit code 0.
</done>
</task>

<task id="24-01-T2" type="auto" tdd="false" complexity="simple">
<name>Wire incidents subcommand into pbr-tools.cjs dispatcher</name>
<read_first>
plan-build-run/bin/pbr-tools.cjs
plan-build-run/bin/lib/incidents.cjs
</read_first>
<files>
plan-build-run/bin/pbr-tools.cjs
</files>
<action>
Add `incidents` command routing to the pbr-tools.cjs dispatcher. The pattern mirrors existing command blocks (todo, learnings, etc.).

1. Near the top of the file where other lib modules are required (around line 20 area), add:
   ```js
   const incidents = require('./lib/incidents.cjs');
   ```

2. In the main command dispatch section, add a new block for `incidents`. Find an appropriate location (after `todo` or `learnings` block). Add:
   ```js
   } else if (cmd === 'incidents') {
     const sub = args[0];
     const planningDirOpts = { planningDir, cwd };

     if (sub === 'record') {
       // incidents record --source hook --type block --severity warning --issue "..." [--context '{}'] [--session-id S]
       const entry = parseIncidentFlags(args.slice(1));
       const written = incidents.record(entry, planningDirOpts);
       outputResult(written || { recorded: false }, rawMode);

     } else if (sub === 'list') {
       // incidents list [--limit N]
       const limitIdx = args.indexOf('--limit');
       const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 50;
       outputResult(incidents.list({ ...planningDirOpts, limit }), rawMode);

     } else if (sub === 'query') {
       // incidents query [--type T] [--severity S] [--source X] [--last Nd] [--session-id ID]
       const filter = parseQueryFlags(args.slice(1));
       outputResult(incidents.query(filter, planningDirOpts), rawMode);

     } else if (sub === 'summary') {
       outputResult(incidents.summary(planningDirOpts), rawMode);

     } else {
       outputResult({ error: 'Unknown incidents subcommand. Use: record|list|query|summary' }, rawMode);
     }
   ```

3. Add two local helper functions near the incidents block (before the `} else if (cmd === 'incidents')` line):

   ```js
   function parseIncidentFlags(flagArgs) {
     const entry = {};
     for (let i = 0; i < flagArgs.length; i++) {
       if (flagArgs[i] === '--source') entry.source = flagArgs[++i];
       else if (flagArgs[i] === '--type') entry.type = flagArgs[++i];
       else if (flagArgs[i] === '--severity') entry.severity = flagArgs[++i];
       else if (flagArgs[i] === '--issue') entry.issue = flagArgs[++i];
       else if (flagArgs[i] === '--session-id') entry.session_id = flagArgs[++i];
       else if (flagArgs[i] === '--auto-fixed') entry.auto_fixed = true;
       else if (flagArgs[i] === '--resolution') entry.resolution = flagArgs[++i];
       else if (flagArgs[i] === '--duration-ms') entry.duration_ms = parseInt(flagArgs[++i], 10);
       else if (flagArgs[i] === '--context') {
         try { entry.context = JSON.parse(flagArgs[++i]); } catch (_e) { i++; }
       }
     }
     return entry;
   }

   function parseQueryFlags(flagArgs) {
     const filter = {};
     for (let i = 0; i < flagArgs.length; i++) {
       if (flagArgs[i] === '--type') filter.type = flagArgs[++i];
       else if (flagArgs[i] === '--severity') filter.severity = flagArgs[++i];
       else if (flagArgs[i] === '--source') filter.source = flagArgs[++i];
       else if (flagArgs[i] === '--session-id') filter.session_id = flagArgs[++i];
       else if (flagArgs[i] === '--last') filter.last = flagArgs[++i];
     }
     return filter;
   }
   ```

4. In the large block comment at the top of the file listing all commands, add under a new section:
   ```
    * INCIDENTS:
    *   incidents record --source hook --type block --issue "..." [--severity warning] [--session-id S] [--context '{}'] [--auto-fixed] [--resolution "..."] [--duration-ms N]
    *   incidents list [--limit N]
    *   incidents query [--type T] [--severity S] [--source X] [--last Nd] [--session-id ID]
    *   incidents summary
   ```
</action>
<acceptance_criteria>
grep -q "incidents" plan-build-run/bin/pbr-tools.cjs
grep -q "parseIncidentFlags" plan-build-run/bin/pbr-tools.cjs
grep -q "parseQueryFlags" plan-build-run/bin/pbr-tools.cjs
grep -q "sub === 'record'" plan-build-run/bin/pbr-tools.cjs
grep -q "sub === 'summary'" plan-build-run/bin/pbr-tools.cjs
</acceptance_criteria>
<verify>
node plan-build-run/bin/pbr-tools.cjs incidents summary 2>/dev/null; echo "exit:$?"
</verify>
<done>
Running the verify command exits 0 and prints JSON (either empty summary or error about missing incidents dir — not a Node.js crash).
</done>
</task>

## Summary

**Plan:** 24-01 | **Wave:** 1 | **Speculative:** true

**Tasks:**
1. T1 — Create `incidents.cjs` library with record/list/query/summary operations (medium)
2. T2 — Wire `incidents` subcommand into `pbr-tools.cjs` dispatcher (simple)

**Key files:**
- `plan-build-run/bin/lib/incidents.cjs` (new)
- `plan-build-run/bin/pbr-tools.cjs` (modified)

**Must-haves covered:**
- Truths: JSONL append, list/query/summary CLI, fire-and-forget, config toggle
- Artifacts: incidents.cjs with 4 exports, pbr-tools routing
- Key links: pbr-tools → incidents.cjs, config gate in library

**Provides:** incidents.cjs library, pbr-tools incidents CLI commands
**Consumes:** nothing (Wave 1, no dependencies)
