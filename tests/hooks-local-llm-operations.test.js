'use strict';

/**
 * Tests for hooks/local-llm/operations/*.js — the actual hook implementations.
 * These test with mocked client/router/metrics to verify operation logic in isolation.
 */

jest.mock('../hooks/local-llm/client', () => ({
  complete: jest.fn(),
  tryParseJSON: jest.fn(),
  isDisabled: jest.fn(() => false)
}));

jest.mock('../hooks/local-llm/metrics', () => ({
  logMetric: jest.fn()
}));

jest.mock('../hooks/local-llm/router', () => ({
  route: jest.fn()
}));

const { complete, tryParseJSON, isDisabled } = require('../plugins/pbr/scripts/lib/local-llm/client');
const { logMetric } = require('../plugins/pbr/scripts/lib/local-llm/metrics');
const { route } = require('../plugins/pbr/scripts/lib/local-llm/router');

const { classifyArtifact } = require('../plugins/pbr/scripts/lib/local-llm/operations/classify-artifact');
const { classifyCommit, classifyCommitHeuristic } = require('../plugins/pbr/scripts/lib/local-llm/operations/classify-commit');
const { classifyError } = require('../plugins/pbr/scripts/lib/local-llm/operations/classify-error');
const { classifyFileIntent, classifyFileIntentHeuristic } = require('../plugins/pbr/scripts/lib/local-llm/operations/classify-file-intent');
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

// Helper: make route invoke the callLocalFn callback and return its result
function mockRouteWithResult(content, latencyMs, tokens) {
  route.mockImplementation(async (_config, _prompt, _op, callLocalFn) => {
    // callLocalFn is the 4th arg in operations — it wraps complete()
    return { content, latency_ms: latencyMs || 10, tokens: tokens || 50 };
  });
}

describe('classifyArtifact', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns null when config.enabled is false', async () => {
    const cfg = makeConfig({ enabled: false });
    expect(await classifyArtifact(cfg, '/tmp', 'content', 'PLAN')).toBeNull();
  });

  test('returns null when feature artifact_classification is false', async () => {
    const cfg = makeConfig({ features: { artifact_classification: false } });
    expect(await classifyArtifact(cfg, '/tmp', 'content', 'PLAN')).toBeNull();
  });

  test('returns null when circuit is disabled', async () => {
    isDisabled.mockReturnValueOnce(true);
    const cfg = makeConfig();
    expect(await classifyArtifact(cfg, '/tmp', 'content', 'PLAN')).toBeNull();
  });

  test('returns null when route returns null (fallback)', async () => {
    route.mockResolvedValueOnce(null);
    const cfg = makeConfig();
    expect(await classifyArtifact(cfg, '/tmp', 'content', 'PLAN')).toBeNull();
  });

  test('returns classification object for valid PLAN response', async () => {
    mockRouteWithResult('{"classification":"complete","confidence":0.95,"reason":"all tasks filled"}', 15, 60);
    tryParseJSON.mockReturnValueOnce({ ok: true, data: { classification: 'complete', confidence: 0.95, reason: 'all tasks filled' } });
    const cfg = makeConfig();
    const result = await classifyArtifact(cfg, '/tmp', 'content', 'PLAN', 'sess1');
    expect(result).toEqual({
      classification: 'complete',
      confidence: 0.95,
      reason: 'all tasks filled',
      latency_ms: 15,
      fallback_used: false
    });
    expect(logMetric).toHaveBeenCalledTimes(1);
  });

  test('returns classification object for valid SUMMARY response', async () => {
    mockRouteWithResult('{"classification":"substantive","confidence":0.9}', 10, 40);
    tryParseJSON.mockReturnValueOnce({ ok: true, data: { classification: 'substantive', confidence: 0.9 } });
    const cfg = makeConfig();
    const result = await classifyArtifact(cfg, '/tmp', 'content', 'SUMMARY');
    expect(result.classification).toBe('substantive');
  });

  test('returns null for invalid classification value', async () => {
    mockRouteWithResult('{"classification":"bad"}', 10, 40);
    tryParseJSON.mockReturnValueOnce({ ok: true, data: { classification: 'bad', confidence: 0.9 } });
    const cfg = makeConfig();
    expect(await classifyArtifact(cfg, '/tmp', 'content', 'PLAN')).toBeNull();
  });

  test('returns null for unknown fileType', async () => {
    const cfg = makeConfig();
    expect(await classifyArtifact(cfg, '/tmp', 'content', 'UNKNOWN')).toBeNull();
  });

  test('returns null when tryParseJSON fails', async () => {
    mockRouteWithResult('not json', 10, 40);
    tryParseJSON.mockReturnValueOnce({ ok: false });
    const cfg = makeConfig();
    expect(await classifyArtifact(cfg, '/tmp', 'content', 'PLAN')).toBeNull();
  });
});

