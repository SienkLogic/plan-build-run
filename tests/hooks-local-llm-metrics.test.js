'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  logMetric,
  readSessionMetrics,
  summarizeMetrics,
  computeLifetimeMetrics,
  formatSessionSummary,
  logAgreement,
  updateLifetimeTotals,
  seedTotalsFromJsonl
} = require('../plugins/pbr/scripts/lib/local-llm/metrics');

let tmpDir;

function makePlanningDir() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-metrics-'));
  return tmpDir;
}

afterEach(() => {
  if (tmpDir) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* */ }
    tmpDir = null;
  }
});

function makeEntry(overrides = {}) {
  return {
    session_id: 'sess-1',
    timestamp: new Date().toISOString(),
    operation: 'classify',
    model: 'test-model',
    latency_ms: 100,
    tokens_used_local: 50,
    tokens_saved_frontier: 200,
    result: 'ok',
    fallback_used: false,
    confidence: 0.95,
    ...overrides
  };
}

// ---- logMetric ----

describe('logMetric', () => {
  test('creates logs dir and appends JSONL entry', () => {
    const pd = makePlanningDir();
    logMetric(pd, makeEntry());

    const logFile = path.join(pd, 'logs', 'local-llm-metrics.jsonl');
    expect(fs.existsSync(logFile)).toBe(true);
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.session_id).toBe('sess-1');
  });

  test('rotates when exceeding 200 entries', () => {
    const pd = makePlanningDir();
    for (let i = 0; i < 205; i++) {
      logMetric(pd, makeEntry({ session_id: `sess-${i}` }));
    }
    const logFile = path.join(pd, 'logs', 'local-llm-metrics.jsonl');
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
    expect(lines.length).toBe(200);
  });

  test('updates lifetime-totals.json', () => {
    const pd = makePlanningDir();
    logMetric(pd, makeEntry({ tokens_saved_frontier: 100, latency_ms: 50 }));
    logMetric(pd, makeEntry({ tokens_saved_frontier: 200, latency_ms: 75, fallback_used: true }));

    const totalsFile = path.join(pd, 'logs', 'lifetime-totals.json');
    expect(fs.existsSync(totalsFile)).toBe(true);
    const totals = JSON.parse(fs.readFileSync(totalsFile, 'utf8'));
    expect(totals.total_calls).toBe(2);
    expect(totals.fallback_count).toBe(1);
    expect(totals.tokens_saved).toBe(300);
  });
});

// ---- updateLifetimeTotals ----

describe('updateLifetimeTotals', () => {
  test('creates lifetime-totals.json if missing (seeds from JSONL)', () => {
    const pd = makePlanningDir();
    const logsDir = path.join(pd, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });

    // Write a JSONL entry first so seed has something to read
    const logFile = path.join(logsDir, 'local-llm-metrics.jsonl');
    fs.writeFileSync(logFile, JSON.stringify(makeEntry({ tokens_saved_frontier: 50 })) + '\n');

    updateLifetimeTotals(logsDir, makeEntry({ tokens_saved_frontier: 100 }));

    const totalsFile = path.join(logsDir, 'lifetime-totals.json');
    const totals = JSON.parse(fs.readFileSync(totalsFile, 'utf8'));
    // Seeded 1 entry (50 tokens) + incremented by current entry (100 tokens)
    expect(totals.total_calls).toBe(2);
    expect(totals.tokens_saved).toBe(150);
  });

  test('increments counters correctly on each call', () => {
    const pd = makePlanningDir();
    const logsDir = path.join(pd, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });

    // Seed with empty JSONL
    const totalsFile = path.join(logsDir, 'lifetime-totals.json');
    fs.writeFileSync(totalsFile, JSON.stringify({ total_calls: 5, fallback_count: 1, tokens_saved: 500, total_latency_ms: 250 }));

    updateLifetimeTotals(logsDir, makeEntry({ fallback_used: true, tokens_saved_frontier: 100, latency_ms: 50 }));
    const totals = JSON.parse(fs.readFileSync(totalsFile, 'utf8'));
    expect(totals.total_calls).toBe(6);
    expect(totals.fallback_count).toBe(2);
    expect(totals.tokens_saved).toBe(600);
    expect(totals.total_latency_ms).toBe(300);
  });
});

// ---- seedTotalsFromJsonl ----

