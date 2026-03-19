---
phase: "19-shared-file-write-safety"
plan: "19-01"
wave: 1
speculative: true
depends_on: []
files_modified:
  - "plugins/pbr/scripts/check-direct-state-write.js"
  - "plugins/pbr/scripts/post-write-dispatch.js"
must_haves:
  truths:
    - "When STATE.md is written directly via Write/Edit tool, additionalContext warning fires stating the write bypassed lockedFileUpdate()"
    - "When ROADMAP.md is written directly via Write/Edit tool, same bypass warning fires"
  artifacts:
    - "plugins/pbr/scripts/check-direct-state-write.js exports checkDirectStateWrite(data) returning advisory warning or null"
  key_links:
    - "post-write-dispatch.js calls checkDirectStateWrite() and merges its result into combined additionalContext"
implements: []
provides:
  - "Direct-write bypass detection for STATE.md and ROADMAP.md"
consumes: []
---

<task id="19-01-T1" type="auto" tdd="false" complexity="medium">
<name>Implement checkDirectStateWrite hook module</name>
<read_first>
plugins/pbr/scripts/check-agent-state-write.js
plugins/pbr/scripts/check-plan-format.js
plugins/pbr/scripts/post-write-dispatch.js
plugins/pbr/scripts/hook-logger.js
</read_first>
<files>
plugins/pbr/scripts/check-direct-state-write.js
</files>
<action>
Create `plugins/pbr/scripts/check-direct-state-write.js` as a new PostToolUse advisory hook.

1. The module exports a single function: `checkDirectStateWrite(data)`.

2. Detect the target file path from `data.tool_input?.file_path || data.tool_input?.path || ''`.

3. Normalize the path: `const normalized = filePath.replace(/\\/g, '/')`.

4. Trigger on either `.planning/STATE.md` or `.planning/ROADMAP.md`:
   ```js
   const isStateMd = normalized.endsWith('.planning/STATE.md');
   const isRoadmapMd = normalized.endsWith('.planning/ROADMAP.md');
   if (!isStateMd && !isRoadmapMd) return null;
   ```

5. Return an advisory warning (NOT a block — PostToolUse hooks cannot return exit 2):
   ```js
   const file = isStateMd ? 'STATE.md' : 'ROADMAP.md';
   const cliHint = isStateMd
     ? 'Use: node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state update <field> <value>'
     : 'Use: node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js roadmap update-status <phase> <status>';
   return {
     output: {
       additionalContext: `[DirectWrite Warning] Direct Write to ${file} bypasses lockedFileUpdate() and is unsafe in multi-session environments. ${cliHint} for atomic, lock-protected mutations.`
     }
   };
   ```

6. Add a module-level JSDoc comment: "PostToolUse advisory hook: warns when STATE.md or ROADMAP.md is written directly via the Write/Edit tool, bypassing lockedFileUpdate() locking. Advisory only — cannot block (PostToolUse limitation)."

7. Export: `module.exports = { checkDirectStateWrite };`

Note: `begin` skill uses direct Write for first-time STATE.md creation — no existing state to corrupt. The warning will fire as a false positive for that case. Accept this tradeoff; do NOT add suppression logic in this phase.
</action>
<acceptance_criteria>
grep -l "checkDirectStateWrite" plugins/pbr/scripts/check-direct-state-write.js
grep -l "lockedFileUpdate" plugins/pbr/scripts/check-direct-state-write.js
grep -l "additionalContext" plugins/pbr/scripts/check-direct-state-write.js
grep -l "module.exports" plugins/pbr/scripts/check-direct-state-write.js
</acceptance_criteria>
<verify>
node -e "const m = require('./plugins/pbr/scripts/check-direct-state-write.js'); const r = m.checkDirectStateWrite({ tool_input: { file_path: '/project/.planning/STATE.md' } }); console.assert(r && r.output && r.output.additionalContext && r.output.additionalContext.includes('DirectWrite Warning'), 'STATE.md must warn'); const r2 = m.checkDirectStateWrite({ tool_input: { file_path: '/project/.planning/ROADMAP.md' } }); console.assert(r2 && r2.output && r2.output.additionalContext, 'ROADMAP.md must warn'); const r3 = m.checkDirectStateWrite({ tool_input: { file_path: '/project/src/foo.js' } }); console.assert(r3 === null, 'Non-target files return null'); console.log('PASS');"
</verify>
<done>
Verify command prints "PASS" with no assertion errors. File exists at plugins/pbr/scripts/check-direct-state-write.js.
</done>
</task>

