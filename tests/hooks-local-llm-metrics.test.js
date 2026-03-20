'use strict';

const {
  readSessionMetrics,
  summarizeMetrics,
  computeLifetimeMetrics,
} = require('../plugins/pbr/scripts/lib/local-llm/metrics');

// ---- readSessionMetrics (stub) ----

describe('readSessionMetrics', () => {
  test('returns empty array (stub implementation)', () => {
    const result = readSessionMetrics('/tmp/nonexistent', new Date().toISOString());
    expect(result).toEqual([]);
  });
});

// ---- summarizeMetrics (stub) ----

describe('summarizeMetrics', () => {
  test('returns zero counts (stub implementation)', () => {
    const result = summarizeMetrics([]);
    expect(result).toEqual({ total_calls: 0, tokens_saved: 0 });
  });

  test('returns zero counts even with entries (stub)', () => {
    const result = summarizeMetrics([{ tokens_saved_frontier: 100 }]);
    expect(result).toEqual({ total_calls: 0, tokens_saved: 0 });
  });
});

// ---- computeLifetimeMetrics (stub) ----

describe('computeLifetimeMetrics', () => {
  test('returns zero counts (stub implementation)', () => {
    const result = computeLifetimeMetrics('/tmp/nonexistent');
    expect(result).toEqual({ total_calls: 0, tokens_saved: 0 });
  });
});

// ---- Functions not exported by canonical stub ----

describe('non-exported functions', () => {
  const mod = require('../plugins/pbr/scripts/lib/local-llm/metrics');

  test('logMetric is not exported (stub module)', () => {
    expect(mod.logMetric).toBeUndefined();
  });

  test('formatSessionSummary is not exported (stub module)', () => {
    expect(mod.formatSessionSummary).toBeUndefined();
  });

  test('logAgreement is not exported (stub module)', () => {
    expect(mod.logAgreement).toBeUndefined();
  });

  test('updateLifetimeTotals is not exported (stub module)', () => {
    expect(mod.updateLifetimeTotals).toBeUndefined();
  });

  test('seedTotalsFromJsonl is not exported (stub module)', () => {
    expect(mod.seedTotalsFromJsonl).toBeUndefined();
  });
});
