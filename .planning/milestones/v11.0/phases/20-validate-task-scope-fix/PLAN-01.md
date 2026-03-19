---
phase: "20-validate-task-scope-fix"
plan: "20-01"
wave: 1
speculative: true
depends_on: []
files_modified:
  - "plugins/pbr/scripts/lib/gates/build-executor.js"
  - "plugins/pbr/scripts/lib/gates/build-dependency.js"
  - "plugins/pbr/scripts/lib/gates/helpers.js"
  - "plan-build-run/bin/lib/gates/build-executor.cjs"
  - "plan-build-run/bin/lib/gates/build-dependency.cjs"
  - "plan-build-run/bin/lib/gates/helpers.cjs"
must_haves:
  truths:
    - "Empty phase directories (created lazily by planner for future phases) do not block executor spawns"
    - "Plans with speculative: true frontmatter are ignored by the build-executor gate"
    - "Dependency gate skips VERIFICATION check for dependency phases whose plans are all speculative"
  artifacts:
    - "plugins/pbr/scripts/lib/gates/helpers.js exports isPlanSpeculative(filePath)"
    - "plugins/pbr/scripts/lib/gates/build-executor.js uses actionablePlans (non-speculative count)"
    - "plugins/pbr/scripts/lib/gates/build-dependency.js skips speculative dep phases"
  key_links:
    - "build-executor gate reads speculative flag from PLAN*.md frontmatter via isPlanSpeculative()"
    - "build-executor gate returns null when phase dir has no non-speculative PLAN files"
    - "build-dependency gate continues past dep phases whose only plans are speculative"
provides:
  - "speculative-plan-support: gate files skip plans with speculative: true"
  - "empty-dir-awareness: empty phase directories are allowed through"
consumes: []
implements: []
---

<task id="20-01-T1" type="auto" tdd="false" complexity="medium">
<name>Add isPlanSpeculative() helper and update build-executor gate for speculative/empty dirs</name>
<read_first>
plugins/pbr/scripts/lib/gates/helpers.js
plugins/pbr/scripts/lib/gates/build-executor.js
plan-build-run/bin/lib/gates/helpers.cjs
plan-build-run/bin/lib/gates/build-executor.cjs
</read_first>
<files>
plugins/pbr/scripts/lib/gates/helpers.js
plugins/pbr/scripts/lib/gates/build-executor.js
plan-build-run/bin/lib/gates/helpers.cjs
plan-build-run/bin/lib/gates/build-executor.cjs
</files>
<action>
1. Open `plugins/pbr/scripts/lib/gates/helpers.js`. Add a new exported function at the bottom, before `module.exports`:

```js
/**
 * Detect whether a PLAN*.md file has speculative: true in its frontmatter.
 * Speculative plans are created for future phases and must not trigger validation gates.
 * @param {string} filePath - absolute path to the PLAN file
 * @returns {boolean}
 */
function isPlanSpeculative(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.startsWith('---')) return false;
    const endIdx = content.indexOf('---', 3);
    if (endIdx === -1) return false;
    const frontmatter = content.substring(3, endIdx);
    return /^\s*speculative\s*:\s*true\s*$/m.test(frontmatter);
  } catch (_e) {
    return false;
  }
}
```

Add `isPlanSpeculative` to `module.exports`.

2. Open `plugins/pbr/scripts/lib/gates/build-executor.js`. Add `isPlanSpeculative` to the require from helpers:

```js
const { readActiveSkill, readCurrentPhase, isPlanSpeculative } = require('./helpers');
```

3. In `checkBuildExecutorGate()`, find the block starting with `const files = fs.readdirSync(phaseDir)`. Replace the entire `hasPlan` / `if (!hasPlan)` section with:

