/**
 * Tests for hooks/lib/dependency-break.js — Dependency break detection.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const {
  checkDependencyBreaks,
  computeFingerprint
} = require('../hooks/lib/dependency-break');

let tmpDir, planningDir;

beforeEach(() => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-depbrk-test-')));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// --- computeFingerprint ---

describe('computeFingerprint', () => {
  it('returns consistent 8-char hex hash for same content', () => {
    const filePath = path.join(tmpDir, 'test.md');
    fs.writeFileSync(filePath, 'hello world');
    const fp1 = computeFingerprint(filePath);
    const fp2 = computeFingerprint(filePath);
    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(8);
    expect(/^[0-9a-f]{8}$/.test(fp1)).toBe(true);
  });

  it('returns different hash for different content', () => {
    const file1 = path.join(tmpDir, 'a.md');
    const file2 = path.join(tmpDir, 'b.md');
    fs.writeFileSync(file1, 'content A');
    fs.writeFileSync(file2, 'content B');
    expect(computeFingerprint(file1)).not.toBe(computeFingerprint(file2));
  });

  it('returns null for missing file', () => {
    expect(computeFingerprint(path.join(tmpDir, 'nonexistent.md'))).toBeNull();
  });

  it('matches expected MD5 prefix', () => {
    const filePath = path.join(tmpDir, 'verify.md');
    const content = 'test content for hashing';
    fs.writeFileSync(filePath, content);
    const expected = crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
    expect(computeFingerprint(filePath)).toBe(expected);
  });
});

// --- checkDependencyBreaks ---

describe('checkDependencyBreaks', () => {
  it('returns empty array when phases dir does not exist', () => {
    fs.rmSync(path.join(planningDir, 'phases'), { recursive: true, force: true });
    expect(checkDependencyBreaks(planningDir, 1)).toEqual([]);
  });

  it('returns empty array when changed phase has no SUMMARY.md', () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-setup'), { recursive: true });
    // No SUMMARY.md in 01-setup
    expect(checkDependencyBreaks(planningDir, 1)).toEqual([]);
  });

  it('returns empty array when no plans have dependency_fingerprints', () => {
    // Setup upstream phase with SUMMARY
    const upstreamDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(upstreamDir, { recursive: true });
    fs.writeFileSync(path.join(upstreamDir, 'SUMMARY.md'), 'Summary content.');

    // Setup downstream phase with a plan but no fingerprints
    const downstreamDir = path.join(planningDir, 'phases', '02-core');
    fs.mkdirSync(downstreamDir, { recursive: true });
    fs.writeFileSync(
      path.join(downstreamDir, 'PLAN-01.md'),
      '---\nplan: "02-01"\n---\n\nPlan body.'
    );

    expect(checkDependencyBreaks(planningDir, 1)).toEqual([]);
  });

  it('detects break when fingerprint does not match', () => {
    // Setup upstream phase with SUMMARY
    const upstreamDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(upstreamDir, { recursive: true });
    fs.writeFileSync(path.join(upstreamDir, 'SUMMARY.md'), 'Updated summary content.');

    const actualFp = computeFingerprint(path.join(upstreamDir, 'SUMMARY.md'));

    // Setup downstream phase with stale fingerprint
    const downstreamDir = path.join(planningDir, 'phases', '02-core');
    fs.mkdirSync(downstreamDir, { recursive: true });
    fs.writeFileSync(
      path.join(downstreamDir, 'PLAN-01.md'),
      `---\nplan: "02-01"\ndependency_fingerprints: {"1": "deadbeef"}\n---\n\nPlan body.`
    );

    const breaks = checkDependencyBreaks(planningDir, 1);
    expect(breaks.length).toBe(1);
    expect(breaks[0].plan).toBe('02-01');
    expect(breaks[0].dependsOn).toBe(1);
    expect(breaks[0].expected).toBe('deadbeef');
    expect(breaks[0].actual).toBe(actualFp);
  });

  it('returns no break when fingerprints match', () => {
    // Setup upstream phase with SUMMARY
    const upstreamDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(upstreamDir, { recursive: true });
    fs.writeFileSync(path.join(upstreamDir, 'SUMMARY.md'), 'Matching content.');

    const actualFp = computeFingerprint(path.join(upstreamDir, 'SUMMARY.md'));

    // Setup downstream phase with matching fingerprint
    const downstreamDir = path.join(planningDir, 'phases', '02-core');
    fs.mkdirSync(downstreamDir, { recursive: true });
    fs.writeFileSync(
      path.join(downstreamDir, 'PLAN-01.md'),
      `---\nplan: "02-01"\ndependency_fingerprints: {"1": "${actualFp}"}\n---\n\nPlan body.`
    );

    expect(checkDependencyBreaks(planningDir, 1)).toEqual([]);
  });

  it('handles missing plan files gracefully', () => {
    const upstreamDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(upstreamDir, { recursive: true });
    fs.writeFileSync(path.join(upstreamDir, 'SUMMARY.md'), 'Summary.');

    // Create a non-directory file in phases dir
    fs.writeFileSync(path.join(planningDir, 'phases', 'stray-file.md'), 'not a dir');

    // Should not throw
    expect(checkDependencyBreaks(planningDir, 1)).toEqual([]);
  });

  it('checks multiple downstream plans', () => {
    // Upstream
    const upstreamDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(upstreamDir, { recursive: true });
    fs.writeFileSync(path.join(upstreamDir, 'SUMMARY.md'), 'Changed.');

    // Two downstream plans with stale fingerprints
    const down1 = path.join(planningDir, 'phases', '02-core');
    fs.mkdirSync(down1, { recursive: true });
    fs.writeFileSync(
      path.join(down1, 'PLAN-01.md'),
      '---\nplan: "02-01"\ndependency_fingerprints: {"1": "aaaa1111"}\n---\n'
    );

    const down2 = path.join(planningDir, 'phases', '03-extra');
    fs.mkdirSync(down2, { recursive: true });
    fs.writeFileSync(
      path.join(down2, 'PLAN-01.md'),
      '---\nplan: "03-01"\ndependency_fingerprints: {"1": "bbbb2222"}\n---\n'
    );

    const breaks = checkDependencyBreaks(planningDir, 1);
    expect(breaks.length).toBe(2);
  });
});
