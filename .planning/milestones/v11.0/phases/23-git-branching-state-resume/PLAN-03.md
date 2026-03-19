---
phase: "23-git-branching-state-resume"
plan: "23-03"
type: "feature"
wave: 2
depends_on: ["23-01"]
speculative: true
autonomous: true
discovery: 1
gap_closure: false
files_modified:
  - "hooks/lib/test-cache.js"
  - "plugins/pbr/skills/autonomous/SKILL.md"
must_haves:
  truths:
    - "Test results (pass/fail + output) are cached in .planning/.test-cache.json with a 60s TTL"
    - "Autonomous Step 3d checks the cache before running npm test — if a fresh result exists, uses it without re-running"
  artifacts:
    - "hooks/lib/test-cache.js: exports readCache(key, ttlSeconds) and writeCache(key, result)"
    - "plugins/pbr/skills/autonomous/SKILL.md: Step 3d uses cache check before running test suite"
  key_links:
    - "Step 3d calls readCache with a key derived from the phase directory path before running npm test"
    - "After npm test runs, Step 3d calls writeCache to store result"
provides:
  - "test result cache module (hooks/lib/test-cache.js)"
  - "60s TTL test caching in autonomous verification"
consumes:
  - "autonomous SKILL.md Step 3d (from Plan 23-01 wave; file modified in wave 1)"
implements: []
---

<task id="23-03-T1" type="auto" tdd="false" complexity="simple">
<name>Create hooks/lib/test-cache.js with readCache and writeCache using 60s TTL</name>
<read_first>hooks/lib/state.js</read_first>
<files>hooks/lib/test-cache.js</files>
<action>
1. Create `hooks/lib/test-cache.js` as a new CommonJS module.

2. The module must:
   - Use the cache file path `.planning/.test-cache.json` (relative to the project root — resolve via `process.cwd()`)
   - Export two functions: `readCache(key, ttlSeconds = 60)` and `writeCache(key, result)`

3. `readCache(key, ttlSeconds)`:
   - Read `.planning/.test-cache.json` — if the file does not exist, return `null`
   - Parse JSON. If `cache[key]` does not exist, return `null`
   - Check `cache[key].timestamp` — if `Date.now() - timestamp > ttlSeconds * 1000`, return `null` (expired)
   - Return `cache[key]` (the full entry object: `{ passed, output, timestamp }`)
   - Wrap in try/catch — any read/parse error returns `null`

4. `writeCache(key, result)`:
   - Read existing `.planning/.test-cache.json` or start with `{}`
   - Set `cache[key] = { passed: result.passed, output: result.output, timestamp: Date.now() }`
   - Write back atomically: write to `.planning/.test-cache.json.tmp` then rename to `.planning/.test-cache.json`
   - Wrap in try/catch — any write error is silently swallowed (caching must never block the workflow)

5. Key: use the phase directory path as cache key (e.g., `.planning/phases/23-git-branching-state-resume`). Callers pass the key; this module is key-agnostic.

6. Module structure:
   ```js
   'use strict';
   const fs = require('fs');
   const path = require('path');

   const CACHE_FILE = path.join(process.cwd(), '.planning', '.test-cache.json');

   function readCache(key, ttlSeconds = 60) { ... }
   function writeCache(key, result) { ... }

   module.exports = { readCache, writeCache };
   ```
</action>
<acceptance_criteria>
node -e "const c = require('./hooks/lib/test-cache.js'); console.log(typeof c.readCache, typeof c.writeCache)"
grep -c "ttlSeconds" hooks/lib/test-cache.js
grep -c "test-cache.json" hooks/lib/test-cache.js
grep -c "module.exports" hooks/lib/test-cache.js
</acceptance_criteria>
<verify>
node -e "
const c = require('./hooks/lib/test-cache.js');
// write a result
c.writeCache('test-key', { passed: true, output: 'ok' });
// read it back (should be fresh)
const r = c.readCache('test-key', 60);
console.log('read result:', r && r.passed === true ? 'PASS' : 'FAIL');
// read with 0s TTL (should be expired)
const r2 = c.readCache('test-key', 0);
console.log('expired result:', r2 === null ? 'PASS' : 'FAIL');
"
</verify>
<done>hooks/lib/test-cache.js exists, exports readCache and writeCache, node -e integration test prints PASS for both checks.</done>
</task>

<task id="23-03-T2" type="auto" tdd="false" complexity="medium">
<name>Wire test-cache into autonomous Step 3d before npm test execution</name>
<read_first>plugins/pbr/skills/autonomous/SKILL.md</read_first>
<files>plugins/pbr/skills/autonomous/SKILL.md</files>
<action>
1. Open `plugins/pbr/skills/autonomous/SKILL.md`.

2. Locate **Step 3d. Verify Phase (Lightweight-First)**, sub-step 4: "Detect and run test suite if present (`npm test`, `pytest`, `make test`, etc.)."

3. REPLACE that sub-step 4 with an expanded version that adds cache checking:

   ```
   4. **Test result caching:** Before running the test suite:
      a. Compute cache key: the current phase directory path (e.g., `.planning/phases/23-slug`)
      b. Check `.planning/.test-cache.json` for a fresh result (TTL: 60 seconds):
         - If a fresh result exists (`passed: true`, timestamp within 60s): use it directly — do NOT re-run tests
         - Log: `Tests: cached result used (age: {age}s)`
      c. If no fresh cache: detect and run test suite (`npm test`, `pytest`, `make test`, etc.)
         - On completion: write result to `.planning/.test-cache.json` with the phase directory as key
         - Log: `Tests: ran fresh, result cached`
      d. Use the result (cached or fresh) for the confidence gate check in sub-step 5
   ```

4. Also update the **Step 4: Completion** summary display to include:
   - Add `Test cache hits: {count}` to the completion summary block (alongside the existing lines for phases, speculative plans, etc.)

5. Preserve all other content in Step 3d unchanged.
</action>
<acceptance_criteria>
grep -c "test-cache" plugins/pbr/skills/autonomous/SKILL.md
grep -c "TTL.*60\|60.*TTL\|60 second\|60s" plugins/pbr/skills/autonomous/SKILL.md
grep -c "cache key\|cache_key\|cache hit" plugins/pbr/skills/autonomous/SKILL.md
</acceptance_criteria>
<verify>
grep -n "test-cache\|TTL\|cached result\|Test cache" plugins/pbr/skills/autonomous/SKILL.md
</verify>
<done>autonomous/SKILL.md Step 3d includes cache-check-before-test logic with 60s TTL. Step 4 summary includes "Test cache hits" line. markdownlint passes on the file.</done>
</task>

## Summary

**Plan:** 23-03 | **Wave:** 2

**Tasks:**
1. T1 — Create `hooks/lib/test-cache.js` with `readCache(key, ttlSeconds)` and `writeCache(key, result)`
2. T2 — Wire test-cache check into autonomous Step 3d before running `npm test`

**Key files:** `hooks/lib/test-cache.js`, `plugins/pbr/skills/autonomous/SKILL.md`

**Must-haves:**
- Test cache module with 60s TTL, atomic write, silent failure on error
- Autonomous Step 3d checks cache before running test suite; writes result after

**Provides:** test-cache module, 60s TTL test caching in autonomous verification
**Consumes:** autonomous SKILL.md Step 3d location (depends on wave 1 edits being stable)
