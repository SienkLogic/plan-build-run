---
phase: "20-validate-task-scope-fix"
plan: "20-02"
wave: 2
speculative: true
depends_on: ["20-01"]
files_modified:
  - "tests/gates-unit.test.js"
must_haves:
  truths:
    - "Speculative plans in Phase N+2 with depends_on: [N+1] do NOT block Phase N executor spawns"
    - "Empty phase directories do not block executor spawns (test verifies null return)"
    - "Non-speculative deps without VERIFICATION.md still block (regression test passes)"
  artifacts:
    - "tests/gates-unit.test.js contains describe('checkBuildExecutorGate') with speculative and empty-dir cases"
    - "tests/gates-unit.test.js contains describe('checkBuildDependencyGate') with speculative-dep cases"
  key_links:
    - "Tests import from plugins/pbr/scripts/lib/gates/* (consistent with existing test pattern)"
    - "Tests use createTmpPlanning() and cleanupTmp() helpers from tests/helpers.js"
provides:
  - "gate-tests: checkBuildExecutorGate and checkBuildDependencyGate tests for speculative behavior"
consumes:
  - "speculative-plan-support: isPlanSpeculative() available in helpers.js (from 20-01)"
  - "empty-dir-awareness: build-executor gate returns null for empty dirs (from 20-01)"
implements: []
---

<task id="20-02-T1" type="auto" tdd="false" complexity="medium">
<name>Add checkBuildExecutorGate and checkBuildDependencyGate tests for speculative behavior</name>
<read_first>
tests/gates-unit.test.js
tests/helpers.js
plugins/pbr/scripts/lib/gates/build-executor.js
plugins/pbr/scripts/lib/gates/build-dependency.js
</read_first>
<files>
tests/gates-unit.test.js
</files>
<action>
1. Open `tests/gates-unit.test.js`. Add the two missing gate imports at the top of the file (alongside existing imports):

```js
const { checkBuildExecutorGate } = require('../plugins/pbr/scripts/lib/gates/build-executor');
const { checkBuildDependencyGate } = require('../plugins/pbr/scripts/lib/gates/build-dependency');
```

2. Add a helper function `writePlan(dir, filename, speculative)` near the other helper functions (after `mkPhaseDir`):

```js
function writePlan(phaseDir, filename, isSpeculative) {
  const content = isSpeculative
    ? '---\nspeculative: true\nwave: 1\n---\n# Speculative Plan\n'
    : '---\nwave: 1\n---\n# Plan\n';
  fs.writeFileSync(path.join(phaseDir, filename), content);
}
```

3. Append a new `describe('checkBuildExecutorGate')` block at the bottom of the file (before any final closing brackets):

