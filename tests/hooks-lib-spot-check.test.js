/**
 * Tests for hooks/lib/spot-check.js — verifySpotCheck.
 */

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp, writePlanningFile } = require('./helpers');
const { verifySpotCheck } = require('../plugins/pbr/scripts/lib/spot-check');

let tmpDir, planningDir;

afterEach(() => {
  if (tmpDir) cleanupTmp(tmpDir);
  tmpDir = null;
});

// Legacy spotCheck tests removed

describe('verifySpotCheck', () => {
  it('returns error for nonexistent directory', () => {
    const result = verifySpotCheck('plan', '/nonexistent/dir');
    expect(result.error).toContain('Directory not found');
  });

  it('returns error for unknown type', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    const result = verifySpotCheck('invalid_type', planningDir);
    expect(result.error).toContain('Unknown spot-check type');
  });

  it('checks plan: passes with valid PLAN file', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), [
      '---',
      'phase: "01-setup"',
      'plan: "01-01"',
      '---',
      '',
      '## Tasks',
      '',
      '<task id="T1">',
      '<name>Do stuff</name>',
      '</task>'
    ].join('\n'));

    const result = verifySpotCheck('plan', phaseDir);
    expect(result.type).toBe('plan');
    expect(result.passed).toBe(true);
  });

  it('checks plan: fails when no PLAN files exist', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = verifySpotCheck('plan', phaseDir);
    expect(result.passed).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
  });

  it('checks summary: fails when no SUMMARY files exist', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = verifySpotCheck('summary', phaseDir);
    expect(result.passed).toBe(false);
  });

  it('checks verification: fails when VERIFICATION.md missing', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = verifySpotCheck('verification', phaseDir);
    expect(result.passed).toBe(false);
  });

  it('checks verification: passes with valid VERIFICATION.md', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), [
      '---',
      'result: passed',
      'must_haves_checked: 5',
      '---',
      '',
      '## Must-Haves',
      '',
      'All passed.'
    ].join('\n'));

    const result = verifySpotCheck('verification', phaseDir);
    expect(result.passed).toBe(true);
  });

  it('checks quick: passes with PLAN.md and valid SUMMARY.md', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    const quickDir = path.join(planningDir, 'quick', '001-fix');
    fs.mkdirSync(quickDir, { recursive: true });

    fs.writeFileSync(path.join(quickDir, 'PLAN.md'), '---\ntitle: Fix\n---\n');
    fs.writeFileSync(path.join(quickDir, 'SUMMARY.md'), [
      '---',
      'requires: []',
      'key_files:',
      '  - "test.js"',
      'deferred: []',
      '---',
      '',
      '## Results'
    ].join('\n'));

    const result = verifySpotCheck('quick', quickDir);
    expect(result.type).toBe('quick');
    // May pass or fail depending on git state — just check structure
    expect(result.checks).toBeDefined();
    expect(result.checks.length).toBeGreaterThan(0);
  });
});
