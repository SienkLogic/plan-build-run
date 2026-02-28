'use strict';

/**
 * Tests for plugins/pbr/scripts/lib/spot-check.js
 * TDD — tests written before implementation.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { spotCheck } = require('../plugins/pbr/scripts/lib/spot-check');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-spot-check-test-'));
}

function makePlanningDir(tmpDir) {
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
  return planningDir;
}

function makePhaseDir(planningDir, phaseSlug) {
  const dir = path.join(planningDir, 'phases', phaseSlug);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Helper to write a SUMMARY file with specified frontmatter
function writeSummary(phaseDir, planId, frontmatter, body) {
  const content = `---\n${frontmatter}\n---\n\n${body || ''}`;
  fs.writeFileSync(path.join(phaseDir, `SUMMARY-${planId}.md`), content, 'utf8');
}

describe('spotCheck', () => {
  let tmpDir, planningDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    planningDir = makePlanningDir(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns ok:false with summary_exists:false when SUMMARY is missing', () => {
    makePhaseDir(planningDir, '49-test-phase');
    const result = spotCheck(planningDir, '49-test-phase', '49-01');
    expect(result.ok).toBe(false);
    expect(result.summary_exists).toBe(false);
    expect(result.detail).toMatch(/not found/i);
  });

  test('returns ok:true when SUMMARY exists, key_files exist, commits non-empty', () => {
    // Create real files for key_files to check
    const file1 = path.join(tmpDir, 'plugins', 'pbr', 'scripts', 'lib', 'spot-check.js');
    const file2 = path.join(tmpDir, 'tests', 'spot-check.test.js');
    fs.mkdirSync(path.dirname(file1), { recursive: true });
    fs.mkdirSync(path.dirname(file2), { recursive: true });
    fs.writeFileSync(file1, '// spot-check', 'utf8');
    fs.writeFileSync(file2, '// test', 'utf8');

    const phaseDir = makePhaseDir(planningDir, '49-test-phase');
    writeSummary(phaseDir, '49-01', [
      'plan: "49-01"',
      'status: complete',
      'key_files:',
      '  - plugins/pbr/scripts/lib/spot-check.js',
      '  - tests/spot-check.test.js',
      'commits: ["abc1234", "def5678"]'
    ].join('\n'), 'Done.');

    const result = spotCheck(planningDir, '49-test-phase', '49-01');
    expect(result.ok).toBe(true);
    expect(result.summary_exists).toBe(true);
    expect(result.commits_present).toBe(true);
    expect(result.key_files_checked.length).toBeGreaterThan(0);
    expect(result.key_files_checked.every(kf => kf.exists)).toBe(true);
    expect(result.detail).toMatch(/all checks passed/i);
  });

  test('returns ok:false when a key_file is missing from disk', () => {
    const phaseDir = makePhaseDir(planningDir, '49-test-phase');
    // key_files point to paths that do NOT exist
    writeSummary(phaseDir, '49-01', [
      'plan: "49-01"',
      'status: complete',
      'key_files:',
      '  - plugins/pbr/scripts/lib/nonexistent.js',
      '  - tests/also-nonexistent.test.js',
      'commits: ["abc1234"]'
    ].join('\n'), 'Done.');

    const result = spotCheck(planningDir, '49-test-phase', '49-01');
    expect(result.ok).toBe(false);
    expect(result.summary_exists).toBe(true);
    expect(result.key_files_checked.length).toBeGreaterThan(0);
    expect(result.key_files_checked.some(kf => !kf.exists)).toBe(true);
  });

  test('returns ok:false when commits field is empty array', () => {
    const phaseDir = makePhaseDir(planningDir, '49-test-phase');
    writeSummary(phaseDir, '49-01', [
      'plan: "49-01"',
      'status: complete',
      'key_files: []',
      'commits: []'
    ].join('\n'), 'Done.');

    const result = spotCheck(planningDir, '49-test-phase', '49-01');
    expect(result.ok).toBe(false);
    expect(result.summary_exists).toBe(true);
    expect(result.commits_present).toBe(false);
  });

  test('returns ok:false when commits field is empty string', () => {
    const phaseDir = makePhaseDir(planningDir, '49-test-phase');
    writeSummary(phaseDir, '49-01', [
      'plan: "49-01"',
      'status: complete',
      'key_files: []',
      'commits: ""'
    ].join('\n'), 'Done.');

    const result = spotCheck(planningDir, '49-test-phase', '49-01');
    expect(result.ok).toBe(false);
    expect(result.commits_present).toBe(false);
  });

  test('returns ok:false when commits field is null/~', () => {
    const phaseDir = makePhaseDir(planningDir, '49-test-phase');
    writeSummary(phaseDir, '49-01', [
      'plan: "49-01"',
      'status: complete',
      'key_files: []',
      'commits: ~'
    ].join('\n'), 'Done.');

    const result = spotCheck(planningDir, '49-test-phase', '49-01');
    expect(result.ok).toBe(false);
    expect(result.commits_present).toBe(false);
  });

  test('returns ok:false when SUMMARY has no frontmatter', () => {
    const phaseDir = makePhaseDir(planningDir, '49-test-phase');
    fs.writeFileSync(
      path.join(phaseDir, 'SUMMARY-49-01.md'),
      'No frontmatter here, just text.',
      'utf8'
    );

    const result = spotCheck(planningDir, '49-test-phase', '49-01');
    expect(result.ok).toBe(false);
    expect(result.summary_exists).toBe(true);
    expect(result.detail).toBeTruthy();
  });

  test('handles key_files list with fewer than 2 entries — checks only what is available', () => {
    // Create only one file
    const file1 = path.join(tmpDir, 'plugins', 'pbr', 'scripts', 'lib', 'spot-check.js');
    fs.mkdirSync(path.dirname(file1), { recursive: true });
    fs.writeFileSync(file1, '// spot-check', 'utf8');

    const phaseDir = makePhaseDir(planningDir, '49-test-phase');
    writeSummary(phaseDir, '49-01', [
      'plan: "49-01"',
      'status: complete',
      'key_files:',
      '  - plugins/pbr/scripts/lib/spot-check.js',
      'commits: ["abc1234"]'
    ].join('\n'), 'Done.');

    const result = spotCheck(planningDir, '49-test-phase', '49-01');
    // Should check the one available file, not crash
    expect(result.key_files_checked).toHaveLength(1);
    expect(result.key_files_checked[0].exists).toBe(true);
    expect(result.ok).toBe(true);
  });

  test('handles empty key_files list — ok when commits present', () => {
    const phaseDir = makePhaseDir(planningDir, '49-test-phase');
    writeSummary(phaseDir, '49-01', [
      'plan: "49-01"',
      'status: complete',
      'key_files: []',
      'commits: ["abc1234"]'
    ].join('\n'), 'Done.');

    const result = spotCheck(planningDir, '49-test-phase', '49-01');
    // With no key_files to check, key_files check trivially passes
    expect(result.key_files_checked).toHaveLength(0);
    expect(result.commits_present).toBe(true);
    expect(result.ok).toBe(true);
  });
});
