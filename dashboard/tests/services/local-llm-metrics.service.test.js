import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';

// Mock node:fs/promises with memfs
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

// Import after mocks
const { getLlmMetrics } = await import(
  '../../src/services/local-llm-metrics.service.js'
);

beforeEach(() => {
  vol.reset();
});

const METRICS_PATH = '/project/.planning/logs/local-llm-metrics.jsonl';

const entry = (overrides = {}) => JSON.stringify({
  operation: 'hook-classify',
  latency_ms: 120,
  tokens_saved_frontier: 1500,
  fallback_used: false,
  ...overrides
});

describe('getLlmMetrics', () => {
  it('returns null when metrics file does not exist', async () => {
    vol.fromJSON({ '/project/.planning/phases/.gitkeep': '' });
    const result = await getLlmMetrics('/project');
    expect(result).toBeNull();
  });

  it('returns null when metrics file is empty', async () => {
    vol.fromJSON({ [METRICS_PATH]: '' });
    const result = await getLlmMetrics('/project');
    expect(result).toBeNull();
  });

  it('returns null when all lines are malformed', async () => {
    vol.fromJSON({ [METRICS_PATH]: 'not-json\nalso-not-json\n' });
    const result = await getLlmMetrics('/project');
    expect(result).toBeNull();
  });

  it('computes correct summary totals for valid entries', async () => {
    const lines = [
      entry({ operation: 'hook-classify', latency_ms: 100, tokens_saved_frontier: 1000, fallback_used: false }),
      entry({ operation: 'hook-classify', latency_ms: 200, tokens_saved_frontier: 2000, fallback_used: true }),
      entry({ operation: 'plan-check', latency_ms: 300, tokens_saved_frontier: 3000, fallback_used: false }),
    ].join('\n');
    vol.fromJSON({ [METRICS_PATH]: lines });

    const result = await getLlmMetrics('/project');
    expect(result).not.toBeNull();
    expect(result.summary.total_calls).toBe(3);
    expect(result.summary.fallback_count).toBe(1);
    expect(result.summary.fallback_rate_pct).toBe(33); // Math.round(1/3*100)
    expect(result.summary.avg_latency_ms).toBe(200); // (100+200+300)/3
    expect(result.summary.tokens_saved).toBe(6000);
    // cost_saved_usd = 6000 * (3.0 / 1_000_000) = 0.018 -> fixed to 4 decimal places as number
    expect(result.summary.cost_saved_usd).toBe(0.018);
  });

  it('sorts byOperation descending by calls', async () => {
    const lines = [
      entry({ operation: 'plan-check', tokens_saved_frontier: 500 }),
      entry({ operation: 'hook-classify', tokens_saved_frontier: 1000 }),
      entry({ operation: 'hook-classify', tokens_saved_frontier: 1000 }),
      entry({ operation: 'hook-classify', tokens_saved_frontier: 1000 }),
      entry({ operation: 'plan-check', tokens_saved_frontier: 500 }),
    ].join('\n');
    vol.fromJSON({ [METRICS_PATH]: lines });

    const result = await getLlmMetrics('/project');
    expect(result.byOperation[0].operation).toBe('hook-classify');
    expect(result.byOperation[0].calls).toBe(3);
    expect(result.byOperation[1].operation).toBe('plan-check');
    expect(result.byOperation[1].calls).toBe(2);
  });

  it('computes fallback_rate_pct correctly', async () => {
    const lines = [
      entry({ fallback_used: true }),
      entry({ fallback_used: true }),
      entry({ fallback_used: false }),
      entry({ fallback_used: false }),
    ].join('\n');
    vol.fromJSON({ [METRICS_PATH]: lines });

    const result = await getLlmMetrics('/project');
    expect(result.summary.fallback_count).toBe(2);
    expect(result.summary.total_calls).toBe(4);
    expect(result.summary.fallback_rate_pct).toBe(50);
  });

  it('skips malformed lines and processes valid ones', async () => {
    const lines = [
      'not-json',
      entry({ operation: 'hook-classify', tokens_saved_frontier: 1000 }),
      'also-broken',
    ].join('\n');
    vol.fromJSON({ [METRICS_PATH]: lines });

    const result = await getLlmMetrics('/project');
    expect(result).not.toBeNull();
    expect(result.summary.total_calls).toBe(1);
  });

  it('includes baseline with hook_invocations and estimated_frontier_tokens_without_local', async () => {
    const lines = [
      entry({ tokens_saved_frontier: 2000 }),
      entry({ tokens_saved_frontier: 3000 }),
    ].join('\n');
    vol.fromJSON({ [METRICS_PATH]: lines });

    const result = await getLlmMetrics('/project');
    expect(result.baseline.hook_invocations).toBe(2);
    expect(result.baseline.estimated_frontier_tokens_without_local).toBe(5000);
  });

  it('includes per-operation tokens_saved and fallbacks in byOperation', async () => {
    const lines = [
      entry({ operation: 'hook-classify', tokens_saved_frontier: 1000, fallback_used: false }),
      entry({ operation: 'hook-classify', tokens_saved_frontier: 1500, fallback_used: true }),
    ].join('\n');
    vol.fromJSON({ [METRICS_PATH]: lines });

    const result = await getLlmMetrics('/project');
    const op = result.byOperation.find(o => o.operation === 'hook-classify');
    expect(op.calls).toBe(2);
    expect(op.fallbacks).toBe(1);
    expect(op.tokens_saved).toBe(2500);
  });
});
