'use strict';

/**
 * Local LLM client stub tests.
 *
 * The full client implementation is deferred to v3 (ADV-01).
 * These tests verify that the index.cjs stub exports exist and
 * return graceful "not available" responses.
 */

const {
  llmHealth,
  llmStatus,
  llmClassify,
  llmScoreSource,
  llmClassifyError,
  llmSummarize,
  llmMetrics,
  llmAdjustThresholds
} = require('../plan-build-run/bin/lib/local-llm/index.cjs');

describe('local-llm index stub', () => {
  test('llmHealth returns available: false', () => {
    const result = llmHealth();
    expect(result.available).toBe(false);
    expect(result.message).toContain('v2.0');
  });

  test('llmStatus returns status: disabled', () => {
    const result = llmStatus();
    expect(result.status).toBe('disabled');
    expect(result.message).toContain('ADV-01');
  });

  test('llmClassify returns error message', () => {
    const result = llmClassify();
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe('string');
  });

  test('llmScoreSource returns error message', () => {
    const result = llmScoreSource();
    expect(result.error).toBeDefined();
  });

  test('llmClassifyError returns error message', () => {
    const result = llmClassifyError();
    expect(result.error).toBeDefined();
  });

  test('llmSummarize returns error message', () => {
    const result = llmSummarize();
    expect(result.error).toBeDefined();
  });

  test('llmMetrics returns empty metrics array', () => {
    const result = llmMetrics();
    expect(Array.isArray(result.metrics)).toBe(true);
    expect(result.metrics).toHaveLength(0);
    expect(result.message).toBeDefined();
  });

  test('llmAdjustThresholds returns error message', () => {
    const result = llmAdjustThresholds();
    expect(result.error).toBeDefined();
  });

  test('all exports are functions', () => {
    expect(typeof llmHealth).toBe('function');
    expect(typeof llmStatus).toBe('function');
    expect(typeof llmClassify).toBe('function');
    expect(typeof llmScoreSource).toBe('function');
    expect(typeof llmClassifyError).toBe('function');
    expect(typeof llmSummarize).toBe('function');
    expect(typeof llmMetrics).toBe('function');
    expect(typeof llmAdjustThresholds).toBe('function');
  });

  test('stub functions do not throw when called with arguments', () => {
    expect(() => llmHealth({ enabled: true })).not.toThrow();
    expect(() => llmClassify('content', 'PLAN')).not.toThrow();
    expect(() => llmScoreSource('content', 'url')).not.toThrow();
    expect(() => llmClassifyError('ECONNREFUSED')).not.toThrow();
    expect(() => llmSummarize('long text')).not.toThrow();
  });
});
