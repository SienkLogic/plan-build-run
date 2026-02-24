'use strict';

// ---------------------------------------------------------------------------
// Mocks — hoisted by Jest to top of file; declared before any require()
// ---------------------------------------------------------------------------

jest.mock('../plugins/pbr/scripts/local-llm/client', () => ({
  complete: jest.fn(),
  tryParseJSON: jest.requireActual('../plugins/pbr/scripts/local-llm/client').tryParseJSON,
  isDisabled: jest.fn().mockReturnValue(false),
  recordFailure: jest.fn(),
  resetCircuit: jest.fn()
}));

jest.mock('../plugins/pbr/scripts/local-llm/metrics', () => ({ logMetric: jest.fn() }));

jest.mock('../plugins/pbr/scripts/local-llm/router', () => ({
  route: jest.fn()
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

const { route } = require('../plugins/pbr/scripts/local-llm/router');
const { classifyArtifact } = require('../plugins/pbr/scripts/local-llm/operations/classify-artifact');
const { validateTask } = require('../plugins/pbr/scripts/local-llm/operations/validate-task');
const { classifyError, ERROR_CATEGORIES } = require('../plugins/pbr/scripts/local-llm/operations/classify-error');
const { scoreSource, SOURCE_LEVELS } = require('../plugins/pbr/scripts/local-llm/operations/score-source');
const { summarizeContext } = require('../plugins/pbr/scripts/local-llm/operations/summarize-context');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeConfig = (overrides = {}) => ({
  enabled: true,
  model: 'test-model',
  features: {
    artifact_classification: true,
    task_validation: true,
    context_summarization: true,
    source_scoring: true
  },
  advanced: { disable_after_failures: 3, max_input_tokens: 1024 },
  metrics: { frontier_token_rate: 3.0 },
  ...overrides
});

const PLANNING_DIR = '/fake/.planning';

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// classifyArtifact
// ---------------------------------------------------------------------------

describe('classifyArtifact', () => {
  test('happy path PLAN: returns classification object', async () => {
    route.mockResolvedValue({
      content: '{"classification":"complete","confidence":0.95,"reason":"ok"}',
      latency_ms: 100,
      tokens: 10,
      logprobsData: null
    });

    const result = await classifyArtifact(makeConfig(), PLANNING_DIR, 'content', 'PLAN', 'sess-1');

    expect(result).not.toBeNull();
    expect(result.classification).toBe('complete');
    expect(result.confidence).toBe(0.95);
    expect(result.reason).toBe('ok');
    expect(result.latency_ms).toBe(100);
    expect(result.fallback_used).toBe(false);
  });

  test('returns null when config.enabled = false', async () => {
    const result = await classifyArtifact(makeConfig({ enabled: false }), PLANNING_DIR, 'content', 'PLAN');

    expect(result).toBeNull();
    expect(route).not.toHaveBeenCalled();
  });

  test('returns null when route returns null (frontier fallback)', async () => {
    route.mockResolvedValue(null);

    const result = await classifyArtifact(makeConfig(), PLANNING_DIR, 'content', 'PLAN');

    expect(result).toBeNull();
  });

  test('returns null for unknown fileType', async () => {
    const result = await classifyArtifact(makeConfig(), PLANNING_DIR, 'content', 'OTHER');

    expect(result).toBeNull();
    expect(route).not.toHaveBeenCalled();
  });

  test('returns null when route throws', async () => {
    route.mockRejectedValue(new Error('LLM down'));
    const result = await classifyArtifact(makeConfig(), PLANNING_DIR, 'content', 'PLAN');
    expect(result).toBeNull();
  });

  test('happy path SUMMARY: returns classification object', async () => {
    route.mockResolvedValue({
      content: '{"classification":"substantive","confidence":0.88,"reason":"has artifacts"}',
      latency_ms: 80,
      tokens: 8,
      logprobsData: null
    });

    const result = await classifyArtifact(makeConfig(), PLANNING_DIR, 'content', 'SUMMARY');

    expect(result).not.toBeNull();
    expect(result.classification).toBe('substantive');
  });
});

// ---------------------------------------------------------------------------
// validateTask
// ---------------------------------------------------------------------------

describe('validateTask', () => {
  test('happy path: returns coherent result with valid=true (coherent field)', async () => {
    route.mockResolvedValue({
      content: '{"coherent":true,"confidence":0.9,"issue":null}',
      latency_ms: 120,
      tokens: 12,
      logprobsData: null
    });

    const result = await validateTask(
      makeConfig(),
      PLANNING_DIR,
      { description: 'Run planner agent', subagent_type: 'pbr:planner' },
      'sess-1'
    );

    expect(result).not.toBeNull();
    expect(result.coherent).toBe(true);
    expect(result.confidence).toBe(0.9);
    expect(result.issue).toBeNull();
    expect(result.fallback_used).toBe(false);
  });

  test('returns null when config.features.task_validation = false', async () => {
    const config = makeConfig({ features: { task_validation: false, artifact_classification: true, context_summarization: true, source_scoring: true } });
    const result = await validateTask(config, PLANNING_DIR, { description: 'foo', subagent_type: 'pbr:planner' });

    expect(result).toBeNull();
    expect(route).not.toHaveBeenCalled();
  });

  test('returns null when parsed JSON has no coherent field', async () => {
    route.mockResolvedValue({
      content: '{"something":"else"}',
      latency_ms: 50,
      tokens: 5,
      logprobsData: null
    });

    const result = await validateTask(makeConfig(), PLANNING_DIR, { description: 'foo', subagent_type: 'pbr:planner' });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// classifyError
// ---------------------------------------------------------------------------

describe('classifyError', () => {
  test('happy path: returns category object', async () => {
    route.mockResolvedValue({
      content: '{"category":"syntax_error","confidence":0.9,"reason":"missing bracket"}',
      latency_ms: 90,
      tokens: 9,
      logprobsData: null
    });

    const result = await classifyError(makeConfig(), PLANNING_DIR, 'SyntaxError: missing }', 'pbr:executor', 'sess-1');

    expect(result).not.toBeNull();
    // 'syntax_error' is not in ERROR_CATEGORIES, so it falls back to 'unknown'
    expect(result.category).toBe('unknown');
    expect(result.confidence).toBe(0.9);
    expect(result.fallback_used).toBe(false);
  });

  test('returns known category when LLM returns valid category', async () => {
    route.mockResolvedValue({
      content: '{"category":"connection_refused","confidence":0.95}',
      latency_ms: 70,
      tokens: 7,
      logprobsData: null
    });

    const result = await classifyError(makeConfig(), PLANNING_DIR, 'ECONNREFUSED', 'pbr:executor');

    expect(result).not.toBeNull();
    expect(result.category).toBe('connection_refused');
  });

  test('returns null when config.enabled = false', async () => {
    const result = await classifyError(makeConfig({ enabled: false }), PLANNING_DIR, 'some error');

    expect(result).toBeNull();
    expect(route).not.toHaveBeenCalled();
  });

  test('returns null when route throws', async () => {
    route.mockRejectedValue(new Error('LLM crash'));
    const result = await classifyError(makeConfig(), PLANNING_DIR, 'some error', 'pbr:executor');
    expect(result).toBeNull();
  });

  test('ERROR_CATEGORIES is a non-empty array', () => {
    expect(Array.isArray(ERROR_CATEGORIES)).toBe(true);
    expect(ERROR_CATEGORIES.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// scoreSource
// ---------------------------------------------------------------------------

describe('scoreSource', () => {
  test('happy path: returns level object', async () => {
    route.mockResolvedValue({
      content: '{"level":"S2","confidence":0.85,"reason":"peer reviewed"}',
      latency_ms: 110,
      tokens: 11,
      logprobsData: null
    });

    const result = await scoreSource(makeConfig(), PLANNING_DIR, 'docs content', 'https://docs.example.com', 'sess-1');

    expect(result).not.toBeNull();
    expect(result.level).toBe('S2');
    expect(result.confidence).toBe(0.85);
    expect(result.reason).toBe('peer reviewed');
    expect(result.fallback_used).toBe(false);
  });

  test('returns null when config.enabled = false', async () => {
    const result = await scoreSource(makeConfig({ enabled: false }), PLANNING_DIR, 'content', 'https://example.com');

    expect(result).toBeNull();
    expect(route).not.toHaveBeenCalled();
  });

  test('SOURCE_LEVELS is a non-empty array containing S0 and S6', () => {
    expect(Array.isArray(SOURCE_LEVELS)).toBe(true);
    expect(SOURCE_LEVELS.length).toBeGreaterThan(0);
    expect(SOURCE_LEVELS).toContain('S0');
    expect(SOURCE_LEVELS).toContain('S6');
  });

  test('returns null when features.source_scoring is false', async () => {
    const config = makeConfig({ features: { source_scoring: false } });
    const result = await scoreSource(config, PLANNING_DIR, 'content', 'https://example.com');
    expect(result).toBeNull();
  });

  test('returns null when isDisabled returns true', async () => {
    const { isDisabled } = require('../plugins/pbr/scripts/local-llm/client');
    isDisabled.mockReturnValueOnce(true);
    const result = await scoreSource(makeConfig(), PLANNING_DIR, 'content', 'https://example.com');
    expect(result).toBeNull();
    isDisabled.mockReturnValue(false); // restore
  });

  test('returns null when route returns null', async () => {
    route.mockResolvedValue(null);
    const result = await scoreSource(makeConfig(), PLANNING_DIR, 'content', 'https://example.com');
    expect(result).toBeNull();
  });

  test('returns null when route throws', async () => {
    route.mockRejectedValue(new Error('network error'));
    const result = await scoreSource(makeConfig(), PLANNING_DIR, 'content', 'https://example.com');
    expect(result).toBeNull();
  });

  test('falls back to S6 when LLM returns unknown level', async () => {
    route.mockResolvedValue({
      content: '{"level":"S99","confidence":0.5,"reason":"unknown"}',
      latency_ms: 60,
      tokens: 6,
      logprobsData: null
    });

    const result = await scoreSource(makeConfig(), PLANNING_DIR, 'content', 'https://example.com');

    expect(result).not.toBeNull();
    expect(result.level).toBe('S6');
  });
});

// ---------------------------------------------------------------------------
// summarizeContext
// ---------------------------------------------------------------------------

describe('summarizeContext', () => {
  test('happy path: returns summary string', async () => {
    route.mockResolvedValue({
      content: 'This project does X.',
      latency_ms: 200,
      tokens: 30,
      logprobsData: null
    });

    const result = await summarizeContext(makeConfig(), PLANNING_DIR, 'long context text here', 150, 'sess-1');

    expect(result).not.toBeNull();
    expect(result.summary).toBe('This project does X.');
    expect(result.latency_ms).toBe(200);
    expect(result.fallback_used).toBe(false);
  });

  test('returns null when config.features.context_summarization = false', async () => {
    const config = makeConfig({ features: { context_summarization: false, artifact_classification: true, task_validation: true, source_scoring: true } });
    const result = await summarizeContext(config, PLANNING_DIR, 'context text');

    expect(result).toBeNull();
    expect(route).not.toHaveBeenCalled();
  });

  test('returns null when config.enabled = false', async () => {
    const result = await summarizeContext(makeConfig({ enabled: false }), PLANNING_DIR, 'context text');

    expect(result).toBeNull();
    expect(route).not.toHaveBeenCalled();
  });

  test('returns null when route returns null', async () => {
    route.mockResolvedValue(null);

    const result = await summarizeContext(makeConfig(), PLANNING_DIR, 'context text');

    expect(result).toBeNull();
  });

  test('returns null when route throws', async () => {
    route.mockRejectedValue(new Error('LLM crash'));
    const result = await summarizeContext(makeConfig(), PLANNING_DIR, 'context text');
    expect(result).toBeNull();
  });
});
