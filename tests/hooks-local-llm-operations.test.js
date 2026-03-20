'use strict';

/**
 * Tests for plugins/pbr/scripts/lib/local-llm/operations/*.js
 * Most operations are stubs (deferred to v3 ADV-01). Real implementations
 * (scoreSource, summarizeContext) use mocked client/router/metrics.
 */

jest.mock('../plugins/pbr/scripts/lib/local-llm/client', () => ({
  complete: jest.fn(),
  tryParseJSON: jest.fn(),
  isDisabled: jest.fn(() => false)
}));

jest.mock('../plugins/pbr/scripts/lib/local-llm/metrics', () => ({
  logMetric: jest.fn()
}));

jest.mock('../plugins/pbr/scripts/lib/local-llm/router', () => ({
  route: jest.fn()
}));

const { complete, tryParseJSON, isDisabled } = require('../plugins/pbr/scripts/lib/local-llm/client');
const { logMetric } = require('../plugins/pbr/scripts/lib/local-llm/metrics');
const { route } = require('../plugins/pbr/scripts/lib/local-llm/router');

const { classifyArtifact } = require('../plugins/pbr/scripts/lib/local-llm/operations/classify-artifact');
const { classifyCommit } = require('../plugins/pbr/scripts/lib/local-llm/operations/classify-commit');
const { classifyError } = require('../plugins/pbr/scripts/lib/local-llm/operations/classify-error');
const { classifyFileIntent } = require('../plugins/pbr/scripts/lib/local-llm/operations/classify-file-intent');
const { scoreSource } = require('../plugins/pbr/scripts/lib/local-llm/operations/score-source');
const { summarizeContext } = require('../plugins/pbr/scripts/lib/local-llm/operations/summarize-context');
const { triageTestOutput } = require('../plugins/pbr/scripts/lib/local-llm/operations/triage-test-output');
const { validateTask } = require('../plugins/pbr/scripts/lib/local-llm/operations/validate-task');

function makeConfig(overrides = {}) {
  return {
    enabled: true,
    model: 'test-model',
    ...overrides,
    features: {
      artifact_classification: true,
      commit_classification: true,
      file_intent_classification: true,
      source_scoring: true,
      context_summarization: true,
      test_triage: true,
      task_validation: true,
      ...((overrides && overrides.features) || {})
    },
    advanced: {
      disable_after_failures: 5,
      max_input_tokens: 1024,
      confidence_threshold: 0.9,
      ...((overrides && overrides.advanced) || {})
    }
  };
}

// ---- Stub operations (always return fixed values) ----

describe('classifyArtifact (stub)', () => {
  test('always returns classification:unknown regardless of input', async () => {
    const result = await classifyArtifact();
    expect(result).toEqual({ classification: 'unknown', confidence: 0 });
  });

  test('ignores config and arguments', async () => {
    const cfg = makeConfig({ enabled: false });
    const result = await classifyArtifact(cfg, '/tmp', 'content', 'PLAN');
    expect(result).toEqual({ classification: 'unknown', confidence: 0 });
  });
});

describe('classifyCommit (stub)', () => {
  test('always returns type:unknown regardless of input', async () => {
    const result = await classifyCommit();
    expect(result).toEqual({ type: 'unknown', confidence: 0 });
  });

  test('does not export classifyCommitHeuristic', () => {
    const mod = require('../plugins/pbr/scripts/lib/local-llm/operations/classify-commit');
    expect(mod.classifyCommitHeuristic).toBeUndefined();
  });
});

describe('classifyError (stub)', () => {
  test('always returns category:unknown regardless of input', async () => {
    const result = await classifyError();
    expect(result).toEqual({ category: 'unknown', confidence: 0 });
  });
});

describe('classifyFileIntent (stub)', () => {
  test('always returns intent:unknown regardless of input', async () => {
    const result = await classifyFileIntent();
    expect(result).toEqual({ intent: 'unknown', confidence: 0 });
  });

  test('does not export classifyFileIntentHeuristic', () => {
    const mod = require('../plugins/pbr/scripts/lib/local-llm/operations/classify-file-intent');
    expect(mod.classifyFileIntentHeuristic).toBeUndefined();
  });
});