```js
// --- checkBuildExecutorGate ---

describe('checkBuildExecutorGate', () => {
  test('non-executor subagent_type returns null', () => {
    writeActiveSkill('build');
    const r = checkBuildExecutorGate({ tool_input: { subagent_type: 'pbr:planner' } });
    expect(r).toBeNull();
  });

  test('active skill not "build" returns null', () => {
    writeActiveSkill('plan');
    const r = checkBuildExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('empty phase directory returns null (lazily created for future phase)', () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 1\n---\nPhase: 1 of 5\n');
    mkPhaseDir('01-test'); // empty dir, no PLAN files
    const r = checkBuildExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('phase dir with only speculative plans returns null', () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 1\n---\nPhase: 1 of 5\n');
    const phaseDir = mkPhaseDir('01-test');
    writePlan(phaseDir, 'PLAN-01.md', true); // speculative: true
    const r = checkBuildExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('phase dir with non-speculative plan returns null (allow)', () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 1\n---\nPhase: 1 of 5\n');
    const phaseDir = mkPhaseDir('01-test');
    writePlan(phaseDir, 'PLAN-01.md', false); // speculative: false
    const r = checkBuildExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('phase dir missing entirely returns block', () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 1\n---\nPhase: 1 of 5\n');
    fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
    // No 01-* directory created
    const r = checkBuildExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).not.toBeNull();
    expect(r.block).toBe(true);
    expect(r.reason).toMatch(/no phase directory found/);
  });

  test('speculative plan in Phase N+2 does not block Phase N executor', () => {
    // Phase N = 18, speculative phase = 20
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 18\n---\nPhase: 18 of 24\n');
    // Create phase 18 dir with a real plan
    const phase18Dir = mkPhaseDir('18-test');
    writePlan(phase18Dir, 'PLAN-01.md', false);
    // Create phase 20 dir with a speculative plan (simulates autonomous speculative planning)
    const phase20Dir = path.join(planningDir, 'phases', '20-future');
    fs.mkdirSync(phase20Dir, { recursive: true });
    writePlan(phase20Dir, 'PLAN-01.md', true);
    // Build executor gate for phase 18 should allow (not block on phase 20)
    const r = checkBuildExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });
});

// --- checkBuildDependencyGate ---

describe('checkBuildDependencyGate', () => {
  test('non-executor subagent_type returns null', () => {
    const r = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:planner' } });
    expect(r).toBeNull();
  });

  test('active skill not "build" returns null', () => {
    writeActiveSkill('plan');
    const r = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('dep phase with VERIFICATION.md returns null (allow)', () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 2\n---\nPhase: 2 of 5\n');
    writeRoadmap('### Phase 2: Test\n**Depends on:** Phase 1\n');
    const dep = mkPhaseDir('01-dep');
    writePlan(dep, 'PLAN-01.md', false);
    fs.writeFileSync(path.join(dep, 'VERIFICATION.md'), '# Verification\nstatus: passed\n');
    const r = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('dep phase without VERIFICATION.md returns block', () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 2\n---\nPhase: 2 of 5\n');
    writeRoadmap('### Phase 2: Test\n**Depends on:** Phase 1\n');
    const dep = mkPhaseDir('01-dep');
    writePlan(dep, 'PLAN-01.md', false);
    // No VERIFICATION.md
    const r = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).not.toBeNull();
    expect(r.block).toBe(true);
    expect(r.reason).toMatch(/VERIFICATION\.md/);
  });

  test('dep phase with only speculative plans skips VERIFICATION check', () => {
    // Phase 20 depends on Phase 19, but Phase 19 only has speculative plans
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 20\n---\nPhase: 20 of 24\n');
    writeRoadmap('### Phase 20: Test\n**Depends on:** Phase 19\n');
    const dep = mkPhaseDir('19-future');
    writePlan(dep, 'PLAN-01.md', true); // speculative only — no VERIFICATION needed
    // No VERIFICATION.md in dep phase
    const r = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull(); // should NOT block — dep is speculative
  });

  test('dep phase directory missing returns block', () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 2\n---\nPhase: 2 of 5\n');
    writeRoadmap('### Phase 2: Test\n**Depends on:** Phase 1\n');
    fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
    // No 01-* directory
    const r = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).not.toBeNull();
    expect(r.block).toBe(true);
  });

  test('no depends-on in roadmap returns null', () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 1\n---\nPhase: 1 of 5\n');
    writeRoadmap('### Phase 1: Test\n**Depends on:** none\n');
    const r = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });
});
```

Note: the `writeRoadmap` helper already exists in the test file. Reuse it — do not redeclare it.
</action>
<acceptance_criteria>
grep -q "checkBuildExecutorGate" tests/gates-unit.test.js
grep -q "checkBuildDependencyGate" tests/gates-unit.test.js
grep -q "isPlanSpeculative\|speculative plan in Phase" tests/gates-unit.test.js
grep -q "empty phase directory" tests/gates-unit.test.js
grep -q "dep phase with only speculative" tests/gates-unit.test.js
</acceptance_criteria>
<verify>
node --experimental-vm-modules node_modules/.bin/jest tests/gates-unit.test.js --no-coverage 2>&1 | tail -20
</verify>
<done>
`tests/gates-unit.test.js` has `describe('checkBuildExecutorGate')` and `describe('checkBuildDependencyGate')` blocks. All speculative, empty-dir, and regression cases pass. `npm test` exits 0.
</done>
</task>

## Summary

**Plan:** 20-02 | **Wave:** 2 (depends on 20-01)

**Tasks:**
1. Add `checkBuildExecutorGate` tests (empty dir, speculative-only dir, N+2 speculative scenario) and `checkBuildDependencyGate` tests (speculative dep skips VERIFICATION, non-speculative dep still blocks) to `tests/gates-unit.test.js`

**Key files:** `tests/gates-unit.test.js`

**Must-haves addressed:**
- Test proves speculative Phase N+2 plans don't block Phase N executor
- Test proves empty phase dirs return null
- Regression test: non-speculative dep without VERIFICATION.md still blocks

**Provides:** `gate-tests`
**Consumes:** `speculative-plan-support`, `empty-dir-awareness` (from 20-01)
