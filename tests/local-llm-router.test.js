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

jest.mock('../plugins/pbr/scripts/local-llm/metrics', () => ({
  logMetric: jest.fn()
}));

// router mock — route() returns null; real scoreComplexity/extractConfidence preserved
jest.mock('../plugins/pbr/scripts/local-llm/router', () => ({
  route: jest.fn().mockResolvedValue(null),
  scoreComplexity: jest.requireActual('../plugins/pbr/scripts/local-llm/router').scoreComplexity,
  extractConfidence: jest.requireActual('../plugins/pbr/scripts/local-llm/router').extractConfidence,
  COMPLEXITY_HIGH_THRESHOLD: 0.65
}));

// ---------------------------------------------------------------------------
// Imports — after mocks so Jest can wire the module graph correctly
// ---------------------------------------------------------------------------

const {
  scoreComplexity,
  extractConfidence,
  COMPLEXITY_HIGH_THRESHOLD
} = require('../plugins/pbr/scripts/local-llm/router');

// Real route() is accessed via requireActual for unit tests
const { route } = jest.requireActual('../plugins/pbr/scripts/local-llm/router');

const { classifyArtifact } = require('../plugins/pbr/scripts/local-llm/operations/classify-artifact');
const { validateTask } = require('../plugins/pbr/scripts/local-llm/operations/validate-task');
const { classifyError, ERROR_CATEGORIES } = require('../plugins/pbr/scripts/local-llm/operations/classify-error');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeConfig = (strategy = 'local_first', threshold = 0.9) => ({
  routing_strategy: strategy,
  advanced: { confidence_threshold: threshold }
});