<task id="19-01-T2" type="auto" tdd="false" complexity="medium">
<name>Wire checkDirectStateWrite into post-write-dispatch.js</name>
<read_first>
plugins/pbr/scripts/post-write-dispatch.js
plugins/pbr/scripts/check-direct-state-write.js
</read_first>
<files>
plugins/pbr/scripts/post-write-dispatch.js
</files>
<action>
Add `checkDirectStateWrite` to the PostToolUse dispatch chain in `post-write-dispatch.js`.

1. Add require at the top alongside other check imports:
   ```js
   const { checkDirectStateWrite } = require('./check-direct-state-write');
   ```

2. In `processEvent()`, insert this block AFTER the `checkRoadmapWrite` try/catch block and BEFORE the `checkSync` block:
   ```js
   // Direct Write bypass warning for STATE.md and ROADMAP.md
   try {
     const directWriteResult = checkDirectStateWrite(data);
     const ctx = extractContext(directWriteResult);
     if (ctx) results.push(ctx);
   } catch (e) {
     logHook('post-write-dispatch', 'PostToolUse', 'error', { check: 'checkDirectStateWrite', error: e.message });
   }
   ```

3. Follow the existing independent-dispatch pattern (RH-21): all checks run, results are merged. The try/catch ensures a failure in checkDirectStateWrite does not abort other checks.

4. Do NOT change any other logic in post-write-dispatch.js.
</action>
<acceptance_criteria>
grep -n "checkDirectStateWrite" plugins/pbr/scripts/post-write-dispatch.js
grep -n "require.*check-direct-state-write" plugins/pbr/scripts/post-write-dispatch.js
</acceptance_criteria>
<verify>
node -e "const src = require('fs').readFileSync('plugins/pbr/scripts/post-write-dispatch.js', 'utf8'); console.assert(src.includes('checkDirectStateWrite'), 'dispatch calls checkDirectStateWrite'); console.assert(src.includes('check-direct-state-write'), 'dispatch requires check-direct-state-write'); console.log('PASS');"
</verify>
<done>
Grep finds checkDirectStateWrite in post-write-dispatch.js. The module loads without error.
</done>
</task>

## Summary

**Plan:** 19-01 | **Wave:** 1 | **Speculative:** true

### Tasks
1. **19-01-T1** — Create `check-direct-state-write.js` PostToolUse hook that warns when STATE.md or ROADMAP.md is written directly, bypassing `lockedFileUpdate()`
2. **19-01-T2** — Wire `checkDirectStateWrite` into `post-write-dispatch.js` following the independent-dispatch (RH-21) pattern

### Key Files
- `plugins/pbr/scripts/check-direct-state-write.js` (new)
- `plugins/pbr/scripts/post-write-dispatch.js` (modified)

### Must-Haves
- Truths: Direct Write to STATE.md/ROADMAP.md emits advisory warning; non-target files return null
- Artifacts: `checkDirectStateWrite(data)` with advisory output shape
- Key Links: post-write-dispatch.js calls checkDirectStateWrite in processEvent chain

### Provides / Consumes
- **Provides:** Direct-write bypass detection for STATE.md and ROADMAP.md
- **Consumes:** Nothing (reads from hook input data only)