```js
const files = fs.readdirSync(phaseDir);

// Only count non-speculative plans. Speculative plans are created for future phases
// and must not block builds of the current target phase.
const actionablePlans = files.filter(f => {
  if (!/^PLAN.*\.md$/i.test(f)) return false;
  const fullPath = path.join(phaseDir, f);
  try {
    if (fs.statSync(fullPath).size === 0) return false;
  } catch (_e) {
    return false;
  }
  return !isPlanSpeculative(fullPath);
});

if (actionablePlans.length === 0) {
  // No non-speculative plans found. Check whether any non-hidden files exist at all.
  // An empty or speculative-only directory was created lazily for a future phase — allow.
  const hasNonHiddenFiles = files.some(f => !f.startsWith('.'));
  const hasSpeculativeOnly = files.some(f => {
    if (!/^PLAN.*\.md$/i.test(f)) return false;
    const fullPath = path.join(phaseDir, f);
    try {
      if (fs.statSync(fullPath).size === 0) return false;
      return isPlanSpeculative(fullPath);
    } catch (_e) { return false; }
  });
  if (!hasNonHiddenFiles || hasSpeculativeOnly) return null;
  return {
    block: true,
    reason: `Cannot spawn executor: no PLAN.md found in .planning/phases/${dirs[0]}/.\n\nThe phase directory exists but contains no PLAN.md files. The executor needs at least one non-empty PLAN.md to work from.\n\nRun /pbr:plan-phase ${currentPhase} to create plans first.`
  };
}
```

4. Mirror all changes to `plan-build-run/bin/lib/gates/helpers.cjs`:
   - Add same `isPlanSpeculative()` function
   - Add `isPlanSpeculative` to `module.exports`

5. Mirror all changes to `plan-build-run/bin/lib/gates/build-executor.cjs`:
   - Update require: `const { readActiveSkill, readCurrentPhase, isPlanSpeculative } = require('./helpers.cjs');`
   - Replace the `hasPlan` / `if (!hasPlan)` block with the `actionablePlans` logic (same as step 3)
</action>
<acceptance_criteria>
grep -q "isPlanSpeculative" plugins/pbr/scripts/lib/gates/helpers.js
grep -q "isPlanSpeculative" plugins/pbr/scripts/lib/gates/build-executor.js
grep -q "actionablePlans" plugins/pbr/scripts/lib/gates/build-executor.js
grep -q "isPlanSpeculative" plan-build-run/bin/lib/gates/helpers.cjs
grep -q "actionablePlans" plan-build-run/bin/lib/gates/build-executor.cjs
node -e "const { isPlanSpeculative } = require('./plugins/pbr/scripts/lib/gates/helpers'); console.assert(typeof isPlanSpeculative === 'function');"
</acceptance_criteria>
<verify>
node -e "
const { isPlanSpeculative } = require('./plugins/pbr/scripts/lib/gates/helpers');
const fs = require('fs'); const os = require('os'); const path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-'));
const f1 = path.join(tmp, 'PLAN-01.md');
const f2 = path.join(tmp, 'PLAN-02.md');
fs.writeFileSync(f1, '---\nspeculative: true\nwave: 1\n---\n# Plan\n');
fs.writeFileSync(f2, '---\nwave: 1\n---\n# Plan\n');
console.assert(isPlanSpeculative(f1) === true, 'should detect speculative');
console.assert(isPlanSpeculative(f2) === false, 'non-speculative should be false');
fs.rmSync(tmp, { recursive: true });
console.log('isPlanSpeculative: OK');
"
</verify>
<done>
`isPlanSpeculative()` exported from both helpers.js and helpers.cjs. `checkBuildExecutorGate()` in both .js and .cjs counts only non-speculative plans; returns null for empty dirs and speculative-only dirs.
</done>
</task>

<task id="20-01-T2" type="auto" tdd="false" complexity="medium">
<name>Update build-dependency gate to skip speculative dependency phases</name>
<read_first>
plugins/pbr/scripts/lib/gates/build-dependency.js
plan-build-run/bin/lib/gates/build-dependency.cjs
</read_first>
<files>
plugins/pbr/scripts/lib/gates/build-dependency.js
plan-build-run/bin/lib/gates/build-dependency.cjs
</files>
<action>
1. Open `plugins/pbr/scripts/lib/gates/build-dependency.js`. Add `isPlanSpeculative` to the require from helpers:

```js
const { readActiveSkill, isPlanSpeculative } = require('./helpers');
```

2. Find the dependent phase check loop: `for (const depPhase of depPhases) { ... }`. Replace the entire inner body with:

```js
for (const depPhase of depPhases) {
  const paddedPhase = String(depPhase).padStart(2, '0');
  const pDirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(paddedPhase + '-'));
  if (pDirs.length === 0) {
    return {
      block: true,
      reason: `Build dependency gate: dependent phase ${paddedPhase} lacks VERIFICATION.md.\n\nPhase ${currentPhase} depends on phase ${paddedPhase}, which must be verified before building can proceed.\n\nRun /pbr:verify-work ${paddedPhase} to verify the dependency phase first.`
    };
  }
  const depPhaseDir = path.join(phasesDir, pDirs[0]);
  const depFiles = fs.readdirSync(depPhaseDir);

  // If dep phase has only speculative plans, it is a future phase being planned ahead.
  // Skip VERIFICATION check — speculative deps haven't been built yet and that's expected.
  const hasNonSpeculativePlan = depFiles.some(f => {
    if (!/^PLAN.*\.md$/i.test(f)) return false;
    const fullPath = path.join(depPhaseDir, f);
    try {
      if (fs.statSync(fullPath).size === 0) return false;
      return !isPlanSpeculative(fullPath);
    } catch (_e) { return false; }
  });
  if (!hasNonSpeculativePlan) continue;

  const hasVerification = fs.existsSync(path.join(depPhaseDir, 'VERIFICATION.md'));
  if (!hasVerification) {
    return {
      block: true,
      reason: `Build dependency gate: dependent phase ${paddedPhase} lacks VERIFICATION.md.\n\nPhase ${currentPhase} depends on phase ${paddedPhase}, which must be verified before building can proceed.\n\nRun /pbr:verify-work ${paddedPhase} to verify the dependency phase first.`
    };
  }
}
```

3. Mirror all changes to `plan-build-run/bin/lib/gates/build-dependency.cjs`:
   - Update require: `const { readActiveSkill, isPlanSpeculative } = require('./helpers.cjs');`
   - Replace the loop body with the same logic as step 2
</action>
<acceptance_criteria>
grep -q "isPlanSpeculative" plugins/pbr/scripts/lib/gates/build-dependency.js
grep -q "hasNonSpeculativePlan" plugins/pbr/scripts/lib/gates/build-dependency.js
grep -q "isPlanSpeculative" plan-build-run/bin/lib/gates/build-dependency.cjs
grep -q "hasNonSpeculativePlan" plan-build-run/bin/lib/gates/build-dependency.cjs
</acceptance_criteria>
<verify>
node -e "const { checkBuildDependencyGate } = require('./plugins/pbr/scripts/lib/gates/build-dependency'); console.assert(typeof checkBuildDependencyGate === 'function'); console.log('module loads OK');"
</verify>
<done>
`checkBuildDependencyGate()` in both .js and .cjs: dep phases with only speculative plans are skipped; non-speculative dep phases without VERIFICATION.md still block.
</done>
</task>

## Summary

**Plan:** 20-01 | **Wave:** 1 | **Speculative:** true

**Tasks:**
1. Add `isPlanSpeculative()` to helpers + update `checkBuildExecutorGate()` — empty/speculative-only dirs pass
2. Update `checkBuildDependencyGate()` — speculative dep phases skip VERIFICATION check

**Key files:** `plugins/pbr/scripts/lib/gates/helpers.js`, `build-executor.js`, `build-dependency.js` (+ `.cjs` mirrors)

**Must-haves addressed:**
- Empty phase dirs return null (no block)
- Speculative plans exempt from build-executor gate
- Dep gate scoped: only non-speculative dep phases require VERIFICATION.md

**Provides:** `speculative-plan-support`, `empty-dir-awareness`
