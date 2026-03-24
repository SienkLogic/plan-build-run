'use strict';

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp } = require('./helpers');

const { checkPlanExecutorGate } = require('../plugins/pbr/scripts/lib/gates/plan-executor');
const { checkReviewPlannerGate } = require('../plugins/pbr/scripts/lib/gates/review-planner');
const { checkReviewVerifierGate } = require('../plugins/pbr/scripts/lib/gates/review-verifier');
const { checkBuildDependencyGate } = require('../plugins/pbr/scripts/lib/gates/build-dependency');
const { checkBuildExecutorGate } = require('../plugins/pbr/scripts/lib/gates/build-executor');

let tmpDir, planningDir, origRoot;

beforeEach(() => {
  ({ tmpDir, planningDir } = createTmpPlanning());
  origRoot = process.env.PBR_PROJECT_ROOT;
  process.env.PBR_PROJECT_ROOT = tmpDir;
});

afterEach(() => {
  cleanupTmp(tmpDir);
  if (origRoot === undefined) {
    delete process.env.PBR_PROJECT_ROOT;
  } else {
    process.env.PBR_PROJECT_ROOT = origRoot;
  }
});

function writeActiveSkill(skill) {
  fs.writeFileSync(path.join(planningDir, '.active-skill'), skill);
}

function writeState(content) {
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), content);
}

function writeRoadmap(content) {
  fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), content);
}

