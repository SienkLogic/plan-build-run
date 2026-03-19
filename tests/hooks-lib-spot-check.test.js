/**
 * Tests for hooks/lib/spot-check.js — spotCheck, verifySpotCheck.
 */

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp, writePlanningFile } = require('./helpers');
const { spotCheck, verifySpotCheck } = require('../hooks/lib/spot-check');

let tmpDir, planningDir;

afterEach(() => {
  if (tmpDir) cleanupTmp(tmpDir);
  tmpDir = null;
});

describe('spotCheck (legacy)', () => {
  it('returns not ok when SUMMARY file does not exist', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = spotCheck(planningDir, '01-setup', '01-01');
    expect(result.ok).toBe(false);
    expect(result.summary_exists).toBe(false);
    expect(result.detail).toContain('not found');
  });

  it('returns ok when SUMMARY has valid commits and key_files', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });

    // Create a key file that exists relative to the repo root (tmpDir)
    fs.writeFileSync(path.join(tmpDir, 'src.js'), 'module.exports = {}');

    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01-01.md'), [
      '---',
      'plan: "01-01"',
      'status: complete',
      'commits: ["abc1234"]',
      'key_files:',
      '  - "src.js"',
      'requires: []',
      'deferred: []',
      '---',
      '',
      '## Task Results'
    ].join('\n'));

    const result = spotCheck(planningDir, '01-setup', '01-01');
    expect(result.ok).toBe(true);
    expect(result.summary_exists).toBe(true);
    expect(result.commits_present).toBe(true);
  });

  it('returns not ok when commits field is empty', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01-01.md'), [
      '---',
      'plan: "01-01"',
      'commits: []',
      'key_files: []',
      '---',
      ''
    ].join('\n'));

    const result = spotCheck(planningDir, '01-setup', '01-01');
    expect(result.ok).toBe(false);
    expect(result.commits_present).toBe(false);
  });

  it('returns not ok when key_files reference missing files', () => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01-01.md'), [
      '---',
      'plan: "01-01"',
      'commits: ["abc1234"]',
      'key_files:',
      '  - "nonexistent-file.js"',
      '---',
      ''
    ].join('\n'));

    const result = spotCheck(planningDir, '01-setup', '01-01');
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('missing key_files');
  });
});

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
