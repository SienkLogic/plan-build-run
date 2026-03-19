/**
 * Tests for hooks/lib/trust-gate.js — Trust-gated verification depth selector.
 */

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp, writePlanningFile } = require('./helpers');
const {
  resolveVerificationDepth,
  LIGHT_THRESHOLD,
  THOROUGH_THRESHOLD
} = require('../hooks/lib/trust-gate');

let tmpDir, planningDir;

beforeEach(() => {
  ({ tmpDir, planningDir } = createTmpPlanning());
});

afterEach(() => {
  cleanupTmp(tmpDir);
});

const enabledConfig = { features: { graduated_verification: true } };

function writeScores(data) {
  const trustDir = path.join(planningDir, 'trust');
  fs.mkdirSync(trustDir, { recursive: true });
  fs.writeFileSync(path.join(trustDir, 'scores.json'), JSON.stringify(data));
}

describe('thresholds', () => {
  test('LIGHT_THRESHOLD is 0.90', () => {
    expect(LIGHT_THRESHOLD).toBe(0.90);
  });

  test('THOROUGH_THRESHOLD is 0.70', () => {
    expect(THOROUGH_THRESHOLD).toBe(0.70);
  });
});

describe('resolveVerificationDepth', () => {
  test('returns standard when feature disabled (no config)', () => {
    expect(resolveVerificationDepth(planningDir, null)).toBe('standard');
  });

  test('returns standard when feature disabled (false)', () => {
    expect(resolveVerificationDepth(planningDir, { features: { graduated_verification: false } })).toBe('standard');
  });

  test('returns standard when no scores file', () => {
    expect(resolveVerificationDepth(planningDir, enabledConfig)).toBe('standard');
  });

  test('returns light for high overall pass rate', () => {
    writeScores({ overall_pass_rate: 0.95 });
    expect(resolveVerificationDepth(planningDir, enabledConfig)).toBe('light');
  });

  test('returns thorough for low overall pass rate', () => {
    writeScores({ overall_pass_rate: 0.50 });
    expect(resolveVerificationDepth(planningDir, enabledConfig)).toBe('thorough');
  });

  test('returns standard for medium overall pass rate', () => {
    writeScores({ overall_pass_rate: 0.80 });
    expect(resolveVerificationDepth(planningDir, enabledConfig)).toBe('standard');
  });

  test('computes average from agent pass rates when no overall', () => {
    writeScores({
      agents: {
        executor: { pass_rate: 0.95 },
        planner: { pass_rate: 0.98 }
      }
    });
    // Average: 0.965 > 0.90 => light
    expect(resolveVerificationDepth(planningDir, enabledConfig)).toBe('light');
  });

  test('returns standard when agents have no valid pass rates', () => {
    writeScores({ agents: { executor: {} } });
    expect(resolveVerificationDepth(planningDir, enabledConfig)).toBe('standard');
  });

  test('returns standard for malformed JSON', () => {
    const trustDir = path.join(planningDir, 'trust');
    fs.mkdirSync(trustDir, { recursive: true });
    fs.writeFileSync(path.join(trustDir, 'scores.json'), 'not json');
    expect(resolveVerificationDepth(planningDir, enabledConfig)).toBe('standard');
  });

  test('boundary: exactly at LIGHT_THRESHOLD returns standard (not >)', () => {
    writeScores({ overall_pass_rate: 0.90 });
    // 0.90 is NOT > 0.90, so returns standard
    expect(resolveVerificationDepth(planningDir, enabledConfig)).toBe('standard');
  });

  test('boundary: exactly at THOROUGH_THRESHOLD returns standard (not <)', () => {
    writeScores({ overall_pass_rate: 0.70 });
    // 0.70 is NOT < 0.70, so returns standard
    expect(resolveVerificationDepth(planningDir, enabledConfig)).toBe('standard');
  });
});