function mkPhaseDir(name) {
  const dir = path.join(planningDir, 'phases', name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writePlan(phaseDir, filename, isSpeculative) {
  const content = isSpeculative
    ? '---\nspeculative: true\nwave: 1\n---\n# Speculative Plan\n'
    : '---\nwave: 1\n---\n# Plan\n';
  fs.writeFileSync(path.join(phaseDir, filename), content);
}

// --- checkPlanExecutorGate ---

describe('checkPlanExecutorGate', () => {
  test('non-executor subagent_type returns null', async () => {
    writeActiveSkill('plan');
    const r = checkPlanExecutorGate({ tool_input: { subagent_type: 'pbr:planner' } });
    expect(r).toBeNull();
  });

  test('executor but active skill is "build" returns null', async () => {
    writeActiveSkill('build');
    const r = checkPlanExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('executor and active skill is "plan" returns block', async () => {
    writeActiveSkill('plan');
    const r = checkPlanExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).not.toBeNull();
    expect(r.block).toBe(true);
    expect(r.reason).toMatch(/Plan skill cannot spawn/);
  });

  test('no .active-skill file returns null', async () => {
    const r = checkPlanExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('missing tool_input returns null', async () => {
    const r = checkPlanExecutorGate({});
    expect(r).toBeNull();
  });
});

// --- checkReviewPlannerGate ---

describe('checkReviewPlannerGate', () => {
  test('non-planner subagent_type returns null', async () => {
    const r = checkReviewPlannerGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('active skill not "review" returns null', async () => {
    writeActiveSkill('build');
    const r = checkReviewPlannerGate({ tool_input: { subagent_type: 'pbr:planner' } });
    expect(r).toBeNull();
  });

  test('review + planner + VERIFICATION.md exists returns null (allow)', async () => {
    writeActiveSkill('review');
    writeState('---\ncurrent_phase: 1\n---\nPhase: 1\n');
    const phaseDir = mkPhaseDir('01-test');
    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), '# Verification\n');
    const r = checkReviewPlannerGate({ tool_input: { subagent_type: 'pbr:planner' } });
    expect(r).toBeNull();
  });

  test('review + planner + no VERIFICATION.md returns block', async () => {
    writeActiveSkill('review');
    writeState('---\ncurrent_phase: 1\n---\nPhase: 1\n');
    mkPhaseDir('01-test');
    const r = checkReviewPlannerGate({ tool_input: { subagent_type: 'pbr:planner' } });
    expect(r).not.toBeNull();
    expect(r.block).toBe(true);
    expect(r.reason).toMatch(/VERIFICATION\.md/);
  });

  test('no STATE.md returns null (graceful)', async () => {
    writeActiveSkill('review');
    const r = checkReviewPlannerGate({ tool_input: { subagent_type: 'pbr:planner' } });
    expect(r).toBeNull();
  });

  test('phase dir missing returns null', async () => {
    writeActiveSkill('review');
    writeState('---\ncurrent_phase: 99\n---\nPhase: 99\n');
    fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
    const r = checkReviewPlannerGate({ tool_input: { subagent_type: 'pbr:planner' } });
    expect(r).toBeNull();
  });
});

// --- checkReviewVerifierGate ---

describe('checkReviewVerifierGate', () => {
  test('non-verifier subagent_type returns null', async () => {
    const r = checkReviewVerifierGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('active skill not "review" returns null', async () => {
    writeActiveSkill('build');
    const r = checkReviewVerifierGate({ tool_input: { subagent_type: 'pbr:verifier' } });
    expect(r).toBeNull();
  });

  test('review + verifier + non-empty SUMMARY.md returns null (allow)', async () => {
    writeActiveSkill('review');
    writeState('---\ncurrent_phase: 1\n---\nPhase: 1\n');
    const phaseDir = mkPhaseDir('01-test');
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01-01.md'), '# Summary\nContent here\n');
    const r = checkReviewVerifierGate({ tool_input: { subagent_type: 'pbr:verifier' } });
    expect(r).toBeNull();
  });

  test('review + verifier + no SUMMARY.md returns block', async () => {
    writeActiveSkill('review');
    writeState('---\ncurrent_phase: 1\n---\nPhase: 1\n');
    mkPhaseDir('01-test');
    const r = checkReviewVerifierGate({ tool_input: { subagent_type: 'pbr:verifier' } });
    expect(r).not.toBeNull();
    expect(r.block).toBe(true);
    expect(r.reason).toMatch(/SUMMARY\.md/);
  });

  test('review + verifier + empty SUMMARY.md (0 bytes) returns block', async () => {
    writeActiveSkill('review');
    writeState('---\ncurrent_phase: 1\n---\nPhase: 1\n');
    const phaseDir = mkPhaseDir('01-test');
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01-01.md'), '');
    const r = checkReviewVerifierGate({ tool_input: { subagent_type: 'pbr:verifier' } });
    expect(r).not.toBeNull();
    expect(r.block).toBe(true);
  });

  test('no STATE.md returns null', async () => {
    writeActiveSkill('review');
    const r = checkReviewVerifierGate({ tool_input: { subagent_type: 'pbr:verifier' } });
    expect(r).toBeNull();
  });
});

// --- checkBuildDependencyGate ---

describe('checkBuildDependencyGate', () => {
  test('non-executor subagent_type returns null', async () => {
    const r = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:planner' } });
    expect(r).toBeNull();
  });

  test('active skill not "build" returns null', async () => {
    writeActiveSkill('plan');
    const r = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('no STATE.md returns null', async () => {
    writeActiveSkill('build');
    const r = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('dependency verified (VERIFICATION.md present) returns null', async () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 2\n---\nPhase: 2\n');
    writeRoadmap(
      '### Phase 2: Testing\n**Depends on:** Phase 1\n\n### Phase 1: Setup\n'
    );
    const depDir = mkPhaseDir('01-setup');
    fs.writeFileSync(path.join(depDir, 'VERIFICATION.md'), '# Verified\n');
    const r = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('dependency NOT verified returns block', async () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 2\n---\nPhase: 2\n');
    writeRoadmap(
      '### Phase 2: Testing\n**Depends on:** Phase 1\n\n### Phase 1: Setup\n'
    );
    const depDir = mkPhaseDir('01-setup');
    writePlan(depDir, 'PLAN-01.md', false); // non-speculative plan triggers VERIFICATION check
    const r = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).not.toBeNull();
    expect(r.block).toBe(true);
    expect(r.reason).toMatch(/VERIFICATION\.md/);
  });

  test('"Depends on: None" returns null', async () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 2\n---\nPhase: 2\n');
    writeRoadmap('### Phase 2: Testing\n**Depends on:** None\n');
    const r = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('no Depends on line returns null', async () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 2\n---\nPhase: 2\n');
    writeRoadmap('### Phase 2: Testing\nSome other content\n');
    const r = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('multiple deps both verified returns null', async () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 3\n---\nPhase: 3\n');
    writeRoadmap(
      '### Phase 3: Deploy\n**Depends on:** Phase 1, Phase 2\n\n### Phase 2: Build\n### Phase 1: Init\n'
    );
    const dep1 = mkPhaseDir('01-init');
    const dep2 = mkPhaseDir('02-build');
    fs.writeFileSync(path.join(dep1, 'VERIFICATION.md'), '# V\n');
    fs.writeFileSync(path.join(dep2, 'VERIFICATION.md'), '# V\n');
    const r = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('multiple deps one missing verification returns block', async () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 3\n---\nPhase: 3\n');
    writeRoadmap(
      '### Phase 3: Deploy\n**Depends on:** Phase 1, Phase 2\n\n### Phase 2: Build\n### Phase 1: Init\n'
    );
    const dep1 = mkPhaseDir('01-init');
    const dep2 = mkPhaseDir('02-build');
    fs.writeFileSync(path.join(dep1, 'VERIFICATION.md'), '# V\n');
    writePlan(dep1, 'PLAN-01.md', false);
    writePlan(dep2, 'PLAN-01.md', false); // non-speculative plan triggers VERIFICATION check
    // dep2 has no VERIFICATION.md
    const r = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).not.toBeNull();
    expect(r.block).toBe(true);
  });

  test('dep phase with only speculative plans skips VERIFICATION check', async () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 20\n---\nPhase: 20 of 24\n');
    writeRoadmap('### Phase 20: Test\n**Depends on:** Phase 19\n');
    const dep = mkPhaseDir('19-future');
    writePlan(dep, 'PLAN-01.md', true); // speculative only — no VERIFICATION needed
    // No VERIFICATION.md in dep phase
    const r = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull(); // should NOT block — dep is speculative
  });

  test('dep phase directory missing returns block', async () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 2\n---\nPhase: 2 of 5\n');
    writeRoadmap('### Phase 2: Test\n**Depends on:** Phase 1\n');
    fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
    // No 01-* directory
    const r = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).not.toBeNull();
    expect(r.block).toBe(true);
  });
});

// --- checkBuildExecutorGate ---

describe('checkBuildExecutorGate', () => {
  test('non-executor subagent_type returns null', async () => {
    writeActiveSkill('build');
    const r = checkBuildExecutorGate({ tool_input: { subagent_type: 'pbr:planner' } });
    expect(r).toBeNull();
  });

  test('active skill not "build" returns null', async () => {
    writeActiveSkill('plan');
    const r = checkBuildExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('empty phase directory returns null (lazily created for future phase)', async () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 1\n---\nPhase: 1 of 5\n');
    mkPhaseDir('01-test'); // empty dir, no PLAN files
    const r = checkBuildExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('phase dir with only speculative plans returns null', async () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 1\n---\nPhase: 1 of 5\n');
    const phaseDir = mkPhaseDir('01-test');
    writePlan(phaseDir, 'PLAN-01.md', true); // speculative: true
    const r = checkBuildExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('phase dir with non-speculative plan returns null (allow)', async () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 1\n---\nPhase: 1 of 5\n');
    const phaseDir = mkPhaseDir('01-test');
    writePlan(phaseDir, 'PLAN-01.md', false); // speculative: false
    const r = checkBuildExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('phase dir missing entirely returns block', async () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 1\n---\nPhase: 1 of 5\n');
    fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
    // No 01-* directory created
    const r = checkBuildExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).not.toBeNull();
    expect(r.block).toBe(true);
    expect(r.reason).toMatch(/no phase directory found/);
  });

  test('speculative plan in Phase N+2 does not block Phase N executor', async () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 18\n---\nPhase: 18 of 24\n');
    const phase18Dir = mkPhaseDir('18-test');
    writePlan(phase18Dir, 'PLAN-01.md', false);
    // Create phase 20 dir with a speculative plan
    const phase20Dir = path.join(planningDir, 'phases', '20-future');
    fs.mkdirSync(phase20Dir, { recursive: true });
    writePlan(phase20Dir, 'PLAN-01.md', true);
    // Build executor gate for phase 18 should allow
    const r = checkBuildExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });
});
