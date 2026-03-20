/**
 * Tests for hooks/lib/autonomy.js — Progressive autonomy level resolver.
 */

const {
  resolveAutonomyBehavior,
  AUTONOMY_LEVELS,
  ADAPTIVE_THRESHOLDS,
  LEVEL_BEHAVIORS
} = require('../plugins/pbr/scripts/lib/autonomy');

describe('exported constants', () => {
  test('AUTONOMY_LEVELS contains all 4 levels', () => {
    expect(AUTONOMY_LEVELS).toEqual(['supervised', 'guided', 'collaborative', 'adaptive']);
  });

  test('ADAPTIVE_THRESHOLDS has HIGH and LOW', () => {
    expect(ADAPTIVE_THRESHOLDS.HIGH).toBe(0.90);
    expect(ADAPTIVE_THRESHOLDS.LOW).toBe(0.70);
  });

  test('LEVEL_BEHAVIORS has entries for supervised, guided, collaborative', () => {
    expect(LEVEL_BEHAVIORS).toHaveProperty('supervised');
    expect(LEVEL_BEHAVIORS).toHaveProperty('guided');
    expect(LEVEL_BEHAVIORS).toHaveProperty('collaborative');
  });
});

describe('resolveAutonomyBehavior', () => {
  test('supervised: requires approval, no skipUAT, no autoRetry', () => {
    const r = resolveAutonomyBehavior('supervised');
    expect(r.requiresApproval).toBe(true);
    expect(r.skipUAT).toBe(false);
    expect(r.autoRetry).toBe(false);
    expect(r.effectiveLevel).toBe('supervised');
  });

  test('guided: no approval, skipUAT, no autoRetry', () => {
    const r = resolveAutonomyBehavior('guided');
    expect(r.requiresApproval).toBe(false);
    expect(r.skipUAT).toBe(true);
    expect(r.autoRetry).toBe(false);
    expect(r.effectiveLevel).toBe('guided');
  });

  test('collaborative: no approval, skipUAT, autoRetry', () => {
    const r = resolveAutonomyBehavior('collaborative');
    expect(r.requiresApproval).toBe(false);
    expect(r.skipUAT).toBe(true);
    expect(r.autoRetry).toBe(true);
    expect(r.effectiveLevel).toBe('collaborative');
  });

  test('adaptive with high confidence resolves to collaborative', () => {
    const r = resolveAutonomyBehavior('adaptive', 0.95);
    expect(r.effectiveLevel).toBe('collaborative');
    expect(r.autoRetry).toBe(true);
  });

  test('adaptive with low confidence resolves to supervised', () => {
    const r = resolveAutonomyBehavior('adaptive', 0.5);
    expect(r.effectiveLevel).toBe('supervised');
    expect(r.requiresApproval).toBe(true);
  });

  test('adaptive with medium confidence resolves to guided', () => {
    const r = resolveAutonomyBehavior('adaptive', 0.80);
    expect(r.effectiveLevel).toBe('guided');
  });

  test('unknown level falls back to supervised', () => {
    const r = resolveAutonomyBehavior('bogus');
    expect(r.effectiveLevel).toBe('supervised');
    expect(r.requiresApproval).toBe(true);
  });

  test('undefined level falls back to supervised', () => {
    const r = resolveAutonomyBehavior(undefined);
    expect(r.effectiveLevel).toBe('supervised');
  });

  test('adaptive with no confidence uses default 0.5 (supervised)', () => {
    const r = resolveAutonomyBehavior('adaptive');
    // 0.5 < 0.70 threshold => supervised
    expect(r.effectiveLevel).toBe('supervised');
  });
});