describe('classifyCommitHeuristic', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns null for non-conventional commit', () => {
    expect(classifyCommitHeuristic('random message')).toBeNull();
  });

  test('returns type_mismatch for fix: add new feature', () => {
    const result = classifyCommitHeuristic('fix: add new feature');
    expect(result).toEqual({ classification: 'type_mismatch', confidence: 0.9 });
  });

  test('returns correct with 1.0 confidence for test commit with test files', () => {
    const result = classifyCommitHeuristic('test(hooks): add tests', ['tests/foo.test.js', 'tests/bar.spec.ts']);
    expect(result).toEqual({ classification: 'correct', confidence: 1.0 });
  });

  test('returns correct with 1.0 confidence for docs commit with .md files', () => {
    const result = classifyCommitHeuristic('docs: update readme', ['README.md', 'docs/guide.md']);
    expect(result).toEqual({ classification: 'correct', confidence: 1.0 });
  });

  test('returns correct with 0.8 confidence for valid conventional commit', () => {
    const result = classifyCommitHeuristic('feat(ui): add button');
    expect(result).toEqual({ classification: 'correct', confidence: 0.8 });
  });
});

describe('classifyCommit', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns null when disabled', async () => {
    const cfg = makeConfig({ enabled: false });
    expect(await classifyCommit(cfg, '/tmp', 'feat: x')).toBeNull();
  });

  test('uses heuristic result when heuristic matches (skips LLM)', async () => {
    const cfg = makeConfig();
    const result = await classifyCommit(cfg, '/tmp', 'test(hooks): add tests', ['tests/foo.test.js']);
    expect(result).toEqual({
      classification: 'correct',
      confidence: 1.0,
      latency_ms: 0,
      fallback_used: false
    });
    expect(route).not.toHaveBeenCalled();
    expect(logMetric).toHaveBeenCalledTimes(1);
  });

  test('falls through to route when heuristic returns null', async () => {
    mockRouteWithResult('{"classification":"correct","confidence":0.85}', 20, 30);
    tryParseJSON.mockReturnValueOnce({ ok: true, data: { classification: 'correct', confidence: 0.85 } });
    const cfg = makeConfig();
    const result = await classifyCommit(cfg, '/tmp', 'random message without type');
    // heuristic returns null for non-conventional, so route is called
    expect(route).toHaveBeenCalledTimes(1);
    expect(result.classification).toBe('correct');
  });

  test('returns null when route returns null', async () => {
    route.mockResolvedValueOnce(null);
    const cfg = makeConfig();
    const result = await classifyCommit(cfg, '/tmp', 'random message');
    expect(result).toBeNull();
  });
});

describe('classifyError', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns null when disabled', async () => {
    const cfg = makeConfig({ enabled: false });
    expect(await classifyError(cfg, '/tmp', 'ECONNREFUSED')).toBeNull();
  });

  test('returns category from valid LLM response', async () => {
    mockRouteWithResult('{"category":"timeout","confidence":0.9}', 10, 30);
    tryParseJSON.mockReturnValueOnce({ ok: true, data: { category: 'timeout', confidence: 0.9 } });
    const cfg = makeConfig();
    const result = await classifyError(cfg, '/tmp', 'operation timed out');
    expect(result.category).toBe('timeout');
    expect(logMetric).toHaveBeenCalledTimes(1);
  });

  test('defaults unknown category to unknown', async () => {
    mockRouteWithResult('{"category":"not_a_real_category","confidence":0.5}', 10, 30);
    tryParseJSON.mockReturnValueOnce({ ok: true, data: { category: 'not_a_real_category', confidence: 0.5 } });
    const cfg = makeConfig();
    const result = await classifyError(cfg, '/tmp', 'some error');
    expect(result.category).toBe('unknown');
  });
});

describe('classifyFileIntentHeuristic', () => {
  beforeEach(() => jest.clearAllMocks());

  test('.test.js file returns test file_type', () => {
    const result = classifyFileIntentHeuristic('src/foo.test.js', '');
    expect(result.file_type).toBe('test');
  });

  test('.json file returns config file_type', () => {
    const result = classifyFileIntentHeuristic('package.json', '');
    expect(result.file_type).toBe('config');
  });

  test('.planning/STATE.md returns state file_type', () => {
    const result = classifyFileIntentHeuristic('.planning/STATE.md', '');
    expect(result.file_type).toBe('state');
  });

  test('.planning/PLAN.md returns plan file_type', () => {
    const result = classifyFileIntentHeuristic('.planning/PLAN.md', '');
    expect(result.file_type).toBe('plan');
  });

  test('.js file returns code file_type', () => {
    const result = classifyFileIntentHeuristic('hooks/my-hook.js', '');
    expect(result.file_type).toBe('code');
  });

  test('unknown file returns null', () => {
    const result = classifyFileIntentHeuristic('something.xyz', '');
    expect(result).toBeNull();
  });
});