describe('seedTotalsFromJsonl', () => {
  test('returns zero counts when no JSONL file exists', () => {
    const pd = makePlanningDir();
    const logsDir = path.join(pd, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });

    const result = seedTotalsFromJsonl(logsDir);
    expect(result).toEqual({ total_calls: 0, fallback_count: 0, tokens_saved: 0, total_latency_ms: 0 });
  });

  test('correctly sums entries from existing JSONL', () => {
    const pd = makePlanningDir();
    const logsDir = path.join(pd, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });

    const logFile = path.join(logsDir, 'local-llm-metrics.jsonl');
    const e1 = makeEntry({ tokens_saved_frontier: 100, latency_ms: 50, fallback_used: true });
    const e2 = makeEntry({ tokens_saved_frontier: 200, latency_ms: 75, fallback_used: false });
    fs.writeFileSync(logFile, JSON.stringify(e1) + '\n' + JSON.stringify(e2) + '\n');

    const result = seedTotalsFromJsonl(logsDir);
    expect(result.total_calls).toBe(2);
    expect(result.fallback_count).toBe(1);
    expect(result.tokens_saved).toBe(300);
    expect(result.total_latency_ms).toBe(125);
  });

  test('skips malformed lines', () => {
    const pd = makePlanningDir();
    const logsDir = path.join(pd, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });

    const logFile = path.join(logsDir, 'local-llm-metrics.jsonl');
    fs.writeFileSync(logFile, 'NOT JSON\n' + JSON.stringify(makeEntry({ tokens_saved_frontier: 100 })) + '\n');

    const result = seedTotalsFromJsonl(logsDir);
    expect(result.total_calls).toBe(1);
    expect(result.tokens_saved).toBe(100);
  });
});

// ---- readSessionMetrics ----

describe('readSessionMetrics', () => {
  test('returns entries at or after sessionStartTime', () => {
    const pd = makePlanningDir();
    const logsDir = path.join(pd, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });

    const old = makeEntry({ timestamp: '2025-01-01T00:00:00Z', session_id: 'old' });
    const recent = makeEntry({ timestamp: '2025-06-01T00:00:00Z', session_id: 'recent' });
    const logFile = path.join(logsDir, 'local-llm-metrics.jsonl');
    fs.writeFileSync(logFile, JSON.stringify(old) + '\n' + JSON.stringify(recent) + '\n');

    const result = readSessionMetrics(pd, '2025-03-01T00:00:00Z');
    expect(result.length).toBe(1);
    expect(result[0].session_id).toBe('recent');
  });

  test('returns empty array when no log file exists', () => {
    const pd = makePlanningDir();
    const result = readSessionMetrics(pd, new Date().toISOString());
    expect(result).toEqual([]);
  });

  test('skips malformed lines', () => {
    const pd = makePlanningDir();
    const logsDir = path.join(pd, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });

    const good = makeEntry({ timestamp: '2025-06-01T00:00:00Z' });
    const logFile = path.join(logsDir, 'local-llm-metrics.jsonl');
    fs.writeFileSync(logFile, 'BADLINE\n' + JSON.stringify(good) + '\n');

    const result = readSessionMetrics(pd, '2025-01-01T00:00:00Z');
    expect(result.length).toBe(1);
  });
});

// ---- summarizeMetrics ----

describe('summarizeMetrics', () => {
  test('empty array returns zeroes', () => {
    const result = summarizeMetrics([]);
    expect(result).toEqual({
      total_calls: 0, fallback_count: 0, avg_latency_ms: 0, tokens_saved: 0, cost_saved_usd: 0
    });
  });

  test('correct calculation of avg_latency_ms, tokens_saved, cost_saved_usd', () => {
    const entries = [
      makeEntry({ latency_ms: 100, tokens_saved_frontier: 1000, fallback_used: false }),
      makeEntry({ latency_ms: 200, tokens_saved_frontier: 2000, fallback_used: true })
    ];
    const result = summarizeMetrics(entries);
    expect(result.total_calls).toBe(2);
    expect(result.fallback_count).toBe(1);
    expect(result.avg_latency_ms).toBe(150);
    expect(result.tokens_saved).toBe(3000);
    // 3000 * 3.0 / 1_000_000 = 0.009
    expect(result.cost_saved_usd).toBeCloseTo(0.009, 5);
  });

  test('custom frontierTokenRate changes cost calculation', () => {
    const entries = [makeEntry({ tokens_saved_frontier: 1_000_000 })];
    const result = summarizeMetrics(entries, 10.0);
    expect(result.cost_saved_usd).toBeCloseTo(10.0, 2);
  });
});

// ---- computeLifetimeMetrics ----

