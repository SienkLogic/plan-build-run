'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { computeLifetimeMetrics, formatSessionSummary } = require('../plugins/pbr/scripts/local-llm/metrics');

// --- helpers ---

function makePlanningDir() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-metrics-test-'));
  const planningDir = path.join(tmp, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  return planningDir;
}

function writeMetrics(planningDir, entries) {
  const logFile = path.join(planningDir, 'logs', 'local-llm-metrics.jsonl');
  const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(logFile, lines, 'utf8');
}

function makeEntry(overrides = {}) {
  return {
    session_id: 'sess1',
    timestamp: '2026-01-01T00:00:00.000Z',
    operation: 'classify',
    model: 'phi3',
    latency_ms: 100,
    tokens_used_local: 50,
    tokens_saved_frontier: 200,
    result: 'ok',
    fallback_used: false,
    confidence: 0.9,
    ...overrides
  };
}

// --- computeLifetimeMetrics tests ---

describe('computeLifetimeMetrics', () => {
  test('returns zero struct with by_operation when file missing', () => {
    const dir = makePlanningDir();
    const result = computeLifetimeMetrics(dir, 3.0);
    expect(result).toEqual({
      total_calls: 0,
      fallback_count: 0,
      avg_latency_ms: 0,
      tokens_saved: 0,
      cost_saved_usd: 0,
      by_operation: {}
    });
  });

  test('returns zero struct with by_operation when file is empty', () => {
    const dir = makePlanningDir();
    const logFile = path.join(dir, 'logs', 'local-llm-metrics.jsonl');
    fs.writeFileSync(logFile, '', 'utf8');
    const result = computeLifetimeMetrics(dir, 3.0);
    expect(result).toEqual({
      total_calls: 0,
      fallback_count: 0,
      avg_latency_ms: 0,
      tokens_saved: 0,
      cost_saved_usd: 0,
      by_operation: {}
    });
  });

  test('aggregates single entry correctly', () => {
    const dir = makePlanningDir();
    writeMetrics(dir, [makeEntry({ latency_ms: 200, tokens_saved_frontier: 500, fallback_used: false, operation: 'classify' })]);
    const result = computeLifetimeMetrics(dir, 3.0);
    expect(result.total_calls).toBe(1);
    expect(result.fallback_count).toBe(0);
    expect(result.avg_latency_ms).toBe(200);
    expect(result.tokens_saved).toBe(500);
    expect(result.cost_saved_usd).toBeCloseTo(500 * 3.0 / 1_000_000);
    expect(result.by_operation).toEqual({ classify: { calls: 1, fallbacks: 0, tokens_saved: 500 } });
  });

  test('aggregates multiple entries across operations', () => {
    const dir = makePlanningDir();
    writeMetrics(dir, [
      makeEntry({ operation: 'classify', latency_ms: 100, tokens_saved_frontier: 200, fallback_used: false }),
      makeEntry({ operation: 'classify', latency_ms: 300, tokens_saved_frontier: 300, fallback_used: true }),
      makeEntry({ operation: 'summarize', latency_ms: 200, tokens_saved_frontier: 100, fallback_used: false })
    ]);
    const result = computeLifetimeMetrics(dir, 3.0);
    expect(result.total_calls).toBe(3);
    expect(result.fallback_count).toBe(1);
    expect(result.avg_latency_ms).toBeCloseTo(200);
    expect(result.tokens_saved).toBe(600);
    expect(result.by_operation.classify).toEqual({ calls: 2, fallbacks: 1, tokens_saved: 500 });
    expect(result.by_operation.summarize).toEqual({ calls: 1, fallbacks: 0, tokens_saved: 100 });
  });

  test('skips malformed lines', () => {
    const dir = makePlanningDir();
    const logFile = path.join(dir, 'logs', 'local-llm-metrics.jsonl');
    const content = [
      JSON.stringify(makeEntry({ tokens_saved_frontier: 100 })),
      'not-valid-json',
      '{"broken":',
      JSON.stringify(makeEntry({ tokens_saved_frontier: 200 }))
    ].join('\n') + '\n';
    fs.writeFileSync(logFile, content, 'utf8');
    const result = computeLifetimeMetrics(dir, 3.0);
    expect(result.total_calls).toBe(2);
    expect(result.tokens_saved).toBe(300);
  });

  test('uses provided frontierTokenRate for cost calculation', () => {
    const dir = makePlanningDir();
    writeMetrics(dir, [makeEntry({ tokens_saved_frontier: 1_000_000 })]);
    const result = computeLifetimeMetrics(dir, 5.0);
    expect(result.cost_saved_usd).toBeCloseTo(5.0);
  });
});

// --- formatSessionSummary tests ---

describe('formatSessionSummary', () => {
  const zeroSummary = {
    total_calls: 0,
    fallback_count: 0,
    avg_latency_ms: 0,
    tokens_saved: 0,
    cost_saved_usd: 0
  };

  test('returns "no calls" string for zero summary', () => {
    expect(formatSessionSummary(zeroSummary)).toBe('Local LLM: no calls this session');
  });

  test('includes token count when calls > 0', () => {
    const summary = { total_calls: 3, fallback_count: 0, avg_latency_ms: 150, tokens_saved: 900, cost_saved_usd: 0 };
    const result = formatSessionSummary(summary);
    expect(result).toContain('3 calls');
    expect(result).toContain('~900 frontier tokens saved');
    expect(result).toContain('150ms');
  });

  test('includes cost string when cost_saved_usd > 0', () => {
    const summary = { total_calls: 1, fallback_count: 0, avg_latency_ms: 100, tokens_saved: 500, cost_saved_usd: 0.0015 };
    const result = formatSessionSummary(summary);
    expect(result).toContain('$0.00');
  });

  test('omits cost string when cost is zero', () => {
    const summary = { total_calls: 2, fallback_count: 0, avg_latency_ms: 100, tokens_saved: 200, cost_saved_usd: 0 };
    const result = formatSessionSummary(summary);
    expect(result).not.toContain('$');
  });

  test('appends fallback string when fallback_count > 0', () => {
    const summary = { total_calls: 3, fallback_count: 2, avg_latency_ms: 100, tokens_saved: 300, cost_saved_usd: 0 };
    const result = formatSessionSummary(summary);
    expect(result).toContain('2 fallback(s)');
  });

  test('omits fallback string when fallback_count is 0', () => {
    const summary = { total_calls: 1, fallback_count: 0, avg_latency_ms: 100, tokens_saved: 100, cost_saved_usd: 0 };
    const result = formatSessionSummary(summary);
    expect(result).not.toContain('fallback');
  });

  test('appends model name when provided', () => {
    const summary = { total_calls: 1, fallback_count: 0, avg_latency_ms: 100, tokens_saved: 100, cost_saved_usd: 0 };
    const result = formatSessionSummary(summary, 'phi3');
    expect(result).toContain('[phi3]');
  });

  test('omits model name when not provided', () => {
    const summary = { total_calls: 1, fallback_count: 0, avg_latency_ms: 100, tokens_saved: 100, cost_saved_usd: 0 };
    const result = formatSessionSummary(summary);
    expect(result).not.toContain('[');
  });

  test('returns single line (no newlines)', () => {
    const summary = { total_calls: 2, fallback_count: 1, avg_latency_ms: 150, tokens_saved: 400, cost_saved_usd: 0.001 };
    const result = formatSessionSummary(summary, 'phi3');
    expect(result).not.toContain('\n');
  });
});
