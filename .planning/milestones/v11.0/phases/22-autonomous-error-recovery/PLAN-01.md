---
phase: "22-autonomous-error-recovery"
plan: "22-01"
type: "feature"
wave: 1
depends_on: []
speculative: true
autonomous: true
discovery: 1
gap_closure: false
files_modified:
  - "hooks/lib/config.js"
must_haves:
  truths:
    - "config.json accepts autonomous.max_retries (default 2) and autonomous.error_strategy (default retry)"
    - "CONFIG_DEFAULTS in hooks/lib/config.js includes the new autonomous sub-keys so missing config keys resolve to safe defaults"
  artifacts:
    - "hooks/lib/config.js: autonomous.max_retries default = 2"
    - "hooks/lib/config.js: autonomous.error_strategy default = 'retry'"
  key_links:
    - "CONFIG_DEFAULTS.autonomy object contains max_retries and error_strategy alongside existing level field"
provides:
  - "autonomous.max_retries config key (default 2)"
  - "autonomous.error_strategy config key (default 'retry')"
consumes: []
implements: []
---

<task id="22-01-T1" type="auto" tdd="false" complexity="simple">
<name>Add autonomous.max_retries and autonomous.error_strategy to CONFIG_DEFAULTS</name>
<read_first>hooks/lib/config.js</read_first>
<files>hooks/lib/config.js</files>
<action>
1. Open `hooks/lib/config.js`.
2. Locate the `autonomy` key in `CONFIG_DEFAULTS` (currently `autonomy: { level: 'supervised' }`).
3. Add two new fields to that object:
   - `max_retries: 2` — number of retry attempts before applying error_strategy
   - `error_strategy: 'retry'` — one of: 'stop', 'retry', 'skip'
4. The updated object must be:
   ```js
   autonomy: { level: 'supervised', max_retries: 2, error_strategy: 'retry' },
   ```
5. Do NOT change any other CONFIG_DEFAULTS fields. Do NOT change the existing `autonomy.level`.
6. No other files need changing — the skill reads config.json directly; these defaults apply when the user's config.json omits the fields.
</action>
<acceptance_criteria>
grep -n "max_retries" hooks/lib/config.js | grep -q "2"
grep -n "error_strategy" hooks/lib/config.js | grep -q "'retry'"
grep -n "level" hooks/lib/config.js | grep -q "supervised"
</acceptance_criteria>
<verify>
grep -c "max_retries" hooks/lib/config.js
grep -c "error_strategy" hooks/lib/config.js
node -e "const src=require('fs').readFileSync('hooks/lib/config.js','utf8'); const m=src.match(/autonomy:\s*\{[^}]+\}/); console.log(m&&m[0])"
</verify>
<done>hooks/lib/config.js CONFIG_DEFAULTS.autonomy contains max_retries: 2 and error_strategy: 'retry' alongside the existing level field. npm test -- --testPathPattern=config exits 0.</done>
</task>

## Summary

**Plan:** 22-01 | **Wave:** 1

**Tasks:**
1. T1 — Add `autonomous.max_retries` and `autonomous.error_strategy` to `CONFIG_DEFAULTS` in `hooks/lib/config.js`

**Key files:** `hooks/lib/config.js`

**Must-haves:**
- CONFIG_DEFAULTS exposes `autonomous.max_retries: 2` and `autonomous.error_strategy: 'retry'`
- Existing `autonomy.level` field is preserved

**Provides:** Config defaults for new autonomous error recovery settings
**Consumes:** Nothing