// ---------------------------------------------------------------------------
// scoreComplexity
// ---------------------------------------------------------------------------
describe('scoreComplexity', () => {
  test('simple short prompt scores < 0.3', () => {
    const score = scoreComplexity('Classify as stub or complete. Respond JSON.');
    expect(score).toBeLessThan(0.3);
  });

  test('long constraint-heavy prompt with code blocks and reasoning words scores > 0.5', () => {
    const complex =
      'You must analyze and evaluate this code carefully. Always explain why each decision ' +
      'was made and compare the alternatives. Never skip any step. Exactly follow the schema.\n' +
      '```json\n{"field": "value"}\n```\n' +
      '```yaml\nkey: value\n```\n' +
      'You should reason through each option. Must output valid JSON with the schema fields. ' +
      'Only include fields that are explicitly listed. Evaluate all trade-offs. ' +
      'Analyze the performance implications and compare against the baseline approach. ' +
      'Respond with a fully structured JSON object containing all required schema fields. ' +
      'This prompt is intentionally long to exceed the word threshold for complexity scoring. ' +
      'More words more words more words more words more words more words more words more words.';
    const score = scoreComplexity(complex);
    expect(score).toBeGreaterThan(0.5);
  });

  test('empty string scores very close to 0 (word count = 1 from split)', () => {
    // ''.split(/\s+/) returns [''] which has length 1 — so score is non-zero but < 0.01
    const score = scoreComplexity('');
    expect(score).toBeLessThan(0.01);
  });

  test('score is always in range [0, 1]', () => {
    const prompts = [
      '',
      'short',
      'Classify as stub or complete.',
      'must should exactly only never always must should exactly only never always'.repeat(10),
      'why explain compare analyze reason evaluate'.repeat(10),
      '```\n```\n```\n```\n```\n```\n```\n'.repeat(5),
      'word '.repeat(600)
    ];
    for (const p of prompts) {
      const score = scoreComplexity(p);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  test('COMPLEXITY_HIGH_THRESHOLD is exported and is 0.65', () => {
    expect(COMPLEXITY_HIGH_THRESHOLD).toBe(0.65);
  });
});

// ---------------------------------------------------------------------------
// extractConfidence
// ---------------------------------------------------------------------------
describe('extractConfidence', () => {
  test('returns null for null input', () => {
    expect(extractConfidence(null)).toBeNull();
  });

  test('returns null for empty array', () => {
    expect(extractConfidence([])).toBeNull();
  });

  test('returns null for undefined input', () => {
    expect(extractConfidence(undefined)).toBeNull();
  });

  test('high logprobs produce confidence > 0.85', () => {
    const highLogprobs = [
      { logprob: Math.log(0.95) },
      { logprob: Math.log(0.95) },
      { logprob: Math.log(0.95) }
    ];
    const confidence = extractConfidence(highLogprobs);
    expect(confidence).toBeGreaterThan(0.85);
  });

  test('low logprobs produce confidence < 0.40', () => {
    const lowLogprobs = [
      { logprob: Math.log(0.30) },
      { logprob: Math.log(0.30) },
      { logprob: Math.log(0.30) }
    ];
    const confidence = extractConfidence(lowLogprobs);
    expect(confidence).toBeLessThan(0.40);
  });

  test('result is always in [0, 1] range', () => {
    const cases = [
      [{ logprob: Math.log(0.99) }],
      [{ logprob: Math.log(0.01) }],
      [{ logprob: Math.log(0.5) }, { logprob: Math.log(0.5) }]
    ];
    for (const logprobs of cases) {
      const confidence = extractConfidence(logprobs);
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// route() strategies — use real route() via requireActual
// ---------------------------------------------------------------------------
describe('route()', () => {
  const simplePrompt = 'Classify as stub or complete. Respond JSON.';
  // This prompt scores < 0.3 (short, no constraints/reasoning/code)

  const complexPrompt =
    'You must analyze and evaluate this code carefully. Always explain why. ' +
    'Never skip. Exactly follow schema. must should only. ' +
    '```json\n{}\n```\n```yaml\nkey: val\n```\n' +
    'word '.repeat(400);
  // Score well above 0.65 (COMPLEXITY_HIGH_THRESHOLD)

  const highConfidenceMock = jest.fn().mockResolvedValue({
    content: '{"classification":"complete","confidence":0.95,"reason":"all fields present"}',
    latency_ms: 100,
    tokens: 20,
    logprobsData: [{ logprob: Math.log(0.95) }, { logprob: Math.log(0.92) }]
  });

  const lowConfidenceMock = jest.fn().mockResolvedValue({
    content: '{"classification":"partial","confidence":0.3,"reason":"uncertain"}',
    latency_ms: 150,
    tokens: 15,
    logprobsData: [{ logprob: Math.log(0.3) }, { logprob: Math.log(0.25) }]
  });

  beforeEach(() => {
    highConfidenceMock.mockClear();
    lowConfidenceMock.mockClear();
  });

  // local_first strategy
  test('local_first + simple prompt + high confidence → returns result (not null)', async () => {
    const result = await route(makeConfig('local_first', 0.9), simplePrompt, 'test', highConfidenceMock);
    expect(result).not.toBeNull();
    expect(result.content).toContain('complete');
    expect(highConfidenceMock).toHaveBeenCalledTimes(1);
  });

  test('local_first + complex prompt (score > 0.65) → returns null without calling callLocalFn', async () => {
    const result = await route(makeConfig('local_first', 0.9), complexPrompt, 'test', highConfidenceMock);
    expect(result).toBeNull();
    expect(highConfidenceMock).not.toHaveBeenCalled();
  });

  test('local_first + simple prompt + low confidence → returns null (callLocalFn was called)', async () => {
    const result = await route(makeConfig('local_first', 0.9), simplePrompt, 'test', lowConfidenceMock);
    expect(result).toBeNull();
    expect(lowConfidenceMock).toHaveBeenCalledTimes(1);
  });

  // balanced strategy — score threshold 0.45, confidence threshold hardcoded 0.75
  test('balanced + moderate prompt (score > 0.45) → returns null (exceeds balanced score threshold)', async () => {
    const moderatePrompt =
      'You must analyze this. Always check. Never skip. Exactly respond with JSON. ' +
      'word '.repeat(200);
    const score = scoreComplexity(moderatePrompt);
    expect(score).toBeGreaterThan(0.45); // confirm it triggers balanced null path
    const result = await route(makeConfig('balanced', 0.9), moderatePrompt, 'test', highConfidenceMock);
    expect(result).toBeNull();
  });

  test('balanced + simple prompt + high confidence → returns result', async () => {
    const result = await route(makeConfig('balanced', 0.9), simplePrompt, 'test', highConfidenceMock);
    expect(result).not.toBeNull();
    expect(highConfidenceMock).toHaveBeenCalledTimes(1);
  });

  test('balanced + simple prompt + low confidence (< 0.75) → returns null', async () => {
    const result = await route(makeConfig('balanced', 0.9), simplePrompt, 'test', lowConfidenceMock);
    expect(result).toBeNull();
    expect(lowConfidenceMock).toHaveBeenCalledTimes(1);
  });

  // quality_first strategy — score threshold 0.3
  test('quality_first + very simple prompt (score < 0.3) → returns result', async () => {
    const verySimple = 'yes or no?';
    const score = scoreComplexity(verySimple);
    expect(score).toBeLessThan(0.3);
    const result = await route(makeConfig('quality_first', 0.9), verySimple, 'test', highConfidenceMock);
    expect(result).not.toBeNull();
  });

  test('quality_first + moderate prompt (score >= 0.3) → returns null without calling callLocalFn', async () => {
    const moderatePrompt =
      'Classify this json schema output and must respond JSON exactly as shown. ' +
      'word '.repeat(200);
    const score = scoreComplexity(moderatePrompt);
    expect(score).toBeGreaterThanOrEqual(0.3);
    const result = await route(makeConfig('quality_first', 0.9), moderatePrompt, 'test', highConfidenceMock);
    expect(result).toBeNull();
    expect(highConfidenceMock).not.toHaveBeenCalled();
  });

  // Error handling
  test('callLocalFn throws → route() returns null (no exception propagates)', async () => {
    const throwingMock = jest.fn().mockRejectedValue(new Error('Connection refused'));
    const result = await route(makeConfig('local_first', 0.9), simplePrompt, 'test', throwingMock);
    expect(result).toBeNull();
    expect(throwingMock).toHaveBeenCalledTimes(1);
  });

  // Default behavior
  test('missing routing_strategy defaults to local_first behavior', async () => {
    const config = { advanced: { confidence_threshold: 0.9 } }; // no routing_strategy
    // simple prompt + high confidence should succeed under local_first defaults
    const result = await route(config, simplePrompt, 'test', highConfidenceMock);
    expect(result).not.toBeNull();
  });

  test('missing confidence_threshold defaults to 0.9 — low confidence returns null', async () => {
    const config = { routing_strategy: 'local_first' }; // no advanced.confidence_threshold
    const result = await route(config, simplePrompt, 'test', lowConfidenceMock);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Operations router wiring — uses the mocked route() from jest.mock() above
// ---------------------------------------------------------------------------
describe('Operations router wiring', () => {
  const enabledConfig = {
    enabled: true,
    model: 'qwen2.5-coder:7b',
    features: {
      artifact_classification: true,
      task_validation: true
    },
    advanced: {
      disable_after_failures: 3,
      max_input_tokens: 1024
    }
  };

  const disabledConfig = {
    enabled: false,
    features: { artifact_classification: true, task_validation: true },
    advanced: { disable_after_failures: 3 }
  };

  beforeEach(() => jest.clearAllMocks());

  // --- router returns null (mocked) ---

  test('classifyArtifact returns null when router returns null', async () => {
    const result = await classifyArtifact(enabledConfig, '/tmp', 'plan content', 'PLAN');
    expect(result).toBeNull();
  });

  test('validateTask returns null when router returns null', async () => {
    const result = await validateTask(enabledConfig, '/tmp', {
      description: 'test task',
      subagent_type: 'pbr:executor'
    });
    expect(result).toBeNull();
  });

  test('classifyError returns null when router returns null', async () => {
    const result = await classifyError(enabledConfig, '/tmp', 'ECONNREFUSED error');
    expect(result).toBeNull();
  });

  // --- local LLM disabled (config.enabled = false) ---

  test('classifyArtifact returns null when local LLM disabled', async () => {
    const { route: mockRoute } = require('../plugins/pbr/scripts/local-llm/router');
    const result = await classifyArtifact(disabledConfig, '/tmp', 'plan content', 'PLAN');
    expect(result).toBeNull();
    expect(mockRoute).not.toHaveBeenCalled();
  });

  test('validateTask returns null when local LLM disabled', async () => {
    const { route: mockRoute } = require('../plugins/pbr/scripts/local-llm/router');
    const result = await validateTask(disabledConfig, '/tmp', {
      description: 'test',
      subagent_type: 'pbr:executor'
    });
    expect(result).toBeNull();
    expect(mockRoute).not.toHaveBeenCalled();
  });

  test('classifyError returns null when local LLM disabled', async () => {
    const { route: mockRoute } = require('../plugins/pbr/scripts/local-llm/router');
    const result = await classifyError(disabledConfig, '/tmp', 'ECONNREFUSED error');
    expect(result).toBeNull();
    expect(mockRoute).not.toHaveBeenCalled();
  });

  // --- ERROR_CATEGORIES export ---

  test('ERROR_CATEGORIES is an array of length 6', () => {
    expect(Array.isArray(ERROR_CATEGORIES)).toBe(true);
    expect(ERROR_CATEGORIES).toHaveLength(6);
  });

  test('ERROR_CATEGORIES contains all expected categories', () => {
    expect(ERROR_CATEGORIES).toContain('connection_refused');
    expect(ERROR_CATEGORIES).toContain('timeout');
    expect(ERROR_CATEGORIES).toContain('missing_output');
    expect(ERROR_CATEGORIES).toContain('wrong_output_format');
    expect(ERROR_CATEGORIES).toContain('permission_error');
    expect(ERROR_CATEGORIES).toContain('unknown');
  });
});
