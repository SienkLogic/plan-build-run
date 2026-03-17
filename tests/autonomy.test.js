'use strict';

const path = require('path');

describe('resolveAutonomyBehavior', () => {
  let resolveAutonomyBehavior;

  beforeAll(() => {
    const autonomy = require(path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'lib', 'autonomy.js'));
    resolveAutonomyBehavior = autonomy.resolveAutonomyBehavior;
  });

  test('supervised: requires human approval for all actions', () => {
    const result = resolveAutonomyBehavior('supervised', 0.95);
    expect(result).toMatchObject({
      requiresApproval: true,
      skipUAT: false,
      autoRetry: false,
      effectiveLevel: 'supervised'
    });
  });

  test('guided: AI acts, human reviews async — skips UAT for passed verifications', () => {
    const result = resolveAutonomyBehavior('guided', 0.85);
    expect(result).toMatchObject({
      requiresApproval: false,
      skipUAT: true,
      autoRetry: false,
      effectiveLevel: 'guided'
    });
  });

  test('collaborative: handles routine, escalates novel — auto-retry on self-check fail', () => {
    const result = resolveAutonomyBehavior('collaborative', 0.80);
    expect(result).toMatchObject({
      requiresApproval: false,
      skipUAT: true,
      autoRetry: true,
      effectiveLevel: 'collaborative'
    });
  });

  test('adaptive: high confidence (>0.90) routes to collaborative', () => {
    const result = resolveAutonomyBehavior('adaptive', 0.95);
    expect(result).toMatchObject({
      requiresApproval: false,
      skipUAT: true,
      autoRetry: true,
      effectiveLevel: 'collaborative'
    });
  });

  test('adaptive: low confidence (<0.70) routes to supervised', () => {
    const result = resolveAutonomyBehavior('adaptive', 0.60);
    expect(result).toMatchObject({
      requiresApproval: true,
      skipUAT: false,
      autoRetry: false,
      effectiveLevel: 'supervised'
    });
  });

  test('adaptive: medium confidence (0.70-0.90) routes to guided', () => {
    const result = resolveAutonomyBehavior('adaptive', 0.80);
    expect(result).toMatchObject({
      requiresApproval: false,
      skipUAT: true,
      autoRetry: false,
      effectiveLevel: 'guided'
    });
  });

  test('defaults to supervised for unknown level', () => {
    const result = resolveAutonomyBehavior('nonexistent', 0.50);
    expect(result).toMatchObject({
      requiresApproval: true,
      skipUAT: false,
      autoRetry: false,
      effectiveLevel: 'supervised'
    });
  });

  test('returns supervised behavior when autonomy.level is undefined', () => {
    const result = resolveAutonomyBehavior(undefined, 0.50);
    expect(result).toMatchObject({
      requiresApproval: true,
      skipUAT: false,
      autoRetry: false,
      effectiveLevel: 'supervised'
    });
  });

  test('adaptive with no confidence defaults to 0.5 (guided range)', () => {
    const result = resolveAutonomyBehavior('adaptive');
    expect(result).toMatchObject({
      requiresApproval: false,
      skipUAT: true,
      autoRetry: false,
      effectiveLevel: 'guided'
    });
  });

  test('exports AUTONOMY_LEVELS and ADAPTIVE_THRESHOLDS constants', () => {
    const autonomy = require(path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'lib', 'autonomy.js'));
    expect(autonomy.AUTONOMY_LEVELS).toBeDefined();
    expect(autonomy.ADAPTIVE_THRESHOLDS).toBeDefined();
    expect(autonomy.ADAPTIVE_THRESHOLDS.HIGH).toBe(0.90);
    expect(autonomy.ADAPTIVE_THRESHOLDS.LOW).toBe(0.70);
  });
});