describe('classifyFileIntent', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns null when disabled', async () => {
    const cfg = makeConfig({ enabled: false });
    expect(await classifyFileIntent(cfg, '/tmp', 'file.js', 'content')).toBeNull();
  });

  test('uses heuristic when match found', async () => {
    const cfg = makeConfig();
    const result = await classifyFileIntent(cfg, '/tmp', 'tests/foo.test.js', 'describe("x")');
    expect(result.file_type).toBe('test');
    expect(result.latency_ms).toBe(0);
    expect(route).not.toHaveBeenCalled();
  });

  test('falls through to route for ambiguous files', async () => {
    mockRouteWithResult('{"file_type":"docs","intent":"create","confidence":0.8}', 12, 35);
    tryParseJSON.mockReturnValueOnce({ ok: true, data: { file_type: 'docs', intent: 'create', confidence: 0.8 } });
    const cfg = makeConfig();
    const result = await classifyFileIntent(cfg, '/tmp', 'notes.md', 'some notes');
    expect(route).toHaveBeenCalledTimes(1);
    expect(result.file_type).toBe('docs');
  });
});

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

  test('returns level from valid response', async () => {
    mockRouteWithResult('{"level":"S2","confidence":0.9,"reason":"official docs"}', 10, 30);
    tryParseJSON.mockReturnValueOnce({ ok: true, data: { level: 'S2', confidence: 0.9, reason: 'official docs' } });
    const cfg = makeConfig();
    const result = await scoreSource(cfg, '/tmp', 'text', 'http://docs.example.com');
    expect(result.level).toBe('S2');
    expect(logMetric).toHaveBeenCalledTimes(1);
  });

  test('defaults invalid level to S6', async () => {
    mockRouteWithResult('{"level":"INVALID","confidence":0.5}', 10, 30);
    tryParseJSON.mockReturnValueOnce({ ok: true, data: { level: 'INVALID', confidence: 0.5 } });
    const cfg = makeConfig();
    const result = await scoreSource(cfg, '/tmp', 'text', 'http://example.com');
    expect(result.level).toBe('S6');
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
    route.mockImplementation(async () => ({
      content: '  The project is building a CLI tool.  ',
      latency_ms: 20,
      tokens: 80
    }));
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

describe('triageTestOutput', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns null when disabled', async () => {
    const cfg = makeConfig({ enabled: false });
    expect(await triageTestOutput(cfg, '/tmp', 'FAIL test')).toBeNull();
  });

  test('returns null when feature off', async () => {
    const cfg = makeConfig({ features: { test_triage: false } });
    expect(await triageTestOutput(cfg, '/tmp', 'FAIL test')).toBeNull();
  });

  test('returns category from valid response', async () => {
    mockRouteWithResult('{"category":"assertion","file_hint":"test.js:42","confidence":0.85}', 10, 30);
    tryParseJSON.mockReturnValueOnce({ ok: true, data: { category: 'assertion', file_hint: 'test.js:42', confidence: 0.85 } });
    const cfg = makeConfig();
    const result = await triageTestOutput(cfg, '/tmp', 'Expected true got false', 'jest');
    expect(result.category).toBe('assertion');
    expect(result.file_hint).toBe('test.js:42');
    expect(logMetric).toHaveBeenCalledTimes(1);
  });

  test('defaults invalid category to unknown', async () => {
    mockRouteWithResult('{"category":"bogus","confidence":0.5}', 10, 30);
    tryParseJSON.mockReturnValueOnce({ ok: true, data: { category: 'bogus', confidence: 0.5 } });
    const cfg = makeConfig();
    const result = await triageTestOutput(cfg, '/tmp', 'some output');
    expect(result.category).toBe('unknown');
  });
});

describe('validateTask', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns null when disabled', async () => {
    const cfg = makeConfig({ enabled: false });
    expect(await validateTask(cfg, '/tmp', { description: 'test', subagent_type: 'pbr:executor' })).toBeNull();
  });

  test('returns null when feature off', async () => {
    const cfg = makeConfig({ features: { task_validation: false } });
    expect(await validateTask(cfg, '/tmp', { description: 'test', subagent_type: 'pbr:executor' })).toBeNull();
  });

  test('returns coherent/confidence/issue from valid response', async () => {
    mockRouteWithResult('{"coherent":true,"confidence":0.95,"issue":null}', 12, 40);
    tryParseJSON.mockReturnValueOnce({ ok: true, data: { coherent: true, confidence: 0.95, issue: null } });
    const cfg = makeConfig();
    const result = await validateTask(cfg, '/tmp', { description: 'build feature', subagent_type: 'pbr:executor' });
    expect(result).toEqual({
      coherent: true,
      confidence: 0.95,
      issue: null,
      latency_ms: 12,
      fallback_used: false
    });
    expect(logMetric).toHaveBeenCalledTimes(1);
  });

  test('returns null when coherent is not boolean', async () => {
    mockRouteWithResult('{"coherent":"yes","confidence":0.9}', 10, 30);
    tryParseJSON.mockReturnValueOnce({ ok: true, data: { coherent: 'yes', confidence: 0.9 } });
    const cfg = makeConfig();
    expect(await validateTask(cfg, '/tmp', { description: 'test', subagent_type: 'pbr:executor' })).toBeNull();
  });
});
