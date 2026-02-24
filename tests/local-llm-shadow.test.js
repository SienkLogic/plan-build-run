'use strict';

// ---------------------------------------------------------------------------
// Mocks — hoisted by Jest to top of file; declared before any require()
// ---------------------------------------------------------------------------

jest.mock('fs');

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

const fs = require('fs');

const { runShadow } = require('../plugins/pbr/scripts/local-llm/shadow');

// threshold-tuner may not exist yet (sibling plan creates it); guard require
let computeThresholdAdjustments;
try {
  ({ computeThresholdAdjustments } = require('../plugins/pbr/scripts/local-llm/threshold-tuner'));
} catch (_) {
  computeThresholdAdjustments = null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeConfig = (overrides = {}) => ({
  enabled: true,
  model: 'test-model',
  features: { artifact_classification: true, task_validation: true },
  advanced: { shadow_mode: false, disable_after_failures: 3, confidence_threshold: 0.8 },
  ...overrides
});

const PLANNING_DIR = '/fake/.planning';

const makeLine = (op, agrees) => JSON.stringify({ operation: op, agrees }) + '\n';

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// runShadow
// ---------------------------------------------------------------------------

describe('runShadow', () => {
  test('returns frontierResult immediately when config.advanced.shadow_mode = false', () => {
    const frontier = { classification: 'complete' };
    const config = makeConfig({ advanced: { shadow_mode: false, disable_after_failures: 3 } });

    const result = runShadow(config, PLANNING_DIR, 'artifact-classification', jest.fn(), frontier, 'sess-1');

    expect(result).toBe(frontier);
  });

  test('returns frontierResult immediately when config.enabled = false', () => {
    const frontier = 'some-result';
    const config = makeConfig({ enabled: false, advanced: { shadow_mode: true, disable_after_failures: 3 } });

    const result = runShadow(config, PLANNING_DIR, 'artifact-classification', jest.fn(), frontier);

    expect(result).toBe(frontier);
  });

  test('returns frontierResult even when shadow_mode=true (frontier is authoritative)', () => {
    const frontier = { level: 'S2' };
    const config = makeConfig({ advanced: { shadow_mode: true, disable_after_failures: 3 } });
    const localFn = jest.fn().mockResolvedValue({ level: 'S3' });

    const result = runShadow(config, PLANNING_DIR, 'source-scoring', localFn, frontier);

    expect(result).toBe(frontier);
  });

  test('handles string frontierResult and string localResultFn return', async () => {
    const frontier = 'string-frontier';
    const config = makeConfig({ advanced: { shadow_mode: true, disable_after_failures: 3 } });
    const localFn = jest.fn().mockResolvedValue('string-local');

    const result = runShadow(config, PLANNING_DIR, 'artifact-classification', localFn, frontier);
    expect(result).toBe(frontier);

    // Allow async background work to settle
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(localFn).toHaveBeenCalled();
  });

  test('handles object localResultFn return (non-string)', async () => {
    const frontier = { classification: 'x' };
    const config = makeConfig({ advanced: { shadow_mode: true, disable_after_failures: 3 } });
    const localFn = jest.fn().mockResolvedValue({ classification: 'y' });

    const result = runShadow(config, PLANNING_DIR, 'artifact-classification', localFn, frontier);
    expect(result).toBe(frontier);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(localFn).toHaveBeenCalled();
  });

  test('does not throw when localResultFn throws', async () => {
    const frontier = { classification: 'stub' };
    const config = makeConfig({ advanced: { shadow_mode: true, disable_after_failures: 3 } });
    const localFn = jest.fn().mockRejectedValue(new Error('local LLM crashed'));

    // Should not throw synchronously
    expect(() => {
      runShadow(config, PLANNING_DIR, 'artifact-classification', localFn, frontier);
    }).not.toThrow();

    // Allow async background work to settle
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
});

// ---------------------------------------------------------------------------
// computeThresholdAdjustments
// ---------------------------------------------------------------------------

describe('computeThresholdAdjustments', () => {
  const CURRENT_THRESHOLD = 0.8;

  beforeEach(() => {
    // Reset fs mock before each test
    fs.readFileSync.mockReset();
  });

  test('is available (module loaded successfully)', () => {
    expect(typeof computeThresholdAdjustments).toBe('function');
  });

  test('returns [] when shadow log file does not exist', () => {
    fs.existsSync.mockReturnValue(false);
    const result = computeThresholdAdjustments(PLANNING_DIR, CURRENT_THRESHOLD);
    expect(result).toEqual([]);
  });

  test('skips entries with no operation field', () => {
    const lines = Array(25).fill(0).map(() => JSON.stringify({ agrees: true }) + '\n').join('');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(lines);
    const result = computeThresholdAdjustments(PLANNING_DIR, CURRENT_THRESHOLD);
    expect(result).toEqual([]);
  });

  test('skips non-object parsed JSON lines', () => {
    const lines = Array(25).fill(0).map(() => '"just a string"\n').join('');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(lines);
    const result = computeThresholdAdjustments(PLANNING_DIR, CURRENT_THRESHOLD);
    expect(result).toEqual([]);
  });

  test('returns [] when fs.readFileSync throws (no file)', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

    const result = computeThresholdAdjustments(PLANNING_DIR, CURRENT_THRESHOLD);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  test('returns [] when file has < 20 entries for any operation', () => {
    // Only 10 entries — below the 20-sample minimum
    const lines = Array(10).fill(0).map((_, i) => makeLine('artifact-classification', i < 5)).join('');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(lines);

    const result = computeThresholdAdjustments(PLANNING_DIR, CURRENT_THRESHOLD);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  test('returns suggestion with suggested > current when failure rate > 20%', () => {
    // 3 agrees out of 25 = 88% failure rate → should raise threshold
    const lines = Array(25).fill(0).map((_, i) => makeLine('artifact-classification', i < 3)).join('');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(lines);

    const result = computeThresholdAdjustments(PLANNING_DIR, CURRENT_THRESHOLD);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    const suggestion = result.find((r) => r.operation === 'artifact-classification');
    expect(suggestion).toBeDefined();
    expect(suggestion.suggested).toBeGreaterThan(CURRENT_THRESHOLD);
    expect(suggestion.sample_count).toBe(25);
  });

  test('returns suggestion with suggested < current when failure rate < 5%', () => {
    // 24 agrees out of 25 = 4% failure rate → should lower threshold
    const lines = Array(25).fill(0).map((_, i) => makeLine('artifact-classification', i < 24)).join('');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(lines);

    const result = computeThresholdAdjustments(PLANNING_DIR, CURRENT_THRESHOLD);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    const suggestion = result.find((r) => r.operation === 'artifact-classification');
    expect(suggestion).toBeDefined();
    expect(suggestion.suggested).toBeLessThan(CURRENT_THRESHOLD);
  });

  test('returns suggested === current when failure rate is between 5% and 20%', () => {
    // 22 agrees out of 25 = 12% failure rate → in the neutral zone
    const lines = Array(25).fill(0).map((_, i) => makeLine('artifact-classification', i < 22)).join('');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(lines);

    const result = computeThresholdAdjustments(PLANNING_DIR, CURRENT_THRESHOLD);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);

    const suggestion = result.find((r) => r.operation === 'artifact-classification');
    expect(suggestion).toBeDefined();
    expect(suggestion.suggested).toBe(CURRENT_THRESHOLD);
  });
});
