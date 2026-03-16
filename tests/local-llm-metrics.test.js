'use strict';

/**
 * Local LLM metrics stub tests.
 *
 * The full metrics implementation is deferred to v3 (ADV-01).
 * These tests verify that the metrics.cjs stub exports exist and
 * return expected stub responses.
 */

const {
  computeLifetimeMetrics,
  readSessionMetrics,
  summarizeMetrics
} = require('../plan-build-run/bin/lib/local-llm/metrics.cjs');

describe('computeLifetimeMetrics (stub)', () => {
  test('returns zero totals', () => {
    const result = computeLifetimeMetrics('/fake/.planning');
    expect(result.total_calls).toBe(0);
    expect(result.tokens_saved).toBe(0);
  });

  test('does not throw when called with arguments', () => {
    expect(() => computeLifetimeMetrics('/some/path')).not.toThrow();
  });

  test('returns an object', () => {
    const result = computeLifetimeMetrics('/any/path');
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
  });
});

describe('readSessionMetrics (stub)', () => {
  test('returns empty array', () => {
    const result = readSessionMetrics('/fake/.planning', Date.now());
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  test('does not throw when called with arguments', () => {
    expect(() => readSessionMetrics('/some/path', 'since-value')).not.toThrow();
  });
});

describe('summarizeMetrics (stub)', () => {
  test('returns zero totals', () => {
    const result = summarizeMetrics([]);
    expect(result.total_calls).toBe(0);
    expect(result.tokens_saved).toBe(0);
  });

  test('does not throw when called with non-empty array', () => {
    expect(() => summarizeMetrics([{ tokens_saved_frontier: 100 }])).not.toThrow();
  });
});