describe('computeLifetimeMetrics', () => {
  test('returns zero when no files exist', () => {
    const pd = makePlanningDir();
    const result = computeLifetimeMetrics(pd);
    expect(result.total_calls).toBe(0);
    expect(result.tokens_saved).toBe(0);
    expect(result.by_operation).toEqual({});
  });

  test('uses lifetime-totals.json when available', () => {
    const pd = makePlanningDir();
    const logsDir = path.join(pd, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });

    // Write totals
    fs.writeFileSync(
      path.join(logsDir, 'lifetime-totals.json'),
      JSON.stringify({ total_calls: 100, fallback_count: 10, tokens_saved: 50000, total_latency_ms: 5000 })
    );
    // Write a JSONL entry for by_operation
    const logFile = path.join(logsDir, 'local-llm-metrics.jsonl');
    fs.writeFileSync(logFile, JSON.stringify(makeEntry({ operation: 'classify' })) + '\n');

    const result = computeLifetimeMetrics(pd);
    expect(result.total_calls).toBe(100);
    expect(result.tokens_saved).toBe(50000);
    expect(result.by_operation.classify).toBeDefined();
    expect(result.by_operation.classify.calls).toBe(1);
  });

  test('falls back to JSONL scan when no totals file', () => {
    const pd = makePlanningDir();
    const logsDir = path.join(pd, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });

    const logFile = path.join(logsDir, 'local-llm-metrics.jsonl');
    const e1 = makeEntry({ tokens_saved_frontier: 100, latency_ms: 50 });
    const e2 = makeEntry({ tokens_saved_frontier: 200, latency_ms: 75 });
    fs.writeFileSync(logFile, JSON.stringify(e1) + '\n' + JSON.stringify(e2) + '\n');

    const result = computeLifetimeMetrics(pd);
    expect(result.total_calls).toBe(2);
    expect(result.tokens_saved).toBe(300);
  });

  test('includes by_operation breakdown', () => {
    const pd = makePlanningDir();
    const logsDir = path.join(pd, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });

    // Write totals so the primary path is used
    fs.writeFileSync(
      path.join(logsDir, 'lifetime-totals.json'),
      JSON.stringify({ total_calls: 2, fallback_count: 0, tokens_saved: 300, total_latency_ms: 100 })
    );

    const logFile = path.join(logsDir, 'local-llm-metrics.jsonl');
    const e1 = makeEntry({ operation: 'classify', tokens_saved_frontier: 100 });
    const e2 = makeEntry({ operation: 'triage', tokens_saved_frontier: 200, fallback_used: true });
    fs.writeFileSync(logFile, JSON.stringify(e1) + '\n' + JSON.stringify(e2) + '\n');

    const result = computeLifetimeMetrics(pd);
    expect(result.by_operation.classify.calls).toBe(1);
    expect(result.by_operation.triage.calls).toBe(1);
    expect(result.by_operation.triage.fallbacks).toBe(1);
  });
});

// ---- formatSessionSummary ----

describe('formatSessionSummary', () => {
  test('zero calls returns "no calls this session"', () => {
    expect(formatSessionSummary({ total_calls: 0 })).toBe('Local LLM: no calls this session');
  });

  test('null input returns "no calls this session"', () => {
    expect(formatSessionSummary(null)).toBe('Local LLM: no calls this session');
  });

  test('non-zero calls includes token count, latency, cost', () => {
    const summary = {
      total_calls: 5,
      fallback_count: 0,
      avg_latency_ms: 123.4,
      tokens_saved: 1000,
      cost_saved_usd: 0.003
    };
    const result = formatSessionSummary(summary);
    expect(result).toContain('5 calls');
    expect(result).toContain('~1000 frontier tokens saved');
    expect(result).toContain('$0.00');
    expect(result).toContain('avg 123ms');
  });

  test('includes model name when provided', () => {
    const summary = { total_calls: 1, fallback_count: 0, avg_latency_ms: 50, tokens_saved: 10, cost_saved_usd: 0 };
    const result = formatSessionSummary(summary, 'qwen2.5-coder:7b');
    expect(result).toContain('[qwen2.5-coder:7b]');
  });

  test('includes fallback count when non-zero', () => {
    const summary = { total_calls: 3, fallback_count: 2, avg_latency_ms: 50, tokens_saved: 10, cost_saved_usd: 0 };
    const result = formatSessionSummary(summary);
    expect(result).toContain('2 fallback(s)');
  });
});

// ---- logAgreement ----

describe('logAgreement', () => {
  test('creates shadow JSONL file and appends entries', () => {
    const pd = makePlanningDir();
    logAgreement(pd, { timestamp: '2025-01-01T00:00:00Z', operation: 'test', agrees: true });
    logAgreement(pd, { timestamp: '2025-01-01T00:00:01Z', operation: 'test', agrees: false });

    const logFile = path.join(pd, 'logs', 'local-llm-shadow.jsonl');
    expect(fs.existsSync(logFile)).toBe(true);
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).agrees).toBe(true);
    expect(JSON.parse(lines[1]).agrees).toBe(false);
  });

  test('rotates when exceeding 200 entries', () => {
    const pd = makePlanningDir();
    for (let i = 0; i < 205; i++) {
      logAgreement(pd, { timestamp: new Date().toISOString(), operation: 'test', agrees: true, idx: i });
    }
    const logFile = path.join(pd, 'logs', 'local-llm-shadow.jsonl');
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
    expect(lines.length).toBe(200);
  });
});
