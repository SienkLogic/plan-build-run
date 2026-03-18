'use strict';

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp } = require('./helpers');

const { checkPlanExecutorGate } = require('../plugins/pbr/scripts/lib/gates/plan-executor');
const { checkReviewPlannerGate } = require('../plugins/pbr/scripts/lib/gates/review-planner');
const { checkReviewVerifierGate } = require('../plugins/pbr/scripts/lib/gates/review-verifier');
const { checkBuildDependencyGate } = require('../plugins/pbr/scripts/lib/gates/build-dependency');

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

// --- checkPlanExecutorGate ---

describe('checkPlanExecutorGate', () => {
  test('non-executor subagent_type returns null', () => {
    writeActiveSkill('plan');
    const r = checkPlanExecutorGate({ tool_input: { subagent_type: 'pbr:planner' } });
    expect(r).toBeNull();
  });

  test('executor but active skill is "build" returns null', () => {
    writeActiveSkill('build');
    const r = checkPlanExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('executor and active skill is "plan" returns block', () => {
    writeActiveSkill('plan');
    const r = checkPlanExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).not.toBeNull();
    expect(r.block).toBe(true);
    expect(r.reason).toMatch(/Plan skill cannot spawn/);
  });

  test('no .active-skill file returns null', () => {
    const r = checkPlanExecutorGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('missing tool_input returns null', () => {
    const r = checkPlanExecutorGate({});
    expect(r).toBeNull();
  });
});

// --- checkReviewPlannerGate ---

describe('checkReviewPlannerGate', () => {
  test('non-planner subagent_type returns null', () => {
    const r = checkReviewPlannerGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('active skill not "review" returns null', () => {
    writeActiveSkill('build');
    const r = checkReviewPlannerGate({ tool_input: { subagent_type: 'pbr:planner' } });
    expect(r).toBeNull();
  });

  test('review + planner + VERIFICATION.md exists returns null (allow)', () => {
    writeActiveSkill('review');
    writeState('---\ncurrent_phase: 1\n---\nPhase: 1\n');
    const phaseDir = mkPhaseDir('01-test');
    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), '# Verification\n');
    const r = checkReviewPlannerGate({ tool_input: { subagent_type: 'pbr:planner' } });
    expect(r).toBeNull();
  });

  test('review + planner + no VERIFICATION.md returns block', () => {
    writeActiveSkill('review');
    writeState('---\ncurrent_phase: 1\n---\nPhase: 1\n');
    mkPhaseDir('01-test');
    const r = checkReviewPlannerGate({ tool_input: { subagent_type: 'pbr:planner' } });
    expect(r).not.toBeNull();
    expect(r.block).toBe(true);
    expect(r.reason).toMatch(/VERIFICATION\.md/);
  });

  test('no STATE.md returns null (graceful)', () => {
    writeActiveSkill('review');
    const r = checkReviewPlannerGate({ tool_input: { subagent_type: 'pbr:planner' } });
    expect(r).toBeNull();
  });

  test('phase dir missing returns null', () => {
    writeActiveSkill('review');
    writeState('---\ncurrent_phase: 99\n---\nPhase: 99\n');
    fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
    const r = checkReviewPlannerGate({ tool_input: { subagent_type: 'pbr:planner' } });
    expect(r).toBeNull();
  });
});

// --- checkReviewVerifierGate ---

describe('checkReviewVerifierGate', () => {
  test('non-verifier subagent_type returns null', () => {
    const r = checkReviewVerifierGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('active skill not "review" returns null', () => {
    writeActiveSkill('build');
    const r = checkReviewVerifierGate({ tool_input: { subagent_type: 'pbr:verifier' } });
    expect(r).toBeNull();
  });

  test('review + verifier + non-empty SUMMARY.md returns null (allow)', () => {
    writeActiveSkill('review');
    writeState('---\ncurrent_phase: 1\n---\nPhase: 1\n');
    const phaseDir = mkPhaseDir('01-test');
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01-01.md'), '# Summary\nContent here\n');
    const r = checkReviewVerifierGate({ tool_input: { subagent_type: 'pbr:verifier' } });
    expect(r).toBeNull();
  });

  test('review + verifier + no SUMMARY.md returns block', () => {
    writeActiveSkill('review');
    writeState('---\ncurrent_phase: 1\n---\nPhase: 1\n');
    mkPhaseDir('01-test');
    const r = checkReviewVerifierGate({ tool_input: { subagent_type: 'pbr:verifier' } });
    expect(r).not.toBeNull();
    expect(r.block).toBe(true);
    expect(r.reason).toMatch(/SUMMARY\.md/);
  });

  test('review + verifier + empty SUMMARY.md (0 bytes) returns block', () => {
    writeActiveSkill('review');
    writeState('---\ncurrent_phase: 1\n---\nPhase: 1\n');
    const phaseDir = mkPhaseDir('01-test');
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01-01.md'), '');
    const r = checkReviewVerifierGate({ tool_input: { subagent_type: 'pbr:verifier' } });
    expect(r).not.toBeNull();
    expect(r.block).toBe(true);
  });

  test('no STATE.md returns null', () => {
    writeActiveSkill('review');
    const r = checkReviewVerifierGate({ tool_input: { subagent_type: 'pbr:verifier' } });
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

  test('no STATE.md returns null', () => {
    writeActiveSkill('build');
    const r = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('dependency verified (VERIFICATION.md present) returns null', () => {
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

  test('dependency NOT verified returns block', () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 2\n---\nPhase: 2\n');
    writeRoadmap(
      '### Phase 2: Testing\n**Depends on:** Phase 1\n\n### Phase 1: Setup\n'
    );
    mkPhaseDir('01-setup');
    const r = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).not.toBeNull();
    expect(r.block).toBe(true);
    expect(r.reason).toMatch(/VERIFICATION\.md/);
  });

  test('"Depends on: None" returns null', () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 2\n---\nPhase: 2\n');
    writeRoadmap('### Phase 2: Testing\n**Depends on:** None\n');
    const r = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('no Depends on line returns null', () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 2\n---\nPhase: 2\n');
    writeRoadmap('### Phase 2: Testing\nSome other content\n');
    const r = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).toBeNull();
  });

  test('multiple deps both verified returns null', () => {
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

  test('multiple deps one missing verification returns block', () => {
    writeActiveSkill('build');
    writeState('---\ncurrent_phase: 3\n---\nPhase: 3\n');
    writeRoadmap(
      '### Phase 3: Deploy\n**Depends on:** Phase 1, Phase 2\n\n### Phase 2: Build\n### Phase 1: Init\n'
    );
    const dep1 = mkPhaseDir('01-init');
    mkPhaseDir('02-build');
    fs.writeFileSync(path.join(dep1, 'VERIFICATION.md'), '# V\n');
    // dep2 has no VERIFICATION.md
    const r = checkBuildDependencyGate({ tool_input: { subagent_type: 'pbr:executor' } });
    expect(r).not.toBeNull();
    expect(r.block).toBe(true);
  });
});