describe('triageTestOutput (stub)', () => {
  test('always returns category:unknown regardless of input', async () => {
    const result = await triageTestOutput();
    expect(result).toEqual({ category: 'unknown', confidence: 0, file_hint: null });
  });

  test('ignores config and arguments', async () => {
    const cfg = makeConfig({ enabled: false });
    const result = await triageTestOutput(cfg, '/tmp', 'FAIL test', 'jest');
    expect(result).toEqual({ category: 'unknown', confidence: 0, file_hint: null });
  });
});

describe('validateTask (stub)', () => {
  test('always returns valid:true with confidence 0', async () => {
    const result = await validateTask();
    expect(result).toEqual({ valid: true, confidence: 0 });
  });

  test('ignores config and arguments', async () => {
    const cfg = makeConfig({ enabled: false });
    const result = await validateTask(cfg, '/tmp', { description: 'test' });
    expect(result).toEqual({ valid: true, confidence: 0 });
  });
});

// ---- Real implementations (scoreSource, summarizeContext) ----

describe('scoreSource', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns null when disabled', async () => {
    const cfg = makeConfig({ enabled: false });
    expect(await scoreSource(cfg, '/tmp', 'text', 'http://example.com')).toBeNull();
  });

  test('returns null when feature off', async () => {
    const cfg = makeConfig({ features: { source_scoring: false } });
    expect(await scoreSource(cfg, '/tmp', 'text', 'http://example.com')).toBeNull();
  });

  test('returns null when circuit is disabled', async () => {
    isDisabled.mockReturnValueOnce(true);
    const cfg = makeConfig();
    expect(await scoreSource(cfg, '/tmp', 'text', 'http://example.com')).toBeNull();
  });

  test('returns level from valid response', async () => {
    route.mockResolvedValueOnce({ content: '{"level":"S2","confidence":0.9,"reason":"official docs"}', latency_ms: 10, tokens: 30 });
    tryParseJSON.mockReturnValueOnce({ ok: true, data: { level: 'S2', confidence: 0.9, reason: 'official docs' } });
    const cfg = makeConfig();
    const result = await scoreSource(cfg, '/tmp', 'text', 'http://docs.example.com');
    expect(result.level).toBe('S2');
    expect(logMetric).toHaveBeenCalledTimes(1);
  });

  test('defaults invalid level to S6', async () => {
    route.mockResolvedValueOnce({ content: '{"level":"INVALID","confidence":0.5}', latency_ms: 10, tokens: 30 });
    tryParseJSON.mockReturnValueOnce({ ok: true, data: { level: 'INVALID', confidence: 0.5 } });
    const cfg = makeConfig();
    const result = await scoreSource(cfg, '/tmp', 'text', 'http://example.com');
    expect(result.level).toBe('S6');
  });

  test('returns null when route returns null', async () => {
    route.mockResolvedValueOnce(null);
    const cfg = makeConfig();
    expect(await scoreSource(cfg, '/tmp', 'text', 'http://example.com')).toBeNull();
  });
});

describe('summarizeContext', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns null when disabled', async () => {
    const cfg = makeConfig({ enabled: false });
    expect(await summarizeContext(cfg, '/tmp', 'context text')).toBeNull();
  });

  test('returns null when feature off', async () => {
    const cfg = makeConfig({ features: { context_summarization: false } });
    expect(await summarizeContext(cfg, '/tmp', 'context text')).toBeNull();
  });

  test('returns summary from valid response', async () => {
    route.mockResolvedValueOnce({
      content: '  The project is building a CLI tool.  ',
      latency_ms: 20,
      tokens: 80
    });
    const cfg = makeConfig();
    const result = await summarizeContext(cfg, '/tmp', 'lots of project context here');
    expect(result).toEqual({
      summary: 'The project is building a CLI tool.',
      latency_ms: 20,
      fallback_used: false
    });
    expect(logMetric).toHaveBeenCalledTimes(1);
  });

  test('returns null when route returns null', async () => {
    route.mockResolvedValueOnce(null);
    const cfg = makeConfig();
    expect(await summarizeContext(cfg, '/tmp', 'text')).toBeNull();
  });
});
