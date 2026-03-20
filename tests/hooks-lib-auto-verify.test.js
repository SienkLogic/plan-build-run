'use strict';

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp } = require('./helpers');

const { shouldAutoVerify, getPhaseFromState, writeAutoVerifySignal, isTrustTrackingEnabled } = require('../plugins/pbr/scripts/lib/auto-verify');

let tmpDir;
let planningDir;

beforeEach(() => {
  ({ tmpDir, planningDir } = createTmpPlanning('pbr-auto-verify-'));
});

afterEach(() => {
  cleanupTmp(tmpDir);
});

describe('shouldAutoVerify', () => {
  test('returns false when config.json is missing', () => {
    expect(shouldAutoVerify(planningDir)).toBe(false);
  });

  test('returns false when config.json is invalid JSON', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), 'not json');
    expect(shouldAutoVerify(planningDir)).toBe(false);
  });

  test('returns false when config is null after parse', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), 'null');
    expect(shouldAutoVerify(planningDir)).toBe(false);
  });

  test('returns false when goal_verification is false', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ features: { goal_verification: false } }));
    expect(shouldAutoVerify(planningDir)).toBe(false);
  });

  test('returns false for quick depth', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'quick' }));
    expect(shouldAutoVerify(planningDir)).toBe(false);
  });

  test('returns false for Quick depth (case insensitive)', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'Quick' }));
    expect(shouldAutoVerify(planningDir)).toBe(false);
  });

  test('returns true for standard depth', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard' }));
    expect(shouldAutoVerify(planningDir)).toBe(true);
  });

  test('returns true for comprehensive depth', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'comprehensive' }));
    expect(shouldAutoVerify(planningDir)).toBe(true);
  });

  test('returns true when no depth field (defaults to standard)', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), '{}');
    expect(shouldAutoVerify(planningDir)).toBe(true);
  });
});

describe('getPhaseFromState', () => {
  test('returns null when STATE.md is missing', () => {
    expect(getPhaseFromState(planningDir)).toBeNull();
  });

  test('returns null when no Phase line present', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'No phase here');
    expect(getPhaseFromState(planningDir)).toBeNull();
  });

  test('parses valid phase info', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      'Phase: 3 of 8\nStatus: building');
    const result = getPhaseFromState(planningDir);
    expect(result).toEqual({ phase: 3, total: 8, status: 'building' });
  });

  test('returns null status when no status match', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 3 of 8');
    const result = getPhaseFromState(planningDir);
    expect(result).toEqual({ phase: 3, total: 8, status: null });
  });

  test('handles bold Phase Status format', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      'Phase: 1 of 5\n**Phase Status**: "building"');
    const result = getPhaseFromState(planningDir);
    expect(result.status).toBe('building');
  });

  test('handles malformed content gracefully', () => {
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '{}{}{}');
    expect(getPhaseFromState(planningDir)).toBeNull();
  });
});

describe('writeAutoVerifySignal', () => {
  test('creates signal file with phase and timestamp', () => {
    writeAutoVerifySignal(planningDir, 5);
    const signalPath = path.join(planningDir, '.auto-verify');
    expect(fs.existsSync(signalPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(signalPath, 'utf8'));
    expect(content.phase).toBe(5);
    expect(content.timestamp).toBeDefined();
    // Validate ISO format
    expect(new Date(content.timestamp).toISOString()).toBe(content.timestamp);
  });
});

describe('isTrustTrackingEnabled', () => {
  test('returns true when config is missing (default)', () => {
    expect(isTrustTrackingEnabled(planningDir)).toBe(true);
  });

  test('returns true when trust_tracking is not set', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ features: {} }));
    expect(isTrustTrackingEnabled(planningDir)).toBe(true);
  });

  test('returns true when trust_tracking is true', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ features: { trust_tracking: true } }));
    expect(isTrustTrackingEnabled(planningDir)).toBe(true);
  });

  test('returns false when trust_tracking is false', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ features: { trust_tracking: false } }));
    expect(isTrustTrackingEnabled(planningDir)).toBe(false);
  });

  test('returns true when config is invalid JSON', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), 'bad json');
    expect(isTrustTrackingEnabled(planningDir)).toBe(true);
  });
});
