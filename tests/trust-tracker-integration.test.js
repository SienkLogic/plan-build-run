/**
 * Integration tests for trust-tracker wiring in check-subagent-output.js.
 *
 * Verifies that verification outcomes trigger trust score updates
 * when features.trust_tracking is enabled.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// Import the functions we will add to check-subagent-output.js
const {
  extractVerificationOutcome,
  shouldTrackTrust,
  loadFeatureFlag
} = require('../hooks/check-subagent-output');

function makeTempDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trust-integration-'));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'phases', '07-trust'), { recursive: true });
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  return { tmpDir, planningDir };
}

let tmpDirs = [];

afterEach(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (_e) { /* */ }
  }
  tmpDirs = [];
});

describe('extractVerificationOutcome', () => {
  test('returns passed=true when VERIFICATION.md status is passed', () => {
    const { tmpDir, planningDir } = makeTempDir();
    tmpDirs.push(tmpDir);
    fs.writeFileSync(
      path.join(planningDir, 'STATE.md'),
      '---\ncurrent_phase: 7\nphase_slug: "trust-tracking-confidence-calibration"\n---\n# State\nPhase: 7 of 16'
    );
    fs.writeFileSync(
      path.join(planningDir, 'phases', '07-trust', 'VERIFICATION.md'),
      '---\nstatus: passed\nmust_haves_passed: 5\nmust_haves_total: 5\n---\nAll passed.'
    );
    const result = extractVerificationOutcome(planningDir);
    expect(result).not.toBeNull();
    expect(result.passed).toBe(true);
    expect(result.category).toBe('trust-tracking-confidence-calibration');
    expect(result.mustHavesPassed).toBe(5);
    expect(result.mustHavesTotal).toBe(5);
  });

  test('returns passed=false when VERIFICATION.md status is gaps_found', () => {
    const { tmpDir, planningDir } = makeTempDir();
    tmpDirs.push(tmpDir);
    fs.writeFileSync(
      path.join(planningDir, 'STATE.md'),
      '---\ncurrent_phase: 7\nphase_slug: "trust-tracking-confidence-calibration"\n---\n# State\nPhase: 7 of 16'
    );
    fs.writeFileSync(
      path.join(planningDir, 'phases', '07-trust', 'VERIFICATION.md'),
      '---\nstatus: gaps_found\nmust_haves_passed: 3\nmust_haves_total: 5\n---\nGaps found.'
    );
    const result = extractVerificationOutcome(planningDir);
    expect(result).not.toBeNull();
    expect(result.passed).toBe(false);
  });

  test('returns null when no VERIFICATION.md exists', () => {
    const { tmpDir, planningDir } = makeTempDir();
    tmpDirs.push(tmpDir);
    fs.writeFileSync(
      path.join(planningDir, 'STATE.md'),
      '---\ncurrent_phase: 7\n---\n# State\nPhase: 7 of 16'
    );
    const result = extractVerificationOutcome(planningDir);
    expect(result).toBeNull();
  });

  test('extracts category from STATE.md phase_slug', () => {
    const { tmpDir, planningDir } = makeTempDir();
    tmpDirs.push(tmpDir);
    fs.writeFileSync(
      path.join(planningDir, 'STATE.md'),
      '---\ncurrent_phase: 7\nphase_slug: "foundation-sessionstart"\n---\n# State\nPhase: 7 of 16'
    );
    fs.writeFileSync(
      path.join(planningDir, 'phases', '07-trust', 'VERIFICATION.md'),
      '---\nstatus: passed\n---\nPassed.'
    );
    const result = extractVerificationOutcome(planningDir);
    expect(result).not.toBeNull();
    expect(result.category).toBe('foundation-sessionstart');
  });
});

describe('shouldTrackTrust', () => {
  test('returns true when features.trust_tracking is true', () => {
    const { tmpDir, planningDir } = makeTempDir();
    tmpDirs.push(tmpDir);
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ features: { trust_tracking: true } })
    );
    expect(shouldTrackTrust(planningDir)).toBe(true);
  });

  test('returns false when features.trust_tracking is false', () => {
    const { tmpDir, planningDir } = makeTempDir();
    tmpDirs.push(tmpDir);
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ features: { trust_tracking: false } })
    );
    expect(shouldTrackTrust(planningDir)).toBe(false);
  });

  test('returns true when features.trust_tracking is absent (default true)', () => {
    const { tmpDir, planningDir } = makeTempDir();
    tmpDirs.push(tmpDir);
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ features: {} })
    );
    expect(shouldTrackTrust(planningDir)).toBe(true);
  });

  test('returns true when no config.json exists (default true)', () => {
    const { tmpDir, planningDir } = makeTempDir();
    tmpDirs.push(tmpDir);
    expect(shouldTrackTrust(planningDir)).toBe(true);
  });
});

describe('loadFeatureFlag', () => {
  test('returns flag value when present', () => {
    const { tmpDir, planningDir } = makeTempDir();
    tmpDirs.push(tmpDir);
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ features: { trust_tracking: false } })
    );
    expect(loadFeatureFlag(planningDir, 'trust_tracking')).toBe(false);
  });

  test('returns undefined when flag absent', () => {
    const { tmpDir, planningDir } = makeTempDir();
    tmpDirs.push(tmpDir);
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ features: {} })
    );
    expect(loadFeatureFlag(planningDir, 'trust_tracking')).toBeUndefined();
  });

  test('returns undefined when no config.json', () => {
    const { tmpDir, planningDir } = makeTempDir();
    tmpDirs.push(tmpDir);
    expect(loadFeatureFlag(planningDir, 'trust_tracking')).toBeUndefined();
  });
});
