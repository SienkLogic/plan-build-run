'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { stepVerify } = require('../plugins/pbr/scripts/lib/step-verify');

describe('stepVerify', () => {
  let tmpDir;
  let planningDir;
  let phaseDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'step-verify-test-'));
    planningDir = path.join(tmpDir, '.planning');
    const phasesDir = path.join(planningDir, 'phases');
    phaseDir = path.join(phasesDir, '56-test-phase');
    fs.mkdirSync(phaseDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeCtx(overrides) {
    return {
      planningDir,
      phaseSlug: '56-test-phase',
      planId: '56-03',
      ...overrides
    };
  }

  // Test a: both STATE.md and SUMMARY.md conditions true → all_passed: true
  test('a: both STATE.md updated and SUMMARY.md exists → all_passed: true', async () => {
    // Create STATE.md
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State');
    // Create SUMMARY.md
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-56-03.md'), '# Summary');

    const result = stepVerify(
      'build',
      'step-6f',
      ['STATE.md updated', 'SUMMARY.md exists'],
      makeCtx()
    );

    expect(result.all_passed).toBe(true);
    expect(result.passed).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
  });

  // Test b: SUMMARY.md does not exist → item in failed array
  test('b: SUMMARY.md not present → item in failed', async () => {
    // No SUMMARY file created
    const result = stepVerify(
      'build',
      'step-6f',
      ['SUMMARY.md exists'],
      makeCtx()
    );

    expect(result.all_passed).toBe(false);
    expect(result.failed).toContain('SUMMARY.md exists');
    expect(result.passed).toHaveLength(0);
  });

  // Test c: STATE.md updated when STATE.md doesn't exist → item in failed
  test('c: STATE.md does not exist → item in failed', async () => {
    const result = stepVerify(
      'build',
      'step-6f',
      ['STATE.md updated'],
      makeCtx()
    );

    expect(result.all_passed).toBe(false);
    expect(result.failed).toContain('STATE.md updated');
  });

  // Test d: 'commit made' checks git log — pass if output non-empty
  test('d: commit made → passes if git log output is non-empty', async () => {
    // Assuming the test runs inside a git repo (plan-build-run is a git repo)
    const result = stepVerify(
      'build',
      'step-6f',
      ['commit made'],
      makeCtx()
    );

    // git log --oneline -1 should be non-empty in a real repo
    expect(result.all_passed).toBe(true);
    expect(result.passed).toContain('commit made');
  });

  // Test e: empty checklist → all_passed: true, empty arrays
  test('e: empty checklist returns all_passed: true with empty arrays', async () => {
    const result = stepVerify('build', 'step-6f', [], makeCtx());

    expect(result).toMatchObject({
      all_passed: true,
      passed: [],
      failed: []
    });
  });

  // Test f: malformed checklist string → { error: 'Invalid checklist JSON' }
  test('f: non-array checklist returns error', async () => {
    const result = stepVerify('build', 'step-6f', 'not-an-array', makeCtx());

    expect(result).toMatchObject({ error: 'Invalid checklist JSON' });
    expect(result.all_passed).toBeUndefined();
  });

  // Test g: return shape has skill, step, passed, failed, all_passed
  test('g: result shape has skill, step, passed, failed, all_passed fields', () => {
    const result = stepVerify('build', 'step-6f', [], makeCtx());

    expect(result).toHaveProperty('skill', 'build');
    expect(result).toHaveProperty('step', 'step-6f');
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('failed');
    expect(result).toHaveProperty('all_passed');
  });

  // Test h: 'PLAN.md exists' when a PLAN file exists → passed
  test('h: PLAN.md exists when PLAN file in phaseDir → passed', async () => {
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), '# Plan');

    const result = stepVerify(
      'build',
      'step-6f',
      ['PLAN.md exists'],
      makeCtx()
    );

    expect(result.all_passed).toBe(true);
    expect(result.passed).toContain('PLAN.md exists');
  });

  // Test i: unknown predicate keyword → count as failed with unknown reason
  test('i: unknown predicate keyword → counted as failed', async () => {
    const result = stepVerify(
      'build',
      'step-6f',
      ['some-unrecognized-condition'],
      makeCtx()
    );

    expect(result.all_passed).toBe(false);
    expect(result.failed).toContain('some-unrecognized-condition');
  });

  // Test j: 'ROADMAP.md updated' checks planningDir root
  test('j: ROADMAP.md updated when ROADMAP.md exists in planningDir → passed', async () => {
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap');

    const result = stepVerify(
      'build',
      'step-8b',
      ['ROADMAP.md updated'],
      makeCtx()
    );

    expect(result.all_passed).toBe(true);
    expect(result.passed).toContain('ROADMAP.md updated');
  });

  // Test k: ROADMAP.md not present → failed
  test('k: ROADMAP.md not present → item in failed', async () => {
    const result = stepVerify(
      'build',
      'step-8b',
      ['ROADMAP.md updated'],
      makeCtx()
    );

    expect(result.all_passed).toBe(false);
    expect(result.failed).toContain('ROADMAP.md updated');
  });

  // Test l: multiple items mixed pass/fail — reports correctly
  test('l: mixed pass/fail checklist reports both arrays correctly', async () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State');
    // No SUMMARY.md — should fail

    const result = stepVerify(
      'build',
      'step-6f',
      ['STATE.md updated', 'SUMMARY.md exists'],
      makeCtx()
    );

    expect(result.all_passed).toBe(false);
    expect(result.passed).toContain('STATE.md updated');
    expect(result.failed).toContain('SUMMARY.md exists');
  });
});
